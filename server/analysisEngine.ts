import crypto from 'node:crypto';
import { CandlePoint, Timeframe } from '../src/types/trading';
import { analyzeStrategyBrain, StrategyBrainAnalysis } from '../src/utils/strategyBrain';
import {
  ALL_TIMEFRAMES,
  computeMt5ConnectionStatus,
  fetchAllTimeframesOhlc,
  fetchRealOhlc,
  getInstrumentDefinition,
  getMt5ConnectionState,
  getMt5DataSourcesPayload,
  getMt5LiveTick,
  RealOhlcResult,
  resolveExactBrokerSymbol,
} from './marketDataService';
import {
  EnsembleStrategyRecord,
  LocalMemoryDatabase,
  PersistentOrderRecord,
  PersistentRiskSettings,
  pushNotification,
  StrategyEvaluationResult,
  UnifiedAnalysisRecord,
  UnifiedRiskEvaluation,
} from './localMemory';

export interface LlmEvaluationOutput {
  status: 'ACTIVE' | 'UNCONFIGURED' | 'ERROR';
  provider: string | null;
  summaryUz: string | null;
  error: string | null;
}

export type LlmEvaluatorFn = (analysis: UnifiedAnalysisRecord) => Promise<LlmEvaluationOutput>;

function roundPrice(val: number, referencePrice: number): number {
  const decimals = referencePrice >= 100 ? 2 : referencePrice >= 10 ? 3 : 5;
  return Number(val.toFixed(decimals));
}

function getCorrelationGroup(symbol: string): string {
  const s = symbol.toUpperCase();
  if (s === 'BTCUSD' || s === 'ETHUSD' || s === 'SOLUSD') return 'CRYPTO_BETA';
  if (s === 'XAUUSD' || s === 'XAGUSD') return 'PRECIOUS_METALS';
  if (s === 'EURUSD' || s === 'GBPUSD') return 'USD_ANTI_MAJOR';
  if (s === 'USDJPY') return 'USD_JPY';
  if (s === 'US100') return 'US_EQUITY';
  if (s === 'USOIL') return 'ENERGY';
  return s;
}

export function calculateOrderFloatingPnl(order: PersistentOrderRecord, markPrice?: number): number {
  if (order.status === 'CLOSED') return order.realizedPnl ?? 0;
  if (order.status === 'PENDING') return 0;
  const price = markPrice && markPrice > 0 ? markPrice : order.markPrice;
  if (order.entryPrice <= 0) return 0;
  const diff =
    order.side === 'LONG'
      ? (price - order.entryPrice) / order.entryPrice
      : (order.entryPrice - price) / order.entryPrice;
  return Number((order.sizeUsdt * diff).toFixed(2));
}

export function computeAccountSummary(db: LocalMemoryDatabase) {
  const mt5State = getMt5ConnectionState();
  if (mt5State.connected && mt5State.account) {
    const acct = mt5State.account;
    const mt5Open = mt5State.positions;
    const mt5Pending = mt5State.pendingOrders;
    const totalExposureUsd = Number(
      mt5Open.reduce((sum, p) => sum + (Number(p.sizeUsdt) || 0), 0).toFixed(2)
    );
    const marginUsagePct =
      acct.equity > 0 ? Number(((acct.margin / acct.equity) * 100).toFixed(2)) : 0;
    const openRiskUsd = mt5Open.reduce((sum, p) => {
      if (p.stopLoss && p.entryPrice > 0) {
        const dist = Math.abs(p.entryPrice - p.stopLoss) / p.entryPrice;
        return sum + p.sizeUsdt * dist;
      }
      return sum + p.sizeUsdt * 0.01;
    }, 0);
    const portfolioRiskPct =
      acct.equity > 0 ? Number(((openRiskUsd / acct.equity) * 100).toFixed(2)) : 0;
    const dailyPnlUsd = Number((acct.realizedToday + acct.profit).toFixed(2));
    const peakEquity = Math.max(acct.balance, acct.equity);
    const currentDrawdownPct =
      peakEquity > 0 ? Number((Math.max(0, (peakEquity - acct.equity) / peakEquity) * 100).toFixed(2)) : 0;

    return {
      baseBalance: acct.balance,
      balance: acct.balance,
      equity: acct.equity,
      marginUsed: acct.margin,
      marginFree: acct.marginFree,
      marginLevel: acct.marginLevel,
      marginUsagePct,
      totalExposureUsd,
      floatingPnl: acct.profit,
      realizedPnl: acct.realizedToday,
      realizedTodayPnl: acct.realizedToday,
      dailyPnlUsd,
      dailyPnl: dailyPnlUsd,
      portfolioRiskPct,
      currentDrawdownPct,
      openCount: mt5Open.length,
      pendingCount: mt5Pending.length,
      closedCount: mt5State.closedDeals.length,
      source: 'MT5_BROKER' as const,
    };
  }

  const baseBalance = db.riskSettings.testAccountBalanceUsd;
  let realizedPnl = 0;
  let floatingPnl = 0;
  let usedMarginUsd = 0;
  let totalExposureUsd = 0;
  let openRiskUsd = 0;
  let openCount = 0;
  let pendingCount = 0;
  let closedCount = 0;

  for (const ord of db.orders) {
    if (ord.status === 'CLOSED') {
      closedCount++;
      realizedPnl += ord.realizedPnl ?? 0;
      continue;
    }
    if (ord.status === 'PENDING') {
      pendingCount++;
      continue;
    }
    openCount++;
    const liveTick = getMt5LiveTick(ord.symbol);
    const liveAnalysis = db.unifiedAnalyses[ord.symbol];
    const currentMark =
      liveTick?.bid && liveTick.bid > 0
        ? liveTick.bid
        : liveAnalysis?.latestPrice && liveAnalysis.latestPrice > 0
          ? liveAnalysis.latestPrice
          : ord.markPrice;
    const pnl = calculateOrderFloatingPnl(ord, currentMark);
    ord.markPrice = roundPrice(currentMark, currentMark);
    ord.highestPrice = Math.max(ord.highestPrice ?? ord.entryPrice, currentMark);
    ord.lowestPrice = Math.min(ord.lowestPrice ?? ord.entryPrice, currentMark);
    const favPrice = ord.side === 'LONG' ? ord.highestPrice : ord.lowestPrice;
    const advPrice = ord.side === 'LONG' ? ord.lowestPrice : ord.highestPrice;
    ord.mfeUsd = Math.max(ord.mfeUsd ?? 0, Math.max(0, calculateOrderFloatingPnl(ord, favPrice)));
    ord.maeUsd = Math.min(ord.maeUsd ?? 0, Math.min(0, calculateOrderFloatingPnl(ord, advPrice)));
    floatingPnl += pnl;
    usedMarginUsd += ord.sizeUsdt / Math.max(1, ord.leverage);
    totalExposureUsd += ord.sizeUsdt;
    openRiskUsd += ord.riskUsd > 0 ? ord.riskUsd : ord.sizeUsdt * 0.01;
  }

  const balance = Number((baseBalance + realizedPnl).toFixed(2));
  const equity = Number((balance + floatingPnl).toFixed(2));
  const marginFree = Number(Math.max(0, equity - usedMarginUsd).toFixed(2));
  const marginUsagePct = equity > 0 ? Number(((usedMarginUsd / equity) * 100).toFixed(2)) : 0;
  const portfolioRiskPct = equity > 0 ? Number(((openRiskUsd / equity) * 100).toFixed(2)) : 0;
  const dailyPnlUsd = Number((realizedPnl + floatingPnl).toFixed(2));
  const peakEquity = Math.max(baseBalance, balance, equity);
  const currentDrawdownPct =
    peakEquity > 0 ? Number((Math.max(0, (peakEquity - equity) / peakEquity) * 100).toFixed(2)) : 0;

  return {
    baseBalance,
    balance,
    equity,
    marginUsed: Number(usedMarginUsd.toFixed(2)),
    marginFree,
    marginLevel: usedMarginUsd > 0 ? Number(((equity / usedMarginUsd) * 100).toFixed(2)) : 0,
    marginUsagePct,
    totalExposureUsd: Number(totalExposureUsd.toFixed(2)),
    floatingPnl: Number(floatingPnl.toFixed(2)),
    realizedPnl: Number(realizedPnl.toFixed(2)),
    realizedTodayPnl: Number(realizedPnl.toFixed(2)),
    dailyPnlUsd,
    dailyPnl: dailyPnlUsd,
    portfolioRiskPct,
    currentDrawdownPct,
    openCount,
    pendingCount,
    closedCount,
    source: 'MT5_DISCONNECTED' as const,
  };
}

/**
 * Evaluates all 8 Risk Engine dimensions:
 * Risk/trade, Portfolio Risk, Max Drawdown, Daily Loss, Margin, Exposure, Correlation, Lot Sizing.
 */
export function evaluateUnifiedRisk(params: {
  db: LocalMemoryDatabase;
  symbol: string;
  entryPrice: number;
  stopLoss: number;
  atrPct: number;
  spreadPoints: number;
  requestedLot?: number;
  leverage?: number;
}): UnifiedRiskEvaluation {
  const { db, symbol, entryPrice, stopLoss, atrPct, spreadPoints } = params;
  const settings: PersistentRiskSettings = db.riskSettings;
  const acct = computeAccountSummary(db);
  const equity = Math.max(100, acct.equity);
  const leverage = params.leverage ?? 100;

  const slDistFrac =
    entryPrice > 0 && stopLoss > 0 ? Math.max(0.0005, Math.abs(entryPrice - stopLoss) / entryPrice) : 0.01;
  const riskPerTradePct = settings.riskPerTradePct;
  const targetRiskUsd = equity * (riskPerTradePct / 100);
  const recommendedNotional = targetRiskUsd / slDistFrac;
  const recommendedLot = Math.max(
    0.01,
    Math.min(10, Number((recommendedNotional / 10000).toFixed(2)))
  );

  const effectiveLot = params.requestedLot && params.requestedLot > 0 ? params.requestedLot : recommendedLot;
  const tradeNotional = Math.max(100, effectiveLot * 10000);
  const actualTradeRiskUsd = Number((tradeNotional * slDistFrac).toFixed(2));
  const actualTradeRiskPct = Number(((actualTradeRiskUsd / equity) * 100).toFixed(2));
  const projectedPortfolioRiskPct = Number((acct.portfolioRiskPct + actualTradeRiskPct).toFixed(2));
  const marginRequiredUsd = Number((tradeNotional / Math.max(1, leverage)).toFixed(2));
  const projectedMarginUsagePct = Number((((acct.marginUsed + marginRequiredUsd) / equity) * 100).toFixed(2));

  const corrGroup = getCorrelationGroup(symbol);
  const openOrders = db.orders.filter((o) => o.status === 'OPEN');
  const correlatedOpenCount = openOrders.filter((o) => getCorrelationGroup(o.symbol) === corrGroup).length;

  const dailyLossUsd = Math.max(0, Number((-acct.dailyPnlUsd).toFixed(2)));
  const blockReasons: string[] = [];

  const mt5State = getMt5ConnectionState();
  if (!mt5State.connected) {
    blockReasons.push('MetaTrader 5 Bridge ulanmagan (DISCONNECTED) — yangi order ochish bloklandi.');
  } else {
    const tick = getMt5LiveTick(symbol);
    const freshness = computeMt5ConnectionStatus({
      connected: mt5State.connected,
      tickTimeMs: tick?.tickTimeMs ?? null,
      hasPrice: Boolean(tick && (tick.bid || tick.last)),
    });
    if (freshness.status === 'STALE' || freshness.status === 'DATA UNAVAILABLE') {
      blockReasons.push(
        `MT5 tick ma’lumoti yaroqsiz (${freshness.status}${freshness.ageSec !== null ? `, ${freshness.ageSec}s` : ''}) — yangi order bloklandi.`
      );
    }
  }

  if (db.control.stopNewTrades) {
    blockReasons.push('STOP NEW TRADES favqulodda blokirovkasi faol.');
  }
  if (openOrders.length >= settings.maxOpenPositions) {
    blockReasons.push(`Ochiq pozitsiyalar limiti to‘lgan (${openOrders.length}/${settings.maxOpenPositions}).`);
  }
  if (actualTradeRiskPct > Math.max(settings.riskPerTradePct * 1.5, settings.riskPerTradePct + 0.5)) {
    blockReasons.push(`Bitta savdo riski juda yuqori (${actualTradeRiskPct}% > ${settings.riskPerTradePct}%).`);
  }
  if (projectedPortfolioRiskPct > settings.maxPortfolioRiskPct) {
    blockReasons.push(
      `Portfolio risk limiti oshadi (${projectedPortfolioRiskPct}% > ${settings.maxPortfolioRiskPct}%).`
    );
  }
  if (acct.currentDrawdownPct >= settings.maxDrawdownPct) {
    blockReasons.push(`Max Drawdown limitiga yetildi (${acct.currentDrawdownPct}% >= ${settings.maxDrawdownPct}%).`);
  }
  if (dailyLossUsd >= settings.dailyMaxLossUsd) {
    blockReasons.push(`Kunlik zarar limitiga yetildi ($${dailyLossUsd} >= $${settings.dailyMaxLossUsd}).`);
  }
  if (marginRequiredUsd > acct.marginFree || projectedMarginUsagePct > settings.maxMarginUsagePct) {
    blockReasons.push(
      `Marja limiti yetarli emas (talab: $${marginRequiredUsd}, erkin: $${acct.marginFree}, yuklama: ${projectedMarginUsagePct}% > ${settings.maxMarginUsagePct}%).`
    );
  }
  if (correlatedOpenCount >= settings.maxCorrelatedExposure) {
    blockReasons.push(
      `Korrelyatsiya exposure limiti (${corrGroup}: ${correlatedOpenCount}/${settings.maxCorrelatedExposure}).`
    );
  }
  if (spreadPoints > settings.maxSpreadPoints) {
    blockReasons.push(`Spread juda keng (${spreadPoints} > ${settings.maxSpreadPoints} pt).`);
  }
  if (atrPct > settings.maxVolatilityAtrPct) {
    blockReasons.push(`Volatillik ATR haddan tashqari yuqori (${atrPct.toFixed(2)}% > ${settings.maxVolatilityAtrPct}%).`);
  }

  return {
    allowed: blockReasons.length === 0,
    riskPerTradePct: actualTradeRiskPct,
    riskPerTradeUsd: actualTradeRiskUsd,
    portfolioRiskPct: projectedPortfolioRiskPct,
    maxPortfolioRiskPct: settings.maxPortfolioRiskPct,
    maxDrawdownPct: settings.maxDrawdownPct,
    currentDrawdownPct: acct.currentDrawdownPct,
    dailyLossUsd,
    dailyMaxLossUsd: settings.dailyMaxLossUsd,
    marginRequiredUsd,
    marginFreeUsd: acct.marginFree,
    marginUsagePct: projectedMarginUsagePct,
    totalExposureUsd: Number((acct.totalExposureUsd + tradeNotional).toFixed(2)),
    correlatedOpenCount,
    maxCorrelatedExposure: settings.maxCorrelatedExposure,
    recommendedLot,
    blockReasons,
  };
}

/**
 * Evaluates ALL 18 independent strategies directly on real OHLCV candles and computed technical/SMC/pattern metrics.
 */
function evaluateAll18Strategies(
  candles: CandlePoint[],
  brain: StrategyBrainAnalysis,
  registry: EnsembleStrategyRecord[],
  marketRegime: string
): StrategyEvaluationResult[] {
  const snap = brain.snapshot;
  const tech = snap.technicals!;
  const smc = snap.smcDeep!;
  const candleRep = snap.candlestickReport!;
  const chartRep = snap.chartPatternReport!;
  const last = candles[candles.length - 1];
  const prev = candles[candles.length - 2] ?? last;
  const price = last.close;

  // Support / Resistance from recent 40-bar swings
  const window40 = candles.slice(-40);
  const resistance = Math.max(...window40.map((c) => c.high));
  const support = Math.min(...window40.map((c) => c.low));
  const range40 = Math.max(1e-9, resistance - support);
  const posInRange = (price - support) / range40;

  // Price Action recent swing highs/lows (last 12 vs prior 12)
  const recent12 = candles.slice(-12);
  const prior12 = candles.slice(-24, -12);
  const recentHigh = Math.max(...recent12.map((c) => c.high));
  const recentLow = Math.min(...recent12.map((c) => c.low));
  const priorHigh = prior12.length > 0 ? Math.max(...prior12.map((c) => c.high)) : recentHigh;
  const priorLow = prior12.length > 0 ? Math.min(...prior12.map((c) => c.low)) : recentLow;

  const evalMap: Record<string, { signal: 'BUY' | 'SELL' | 'WAIT'; confidence: number; evidenceUz: string }> = {
    'ema-trend': (() => {
      const { ema9, ema20, ema50, ema100, ema200 } = tech.trend;
      if (price > ema20 && ema9 > ema20 && ema20 > ema50 && ema50 >= ema200) {
        return { signal: 'BUY', confidence: 82, evidenceUz: `Buqa EMA lentasi: Narx > EMA20(${roundPrice(ema20, price)}) > EMA50 > EMA200` };
      }
      if (price < ema20 && ema9 < ema20 && ema20 < ema50 && ema50 <= ema200) {
        return { signal: 'SELL', confidence: 82, evidenceUz: `Ayiq EMA lentasi: Narx < EMA20(${roundPrice(ema20, price)}) < EMA50 < EMA200` };
      }
      if (price > ema20 && ema20 > ema50) {
        return { signal: 'BUY', confidence: 64, evidenceUz: `Qisqa muddatli buqa EMA: Narx > EMA20 > EMA50 (EMA100=${roundPrice(ema100, price)})` };
      }
      if (price < ema20 && ema20 < ema50) {
        return { signal: 'SELL', confidence: 64, evidenceUz: `Qisqa muddatli ayiq EMA: Narx < EMA20 < EMA50 (EMA100=${roundPrice(ema100, price)})` };
      }
      return { signal: 'WAIT', confidence: 40, evidenceUz: `EMA 20/50/200 aralash — aniq trend yo‘q` };
    })(),

    rsi: (() => {
      const rsi = tech.momentum.rsi14;
      const div = snap.rsiDivergence.latestType;
      if (div === 'BULL' || rsi <= 33) {
        return { signal: 'BUY', confidence: div === 'BULL' ? 80 : 70, evidenceUz: `RSI(14)=${rsi.toFixed(1)} · ${div === 'BULL' ? 'Bullish Divergensiya' : 'Oversold zona'}` };
      }
      if (div === 'BEAR' || rsi >= 67) {
        return { signal: 'SELL', confidence: div === 'BEAR' ? 80 : 70, evidenceUz: `RSI(14)=${rsi.toFixed(1)} · ${div === 'BEAR' ? 'Bearish Divergensiya' : 'Overbought zona'}` };
      }
      if (rsi >= 55 && rsi < 67) {
        return { signal: 'BUY', confidence: 58, evidenceUz: `RSI(14)=${rsi.toFixed(1)} buqa momentum zonasida` };
      }
      if (rsi <= 45 && rsi > 33) {
        return { signal: 'SELL', confidence: 58, evidenceUz: `RSI(14)=${rsi.toFixed(1)} ayiq momentum zonasida` };
      }
      return { signal: 'WAIT', confidence: 45, evidenceUz: `RSI(14)=${rsi.toFixed(1)} neytral (45–55)` };
    })(),

    macd: (() => {
      const { macdLine, macdSignal, macdHist } = tech.momentum;
      if (macdLine > macdSignal && macdHist > 0) {
        return { signal: 'BUY', confidence: macdLine > 0 ? 74 : 62, evidenceUz: `MACD > Signal, Hist=+${macdHist.toFixed(4)} (Buqa kesishma)` };
      }
      if (macdLine < macdSignal && macdHist < 0) {
        return { signal: 'SELL', confidence: macdLine < 0 ? 74 : 62, evidenceUz: `MACD < Signal, Hist=${macdHist.toFixed(4)} (Ayiq kesishma)` };
      }
      return { signal: 'WAIT', confidence: 40, evidenceUz: `MACD chiziqlari muvozanatda` };
    })(),

    adx: (() => {
      const { adx14, plusDi, minusDi } = tech.trend;
      if (adx14 >= 20 && plusDi > minusDi + 2) {
        return { signal: 'BUY', confidence: Math.min(85, Math.round(55 + adx14 * 0.7)), evidenceUz: `ADX=${adx14.toFixed(1)} kuchli trend, +DI(${plusDi.toFixed(1)}) > -DI(${minusDi.toFixed(1)})` };
      }
      if (adx14 >= 20 && minusDi > plusDi + 2) {
        return { signal: 'SELL', confidence: Math.min(85, Math.round(55 + adx14 * 0.7)), evidenceUz: `ADX=${adx14.toFixed(1)} kuchli trend, -DI(${minusDi.toFixed(1)}) > +DI(${plusDi.toFixed(1)})` };
      }
      return { signal: 'WAIT', confidence: 38, evidenceUz: `ADX=${adx14.toFixed(1)} < 20 (kuchsiz trend / flet)` };
    })(),

    'bollinger-bands': (() => {
      const { bbUpper, bbMiddle, bbLower, bbWidthPct } = tech.volatility;
      if (price <= bbLower * 1.001 && last.close >= last.open) {
        return { signal: 'BUY', confidence: 72, evidenceUz: `Narx pastki BB(${roundPrice(bbLower, price)}) dan qaytdi (kenglik ${bbWidthPct.toFixed(2)}%)` };
      }
      if (price >= bbUpper * 0.999 && last.close <= last.open) {
        return { signal: 'SELL', confidence: 72, evidenceUz: `Narx yuqori BB(${roundPrice(bbUpper, price)}) dan qaytdi (kenglik ${bbWidthPct.toFixed(2)}%)` };
      }
      if (tech.momentum.ttmSqueezeOn && price > bbMiddle && tech.momentum.ttmMomentum > 0) {
        return { signal: 'BUY', confidence: 68, evidenceUz: `BB/Keltner Squeeze yuqoriga ochilmoqda (narx > BB o‘rta)` };
      }
      if (tech.momentum.ttmSqueezeOn && price < bbMiddle && tech.momentum.ttmMomentum < 0) {
        return { signal: 'SELL', confidence: 68, evidenceUz: `BB/Keltner Squeeze pastga ochilmoqda (narx < BB o‘rta)` };
      }
      return { signal: 'WAIT', confidence: 42, evidenceUz: `Narx BB kanali ichida (${roundPrice(bbLower, price)}–${roundPrice(bbUpper, price)})` };
    })(),

    vwap: (() => {
      const { vwap, vwapUpper201, vwapLower201 } = tech.volatility;
      if (price <= vwapLower201) {
        return { signal: 'BUY', confidence: 75, evidenceUz: `Narx VWAP -2.01σ (${roundPrice(vwapLower201, price)}) arzon zonasida` };
      }
      if (price >= vwapUpper201) {
        return { signal: 'SELL', confidence: 75, evidenceUz: `Narx VWAP +2.01σ (${roundPrice(vwapUpper201, price)}) qimmat zonasida` };
      }
      if (price > vwap && prev.close <= vwap) {
        return { signal: 'BUY', confidence: 66, evidenceUz: `Narx VWAP(${roundPrice(vwap, price)}) ni yuqoriga yordi` };
      }
      if (price < vwap && prev.close >= vwap) {
        return { signal: 'SELL', confidence: 66, evidenceUz: `Narx VWAP(${roundPrice(vwap, price)}) ni pastga yordi` };
      }
      return { signal: 'WAIT', confidence: 44, evidenceUz: `Narx VWAP(${roundPrice(vwap, price)}) atrofida muvozanatda` };
    })(),

    'price-action': (() => {
      if (recentHigh > priorHigh && recentLow > priorLow && price > last.open) {
        return { signal: 'BUY', confidence: 76, evidenceUz: `Higher High + Higher Low buqa struktura (${roundPrice(recentHigh, price)})` };
      }
      if (recentHigh < priorHigh && recentLow < priorLow && price < last.open) {
        return { signal: 'SELL', confidence: 76, evidenceUz: `Lower High + Lower Low ayiq struktura (${roundPrice(recentLow, price)})` };
      }
      if (snap.leviathan.signal === 'BUY') {
        return { signal: 'BUY', confidence: 70, evidenceUz: `Leviathan Price Action BUY (${snap.leviathan.pattern})` };
      }
      if (snap.leviathan.signal === 'SELL') {
        return { signal: 'SELL', confidence: 70, evidenceUz: `Leviathan Price Action SELL (${snap.leviathan.pattern})` };
      }
      return { signal: 'WAIT', confidence: 42, evidenceUz: `Aniq HH/HL yoki LH/LL impuls yo‘q` };
    })(),

    candlestick: (() => {
      const confirmed = candleRep.latestConfirmedPattern ?? candleRep.latestActivePattern;
      if (confirmed && confirmed.bias === 'BULLISH' && confirmed.strength >= 55) {
        return { signal: 'BUY', confidence: Math.min(86, Math.round(confirmed.strength)), evidenceUz: `${confirmed.patternName} (${confirmed.confirmationStatus}, ${confirmed.strength} ball)` };
      }
      if (confirmed && confirmed.bias === 'BEARISH' && confirmed.strength >= 55) {
        return { signal: 'SELL', confidence: Math.min(86, Math.round(confirmed.strength)), evidenceUz: `${confirmed.patternName} (${confirmed.confirmationStatus}, ${confirmed.strength} ball)` };
      }
      return { signal: 'WAIT', confidence: 40, evidenceUz: confirmed ? `${confirmed.patternName} kuchsiz/neytral` : `Tasdiqlangan sham patterni topilmadi` };
    })(),

    fibonacci: (() => {
      const fib = tech.fibonacci;
      const near618 = Math.abs(price - fib.fib618) / Math.max(1e-9, price) <= 0.0045;
      const near500 = Math.abs(price - fib.fib500) / Math.max(1e-9, price) <= 0.0045;
      if ((near618 || near500) && fib.direction === 'UP' && last.close >= last.open) {
        return { signal: 'BUY', confidence: 72, evidenceUz: `Buqa Fib OTE/0.618 (${roundPrice(fib.fib618, price)}) qo‘llab-quvvatlashidan qaytish` };
      }
      if ((near618 || near500) && fib.direction === 'DOWN' && last.close <= last.open) {
        return { signal: 'SELL', confidence: 72, evidenceUz: `Ayiq Fib OTE/0.618 (${roundPrice(fib.fib618, price)}) qarshiligidan qaytish` };
      }
      return { signal: 'WAIT', confidence: 40, evidenceUz: `Fib zona: ${fib.currentZone} (0.618=${roundPrice(fib.fib618, price)})` };
    })(),

    breakout: (() => {
      const pat = chartRep.patterns.find((p) => p.status === 'BREAKOUT_TASDIQLANDI');
      if (pat && pat.bias === 'BULLISH') {
        return { signal: 'BUY', confidence: 80, evidenceUz: `${pat.name} yuqoriga breakout tasdiqlandi` };
      }
      if (pat && pat.bias === 'BEARISH') {
        return { signal: 'SELL', confidence: 80, evidenceUz: `${pat.name} pastga breakout tasdiqlandi` };
      }
      const prev20High = Math.max(...candles.slice(-21, -1).map((c) => c.high));
      const prev20Low = Math.min(...candles.slice(-21, -1).map((c) => c.low));
      if (price > prev20High) {
        return { signal: 'BUY', confidence: 74, evidenceUz: `20-barlik maksimum (${roundPrice(prev20High, price)}) yorildi` };
      }
      if (price < prev20Low) {
        return { signal: 'SELL', confidence: 74, evidenceUz: `20-barlik minimum (${roundPrice(prev20Low, price)}) yorildi` };
      }
      return { signal: 'WAIT', confidence: 40, evidenceUz: `20-barlik diapazon ichida — breakout kutilmoqda` };
    })(),

    'support-resistance': (() => {
      if (posInRange <= 0.16 && last.close >= last.open) {
        return { signal: 'BUY', confidence: 73, evidenceUz: `Kuchli Support (${roundPrice(support, price)}) yaqinidan buqa reaksiya` };
      }
      if (posInRange >= 0.84 && last.close <= last.open) {
        return { signal: 'SELL', confidence: 73, evidenceUz: `Kuchli Resistance (${roundPrice(resistance, price)}) yaqinidan ayiq reaksiya` };
      }
      return { signal: 'WAIT', confidence: 42, evidenceUz: `S/R oralig‘i: ${roundPrice(support, price)}–${roundPrice(resistance, price)} (${Math.round(posInRange * 100)}%)` };
    })(),

    ict: (() => {
      if (smc.zone === 'Discount' && smc.structureState === 'BULLISH_STRUCTURE') {
        return { signal: 'BUY', confidence: 80, evidenceUz: `ICT Discount (${smc.zonePct}%) + Bullish struktura` };
      }
      if (smc.zone === 'Premium' && smc.structureState === 'BEARISH_STRUCTURE') {
        return { signal: 'SELL', confidence: 80, evidenceUz: `ICT Premium (${smc.zonePct}%) + Bearish struktura` };
      }
      return { signal: 'WAIT', confidence: 45, evidenceUz: `ICT Zona: ${smc.zone} (${smc.zonePct}%), struktura: ${smc.structureState}` };
    })(),

    smc: (() => {
      if (smc.structureState === 'BULLISH_STRUCTURE' && smc.zone !== 'Premium') {
        return { signal: 'BUY', confidence: 79, evidenceUz: `SMC Bullish (${smc.lastBosOrChoch}), OB=${smc.activeBullObCount}, FVG=${smc.activeFvgCount}` };
      }
      if (smc.structureState === 'BEARISH_STRUCTURE' && smc.zone !== 'Discount') {
        return { signal: 'SELL', confidence: 79, evidenceUz: `SMC Bearish (${smc.lastBosOrChoch}), OB=${smc.activeBearObCount}, FVG=${smc.activeFvgCount}` };
      }
      return { signal: 'WAIT', confidence: 46, evidenceUz: `SMC muvozanat / Premium-Discount filtri kutilmoqda (${smc.zone})` };
    })(),

    'liquidity-sweep': (() => {
      if (smc.recentSweep === 'SSL_SWEEP' || snap.azadoneTools.sweepSignal === 'BUY_SWEEP') {
        return { signal: 'BUY', confidence: 82, evidenceUz: `SSL likvidlik tozalandi (Stop-Hunt BUY)` };
      }
      if (smc.recentSweep === 'BSL_SWEEP' || snap.azadoneTools.sweepSignal === 'SELL_SWEEP') {
        return { signal: 'SELL', confidence: 82, evidenceUz: `BSL likvidlik tozalandi (Stop-Hunt SELL)` };
      }
      return { signal: 'WAIT', confidence: 38, evidenceUz: `Yangi BSL/SSL liquidity sweep aniqlanmadi` };
    })(),

    'bos-choch': (() => {
      const latestEv = brain.smcEvents[brain.smcEvents.length - 1];
      if (smc.mssDetected === 'BULLISH_MSS' || (latestEv && latestEv.bias === 1)) {
        return { signal: 'BUY', confidence: smc.mssDetected === 'BULLISH_MSS' ? 84 : 74, evidenceUz: `${smc.lastBosOrChoch} (${smc.mssDetected !== 'YO‘Q' ? smc.mssDetected : 'Bullish break'})` };
      }
      if (smc.mssDetected === 'BEARISH_MSS' || (latestEv && latestEv.bias === -1)) {
        return { signal: 'SELL', confidence: smc.mssDetected === 'BEARISH_MSS' ? 84 : 74, evidenceUz: `${smc.lastBosOrChoch} (${smc.mssDetected !== 'YO‘Q' ? smc.mssDetected : 'Bearish break'})` };
      }
      return { signal: 'WAIT', confidence: 40, evidenceUz: `Yangi BOS / CHoCH / MSS yo‘q` };
    })(),

    fvg: (() => {
      const latestFvg = brain.activeFvgs[brain.activeFvgs.length - 1];
      if (latestFvg && latestFvg.bias === 1 && price >= latestFvg.bottom * 0.996) {
        return { signal: 'BUY', confidence: 71, evidenceUz: `Faol Bullish FVG (${roundPrice(latestFvg.bottom, price)}–${roundPrice(latestFvg.top, price)})` };
      }
      if (latestFvg && latestFvg.bias === -1 && price <= latestFvg.top * 1.004) {
        return { signal: 'SELL', confidence: 71, evidenceUz: `Faol Bearish FVG (${roundPrice(latestFvg.bottom, price)}–${roundPrice(latestFvg.top, price)})` };
      }
      return { signal: 'WAIT', confidence: 38, evidenceUz: `Faol FVG soni: ${brain.activeFvgs.length} (narx FVG zonasida emas)` };
    })(),

    'order-block': (() => {
      const nearBullOb = brain.activeOrderBlocks.find(
        (ob) => ob.bias === 1 && price >= ob.bottom * 0.994 && price <= ob.top * 1.008
      );
      const nearBearOb = brain.activeOrderBlocks.find(
        (ob) => ob.bias === -1 && price <= ob.top * 1.006 && price >= ob.bottom * 0.992
      );
      if (nearBullOb) {
        return { signal: 'BUY', confidence: 78, evidenceUz: `Narx Bullish Order Block (${roundPrice(nearBullOb.bottom, price)}–${roundPrice(nearBullOb.top, price)}) ichida` };
      }
      if (nearBearOb) {
        return { signal: 'SELL', confidence: 78, evidenceUz: `Narx Bearish Order Block (${roundPrice(nearBearOb.bottom, price)}–${roundPrice(nearBearOb.top, price)}) ichida` };
      }
      return { signal: 'WAIT', confidence: 40, evidenceUz: `Faol OB: ${smc.activeBullObCount} Bull / ${smc.activeBearObCount} Bear (narx OB ga yetmagan)` };
    })(),

    'volume-analysis': (() => {
      const { volumeRatio, obvTrend } = tech.volume;
      if (volumeRatio >= 1.15 && obvTrend === 'OSHISH' && last.close > last.open) {
        return { signal: 'BUY', confidence: 74, evidenceUz: `Hajm o‘sishi (${volumeRatio.toFixed(2)}x) + OBV OSHISH` };
      }
      if (volumeRatio >= 1.15 && obvTrend === 'PASAYISH' && last.close < last.open) {
        return { signal: 'SELL', confidence: 74, evidenceUz: `Hajm o‘sishi (${volumeRatio.toFixed(2)}x) + OBV PASAYISH` };
      }
      if (obvTrend === 'OSHISH' && last.close > prev.close) {
        return { signal: 'BUY', confidence: 58, evidenceUz: `OBV OSHISH (hajm nisbati ${volumeRatio.toFixed(2)}x)` };
      }
      if (obvTrend === 'PASAYISH' && last.close < prev.close) {
        return { signal: 'SELL', confidence: 58, evidenceUz: `OBV PASAYISH (hajm nisbati ${volumeRatio.toFixed(2)}x)` };
      }
      return { signal: 'WAIT', confidence: 42, evidenceUz: `Hajm neytral (${volumeRatio.toFixed(2)}x, OBV=${obvTrend})` };
    })(),
  };

  return registry.map((strat) => {
    const res = evalMap[strat.id] ?? { signal: 'WAIT' as const, confidence: 40, evidenceUz: 'Baholanmadi' };
    const regimeMatched = strat.regimes.includes(marketRegime);
    const effectiveWeight = Number((strat.weight * (regimeMatched ? 1.25 : 0.85)).toFixed(2));
    return {
      strategyId: strat.id,
      strategyName: strat.name,
      category: strat.category,
      family: strat.family,
      enabled: strat.enabled,
      approved: strat.approved,
      regimeMatched,
      weight: strat.weight,
      effectiveWeight,
      signal: res.signal,
      confidence: res.confidence,
      evidenceUz: res.evidenceUz,
    };
  });
}

function summarizeMtfFromRealCandles(symbol: string, mtfResults: Record<Timeframe, RealOhlcResult>) {
  const entries: UnifiedAnalysisRecord['mtfSummary']['entries'] = [];
  const availableTimeframes: string[] = [];

  for (const tf of ALL_TIMEFRAMES) {
    const res = mtfResults[tf];
    if (!res || !res.ok || res.candles.length < 25) continue;
    availableTimeframes.push(tf);
    const tfBrain = analyzeStrategyBrain(res.candles, symbol, tf);
    const tech = tfBrain.snapshot.technicals;
    if (!tech) continue;
    const close = res.candles[res.candles.length - 1].close;
    let bias: 'BULLISH' | 'BEARISH' | 'NEUTRAL' = 'NEUTRAL';
    if (close > tech.trend.ema20 && tech.trend.ema20 >= tech.trend.ema50 && tech.momentum.rsi14 >= 48) {
      bias = 'BULLISH';
    } else if (close < tech.trend.ema20 && tech.trend.ema20 <= tech.trend.ema50 && tech.momentum.rsi14 <= 52) {
      bias = 'BEARISH';
    }
    entries.push({
      timeframe: tf,
      bias,
      rsi14: Number(tech.momentum.rsi14.toFixed(1)),
      adx14: Number(tech.trend.adx14.toFixed(1)),
      close,
      source: res.source,
    });
  }

  const biasFor = (tfs: string[]): 'BULLISH' | 'BEARISH' | 'NEUTRAL' => {
    const sub = entries.filter((e) => tfs.includes(e.timeframe));
    const bulls = sub.filter((e) => e.bias === 'BULLISH').length;
    const bears = sub.filter((e) => e.bias === 'BEARISH').length;
    if (bulls > bears) return 'BULLISH';
    if (bears > bulls) return 'BEARISH';
    return 'NEUTRAL';
  };

  const macroBias = biasFor(['W1', 'D1', 'H4']);
  const setupBias = biasFor(['H1', 'M30']);
  const entryBias = biasFor(['M15', 'M5', 'M1']);

  const nonNeutral = entries.filter((e) => e.bias !== 'NEUTRAL');
  const bullCount = nonNeutral.filter((e) => e.bias === 'BULLISH').length;
  const bearCount = nonNeutral.filter((e) => e.bias === 'BEARISH').length;
  const dominant = Math.max(bullCount, bearCount);
  const alignmentPct =
    entries.length > 0 ? Math.round((dominant / entries.length) * 100) : 0;
  const conflictDetected =
    (macroBias === 'BULLISH' && entryBias === 'BEARISH') ||
    (macroBias === 'BEARISH' && entryBias === 'BULLISH');

  return {
    timeframesChecked: ALL_TIMEFRAMES,
    availableTimeframes,
    macroBias,
    setupBias,
    entryBias,
    alignmentPct,
    conflictDetected,
    entries,
  };
}

/**
 * Runs the complete REAL backend analysis pipeline for one instrument:
 * 1) Fetches real OHLC (and M1–W1 MTF when requested); HALTS with DATA_UNAVAILABLE if real OHLC missing!
 * 2) Runs Technical Indicators, Candlestick, Chart Patterns, ICT/SMC, and Market Regime engines.
 * 3) Runs all 18 independent strategies & aggregates Ensemble with contradiction + duplicate-family + regime weighting.
 * 4) Runs 8-dimension Risk Engine (Risk/trade, Portfolio risk, DD, Daily loss, Margin, Exposure, Correlation, Lot size).
 * 5) Optionally runs LLM reasoning (never guessing indicators, never masking errors).
 * 6) Saves full analysis to persistent DB (`unifiedAnalyses` + `analyses` history + `signals` + `scannerStates`).
 */
export async function runRealInstrumentAnalysis(params: {
  db: LocalMemoryDatabase;
  symbol: string;
  timeframe: Timeframe;
  fullMtf?: boolean;
  forceRefresh?: boolean;
  llmEvaluator?: LlmEvaluatorFn;
}): Promise<UnifiedAnalysisRecord> {
  const { db, timeframe, fullMtf = true, forceRefresh = false, llmEvaluator } = params;
  const symbol = resolveExactBrokerSymbol(params.symbol);
  const nowIso = new Date().toISOString();
  const analysisId = `anl-${symbol}-${timeframe}-${Date.now()}-${crypto.randomBytes(2).toString('hex')}`;
  const def = getInstrumentDefinition(symbol);
  const mt5State = getMt5ConnectionState();

  // Mark scanner state as ANALYZING while running
  db.scannerStates[symbol] = {
    symbol,
    timeframe,
    status: 'ANALYZING',
    dataSource: db.scannerStates[symbol]?.dataSource ?? 'MT5 BROKER',
    freshnessSec: db.scannerStates[symbol]?.freshnessSec ?? null,
    lastCandleTimeIso: db.scannerStates[symbol]?.lastCandleTimeIso ?? null,
    newCandleDetected: false,
    lastScannedAt: nowIso,
    analysisId: db.scannerStates[symbol]?.analysisId ?? null,
    decision: db.scannerStates[symbol]?.decision ?? 'WAIT',
    confidence: db.scannerStates[symbol]?.confidence ?? 0,
    error: null,
  };

  let mtfResults: Record<Timeframe, RealOhlcResult>;
  if (!mt5State.connected) {
    const dis = await fetchRealOhlc(symbol, timeframe, { forceRefresh: false });
    mtfResults = { [timeframe]: dis } as Record<Timeframe, RealOhlcResult>;
  } else if (fullMtf) {
    mtfResults = await fetchAllTimeframesOhlc(symbol, { forceRefresh });
  } else {
    const primary = await fetchRealOhlc(symbol, timeframe, { forceRefresh });
    const h1 = timeframe === 'H1' ? primary : await fetchRealOhlc(symbol, 'H1', { forceRefresh: false });
    const d1 = timeframe === 'D1' ? primary : await fetchRealOhlc(symbol, 'D1', { forceRefresh: false });
    mtfResults = { [timeframe]: primary, H1: h1, D1: d1 } as Record<Timeframe, RealOhlcResult>;
  }

  const primaryOhlc = mtfResults[timeframe];
  const isStaleOrDisconnected =
    !mt5State.connected ||
    !primaryOhlc ||
    primaryOhlc.connectionStatus === 'DISCONNECTED' ||
    primaryOhlc.connectionStatus === 'STALE' ||
    primaryOhlc.connectionStatus === 'DATA UNAVAILABLE';

  // STRICT MT5 REAL-DATA & FRESHNESS GATE: Stop analysis if MT5 is disconnected, stale, or missing OHLC!
  if (isStaleOrDisconnected || !primaryOhlc.ok || primaryOhlc.candles.length < 25 || !primaryOhlc.latestPrice) {
    const unavailable: UnifiedAnalysisRecord = {
      analysisId,
      symbol,
      timeframe,
      timestamp: nowIso,
      status: 'DATA_UNAVAILABLE',
      dataSource: primaryOhlc?.source ?? (mt5State.connected ? 'DATA_UNAVAILABLE' : 'MT5_DISCONNECTED'),
      dataFreshnessSec: primaryOhlc?.freshnessSec ?? null,
      barsCount: primaryOhlc?.barsCount ?? 0,
      latestPrice: null,
      change24hPct: null,
      high24h: null,
      low24h: null,
      volume24h: null,
      marketRegime: 'DATA_UNAVAILABLE',
      marketRegimeUz: 'Haqiqiy OHLC ma’lumoti mavjud emas',
      marketStructure: 'DATA UNAVAILABLE',
      candlestickSummary: 'DATA UNAVAILABLE',
      smcSummary: 'DATA UNAVAILABLE',
      mtfSummary: {
        timeframesChecked: ALL_TIMEFRAMES,
        availableTimeframes: [],
        macroBias: 'NEUTRAL',
        setupBias: 'NEUTRAL',
        entryBias: 'NEUTRAL',
        alignmentPct: 0,
        conflictDetected: false,
        entries: [],
      },
      indicators: null,
      strategyResults: [],
      ensemble: {
        activeStrategiesCount: db.ensembleStrategies.filter((s) => s.enabled && s.approved).length,
        totalStrategiesCount: db.ensembleStrategies.length,
        buyVotes: 0,
        sellVotes: 0,
        waitVotes: 0,
        weightedBuyScore: 0,
        weightedSellScore: 0,
        contradictionDetected: false,
        duplicateFamilyDiscountApplied: false,
        strategyConfirmation: 'DATA UNAVAILABLE',
      },
      entry: null,
      stopLoss: null,
      takeProfit: null,
      riskRewardRatio: null,
      confidence: 0,
      decision: 'DATA_UNAVAILABLE',
      explanationUz: primaryOhlc?.error || 'Haqiqiy OHLC shamlari olinmagani sababli tahlil to‘xtatildi (DATA UNAVAILABLE).',
      risk: null,
      llmStatus: 'SKIPPED',
      llmProvider: db.llmHealth.provider,
      llmSummaryUz: null,
      llmError: null,
      error: primaryOhlc?.error || 'DATA_UNAVAILABLE',
    };

    db.unifiedAnalyses[symbol] = unavailable;
    db.scannerStates[symbol] = {
      symbol,
      timeframe,
      status: 'DATA UNAVAILABLE',
      dataSource: 'DATA_UNAVAILABLE',
      freshnessSec: null,
      lastCandleTimeIso: null,
      newCandleDetected: false,
      lastScannedAt: nowIso,
      analysisId,
      decision: 'DATA_UNAVAILABLE',
      confidence: 0,
      error: unavailable.error,
    };
    return unavailable;
  }

  const candles = primaryOhlc.candles;
  const price = primaryOhlc.latestPrice;
  const brain = analyzeStrategyBrain(candles, symbol, timeframe);
  const snap = brain.snapshot;
  const tech = snap.technicals!;
  const smc = snap.smcDeep!;
  const candleRep = snap.candlestickReport!;
  const regime = snap.regime!;
  const mtfSummary = summarizeMtfFromRealCandles(symbol, mtfResults);

  // Evaluate all 18 real strategies
  const strategyResults = evaluateAll18Strategies(candles, brain, db.ensembleStrategies, regime.regime);

  // Update persistent strategy statistics (real counters only!)
  for (const sr of strategyResults) {
    const rec = db.ensembleStrategies.find((item) => item.id === sr.strategyId);
    if (rec) {
      rec.lastSignal = sr.signal;
      rec.lastConfidence = sr.confidence;
      rec.lastReasonUz = sr.evidenceUz;
      rec.lastEvaluatedAt = nowIso;
      rec.totalEvaluations += 1;
      if (sr.signal !== 'WAIT') rec.signalsProduced += 1;
    }
  }

  // Ensemble aggregation with active filter, regime weights, duplicate-family discount, and contradiction check
  const activeResults = strategyResults.filter((s) => s.enabled && s.approved);
  const buyResults = activeResults.filter((s) => s.signal === 'BUY');
  const sellResults = activeResults.filter((s) => s.signal === 'SELL');
  const waitResults = activeResults.filter((s) => s.signal === 'WAIT');

  let duplicateFamilyDiscountApplied = false;
  const computeDirectionalWeight = (items: StrategyEvaluationResult[]) => {
    const familySeen = new Map<string, number>();
    let total = 0;
    for (const item of items) {
      const seen = familySeen.get(item.family) ?? 0;
      const dupFactor = seen === 0 ? 1.0 : 0.72;
      if (seen > 0) duplicateFamilyDiscountApplied = true;
      familySeen.set(item.family, seen + 1);
      total += item.effectiveWeight * (item.confidence / 100) * dupFactor;
    }
    return Number(total.toFixed(2));
  };

  const weightedBuyScore = computeDirectionalWeight(buyResults);
  const weightedSellScore = computeDirectionalWeight(sellResults);
  const totalWeighted = weightedBuyScore + weightedSellScore;
  const contradictionDetected =
    buyResults.length >= 2 &&
    sellResults.length >= 2 &&
    Math.min(weightedBuyScore, weightedSellScore) / Math.max(0.01, Math.max(weightedBuyScore, weightedSellScore)) >= 0.6;

  // Determine raw directional bias from ensemble + MTF
  let rawDir: 'BUY' | 'SELL' | 'WAIT' = 'WAIT';
  if (activeResults.length === 0) {
    rawDir = 'WAIT';
  } else if (!contradictionDetected) {
    const margin = Math.abs(weightedBuyScore - weightedSellScore);
    if (weightedBuyScore > weightedSellScore && buyResults.length >= 3 && margin >= 1.1) {
      rawDir = 'BUY';
    } else if (weightedSellScore > weightedBuyScore && sellResults.length >= 3 && margin >= 1.1) {
      rawDir = 'SELL';
    }
  }

  // Compute ATR-based structural Entry / SL / TP
  const atr = Math.max(price * 0.0015, tech.volatility.atr14);
  const slMult = timeframe === 'M1' || timeframe === 'M5' ? 1.35 : timeframe === 'M15' || timeframe === 'M30' ? 1.6 : 2.0;
  const tpMult = slMult * 2.15;

  const directionForLevels = rawDir === 'SELL' ? 'SELL' : 'BUY';
  const entry = roundPrice(price, price);
  const stopLoss = roundPrice(
    directionForLevels === 'BUY' ? price - atr * slMult : price + atr * slMult,
    price
  );
  const takeProfit = roundPrice(
    directionForLevels === 'BUY' ? price + atr * tpMult : price - atr * tpMult,
    price
  );
  const riskRewardRatio = Number((Math.abs(takeProfit - entry) / Math.max(1e-9, Math.abs(entry - stopLoss))).toFixed(2));

  // Run 8-dimension Risk Engine
  const risk = evaluateUnifiedRisk({
    db,
    symbol,
    entryPrice: entry,
    stopLoss,
    atrPct: tech.volatility.atrPct,
    spreadPoints: def?.typicalSpreadPoints ?? 15,
  });

  // Final decision + calibrated confidence
  let decision: 'BUY' | 'SELL' | 'WAIT' = rawDir;
  const dominantVotes = Math.max(buyResults.length, sellResults.length);
  const voteAgreementPct =
    activeResults.length > 0 ? (dominantVotes / activeResults.length) * 100 : 0;
  const dominanceRatio =
    totalWeighted > 0 ? Math.max(weightedBuyScore, weightedSellScore) / totalWeighted : 0.5;
  let confidence = Math.round(
    Math.min(
      95,
      Math.max(
        20,
        voteAgreementPct * 0.45 +
          dominanceRatio * 35 +
          mtfSummary.alignmentPct * 0.25 -
          (contradictionDetected ? 18 : 0) -
          (mtfSummary.conflictDetected ? 10 : 0)
      )
    )
  );

  if (decision !== 'WAIT' && mtfSummary.conflictDetected && confidence < 68) {
    decision = 'WAIT';
  }
  if (decision !== 'WAIT' && !risk.allowed) {
    decision = 'WAIT';
  }

  const confirmingNames = (decision === 'BUY' ? buyResults : decision === 'SELL' ? sellResults : buyResults.length >= sellResults.length ? buyResults : sellResults)
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, 4)
    .map((s) => s.strategyName.split(' (')[0]);

  const strategyConfirmation =
    decision === 'BUY'
      ? `${buyResults.length}/${activeResults.length} BUY (${confirmingNames.join(', ')})`
      : decision === 'SELL'
        ? `${sellResults.length}/${activeResults.length} SELL (${confirmingNames.join(', ')})`
        : `${buyResults.length} BUY · ${sellResults.length} SELL · ${waitResults.length} WAIT (${activeResults.length} faol)`;

  const explanationParts: string[] = [];
  explanationParts.push(
    `${symbol} (${timeframe}) real ${primaryOhlc.source} (${primaryOhlc.barsCount} sham) asosida tahlil qilindi.`
  );
  explanationParts.push(`Bozor rejimi: ${regime.labelUz}. MTF moslik: ${mtfSummary.alignmentPct}% (Makro: ${mtfSummary.macroBias}, Setup: ${mtfSummary.setupBias}, Kirish: ${mtfSummary.entryBias}).`);
  explanationParts.push(`Ensemble: ${buyResults.length} BUY vs ${sellResults.length} SELL (${activeResults.length} faol strategiya, ball ${weightedBuyScore} vs ${weightedSellScore}).`);
  if (contradictionDetected) {
    explanationParts.push('Strategiyalar o‘rtasida qarama-qarshilik aniqlandi — WAIT tanlandi.');
  } else if (!risk.allowed && rawDir !== 'WAIT') {
    explanationParts.push(`Risk Engine cheklovi: ${risk.blockReasons[0]}`);
  } else if (decision !== 'WAIT') {
    explanationParts.push(`Yakuniy qaror: ${decision} @ ${entry}, SL ${stopLoss}, TP ${takeProfit} (R:R 1:${riskRewardRatio}, lot ${risk.recommendedLot}).`);
  }

  const latestCandlePattern =
    candleRep.latestConfirmedPattern?.patternName ??
    candleRep.latestActivePattern?.patternName ??
    'Aniq sham patterni yo‘q';

  const record: UnifiedAnalysisRecord = {
    analysisId,
    symbol,
    timeframe,
    timestamp: nowIso,
    status: 'OK',
    dataSource: primaryOhlc.source,
    dataFreshnessSec: primaryOhlc.freshnessSec,
    barsCount: primaryOhlc.barsCount,
    latestPrice: price,
    change24hPct: primaryOhlc.change24hPct,
    high24h: primaryOhlc.high24h,
    low24h: primaryOhlc.low24h,
    volume24h: primaryOhlc.volume24h,
    marketRegime: regime.regime,
    marketRegimeUz: regime.labelUz,
    marketStructure: `${smc.structureState} · ${smc.lastBosOrChoch}`,
    candlestickSummary: `${latestCandlePattern} (${candleRep.summaryUz})`,
    smcSummary: `${smc.zone} (${Number(smc.zonePct).toFixed(1)}%) · Sweep: ${smc.recentSweep} · OB: ${smc.activeBullObCount}B/${smc.activeBearObCount}S · FVG: ${smc.activeFvgCount}`,
    mtfSummary,
    indicators: {
      ema9: roundPrice(tech.trend.ema9, price),
      ema20: roundPrice(tech.trend.ema20, price),
      ema50: roundPrice(tech.trend.ema50, price),
      ema100: roundPrice(tech.trend.ema100, price),
      ema200: roundPrice(tech.trend.ema200, price),
      rsi14: Number(tech.momentum.rsi14.toFixed(1)),
      macdLine: Number(tech.momentum.macdLine.toFixed(5)),
      macdSignal: Number(tech.momentum.macdSignal.toFixed(5)),
      macdHist: Number(tech.momentum.macdHist.toFixed(5)),
      adx14: Number(tech.trend.adx14.toFixed(1)),
      plusDi: Number(tech.trend.plusDi.toFixed(1)),
      minusDi: Number(tech.trend.minusDi.toFixed(1)),
      atr14: roundPrice(tech.volatility.atr14, price),
      atrPct: Number(tech.volatility.atrPct.toFixed(2)),
      bbUpper: roundPrice(tech.volatility.bbUpper, price),
      bbMiddle: roundPrice(tech.volatility.bbMiddle, price),
      bbLower: roundPrice(tech.volatility.bbLower, price),
      vwap: roundPrice(tech.volatility.vwap, price),
      volumeRatio: Number(tech.volume.volumeRatio.toFixed(2)),
      obvTrend: tech.volume.obvTrend,
      fibZone: tech.fibonacci.currentZone,
    },
    strategyResults,
    ensemble: {
      activeStrategiesCount: activeResults.length,
      totalStrategiesCount: strategyResults.length,
      buyVotes: buyResults.length,
      sellVotes: sellResults.length,
      waitVotes: waitResults.length,
      weightedBuyScore,
      weightedSellScore,
      contradictionDetected,
      duplicateFamilyDiscountApplied,
      strategyConfirmation,
    },
    entry,
    stopLoss,
    takeProfit,
    riskRewardRatio,
    confidence,
    decision,
    explanationUz: explanationParts.join(' '),
    risk,
    llmStatus: 'SKIPPED',
    llmProvider: db.llmHealth.provider,
    llmSummaryUz: null,
    llmError: null,
    error: null,
  };

  // Optional real LLM reasoning (never invents indicators, never hides errors!)
  if (llmEvaluator) {
    const llmOut = await llmEvaluator(record);
    record.llmStatus = llmOut.status;
    record.llmProvider = llmOut.provider;
    record.llmSummaryUz = llmOut.summaryUz;
    record.llmError = llmOut.error;
    db.llmHealth = {
      status: llmOut.status,
      provider: llmOut.provider,
      lastCheckedAt: nowIso,
      lastError: llmOut.error,
    };
  }

  // Persist canonical analysis + history + deduplicated signal notification
  const prevAnalysis = db.unifiedAnalyses[symbol];
  db.unifiedAnalyses[symbol] = record;

  // Update scanner state cleanly
  db.scannerStates[symbol] = {
    symbol,
    timeframe,
    status: decision === 'BUY' || decision === 'SELL' ? 'SIGNAL FOUND' : 'WAIT',
    dataSource: primaryOhlc.source,
    freshnessSec: primaryOhlc.freshnessSec,
    lastCandleTimeIso: primaryOhlc.lastCandleTimeIso,
    newCandleDetected: primaryOhlc.isNewCandle,
    lastScannedAt: nowIso,
    analysisId,
    decision,
    confidence,
    error: null,
  };

  // Save into Historical Memory (`db.analyses`)
  db.analyses.unshift({
    id: analysisId,
    timestamp: nowIso,
    symbol,
    timeframe,
    action: decision,
    analyticalScore: confidence,
    regime: regime.regime,
    summaryUz: record.explanationUz.slice(0, 420),
  });
  db.analyses = db.analyses.slice(0, 500);

  // Sync open order mark prices for this symbol
  for (const ord of db.orders) {
    if (ord.symbol === symbol && ord.status === 'OPEN') {
      ord.markPrice = price;
    }
  }

  // Trigger notification only on NEW BUY/SELL signal transition (no spam!)
  const prevDecision = prevAnalysis?.decision;
  if ((decision === 'BUY' || decision === 'SELL') && prevDecision !== decision) {
    db.signals.unshift({
      id: `sig-${analysisId}`,
      timestamp: nowIso,
      symbol,
      timeframe,
      direction: decision,
      strategyName: strategyConfirmation.slice(0, 90),
      entryPrice: entry,
      stopLoss,
      takeProfit,
      outcome: 'PENDING',
      pnlUsd: 0,
    });
    db.signals = db.signals.slice(0, 500);

    pushNotification({
      priority: 'HIGH',
      category: 'SETUP',
      title: `Yangi ${decision} signali: ${symbol} (${timeframe})`,
      message: `Ishonch: ${confidence}% · Kirish: ${entry} · SL: ${stopLoss} · TP: ${takeProfit} · ${strategyConfirmation}`,
      symbol,
    });
  }

  // Sync top-level backend control & engine metrics from unifiedAnalyses
  syncMetricsFromUnifiedAnalyses(db, nowIso);
  return record;
}

export function syncMetricsFromUnifiedAnalyses(db: LocalMemoryDatabase, nowIso = new Date().toISOString()) {
  const all = Object.values(db.unifiedAnalyses);
  const okAnalyses = all.filter((a) => a.status === 'OK');
  const buySignals = okAnalyses.filter((a) => a.decision === 'BUY').length;
  const sellSignals = okAnalyses.filter((a) => a.decision === 'SELL').length;
  const waitSignals = okAnalyses.filter((a) => a.decision === 'WAIT').length;
  const acct = computeAccountSummary(db);

  db.control.lastAnalysisTime = nowIso;
  db.control.instrumentsScanned = all.length;
  db.engineMetrics = {
    ...db.engineMetrics,
    aiAnalysisState: okAnalyses.length > 0 ? 'ACTIVE' : 'IDLE',
    aiAnalysisError: db.llmHealth.status === 'ERROR' ? db.llmHealth.lastError : null,
    lastCycleTime: nowIso,
    instrumentsAnalyzed: okAnalyses.length,
    signalsGenerated: okAnalyses.length,
    buySignals,
    sellSignals,
    waitSignals,
    noTradeSignals: all.filter((a) => a.status === 'DATA_UNAVAILABLE').length,
    openPositionsCount: acct.openCount,
    currentPortfolioRiskPct: acct.portfolioRiskPct,
  };
}

/**
 * Validates against the 8-dimension Risk Engine and creates a persistent Test-Mode order.
 * Strictly blocks any unauthorized real-account order or any order failing Risk Engine checks!
 */
export function createValidatedTestOrder(params: {
  db: LocalMemoryDatabase;
  symbol: string;
  side: 'LONG' | 'SHORT';
  orderType?: 'MARKET' | 'LIMIT';
  entryPrice?: number;
  stopLoss: number | null;
  takeProfit: number | null;
  lotSize?: number;
  leverage?: number;
  strategyName?: string;
  analysisId?: string | null;
}): { ok: boolean; order?: PersistentOrderRecord; risk: UnifiedRiskEvaluation; error?: string } {
  const { db } = params;
  const symbol = resolveExactBrokerSymbol(params.symbol);
  const analysis = db.unifiedAnalyses[symbol];
  const def = getInstrumentDefinition(symbol);
  const liveTick = getMt5LiveTick(symbol);
  const livePrice = liveTick?.bid ?? liveTick?.last ?? analysis?.latestPrice ?? params.entryPrice ?? 0;

  if (!livePrice || livePrice <= 0) {
    const emptyRisk = evaluateUnifiedRisk({
      db,
      symbol,
      entryPrice: 1,
      stopLoss: 0.99,
      atrPct: 1,
      spreadPoints: 15,
    });
    return {
      ok: false,
      risk: { ...emptyRisk, allowed: false, blockReasons: ['Haqiqiy bozor narxi mavjud emas (DATA UNAVAILABLE).'] },
      error: 'Haqiqiy bozor narxi mavjud emas (DATA UNAVAILABLE). Avval instrumentni tahlil qiling.',
    };
  }

  const entryPrice = params.orderType === 'LIMIT' && params.entryPrice ? params.entryPrice : livePrice;
  const fallbackSl =
    params.side === 'LONG' ? roundPrice(entryPrice * 0.992, entryPrice) : roundPrice(entryPrice * 1.008, entryPrice);
  const fallbackTp =
    params.side === 'LONG' ? roundPrice(entryPrice * 1.018, entryPrice) : roundPrice(entryPrice * 0.982, entryPrice);
  const stopLoss = params.stopLoss && params.stopLoss > 0 ? params.stopLoss : analysis?.stopLoss ?? fallbackSl;
  const takeProfit = params.takeProfit && params.takeProfit > 0 ? params.takeProfit : analysis?.takeProfit ?? fallbackTp;

  // Geometry guard
  if (params.side === 'LONG' && (stopLoss >= entryPrice || takeProfit <= entryPrice)) {
    const geomRisk = evaluateUnifiedRisk({
      db,
      symbol,
      entryPrice,
      stopLoss: fallbackSl,
      atrPct: analysis?.indicators?.atrPct ?? 0.8,
      spreadPoints: def?.typicalSpreadPoints ?? 15,
    });
    return {
      ok: false,
      risk: { ...geomRisk, allowed: false, blockReasons: ['LONG uchun SL < Entry < TP bo‘lishi shart.'] },
      error: 'LONG uchun SL kirish narxidan past, TP esa yuqori bo‘lishi shart.',
    };
  }
  if (params.side === 'SHORT' && (stopLoss <= entryPrice || takeProfit >= entryPrice)) {
    const geomRisk = evaluateUnifiedRisk({
      db,
      symbol,
      entryPrice,
      stopLoss: fallbackSl,
      atrPct: analysis?.indicators?.atrPct ?? 0.8,
      spreadPoints: def?.typicalSpreadPoints ?? 15,
    });
    return {
      ok: false,
      risk: { ...geomRisk, allowed: false, blockReasons: ['SHORT uchun TP < Entry < SL bo‘lishi shart.'] },
      error: 'SHORT uchun SL kirish narxidan yuqori, TP esa past bo‘lishi shart.',
    };
  }

  const leverage = Math.max(1, Math.min(200, Math.round(params.leverage ?? 100)));
  const risk = evaluateUnifiedRisk({
    db,
    symbol,
    entryPrice,
    stopLoss,
    atrPct: analysis?.indicators?.atrPct ?? 0.8,
    spreadPoints: def?.typicalSpreadPoints ?? 15,
    requestedLot: params.lotSize,
    leverage,
  });

  if (!risk.allowed) {
    db.engineMetrics.ordersRejected += 1;
    db.engineMetrics.lastRejectionReason = risk.blockReasons.join(' · ');
    return {
      ok: false,
      risk,
      error: `Risk Engine buyurtmani rad etdi: ${risk.blockReasons.join(' · ')}`,
    };
  }

  const lotSize = params.lotSize && params.lotSize > 0 ? Number(params.lotSize.toFixed(2)) : risk.recommendedLot;
  const sizeUsdt = Number(Math.max(100, lotSize * 10000).toFixed(2));
  const nowIso = new Date().toISOString();
  const order: PersistentOrderRecord = {
    id: `TST-${Date.now().toString().slice(-6)}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`,
    symbol,
    side: params.side,
    orderType: params.orderType === 'LIMIT' ? 'LIMIT' : 'MARKET',
    entryPrice: roundPrice(entryPrice, entryPrice),
    markPrice: roundPrice(livePrice, livePrice),
    lotSize,
    sizeUsdt,
    leverage,
    stopLoss: roundPrice(stopLoss, entryPrice),
    takeProfit: roundPrice(takeProfit, entryPrice),
    status: params.orderType === 'LIMIT' ? 'PENDING' : 'OPEN',
    strategyName: params.strategyName || analysis?.ensemble.strategyConfirmation || 'Test Mode Manual',
    analysisId: params.analysisId ?? analysis?.analysisId ?? null,
    riskPct: risk.riskPerTradePct,
    riskUsd: risk.riskPerTradeUsd,
    executionMode: 'TEST_SIM',
    openedAt: nowIso,
    notesUz: `Xavfsiz TEST rejimida Risk Engine tasdig‘i bilan ochildi (Portfolio risk: ${risk.portfolioRiskPct}%).`,
    highestPrice: roundPrice(livePrice, livePrice),
    lowestPrice: roundPrice(livePrice, livePrice),
    mfeUsd: 0,
    maeUsd: 0,
    originalDecision: analysis?.decision ?? null,
    originalRegimeUz: analysis?.marketRegimeUz ?? null,
    originalStrategyVotes: analysis
      ? `BUY:${analysis.ensemble.buyVotes} SELL:${analysis.ensemble.sellVotes} WAIT:${analysis.ensemble.waitVotes} (${analysis.ensemble.strategyConfirmation})`
      : null,
  };

  db.orders.unshift(order);
  db.orders = db.orders.slice(0, 300);
  db.engineMetrics.ordersSent += 1;
  db.engineMetrics.lastSuccessfulExecution = nowIso;
  syncMetricsFromUnifiedAnalyses(db, nowIso);
  return { ok: true, order, risk };
}

export function closePersistentOrder(params: {
  db: LocalMemoryDatabase;
  orderId: string;
  closePrice?: number;
  reasonUz?: string;
}): { ok: boolean; order?: PersistentOrderRecord; error?: string } {
  const { db, orderId } = params;
  const order = db.orders.find((o) => o.id === orderId);
  if (!order) {
    return { ok: false, error: 'Buyurtma bazada topilmadi.' };
  }
  if (order.status === 'CLOSED') {
    return { ok: false, error: 'Buyurtma allaqachon yopilgan.' };
  }
  const anl = db.unifiedAnalyses[order.symbol];
  const exitPrice =
    params.closePrice && params.closePrice > 0
      ? params.closePrice
      : anl?.latestPrice && anl.latestPrice > 0
        ? anl.latestPrice
        : order.markPrice;

  const realizedPnl = calculateOrderFloatingPnl(order, exitPrice);
  const nowIso = new Date().toISOString();
  order.markPrice = roundPrice(exitPrice, exitPrice);
  order.highestPrice = Math.max(order.highestPrice ?? order.entryPrice, exitPrice);
  order.lowestPrice = Math.min(order.lowestPrice ?? order.entryPrice, exitPrice);
  const favPrice = order.side === 'LONG' ? order.highestPrice : order.lowestPrice;
  const advPrice = order.side === 'LONG' ? order.lowestPrice : order.highestPrice;
  order.mfeUsd = Math.max(order.mfeUsd ?? 0, Math.max(0, calculateOrderFloatingPnl(order, favPrice)));
  order.maeUsd = Math.min(order.maeUsd ?? 0, Math.min(0, calculateOrderFloatingPnl(order, advPrice)));
  order.status = 'CLOSED';
  order.closedAt = nowIso;
  order.realizedPnl = realizedPnl;
  if (params.reasonUz) {
    order.notesUz = `${order.notesUz ? `${order.notesUz} · ` : ''}Yopildi: ${params.reasonUz}`;
  }
  syncMetricsFromUnifiedAnalyses(db, nowIso);
  return { ok: true, order };
}

export function updatePersistentOrderTargets(params: {
  db: LocalMemoryDatabase;
  orderId: string;
  stopLoss: number | null;
  takeProfit: number | null;
}): { ok: boolean; order?: PersistentOrderRecord; error?: string } {
  const { db, orderId, stopLoss, takeProfit } = params;
  const order = db.orders.find((o) => o.id === orderId);
  if (!order) {
    return { ok: false, error: 'Buyurtma bazada topilmadi.' };
  }
  if (order.status === 'CLOSED') {
    return { ok: false, error: 'Yopilgan buyurtmani tahrirlab bo‘lmaydi.' };
  }
  if (stopLoss !== null && stopLoss > 0) {
    if (order.side === 'LONG' && stopLoss >= order.markPrice) {
      return { ok: false, error: 'LONG uchun Stop-Loss joriy narxdan past bo‘lishi kerak.' };
    }
    if (order.side === 'SHORT' && stopLoss <= order.markPrice) {
      return { ok: false, error: 'SHORT uchun Stop-Loss joriy narxdan yuqori bo‘lishi kerak.' };
    }
    order.stopLoss = roundPrice(stopLoss, order.entryPrice);
  } else if (stopLoss === null) {
    order.stopLoss = null;
  }
  if (takeProfit !== null && takeProfit > 0) {
    if (order.side === 'LONG' && takeProfit <= order.markPrice) {
      return { ok: false, error: 'LONG uchun Take-Profit joriy narxdan yuqori bo‘lishi kerak.' };
    }
    if (order.side === 'SHORT' && takeProfit >= order.markPrice) {
      return { ok: false, error: 'SHORT uchun Take-Profit joriy narxdan past bo‘lishi kerak.' };
    }
    order.takeProfit = roundPrice(takeProfit, order.entryPrice);
  } else if (takeProfit === null) {
    order.takeProfit = null;
  }
  syncMetricsFromUnifiedAnalyses(db);
  return { ok: true, order };
}

export function buildUnifiedSnapshotPayload(db: LocalMemoryDatabase) {
  const acct = computeAccountSummary(db);
  const activeStrategies = db.ensembleStrategies.filter((s) => s.enabled && s.approved);
  const dataSourcesPayload = getMt5DataSourcesPayload();
  const mt5State = getMt5ConnectionState();

  const instruments = dataSourcesPayload.rows.slice(0, 80).map((row) => {
    const anl = db.unifiedAnalyses[row.brokerSymbol];
    const scan = db.scannerStates[row.brokerSymbol];
    const effectivePrice =
      row.bid && row.bid > 0
        ? row.bid
        : row.last && row.last > 0
          ? row.last
          : mt5State.connected
            ? anl?.latestPrice ?? null
            : null;
    return {
      symbol: row.brokerSymbol,
      brokerSymbol: row.brokerSymbol,
      instrument: row.instrument,
      base: row.instrument.includes('/') ? row.instrument.split('/')[0] : row.brokerSymbol.slice(0, 3),
      quote: row.instrument.includes('/') ? row.instrument.split('/')[1] : 'USD',
      assetClass: row.assetClass,
      contractSize: row.contractSize,
      tickSize: row.tickSize,
      tickValue: row.tickValue,
      digits: row.digits,
      point: row.point,
      volumeMin: row.volumeMin,
      volumeMax: row.volumeMax,
      volumeStep: row.volumeStep,
      spreadPoints: row.spreadPoints ?? 0,
      tradingSession: row.tradingSession,
      tradable: row.tradable,
      visible: row.visible,
      bid: row.bid,
      ask: row.ask,
      price: effectivePrice,
      change24h: mt5State.connected ? anl?.change24hPct ?? null : null,
      high24h: mt5State.connected ? anl?.high24h ?? effectivePrice : null,
      low24h: mt5State.connected ? anl?.low24h ?? effectivePrice : null,
      volume24h: mt5State.connected ? row.tickVolume ?? anl?.volume24h ?? null : null,
      rsi14: mt5State.connected ? anl?.indicators?.rsi14 ?? null : null,
      trend:
        anl?.decision === 'BUY'
          ? ('Ko‘tarilish' as const)
          : anl?.decision === 'SELL'
            ? ('Pasayish' as const)
            : ('Yonlama' as const),
      dataSource: 'MT5 BROKER',
      connectionStatus: row.connectionStatus,
      lastTickTime: row.lastTickTime,
      freshnessSec: row.dataAgeSec,
      historicalBars: row.historicalBars,
      timeframesAvailable: row.timeframesAvailable,
      analysisId: anl?.analysisId ?? null,
      scannerStatus: mt5State.connected ? (scan?.status ?? 'WAIT') : ('DATA UNAVAILABLE' as const),
      lastAnalyzedAt: anl?.timestamp ?? null,
    };
  });

  // Deduplicated canonical Signal Feed derived DIRECTLY from unifiedAnalyses (identical analysisId!)
  const signals = Object.values(db.unifiedAnalyses)
    .map((anl) => ({
      analysisId: anl.analysisId,
      symbol: anl.symbol,
      timeframe: anl.timeframe,
      decision: mt5State.connected ? anl.decision : ('DATA_UNAVAILABLE' as const),
      confidence: mt5State.connected ? anl.confidence : 0,
      entry: anl.entry,
      stopLoss: anl.stopLoss,
      takeProfit: anl.takeProfit,
      riskRewardRatio: anl.riskRewardRatio,
      strategyConfirmation: anl.ensemble.strategyConfirmation,
      timestamp: anl.timestamp,
      dataSource: mt5State.connected ? anl.dataSource : 'MT5_DISCONNECTED',
      dataFreshnessSec: anl.dataFreshnessSec,
      marketRegimeUz: mt5State.connected ? anl.marketRegimeUz : 'MT5 Bridge ulanmagan (DISCONNECTED)',
    }))
    .sort((a, b) => {
      const rank = (d: string) => (d === 'BUY' || d === 'SELL' ? 2 : d === 'WAIT' ? 1 : 0);
      if (rank(b.decision) !== rank(a.decision)) return rank(b.decision) - rank(a.decision);
      return b.confidence - a.confidence;
    });

  // Hydrate orders: when MT5 is connected, include real synced MT5 open positions & pending orders!
  const orders =
    mt5State.connected && (mt5State.positions.length > 0 || mt5State.pendingOrders.length > 0)
      ? [
          ...mt5State.positions.map((p) => ({
            id: p.id,
            symbol: p.symbol,
            side: p.side,
            orderType: p.orderType,
            entryPrice: p.entryPrice,
            markPrice: p.markPrice,
            lotSize: p.lotSize,
            sizeUsdt: p.sizeUsdt,
            leverage: p.leverage,
            stopLoss: p.stopLoss,
            takeProfit: p.takeProfit,
            status: 'OPEN' as const,
            strategyName: p.strategyName,
            analysisId: db.unifiedAnalyses[p.symbol]?.analysisId ?? null,
            riskPct: 1,
            riskUsd: 0,
            executionMode: mt5State.account?.tradeMode === 'REAL' ? ('MT5_REAL' as const) : ('MT5_DEMO' as const),
            openedAt: p.openedAt,
            profit: p.profit,
          })),
          ...mt5State.pendingOrders.map((p) => ({
            id: p.id,
            symbol: p.symbol,
            side: p.side,
            orderType: p.orderType,
            entryPrice: p.entryPrice,
            markPrice: p.markPrice,
            lotSize: p.lotSize,
            sizeUsdt: p.sizeUsdt,
            leverage: p.leverage,
            stopLoss: p.stopLoss,
            takeProfit: p.takeProfit,
            status: 'PENDING' as const,
            strategyName: p.strategyName,
            analysisId: db.unifiedAnalyses[p.symbol]?.analysisId ?? null,
            riskPct: 1,
            riskUsd: 0,
            executionMode: mt5State.account?.tradeMode === 'REAL' ? ('MT5_REAL' as const) : ('MT5_DEMO' as const),
            openedAt: p.openedAt,
            profit: 0,
          })),
          ...db.orders.filter((o) => o.status === 'CLOSED'),
        ]
      : db.orders.map((ord) => {
          const tick = getMt5LiveTick(ord.symbol);
          const anl = db.unifiedAnalyses[ord.symbol];
          const markPrice =
            tick?.bid && tick.bid > 0
              ? tick.bid
              : anl?.latestPrice && anl.latestPrice > 0
                ? anl.latestPrice
                : ord.markPrice;
          return {
            ...ord,
            markPrice,
            profit: calculateOrderFloatingPnl(ord, markPrice),
          };
        });

  const buyCount = signals.filter((s) => s.decision === 'BUY').length;
  const sellCount = signals.filter((s) => s.decision === 'SELL').length;
  const waitCount = signals.filter((s) => s.decision === 'WAIT').length;

  return {
    timestamp: new Date().toISOString(),
    dataMode: 'MT5_ONLY' as const,
    mt5Connection: mt5State,
    dataSources: dataSourcesPayload,
    instruments,
    analysesBySymbol: db.unifiedAnalyses,
    signals,
    signalCounts: {
      total: signals.length,
      buy: buyCount,
      sell: sellCount,
      wait: waitCount,
      unavailable: signals.filter((s) => s.decision === 'DATA_UNAVAILABLE').length,
    },
    ensembleStrategies: db.ensembleStrategies,
    activeStrategiesCount: activeStrategies.length,
    totalStrategiesCount: db.ensembleStrategies.length,
    scannerStates: db.scannerStates,
    orders,
    account: acct,
    riskSettings: db.riskSettings,
    llmHealth: db.llmHealth,
    scanner: {
      status: db.control.scannerStatus,
      lastScanAt: db.control.lastAnalysisTime,
      instrumentsScanned: Object.keys(db.scannerStates).length,
      newCandlesDetected: Object.values(db.scannerStates).filter((s) => s.newCandleDetected).length,
    },
    historyCounts: {
      analyses: db.analyses.length,
      signals: db.signals.length,
      orders: db.orders.length,
      notifications: db.notifications.length,
    },
  };
}
