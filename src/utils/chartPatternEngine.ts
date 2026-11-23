import {
  CandlePoint,
  ChartPatternCategory,
  ChartPatternIntelligenceReport,
  ChartPatternPoint,
  ChartPatternStatus,
  DetectedChartPattern,
} from '../types/trading';

interface Pivot {
  index: number;
  price: number;
  type: 'HIGH' | 'LOW';
  confirmedAt: number;
}

function extractCausalPivots(candles: CandlePoint[], left = 3, right = 3): Pivot[] {
  const n = candles.length;
  const pivots: Pivot[] = [];
  if (n < left + right + 1) return pivots;

  for (let p = left; p < n - right; p++) {
    let isHigh = true;
    let isLow = true;
    for (let j = p - left; j <= p + right; j++) {
      if (j === p) continue;
      if (candles[j].high >= candles[p].high) isHigh = false;
      if (candles[j].low <= candles[p].low) isLow = false;
    }
    if (isHigh) {
      pivots.push({ index: p, price: candles[p].high, type: 'HIGH', confirmedAt: p + right });
    }
    if (isLow) {
      pivots.push({ index: p, price: candles[p].low, type: 'LOW', confirmedAt: p + right });
    }
  }
  return pivots;
}

function approxEq(a: number, b: number, tolPct = 0.0085): boolean {
  const mid = (Math.abs(a) + Math.abs(b)) / 2;
  if (mid <= 1e-9) return true;
  return Math.abs(a - b) / mid <= tolPct;
}

function evaluatePatternStatus(
  candles: CandlePoint[],
  startIdx: number,
  endIdx: number,
  bias: 'BULLISH' | 'BEARISH' | 'NEUTRAL',
  breakoutLevel: number,
  invalidationLevel: number
): ChartPatternStatus {
  const lastClose = candles[candles.length - 1].close;
  for (let i = endIdx + 1; i < candles.length; i++) {
    const cl = candles[i].close;
    if (bias === 'BULLISH') {
      if (cl < invalidationLevel) return 'BEKOR_QILINGAN';
      if (cl > breakoutLevel) return 'BREAKOUT_TASDIQLANDI';
    } else if (bias === 'BEARISH') {
      if (cl > invalidationLevel) return 'BEKOR_QILINGAN';
      if (cl < breakoutLevel) return 'BREAKOUT_TASDIQLANDI';
    } else {
      if (cl > breakoutLevel || cl < invalidationLevel) return 'BREAKOUT_TASDIQLANDI';
    }
  }
  if (bias === 'BULLISH' && lastClose < invalidationLevel) return 'BEKOR_QILINGAN';
  if (bias === 'BEARISH' && lastClose > invalidationLevel) return 'BEKOR_QILINGAN';
  if (startIdx >= candles.length) return 'SHAKLLANMOQDA';
  return 'SHAKLLANMOQDA';
}

export function analyzeChartPatterns(candles: CandlePoint[]): ChartPatternIntelligenceReport {
  const n = candles.length;
  if (n < 18) {
    return {
      patterns: [],
      activePattern: null,
      confirmedBreakoutCount: 0,
      formingCount: 0,
    };
  }

  const pivots = extractCausalPivots(candles, 3, 3);
  const highs = pivots.filter((p) => p.type === 'HIGH');
  const lows = pivots.filter((p) => p.type === 'LOW');
  const detected: DetectedChartPattern[] = [];

  const pushPattern = (
    id: string,
    name: string,
    category: ChartPatternCategory,
    bias: 'BULLISH' | 'BEARISH' | 'NEUTRAL',
    strength: number,
    startIndex: number,
    endIndex: number,
    breakoutLevel: number,
    targetPrice: number,
    invalidationLevel: number,
    points: ChartPatternPoint[],
    descriptionUz: string
  ) => {
    const status = evaluatePatternStatus(candles, startIndex, endIndex, bias, breakoutLevel, invalidationLevel);
    detected.push({
      id,
      name,
      category,
      bias,
      status,
      strength: Math.min(96, Math.max(45, Math.round(strength))),
      startIndex,
      endIndex,
      breakoutLevel,
      targetPrice,
      invalidationLevel,
      points,
      descriptionUz,
    });
  };

  // 1. Double Top & Triple Top
  if (highs.length >= 2) {
    const h2 = highs[highs.length - 1];
    const h1 = highs[highs.length - 2];
    if (h2.index - h1.index >= 4 && approxEq(h1.price, h2.price, 0.0075)) {
      let neckline = Infinity;
      let neckIdx = Math.floor((h1.index + h2.index) / 2);
      for (let i = h1.index; i <= h2.index; i++) {
        if (candles[i].low < neckline) {
          neckline = candles[i].low;
          neckIdx = i;
        }
      }
      const height = Math.max(1e-9, (h1.price + h2.price) / 2 - neckline);
      if (highs.length >= 3 && approxEq(highs[highs.length - 3].price, h2.price, 0.0085)) {
        const h0 = highs[highs.length - 3];
        pushPattern(
          `triple-top-${h0.index}-${h2.index}`,
          'Triple Top',
          'REVERSAL',
          'BEARISH',
          82,
          h0.index,
          h2.index,
          neckline,
          neckline - height,
          Math.max(h0.price, h1.price, h2.price),
          [
            { index: h0.index, price: h0.price, label: 'T1' },
            { index: h1.index, price: h1.price, label: 'T2' },
            { index: neckIdx, price: neckline, label: 'Neck' },
            { index: h2.index, price: h2.price, label: 'T3' },
          ],
          'Uchta teng cho‘qqi qarshilikda rad etildi; bo‘yin chizig‘idan pastda yopilish pasayishni tasdiqlaydi.'
        );
      } else {
        pushPattern(
          `double-top-${h1.index}-${h2.index}`,
          'Double Top',
          'REVERSAL',
          'BEARISH',
          78,
          h1.index,
          h2.index,
          neckline,
          neckline - height,
          Math.max(h1.price, h2.price),
          [
            { index: h1.index, price: h1.price, label: 'T1' },
            { index: neckIdx, price: neckline, label: 'Neck' },
            { index: h2.index, price: h2.price, label: 'T2' },
          ],
          'Ikki teng cho‘qqi shakllandi; bo‘yin chizig‘i buzilganda pasayish maqsadi faollashadi.'
        );
      }
    }
  }

  // 2. Double Bottom & Triple Bottom
  if (lows.length >= 2) {
    const l2 = lows[lows.length - 1];
    const l1 = lows[lows.length - 2];
    if (l2.index - l1.index >= 4 && approxEq(l1.price, l2.price, 0.0075)) {
      let neckline = -Infinity;
      let neckIdx = Math.floor((l1.index + l2.index) / 2);
      for (let i = l1.index; i <= l2.index; i++) {
        if (candles[i].high > neckline) {
          neckline = candles[i].high;
          neckIdx = i;
        }
      }
      const height = Math.max(1e-9, neckline - (l1.price + l2.price) / 2);
      if (lows.length >= 3 && approxEq(lows[lows.length - 3].price, l2.price, 0.0085)) {
        const l0 = lows[lows.length - 3];
        pushPattern(
          `triple-bot-${l0.index}-${l2.index}`,
          'Triple Bottom',
          'REVERSAL',
          'BULLISH',
          82,
          l0.index,
          l2.index,
          neckline,
          neckline + height,
          Math.min(l0.price, l1.price, l2.price),
          [
            { index: l0.index, price: l0.price, label: 'B1' },
            { index: l1.index, price: l1.price, label: 'B2' },
            { index: neckIdx, price: neckline, label: 'Neck' },
            { index: l2.index, price: l2.price, label: 'B3' },
          ],
          'Uchta teng tub qo‘llab-quvvatlashda ushlab turildi; neckline yuqoriga yorilishini kuting.'
        );
      } else {
        pushPattern(
          `double-bot-${l1.index}-${l2.index}`,
          'Double Bottom',
          'REVERSAL',
          'BULLISH',
          78,
          l1.index,
          l2.index,
          neckline,
          neckline + height,
          Math.min(l1.price, l2.price),
          [
            { index: l1.index, price: l1.price, label: 'B1' },
            { index: neckIdx, price: neckline, label: 'Neck' },
            { index: l2.index, price: l2.price, label: 'B2' },
          ],
          'Ikki tub (W-shakl) aniqlandi; neckline yorilishi bilan ko‘tarilish maqsadi ishga tushadi.'
        );
      }
    }
  }

  // 3. Head & Shoulders / Inverse Head & Shoulders
  if (highs.length >= 3) {
    const ls = highs[highs.length - 3];
    const hd = highs[highs.length - 2];
    const rs = highs[highs.length - 1];
    if (hd.price > ls.price * 1.002 && hd.price > rs.price * 1.002 && approxEq(ls.price, rs.price, 0.012)) {
      let nl1 = Infinity;
      let nl2 = Infinity;
      for (let i = ls.index; i <= hd.index; i++) nl1 = Math.min(nl1, candles[i].low);
      for (let i = hd.index; i <= rs.index; i++) nl2 = Math.min(nl2, candles[i].low);
      const neckline = (nl1 + nl2) / 2;
      const hHeight = Math.max(1e-9, hd.price - neckline);
      pushPattern(
        `hs-${ls.index}-${rs.index}`,
        'Head and Shoulders',
        'REVERSAL',
        'BEARISH',
        84,
        ls.index,
        rs.index,
        neckline,
        neckline - hHeight,
        hd.price,
        [
          { index: ls.index, price: ls.price, label: 'LS' },
          { index: hd.index, price: hd.price, label: 'Head' },
          { index: rs.index, price: rs.price, label: 'RS' },
        ],
        'Klassik Bosh va Yelkalar (H&S) pasayish burilish figurasi; bo‘yin chizig‘i muhim.'
      );
    }
  }
  if (lows.length >= 3) {
    const ls = lows[lows.length - 3];
    const hd = lows[lows.length - 2];
    const rs = lows[lows.length - 1];
    if (hd.price < ls.price * 0.998 && hd.price < rs.price * 0.998 && approxEq(ls.price, rs.price, 0.012)) {
      let nh1 = -Infinity;
      let nh2 = -Infinity;
      for (let i = ls.index; i <= hd.index; i++) nh1 = Math.max(nh1, candles[i].high);
      for (let i = hd.index; i <= rs.index; i++) nh2 = Math.max(nh2, candles[i].high);
      const neckline = (nh1 + nh2) / 2;
      const hHeight = Math.max(1e-9, neckline - hd.price);
      pushPattern(
        `ihs-${ls.index}-${rs.index}`,
        'Inverse Head and Shoulders',
        'REVERSAL',
        'BULLISH',
        84,
        ls.index,
        rs.index,
        neckline,
        neckline + hHeight,
        hd.price,
        [
          { index: ls.index, price: ls.price, label: 'LS' },
          { index: hd.index, price: hd.price, label: 'Head' },
          { index: rs.index, price: rs.price, label: 'RS' },
        ],
        'Teskari Bosh va Yelkalar ko‘tarilish figurasi; neckline ustida yopilish breakout beradi.'
      );
    }
  }

  // 4. Triangles, Wedges, Channels & Rectangle (using last 2 swing highs and 2 swing lows)
  if (highs.length >= 2 && lows.length >= 2) {
    const hA = highs[highs.length - 2];
    const hB = highs[highs.length - 1];
    const lA = lows[lows.length - 2];
    const lB = lows[lows.length - 1];
    const startIdx = Math.min(hA.index, lA.index);
    const endIdx = Math.max(hB.index, lB.index);

    if (endIdx - startIdx >= 6) {
      const hFlat = approxEq(hA.price, hB.price, 0.0045);
      const lFlat = approxEq(lA.price, lB.price, 0.0045);
      const hRising = hB.price > hA.price * 1.0015;
      const hFalling = hB.price < hA.price * 0.9985;
      const lRising = lB.price > lA.price * 1.0015;
      const lFalling = lB.price < lA.price * 0.9985;
      const span = Math.max(1e-9, Math.max(hA.price, hB.price) - Math.min(lA.price, lB.price));

      if (hFlat && lFlat) {
        pushPattern(
          `rect-${startIdx}-${endIdx}`,
          'Rectangle',
          'BILATERAL',
          'NEUTRAL',
          72,
          startIdx,
          endIdx,
          Math.max(hA.price, hB.price),
          Math.max(hA.price, hB.price) + span * 0.85,
          Math.min(lA.price, lB.price),
          [
            { index: hA.index, price: hA.price, label: 'R1' },
            { index: hB.index, price: hB.price, label: 'R2' },
            { index: lA.index, price: lA.price, label: 'S1' },
            { index: lB.index, price: lB.price, label: 'S2' },
          ],
          'Gorizontal konsolidatsiya (Rectangle) kanali; chegaradan chiqishni kuting.'
        );
      } else if (hFlat && lRising) {
        pushPattern(
          `asc-tri-${startIdx}-${endIdx}`,
          'Ascending Triangle',
          'CONTINUATION',
          'BULLISH',
          77,
          startIdx,
          endIdx,
          Math.max(hA.price, hB.price),
          Math.max(hA.price, hB.price) + span * 0.85,
          lB.price,
          [
            { index: hA.index, price: hA.price, label: 'Top1' },
            { index: hB.index, price: hB.price, label: 'Top2' },
            { index: lA.index, price: lA.price, label: 'HL1' },
            { index: lB.index, price: lB.price, label: 'HL2' },
          ],
          'Ko‘tariluvchi uchburchak: xaridorlar yuqori qarshilikka bosim o‘tkazmoqda.'
        );
      } else if (lFlat && hFalling) {
        pushPattern(
          `desc-tri-${startIdx}-${endIdx}`,
          'Descending Triangle',
          'CONTINUATION',
          'BEARISH',
          77,
          startIdx,
          endIdx,
          Math.min(lA.price, lB.price),
          Math.min(lA.price, lB.price) - span * 0.85,
          hB.price,
          [
            { index: hA.index, price: hA.price, label: 'LH1' },
            { index: hB.index, price: hB.price, label: 'LH2' },
            { index: lA.index, price: lA.price, label: 'Sup1' },
            { index: lB.index, price: lB.price, label: 'Sup2' },
          ],
          'Pasayuvchi uchburchak: sotuvchilar tekis supportga bosimni kuchaytirmoqda.'
        );
      } else if (hFalling && lRising) {
        const isShortPennant = endIdx - startIdx <= 14;
        pushPattern(
          `sym-tri-${startIdx}-${endIdx}`,
          isShortPennant ? 'Pennant' : 'Symmetrical Triangle',
          'BILATERAL',
          candles[startIdx].close > candles[Math.max(0, startIdx - 5)].close ? 'BULLISH' : 'BEARISH',
          74,
          startIdx,
          endIdx,
          hB.price,
          hB.price + span * 0.75,
          lB.price,
          [
            { index: hA.index, price: hA.price, label: 'H1' },
            { index: hB.index, price: hB.price, label: 'H2' },
            { index: lA.index, price: lA.price, label: 'L1' },
            { index: lB.index, price: lB.price, label: 'L2' },
          ],
          isShortPennant
            ? 'Vimpel (Pennant) siqilishi — impuls davom etishi ehtimoli yuqori.'
            : 'Simmetrik uchburchak siqilishi — breakout yo‘nalishi bo‘yicha kirish kutiladi.'
        );
      } else if (hRising && lRising) {
        const slopeH = (hB.price - hA.price) / Math.max(1, hB.index - hA.index);
        const slopeL = (lB.price - lA.price) / Math.max(1, lB.index - lA.index);
        if (slopeL > slopeH * 1.15) {
          pushPattern(
            `rise-wedge-${startIdx}-${endIdx}`,
            'Rising Wedge',
            'REVERSAL',
            'BEARISH',
            75,
            startIdx,
            endIdx,
            lB.price,
            lA.price,
            hB.price,
            [
              { index: hA.index, price: hA.price, label: 'H1' },
              { index: hB.index, price: hB.price, label: 'H2' },
              { index: lA.index, price: lA.price, label: 'L1' },
              { index: lB.index, price: lB.price, label: 'L2' },
            ],
            'Ko‘tariluvchi ponasimon siqilish (Rising Wedge) ko‘pincha pastga yorilish bilan yakunlanadi.'
          );
        } else {
          pushPattern(
            `asc-chan-${startIdx}-${endIdx}`,
            'Ascending Channel',
            'CONTINUATION',
            'BULLISH',
            71,
            startIdx,
            endIdx,
            hB.price,
            hB.price + span * 0.65,
            lB.price,
            [
              { index: lA.index, price: lA.price, label: 'L1' },
              { index: lB.index, price: lB.price, label: 'L2' },
              { index: hA.index, price: hA.price, label: 'H1' },
              { index: hB.index, price: hB.price, label: 'H2' },
            ],
            'Ko‘tariluvchi parallel kanal ichida barqaror trend harakati.'
          );
        }
      } else if (hFalling && lFalling) {
        const slopeH = Math.abs(hB.price - hA.price) / Math.max(1, hB.index - hA.index);
        const slopeL = Math.abs(lB.price - lA.price) / Math.max(1, lB.index - lA.index);
        if (slopeH > slopeL * 1.15) {
          pushPattern(
            `fall-wedge-${startIdx}-${endIdx}`,
            'Falling Wedge',
            'REVERSAL',
            'BULLISH',
            75,
            startIdx,
            endIdx,
            hB.price,
            hA.price,
            lB.price,
            [
              { index: hA.index, price: hA.price, label: 'H1' },
              { index: hB.index, price: hB.price, label: 'H2' },
              { index: lA.index, price: lA.price, label: 'L1' },
              { index: lB.index, price: lB.price, label: 'L2' },
            ],
            'Pasayuvchi ponasimon (Falling Wedge) — yuqoriga burilish breakout ehtimoli yuqori.'
          );
        } else {
          pushPattern(
            `desc-chan-${startIdx}-${endIdx}`,
            'Descending Channel',
            'CONTINUATION',
            'BEARISH',
            71,
            startIdx,
            endIdx,
            lB.price,
            lB.price - span * 0.65,
            hB.price,
            [
              { index: hA.index, price: hA.price, label: 'H1' },
              { index: hB.index, price: hB.price, label: 'H2' },
              { index: lA.index, price: lA.price, label: 'L1' },
              { index: lB.index, price: lB.price, label: 'L2' },
            ],
            'Pasayuvchi kanal ichida tartibli pasayish strukturasi.'
          );
        }
      }
    }
  }

  // 5. Bull Flag & Bear Flag (pole impulse + tight counter-slope pullback)
  if (n >= 22) {
    const poleStart = Math.max(0, n - 18);
    const poleEnd = n - 7;
    const poleMove = candles[poleEnd].close - candles[poleStart].open;
    const poleSize = Math.abs(poleMove);
    const avgBar = candles.slice(poleStart, n).reduce((s, c) => s + (c.high - c.low), 0) / Math.max(1, n - poleStart);
    if (poleSize >= avgBar * 3.0) {
      let flagHi = -Infinity;
      let flagLo = Infinity;
      for (let i = poleEnd; i < n - 1; i++) {
        flagHi = Math.max(flagHi, candles[i].high);
        flagLo = Math.min(flagLo, candles[i].low);
      }
      const flagHeight = flagHi - flagLo;
      if (flagHeight < poleSize * 0.52) {
        if (poleMove > 0 && candles[n - 2].close <= candles[poleEnd].high) {
          pushPattern(
            `bull-flag-${poleStart}-${n - 2}`,
            'Bull Flag',
            'CONTINUATION',
            'BULLISH',
            79,
            poleStart,
            n - 2,
            flagHi,
            flagHi + poleSize * 0.8,
            flagLo,
            [
              { index: poleStart, price: candles[poleStart].low, label: 'Pole0' },
              { index: poleEnd, price: candles[poleEnd].high, label: 'Pole1' },
              { index: n - 2, price: flagLo, label: 'Flag' },
            ],
            'Kuchli o‘sish ustunidan keyingi ixcham korreksiya (Bull Flag).'
          );
        } else if (poleMove < 0 && candles[n - 2].close >= candles[poleEnd].low) {
          pushPattern(
            `bear-flag-${poleStart}-${n - 2}`,
            'Bear Flag',
            'CONTINUATION',
            'BEARISH',
            79,
            poleStart,
            n - 2,
            flagLo,
            flagLo - poleSize * 0.8,
            flagHi,
            [
              { index: poleStart, price: candles[poleStart].high, label: 'Pole0' },
              { index: poleEnd, price: candles[poleEnd].low, label: 'Pole1' },
              { index: n - 2, price: flagHi, label: 'Flag' },
            ],
            'Kuchli tushish ustunidan keyingi qisqa tiklanish bayrog‘i (Bear Flag).'
          );
        }
      }
    }
  }

  // 6. Cup and Handle (U-shaped rounded bottom + shallow pullback handle)
  if (n >= 32) {
    const win = candles.slice(Math.max(0, n - 32));
    const baseOffset = Math.max(0, n - 32);
    const leftRim = Math.max(...win.slice(0, 6).map((c) => c.high));
    const cupMin = Math.min(...win.slice(6, 20).map((c) => c.low));
    const rightRim = Math.max(...win.slice(20, 26).map((c) => c.high));
    const handleMin = Math.min(...win.slice(26).map((c) => c.low));
    const cupDepth = leftRim - cupMin;
    if (cupDepth > 0 && approxEq(leftRim, rightRim, 0.01) && handleMin > cupMin + cupDepth * 0.45 && handleMin < rightRim) {
      pushPattern(
        `cup-handle-${baseOffset}-${n - 2}`,
        'Cup and Handle',
        'CONTINUATION',
        'BULLISH',
        76,
        baseOffset,
        n - 2,
        Math.max(leftRim, rightRim),
        Math.max(leftRim, rightRim) + cupDepth * 0.85,
        handleMin,
        [
          { index: baseOffset + 2, price: leftRim, label: 'Rim1' },
          { index: baseOffset + 13, price: cupMin, label: 'Cup' },
          { index: baseOffset + 23, price: rightRim, label: 'Rim2' },
          { index: n - 2, price: handleMin, label: 'Handle' },
        ],
        'Chashka va tutqich (Cup & Handle) jamg‘arma strukturasi; Rim breakout kutilmoqda.'
      );
    }
  }

  // 7. Harmonic Patterns (ABCD, Gartley, Bat, Butterfly) on alternating causal pivots
  const merged = [...pivots].sort((a, b) => a.index - b.index);
  const alt: Pivot[] = [];
  for (const p of merged) {
    if (alt.length === 0) {
      alt.push(p);
    } else if (alt[alt.length - 1].type === p.type) {
      if ((p.type === 'HIGH' && p.price > alt[alt.length - 1].price) || (p.type === 'LOW' && p.price < alt[alt.length - 1].price)) {
        alt[alt.length - 1] = p;
      }
    } else {
      alt.push(p);
    }
  }

  if (alt.length >= 5) {
    const X = alt[alt.length - 5];
    const A = alt[alt.length - 4];
    const B = alt[alt.length - 3];
    const C = alt[alt.length - 2];
    const D = alt[alt.length - 1];
    const xa = Math.abs(A.price - X.price);
    const ab = Math.abs(B.price - A.price);
    const bc = Math.abs(C.price - B.price);
    const xd = Math.abs(D.price - X.price);
    if (xa > 1e-9 && ab > 1e-9 && bc > 1e-9) {
      const abXa = ab / xa;
      const bcAb = bc / ab;
      const xdXa = xd / xa;
      const isBullHarmonic = X.type === 'LOW' && D.type === 'LOW';
      const isBearHarmonic = X.type === 'HIGH' && D.type === 'HIGH';
      if (isBullHarmonic || isBearHarmonic) {
        let harmonicName: string | null = null;
        if (abXa >= 0.55 && abXa <= 0.69 && xdXa >= 0.72 && xdXa <= 0.85) harmonicName = 'Harmonic Gartley';
        else if (abXa >= 0.35 && abXa <= 0.55 && xdXa >= 0.82 && xdXa <= 0.94) harmonicName = 'Harmonic Bat';
        else if (abXa >= 0.7 && abXa <= 0.85 && xdXa >= 1.18 && xdXa <= 1.38) harmonicName = 'Harmonic Butterfly';
        else if (bcAb >= 0.55 && bcAb <= 0.85) harmonicName = 'Harmonic ABCD';

        if (harmonicName) {
          const bias = isBullHarmonic ? 'BULLISH' : 'BEARISH';
          const move = Math.abs(A.price - D.price);
          pushPattern(
            `harm-${X.index}-${D.index}`,
            harmonicName,
            'HARMONIC',
            bias,
            76,
            X.index,
            D.index,
            C.price,
            bias === 'BULLISH' ? D.price + move * 0.618 : D.price - move * 0.618,
            bias === 'BULLISH' ? Math.min(X.price, D.price) * 0.997 : Math.max(X.price, D.price) * 1.003,
            [
              { index: X.index, price: X.price, label: 'X' },
              { index: A.index, price: A.price, label: 'A' },
              { index: B.index, price: B.price, label: 'B' },
              { index: C.index, price: C.price, label: 'C' },
              { index: D.index, price: D.price, label: 'D' },
            ],
            `${harmonicName} PRZ nuqtasi (AB/XA=${abXa.toFixed(2)}, XD/XA=${xdXa.toFixed(2)}) aniqlandi.`
          );
        }
      }
    }
  }

  // Sort most recent and highest quality first
  detected.sort((a, b) => b.endIndex - a.endIndex || b.strength - a.strength);

  const activePattern =
    detected.find((p) => p.status === 'BREAKOUT_TASDIQLANDI') ??
    detected.find((p) => p.status === 'SHAKLLANMOQDA') ??
    detected[0] ??
    null;

  return {
    patterns: detected.slice(0, 8),
    activePattern,
    confirmedBreakoutCount: detected.filter((p) => p.status === 'BREAKOUT_TASDIQLANDI').length,
    formingCount: detected.filter((p) => p.status === 'SHAKLLANMOQDA').length,
  };
}
