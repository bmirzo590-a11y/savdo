import {
  CandlePoint,
  LiquidityPool,
  SessionLevels,
  SmcDeepReport,
  StrategyBrainSnapshot,
} from '../types/trading';

interface SmcEventInput {
  index: number;
  tag: 'BOS' | 'CHoCH';
  bias: 1 | -1;
  internal: boolean;
  price: number;
}

function parseHourFromLabel(timeLabel: string): number | null {
  const match = timeLabel.match(/(\d{1,2}):\d{2}/);
  if (!match) return null;
  const h = Number(match[1]);
  return Number.isFinite(h) && h >= 0 && h <= 23 ? h : null;
}

function computeSessionLevels(candles: CandlePoint[]): SessionLevels {
  const recent = candles.slice(-72);
  let asiaHi = -Infinity;
  let asiaLo = Infinity;
  let londonHi = -Infinity;
  let londonLo = Infinity;
  let nyHi = -Infinity;
  let nyLo = Infinity;

  recent.forEach((c, idx) => {
    const h = parseHourFromLabel(c.time) ?? ((idx * 1) % 24);
    if (h >= 0 && h < 8) {
      asiaHi = Math.max(asiaHi, c.high);
      asiaLo = Math.min(asiaLo, c.low);
    }
    if (h >= 8 && h < 16) {
      londonHi = Math.max(londonHi, c.high);
      londonLo = Math.min(londonLo, c.low);
    }
    if (h >= 13 && h <= 21) {
      nyHi = Math.max(nyHi, c.high);
      nyLo = Math.min(nyLo, c.low);
    }
  });

  const fallbackHi = Math.max(...recent.map((c) => c.high));
  const fallbackLo = Math.min(...recent.map((c) => c.low));

  return {
    asiaHigh: Number.isFinite(asiaHi) ? asiaHi : fallbackHi,
    asiaLow: Number.isFinite(asiaLo) ? asiaLo : fallbackLo,
    londonHigh: Number.isFinite(londonHi) ? londonHi : fallbackHi,
    londonLow: Number.isFinite(londonLo) ? londonLo : fallbackLo,
    nyHigh: Number.isFinite(nyHi) ? nyHi : fallbackHi,
    nyLow: Number.isFinite(nyLo) ? nyLo : fallbackLo,
  };
}

export function analyzeSmcDeep(
  candles: CandlePoint[],
  smcSnapshot: StrategyBrainSnapshot['smc'],
  smcEvents: SmcEventInput[],
  atr14: number
): SmcDeepReport {
  const n = candles.length;
  const last = candles[n - 1];
  const structureState: SmcDeepReport['structureState'] =
    smcSnapshot.swingBias === 'BULLISH'
      ? 'BULLISH_STRUCTURE'
      : smcSnapshot.swingBias === 'BEARISH'
        ? 'BEARISH_STRUCTURE'
        : 'CONSOLIDATION';

  // Detect Market Structure Shift (MSS): CHoCH backed by displacement candle body >= 1.25 * ATR(14)
  let mssDetected: SmcDeepReport['mssDetected'] = 'YO‘Q';
  for (let i = smcEvents.length - 1; i >= 0; i--) {
    const ev = smcEvents[i];
    if (n - 1 - ev.index > 14) break;
    const c = candles[ev.index];
    const body = c ? Math.abs(c.close - c.open) : 0;
    if (ev.tag === 'CHoCH' && body >= Math.max(1e-9, atr14 * 1.15)) {
      mssDetected = ev.bias === 1 ? 'BULLISH_MSS' : 'BEARISH_MSS';
      break;
    }
  }

  // BSL / SSL pools from unswept recent swing extremes + EQH / EQL clusters
  const bslLevels: LiquidityPool[] = [];
  const sslLevels: LiquidityPool[] = [];
  const start = Math.max(2, n - 40);
  for (let i = start; i < n - 2; i++) {
    const isSwingHi = candles[i].high > candles[i - 1].high && candles[i].high > candles[i + 1].high;
    const isSwingLo = candles[i].low < candles[i - 1].low && candles[i].low < candles[i + 1].low;
    if (isSwingHi) {
      let swept = false;
      for (let k = i + 1; k < n; k++) {
        if (candles[k].high > candles[i].high) {
          swept = true;
          break;
        }
      }
      bslLevels.push({ type: 'BSL', price: candles[i].high, swept, label: `BSL @ ${candles[i].time}` });
    }
    if (isSwingLo) {
      let swept = false;
      for (let k = i + 1; k < n; k++) {
        if (candles[k].low < candles[i].low) {
          swept = true;
          break;
        }
      }
      sslLevels.push({ type: 'SSL', price: candles[i].low, swept, label: `SSL @ ${candles[i].time}` });
    }
  }

  // Recent sweep detection on last 3 bars
  let recentSweep: SmcDeepReport['recentSweep'] = 'YO‘Q';
  if (n >= 10 && last) {
    const prevSlice = candles.slice(Math.max(0, n - 18), n - 1);
    const prevHi = Math.max(...prevSlice.map((c) => c.high));
    const prevLo = Math.min(...prevSlice.map((c) => c.low));
    const recent3 = candles.slice(Math.max(0, n - 3));
    for (const bar of recent3) {
      if (bar.low < prevLo && bar.close > prevLo) {
        recentSweep = 'SSL_SWEEP';
      } else if (bar.high > prevHi && bar.close < prevHi) {
        recentSweep = 'BSL_SWEEP';
      }
    }
  }

  const sessionLevels = computeSessionLevels(candles);
  const activeBsl = bslLevels.filter((p) => !p.swept).slice(-4);
  const activeSsl = sslLevels.filter((p) => !p.swept).slice(-4);

  const summaryUz = [
    `Tuzilma: ${structureState === 'BULLISH_STRUCTURE' ? 'Ko‘tarilish (BOS/HL)' : structureState === 'BEARISH_STRUCTURE' ? 'Pasayish (BOS/LH)' : 'Konsolidatsiya'}`,
    mssDetected !== 'YO‘Q' ? `MSS: ${mssDetected}` : null,
    `Zona: ${smcSnapshot.zone} (${smcSnapshot.zonePct.toFixed(0)}%)`,
    recentSweep !== 'YO‘Q' ? `Likvidlik yig‘ilishi: ${recentSweep}` : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return {
    structureState,
    mssDetected,
    lastBosOrChoch: smcSnapshot.lastStructureTag,
    bslLevels: activeBsl.length > 0 ? activeBsl : bslLevels.slice(-3),
    sslLevels: activeSsl.length > 0 ? activeSsl : sslLevels.slice(-3),
    recentSweep,
    equalHighs: smcSnapshot.equalHighsDetected,
    equalLows: smcSnapshot.equalLowsDetected,
    zone: smcSnapshot.zone,
    zonePct: smcSnapshot.zonePct,
    activeBullObCount: smcSnapshot.activeBullishObCount,
    activeBearObCount: smcSnapshot.activeBearishObCount,
    activeFvgCount: smcSnapshot.activeFvgCount,
    sessionLevels,
    summaryUz,
  };
}
