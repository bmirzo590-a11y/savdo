import { CandlePoint, FibonacciLevels, TechnicalIndicatorsReport } from '../types/trading';

export interface BrainSeriesInput {
  ema20: number[];
  ema50: number[];
  ema100: number[];
  ema200: number[];
  rsi14: number[];
  vwap: number[];
  vwapUpper201: number[];
  vwapLower201: number[];
  supertrend1: number[];
  supertrend1Dir: (1 | -1)[];
  ichimokuTenkan: number[];
  ichimokuKijun: number[];
  ichimokuSpanA: number[];
  ichimokuSpanB: number[];
  hma21: number[];
  adx14: number[];
  plusDi14: number[];
  minusDi14: number[];
  macdHist: number[];
  stochK: number[];
  ttmMomentum: number[];
  ttmSqueezeOn: boolean[];
}

function calcEma(values: number[], period: number): number[] {
  if (values.length === 0) return [];
  const k = 2 / (period + 1);
  const out = new Array<number>(values.length);
  out[0] = values[0];
  for (let i = 1; i < values.length; i++) {
    out[i] = values[i] * k + out[i - 1] * (1 - k);
  }
  return out;
}

function calcSma(values: number[], period: number): number[] {
  const out = new Array<number>(values.length);
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (i >= period) sum -= values[i - period];
    out[i] = sum / Math.min(i + 1, period);
  }
  return out;
}

function calcAtr14(candles: CandlePoint[]): number {
  const n = candles.length;
  if (n === 0) return 0;
  let rma = candles[0].high - candles[0].low;
  const period = 14;
  for (let i = 1; i < n; i++) {
    const prev = candles[i - 1].close;
    const tr = Math.max(
      candles[i].high - candles[i].low,
      Math.abs(candles[i].high - prev),
      Math.abs(candles[i].low - prev)
    );
    rma = ((period - 1) * rma + tr) / period;
  }
  return rma;
}

function calcParabolicSar(candles: CandlePoint[], step = 0.02, maxStep = 0.2): { psar: number; bias: 'BULLISH' | 'BEARISH' } {
  const n = candles.length;
  if (n < 2) return { psar: candles[0]?.close ?? 0, bias: 'BULLISH' };

  let isUp = candles[1].close >= candles[0].close;
  let af = step;
  let ep = isUp ? candles[1].high : candles[1].low;
  let sar = isUp ? candles[0].low : candles[0].high;

  for (let i = 2; i < n; i++) {
    sar = sar + af * (ep - sar);
    if (isUp) {
      sar = Math.min(sar, candles[i - 1].low, candles[i - 2].low);
      if (candles[i].low < sar) {
        isUp = false;
        sar = ep;
        ep = candles[i].low;
        af = step;
      } else if (candles[i].high > ep) {
        ep = candles[i].high;
        af = Math.min(maxStep, af + step);
      }
    } else {
      sar = Math.max(sar, candles[i - 1].high, candles[i - 2].high);
      if (candles[i].high > sar) {
        isUp = true;
        sar = ep;
        ep = candles[i].high;
        af = step;
      } else if (candles[i].low < ep) {
        ep = candles[i].low;
        af = Math.min(maxStep, af + step);
      }
    }
  }
  return { psar: sar, bias: isUp ? 'BULLISH' : 'BEARISH' };
}

function calcCci20(candles: CandlePoint[]): number {
  const n = candles.length;
  if (n === 0) return 0;
  const start = Math.max(0, n - 20);
  const tps: number[] = [];
  for (let i = start; i < n; i++) {
    tps.push((candles[i].high + candles[i].low + candles[i].close) / 3);
  }
  const mean = tps.reduce((s, v) => s + v, 0) / tps.length;
  const meanDev = tps.reduce((s, v) => s + Math.abs(v - mean), 0) / tps.length;
  if (meanDev <= 1e-9) return 0;
  return (tps[tps.length - 1] - mean) / (0.015 * meanDev);
}

function calcAutoFibonacci(candles: CandlePoint[]): FibonacciLevels {
  const n = candles.length;
  const lookback = Math.min(n, 60);
  const slice = candles.slice(n - lookback);
  let hi = -Infinity;
  let lo = Infinity;
  let hiIdx = 0;
  let loIdx = 0;
  slice.forEach((c, idx) => {
    if (c.high > hi) {
      hi = c.high;
      hiIdx = idx;
    }
    if (c.low < lo) {
      lo = c.low;
      loIdx = idx;
    }
  });
  const span = Math.max(1e-9, hi - lo);
  const direction: 'UP' | 'DOWN' = hiIdx >= loIdx ? 'UP' : 'DOWN';
  const lastClose = candles[n - 1]?.close ?? hi;

  const fib236 = direction === 'UP' ? hi - span * 0.236 : lo + span * 0.236;
  const fib382 = direction === 'UP' ? hi - span * 0.382 : lo + span * 0.382;
  const fib500 = direction === 'UP' ? hi - span * 0.5 : lo + span * 0.5;
  const fib618 = direction === 'UP' ? hi - span * 0.618 : lo + span * 0.618;
  const fib786 = direction === 'UP' ? hi - span * 0.786 : lo + span * 0.786;
  const ext1272 = direction === 'UP' ? hi + span * 0.272 : lo - span * 0.272;
  const ext1618 = direction === 'UP' ? hi + span * 0.618 : lo - span * 0.618;

  const retracementPct =
    direction === 'UP' ? ((hi - lastClose) / span) * 100 : ((lastClose - lo) / span) * 100;
  let currentZone = 'Impuls / Breakout hududi';
  if (retracementPct >= 61.8) currentZone = 'Oltin cho‘ntak (61.8%–78.6% Fib)';
  else if (retracementPct >= 38.2) currentZone = 'O‘rta korreksiya (38.2%–61.8% Fib)';
  else if (retracementPct >= 15) currentZone = 'Sayoz korreksiya (23.6%–38.2% Fib)';

  return {
    swingHigh: hi,
    swingLow: lo,
    direction,
    fib236,
    fib382,
    fib500,
    fib618,
    fib786,
    ext1272,
    ext1618,
    currentZone,
  };
}

export function computeTechnicalIndicators(
  candles: CandlePoint[],
  series: BrainSeriesInput
): TechnicalIndicatorsReport {
  const n = candles.length;
  const lastIdx = Math.max(0, n - 1);
  const closes = candles.map((c) => c.close);
  const lastClose = closes[lastIdx] ?? 0;

  const ema9Series = calcEma(closes, 9);
  const sma20Series = calcSma(closes, 20);
  const ema12 = calcEma(closes, 12);
  const ema26 = calcEma(closes, 26);
  const macdSeries = ema12.map((v, i) => v - ema26[i]);
  const macdSigSeries = calcEma(macdSeries, 9);

  // Stochastic %D = 3-period SMA of %K
  const stochDLast =
    series.stochK.length >= 3
      ? (series.stochK[lastIdx] + series.stochK[lastIdx - 1] + series.stochK[lastIdx - 2]) / 3
      : series.stochK[lastIdx] ?? 50;

  // Bollinger Bands (20, 2)
  const bbStart = Math.max(0, n - 20);
  const bbMid = sma20Series[lastIdx] ?? lastClose;
  let varSum = 0;
  const bbLen = Math.max(1, n - bbStart);
  for (let i = bbStart; i < n; i++) {
    const d = closes[i] - bbMid;
    varSum += d * d;
  }
  const std20 = Math.sqrt(varSum / bbLen);
  const bbUpper = bbMid + 2 * std20;
  const bbLower = bbMid - 2 * std20;
  const bbWidthPct = bbMid > 0 ? ((bbUpper - bbLower) / bbMid) * 100 : 0;

  // ATR(14)
  const atr14 = calcAtr14(candles);
  const atrPct = lastClose > 0 ? (atr14 / lastClose) * 100 : 0;

  // OBV + Trend
  let obv = 0;
  const obvSeries: number[] = [0];
  for (let i = 1; i < n; i++) {
    if (closes[i] > closes[i - 1]) obv += candles[i].volume;
    else if (closes[i] < closes[i - 1]) obv -= candles[i].volume;
    obvSeries.push(obv);
  }
  const obvPrev = obvSeries[Math.max(0, obvSeries.length - 6)] ?? 0;
  const obvTrend: 'OSHISH' | 'PASAYISH' | 'YONLAMA' =
    obv > obvPrev * 1.02 ? 'OSHISH' : obv < obvPrev * 0.98 ? 'PASAYISH' : 'YONLAMA';

  const curVol = candles[lastIdx]?.volume ?? 0;
  const volStart = Math.max(0, lastIdx - 20);
  let volSum = 0;
  let volCount = 0;
  for (let i = volStart; i < lastIdx; i++) {
    volSum += candles[i].volume;
    volCount++;
  }
  const avgVol20 = volCount > 0 ? Math.max(1, volSum / volCount) : Math.max(1, curVol);

  const psarRes = calcParabolicSar(candles);
  const cci20 = calcCci20(candles);
  const fibonacci = calcAutoFibonacci(candles);

  const spanA = series.ichimokuSpanA[lastIdx] ?? lastClose;
  const spanB = series.ichimokuSpanB[lastIdx] ?? lastClose;
  const kumoTop = Math.max(spanA, spanB);
  const kumoBot = Math.min(spanA, spanB);
  const ichimokuKumo: 'BULL_KUMO' | 'BEAR_KUMO' | 'KUMO_ICHIDA' =
    lastClose > kumoTop ? 'BULL_KUMO' : lastClose < kumoBot ? 'BEAR_KUMO' : 'KUMO_ICHIDA';

  return {
    trend: {
      ema9: ema9Series[lastIdx] ?? lastClose,
      ema20: series.ema20[lastIdx] ?? lastClose,
      ema50: series.ema50[lastIdx] ?? lastClose,
      ema100: series.ema100[lastIdx] ?? lastClose,
      ema200: series.ema200[lastIdx] ?? lastClose,
      sma20: bbMid,
      hma21: series.hma21[lastIdx] ?? lastClose,
      supertrendDir: series.supertrend1Dir[lastIdx] ?? 1,
      supertrendLevel: series.supertrend1[lastIdx] ?? lastClose,
      psar: psarRes.psar,
      psarBias: psarRes.bias,
      ichimokuTenkan: series.ichimokuTenkan[lastIdx] ?? lastClose,
      ichimokuKijun: series.ichimokuKijun[lastIdx] ?? lastClose,
      ichimokuKumo,
      adx14: series.adx14[lastIdx] ?? 20,
      plusDi: series.plusDi14[lastIdx] ?? 20,
      minusDi: series.minusDi14[lastIdx] ?? 20,
    },
    momentum: {
      rsi14: series.rsi14[lastIdx] ?? 50,
      macdLine: macdSeries[lastIdx] ?? 0,
      macdSignal: macdSigSeries[lastIdx] ?? 0,
      macdHist: series.macdHist[lastIdx] ?? 0,
      stochK: series.stochK[lastIdx] ?? 50,
      stochD: stochDLast,
      cci20,
      ttmSqueezeOn: Boolean(series.ttmSqueezeOn[lastIdx]),
      ttmMomentum: series.ttmMomentum[lastIdx] ?? 0,
    },
    volatility: {
      atr14,
      atrPct,
      bbUpper,
      bbMiddle: bbMid,
      bbLower,
      bbWidthPct,
      vwap: series.vwap[lastIdx] ?? lastClose,
      vwapUpper201: series.vwapUpper201[lastIdx] ?? lastClose,
      vwapLower201: series.vwapLower201[lastIdx] ?? lastClose,
    },
    volume: {
      currentVolume: curVol,
      avgVolume20: avgVol20,
      volumeRatio: avgVol20 > 0 ? curVol / avgVol20 : 1,
      obv,
      obvTrend,
    },
    fibonacci,
    deduplicationNotes: [
      'Trend guruhi: EMA(9/20/50/100/200), HMA(21), Supertrend va Ichimoku Kumo bitta Trend alignment o‘qida birlashtirildi (takroriy vazn berilmaydi).',
      'Oscillator guruhi: RSI(14), Stochastic(14,3,3) va CCI(20) bitta Overbought/Oversold momentum bloki sifatida hisoblanadi.',
      'Volatillik guruhi: ATR(14), Bollinger Bands(20,2) va VWAP ±σ dinamik Stop-Loss hamda siqilish filtriga ajratildi.',
    ],
  };
}
