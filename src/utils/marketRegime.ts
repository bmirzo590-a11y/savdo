import {
  CandlePoint,
  CandlestickIntelligenceReport,
  ChartPatternIntelligenceReport,
  MarketRegimeId,
  MarketRegimeReport,
  SmcDeepReport,
  TechnicalIndicatorsReport,
} from '../types/trading';

const REGIME_STRATEGY_MAP: Record<MarketRegimeId, { labelUz: string; selected: string[]; suppressed: string[] }> = {
  'Strong Bullish Trend': {
    labelUz: 'Kuchli Ko‘tarilish Trendi',
    selected: [
      'strat-ema-rsi-div',
      'strat-alorse-supertrend',
      'strat-leviathan-pa',
      'strat-pynecore-hma-flow',
      'strat-smc-luxalgo',
      'strat-scalp-pullback',
    ],
    suppressed: ['strat-vwap-stdev'],
  },
  'Strong Bearish Trend': {
    labelUz: 'Kuchli Pasayish Trendi',
    selected: [
      'strat-ema-rsi-div',
      'strat-alorse-supertrend',
      'strat-leviathan-pa',
      'strat-pynecore-hma-flow',
      'strat-smc-luxalgo',
      'strat-scalp-pullback',
    ],
    suppressed: ['strat-vwap-stdev'],
  },
  'Sideways / Range': {
    labelUz: 'Yonlama / Diapazon (Range)',
    selected: ['strat-vwap-stdev', 'strat-pandas-ta-adx', 'strat-smc-luxalgo', 'strat-azadone-ichimoku-sweep'],
    suppressed: ['strat-alorse-supertrend', 'strat-scalp-pullback', 'strat-pynecore-hma-flow'],
  },
  Accumulation: {
    labelUz: 'Jamg‘arma (Accumulation)',
    selected: ['strat-smc-luxalgo', 'strat-azadone-ichimoku-sweep', 'strat-vwap-stdev', 'strat-leviathan-pa'],
    suppressed: ['strat-scalp-pullback'],
  },
  Distribution: {
    labelUz: 'Tarqatish (Distribution)',
    selected: ['strat-smc-luxalgo', 'strat-azadone-ichimoku-sweep', 'strat-vwap-stdev', 'strat-leviathan-pa'],
    suppressed: ['strat-scalp-pullback'],
  },
  'High Volatility': {
    labelUz: 'Yuqori Volatillik (Turbulent)',
    selected: ['strat-geraked-ut-zlsma', 'strat-smc-luxalgo', 'strat-alorse-supertrend'],
    suppressed: ['strat-scalp-pullback', 'strat-pandas-ta-adx', 'strat-vwap-stdev'],
  },
  'Low Volatility': {
    labelUz: 'Past Volatillik (Siqilish)',
    selected: ['strat-alorse-supertrend', 'strat-vwap-stdev', 'strat-pynecore-hma-flow'],
    suppressed: ['strat-geraked-ut-zlsma'],
  },
  Breakout: {
    labelUz: 'Yorilish (Breakout)',
    selected: [
      'strat-alorse-supertrend',
      'strat-leviathan-pa',
      'strat-geraked-ut-zlsma',
      'strat-pynecore-hma-flow',
      'strat-smc-luxalgo',
    ],
    suppressed: ['strat-vwap-stdev'],
  },
  Reversal: {
    labelUz: 'Burilish (Reversal)',
    selected: [
      'strat-smc-luxalgo',
      'strat-azadone-ichimoku-sweep',
      'strat-ema-rsi-div',
      'strat-pandas-ta-adx',
      'strat-vwap-stdev',
    ],
    suppressed: ['strat-scalp-pullback'],
  },
  'Uncertain Market': {
    labelUz: 'Noaniq / Aralash Bozor',
    selected: ['strat-smc-luxalgo', 'strat-azadone-ichimoku-sweep'],
    suppressed: [
      'strat-scalp-pullback',
      'strat-geraked-ut-zlsma',
      'strat-alorse-supertrend',
      'strat-pynecore-hma-flow',
      'strat-pandas-ta-adx',
      'strat-vwap-stdev',
      'strat-leviathan-pa',
      'strat-ema-rsi-div',
    ],
  },
};

export function detectMarketRegime(
  candles: CandlePoint[],
  tech: TechnicalIndicatorsReport,
  smc: SmcDeepReport,
  chartReport: ChartPatternIntelligenceReport,
  candleReport: CandlestickIntelligenceReport
): MarketRegimeReport {
  const n = candles.length;
  const lastPrice = candles[n - 1]?.close ?? 0;
  const adx = tech.trend.adx14;
  const atrPct = tech.volatility.atrPct;
  const bbWidth = tech.volatility.bbWidthPct;
  const bullishEma = tech.trend.ema20 > tech.trend.ema50 && tech.trend.ema50 > tech.trend.ema200;
  const bearishEma = tech.trend.ema20 < tech.trend.ema50 && tech.trend.ema50 < tech.trend.ema200;

  const volatilityState: MarketRegimeReport['volatilityState'] =
    atrPct >= 1.45 || bbWidth >= 3.2 ? 'YUQORI' : atrPct <= 0.25 || tech.momentum.ttmSqueezeOn ? 'PAST' : 'NORMAL';

  let regime: MarketRegimeId = 'Uncertain Market';
  let rationaleUz = '';

  const confirmedBreakout = chartReport.patterns.find((p) => p.status === 'BREAKOUT_TASDIQLANDI');
  const confirmedReversalCandle =
    candleReport.latestConfirmedPattern && candleReport.latestConfirmedPattern.category === 'REVERSAL';
  const confirmedReversalChart = chartReport.patterns.find(
    (p) => p.category === 'REVERSAL' && p.status === 'BREAKOUT_TASDIQLANDI'
  );

  if (atrPct >= 1.85) {
    regime = 'High Volatility';
    rationaleUz = `ATR(${atrPct.toFixed(2)}%) juda yuqori — keskin narx sakrashlari sababli faqat keng stop-loss va himoyalangan trend strategiyalari tanlandi.`;
  } else if (confirmedBreakout && tech.volume.volumeRatio >= 1.1) {
    regime = 'Breakout';
    rationaleUz = `${confirmedBreakout.name} breakout darajasi hajm (${tech.volume.volumeRatio.toFixed(2)}x) bilan yorildi.`;
  } else if (
    smc.mssDetected !== 'YO‘Q' ||
    smc.recentSweep !== 'YO‘Q' ||
    confirmedReversalChart ||
    (confirmedReversalCandle && (tech.momentum.rsi14 > 65 || tech.momentum.rsi14 < 35))
  ) {
    regime = 'Reversal';
    rationaleUz = `Tuzilmaviy burilish belgilari (MSS=${smc.mssDetected}, Sweep=${smc.recentSweep}) aniqlandi.`;
  } else if (adx >= 25 && (bullishEma || (lastPrice > tech.trend.ema50 && tech.trend.plusDi > tech.trend.minusDi + 5))) {
    regime = 'Strong Bullish Trend';
    rationaleUz = `ADX=${adx.toFixed(1)} (+DI>${tech.trend.minusDi.toFixed(1)}) va EMA tartibi kuchli ko‘tarilish trendini tasdiqlaydi.`;
  } else if (adx >= 25 && (bearishEma || (lastPrice < tech.trend.ema50 && tech.trend.minusDi > tech.trend.plusDi + 5))) {
    regime = 'Strong Bearish Trend';
    rationaleUz = `ADX=${adx.toFixed(1)} (-DI>${tech.trend.plusDi.toFixed(1)}) va EMA tartibi kuchli pasayish trendini tasdiqlaydi.`;
  } else if (tech.momentum.ttmSqueezeOn || bbWidth <= 0.75) {
    regime = 'Low Volatility';
    rationaleUz = `TTM Squeeze faol (BB kengligi ${bbWidth.toFixed(2)}%) — bozor siqilishda, breakoutga tayyorlanmoqda.`;
  } else if (adx < 18 && smc.zone === 'Discount' && tech.volume.obvTrend === 'OSHISH') {
    regime = 'Accumulation';
    rationaleUz = `Discount zonasida ADX=${adx.toFixed(1)} pastligi bilan OBV o‘sishi — yirik o‘yinchilar jamg‘arma fazasi ehtimoli.`;
  } else if (adx < 18 && smc.zone === 'Premium' && tech.volume.obvTrend === 'PASAYISH') {
    regime = 'Distribution';
    rationaleUz = `Premium zonasida OBV pasayishi — taqsimlash (Distribution) ehtimoli yuqori.`;
  } else if (adx < 20) {
    regime = 'Sideways / Range';
    rationaleUz = `ADX=${adx.toFixed(1)} (<20) — yo‘nalishsiz diapazon; trend ergashuvchi tizimlar o‘chirilib, mean-reversion/SMC tanlandi.`;
  } else {
    regime = 'Uncertain Market';
    rationaleUz = 'Trend va momentum ko‘rsatkichlari o‘zaro ziddiyatli — himoya rejimi faol.';
  }

  const mapping = REGIME_STRATEGY_MAP[regime];
  return {
    regime,
    labelUz: mapping.labelUz,
    trendStrength: Math.min(100, Math.round(adx * 2)),
    volatilityState,
    selectedStrategyIds: mapping.selected,
    suppressedStrategyIds: mapping.suppressed,
    rationaleUz,
  };
}
