import {
  IntelligentDecisionReport,
  LearningOutcome,
  LearningPerformanceBucket,
  LearningRecord,
  LearningSystemReport,
  Position,
} from '../types/trading';

const LEARNING_STORAGE_KEY = 'tk_ai_learning_journal_v1';

export function loadLearningJournal(): LearningRecord[] {
  try {
    if (typeof window === 'undefined') return [];
    const raw = window.localStorage.getItem(LEARNING_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveLearningJournal(records: LearningRecord[]): void {
  try {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(LEARNING_STORAGE_KEY, JSON.stringify(records.slice(0, 300)));
  } catch {
    // Ignore storage quota errors
  }
}

export function createLearningRecordFromDecision(
  decision: IntelligentDecisionReport,
  latestPatternName: string,
  entryPrice: number
): LearningRecord {
  const topActive =
    decision.strategyDecisions.find(
      (s) => s.selectedForRegime && (s.signal === decision.finalAction || decision.finalAction === 'WAIT')
    ) ?? decision.strategyDecisions[0];

  return {
    id: `lr-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    timestamp: new Date().toISOString(),
    symbol: decision.symbol,
    timeframe: decision.timeframe,
    action: decision.finalAction,
    strategyId: topActive?.strategyId ?? 'multi-brain',
    strategyName: topActive?.strategyName ?? 'Trade Killer AI Brain',
    candlestickPattern: latestPatternName || 'Standart sham',
    regime: decision.regime.regime,
    analyticalScore: decision.analyticalScore,
    entryPrice,
    stopLoss: decision.riskEvaluation.dynamicStopLoss,
    takeProfit: decision.riskEvaluation.takeProfit,
    outcome: 'PENDING',
    pnlUsd: 0,
    rMultiple: 0,
    notesUz: decision.explanationUz,
  };
}

export function resolveLearningRecord(
  records: LearningRecord[],
  recordId: string,
  outcome: LearningOutcome,
  pnlUsd: number
): LearningRecord[] {
  const updated = records.map((rec) => {
    if (rec.id !== recordId) return rec;
    const riskDist = Math.max(1e-9, Math.abs(rec.entryPrice - rec.stopLoss));
    const estimatedRiskUsd = Math.max(10, riskDist * 10);
    const rMultiple =
      outcome === 'WIN'
        ? Math.max(0.5, Number((Math.abs(pnlUsd) / estimatedRiskUsd).toFixed(2)))
        : outcome === 'LOSS'
          ? -Math.max(0.5, Number((Math.abs(pnlUsd) / estimatedRiskUsd).toFixed(2)))
          : 0;
    return {
      ...rec,
      outcome,
      pnlUsd,
      rMultiple: Number.isFinite(rMultiple) ? rMultiple : outcome === 'WIN' ? 2.0 : outcome === 'LOSS' ? -1.0 : 0,
    };
  });
  saveLearningJournal(updated);
  return updated;
}

export function syncClosedPositionsToJournal(
  records: LearningRecord[],
  positions: Position[]
): LearningRecord[] {
  const existingIds = new Set(records.map((r) => r.id));
  const newEntries: LearningRecord[] = [];

  for (const pos of positions) {
    if (pos.status !== 'CLOSED') continue;
    const syntheticId = `pos-${pos.id}`;
    if (existingIds.has(syntheticId)) continue;
    const pnl = pos.realizedPnl ?? pos.profit ?? 0;
    const outcome: LearningOutcome = pnl > 1 ? 'WIN' : pnl < -1 ? 'LOSS' : 'BREAKEVEN';
    const slDist = pos.stopLoss ? Math.abs(pos.entryPrice - pos.stopLoss) : pos.entryPrice * 0.005;
    const riskUsd = Math.max(1, slDist * pos.lotSize * 100);
    const rMult = Number((pnl / riskUsd).toFixed(2));

    newEntries.push({
      id: syntheticId,
      timestamp: pos.closedAt || pos.openedAt || new Date().toISOString(),
      symbol: pos.symbol,
      timeframe: 'M15',
      action: pos.side === 'LONG' ? 'BUY' : 'SELL',
      strategyId: 'mt5-position',
      strategyName: pos.strategyName || 'MT5 Savdo',
      candlestickPattern: 'MT5 Tarixiy Yopilish',
      regime: 'Uncertain Market',
      analyticalScore: 70,
      entryPrice: pos.entryPrice,
      stopLoss: pos.stopLoss ?? pos.entryPrice,
      takeProfit: pos.takeProfit ?? pos.entryPrice,
      outcome,
      pnlUsd: pnl,
      rMultiple: Number.isFinite(rMult) ? rMult : 0,
      notesUz: `MT5 yopilgan savdo sinxronizatsiyasi (${pos.symbol}, PnL: ${pnl.toFixed(2)})`,
    });
  }

  if (newEntries.length === 0) return records;
  const merged = [...newEntries, ...records];
  saveLearningJournal(merged);
  return merged;
}

function buildBuckets(records: LearningRecord[], selector: (r: LearningRecord) => string): LearningPerformanceBucket[] {
  const map = new Map<string, LearningRecord[]>();
  for (const r of records) {
    const k = selector(r) || 'Noma’lum';
    const arr = map.get(k) ?? [];
    arr.push(r);
    map.set(k, arr);
  }

  const buckets: LearningPerformanceBucket[] = [];
  for (const [key, list] of map.entries()) {
    const resolved = list.filter((r) => r.outcome !== 'PENDING');
    const wins = resolved.filter((r) => r.outcome === 'WIN').length;
    const losses = resolved.filter((r) => r.outcome === 'LOSS').length;
    const winRatePct = resolved.length > 0 ? Number(((wins / resolved.length) * 100).toFixed(1)) : 0;
    const netPnlUsd = Number(resolved.reduce((s, r) => s + r.pnlUsd, 0).toFixed(2));
    const avgR =
      resolved.length > 0
        ? Number((resolved.reduce((s, r) => s + r.rMultiple, 0) / resolved.length).toFixed(2))
        : 0;

    buckets.push({
      key,
      total: list.length,
      wins,
      losses,
      winRatePct,
      netPnlUsd,
      avgR,
    });
  }

  return buckets.sort((a, b) => b.netPnlUsd - a.netPnlUsd || b.winRatePct - a.winRatePct);
}

export function summarizeLearningPerformance(records: LearningRecord[]): LearningSystemReport {
  const resolved = records.filter((r) => r.outcome !== 'PENDING');
  const wins = resolved.filter((r) => r.outcome === 'WIN').length;
  const overallWinRatePct =
    resolved.length > 0 ? Number(((wins / resolved.length) * 100).toFixed(1)) : null;

  const byStrategy = buildBuckets(records, (r) => r.strategyName);
  const byPattern = buildBuckets(records, (r) => r.candlestickPattern);
  const byTimeframe = buildBuckets(records, (r) => r.timeframe);
  const byRegime = buildBuckets(records, (r) => r.regime);

  const recommendationsUz: string[] = [];
  const bestStrat = byStrategy.find((b) => b.wins + b.losses >= 2);
  const worstStrat = [...byStrategy].reverse().find((b) => b.wins + b.losses >= 2 && b.winRatePct < 45);
  const bestPattern = byPattern.find((b) => b.wins + b.losses >= 2);

  if (bestStrat) {
    recommendationsUz.push(
      `Eng natijador strategiya: "${bestStrat.key}" (${bestStrat.winRatePct}% yutuq, O‘rtacha ${bestStrat.avgR}R). Parametrlar faqat Out-of-Sample backtestdan keyin kengaytirilishi mumkin.`
    );
  }
  if (worstStrat) {
    recommendationsUz.push(
      `Diqqat: "${worstStrat.key}" strategiyasi past natija (${worstStrat.winRatePct}%) ko‘rsatmoqda. Avval tarixiy Backtest va OOS tekshiruvi bilan filtrlarni qayta sinab ko‘ring.`
    );
  }
  if (bestPattern) {
    recommendationsUz.push(
      `Eng samarali sham patterni: ${bestPattern.key} (${bestPattern.winRatePct}% win rate).`
    );
  }
  if (resolved.length < 30) {
    recommendationsUz.push(
      `Kalibratsiya holati: Hozircha ${resolved.length}/30 yopilgan signal mavjud. Yetarli namuna to‘planmaguncha parametrlar avtomatik o‘zgartirilmaydi.`
    );
  }

  return {
    totalLogged: records.length,
    resolvedCount: resolved.length,
    overallWinRatePct,
    byStrategy,
    byPattern,
    byTimeframe,
    byRegime,
    recommendationsUz,
    calibrationSampleReady: resolved.length >= 30,
  };
}
