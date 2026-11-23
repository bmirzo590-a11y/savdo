import {
  CandleDirection,
  CandleGeometry,
  CandlePoint,
  CandlestickCategory,
  CandlestickIntelligenceReport,
  DetectedCandlestickPattern,
  PatternConfirmationStatus,
} from '../types/trading';

export function computeCandleGeometry(c: CandlePoint, index: number): CandleGeometry {
  const bodySize = Math.abs(c.close - c.open);
  const upperWick = Math.max(0, c.high - Math.max(c.open, c.close));
  const lowerWick = Math.max(0, Math.min(c.open, c.close) - c.low);
  const candleRange = Math.max(1e-9, c.high - c.low);
  const bodyRatio = bodySize / candleRange;
  const direction: CandleDirection =
    bodyRatio < 0.08
      ? 'NEUTRAL'
      : c.close > c.open
        ? 'BULLISH'
        : c.close < c.open
          ? 'BEARISH'
          : 'NEUTRAL';

  return {
    index,
    time: c.time,
    open: c.open,
    high: c.high,
    low: c.low,
    close: c.close,
    bodySize,
    upperWick,
    lowerWick,
    candleRange,
    bodyRatio,
    direction,
  };
}

function avgBody(geoms: CandleGeometry[], idx: number, lookback = 10): number {
  const start = Math.max(0, idx - lookback);
  let sum = 0;
  let count = 0;
  for (let i = start; i < idx; i++) {
    sum += geoms[i].bodySize;
    count++;
  }
  return count > 0 ? Math.max(1e-9, sum / count) : Math.max(1e-9, geoms[idx]?.candleRange * 0.4 || 1e-6);
}

function avgRange(geoms: CandleGeometry[], idx: number, lookback = 10): number {
  const start = Math.max(0, idx - lookback);
  let sum = 0;
  let count = 0;
  for (let i = start; i < idx; i++) {
    sum += geoms[i].candleRange;
    count++;
  }
  return count > 0 ? Math.max(1e-9, sum / count) : Math.max(1e-9, geoms[idx]?.candleRange || 1e-6);
}

function avgVolume(candles: CandlePoint[], idx: number, lookback = 20): number {
  const start = Math.max(0, idx - lookback);
  let sum = 0;
  let count = 0;
  for (let i = start; i < idx; i++) {
    sum += candles[i].volume;
    count++;
  }
  return count > 0 ? Math.max(1, sum / count) : Math.max(1, candles[idx]?.volume || 1);
}

function priorTrendAt(candles: CandlePoint[], ema20: number[], ema50: number[], idx: number): CandleDirection {
  if (idx < 3) return 'NEUTRAL';
  const cPrev = candles[idx - 1].close;
  const cOld = candles[Math.max(0, idx - 6)].close;
  const e20 = ema20[idx - 1] ?? cPrev;
  const e50 = ema50[idx - 1] ?? cPrev;
  if (cPrev > cOld && cPrev >= e20 && e20 >= e50 * 0.999) return 'BULLISH';
  if (cPrev < cOld && cPrev <= e20 && e20 <= e50 * 1.001) return 'BEARISH';
  if (cPrev > cOld * 1.001) return 'BULLISH';
  if (cPrev < cOld * 0.999) return 'BEARISH';
  return 'NEUTRAL';
}

function nearSupportOrResistance(candles: CandlePoint[], idx: number): { nearSupport: boolean; nearResistance: boolean } {
  const start = Math.max(0, idx - 24);
  if (idx - start < 4) return { nearSupport: false, nearResistance: false };
  let hi = -Infinity;
  let lo = Infinity;
  for (let j = start; j < idx; j++) {
    if (candles[j].high > hi) hi = candles[j].high;
    if (candles[j].low < lo) lo = candles[j].low;
  }
  const span = Math.max(1e-9, hi - lo);
  const c = candles[idx];
  const nearSupport = Math.abs(c.low - lo) <= span * 0.16;
  const nearResistance = Math.abs(hi - c.high) <= span * 0.16;
  return { nearSupport, nearResistance };
}

interface CandidatePattern {
  patternName: string;
  category: CandlestickCategory;
  bias: CandleDirection;
  baseStrength: number;
  invalidationPrice: number;
  invalidationCondition: string;
}

export function analyzeCandlestickIntelligence(
  candles: CandlePoint[],
  ema20: number[] = [],
  ema50: number[] = [],
  rsi14: number[] = []
): CandlestickIntelligenceReport {
  const n = candles.length;
  if (n === 0) {
    const emptyGeom = computeCandleGeometry({ time: '--:--', open: 0, high: 0, low: 0, close: 0, volume: 0 }, 0);
    return {
      latestGeometry: emptyGeom,
      patterns: [],
      latestConfirmedPattern: null,
      latestActivePattern: null,
      bullishCount: 0,
      bearishCount: 0,
      neutralCount: 0,
      summaryUz: 'Sham ma’lumotlari mavjud emas.',
    };
  }

  const geoms = candles.map((c, idx) => computeCandleGeometry(c, idx));
  const detected: DetectedCandlestickPattern[] = [];

  for (let i = 0; i < n; i++) {
    const g = geoms[i];
    const c = candles[i];
    const aBody = avgBody(geoms, i, 10);
    const aRng = avgRange(geoms, i, 10);
    const trend = priorTrendAt(candles, ema20, ema50, i);
    const isBull = c.close > c.open;
    const isBear = c.close < c.open;
    const isDoji = g.bodyRatio <= 0.11;
    const isSmallBody = g.bodySize <= aBody * 0.65;
    const isLongBody = g.bodySize >= aBody * 1.15;

    const candidates: CandidatePattern[] = [];

    // --- NEUTRAL & SINGLE-BAR PATTERNS ---
    if (isDoji) {
      if (g.lowerWick >= g.candleRange * 0.58 && g.upperWick <= g.candleRange * 0.15) {
        candidates.push({
          patternName: 'Dragonfly Doji',
          category: 'NEUTRAL',
          bias: trend === 'BEARISH' ? 'BULLISH' : 'NEUTRAL',
          baseStrength: 68,
          invalidationPrice: c.low,
          invalidationCondition: `Yopilish narxi ${c.low.toFixed(4)} dan pastga tushsa bekor bo‘ladi`,
        });
      } else if (g.upperWick >= g.candleRange * 0.58 && g.lowerWick <= g.candleRange * 0.15) {
        candidates.push({
          patternName: 'Gravestone Doji',
          category: 'NEUTRAL',
          bias: trend === 'BULLISH' ? 'BEARISH' : 'NEUTRAL',
          baseStrength: 68,
          invalidationPrice: c.high,
          invalidationCondition: `Yopilish narxi ${c.high.toFixed(4)} dan yuqoriga chiqsa bekor bo‘ladi`,
        });
      } else if (g.candleRange >= aRng * 1.2 && g.upperWick >= g.candleRange * 0.3 && g.lowerWick >= g.candleRange * 0.3) {
        candidates.push({
          patternName: 'Long-legged Doji',
          category: 'NEUTRAL',
          bias: 'NEUTRAL',
          baseStrength: 60,
          invalidationPrice: trend === 'BULLISH' ? c.high : c.low,
          invalidationCondition: 'Keyingi sham Doji diapazonini buzmasa noaniqlik davom etadi',
        });
      } else {
        candidates.push({
          patternName: 'Doji',
          category: 'NEUTRAL',
          bias: 'NEUTRAL',
          baseStrength: 54,
          invalidationPrice: trend === 'BULLISH' ? c.high : c.low,
          invalidationCondition: 'Keyingi yopilgan sham yo‘nalishni tasdiqlashi shart',
        });
      }
    } else if (g.bodyRatio <= 0.28 && g.upperWick >= g.bodySize * 1.2 && g.lowerWick >= g.bodySize * 1.2) {
      candidates.push({
        patternName: 'Spinning Top',
        category: 'NEUTRAL',
        bias: 'NEUTRAL',
        baseStrength: 52,
        invalidationPrice: c.low,
        invalidationCondition: 'Bozor muvozanatda — keyingi tasdiq shamini kuting',
      });
    }

    // Hammer / Hanging Man / Inverted Hammer / Shooting Star
    if (!isDoji && g.bodyRatio <= 0.38 && g.lowerWick >= g.bodySize * 2.0 && g.upperWick <= g.bodySize * 0.45) {
      if (trend === 'BEARISH') {
        candidates.push({
          patternName: 'Hammer',
          category: 'REVERSAL',
          bias: 'BULLISH',
          baseStrength: 74,
          invalidationPrice: c.low,
          invalidationCondition: `Narx Hammer pastki soyasidan (${c.low.toFixed(4)}) pastda yopilsa bekor bo‘ladi`,
        });
      } else if (trend === 'BULLISH') {
        candidates.push({
          patternName: 'Hanging Man',
          category: 'REVERSAL',
          bias: 'BEARISH',
          baseStrength: 68,
          invalidationPrice: c.high,
          invalidationCondition: `Narx Hanging Man cho‘qqisidan (${c.high.toFixed(4)}) yuqorida yopilsa bekor bo‘ladi`,
        });
      }
    }

    if (!isDoji && g.bodyRatio <= 0.38 && g.upperWick >= g.bodySize * 2.0 && g.lowerWick <= g.bodySize * 0.45) {
      if (trend === 'BEARISH') {
        candidates.push({
          patternName: 'Inverted Hammer',
          category: 'REVERSAL',
          bias: 'BULLISH',
          baseStrength: 70,
          invalidationPrice: c.low,
          invalidationCondition: `Narx ${c.low.toFixed(4)} dan pastga yopilsa bekor bo‘ladi`,
        });
      } else if (trend === 'BULLISH') {
        candidates.push({
          patternName: 'Shooting Star',
          category: 'REVERSAL',
          bias: 'BEARISH',
          baseStrength: 76,
          invalidationPrice: c.high,
          invalidationCondition: `Narx Shooting Star cho‘qqisidan (${c.high.toFixed(4)}) yuqorida yopilsa bekor bo‘ladi`,
        });
      }
    }

    // Marubozu & Belt Hold
    if (isBull && g.bodyRatio >= 0.86 && isLongBody) {
      candidates.push({
        patternName: 'Bullish Marubozu',
        category: 'CONTINUATION',
        bias: 'BULLISH',
        baseStrength: 76,
        invalidationPrice: c.low,
        invalidationCondition: `Narx Marubozu ochilishidan (${c.open.toFixed(4)}) pastda yopilsa kuchsizlanadi`,
      });
    } else if (isBear && g.bodyRatio >= 0.86 && isLongBody) {
      candidates.push({
        patternName: 'Bearish Marubozu',
        category: 'CONTINUATION',
        bias: 'BEARISH',
        baseStrength: 76,
        invalidationPrice: c.high,
        invalidationCondition: `Narx Marubozu ochilishidan (${c.open.toFixed(4)}) yuqorida yopilsa kuchsizlanadi`,
      });
    } else if (isBull && g.lowerWick <= g.candleRange * 0.06 && isLongBody && trend === 'BEARISH') {
      candidates.push({
        patternName: 'Bullish Belt Hold',
        category: 'REVERSAL',
        bias: 'BULLISH',
        baseStrength: 69,
        invalidationPrice: c.low,
        invalidationCondition: `Pastki chegara (${c.low.toFixed(4)}) buzilsa bekor bo‘ladi`,
      });
    } else if (isBear && g.upperWick <= g.candleRange * 0.06 && isLongBody && trend === 'BULLISH') {
      candidates.push({
        patternName: 'Bearish Belt Hold',
        category: 'REVERSAL',
        bias: 'BEARISH',
        baseStrength: 69,
        invalidationPrice: c.high,
        invalidationCondition: `Yuqori chegara (${c.high.toFixed(4)}) buzilsa bekor bo‘ladi`,
      });
    }

    // --- 2-BAR PATTERNS ---
    if (i >= 1) {
      const p1 = candles[i - 1];
      const g1 = geoms[i - 1];
      const p1Bull = p1.close > p1.open;
      const p1Bear = p1.close < p1.open;
      const p1Top = Math.max(p1.open, p1.close);
      const p1Bot = Math.min(p1.open, p1.close);
      const cTop = Math.max(c.open, c.close);
      const cBot = Math.min(c.open, c.close);

      // Engulfing
      if (p1Bear && isBull && c.close >= p1.open && c.open <= p1.close && g.bodySize > g1.bodySize * 1.05) {
        candidates.push({
          patternName: 'Bullish Engulfing',
          category: 'REVERSAL',
          bias: 'BULLISH',
          baseStrength: 82,
          invalidationPrice: Math.min(p1.low, c.low),
          invalidationCondition: `Narx ${Math.min(p1.low, c.low).toFixed(4)} dan pastda yopilsa bekor bo‘ladi`,
        });
      }
      if (p1Bull && isBear && c.open >= p1.close && c.close <= p1.open && g.bodySize > g1.bodySize * 1.05) {
        candidates.push({
          patternName: 'Bearish Engulfing',
          category: 'REVERSAL',
          bias: 'BEARISH',
          baseStrength: 82,
          invalidationPrice: Math.max(p1.high, c.high),
          invalidationCondition: `Narx ${Math.max(p1.high, c.high).toFixed(4)} dan yuqorida yopilsa bekor bo‘ladi`,
        });
      }

      // Piercing Line & Dark Cloud Cover
      const p1Mid = (p1.open + p1.close) / 2;
      if (p1Bear && g1.bodySize >= aBody * 0.9 && isBull && c.open <= p1.close && c.close > p1Mid && c.close < p1.open) {
        candidates.push({
          patternName: 'Piercing Line',
          category: 'REVERSAL',
          bias: 'BULLISH',
          baseStrength: 75,
          invalidationPrice: Math.min(p1.low, c.low),
          invalidationCondition: `Pastki ekstremum (${Math.min(p1.low, c.low).toFixed(4)}) buzilsa bekor bo‘ladi`,
        });
      }
      if (p1Bull && g1.bodySize >= aBody * 0.9 && isBear && c.open >= p1.close && c.close < p1Mid && c.close > p1.open) {
        candidates.push({
          patternName: 'Dark Cloud Cover',
          category: 'REVERSAL',
          bias: 'BEARISH',
          baseStrength: 75,
          invalidationPrice: Math.max(p1.high, c.high),
          invalidationCondition: `Yuqori ekstremum (${Math.max(p1.high, c.high).toFixed(4)}) buzilsa bekor bo‘ladi`,
        });
      }

      // Tweezer Top & Tweezer Bottom
      const tol = aRng * 0.08;
      if (trend === 'BULLISH' && p1Bull && isBear && Math.abs(p1.high - c.high) <= tol) {
        candidates.push({
          patternName: 'Tweezer Top',
          category: 'REVERSAL',
          bias: 'BEARISH',
          baseStrength: 73,
          invalidationPrice: Math.max(p1.high, c.high),
          invalidationCondition: `Cho‘qqi (${Math.max(p1.high, c.high).toFixed(4)}) yuqoriga yorilsa bekor bo‘ladi`,
        });
      }
      if (trend === 'BEARISH' && p1Bear && isBull && Math.abs(p1.low - c.low) <= tol) {
        candidates.push({
          patternName: 'Tweezer Bottom',
          category: 'REVERSAL',
          bias: 'BULLISH',
          baseStrength: 73,
          invalidationPrice: Math.min(p1.low, c.low),
          invalidationCondition: `Tub (${Math.min(p1.low, c.low).toFixed(4)}) pastga yorilsa bekor bo‘ladi`,
        });
      }

      // Inside Bar & Outside Bar
      if (c.high <= p1.high && c.low >= p1.low && g.candleRange < g1.candleRange * 0.85) {
        candidates.push({
          patternName: 'Inside Bar',
          category: 'CONTINUATION',
          bias: trend === 'BULLISH' ? 'BULLISH' : trend === 'BEARISH' ? 'BEARISH' : 'NEUTRAL',
          baseStrength: 66,
          invalidationPrice: trend === 'BEARISH' ? p1.high : p1.low,
          invalidationCondition: `Ona sham (${p1.low.toFixed(4)}..${p1.high.toFixed(4)}) breakout yo‘nalishini kuting`,
        });
      } else if (c.high > p1.high && c.low < p1.low && g.candleRange > g1.candleRange * 1.1) {
        candidates.push({
          patternName: 'Outside Bar',
          category: 'CONTINUATION',
          bias: isBull ? 'BULLISH' : isBear ? 'BEARISH' : 'NEUTRAL',
          baseStrength: 72,
          invalidationPrice: isBull ? c.low : c.high,
          invalidationCondition: `Outside Bar qarama-qarshi uchi buzilsa bekor bo‘ladi`,
        });
      }

      // Harami & Harami Cross
      if (g1.bodySize >= aBody * 0.85 && cTop <= p1Top && cBot >= p1Bot && g.bodySize <= g1.bodySize * 0.55) {
        const haramiBias: CandleDirection = p1Bear && isBull ? 'BULLISH' : p1Bull && isBear ? 'BEARISH' : 'NEUTRAL';
        candidates.push({
          patternName: isDoji ? 'Harami Cross' : 'Harami',
          category: 'NEUTRAL',
          bias: haramiBias,
          baseStrength: isDoji ? 67 : 62,
          invalidationPrice: p1Bear ? p1.low : p1.high,
          invalidationCondition: 'Ona sham chegarasi breakout bilan tasdiqlanishi kerak',
        });
      }

      // Kicking (two opposite Marubozu bars)
      if (g1.bodyRatio >= 0.82 && g.bodyRatio >= 0.82 && isLongBody && g1.bodySize >= aBody) {
        if (p1Bear && isBull && c.open >= p1.open) {
          candidates.push({
            patternName: 'Bullish Kicking',
            category: 'REVERSAL',
            bias: 'BULLISH',
            baseStrength: 84,
            invalidationPrice: c.low,
            invalidationCondition: `Narx ${c.low.toFixed(4)} dan pastga tushsa bekor bo‘ladi`,
          });
        } else if (p1Bull && isBear && c.open <= p1.open) {
          candidates.push({
            patternName: 'Bearish Kicking',
            category: 'REVERSAL',
            bias: 'BEARISH',
            baseStrength: 84,
            invalidationPrice: c.high,
            invalidationCondition: `Narx ${c.high.toFixed(4)} dan yuqoriga chiqsa bekor bo‘ladi`,
          });
        }
      }
    }

    // --- 3-BAR PATTERNS ---
    if (i >= 2) {
      const b0 = candles[i - 2];
      const b1 = candles[i - 1];
      const g0 = geoms[i - 2];
      const g1 = geoms[i - 1];
      const b0Mid = (b0.open + b0.close) / 2;

      // Morning Star / Morning Doji Star / Abandoned Baby
      if (b0.close < b0.open && g0.bodySize >= aBody * 0.8 && g1.bodySize <= g0.bodySize * 0.42 && isBull && c.close > b0Mid) {
        const isMidDoji = g1.bodyRatio <= 0.11;
        const isGapBaby = isMidDoji && b1.high < Math.min(b0.low, c.low);
        candidates.push({
          patternName: isGapBaby ? 'Bullish Abandoned Baby' : isMidDoji ? 'Morning Doji Star' : 'Morning Star',
          category: 'REVERSAL',
          bias: 'BULLISH',
          baseStrength: isGapBaby ? 88 : isMidDoji ? 84 : 80,
          invalidationPrice: Math.min(b0.low, b1.low, c.low),
          invalidationCondition: `Uch shamlik tub (${Math.min(b0.low, b1.low, c.low).toFixed(4)}) buzilsa bekor bo‘ladi`,
        });
      }

      // Evening Star / Evening Doji Star / Bearish Abandoned Baby
      if (b0.close > b0.open && g0.bodySize >= aBody * 0.8 && g1.bodySize <= g0.bodySize * 0.42 && isBear && c.close < b0Mid) {
        const isMidDoji = g1.bodyRatio <= 0.11;
        const isGapBaby = isMidDoji && b1.low > Math.max(b0.high, c.high);
        candidates.push({
          patternName: isGapBaby ? 'Bearish Abandoned Baby' : isMidDoji ? 'Evening Doji Star' : 'Evening Star',
          category: 'REVERSAL',
          bias: 'BEARISH',
          baseStrength: isGapBaby ? 88 : isMidDoji ? 84 : 80,
          invalidationPrice: Math.max(b0.high, b1.high, c.high),
          invalidationCondition: `Uch shamlik cho‘qqi (${Math.max(b0.high, b1.high, c.high).toFixed(4)}) buzilsa bekor bo‘ladi`,
        });
      }

      // Three White Soldiers & Three Black Crows
      if (
        b0.close > b0.open &&
        b1.close > b1.open &&
        isBull &&
        b1.close > b0.close &&
        c.close > b1.close &&
        g0.bodyRatio >= 0.52 &&
        g1.bodyRatio >= 0.52 &&
        g.bodyRatio >= 0.52
      ) {
        candidates.push({
          patternName: 'Three White Soldiers',
          category: 'REVERSAL',
          bias: 'BULLISH',
          baseStrength: 83,
          invalidationPrice: b0.low,
          invalidationCondition: `Birinchi askar shamining pastki nuqtasi (${b0.low.toFixed(4)}) buzilsa bekor bo‘ladi`,
        });
      }
      if (
        b0.close < b0.open &&
        b1.close < b1.open &&
        isBear &&
        b1.close < b0.close &&
        c.close < b1.close &&
        g0.bodyRatio >= 0.52 &&
        g1.bodyRatio >= 0.52 &&
        g.bodyRatio >= 0.52
      ) {
        candidates.push({
          patternName: 'Three Black Crows',
          category: 'REVERSAL',
          bias: 'BEARISH',
          baseStrength: 83,
          invalidationPrice: b0.high,
          invalidationCondition: `Birinchi qarg‘a shamining cho‘qqisi (${b0.high.toFixed(4)}) buzilsa bekor bo‘ladi`,
        });
      }
    }

    // --- 4-BAR THREE LINE STRIKE ---
    if (i >= 3) {
      const a0 = candles[i - 3];
      const a1 = candles[i - 2];
      const a2 = candles[i - 1];
      if (a0.close < a0.open && a1.close < a1.open && a2.close < a2.open && a1.close < a0.close && a2.close < a1.close && isBull && c.close > a0.open) {
        candidates.push({
          patternName: 'Three Line Strike (Bull)',
          category: 'CONTINUATION',
          bias: 'BULLISH',
          baseStrength: 79,
          invalidationPrice: Math.min(a2.low, c.low),
          invalidationCondition: `Strike pastki nuqtasi buzilsa bekor bo‘ladi`,
        });
      }
      if (a0.close > a0.open && a1.close > a1.open && a2.close > a2.open && a1.close > a0.close && a2.close > a1.close && isBear && c.close < a0.open) {
        candidates.push({
          patternName: 'Three Line Strike (Bear)',
          category: 'CONTINUATION',
          bias: 'BEARISH',
          baseStrength: 79,
          invalidationPrice: Math.max(a2.high, c.high),
          invalidationCondition: `Strike yuqori nuqtasi buzilsa bekor bo‘ladi`,
        });
      }
    }

    // --- 5-BAR RISING / FALLING THREE METHODS & MAT HOLD ---
    if (i >= 4) {
      const s0 = candles[i - 4];
      const s1 = candles[i - 3];
      const s2 = candles[i - 2];
      const s3 = candles[i - 1];
      const gS0 = geoms[i - 4];
      const smallMid =
        geoms[i - 3].bodySize < gS0.bodySize * 0.65 &&
        geoms[i - 2].bodySize < gS0.bodySize * 0.65 &&
        geoms[i - 1].bodySize < gS0.bodySize * 0.65;
      if (
        s0.close > s0.open &&
        gS0.bodySize >= aBody * 0.9 &&
        smallMid &&
        Math.min(s1.low, s2.low, s3.low) >= s0.low &&
        isBull &&
        c.close > s0.close
      ) {
        const isMat = Math.min(s1.close, s2.close, s3.close) > (s0.open + s0.close) / 2;
        candidates.push({
          patternName: isMat ? 'Mat Hold' : 'Rising Three Methods',
          category: 'CONTINUATION',
          bias: 'BULLISH',
          baseStrength: isMat ? 82 : 78,
          invalidationPrice: s0.low,
          invalidationCondition: `Asosiy impuls sham pastki qismi (${s0.low.toFixed(4)}) buzilsa bekor bo‘ladi`,
        });
      }
      if (
        s0.close < s0.open &&
        gS0.bodySize >= aBody * 0.9 &&
        smallMid &&
        Math.max(s1.high, s2.high, s3.high) <= s0.high &&
        isBear &&
        c.close < s0.close
      ) {
        candidates.push({
          patternName: 'Falling Three Methods',
          category: 'CONTINUATION',
          bias: 'BEARISH',
          baseStrength: 78,
          invalidationPrice: s0.high,
          invalidationCondition: `Asosiy impuls sham cho‘qqisi (${s0.high.toFixed(4)}) buzilsa bekor bo‘ladi`,
        });
      }
    }

    if (candidates.length === 0) continue;

    // Pick strongest candidate on this bar so chart/table stays crisp
    candidates.sort((a, b) => b.baseStrength - a.baseStrength);
    const best = candidates[0];

    // Multi-factor causal confirmation
    const reasons: string[] = [];
    let score = best.baseStrength;
    const volRatio = c.volume / avgVolume(candles, i, 20);
    const { nearSupport, nearResistance } = nearSupportOrResistance(candles, i);
    const rsiVal = rsi14[i] ?? 50;

    if (best.bias === 'BULLISH') {
      if (best.category === 'REVERSAL' && trend === 'BEARISH') {
        score += 5;
        reasons.push('Oldingi pasayish trendida shakllandi');
      } else if (best.category === 'CONTINUATION' && trend === 'BULLISH') {
        score += 5;
        reasons.push('Asosiy ko‘tarilish trendini davom ettiradi');
      }
      if (nearSupport) {
        score += 5;
        reasons.push('Support zonasiga tayangan');
      }
      if (rsiVal <= 42) {
        score += 4;
        reasons.push(`RSI(${rsiVal.toFixed(1)}) past/tiklanish hududida`);
      }
    } else if (best.bias === 'BEARISH') {
      if (best.category === 'REVERSAL' && trend === 'BULLISH') {
        score += 5;
        reasons.push('Oldingi ko‘tarilish cho‘qqisida shakllandi');
      } else if (best.category === 'CONTINUATION' && trend === 'BEARISH') {
        score += 5;
        reasons.push('Asosiy pasayish trendini davom ettiradi');
      }
      if (nearResistance) {
        score += 5;
        reasons.push('Resistance zonasida rad etilgan');
      }
      if (rsiVal >= 58) {
        score += 4;
        reasons.push(`RSI(${rsiVal.toFixed(1)}) yuqori/qizib ketgan hududda`);
      }
    } else {
      reasons.push('Bozor muvozanat / kutish holatida');
    }

    if (volRatio >= 1.15) {
      score += 4;
      reasons.push(`Hajm o‘rtachadan ${volRatio.toFixed(2)}x yuqori`);
    }

    // Strict causal next-bar confirmation (only if i < n - 1)
    let status: PatternConfirmationStatus = 'KUTILMOQDA';
    if (i < n - 1) {
      const nextBar = candles[i + 1];
      let invalidatedLater = false;
      for (let k = i + 1; k < n; k++) {
        if (best.bias === 'BULLISH' && candles[k].close < best.invalidationPrice) {
          invalidatedLater = true;
          break;
        }
        if (best.bias === 'BEARISH' && candles[k].close > best.invalidationPrice) {
          invalidatedLater = true;
          break;
        }
      }

      if (invalidatedLater) {
        status = 'RAD_ETILGAN';
        reasons.push('Keyingi yopilish invalidation darajasini buzdi');
      } else if (best.bias === 'BULLISH') {
        if (nextBar.close > nextBar.open && nextBar.close > c.close) {
          status = 'TASDIQLANGAN';
          score += 5;
          reasons.push('Keyingi sham yuqorida yopilib tasdiqladi');
        } else {
          status = 'KUTILMOQDA';
          reasons.push('Keyingi sham to‘liq yuqori tasdiq bermadi');
        }
      } else if (best.bias === 'BEARISH') {
        if (nextBar.close < nextBar.open && nextBar.close < c.close) {
          status = 'TASDIQLANGAN';
          score += 5;
          reasons.push('Keyingi sham pastda yopilib tasdiqladi');
        } else {
          status = 'KUTILMOQDA';
          reasons.push('Keyingi sham to‘liq pastki tasdiq bermadi');
        }
      } else {
        if (nextBar.close > c.high || nextBar.close < c.low) {
          status = 'TASDIQLANGAN';
          reasons.push('Doji/Neytral diapazonidan chiqish tasdiqlandi');
        }
      }
    } else {
      reasons.push('Joriy sham — yakuniy tasdiq uchun keyingi sham yopilishi kutilmoqda');
    }

    detected.push({
      id: `cp-${i}-${best.patternName.replace(/\s+/g, '-').toLowerCase()}`,
      index: i,
      time: c.time,
      patternName: best.patternName,
      category: best.category,
      bias: best.bias,
      strength: Math.min(99, Math.max(35, Math.round(score))),
      confirmationStatus: status,
      confirmationReasons: reasons,
      invalidationPrice: best.invalidationPrice,
      invalidationCondition: best.invalidationCondition,
      geometry: g,
    });
  }

  const recentPatterns = detected.slice(-24);
  const confirmedList = recentPatterns.filter((p) => p.confirmationStatus === 'TASDIQLANGAN');
  const activeList = recentPatterns.filter((p) => p.confirmationStatus !== 'RAD_ETILGAN');
  const latestConfirmedPattern = confirmedList.length > 0 ? confirmedList[confirmedList.length - 1] : null;
  const latestActivePattern = activeList.length > 0 ? activeList[activeList.length - 1] : null;
  const latestGeometry = geoms[n - 1];

  const bullishCount = recentPatterns.filter((p) => p.bias === 'BULLISH' && p.confirmationStatus !== 'RAD_ETILGAN').length;
  const bearishCount = recentPatterns.filter((p) => p.bias === 'BEARISH' && p.confirmationStatus !== 'RAD_ETILGAN').length;
  const neutralCount = recentPatterns.filter((p) => p.bias === 'NEUTRAL').length;

  const summaryUz = latestConfirmedPattern
    ? `Oxirgi tasdiqlangan sham patterni: ${latestConfirmedPattern.patternName} (${latestConfirmedPattern.bias}, kuchi ${latestConfirmedPattern.strength}%).`
    : latestActivePattern
      ? `Kuzatilayotgan sham patterni: ${latestActivePattern.patternName} (keyingi sham tasdig‘i kutilmoqda).`
      : 'So‘nggi shamlarda kuchli alohida sham patterni aniqlanmadi.';

  return {
    latestGeometry,
    patterns: recentPatterns,
    latestConfirmedPattern,
    latestActivePattern,
    bullishCount,
    bearishCount,
    neutralCount,
    summaryUz,
  };
}
