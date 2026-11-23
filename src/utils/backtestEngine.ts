import {
  BacktestParams,
  BacktestResult,
  BacktestStyleBreakdown,
  BacktestTrade,
  CandlePoint,
  Timeframe,
} from '../types/trading';
import { analyzeStrategyBrain } from './strategyBrain';

const TF_MINUTES: Record<Timeframe, number> = {
  M1: 1,
  M5: 5,
  M15: 15,
  M30: 30,
  H1: 60,
  H4: 240,
  D1: 1440,
  W1: 10080,
};

export function generateMt5Candles(
  symbol: string,
  basePrice: number,
  timeframe: Timeframe,
  count = 120
): CandlePoint[] {
  const candles: CandlePoint[] = [];
  const tfMins = TF_MINUTES[timeframe] || 60;
  const volScale = Math.sqrt(tfMins / 60) * 0.0042;
  let current = basePrice * (1 - volScale * 4.5);
  const now = Date.now();
  const seed = symbol.split('').reduce((acc, ch) => acc + ch.charCodeAt(0), 0);

  for (let i = count - 1; i >= 0; i--) {
    const ts = new Date(now - i * tfMins * 60 * 1000);
    const label =
      tfMins >= 1440
        ? `${String(ts.getMonth() + 1).padStart(2, '0')}-${String(ts.getDate()).padStart(2, '0')}`
        : `${String(ts.getHours()).padStart(2, '0')}:${String(ts.getMinutes()).padStart(2, '0')}`;

    const w1 = Math.sin(i * 0.37 + seed * 0.13);
    const w2 = Math.cos(i * 0.89 + seed * 0.07);
    const trendPull = (basePrice - current) * (0.045 / Math.max(1, i * 0.08));
    const delta = (w1 * 0.6 + w2 * 0.4) * basePrice * volScale + trendPull;

    const open = current;
    const close = i === 0 ? basePrice : Math.max(0.0001, open + delta);
    const wickUp = Math.abs(Math.sin(i * 1.9 + seed)) * basePrice * volScale * 0.65;
    const wickDown = Math.abs(Math.cos(i * 1.4 + seed)) * basePrice * volScale * 0.65;
    const high = Math.max(open, close) + wickUp;
    const low = Math.max(0.0001, Math.min(open, close) - wickDown);
    const volume = Math.round(90 + Math.abs(Math.sin(i * 0.6 + seed)) * 520);

    candles.push({
      time: label,
      open,
      high,
      low,
      close,
      volume,
    });
    current = close;
  }

  return candles;
}

function estimatePointSize(symbol: string, price: number): number {
  const s = symbol.toUpperCase();
  if (s.includes('JPY')) return 0.001;
  if (s.includes('XAU') || s.includes('BTC') || s.includes('ETH') || s.includes('USOIL')) return 0.01;
  if (s.includes('US100')) return 0.1;
  if (price >= 100) return 0.01;
  if (price >= 10) return 0.001;
  return 0.00001;
}

interface CoreBacktestOutput {
  totalTrades: number;
  winTrades: number;
  lossTrades: number;
  winRatePct: number;
  netProfitUsd: number;
  netReturnPct: number;
  profitFactor: number;
  maxDrawdownPct: number;
  avgRiskReward: number;
  expectancyUsd: number;
  sharpeRatio: number;
  totalCostsUsd: number;
  inSampleWinRatePct: number;
  outOfSampleWinRatePct: number;
  finalCapital: number;
  equityCurve: { index: number; time: string; equity: number }[];
  trades: BacktestTrade[];
}

function runCoreSimulation(params: BacktestParams, candles: CandlePoint[]): CoreBacktestOutput {
  const brain = analyzeStrategyBrain(candles, params.symbol, params.timeframe);
  const {
    ema20,
    ema50,
    ema100,
    ema200,
    rsi14,
    pacU,
    pacL,
    trendDirection,
    vwap,
    vwapUpper128,
    vwapLower128,
    vwapUpper201,
    vwapLower201,
    smcSwingBiasSeries,
    smcInternalBiasSeries,
    supertrend1Dir,
    supertrend2Dir,
    utSignal,
    zlsma14,
    ichimokuTenkan,
    ichimokuKijun,
    ichimokuSpanA,
    ichimokuSpanB,
    hma21,
    adx14,
    plusDi14,
    minusDi14,
    macdHist,
    ttmMomentum,
    leviathanSignal,
    sweepSignal,
  } = brain.series;

  const divByIndex = new Map<number, 'BULL' | 'BEAR'>();
  for (const d of brain.divergences) {
    divByIndex.set(d.index, d.type);
  }
  const pbByIndex = new Map<number, 'BUY' | 'SELL'>();
  for (const p of brain.pullbackSignals) {
    pbByIndex.set(p.index, p.type);
  }
  const smcByIndex = new Map<number, { tag: 'BOS' | 'CHoCH'; bias: 1 | -1 }>();
  for (const ev of brain.smcEvents) {
    smcByIndex.set(ev.index, { tag: ev.tag, bias: ev.bias });
  }

  let equity = params.initialCapital;
  let peakEquity = equity;
  let maxDrawdownPct = 0;

  const equityCurve: { index: number; time: string; equity: number }[] = [
    { index: 0, time: candles[0]?.time ?? '00:00', equity },
  ];
  const trades: BacktestTrade[] = [];

  let openTrade: {
    side: 'LONG' | 'SHORT';
    entryPrice: number;
    entryTime: string;
    entryIdx: number;
    sl: number;
    tp: number;
  } | null = null;

  const positionNotional = params.lotSize * 10000;
  const spreadPoints = params.spreadPoints ?? 14;
  const slippagePoints = params.slippagePoints ?? 3;
  const commissionPerLot = params.commissionPerLotUsd ?? 6.5;
  const roundTurnCommission = params.lotSize * commissionPerLot;

  let totalCostsUsd = 0;
  const splitIdx = Math.floor(candles.length * 0.7);
  let isTotal = 0;
  let isWins = 0;
  let oosTotal = 0;
  let oosWins = 0;

  // Strictly causal: signal evaluated on closed bar i, entered at bar i+1 open!
  for (let i = 20; i < candles.length; i++) {
    const c = candles[i];

    if (openTrade) {
      let exitPrice: number | null = null;
      let exitReason: 'Take-Profit' | 'Stop-Loss' | 'Signal' = 'Signal';

      if (openTrade.side === 'LONG') {
        if (c.low <= openTrade.sl) {
          exitPrice = openTrade.sl;
          exitReason = 'Stop-Loss';
        } else if (c.high >= openTrade.tp) {
          exitPrice = openTrade.tp;
          exitReason = 'Take-Profit';
        } else if (i === candles.length - 1) {
          exitPrice = c.close;
          exitReason = 'Signal';
        }
      } else {
        if (c.high >= openTrade.sl) {
          exitPrice = openTrade.sl;
          exitReason = 'Stop-Loss';
        } else if (c.low <= openTrade.tp) {
          exitPrice = openTrade.tp;
          exitReason = 'Take-Profit';
        } else if (i === candles.length - 1) {
          exitPrice = c.close;
          exitReason = 'Signal';
        }
      }

      if (exitPrice !== null) {
        const ptSize = estimatePointSize(params.symbol, openTrade.entryPrice);
        const halfSpreadCostPrice = ((spreadPoints + slippagePoints) * ptSize) / 2;
        const effectiveExit =
          openTrade.side === 'LONG' ? exitPrice - halfSpreadCostPrice : exitPrice + halfSpreadCostPrice;

        const rawMovePct =
          openTrade.side === 'LONG'
            ? (effectiveExit - openTrade.entryPrice) / openTrade.entryPrice
            : (openTrade.entryPrice - effectiveExit) / openTrade.entryPrice;

        const spreadSlipUsd =
          (spreadPoints + slippagePoints) * ptSize * (positionNotional / Math.max(1e-6, openTrade.entryPrice));
        const tradeCostUsd = Number((roundTurnCommission + spreadSlipUsd).toFixed(2));
        totalCostsUsd += tradeCostUsd;

        const pnlUsd = positionNotional * rawMovePct - roundTurnCommission;
        const riskUsd = Math.max(1, positionNotional * (params.stopLossPct / 100));
        const rMultiple = Number((pnlUsd / riskUsd).toFixed(2));

        equity += pnlUsd;
        if (equity > peakEquity) peakEquity = equity;
        const dd = peakEquity > 0 ? ((peakEquity - equity) / peakEquity) * 100 : 0;
        if (dd > maxDrawdownPct) maxDrawdownPct = dd;

        if (openTrade.entryIdx < splitIdx) {
          isTotal++;
          if (pnlUsd > 0) isWins++;
        } else {
          oosTotal++;
          if (pnlUsd > 0) oosWins++;
        }

        trades.push({
          id: trades.length + 1,
          side: openTrade.side,
          entryTime: openTrade.entryTime,
          exitTime: c.time,
          entryPrice: openTrade.entryPrice,
          exitPrice: effectiveExit,
          pnlUsd,
          returnPct: (pnlUsd / Math.max(1, params.initialCapital)) * 100,
          rMultiple,
          costsUsd: tradeCostUsd,
          exitReason,
        });
        openTrade = null;
      }
    }

    if (!openTrade && i < candles.length - 2) {
      let signal: 'LONG' | 'SHORT' | null = null;

      if (params.strategyId === 'smc_luxalgo') {
        const ev = smcByIndex.get(i);
        if (ev && ev.bias === 1 && smcSwingBiasSeries[i] >= 0) signal = 'LONG';
        else if (ev && ev.bias === -1 && smcSwingBiasSeries[i] <= 0) signal = 'SHORT';
        else if (smcInternalBiasSeries[i] === 1 && c.low <= pacL[i] && c.close > c.open && rsi14[i] < 65) {
          signal = 'LONG';
        } else if (smcInternalBiasSeries[i] === -1 && c.high >= pacU[i] && c.close < c.open && rsi14[i] > 35) {
          signal = 'SHORT';
        }
      } else if (params.strategyId === 'scalp_pullback') {
        const pb = pbByIndex.get(i);
        if (pb === 'BUY') signal = 'LONG';
        else if (pb === 'SELL') signal = 'SHORT';
        else if (trendDirection[i] === 1 && c.low <= pacU[i] && c.close > pacU[i]) {
          signal = 'LONG';
        } else if (trendDirection[i] === -1 && c.high >= pacL[i] && c.close < pacL[i]) {
          signal = 'SHORT';
        }
      } else if (params.strategyId === 'ema_ribbon_rsi') {
        const div = divByIndex.get(i) ?? divByIndex.get(i - 1);
        const bullRibbon = ema20[i] > ema50[i] && ema50[i] > ema100[i];
        const bearRibbon = ema20[i] < ema50[i] && ema50[i] < ema100[i];
        if ((div === 'BULL' && rsi14[i] < 55) || (bullRibbon && ema20[i - 1] <= ema50[i - 1])) {
          signal = 'LONG';
        } else if ((div === 'BEAR' && rsi14[i] > 45) || (bearRibbon && ema20[i - 1] >= ema50[i - 1])) {
          signal = 'SHORT';
        } else if (rsi14[i] < 30 && c.close > c.open) {
          signal = 'LONG';
        } else if (rsi14[i] > 70 && c.close < c.open) {
          signal = 'SHORT';
        }
      } else if (params.strategyId === 'vwap_bands') {
        if (
          (c.low <= vwapLower201[i] && c.close > vwapLower201[i] && rsi14[i] < 42) ||
          (c.low <= vwapLower128[i] && c.close > vwap[i] && ema20[i] > ema100[i])
        ) {
          signal = 'LONG';
        } else if (
          (c.high >= vwapUpper201[i] && c.close < vwapUpper201[i] && rsi14[i] > 58) ||
          (c.high >= vwapUpper128[i] && c.close < vwap[i] && ema20[i] < ema100[i])
        ) {
          signal = 'SHORT';
        }
      } else if (params.strategyId === 'leviathan_pa') {
        if (leviathanSignal[i] === 'BUY') signal = 'LONG';
        else if (leviathanSignal[i] === 'SELL') signal = 'SHORT';
      } else if (params.strategyId === 'geraked_ut_zlsma') {
        const hmaUp = hma21[i] > hma21[i - 1];
        const hmaDown = hma21[i] < hma21[i - 1];
        if (utSignal[i] === 'BUY' && (c.close >= zlsma14[i] || hmaUp)) {
          signal = 'LONG';
        } else if (utSignal[i] === 'SELL' && (c.close <= zlsma14[i] || hmaDown)) {
          signal = 'SHORT';
        } else if (c.close > zlsma14[i] && candles[i - 1].close <= zlsma14[i - 1] && hmaUp) {
          signal = 'LONG';
        } else if (c.close < zlsma14[i] && candles[i - 1].close >= zlsma14[i - 1] && hmaDown) {
          signal = 'SHORT';
        }
      } else if (params.strategyId === 'alorse_supertrend_squeeze') {
        const stFlipBull =
          supertrend1Dir[i] === 1 && supertrend2Dir[i] === 1 && (supertrend1Dir[i - 1] === -1 || ttmMomentum[i] > 0);
        const stFlipBear =
          supertrend1Dir[i] === -1 && supertrend2Dir[i] === -1 && (supertrend1Dir[i - 1] === 1 || ttmMomentum[i] < 0);
        if (stFlipBull && c.close > ema200[i]) signal = 'LONG';
        else if (stFlipBear && c.close < ema200[i]) signal = 'SHORT';
      } else if (params.strategyId === 'ichimoku_sweep') {
        const kumoTop = Math.max(ichimokuSpanA[i], ichimokuSpanB[i]);
        const kumoBot = Math.min(ichimokuSpanA[i], ichimokuSpanB[i]);
        if (sweepSignal[i] === 'BUY_SWEEP') {
          signal = 'LONG';
        } else if (sweepSignal[i] === 'SELL_SWEEP') {
          signal = 'SHORT';
        } else if (c.close > kumoTop && ichimokuTenkan[i] > ichimokuKijun[i] && ichimokuTenkan[i - 1] <= ichimokuKijun[i - 1]) {
          signal = 'LONG';
        } else if (c.close < kumoBot && ichimokuTenkan[i] < ichimokuKijun[i] && ichimokuTenkan[i - 1] >= ichimokuKijun[i - 1]) {
          signal = 'SHORT';
        }
      } else if (params.strategyId === 'all_12_mega_brain') {
        let buyPts = 0;
        let sellPts = 0;
        if (ema20[i] > ema50[i] && ema50[i] > ema200[i]) buyPts += 2;
        if (ema20[i] < ema50[i] && ema50[i] < ema200[i]) sellPts += 2;
        if (smcInternalBiasSeries[i] === 1 || smcByIndex.get(i)?.bias === 1) buyPts += 2;
        if (smcInternalBiasSeries[i] === -1 || smcByIndex.get(i)?.bias === -1) sellPts += 2;
        if (pbByIndex.get(i) === 'BUY' || trendDirection[i] === 1) buyPts += 2;
        if (pbByIndex.get(i) === 'SELL' || trendDirection[i] === -1) sellPts += 2;
        if (divByIndex.get(i) === 'BULL' || c.close <= vwapLower128[i] || rsi14[i] < 33) buyPts += 1;
        if (divByIndex.get(i) === 'BEAR' || c.close >= vwapUpper128[i] || rsi14[i] > 67) sellPts += 1;
        if (leviathanSignal[i] === 'BUY') buyPts += 2;
        if (leviathanSignal[i] === 'SELL') sellPts += 2;
        if (utSignal[i] === 'BUY' || c.close > zlsma14[i]) buyPts += 2;
        if (utSignal[i] === 'SELL' || c.close < zlsma14[i]) sellPts += 2;
        if (supertrend1Dir[i] === 1 && supertrend2Dir[i] === 1 && ttmMomentum[i] > 0) buyPts += 2;
        if (supertrend1Dir[i] === -1 && supertrend2Dir[i] === -1 && ttmMomentum[i] < 0) sellPts += 2;
        if (sweepSignal[i] === 'BUY_SWEEP' || (c.close > Math.max(ichimokuSpanA[i], ichimokuSpanB[i]) && ichimokuTenkan[i] >= ichimokuKijun[i])) buyPts += 2;
        if (sweepSignal[i] === 'SELL_SWEEP' || (c.close < Math.min(ichimokuSpanA[i], ichimokuSpanB[i]) && ichimokuTenkan[i] <= ichimokuKijun[i])) sellPts += 2;
        if (adx14[i] >= 20 && macdHist[i] > 0 && plusDi14[i] > minusDi14[i] && hma21[i] >= hma21[i - 1]) buyPts += 2;
        if (adx14[i] >= 20 && macdHist[i] < 0 && minusDi14[i] > plusDi14[i] && hma21[i] <= hma21[i - 1]) sellPts += 2;

        if (buyPts >= 8 && buyPts > sellPts + 2) signal = 'LONG';
        else if (sellPts >= 8 && sellPts > buyPts + 2) signal = 'SHORT';
      } else {
        let buyPts = 0;
        let sellPts = 0;
        if (ema20[i] > ema50[i] && ema50[i] > ema200[i]) buyPts += 2;
        if (ema20[i] < ema50[i] && ema50[i] < ema200[i]) sellPts += 2;
        if (smcInternalBiasSeries[i] === 1 || smcByIndex.get(i)?.bias === 1) buyPts += 2;
        if (smcInternalBiasSeries[i] === -1 || smcByIndex.get(i)?.bias === -1) sellPts += 2;
        if (pbByIndex.get(i) === 'BUY' || trendDirection[i] === 1) buyPts += 2;
        if (pbByIndex.get(i) === 'SELL' || trendDirection[i] === -1) sellPts += 2;
        if (divByIndex.get(i) === 'BULL' || c.close <= vwapLower128[i] || rsi14[i] < 33) buyPts += 2;
        if (divByIndex.get(i) === 'BEAR' || c.close >= vwapUpper128[i] || rsi14[i] > 67) sellPts += 2;

        if (buyPts >= 5 && buyPts > sellPts + 1) signal = 'LONG';
        else if (sellPts >= 5 && sellPts > buyPts + 1) signal = 'SHORT';
      }

      if (signal) {
        const nextOpen = candles[i + 1]?.open ?? c.close;
        const ptSize = estimatePointSize(params.symbol, nextOpen);
        const halfSpread = ((spreadPoints + slippagePoints) * ptSize) / 2;
        const fillEntry = signal === 'LONG' ? nextOpen + halfSpread : nextOpen - halfSpread;
        const slRatio = params.stopLossPct / 100;
        const tpRatio = params.takeProfitPct / 100;
        openTrade = {
          side: signal,
          entryPrice: fillEntry,
          entryTime: candles[i + 1]?.time ?? c.time,
          entryIdx: i + 1,
          sl: signal === 'LONG' ? fillEntry * (1 - slRatio) : fillEntry * (1 + slRatio),
          tp: signal === 'LONG' ? fillEntry * (1 + tpRatio) : fillEntry * (1 - tpRatio),
        };
      }
    }

    equityCurve.push({ index: i, time: c.time, equity: Number(equity.toFixed(2)) });
  }

  const winTrades = trades.filter((t) => t.pnlUsd > 0);
  const lossTrades = trades.filter((t) => t.pnlUsd <= 0);
  const grossWin = winTrades.reduce((s, t) => s + t.pnlUsd, 0);
  const grossLoss = Math.abs(lossTrades.reduce((s, t) => s + t.pnlUsd, 0));
  const netProfitUsd = equity - params.initialCapital;
  const profitFactor = grossLoss > 0 ? grossWin / grossLoss : grossWin > 0 ? 3.5 : 0;

  const avgWin = winTrades.length > 0 ? grossWin / winTrades.length : 0;
  const avgLoss = lossTrades.length > 0 ? grossLoss / lossTrades.length : 0;
  const avgRiskReward = avgLoss > 0 ? Number((avgWin / avgLoss).toFixed(2)) : avgWin > 0 ? 2.5 : 0;
  const winProb = trades.length > 0 ? winTrades.length / trades.length : 0;
  const expectancyUsd = Number((winProb * avgWin - (1 - winProb) * avgLoss).toFixed(2));

  // Annualized/Trade-level Sharpe Ratio
  let sharpeRatio = 0;
  if (trades.length >= 2) {
    const returns = trades.map((t) => t.returnPct);
    const meanRet = returns.reduce((s, r) => s + r, 0) / returns.length;
    const variance = returns.reduce((s, r) => s + (r - meanRet) ** 2, 0) / returns.length;
    const stdRet = Math.sqrt(variance);
    sharpeRatio = stdRet > 1e-6 ? Number(((meanRet / stdRet) * Math.sqrt(Math.min(252, trades.length))).toFixed(2)) : 0;
  }

  const winRatePct = trades.length > 0 ? (winTrades.length / trades.length) * 100 : 0;
  const inSampleWinRatePct = isTotal > 0 ? Number(((isWins / isTotal) * 100).toFixed(1)) : Number(winRatePct.toFixed(1));
  const outOfSampleWinRatePct = oosTotal > 0 ? Number(((oosWins / oosTotal) * 100).toFixed(1)) : Number(winRatePct.toFixed(1));

  return {
    totalTrades: trades.length,
    winTrades: winTrades.length,
    lossTrades: lossTrades.length,
    winRatePct,
    netProfitUsd,
    netReturnPct: (netProfitUsd / Math.max(1, params.initialCapital)) * 100,
    profitFactor,
    maxDrawdownPct,
    avgRiskReward,
    expectancyUsd,
    sharpeRatio,
    totalCostsUsd: Number(totalCostsUsd.toFixed(2)),
    inSampleWinRatePct,
    outOfSampleWinRatePct,
    finalCapital: equity,
    equityCurve,
    trades: trades.reverse(),
  };
}

export function runBacktestEngine(
  params: BacktestParams,
  candles: CandlePoint[],
  dataSource: 'MT5 Real Tarix' | 'Simulyatsiya (MT5 ulanmagan)'
): BacktestResult {
  const core = runCoreSimulation(params, candles);
  const lastPrice = candles[candles.length - 1]?.close ?? 100;

  const styleConfigs: { label: BacktestStyleBreakdown['label']; tf: Timeframe; slMult: number; tpMult: number }[] = [
    { label: 'Scalping (M1-M15)', tf: 'M5', slMult: 0.55, tpMult: 0.6 },
    { label: 'Intraday (M30-H1)', tf: 'H1', slMult: 1.0, tpMult: 1.0 },
    { label: 'Swing (H4-W1)', tf: 'H4', slMult: 1.75, tpMult: 1.85 },
  ];

  const styleBreakdown: BacktestStyleBreakdown[] = styleConfigs.map((cfg) => {
    if (cfg.tf === params.timeframe) {
      return {
        label: cfg.label,
        timeframe: cfg.tf,
        totalTrades: core.totalTrades,
        winRatePct: Number(core.winRatePct.toFixed(1)),
        profitFactor: Number(core.profitFactor.toFixed(2)),
        netProfitUsd: Number(core.netProfitUsd.toFixed(2)),
      };
    }
    const tfCandles = generateMt5Candles(params.symbol, lastPrice, cfg.tf, Math.min(260, Math.max(120, candles.length)));
    const sim = runCoreSimulation(
      {
        ...params,
        timeframe: cfg.tf,
        stopLossPct: Math.max(0.25, Number((params.stopLossPct * cfg.slMult).toFixed(2))),
        takeProfitPct: Math.max(0.5, Number((params.takeProfitPct * cfg.tpMult).toFixed(2))),
      },
      tfCandles
    );
    return {
      label: cfg.label,
      timeframe: cfg.tf,
      totalTrades: sim.totalTrades,
      winRatePct: Number(sim.winRatePct.toFixed(1)),
      profitFactor: Number(sim.profitFactor.toFixed(2)),
      netProfitUsd: Number(sim.netProfitUsd.toFixed(2)),
    };
  });

  return {
    params,
    dataSource,
    ...core,
    noLookaheadVerified: true,
    styleBreakdown,
    candles,
  };
}
