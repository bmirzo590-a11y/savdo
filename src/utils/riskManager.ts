import { MarketPair, RiskEvaluationResult, RiskGuardSettings } from '../types/trading';

export interface EvaluateTradeRiskInput {
  pair: MarketPair;
  direction: 'BUY' | 'SELL' | 'WAIT' | 'NO TRADE';
  entryPrice: number;
  structureInvalidation?: number | null;
  atr14: number;
  equity: number;
  riskGuard: RiskGuardSettings;
  riskPct?: number;
  activeOpenCount: number;
  realizedTodayUsd: number;
  peakEquityUsd?: number;
}

export function evaluateTradeRisk(input: EvaluateTradeRiskInput): RiskEvaluationResult {
  const {
    pair,
    direction,
    entryPrice,
    structureInvalidation,
    atr14,
    equity,
    riskGuard,
    activeOpenCount,
    realizedTodayUsd,
    peakEquityUsd,
  } = input;

  const riskPct = input.riskPct ?? riskGuard.defaultRiskPct ?? 1.0;
  const safePrice = Math.max(1e-6, entryPrice || pair.price);
  const safeAtr = atr14 > 0 ? atr14 : safePrice * 0.004;
  const isSell = direction === 'SELL';

  const atrMult = 1.6;
  const atrStopDistance = safeAtr * atrMult;
  const atrStopLoss = isSell ? safePrice + atrStopDistance : Math.max(0.00001, safePrice - atrStopDistance);

  // Combine ATR SL with structure invalidation (choose protective stop within sensible range)
  let dynamicStopLoss = atrStopLoss;
  if (structureInvalidation && Number.isFinite(structureInvalidation)) {
    if (!isSell && structureInvalidation < safePrice) {
      const dist = safePrice - structureInvalidation;
      if (dist >= safeAtr * 0.6 && dist <= safeAtr * 3.2) {
        dynamicStopLoss = Math.min(atrStopLoss, structureInvalidation);
      }
    } else if (isSell && structureInvalidation > safePrice) {
      const dist = structureInvalidation - safePrice;
      if (dist >= safeAtr * 0.6 && dist <= safeAtr * 3.2) {
        dynamicStopLoss = Math.max(atrStopLoss, structureInvalidation);
      }
    }
  }

  const slDistance = Math.max(safePrice * 0.0005, Math.abs(safePrice - dynamicStopLoss));
  const minRr = 2.0;
  const takeProfit = isSell ? Math.max(0.00001, safePrice - slDistance * minRr) : safePrice + slDistance * minRr;
  const trailingStopDistance = safeAtr * 1.3;
  const breakEvenPrice = isSell ? safePrice - slDistance * 1.0 : safePrice + slDistance * 1.0;

  // Risk & Position sizing using broker contractSize & quote currency conversion
  const safeEquity = Math.max(100, equity);
  const riskAmountUsd = safeEquity * (riskPct / 100);
  const quoteConversion = pair.quote === 'JPY' ? 1 / Math.max(1, safePrice) : 1;
  const riskPerOneLotUsd = Math.max(1e-6, slDistance * pair.contractSize * quoteConversion);
  const rawLot = riskAmountUsd / riskPerOneLotUsd;
  const recommendedLot = Math.max(0.01, Math.min(25, Math.round(rawLot * 100) / 100));

  // Risk & Protection Filters
  const maxSpread = riskGuard.maxSpreadPoints ?? 300;
  const maxVolPct = riskGuard.maxVolatilityAtrPct ?? 2.5;
  const atrPct = (safeAtr / safePrice) * 100;

  const spreadOk = pair.spreadPoints <= maxSpread;
  const volatilityOk = atrPct <= maxVolPct;
  const dailyLossOk = realizedTodayUsd > -Math.abs(riskGuard.dailyMaxLossUsdt);
  const peak = Math.max(safeEquity, peakEquityUsd ?? safeEquity);
  const currentDdPct = peak > 0 ? ((peak - safeEquity) / peak) * 100 : 0;
  const drawdownOk = !riskGuard.autoKillOnDrawdown || currentDdPct < riskGuard.drawdownLimitPct;
  const maxPosOk = activeOpenCount < riskGuard.maxOpenPositions;

  const blockReasons: string[] = [];
  if (!spreadOk) blockReasons.push(`Spred juda keng (${pair.spreadPoints} > ${maxSpread} pt)`);
  if (!volatilityOk) blockReasons.push(`Volatillik haddan ziyod yuqori (ATR ${atrPct.toFixed(2)}% > ${maxVolPct}%)`);
  if (!dailyLossOk) blockReasons.push(`Kunlik zarar limiti (${riskGuard.dailyMaxLossUsdt} USDT) to‘lgan`);
  if (!drawdownOk) blockReasons.push(`Maksimal Drawdown limiti (${riskGuard.drawdownLimitPct}%) himoyasi faol`);
  if (!maxPosOk) blockReasons.push(`Maksimal ochiq pozitsiyalar limiti (${riskGuard.maxOpenPositions}) to‘lgan`);

  return {
    atr14: safeAtr,
    atrStopLoss,
    dynamicStopLoss,
    takeProfit,
    trailingStopDistance,
    breakEvenPrice,
    recommendedLot,
    riskAmountUsd,
    riskPct,
    spreadPoints: pair.spreadPoints,
    spreadOk,
    volatilityOk,
    dailyLossOk,
    drawdownOk,
    overallAllowed: blockReasons.length === 0,
    blockReasons,
  };
}
