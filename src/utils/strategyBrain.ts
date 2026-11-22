import { CandlePoint, StrategyBrainSnapshot, Timeframe } from '../types/trading';

export interface OrderBlockItem {
  top: number;
  bottom: number;
  index: number;
  bias: 1 | -1;
  internal: boolean;
}

export interface FvgItem {
  top: number;
  bottom: number;
  index: number;
  bias: 1 | -1;
}

export interface SmcEvent {
  index: number;
  tag: 'BOS' | 'CHoCH';
  bias: 1 | -1;
  internal: boolean;
  price: number;
}

export interface DivergenceMarker {
  index: number;
  type: 'BULL' | 'BEAR';
  rsi: number;
  price: number;
}

export interface PullbackSignalMarker {
  index: number;
  type: 'BUY' | 'SELL';
  price: number;
}

export interface StrategyBrainAnalysis {
  snapshot: StrategyBrainSnapshot;
  series: {
    ema20: number[];
    ema50: number[];
    ema100: number[];
    ema200: number[];
    rsi14: number[];
    pacU: number[];
    pacL: number[];
    pacC: number[];
    fastEma89: number[];
    mediumEma200: number[];
    slowEma600: number[];
    trendDirection: (1 | -1 | 0)[];
    vwap: number[];
    vwapUpper128: number[];
    vwapLower128: number[];
    vwapUpper201: number[];
    vwapLower201: number[];
    vwapUpper251: number[];
    vwapLower251: number[];
    smcSwingBiasSeries: (1 | -1 | 0)[];
    smcInternalBiasSeries: (1 | -1 | 0)[];
  };
  divergences: DivergenceMarker[];
  pullbackSignals: PullbackSignalMarker[];
  smcEvents: SmcEvent[];
  activeOrderBlocks: OrderBlockItem[];
  activeFvgs: FvgItem[];
  trailingTop: number;
  trailingBottom: number;
}

export function calcEmaSeries(values: number[], period: number): number[] {
  if (values.length === 0) return [];
  const k = 2 / (period + 1);
  const out: number[] = new Array(values.length);
  let prev = values[0];
  out[0] = prev;
  for (let i = 1; i < values.length; i++) {
    prev = values[i] * k + prev * (1 - k);
    out[i] = prev;
  }
  return out;
}

// Pine Script RMA-based RSI (matching Glaz & Libertus scripts)
export function calcRsiRmaSeries(closes: number[], period = 14): number[] {
  const n = closes.length;
  const rsi = new Array<number>(n).fill(50);
  if (n <= period) return rsi;

  let avgGain = 0;
  let avgLoss = 0;
  for (let i = 1; i <= period; i++) {
    const ch = closes[i] - closes[i - 1];
    if (ch > 0) avgGain += ch;
    else avgLoss += -ch;
  }
  avgGain /= period;
  avgLoss /= period;

  const firstRs = avgLoss === 0 ? 100 : avgGain === 0 ? 0 : avgGain / avgLoss;
  rsi[period] = avgLoss === 0 ? 100 : avgGain === 0 ? 0 : 100 - 100 / (1 + firstRs);

  for (let i = period + 1; i < n; i++) {
    const ch = closes[i] - closes[i - 1];
    const gain = ch > 0 ? ch : 0;
    const loss = ch < 0 ? -ch : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
    if (avgLoss === 0) rsi[i] = 100;
    else if (avgGain === 0) rsi[i] = 0;
    else rsi[i] = 100 - 100 / (1 + avgGain / avgLoss);
  }
  return rsi;
}

function calcAtrSeries(candles: CandlePoint[], period = 200): number[] {
  const n = candles.length;
  const atr = new Array<number>(n).fill(0);
  if (n === 0) return atr;
  const trs = new Array<number>(n).fill(0);
  trs[0] = candles[0].high - candles[0].low;
  for (let i = 1; i < n; i++) {
    const c = candles[i];
    const prevClose = candles[i - 1].close;
    trs[i] = Math.max(
      c.high - c.low,
      Math.abs(c.high - prevClose),
      Math.abs(c.low - prevClose)
    );
  }
  let rma = trs[0];
  atr[0] = rma;
  const alpha = 1 / Math.min(period, Math.max(14, n));
  for (let i = 1; i < n; i++) {
    rma = alpha * trs[i] + (1 - alpha) * rma;
    atr[i] = rma;
  }
  return atr;
}

export function analyzeStrategyBrain(
  candles: CandlePoint[],
  symbol: string,
  timeframe: Timeframe
): StrategyBrainAnalysis {
  const n = candles.length;
  const closes = candles.map((c) => c.close);
  const highs = candles.map((c) => c.high);
  const lows = candles.map((c) => c.low);

  // 1. EMA 20 / 50 / 100 / 200 Ribbon
  const ema20 = calcEmaSeries(closes, 20);
  const ema50 = calcEmaSeries(closes, 50);
  const ema100 = calcEmaSeries(closes, 100);
  const ema200 = calcEmaSeries(closes, 200);

  // 2. Glaz RSI Chart Bars (14)
  const rsi14 = calcRsiRmaSeries(closes, 14);

  // 3. Libertus RSI Divergences v3.3 (lookback = 90)
  const xbars = 90;
  const divergences: DivergenceMarker[] = [];
  const maxPriceArr = new Array<number>(n).fill(closes[0] ?? 0);
  const maxRsiArr = new Array<number>(n).fill(50);
  const minPriceArr = new Array<number>(n).fill(closes[0] ?? 0);
  const minRsiArr = new Array<number>(n).fill(50);
  let lastPivotHigh = false;
  let lastPivotLow = false;

  for (let i = 0; i < n; i++) {
    const start = Math.max(0, i - xbars + 1);
    let maxIdx = i;
    let minIdx = i;
    for (let j = start; j <= i; j++) {
      if (rsi14[j] >= rsi14[maxIdx]) maxIdx = j;
      if (rsi14[j] <= rsi14[minIdx]) minIdx = j;
    }
    const hb = i - maxIdx;
    const lb = i - minIdx;

    let curMax = hb === 0 ? closes[i] : i > 0 ? maxPriceArr[i - 1] : closes[i];
    let curMaxRsi = hb === 0 ? rsi14[i] : i > 0 ? maxRsiArr[i - 1] : rsi14[i];
    let curMin = lb === 0 ? closes[i] : i > 0 ? minPriceArr[i - 1] : closes[i];
    let curMinRsi = lb === 0 ? rsi14[i] : i > 0 ? minRsiArr[i - 1] : rsi14[i];

    if (closes[i] > curMax) curMax = closes[i];
    if (rsi14[i] > curMaxRsi) curMaxRsi = rsi14[i];
    if (closes[i] < curMin) curMin = closes[i];
    if (rsi14[i] < curMinRsi) curMinRsi = rsi14[i];

    maxPriceArr[i] = curMax;
    maxRsiArr[i] = curMaxRsi;
    minPriceArr[i] = curMin;
    minRsiArr[i] = curMinRsi;

    if (i >= 3) {
      lastPivotHigh = maxRsiArr[i] === maxRsiArr[i - 2] && maxRsiArr[i - 2] !== maxRsiArr[i - 3];
      lastPivotLow = minRsiArr[i] === minRsiArr[i - 2] && minRsiArr[i - 2] !== minRsiArr[i - 3];
    }

    if (i >= 2) {
      const divBear =
        maxPriceArr[i - 1] > maxPriceArr[i - 2] &&
        rsi14[i - 1] < maxRsiArr[i] &&
        rsi14[i] <= rsi14[i - 1];
      const divBull =
        minPriceArr[i - 1] < minPriceArr[i - 2] &&
        rsi14[i - 1] > minRsiArr[i] &&
        rsi14[i] >= rsi14[i - 1];

      if (divBear) {
        divergences.push({ index: i - 1, type: 'BEAR', rsi: rsi14[i - 1], price: closes[i - 1] });
      }
      if (divBull) {
        divergences.push({ index: i - 1, type: 'BULL', rsi: rsi14[i - 1], price: closes[i - 1] });
      }
    }
  }

  // 4. Scalping PullBack Tool R1.1 by JustUncleL (Heikin Ashi + PAC EMA 34 + EMA 89/200/600 + Fractals)
  const haOpen = new Array<number>(n);
  const haClose = new Array<number>(n);
  const haHigh = new Array<number>(n);
  const haLow = new Array<number>(n);

  for (let i = 0; i < n; i++) {
    const c = candles[i];
    haClose[i] = (c.open + c.high + c.low + c.close) / 4;
    haOpen[i] = i === 0 ? (c.open + c.close) / 2 : (haOpen[i - 1] + haClose[i - 1]) / 2;
    haHigh[i] = Math.max(c.high, haOpen[i], haClose[i]);
    haLow[i] = Math.min(c.low, haOpen[i], haClose[i]);
  }

  const pacC = calcEmaSeries(haClose, 34);
  const pacL = calcEmaSeries(haLow, 34);
  const pacU = calcEmaSeries(haHigh, 34);
  const fastEma89 = calcEmaSeries(haClose, 89);
  const mediumEma200 = calcEmaSeries(haClose, 200);
  const slowEma600 = calcEmaSeries(haClose, 600);

  const trendDirection: (1 | -1 | 0)[] = new Array(n).fill(0);
  const pullbackSignals: PullbackSignalMarker[] = [];
  let tradeDirection: 1 | -1 | 0 = 0;
  let barsSinceBelowPacC = 99;
  let barsSinceAbovePacC = 99;

  // Fractals & HH/LH/HL/LL
  const topFractals: number[] = [];
  const botFractals: number[] = [];
  let latestFractal: 'HH' | 'LH' | 'HL' | 'LL' | 'YO‘Q' = 'YO‘Q';

  for (let i = 0; i < n; i++) {
    const td: 1 | -1 | 0 =
      fastEma89[i] > mediumEma200[i] && pacL[i] > mediumEma200[i]
        ? 1
        : fastEma89[i] < mediumEma200[i] && pacU[i] < mediumEma200[i]
          ? -1
          : 0;
    trendDirection[i] = td;

    if (haClose[i] < pacC[i]) barsSinceBelowPacC = 0;
    else barsSinceBelowPacC += 1;

    if (haClose[i] > pacC[i]) barsSinceAbovePacC = 0;
    else barsSinceAbovePacC += 1;

    const pacExitU = i > 0 && haOpen[i] < pacU[i] && haClose[i] > pacU[i] && barsSinceBelowPacC <= 3;
    const pacExitL = i > 0 && haOpen[i] > pacL[i] && haClose[i] < pacL[i] && barsSinceAbovePacC <= 3;

    const buyCond = td === 1 && pacExitU;
    const sellCond = td === -1 && pacExitL;

    const prevTradeDir = tradeDirection;
    if (tradeDirection === 1 && haClose[i] < pacC[i]) tradeDirection = 0;
    else if (tradeDirection === -1 && haClose[i] > pacC[i]) tradeDirection = 0;
    else if (tradeDirection === 0 && buyCond) tradeDirection = 1;
    else if (tradeDirection === 0 && sellCond) tradeDirection = -1;

    if (prevTradeDir === 0 && tradeDirection === 1) {
      pullbackSignals.push({ index: i, type: 'BUY', price: closes[i] });
    } else if (prevTradeDir === 0 && tradeDirection === -1) {
      pullbackSignals.push({ index: i, type: 'SELL', price: closes[i] });
    }

    if (i >= 4) {
      const isTopBW =
        highs[i - 4] < highs[i - 2] &&
        highs[i - 3] <= highs[i - 2] &&
        highs[i - 2] >= highs[i - 1] &&
        highs[i - 2] > highs[i];
      const isBotBW =
        lows[i - 4] > lows[i - 2] &&
        lows[i - 3] >= lows[i - 2] &&
        lows[i - 2] <= lows[i - 1] &&
        lows[i - 2] < lows[i];
      if (isTopBW) {
        const h0 = highs[i - 2];
        topFractals.push(h0);
        if (topFractals.length >= 3) {
          const h1 = topFractals[topFractals.length - 2];
          const h2 = topFractals[topFractals.length - 3];
          if (h1 < h0 && h2 < h0) latestFractal = 'HH';
          else if (h1 > h0 && h2 > h0) latestFractal = 'LH';
        }
      }
      if (isBotBW) {
        const l0 = lows[i - 2];
        botFractals.push(l0);
        if (botFractals.length >= 3) {
          const l1 = botFractals[botFractals.length - 2];
          const l2 = botFractals[botFractals.length - 3];
          if (l1 < l0 && l2 < l0) latestFractal = 'HL';
          else if (l1 > l0 && l2 > l0) latestFractal = 'LL';
        }
      }
    }
  }

  // 5. VWAP Stdev Bands v2 Mod
  const vwap = new Array<number>(n);
  const vwapUpper128 = new Array<number>(n);
  const vwapLower128 = new Array<number>(n);
  const vwapUpper201 = new Array<number>(n);
  const vwapLower201 = new Array<number>(n);
  const vwapUpper251 = new Array<number>(n);
  const vwapLower251 = new Array<number>(n);

  let vwapSum = 0;
  let volSum = 0;
  let v2Sum = 0;
  const sessionResetStep = timeframe === 'M1' || timeframe === 'M5' ? 48 : timeframe === 'M15' ? 32 : 96;

  for (let i = 0; i < n; i++) {
    const c = candles[i];
    const hl2 = (c.high + c.low) / 2;
    const vol = Math.max(1, c.volume);
    if (i % sessionResetStep === 0 && (timeframe === 'M1' || timeframe === 'M5' || timeframe === 'M15')) {
      vwapSum = hl2 * vol;
      volSum = vol;
      v2Sum = vol * hl2 * hl2;
    } else {
      vwapSum += hl2 * vol;
      volSum += vol;
      v2Sum += vol * hl2 * hl2;
    }
    const myVwap = vwapSum / volSum;
    const dev = Math.sqrt(Math.max(v2Sum / volSum - myVwap * myVwap, 0));
    vwap[i] = myVwap;
    vwapUpper128[i] = myVwap + 1.28 * dev;
    vwapLower128[i] = myVwap - 1.28 * dev;
    vwapUpper201[i] = myVwap + 2.01 * dev;
    vwapLower201[i] = myVwap - 2.01 * dev;
    vwapUpper251[i] = myVwap + 2.51 * dev;
    vwapLower251[i] = myVwap - 2.51 * dev;
  }

  // 6. Smart Money Concepts [LuxAlgo]
  const atr = calcAtrSeries(candles, 200);
  const parsedHighs = new Array<number>(n);
  const parsedLows = new Array<number>(n);
  for (let i = 0; i < n; i++) {
    const highVol = highs[i] - lows[i] >= 2 * atr[i];
    parsedHighs[i] = highVol ? lows[i] : highs[i];
    parsedLows[i] = highVol ? highs[i] : lows[i];
  }

  const swingLen = Math.max(10, Math.min(50, Math.floor(n / 4)));
  const internalLen = 5;

  let swingLeg = 0;
  let internalLeg = 0;
  let equalLeg = 0;

  let swingHighLevel: number | null = null;
  let swingHighIdx = 0;
  let swingHighCrossed = false;
  let swingLowLevel: number | null = null;
  let swingLowIdx = 0;
  let swingLowCrossed = false;

  let internalHighLevel: number | null = null;
  let internalHighIdx = 0;
  let internalHighCrossed = false;
  let internalLowLevel: number | null = null;
  let internalLowIdx = 0;
  let internalLowCrossed = false;

  let eqHighLevel: number | null = null;
  let eqLowLevel: number | null = null;
  let equalHighsDetected = false;
  let equalLowsDetected = false;

  let swingBias: 1 | -1 | 0 = 0;
  let internalBias: 1 | -1 | 0 = 0;
  const smcSwingBiasSeries: (1 | -1 | 0)[] = new Array(n).fill(0);
  const smcInternalBiasSeries: (1 | -1 | 0)[] = new Array(n).fill(0);
  const smcEvents: SmcEvent[] = [];
  let swingOrderBlocks: OrderBlockItem[] = [];
  let internalOrderBlocks: OrderBlockItem[] = [];
  let fvgs: FvgItem[] = [];

  let trailingTop = highs[0] ?? 0;
  let trailingBottom = lows[0] ?? 0;

  for (let i = 0; i < n; i++) {
    if (highs[i] > trailingTop) trailingTop = highs[i];
    if (lows[i] < trailingBottom) trailingBottom = lows[i];

    // Swing leg (size = swingLen)
    if (i >= swingLen) {
      let maxRecent = -Infinity;
      let minRecent = Infinity;
      for (let j = i - swingLen + 1; j <= i; j++) {
        if (highs[j] > maxRecent) maxRecent = highs[j];
        if (lows[j] < minRecent) minRecent = lows[j];
      }
      const prevLeg = swingLeg;
      if (highs[i - swingLen] > maxRecent) swingLeg = 0;
      else if (lows[i - swingLen] < minRecent) swingLeg = 1;

      if (swingLeg !== prevLeg) {
        if (swingLeg === 1) {
          swingLowLevel = lows[i - swingLen];
          swingLowIdx = i - swingLen;
          swingLowCrossed = false;
        } else {
          swingHighLevel = highs[i - swingLen];
          swingHighIdx = i - swingLen;
          swingHighCrossed = false;
        }
      }
    }

    // Internal leg (size = 5)
    if (i >= internalLen) {
      let maxRecent = -Infinity;
      let minRecent = Infinity;
      for (let j = i - internalLen + 1; j <= i; j++) {
        if (highs[j] > maxRecent) maxRecent = highs[j];
        if (lows[j] < minRecent) minRecent = lows[j];
      }
      const prevLeg = internalLeg;
      if (highs[i - internalLen] > maxRecent) internalLeg = 0;
      else if (lows[i - internalLen] < minRecent) internalLeg = 1;

      if (internalLeg !== prevLeg) {
        if (internalLeg === 1) {
          internalLowLevel = lows[i - internalLen];
          internalLowIdx = i - internalLen;
          internalLowCrossed = false;
        } else {
          internalHighLevel = highs[i - internalLen];
          internalHighIdx = i - internalLen;
          internalHighCrossed = false;
        }
      }
    }

    // Equal High / Low (size = 3)
    if (i >= 3) {
      let maxRecent = -Infinity;
      let minRecent = Infinity;
      for (let j = i - 2; j <= i; j++) {
        if (highs[j] > maxRecent) maxRecent = highs[j];
        if (lows[j] < minRecent) minRecent = lows[j];
      }
      const prevEqLeg = equalLeg;
      if (highs[i - 3] > maxRecent) equalLeg = 0;
      else if (lows[i - 3] < minRecent) equalLeg = 1;
      if (equalLeg !== prevEqLeg) {
        if (equalLeg === 1) {
          if (eqLowLevel !== null && Math.abs(eqLowLevel - lows[i - 3]) < 0.1 * atr[i]) {
            equalLowsDetected = true;
          }
          eqLowLevel = lows[i - 3];
        } else {
          if (eqHighLevel !== null && Math.abs(eqHighLevel - highs[i - 3]) < 0.1 * atr[i]) {
            equalHighsDetected = true;
          }
          eqHighLevel = highs[i - 3];
        }
      }
    }

    // Internal BOS / CHoCH + Order Block
    if (i > 0 && internalHighLevel !== null && !internalHighCrossed && closes[i] > internalHighLevel && closes[i - 1] <= internalHighLevel) {
      const tag: 'BOS' | 'CHoCH' = internalBias === -1 ? 'CHoCH' : 'BOS';
      internalHighCrossed = true;
      internalBias = 1;
      smcEvents.push({ index: i, tag, bias: 1, internal: true, price: internalHighLevel });
      let minIdx = internalHighIdx;
      for (let k = internalHighIdx; k < i; k++) {
        if (parsedLows[k] < parsedLows[minIdx]) minIdx = k;
      }
      internalOrderBlocks.unshift({
        top: parsedHighs[minIdx],
        bottom: parsedLows[minIdx],
        index: minIdx,
        bias: 1,
        internal: true,
      });
      if (internalOrderBlocks.length > 20) internalOrderBlocks.pop();
    }
    if (i > 0 && internalLowLevel !== null && !internalLowCrossed && closes[i] < internalLowLevel && closes[i - 1] >= internalLowLevel) {
      const tag: 'BOS' | 'CHoCH' = internalBias === 1 ? 'CHoCH' : 'BOS';
      internalLowCrossed = true;
      internalBias = -1;
      smcEvents.push({ index: i, tag, bias: -1, internal: true, price: internalLowLevel });
      let maxIdx = internalLowIdx;
      for (let k = internalLowIdx; k < i; k++) {
        if (parsedHighs[k] > parsedHighs[maxIdx]) maxIdx = k;
      }
      internalOrderBlocks.unshift({
        top: parsedHighs[maxIdx],
        bottom: parsedLows[maxIdx],
        index: maxIdx,
        bias: -1,
        internal: true,
      });
      if (internalOrderBlocks.length > 20) internalOrderBlocks.pop();
    }

    // Swing BOS / CHoCH + Order Block
    if (i > 0 && swingHighLevel !== null && !swingHighCrossed && closes[i] > swingHighLevel && closes[i - 1] <= swingHighLevel) {
      const tag: 'BOS' | 'CHoCH' = swingBias === -1 ? 'CHoCH' : 'BOS';
      swingHighCrossed = true;
      swingBias = 1;
      smcEvents.push({ index: i, tag, bias: 1, internal: false, price: swingHighLevel });
      let minIdx = swingHighIdx;
      for (let k = swingHighIdx; k < i; k++) {
        if (parsedLows[k] < parsedLows[minIdx]) minIdx = k;
      }
      swingOrderBlocks.unshift({
        top: parsedHighs[minIdx],
        bottom: parsedLows[minIdx],
        index: minIdx,
        bias: 1,
        internal: false,
      });
      if (swingOrderBlocks.length > 20) swingOrderBlocks.pop();
    }
    if (i > 0 && swingLowLevel !== null && !swingLowCrossed && closes[i] < swingLowLevel && closes[i - 1] >= swingLowLevel) {
      const tag: 'BOS' | 'CHoCH' = swingBias === 1 ? 'CHoCH' : 'BOS';
      swingLowCrossed = true;
      swingBias = -1;
      smcEvents.push({ index: i, tag, bias: -1, internal: false, price: swingLowLevel });
      let maxIdx = swingLowIdx;
      for (let k = swingLowIdx; k < i; k++) {
        if (parsedHighs[k] > parsedHighs[maxIdx]) maxIdx = k;
      }
      swingOrderBlocks.unshift({
        top: parsedHighs[maxIdx],
        bottom: parsedLows[maxIdx],
        index: maxIdx,
        bias: -1,
        internal: false,
      });
      if (swingOrderBlocks.length > 20) swingOrderBlocks.pop();
    }

    // Mitigate Order Blocks
    internalOrderBlocks = internalOrderBlocks.filter(
      (ob) => !((ob.bias === -1 && highs[i] > ob.top) || (ob.bias === 1 && lows[i] < ob.bottom))
    );
    swingOrderBlocks = swingOrderBlocks.filter(
      (ob) => !((ob.bias === -1 && highs[i] > ob.top) || (ob.bias === 1 && lows[i] < ob.bottom))
    );

    // Fair Value Gaps (FVG) + mitigation
    fvgs = fvgs.filter(
      (gap) => !((gap.bias === 1 && lows[i] < gap.bottom) || (gap.bias === -1 && highs[i] > gap.top))
    );
    if (i >= 2) {
      const bullFvg = lows[i] > highs[i - 2] && closes[i - 1] > highs[i - 2];
      const bearFvg = highs[i] < lows[i - 2] && closes[i - 1] < lows[i - 2];
      if (bullFvg) fvgs.unshift({ top: lows[i], bottom: highs[i - 2], index: i - 1, bias: 1 });
      if (bearFvg) fvgs.unshift({ top: lows[i - 2], bottom: highs[i], index: i - 1, bias: -1 });
      if (fvgs.length > 12) fvgs.length = 12;
    }

    smcSwingBiasSeries[i] = swingBias;
    smcInternalBiasSeries[i] = internalBias;
  }

  const lastIdx = Math.max(0, n - 1);
  const lastPrice = closes[lastIdx] ?? 0;
  const e20 = ema20[lastIdx] ?? lastPrice;
  const e50 = ema50[lastIdx] ?? lastPrice;
  const e100 = ema100[lastIdx] ?? lastPrice;
  const e200 = ema200[lastIdx] ?? lastPrice;

  const alignment: StrategyBrainSnapshot['emaRibbon']['alignment'] =
    e20 > e50 && e50 > e100 && e100 > e200
      ? 'Buqa Fan (20>50>100>200)'
      : e20 < e50 && e50 < e100 && e100 < e200
        ? 'Ayiq Fan (20<50<100<200)'
        : 'Aralash';

  const lastRsi = rsi14[lastIdx] ?? 50;
  const rsiZone: StrategyBrainSnapshot['rsiBars']['zone'] =
    lastRsi > 70 ? 'Overbought (>70)' : lastRsi < 30 ? 'Oversold (<30)' : 'Neytral (30-70)';

  const lastDiv = divergences.length > 0 ? divergences[divergences.length - 1] : null;
  const divBarsAgo = lastDiv ? lastIdx - lastDiv.index : null;

  const rangeSpan = Math.max(1e-9, trailingTop - trailingBottom);
  const zonePct = ((lastPrice - trailingBottom) / rangeSpan) * 100;
  const smcZone: 'Premium' | 'Equilibrium' | 'Discount' =
    zonePct > 52.5 ? 'Premium' : zonePct < 47.5 ? 'Discount' : 'Equilibrium';

  const activeOrderBlocks = [...internalOrderBlocks.slice(0, 4), ...swingOrderBlocks.slice(0, 4)];
  const bullObs = activeOrderBlocks.filter((o) => o.bias === 1);
  const bearObs = activeOrderBlocks.filter((o) => o.bias === -1);
  const lastSmcEvent = smcEvents.length > 0 ? smcEvents[smcEvents.length - 1] : null;
  const lastStructureTag = lastSmcEvent
    ? `${lastSmcEvent.internal ? 'Ichki' : 'Swing'} ${lastSmcEvent.bias === 1 ? 'Bullish' : 'Bearish'} ${lastSmcEvent.tag}`
    : 'Kuzatilmoqda';

  const lastPacU = pacU[lastIdx] ?? lastPrice;
  const lastPacL = pacL[lastIdx] ?? lastPrice;
  const lastPacC = pacC[lastIdx] ?? lastPrice;
  const lastHaClose = haClose[lastIdx] ?? lastPrice;
  const barLocation: StrategyBrainSnapshot['scalpingPullback']['barLocation'] =
    lastHaClose > lastPacU
      ? 'PAC Yuqorisida'
      : lastHaClose < lastPacL
        ? 'PAC Pastida'
        : 'PAC Ichida';

  const lastTd = trendDirection[lastIdx] ?? 0;
  const recentPb = pullbackSignals.length > 0 ? pullbackSignals[pullbackSignals.length - 1] : null;
  const pbActive = recentPb && lastIdx - recentPb.index <= 4 ? recentPb.type : 'KUTISH';

  const vwapLast = vwap[lastIdx] ?? lastPrice;
  const u128 = vwapUpper128[lastIdx] ?? lastPrice;
  const l128 = vwapLower128[lastIdx] ?? lastPrice;
  const u201 = vwapUpper201[lastIdx] ?? lastPrice;
  const l201 = vwapLower201[lastIdx] ?? lastPrice;
  const u251 = vwapUpper251[lastIdx] ?? lastPrice;
  const l251 = vwapLower251[lastIdx] ?? lastPrice;

  let vwapZone = 'Muvozanat (-1.28σ..+1.28σ)';
  if (lastPrice >= u201) vwapZone = 'Keskin Overbought (> +2.01σ)';
  else if (lastPrice >= u128) vwapZone = 'Yuqori Zona (+1.28σ..+2.01σ)';
  else if (lastPrice <= l201) vwapZone = 'Keskin Oversold (< -2.01σ)';
  else if (lastPrice <= l128) vwapZone = 'Pastki Zona (-1.28σ..-2.01σ)';

  // Multi-strategy Confluence Scoring for Scalping & Long-Term
  let scalpBuyPts = 0;
  let scalpSellPts = 0;
  const reasons: string[] = [];

  if (lastTd === 1) {
    scalpBuyPts += 28;
    reasons.push('PAC34 & EMA89>200 ko‘tarilishda');
  } else if (lastTd === -1) {
    scalpSellPts += 28;
    reasons.push('PAC34 & EMA89<200 pasayishda');
  }
  if (pbActive === 'BUY') {
    scalpBuyPts += 32;
    reasons.push('PullBack Tool BUY signali faol');
  } else if (pbActive === 'SELL') {
    scalpSellPts += 32;
    reasons.push('PullBack Tool SELL signali faol');
  }
  if (lastPrice <= l128 || lastRsi < 35) {
    scalpBuyPts += 20;
    reasons.push('VWAP/RSI pastki zona (arzon kirish)');
  } else if (lastPrice >= u128 || lastRsi > 65) {
    scalpSellPts += 20;
    reasons.push('VWAP/RSI yuqori zona (qimmat zona)');
  }
  if (internalBias === 1) scalpBuyPts += 20;
  else if (internalBias === -1) scalpSellPts += 20;

  let ltBuyPts = 0;
  let ltSellPts = 0;
  if (alignment === 'Buqa Fan (20>50>100>200)' || lastPrice > e200) {
    ltBuyPts += 30;
    reasons.push(`EMA Ribbon: ${alignment}`);
  }
  if (alignment === 'Ayiq Fan (20<50<100<200)' || lastPrice < e200) {
    ltSellPts += 30;
  }
  if (swingBias === 1) {
    ltBuyPts += 25;
    reasons.push(`SMC Swing: ${lastStructureTag}`);
  } else if (swingBias === -1) {
    ltSellPts += 25;
    reasons.push(`SMC Swing: ${lastStructureTag}`);
  }
  if (smcZone === 'Discount') {
    ltBuyPts += 20;
    reasons.push(`SMC Discount zonasi (${zonePct.toFixed(0)}%)`);
  } else if (smcZone === 'Premium') {
    ltSellPts += 20;
    reasons.push(`SMC Premium zonasi (${zonePct.toFixed(0)}%)`);
  }
  if (lastDiv && divBarsAgo !== null && divBarsAgo <= 18) {
    if (lastDiv.type === 'BULL') {
      ltBuyPts += 25;
      reasons.push(`RSI BULL divergensiya (${divBarsAgo} sham oldin)`);
    } else {
      ltSellPts += 25;
      reasons.push(`RSI BEAR divergensiya (${divBarsAgo} sham oldin)`);
    }
  }

  const scalpingAction: 'BUY' | 'SELL' | 'KUTISH' =
    scalpBuyPts >= 55 && scalpBuyPts > scalpSellPts + 12
      ? 'BUY'
      : scalpSellPts >= 55 && scalpSellPts > scalpBuyPts + 12
        ? 'SELL'
        : 'KUTISH';
  const longTermAction: 'BUY' | 'SELL' | 'KUTISH' =
    ltBuyPts >= 55 && ltBuyPts > ltSellPts + 12
      ? 'BUY'
      : ltSellPts >= 55 && ltSellPts > ltBuyPts + 12
        ? 'SELL'
        : 'KUTISH';

  const snapshot: StrategyBrainSnapshot = {
    symbol,
    timeframe,
    lastPrice,
    emaRibbon: {
      ema20: e20,
      ema50: e50,
      ema100: e100,
      ema200: e200,
      alignment,
    },
    rsiBars: {
      rsi14: lastRsi,
      zone: rsiZone,
    },
    rsiDivergence: {
      latestType: lastDiv ? lastDiv.type : 'YO‘Q',
      barsAgo: divBarsAgo,
      pivotHigh: lastPivotHigh,
      pivotLow: lastPivotLow,
    },
    smc: {
      swingBias: swingBias === 1 ? 'BULLISH' : swingBias === -1 ? 'BEARISH' : 'NEUTRAL',
      internalBias: internalBias === 1 ? 'BULLISH' : internalBias === -1 ? 'BEARISH' : 'NEUTRAL',
      lastStructureTag,
      zone: smcZone,
      zonePct,
      activeBullishObCount: bullObs.length,
      activeBearishObCount: bearObs.length,
      activeFvgCount: fvgs.length,
      equalHighsDetected,
      equalLowsDetected,
      nearestBullOb: bullObs[0] ? { top: bullObs[0].top, bottom: bullObs[0].bottom } : null,
      nearestBearOb: bearObs[0] ? { top: bearObs[0].top, bottom: bearObs[0].bottom } : null,
    },
    scalpingPullback: {
      pacUpper: lastPacU,
      pacLower: lastPacL,
      pacCenter: lastPacC,
      fastEma89: fastEma89[lastIdx] ?? lastPrice,
      mediumEma200: mediumEma200[lastIdx] ?? lastPrice,
      slowEma600: slowEma600[lastIdx] ?? lastPrice,
      trendDirection: lastTd,
      barLocation,
      signal: pbActive,
      latestFractal,
    },
    vwapBands: {
      vwap: vwapLast,
      upper128: u128,
      lower128: l128,
      upper201: u201,
      lower201: l201,
      upper251: u251,
      lower251: l251,
      zone: vwapZone,
    },
    verdict: {
      scalpingAction,
      scalpingScore: Math.max(scalpBuyPts, scalpSellPts),
      longTermAction,
      longTermScore: Math.max(ltBuyPts, ltSellPts),
      reasons: reasons.slice(0, 5),
    },
  };

  return {
    snapshot,
    series: {
      ema20,
      ema50,
      ema100,
      ema200,
      rsi14,
      pacU,
      pacL,
      pacC,
      fastEma89,
      mediumEma200,
      slowEma600,
      trendDirection,
      vwap,
      vwapUpper128,
      vwapLower128,
      vwapUpper201,
      vwapLower201,
      vwapUpper251,
      vwapLower251,
      smcSwingBiasSeries,
      smcInternalBiasSeries,
    },
    divergences,
    pullbackSignals,
    smcEvents,
    activeOrderBlocks,
    activeFvgs: fvgs,
    trailingTop,
    trailingBottom,
  };
}
