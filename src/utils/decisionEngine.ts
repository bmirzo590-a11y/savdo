import {
  CandlePoint,
  DecisionDimensionScores,
  FinalDecisionAction,
  IntelligentDecisionReport,
  MarketPair,
  MultiTimeframeReport,
  RiskGuardSettings,
  StrategyDecisionCard,
  Timeframe,
  TimeframeBiasEntry,
} from '../types/trading';
import { INITIAL_STRATEGIES, generateCandlesForPair } from '../data/initialData';
import { analyzeStrategyBrain, StrategyBrainAnalysis } from './strategyBrain';
import { evaluateTradeRisk } from './riskManager';

const ALL_TIMEFRAMES: Timeframe[] = ['W1', 'D1', 'H4', 'H1', 'M30', 'M15', 'M5', 'M1'];

function tfLayer(tf: Timeframe): TimeframeBiasEntry['layer'] {
  if (tf === 'W1' || tf === 'D1' || tf === 'H4') return 'MAKRO (D1/W1/H4)';
  if (tf === 'H1' || tf === 'M30') return 'SETUP (H1/M30)';
  return 'KIRISH (M15/M5/M1)';
}

function tfMinutes(tf: Timeframe): number {
  const map: Record<Timeframe, number> = {
    M1: 1,
    M5: 5,
    M15: 15,
    M30: 30,
    H1: 60,
    H4: 240,
    D1: 1440,
    W1: 10080,
  };
  return map[tf];
}

export function deriveTimeframeCandles(
  baseCandles: CandlePoint[],
  targetTf: Timeframe,
  baseTf: Timeframe,
  fallbackPrice: number
): CandlePoint[] {
  if (targetTf === baseTf && baseCandles.length >= 24) return baseCandles;
  const ratio = Math.round(tfMinutes(targetTf) / Math.max(1, tfMinutes(baseTf)));
  if (ratio > 1 && baseCandles.length >= ratio * 16) {
    const out: CandlePoint[] = [];
    for (let i = 0; i < baseCandles.length; i += ratio) {
      const chunk = baseCandles.slice(i, i + ratio);
      if (chunk.length === 0) continue;
      out.push({
        time: chunk[chunk.length - 1].time,
        open: chunk[0].open,
        high: Math.max(...chunk.map((c) => c.high)),
        low: Math.min(...chunk.map((c) => c.low)),
        close: chunk[chunk.length - 1].close,
        volume: chunk.reduce((s, c) => s + c.volume, 0),
      });
    }
    if (out.length >= 16) return out;
  }

  // Deterministic scale-matched candles when higher/lower TF isn't directly provided by MT5
  const scaleVol = Math.sqrt(tfMinutes(targetTf) / 60);
  const raw = generateCandlesForPair(fallbackPrice, 64);
  return raw.map((c, idx) => {
    const dev = (c.close - fallbackPrice) * Math.min(1.8, Math.max(0.45, scaleVol * 0.65));
    const close = Math.max(0.0001, idx === raw.length - 1 ? fallbackPrice : fallbackPrice + dev);
    const open = Math.max(0.0001, idx === 0 ? close * 0.999 : fallbackPrice + (c.open - fallbackPrice) * 0.6);
    const spread = Math.max(1e-5, Math.abs(c.high - c.low) * Math.min(1.5, Math.max(0.5, scaleVol * 0.6)));
    return {
      time: c.time,
      open,
      close,
      high: Math.max(open, close) + spread * 0.45,
      low: Math.max(0.0001, Math.min(open, close) - spread * 0.45),
      volume: c.volume,
    };
  });
}

export function buildMultiTimeframeReport(
  symbol: string,
  currentTf: Timeframe,
  currentCandles: CandlePoint[],
  candlesByTf: Partial<Record<Timeframe, CandlePoint[]>>,
  fallbackPrice: number
): MultiTimeframeReport {
  const entries: TimeframeBiasEntry[] = ALL_TIMEFRAMES.map((tf) => {
    const tfCandles = candlesByTf[tf] && candlesByTf[tf]!.length >= 20
      ? candlesByTf[tf]!
      : deriveTimeframeCandles(currentCandles, tf, currentTf, fallbackPrice);
    const brain = analyzeStrategyBrain(tfCandles, symbol, tf);
    const snap = brain.snapshot;
    const tech = snap.technicals;
    const regime = snap.regime?.regime ?? 'Uncertain Market';

    let bullVotes = 0;
    let bearVotes = 0;
    if (snap.emaRibbon.alignment.includes('Buqa') || snap.lastPrice > snap.emaRibbon.ema200) bullVotes++;
    if (snap.emaRibbon.alignment.includes('Ayiq') || snap.lastPrice < snap.emaRibbon.ema200) bearVotes++;
    if (snap.smc.swingBias === 'BULLISH') bullVotes++;
    if (snap.smc.swingBias === 'BEARISH') bearVotes++;
    if (tech && tech.trend.supertrendDir === 1) bullVotes++;
    if (tech && tech.trend.supertrendDir === -1) bearVotes++;

    const bias: TimeframeBiasEntry['bias'] =
      bullVotes > bearVotes ? 'BULLISH' : bearVotes > bullVotes ? 'BEARISH' : 'NEUTRAL';

    return {
      timeframe: tf,
      layer: tfLayer(tf),
      bias,
      regime,
      rsi14: snap.rsiBars.rsi14,
      adx14: snap.pandasTaClassic.adx14,
      candlestickNote:
        snap.candlestickReport?.latestConfirmedPattern?.patternName ??
        snap.candlestickReport?.latestActivePattern?.patternName ??
        'Standart sham',
      smcBias: snap.smc.swingBias,
    };
  });

  const aggregateLayer = (layer: TimeframeBiasEntry['layer']): 'BULLISH' | 'BEARISH' | 'NEUTRAL' => {
    const list = entries.filter((e) => e.layer === layer);
    const bulls = list.filter((e) => e.bias === 'BULLISH').length;
    const bears = list.filter((e) => e.bias === 'BEARISH').length;
    if (bulls > bears) return 'BULLISH';
    if (bears > bulls) return 'BEARISH';
    return 'NEUTRAL';
  };

  const macroBias = aggregateLayer('MAKRO (D1/W1/H4)');
  const setupBias = aggregateLayer('SETUP (H1/M30)');
  const entryBias = aggregateLayer('KIRISH (M15/M5/M1)');

  const sameCount =
    macroBias !== 'NEUTRAL'
      ? entries.filter((e) => e.bias === macroBias).length
      : entries.filter((e) => e.bias === setupBias && setupBias !== 'NEUTRAL').length;
  const alignmentPct = Math.round((sameCount / ALL_TIMEFRAMES.length) * 100);

  const conflictDetected =
    (macroBias === 'BULLISH' && setupBias === 'BEARISH') ||
    (macroBias === 'BEARISH' && setupBias === 'BULLISH') ||
    (macroBias !== 'NEUTRAL' && entryBias !== 'NEUTRAL' && macroBias !== entryBias);

  const conflictReasonUz = conflictDetected
    ? `Timeframe ziddiyati: Makro (${macroBias}), Setup (${setupBias}), Kirish (${entryBias}). Qarama-qarshilik yechilmaguncha WAIT rejimi tavsiya etiladi.`
    : null;

  return {
    symbol,
    entries,
    macroBias,
    setupBias,
    entryBias,
    alignmentPct,
    conflictDetected,
    conflictReasonUz,
  };
}

export interface RunDecisionInput {
  pair: MarketPair;
  timeframe: Timeframe;
  candles: CandlePoint[];
  brainAnalysis?: StrategyBrainAnalysis;
  candlesByTf?: Partial<Record<Timeframe, CandlePoint[]>>;
  equity: number;
  riskGuard: RiskGuardSettings;
  openPositionsCount: number;
  realizedTodayUsd: number;
  calibratedSampleCount?: number;
  calibratedWinRatePct?: number | null;
}

export function runIntelligentDecision(input: RunDecisionInput): IntelligentDecisionReport {
  const {
    pair,
    timeframe,
    candles,
    candlesByTf = {},
    equity,
    riskGuard,
    openPositionsCount,
    realizedTodayUsd,
    calibratedSampleCount = 0,
    calibratedWinRatePct = null,
  } = input;

  const brain = input.brainAnalysis ?? analyzeStrategyBrain(candles, pair.symbol, timeframe);
  const snap = brain.snapshot;
  const price = snap.lastPrice || pair.price;
  const tech = snap.technicals!;
  const candleRep = snap.candlestickReport!;
  const chartRep = snap.chartPatternReport!;
  const smcDeep = snap.smcDeep!;
  const regime = snap.regime!;

  const mtf = buildMultiTimeframeReport(pair.symbol, timeframe, candles, candlesByTf, price);

  const atr = Math.max(price * 0.002, tech.volatility.atr14);
  const buildCardSlTp = (sig: 'BUY' | 'SELL' | 'WAIT', slMult = 1.6, tpMult = 3.4) => {
    if (sig === 'SELL') {
      const sl = price + atr * slMult;
      const tp = Math.max(0.0001, price - atr * tpMult);
      return { sl, tp, rr: Number(((price - tp) / Math.max(1e-9, sl - price)).toFixed(2)) };
    }
    const sl = Math.max(0.0001, price - atr * slMult);
    const tp = price + atr * tpMult;
    return { sl, tp, rr: Number(((tp - price) / Math.max(1e-9, price - sl)).toFixed(2)) };
  };

  // Evaluate each of the 10 strategies individually without hiding conflicts
  const strategyDecisions: StrategyDecisionCard[] = INITIAL_STRATEGIES.map((st) => {
    const selected = regime.selectedStrategyIds.includes(st.id);
    let signal: 'BUY' | 'SELL' | 'WAIT' = 'WAIT';
    let reasonUz = '';
    const confirming: string[] = [];
    const opposing: string[] = [];
    let entryCondition = 'Yopilgan sham tasdig‘ini kutish';
    let invalidation = 'Tuzilmaviy swing daraja buzilishi';

    if (st.id === 'strat-smc-luxalgo') {
      if (snap.smc.swingBias === 'BULLISH' && (snap.smc.zone === 'Discount' || smcDeep.mssDetected === 'BULLISH_MSS')) {
        signal = 'BUY';
        confirming.push(snap.smc.lastStructureTag, `Zona: ${snap.smc.zone}`);
        if (smcDeep.recentSweep === 'SSL_SWEEP') confirming.push('SSL Liquidity Sweep');
      } else if (snap.smc.swingBias === 'BEARISH' && (snap.smc.zone === 'Premium' || smcDeep.mssDetected === 'BEARISH_MSS')) {
        signal = 'SELL';
        confirming.push(snap.smc.lastStructureTag, `Zona: ${snap.smc.zone}`);
        if (smcDeep.recentSweep === 'BSL_SWEEP') confirming.push('BSL Liquidity Sweep');
      } else {
        opposing.push(`Swing=${snap.smc.swingBias}, Zona=${snap.smc.zone} mos emas`);
      }
      reasonUz = `SMC: ${smcDeep.summaryUz}`;
      entryCondition = 'FVG yoki aktiv Order Block zonasidan MSS tasdiqli qaytish';
      invalidation = snap.smc.nearestBullOb
        ? `Bull OB pastki (${snap.smc.nearestBullOb.bottom.toFixed(4)})`
        : 'So‘nggi Swing High/Low buzilishi';
    } else if (st.id === 'strat-scalp-pullback') {
      if (snap.scalpingPullback.signal === 'BUY' || (snap.scalpingPullback.trendDirection === 1 && snap.scalpingPullback.barLocation === 'PAC Yuqorisida')) {
        signal = 'BUY';
        confirming.push('EMA89 > EMA200', snap.scalpingPullback.barLocation);
      } else if (snap.scalpingPullback.signal === 'SELL' || (snap.scalpingPullback.trendDirection === -1 && snap.scalpingPullback.barLocation === 'PAC Pastida')) {
        signal = 'SELL';
        confirming.push('EMA89 < EMA200', snap.scalpingPullback.barLocation);
      } else {
        opposing.push('PAC34 kanal ichida yoki trend yo‘nalishsiz');
      }
      reasonUz = `PAC(34) holati: ${snap.scalpingPullback.barLocation}, Fraktal: ${snap.scalpingPullback.latestFractal}`;
      entryCondition = 'Heikin Ashi sham PAC(34) chegarasidan trend bo‘yicha chiqishi';
      invalidation = 'PAC markaziy chizig‘idan qarshi tomonga yopilish';
    } else if (st.id === 'strat-ema-rsi-div') {
      if (snap.emaRibbon.alignment.includes('Buqa') && tech.momentum.rsi14 < 68) {
        signal = 'BUY';
        confirming.push(snap.emaRibbon.alignment, `RSI=${tech.momentum.rsi14.toFixed(1)}`);
      } else if (snap.emaRibbon.alignment.includes('Ayiq') && tech.momentum.rsi14 > 32) {
        signal = 'SELL';
        confirming.push(snap.emaRibbon.alignment, `RSI=${tech.momentum.rsi14.toFixed(1)}`);
      } else {
        opposing.push(`EMA tartibi: ${snap.emaRibbon.alignment}`);
      }
      if (snap.rsiDivergence.latestType === 'BEAR' && signal === 'BUY') opposing.push('Ayiq RSI divergensiyasi mavjud');
      if (snap.rsiDivergence.latestType === 'BULL' && signal === 'SELL') opposing.push('Buqa RSI divergensiyasi mavjud');
      reasonUz = `EMA Ribbon ${snap.emaRibbon.alignment}, RSI(14)=${tech.momentum.rsi14.toFixed(1)}, Div=${snap.rsiDivergence.latestType}`;
      entryCondition = 'EMA 20/50/100/200 tartiblangan va RSI haddan tashqari zonada emas';
      invalidation = 'EMA(50) qarshi tomonga yorib o‘tilishi';
    } else if (st.id === 'strat-vwap-stdev') {
      if (price <= snap.vwapBands.lower128 && tech.momentum.rsi14 <= 42) {
        signal = 'BUY';
        confirming.push('VWAP -1.28σ/-2.01σ tayanch zonasi', `RSI=${tech.momentum.rsi14.toFixed(1)}`);
      } else if (price >= snap.vwapBands.upper128 && tech.momentum.rsi14 >= 58) {
        signal = 'SELL';
        confirming.push('VWAP +1.28σ/+2.01σ qarshilik zonasi', `RSI=${tech.momentum.rsi14.toFixed(1)}`);
      } else {
        opposing.push(snap.vwapBands.zone);
      }
      reasonUz = `VWAP zona: ${snap.vwapBands.zone}`;
      entryCondition = 'Narx ±1.28σ..±2.01σ ekstremumidan qaytish shamini yopganda';
      invalidation = '±2.51σ chegarasidan tashqarida yopilish';
    } else if (st.id === 'strat-leviathan-pa') {
      if (snap.leviathan.signal === 'BUY' || (snap.leviathan.trend === 'BULLISH' && candleRep.latestConfirmedPattern?.bias === 'BULLISH')) {
        signal = 'BUY';
        confirming.push(`Leviathan Trend: ${snap.leviathan.trend}`, snap.leviathan.bos);
      } else if (snap.leviathan.signal === 'SELL' || (snap.leviathan.trend === 'BEARISH' && candleRep.latestConfirmedPattern?.bias === 'BEARISH')) {
        signal = 'SELL';
        confirming.push(`Leviathan Trend: ${snap.leviathan.trend}`, snap.leviathan.bos);
      } else {
        opposing.push('Swing(20) BOS yoki tasdiqlangan Pinbar/Engulfing yo‘q');
      }
      reasonUz = `Leviathan PA: Trend=${snap.leviathan.trend}, BOS=${snap.leviathan.bos}, Pattern=${snap.leviathan.pattern}`;
      entryCondition = 'EMA 9/21/200 yo‘nalishi + BOS + tasdiqlangan sham patterni';
      invalidation = 'Pattern shami ekstremumi buzilishi';
    } else if (st.id === 'strat-geraked-ut-zlsma') {
      if (snap.gerakedMt5.utBotSignal === 'BUY' && price >= snap.gerakedMt5.zlsma14) {
        signal = 'BUY';
        confirming.push('UT Bot BUY', 'Narx > ZLSMA(14)', `Chandelier=${snap.gerakedMt5.chandelierBias}`);
      } else if (snap.gerakedMt5.utBotSignal === 'SELL' && price <= snap.gerakedMt5.zlsma14) {
        signal = 'SELL';
        confirming.push('UT Bot SELL', 'Narx < ZLSMA(14)', `Chandelier=${snap.gerakedMt5.chandelierBias}`);
      } else {
        opposing.push(`UT Bot=${snap.gerakedMt5.utBotSignal}, Chandelier=${snap.gerakedMt5.chandelierBias}`);
      }
      reasonUz = `UT Bot (${snap.gerakedMt5.utBotSignal}) + ZLSMA(14)=${snap.gerakedMt5.zlsma14.toFixed(4)}`;
      entryCondition = 'UT Bot ATR trailing chizig‘i kesishmasi va ZLSMA tasdig‘i';
      invalidation = `UT Stop (${snap.gerakedMt5.utStop.toFixed(4)}) buzilishi`;
    } else if (st.id === 'strat-alorse-supertrend') {
      if (snap.alorseSuite.doubleSupertrend === 'DOUBLE_BULL' && snap.alorseSuite.ttmMomentum >= 0) {
        signal = 'BUY';
        confirming.push('Double Supertrend BULL', 'TTM Momentum > 0');
      } else if (snap.alorseSuite.doubleSupertrend === 'DOUBLE_BEAR' && snap.alorseSuite.ttmMomentum <= 0) {
        signal = 'SELL';
        confirming.push('Double Supertrend BEAR', 'TTM Momentum < 0');
      } else {
        opposing.push(`Double ST=${snap.alorseSuite.doubleSupertrend}`);
      }
      reasonUz = `Double Supertrend=${snap.alorseSuite.doubleSupertrend}, TTM Squeeze=${snap.alorseSuite.ttmSqueezeOn ? 'ON' : 'OFF'}`;
      entryCondition = 'Supertrend (3.0 va 5.0) bir yo‘nalishda + TTM momentum ochilishi';
      invalidation = `Supertrend darajasi (${snap.alorseSuite.supertrendLevel.toFixed(4)})`;
    } else if (st.id === 'strat-pandas-ta-adx') {
      if (tech.trend.adx14 >= 20 && tech.trend.plusDi > tech.trend.minusDi && tech.momentum.macdHist > 0) {
        signal = 'BUY';
        confirming.push(`ADX=${tech.trend.adx14.toFixed(1)}`, '+DI > -DI', 'MACD Hist > 0');
      } else if (tech.trend.adx14 >= 20 && tech.trend.minusDi > tech.trend.plusDi && tech.momentum.macdHist < 0) {
        signal = 'SELL';
        confirming.push(`ADX=${tech.trend.adx14.toFixed(1)}`, '-DI > +DI', 'MACD Hist < 0');
      } else {
        opposing.push(`ADX=${tech.trend.adx14.toFixed(1)} yoki DI/MACD mos emas`);
      }
      reasonUz = `ADX(14)=${tech.trend.adx14.toFixed(1)}, Stoch=${tech.momentum.stochK.toFixed(0)}, CCI=${tech.momentum.cci20.toFixed(0)}`;
      entryCondition = 'ADX >= 20 bilan DI+MACD va sham patterni mosligi';
      invalidation = '+DI / -DI teskari kesishishi';
    } else if (st.id === 'strat-azadone-ichimoku-sweep') {
      if (tech.trend.ichimokuKumo === 'BULL_KUMO' && (snap.azadoneTools.sweepSignal === 'BUY_SWEEP' || smcDeep.recentSweep === 'SSL_SWEEP')) {
        signal = 'BUY';
        confirming.push('BULL Kumo ustida', 'Liquidity Sweep BUY');
      } else if (tech.trend.ichimokuKumo === 'BEAR_KUMO' && (snap.azadoneTools.sweepSignal === 'SELL_SWEEP' || smcDeep.recentSweep === 'BSL_SWEEP')) {
        signal = 'SELL';
        confirming.push('BEAR Kumo ostida', 'Liquidity Sweep SELL');
      } else if (tech.trend.ichimokuKumo === 'BULL_KUMO' && tech.trend.ichimokuTenkan > tech.trend.ichimokuKijun) {
        signal = 'BUY';
        confirming.push('Tenkan > Kijun & Bull Kumo');
      } else if (tech.trend.ichimokuKumo === 'BEAR_KUMO' && tech.trend.ichimokuTenkan < tech.trend.ichimokuKijun) {
        signal = 'SELL';
        confirming.push('Tenkan < Kijun & Bear Kumo');
      } else {
        opposing.push(`Kumo=${tech.trend.ichimokuKumo}`);
      }
      reasonUz = `Ichimoku=${tech.trend.ichimokuKumo}, Sweep=${smcDeep.recentSweep}`;
      entryCondition = 'Kumo buluti tashqarisida Tenkan/Kijun yoki likvidlik sweep tasdig‘i';
      invalidation = 'Narx Ichimoku Kumo ichiga qaytib yopilishi';
    } else {
      // strat-pynecore-hma-flow
      const activeChart = chartRep.activePattern;
      if (snap.pynecoreSuite.flowSignal === 'BULL_FLOW' || (activeChart?.status === 'BREAKOUT_TASDIQLANDI' && activeChart.bias === 'BULLISH')) {
        signal = 'BUY';
        confirming.push(`HMA(21) ${snap.pynecoreSuite.hmaSlope}`, snap.pynecoreSuite.flowSignal);
        if (activeChart) confirming.push(activeChart.name);
      } else if (snap.pynecoreSuite.flowSignal === 'BEAR_FLOW' || (activeChart?.status === 'BREAKOUT_TASDIQLANDI' && activeChart.bias === 'BEARISH')) {
        signal = 'SELL';
        confirming.push(`HMA(21) ${snap.pynecoreSuite.hmaSlope}`, snap.pynecoreSuite.flowSignal);
        if (activeChart) confirming.push(activeChart.name);
      } else {
        opposing.push(`HMA Flow=${snap.pynecoreSuite.flowSignal}`);
      }
      reasonUz = `HMA(21) qiyaligi ${snap.pynecoreSuite.hmaSlope}, Chart Pattern: ${activeChart?.name ?? 'Yo‘q'}`;
      entryCondition = 'HMA(21) oqimi + Chart pattern breakout tasdig‘i';
      invalidation = `HMA(21)=${snap.pynecoreSuite.hma21.toFixed(4)} qarshi yorilishi`;
    }

    const levels = buildCardSlTp(signal);
    return {
      strategyId: st.id,
      strategyName: st.name,
      selectedForRegime: selected,
      signal,
      reasonUz,
      confirmingIndicators: confirming,
      opposingSignals: opposing,
      entryCondition,
      invalidation,
      sl: levels.sl,
      tp: levels.tp,
      riskReward: levels.rr,
    };
  });

  const activeStrategies = strategyDecisions.filter((s) => s.selectedForRegime);
  const buyStrats = activeStrategies.filter((s) => s.signal === 'BUY');
  const sellStrats = activeStrategies.filter((s) => s.signal === 'SELL');

  const dominantDir: 'BUY' | 'SELL' | 'WAIT' =
    buyStrats.length > sellStrats.length && buyStrats.length >= 2
      ? 'BUY'
      : sellStrats.length > buyStrats.length && sellStrats.length >= 2
        ? 'SELL'
        : 'WAIT';

  // Evaluate 10 dimensions (0-100)
  const bullTrend =
    (tech.trend.ema20 > tech.trend.ema50 ? 25 : 0) +
    (tech.trend.ema50 > tech.trend.ema200 ? 25 : 0) +
    (tech.trend.supertrendDir === 1 ? 25 : 0) +
    (tech.trend.ichimokuKumo === 'BULL_KUMO' ? 25 : 0);
  const bearTrend =
    (tech.trend.ema20 < tech.trend.ema50 ? 25 : 0) +
    (tech.trend.ema50 < tech.trend.ema200 ? 25 : 0) +
    (tech.trend.supertrendDir === -1 ? 25 : 0) +
    (tech.trend.ichimokuKumo === 'BEAR_KUMO' ? 25 : 0);
  const trendAlignment = dominantDir === 'SELL' ? bearTrend : dominantDir === 'BUY' ? bullTrend : Math.max(bullTrend, bearTrend) * 0.65;

  const confirmedCandle = candleRep.latestConfirmedPattern;
  const candlestickConfirmation = confirmedCandle
    ? confirmedCandle.bias === (dominantDir === 'SELL' ? 'BEARISH' : 'BULLISH')
      ? confirmedCandle.strength
      : 32
    : candleRep.latestActivePattern
      ? 55
      : 40;

  const marketStructure =
    smcDeep.structureState === 'BULLISH_STRUCTURE' && dominantDir === 'BUY'
      ? 85
      : smcDeep.structureState === 'BEARISH_STRUCTURE' && dominantDir === 'SELL'
        ? 85
        : smcDeep.mssDetected !== 'YO‘Q'
          ? 76
          : 48;

  const liquidity =
    (dominantDir === 'BUY' && smcDeep.recentSweep === 'SSL_SWEEP') ||
    (dominantDir === 'SELL' && smcDeep.recentSweep === 'BSL_SWEEP')
      ? 88
      : (dominantDir === 'BUY' && smcDeep.zone === 'Discount') ||
          (dominantDir === 'SELL' && smcDeep.zone === 'Premium')
        ? 74
        : 52;

  const momentum =
    dominantDir === 'BUY'
      ? tech.momentum.macdHist > 0 && tech.momentum.rsi14 >= 45 && tech.momentum.rsi14 <= 68
        ? 84
        : 54
      : dominantDir === 'SELL'
        ? tech.momentum.macdHist < 0 && tech.momentum.rsi14 <= 55 && tech.momentum.rsi14 >= 32
          ? 84
          : 54
        : 45;

  const volatility = tech.volatility.atrPct <= (riskGuard.maxVolatilityAtrPct ?? 2.5) ? (tech.momentum.ttmSqueezeOn ? 62 : 78) : 25;
  const volume =
    tech.volume.volumeRatio >= 1.2
      ? 84
      : tech.volume.volumeRatio >= 0.9
        ? 68
        : 46;
  const multiTimeframe = mtf.conflictDetected ? Math.min(48, mtf.alignmentPct) : Math.max(55, mtf.alignmentPct);

  const selectedCount = Math.max(1, activeStrategies.length);
  const alignedCount = dominantDir === 'BUY' ? buyStrats.length : dominantDir === 'SELL' ? sellStrats.length : 0;
  const strategyAgreement = Math.round((alignedCount / selectedCount) * 100);

  const riskEvaluation = evaluateTradeRisk({
    pair,
    direction: dominantDir,
    entryPrice: price,
    structureInvalidation:
      dominantDir === 'BUY'
        ? snap.smc.nearestBullOb?.bottom ?? chartRep.activePattern?.invalidationLevel
        : snap.smc.nearestBearOb?.top ?? chartRep.activePattern?.invalidationLevel,
    atr14: tech.volatility.atr14,
    equity,
    riskGuard,
    activeOpenCount: openPositionsCount,
    realizedTodayUsd,
  });

  const slDist = Math.max(1e-9, Math.abs(price - riskEvaluation.dynamicStopLoss));
  const tpDist = Math.abs(riskEvaluation.takeProfit - price);
  const rrRatio = tpDist / slDist;
  const riskReward = rrRatio >= 2.0 ? Math.min(95, Math.round(rrRatio * 38)) : 40;

  const dimensions: DecisionDimensionScores = {
    trendAlignment: Math.round(trendAlignment),
    candlestickConfirmation: Math.round(candlestickConfirmation),
    marketStructure: Math.round(marketStructure),
    liquidity: Math.round(liquidity),
    momentum: Math.round(momentum),
    volatility: Math.round(volatility),
    volume: Math.round(volume),
    multiTimeframe: Math.round(multiTimeframe),
    strategyAgreement: Math.round(strategyAgreement),
    riskReward: Math.round(riskReward),
  };

  const analyticalScore = Math.round(
    (dimensions.trendAlignment +
      dimensions.candlestickConfirmation +
      dimensions.marketStructure +
      dimensions.liquidity +
      dimensions.momentum +
      dimensions.volatility +
      dimensions.volume +
      dimensions.multiTimeframe +
      dimensions.strategyAgreement +
      dimensions.riskReward) /
      10
  );

  // Determine Final Verdict: BUY | SELL | WAIT | NO TRADE
  let finalAction: FinalDecisionAction = 'WAIT';
  if (!riskEvaluation.overallAllowed || regime.regime === 'Uncertain Market') {
    finalAction = 'NO TRADE';
  } else if (mtf.conflictDetected) {
    finalAction = 'WAIT';
  } else if (dominantDir !== 'WAIT' && analyticalScore >= 60 && strategyAgreement >= 45) {
    finalAction = dominantDir;
  } else if (buyStrats.length === 0 && sellStrats.length === 0) {
    finalAction = 'NO TRADE';
  } else {
    finalAction = 'WAIT';
  }

  // Supporting & Opposing Evidence (explicitly transparent!)
  const supportingEvidenceUz: string[] = [];
  const opposingEvidenceUz: string[] = [];

  supportingEvidenceUz.push(`Bozor rejimi: ${regime.labelUz} (${regime.regime})`);
  if (confirmedCandle) {
    supportingEvidenceUz.push(`Tasdiqlangan sham patterni: ${confirmedCandle.patternName} (${confirmedCandle.bias}, ${confirmedCandle.strength}%)`);
  }
  if (chartRep.activePattern) {
    const targetList = chartRep.activePattern.status === 'BEKOR_QILINGAN' ? opposingEvidenceUz : supportingEvidenceUz;
    targetList.push(`Chart pattern: ${chartRep.activePattern.name} (${chartRep.activePattern.status})`);
  }
  supportingEvidenceUz.push(`SMC holati: ${smcDeep.summaryUz}`);
  supportingEvidenceUz.push(`Faol strategiyalar roziligi: BUY=${buyStrats.length}, SELL=${sellStrats.length} (tanlangan ${activeStrategies.length} tadan)`);

  if (mtf.conflictDetected && mtf.conflictReasonUz) {
    opposingEvidenceUz.push(mtf.conflictReasonUz);
  }
  if (!riskEvaluation.overallAllowed) {
    opposingEvidenceUz.push(...riskEvaluation.blockReasons);
  }
  if (buyStrats.length > 0 && sellStrats.length > 0) {
    opposingEvidenceUz.push(
      `Strategiyalar o‘rtasida qarama-qarshilik: ${buyStrats.length} ta BUY (${buyStrats.map((s) => s.strategyName.split(' ')[0]).join(', ')}) vs ${sellStrats.length} ta SELL (${sellStrats.map((s) => s.strategyName.split(' ')[0]).join(', ')}).`
    );
  }
  if (confirmedCandle && dominantDir !== 'WAIT' && confirmedCandle.bias !== (dominantDir === 'BUY' ? 'BULLISH' : 'BEARISH') && confirmedCandle.bias !== 'NEUTRAL') {
    opposingEvidenceUz.push(`Oxirgi sham patterni (${confirmedCandle.patternName}) asosiy yo‘nalishga qarshi signal bermoqda.`);
  }
  if (opposingEvidenceUz.length === 0) {
    opposingEvidenceUz.push('Kuchli qarshi signal aniqlanmadi, lekin faqat yopilgan shamlar va belgilangan SL bilan kirish lozim.');
  }

  const calibrationSampleReady = calibratedSampleCount >= 30 && calibratedWinRatePct !== null;
  const calibrationNoteUz = calibrationSampleReady
    ? `Tarixiy va journal kalibratsiyasi (${calibratedSampleCount} ta yopilgan savdo): statistik yutuq ehtimoli ${calibratedWinRatePct!.toFixed(1)}%.`
    : `Tahliliy ball (${analyticalScore}/100) indikator va strukturaviy konfluensiya ko‘rsatkichidir — bu haqiqiy statistik ehtimollik EMAS (kalibratsiya uchun kamida 30 ta yopilgan tarixiy savdo kerak, hozir: ${calibratedSampleCount}).`;

  const explanationUz =
    finalAction === 'BUY' || finalAction === 'SELL'
      ? `${pair.symbol} (${timeframe}) bo‘yicha ${regime.labelUz} rejimida ${finalAction} qarori shakllandi (Tahliliy ball: ${analyticalScore}/100). Kirish: ${price.toFixed(4)}, Dinamik SL: ${riskEvaluation.dynamicStopLoss.toFixed(4)}, TP: ${riskEvaluation.takeProfit.toFixed(4)}, Tavsiya etilgan lot: ${riskEvaluation.recommendedLot}.`
      : finalAction === 'NO TRADE'
        ? `${pair.symbol} (${timeframe}) uchun SAVDO TAQIQLANDI (NO TRADE): ${opposingEvidenceUz[0] ?? 'Xavf yoki bozor noaniqligi filtrlari savdoga ruxsat bermadi.'}`
        : `${pair.symbol} (${timeframe}) uchun KUTISH (WAIT): Strategiyalar yoki timeframe‘lar to‘liq kelishmagan (BUY=${buyStrats.length}, SELL=${sellStrats.length}, MTF mosligi=${mtf.alignmentPct}%).`;

  return {
    symbol: pair.symbol,
    timeframe,
    timestamp: new Date().toLocaleTimeString('uz-UZ', { hour12: false }),
    finalAction,
    analyticalScore,
    calibratedWinProbPct: calibrationSampleReady ? calibratedWinRatePct : null,
    calibrationNoteUz,
    regime,
    mtf,
    dimensions,
    supportingEvidenceUz,
    opposingEvidenceUz,
    explanationUz,
    strategyDecisions,
    riskEvaluation,
  };
}
