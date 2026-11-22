import {
  BacktestParams,
  BacktestResult,
  BacktestTrade,
  CandlePoint,
  Timeframe,
} from '../types/trading';
import { analyzeStrategyBrain } from './strategyBrain';

const TF_MINUTES: Record<Timeframe, number> = {
  M1: 1,
  M5: 5,
  M15: 15,
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

export function runBacktestEngine(
  params: BacktestParams,
  candles: CandlePoint[],
  dataSource: 'MT5 Real Tarix' | 'Simulyatsiya (MT5 ulanmagan)'
): BacktestResult {
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
    sl: number;
    tp: number;
  } | null = null;

  const positionNotional = params.lotSize * 10000;

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
        const movePct =
          openTrade.side === 'LONG'
            ? (exitPrice - openTrade.entryPrice) / openTrade.entryPrice
            : (openTrade.entryPrice - exitPrice) / openTrade.entryPrice;
        const pnlUsd = positionNotional * movePct;
        equity += pnlUsd;
        if (equity > peakEquity) peakEquity = equity;
        const dd = peakEquity > 0 ? ((peakEquity - equity) / peakEquity) * 100 : 0;
        if (dd > maxDrawdownPct) maxDrawdownPct = dd;

        trades.push({
          id: trades.length + 1,
          side: openTrade.side,
          entryTime: openTrade.entryTime,
          exitTime: c.time,
          entryPrice: openTrade.entryPrice,
          exitPrice,
          pnlUsd,
          returnPct: (pnlUsd / Math.max(1, params.initialCapital)) * 100,
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
        else if (
          smcInternalBiasSeries[i] === 1 &&
          c.low <= pacL[i] &&
          c.close > c.open &&
          rsi14[i] < 65
        ) {
          signal = 'LONG';
        } else if (
          smcInternalBiasSeries[i] === -1 &&
          c.high >= pacU[i] &&
          c.close < c.open &&
          rsi14[i] > 35
        ) {
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
        } else if (
          (div === 'BEAR' && rsi14[i] > 45) ||
          (bearRibbon && ema20[i - 1] >= ema50[i - 1])
        ) {
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
      } else {
        // all_6_confluence: combine EMA 20/50/100/200 + Glaz/Libertus RSI + LuxAlgo SMC + PAC 34 + VWAP
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
        const slRatio = params.stopLossPct / 100;
        const tpRatio = params.takeProfitPct / 100;
        openTrade = {
          side: signal,
          entryPrice: c.close,
          entryTime: c.time,
          sl: signal === 'LONG' ? c.close * (1 - slRatio) : c.close * (1 + slRatio),
          tp: signal === 'LONG' ? c.close * (1 + tpRatio) : c.close * (1 - tpRatio),
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

  return {
    params,
    dataSource,
    totalTrades: trades.length,
    winTrades: winTrades.length,
    lossTrades: lossTrades.length,
    winRatePct: trades.length > 0 ? (winTrades.length / trades.length) * 100 : 0,
    netProfitUsd,
    netReturnPct: (netProfitUsd / Math.max(1, params.initialCapital)) * 100,
    profitFactor,
    maxDrawdownPct,
    finalCapital: equity,
    equityCurve,
    trades: trades.reverse(),
    candles,
  };
}
