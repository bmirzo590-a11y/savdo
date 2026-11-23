import crypto from 'node:crypto';
import { Timeframe } from '../src/types/trading';
import {
  AiChatId,
  AiChatMessageRecord,
  AiChatTriggerType,
  AiStructuredTradeDecision,
  AiTradeManagerProposal,
  ALL_AI_CHAT_IDS,
  LocalMemoryDatabase,
  PersistentOrderRecord,
  StrategySelfEvalMemoryRecord,
  UnifiedAnalysisRecord,
  loadMemoryDb,
  pushNotification,
  saveMemoryDb,
} from './localMemory';
import {
  closePersistentOrder,
  computeAccountSummary,
  runRealInstrumentAnalysis,
  updatePersistentOrderTargets,
} from './analysisEngine';
import { getSupportedInstruments, resolveExactBrokerSymbol } from './marketDataService';
import {
  generateRealLlmJson,
  generateRealLlmText,
  resolveActiveLlmProvider,
  Type,
} from './llmProvider';

export interface AiChatDefinition {
  id: AiChatId;
  title: string;
  shortTitle: string;
  roleUz: string;
  descriptionUz: string;
  quickPrompts: string[];
}

export const AI_CHAT_CATALOG: AiChatDefinition[] = [
  {
    id: 'chief_analyst',
    title: 'AI Chief Analyst',
    shortTitle: 'Chief Analyst',
    roleUz: 'Asosiy AI fikri va umumiy bozor xulosalari',
    descriptionUz:
      'Barcha jonli instrumentlar, MTF tuzilma, strategiya konsensusi va xavflarni birlashtirib asosiy qaror chiqaradi.',
    quickPrompts: [
      'Hozirgi bozorda eng kuchli va xavfsiz imkoniyat qaysi instrumentda?',
      'Tanlangan instrument bo‘yicha BUY, SELL yoki WAIT qarorini to‘liq asosla.',
      'Qaysi omillar hozirgi asosiy g‘oyaga qarshi ishlamoqda?',
    ],
  },
  {
    id: 'market_intelligence',
    title: 'Market Intelligence',
    shortTitle: 'Market Intel',
    roleUz: 'Instrumentlar, real OHLC, SMC/ICT va bozor rejimi',
    descriptionUz:
      'Real OHLC shamlari, M1–W1 timeframe mosligi, Order Block/FVG/Liquidity va bozor rejimini chuqur tahlil qiladi.',
    quickPrompts: [
      'Tanlangan instrumentda joriy bozor rejimi va MTF tuzilma qanday?',
      'SMC/ICT zonalari (BOS, CHoCH, OB, FVG) va sham patternlari nimani ko‘rsatmoqda?',
      'Qaysi narx darajasida joriy tahlil ssenariysi bekor bo‘ladi?',
    ],
  },
  {
    id: 'strategy_analyst',
    title: 'Strategy Analyst',
    shortTitle: 'Strategy AI',
    roleUz: '18 strategiyani baholash va taqqoslash',
    descriptionUz:
      'Strategy Ensemble ovozlari, vaznli ballar, bir oila strategiyalari va ziddiyatlarni solishtiradi.',
    quickPrompts: [
      'Hozirgi bozor rejimiga qaysi strategiyalar eng mos kelmoqda?',
      'Strategiyalar o‘rtasida qanday ziddiyatlar bor va nima uchun?',
      'Qaysi strategiyalar signal berdi va ularning dalillari qanchalik ishonchli?',
    ],
  },
  {
    id: 'risk_intelligence',
    title: 'Risk Intelligence',
    shortTitle: 'Risk AI',
    roleUz: 'Portfolio risk, exposure, drawdown va margin nazorati',
    descriptionUz:
      '8-o‘lchamli Risk Engine, kunlik zarar limiti, marja yuki, korrelyatsiya va lot hajmini baholaydi.',
    quickPrompts: [
      'Hozirgi portfolio riski, drawdown va marja yuki xavfsiz chegaradami?',
      'Yangi pozitsiya ochish uchun risk byudjeti va maksimal lot qancha?',
      'Korrelyatsiya yoki volatillik bo‘yicha qanday yashirin xavflar bor?',
    ],
  },
  {
    id: 'trade_manager',
    title: 'Trade Manager',
    shortTitle: 'Trade Mgr',
    roleUz: 'Ochiq pozitsiyalarni kuzatish va boshqarish',
    descriptionUz:
      'Ochiq orderlarni tahlil qilib Hold, SL/TP yangilash, Break-Even, Trailing Stop yoki yopish bo‘yicha Risk-tasdiqli tavsiya beradi.',
    quickPrompts: [
      'Barcha ochiq pozitsiyalarni ko‘rib chiq: ushlab turaylikmi yoki SL/TP o‘zgartiraylikmi?',
      'Qaysi pozitsiyani Break-Even yoki Trailing Stop ga o‘tkazish ma’qul?',
      'Ochiq pozitsiyalarda bozor tuzilmasi buzilgani bormi?',
    ],
  },
  {
    id: 'self_evaluation',
    title: 'Self-Evaluation',
    shortTitle: 'Self-Eval',
    roleUz: 'Yopilgan savdolarni tahlil qilish va Strategy Memory',
    descriptionUz:
      'Yopilgan savdolarni (Entry/Exit, P/L, MFE/MAE, asl tahlil) tekshirib, strategiya xotirasiga xolis saboq yozadi.',
    quickPrompts: [
      'Oxirgi yopilgan savdoni MFE/MAE va asl tahlil nuqtai nazaridan bahola.',
      'Yopilgan savdolardagi asosiy xato yoki kuchli jihatlar nimalar?',
      'Keyingi tahlillarda nimaga e’tibor berishimiz kerak (kodni o‘zgartirmasdan)?',
    ],
  },
];

export const MAX_DATA_FRESHNESS_SEC = 180;
const MAX_MESSAGES_PER_CHAT = 80;
const AUTONOMOUS_CHAT_COOLDOWN_MS = 120_000;

interface QueuedAutonomousEvent {
  chatId: AiChatId;
  triggerType: AiChatTriggerType;
  symbol?: string;
  timeframe?: Timeframe;
  orderId?: string;
  dedupKey: string;
  eventNoteUz: string;
  autoExecuteTradeManager?: boolean;
}

const eventQueue: QueuedAutonomousEvent[] = [];
let queueRunning = false;
const lastAutonomousRunByChat: Partial<Record<AiChatId, number>> = {};
let lastQueueProcessedAt: string | null = null;
let totalAutonomousProcessed = 0;
let totalDuplicatesSkipped = 0;

export function getAiChatQueueStatus() {
  return {
    pendingCount: eventQueue.length,
    processing: queueRunning,
    lastProcessedAt: lastQueueProcessedAt,
    totalAutonomousProcessed,
    totalDuplicatesSkipped,
  };
}

export function isValidAiChatId(val: string): val is AiChatId {
  return ALL_AI_CHAT_IDS.includes(val as AiChatId);
}

function computeEffectiveFreshnessSec(analysis: UnifiedAnalysisRecord | undefined): number | null {
  if (!analysis || analysis.status !== 'OK' || !analysis.timestamp) return null;
  const ageFromRun = Math.max(0, Math.round((Date.now() - new Date(analysis.timestamp).getTime()) / 1000));
  const dataFresh = analysis.dataFreshnessSec ?? 0;
  return ageFromRun + Math.max(0, dataFresh);
}

function isAnalysisFresh(analysis: UnifiedAnalysisRecord | undefined): boolean {
  const sec = computeEffectiveFreshnessSec(analysis);
  return sec !== null && sec <= MAX_DATA_FRESHNESS_SEC;
}

function buildChatHistoryTurns(db: LocalMemoryDatabase, chatId: AiChatId): { role: 'user' | 'model'; text: string }[] {
  const existing = db.aiChats[chatId] ?? [];
  const relevant = existing
    .filter((m) => m.role === 'user' || (m.role === 'ai' && m.generationStatus === 'GENERATED'))
    .slice(-6);

  return relevant.map((m) => ({
    role: m.role === 'user' ? ('user' as const) : ('model' as const),
    text:
      m.role === 'ai'
        ? `[OLDINGI AI TAHLILI · ${m.createdAt} · AnalysisID:${m.analysisId ?? 'N/A'} — ESLATMA: BU TARIXIY XOTIRA, JORIY NARX EMAS]\n${m.contentUz.slice(0, 900)}`
        : m.contentUz.slice(0, 500),
  }));
}

function appendChatMessage(db: LocalMemoryDatabase, msg: AiChatMessageRecord): AiChatMessageRecord {
  if (!db.aiChats[msg.chatId]) {
    db.aiChats[msg.chatId] = [];
  }
  db.aiChats[msg.chatId].push(msg);
  if (db.aiChats[msg.chatId].length > MAX_MESSAGES_PER_CHAT) {
    db.aiChats[msg.chatId] = db.aiChats[msg.chatId].slice(-MAX_MESSAGES_PER_CHAT);
  }
  if (msg.dedupKey) {
    db.aiChatDedupIndex[msg.dedupKey] = msg.createdAt;
    const keys = Object.keys(db.aiChatDedupIndex);
    if (keys.length > 350) {
      for (const oldKey of keys.slice(0, keys.length - 300)) {
        delete db.aiChatDedupIndex[oldKey];
      }
    }
  }
  return msg;
}

function syncLlmHealth(
  db: LocalMemoryDatabase,
  result: { ok: boolean; generationStatus: string; provider: string | null; model: string | null; error: string | null }
) {
  const providerLabel = result.provider
    ? `${result.provider}${result.model ? ` (${result.model})` : ''}`
    : null;
  db.llmHealth = {
    status: result.ok
      ? 'ACTIVE'
      : result.generationStatus === 'AI_UNAVAILABLE'
        ? 'UNCONFIGURED'
        : 'ERROR',
    provider: providerLabel,
    lastCheckedAt: new Date().toISOString(),
    lastError: result.error,
  };
}

function buildCompactAnalysisContext(anl: UnifiedAnalysisRecord) {
  const effFresh = computeEffectiveFreshnessSec(anl);
  const fresh = effFresh !== null && effFresh <= MAX_DATA_FRESHNESS_SEC;
  return {
    analysisId: anl.analysisId,
    symbol: anl.symbol,
    timeframe: anl.timeframe,
    timestamp: anl.timestamp,
    dataSource: anl.dataSource,
    effectiveFreshnessSec: effFresh,
    isFreshLiveData: fresh,
    latestPrice: fresh ? anl.latestPrice : null,
    staleNotice: fresh ? null : `DIQQAT: Ma'lumot eskirgan (${effFresh ?? 'N/A'}s) — joriy narx deb ishlatma!`,
    change24hPct: anl.change24hPct,
    marketRegime: anl.marketRegime,
    marketRegimeUz: anl.marketRegimeUz,
    marketStructure: anl.marketStructure,
    candlestickSummary: anl.candlestickSummary,
    smcSummary: anl.smcSummary,
    mtf: {
      macroBias: anl.mtfSummary.macroBias,
      setupBias: anl.mtfSummary.setupBias,
      entryBias: anl.mtfSummary.entryBias,
      alignmentPct: anl.mtfSummary.alignmentPct,
      conflictDetected: anl.mtfSummary.conflictDetected,
      availableTimeframes: anl.mtfSummary.availableTimeframes,
      entries: anl.mtfSummary.entries.slice(0, 8),
    },
    indicators: anl.indicators,
    ensemble: anl.ensemble,
    topStrategyVotes: anl.strategyResults
      .filter((s) => s.enabled && s.approved)
      .map((s) => ({
        name: s.strategyName,
        category: s.category,
        signal: s.signal,
        confidence: s.confidence,
        regimeMatched: s.regimeMatched,
        evidenceUz: s.evidenceUz,
      })),
    deterministicLevels: {
      decision: anl.decision,
      confidence: anl.confidence,
      entry: anl.entry,
      stopLoss: anl.stopLoss,
      takeProfit: anl.takeProfit,
      riskRewardRatio: anl.riskRewardRatio,
    },
    risk: anl.risk,
  };
}

function buildGroundedContextForChat(params: {
  db: LocalMemoryDatabase;
  chatId: AiChatId;
  symbol?: string;
  orderId?: string;
}) {
  const { db, chatId } = params;
  const nowIso = new Date().toISOString();
  const acct = computeAccountSummary(db);
  const allAnalyses = Object.values(db.unifiedAnalyses);
  const freshAnalyses = allAnalyses.filter((a) => isAnalysisFresh(a));
  const staleCount = allAnalyses.length - freshAnalyses.length;

  const defaultBrokerSym = getSupportedInstruments()[0]?.brokerSymbol || 'XAUUSD';
  const targetSymbol = resolveExactBrokerSymbol(
    params.symbol ||
      freshAnalyses[0]?.symbol ||
      allAnalyses[0]?.symbol ||
      defaultBrokerSym
  );
  const targetAnl = db.unifiedAnalyses[targetSymbol];
  const targetFreshSec = computeEffectiveFreshnessSec(targetAnl);
  const openOrders = db.orders.filter((o) => o.status === 'OPEN' || o.status === 'PENDING');
  const closedOrders = db.orders.filter((o) => o.status === 'CLOSED');
  const targetOrder =
    (params.orderId ? db.orders.find((o) => o.id === params.orderId) : undefined) ||
    (chatId === 'self_evaluation' ? closedOrders[0] : openOrders[0]) ||
    null;

  const sourceReferences: string[] = [];
  if (targetAnl && targetAnl.status === 'OK') {
    sourceReferences.push(`${targetAnl.dataSource} (${targetAnl.symbol} ${targetAnl.timeframe})`);
  } else if (freshAnalyses.length > 0) {
    sourceReferences.push(`${freshAnalyses.length} jonli OHLC instrument`);
  }
  sourceReferences.push('18-Strategy Ensemble');
  sourceReferences.push('8-Dim Risk Engine');
  if (chatId === 'trade_manager' || openOrders.length > 0) {
    sourceReferences.push(`Orders DB (${openOrders.length} ochiq)`);
  }
  if (chatId === 'self_evaluation') {
    sourceReferences.push(`Closed Trades (${closedOrders.length}) & Strategy Memory (${db.strategySelfEvalMemory.length})`);
  }

  const dataSnapshotRef = `snap-${chatId}-${targetSymbol}-${Date.now().toString(36)}`;
  const analysisId =
    (chatId === 'self_evaluation' ? targetOrder?.analysisId : null) ??
    targetAnl?.analysisId ??
    freshAnalyses[0]?.analysisId ??
    null;

  let contextPayload: Record<string, unknown> = {
    currentTimestampIso: nowIso,
    freshDataMaxAgeSec: MAX_DATA_FRESHNESS_SEC,
    freshInstrumentsCount: freshAnalyses.length,
    staleOrUnavailableCount: staleCount,
    controlMode: {
      autonomousMode: db.control.autonomousMode,
      stopNewTrades: db.control.stopNewTrades,
      scannerStatus: db.control.scannerStatus,
      aiAutoSlTpEnabled: db.control.aiAutoSlTpEnabled,
    },
  };

  if (chatId === 'chief_analyst') {
    contextPayload = {
      ...contextPayload,
      focusInstrument: targetAnl ? buildCompactAnalysisContext(targetAnl) : null,
      marketOverviewFresh: freshAnalyses.map((a) => ({
        symbol: a.symbol,
        analysisId: a.analysisId,
        timeframe: a.timeframe,
        price: a.latestPrice,
        decision: a.decision,
        confidence: a.confidence,
        regimeUz: a.marketRegimeUz,
        mtfAlignPct: a.mtfSummary.alignmentPct,
        mtfConflict: a.mtfSummary.conflictDetected,
        votes: `B:${a.ensemble.buyVotes}/S:${a.ensemble.sellVotes}/W:${a.ensemble.waitVotes}`,
        riskAllowed: a.risk?.allowed ?? false,
        freshnessSec: computeEffectiveFreshnessSec(a),
      })),
      accountSummary: acct,
      openPositionsSummary: openOrders.slice(0, 8).map((o) => ({
        id: o.id,
        symbol: o.symbol,
        side: o.side,
        entryPrice: o.entryPrice,
        markPrice: o.markPrice,
        stopLoss: o.stopLoss,
        takeProfit: o.takeProfit,
        riskPct: o.riskPct,
      })),
      recentSelfEvalLessons: db.strategySelfEvalMemory.slice(0, 4).map((m) => ({
        symbol: m.symbol,
        realizedPnlUsd: m.realizedPnlUsd,
        lessonSummaryUz: m.lessonSummaryUz,
      })),
    };
  } else if (chatId === 'market_intelligence') {
    contextPayload = {
      ...contextPayload,
      primaryInstrument: targetAnl ? buildCompactAnalysisContext(targetAnl) : null,
      otherFreshInstruments: freshAnalyses
        .filter((a) => a.symbol !== targetSymbol)
        .slice(0, 6)
        .map((a) => ({
          symbol: a.symbol,
          price: a.latestPrice,
          change24hPct: a.change24hPct,
          regimeUz: a.marketRegimeUz,
          structure: a.marketStructure,
          smcSummary: a.smcSummary,
          candlestickSummary: a.candlestickSummary,
          freshnessSec: computeEffectiveFreshnessSec(a),
        })),
    };
  } else if (chatId === 'strategy_analyst') {
    contextPayload = {
      ...contextPayload,
      focusInstrument: targetAnl ? buildCompactAnalysisContext(targetAnl) : null,
      ensembleStrategiesCatalog: db.ensembleStrategies.map((s) => ({
        id: s.id,
        name: s.name,
        category: s.category,
        family: s.family,
        weight: s.weight,
        enabled: s.enabled,
        approved: s.approved,
        regimes: s.regimes,
        lastSignal: s.lastSignal,
        lastConfidence: s.lastConfidence,
        lastReasonUz: s.lastReasonUz,
      })),
      ownerStrategyRegistry: db.strategies.map((s) => ({
        name: s.name,
        ownerApproved: s.ownerApproved,
        active: s.active,
        winRatePct: s.winRatePct,
        profitFactor: s.profitFactor,
      })),
    };
  } else if (chatId === 'risk_intelligence') {
    contextPayload = {
      ...contextPayload,
      accountSummary: acct,
      riskSettings: db.riskSettings,
      focusInstrumentRisk: targetAnl
        ? {
            symbol: targetAnl.symbol,
            analysisId: targetAnl.analysisId,
            decision: targetAnl.decision,
            risk: targetAnl.risk,
            atrPct: targetAnl.indicators?.atrPct ?? null,
          }
        : null,
      openOrdersExposure: openOrders.map((o) => ({
        id: o.id,
        symbol: o.symbol,
        side: o.side,
        lotSize: o.lotSize,
        sizeUsdt: o.sizeUsdt,
        riskPct: o.riskPct,
        riskUsd: o.riskUsd,
        stopLoss: o.stopLoss,
        takeProfit: o.takeProfit,
        mfeUsd: o.mfeUsd ?? 0,
        maeUsd: o.maeUsd ?? 0,
      })),
    };
  } else if (chatId === 'trade_manager') {
    contextPayload = {
      ...contextPayload,
      accountSummary: acct,
      riskSettings: db.riskSettings,
      openPositions: openOrders.map((o) => {
        const anl = db.unifiedAnalyses[o.symbol];
        return {
          id: o.id,
          symbol: o.symbol,
          side: o.side,
          status: o.status,
          entryPrice: o.entryPrice,
          currentMarkPrice: anl && isAnalysisFresh(anl) ? anl.latestPrice : o.markPrice,
          dataFreshnessSec: computeEffectiveFreshnessSec(anl),
          lotSize: o.lotSize,
          stopLoss: o.stopLoss,
          takeProfit: o.takeProfit,
          mfeUsd: o.mfeUsd ?? 0,
          maeUsd: o.maeUsd ?? 0,
          openedAt: o.openedAt,
          strategyName: o.strategyName,
          analysisId: o.analysisId,
          liveAnalysis: anl
            ? {
                decision: anl.decision,
                confidence: anl.confidence,
                regimeUz: anl.marketRegimeUz,
                structure: anl.marketStructure,
                atr14: anl.indicators?.atr14 ?? null,
                suggestedSl: anl.stopLoss,
                suggestedTp: anl.takeProfit,
              }
            : null,
        };
      }),
      focusOrderId: targetOrder?.id ?? null,
    };
  } else if (chatId === 'self_evaluation') {
    const linkedAnl = targetOrder ? db.unifiedAnalyses[targetOrder.symbol] : undefined;
    contextPayload = {
      ...contextPayload,
      targetClosedTrade: targetOrder && targetOrder.status === 'CLOSED'
        ? {
            orderId: targetOrder.id,
            symbol: targetOrder.symbol,
            side: targetOrder.side,
            entryPrice: targetOrder.entryPrice,
            exitPrice: targetOrder.markPrice,
            lotSize: targetOrder.lotSize,
            realizedPnlUsd: targetOrder.realizedPnl ?? 0,
            mfeUsd: targetOrder.mfeUsd ?? null,
            maeUsd: targetOrder.maeUsd ?? null,
            openedAt: targetOrder.openedAt,
            closedAt: targetOrder.closedAt ?? null,
            strategyName: targetOrder.strategyName,
            originalAnalysisId: targetOrder.analysisId,
            originalDecision: targetOrder.originalDecision ?? null,
            originalRegimeUz: targetOrder.originalRegimeUz ?? null,
            originalStrategyVotes: targetOrder.originalStrategyVotes ?? null,
            notesUz: targetOrder.notesUz ?? null,
            currentMarketRegimeUz: linkedAnl?.marketRegimeUz ?? null,
          }
        : null,
      recentClosedTrades: closedOrders.slice(0, 10).map((o) => ({
        orderId: o.id,
        symbol: o.symbol,
        side: o.side,
        entryPrice: o.entryPrice,
        exitPrice: o.markPrice,
        realizedPnlUsd: o.realizedPnl ?? 0,
        mfeUsd: o.mfeUsd ?? null,
        maeUsd: o.maeUsd ?? null,
        strategyName: o.strategyName,
        closedAt: o.closedAt ?? null,
      })),
      existingStrategyMemoryCount: db.strategySelfEvalMemory.length,
      recentMemoryLessons: db.strategySelfEvalMemory.slice(0, 6).map((m) => ({
        symbol: m.symbol,
        realizedPnlUsd: m.realizedPnlUsd,
        lessonSummaryUz: m.lessonSummaryUz,
        evaluatedAt: m.evaluatedAt,
      })),
    };
  }

  return {
    targetSymbol,
    targetAnl,
    targetOrder,
    analysisId,
    dataSnapshotRef,
    dataFreshnessSec: targetFreshSec,
    sourceReferences,
    contextPayload,
  };
}

function buildSystemInstruction(chatId: AiChatId): string {
  const baseRules = `Siz TRADE KILLER AI institutional trading tizimining mustaqil tahliliy AI mutaxassisisiz.
QAT'IY QOIDALAR:
1. Faqat tabiiy, ravon, tushunarli O'ZBEK TILIDA yozing (shunchaki indikatorlar ro'yxatini tashlab qo'ymang — voqea, mantiq, sabab-oqibat va xavflarni tushuntiring).
2. Faqat sizga berilgan JSON kontekstdagi haqiqiy raqamlardan foydalaning. Hech qachon narx, indikator, pozitsiya yoki P/L o'ylab topmang.
3. Agar ma'lumot eskirgan (isFreshLiveData: false) yoki mavjud bo'lmasa, buni ochiq ayting va eski ma'lumotni joriy narx deb ishlatmang.
4. AI ning BUY yoki SELL fikri HECH QACHON "order ochildi" degani emas! Order faqat Trading Engine va Risk Engine orqali yuboriladi.
5. O'z javobingizda quyidagi savollarga tabiiy tarzda javob bering: Hozir bozor qanday holatda? Qanday imkoniyat mavjud? Qaysi strategiyalar mos? Qaysi omillar qarorga qarshi? Qanday xavflar bor? Nima uchun BUY, SELL yoki WAIT? Qaysi shartlarda qaror o'zgaradi?
6. Oldingi suhbat tarixi mavjud bo'lsa, oldingi tahlil bilan hozirgi o'zgarishni qisqacha taqqoslang.`;

  switch (chatId) {
    case 'chief_analyst':
      return `${baseRules}\nSIZNING ROLINGIZ: AI CHIEF ANALYST — barcha instrumentlar, MTF, SMC, strategiya konsensusi va riskni umumlashtirib, strategik institutional xulosa va aniq BUY/SELL/WAIT qaror chiqaring.`;
    case 'market_intelligence':
      return `${baseRules}\nSIZNING ROLINGIZ: MARKET INTELLIGENCE — real OHLC, M1–W1 MTF mosligi, bozor rejimi, sham patternlari va ICT/SMC (BOS/CHoCH/OB/FVG/Liquidity) tuzilmasini chuqur sharhlang.`;
    case 'strategy_analyst':
      return `${baseRules}\nSIZNING ROLINGIZ: STRATEGY ANALYST — 18-strategiya Ensemble ovozlari, mos rejim strategiyalari, bir oiladagi takroriy signallar va ziddiyatlarni tanqidiy taqqoslang.`;
    case 'risk_intelligence':
      return `${baseRules}\nSIZNING ROLINGIZ: RISK INTELLIGENCE — portfolio riski, drawdown, kunlik zarar limiti, marja yuki, korrelyatsiya va lot hajmi bo'yicha qat'iy risk boshqaruvi xulosasini yozing.`;
    case 'trade_manager':
      return `${baseRules}\nSIZNING ROLINGIZ: AI TRADE MANAGER — faqat haqiqiy ochiq pozitsiyalarni kuzating. Har bir ochiq pozitsiya bo'yicha HOLD, MOVE_SL, MOVE_TP, BREAK_EVEN, TRAILING_STOP yoki CLOSE_POSITION tavsiya bering. Bajarilmagan amalni hech qachon "bajarildi" deb yozmang! Agar ochiq pozitsiya bo'lmasa, buni ochiq ayting.`;
    case 'self_evaluation':
      return `${baseRules}\nSIZNING ROLINGIZ: AI SELF-EVALUATION — yopilgan savdolarni (Entry/Exit, Realized P/L, MFE, MAE, asl strategiya ovozlari, bozor rejimi) tahlil qilib, Strategy Memory uchun xolis saboq chiqaring. Live strategiya kodini o'zgartirishni da'vo qilmang.`;
  }
}

function validateTradeManagerProposalRisk(
  db: LocalMemoryDatabase,
  order: PersistentOrderRecord | undefined,
  proposal: {
    proposedAction: AiTradeManagerProposal['proposedAction'];
    proposedStopLoss: number | null;
    proposedTakeProfit: number | null;
  }
): { allowed: boolean; reasons: string[] } {
  const reasons: string[] = [];
  if (!order || order.status === 'CLOSED') {
    return { allowed: false, reasons: ['Ochiq pozitsiya topilmadi yoki allaqachon yopilgan.'] };
  }
  if (proposal.proposedAction === 'HOLD') {
    return { allowed: true, reasons: [] };
  }
  const liveAnl = db.unifiedAnalyses[order.symbol];
  const currentPrice = liveAnl?.latestPrice && liveAnl.latestPrice > 0 ? liveAnl.latestPrice : order.markPrice;

  if (proposal.proposedAction === 'MOVE_SL' || proposal.proposedAction === 'BREAK_EVEN' || proposal.proposedAction === 'TRAILING_STOP') {
    const sl = proposal.proposedStopLoss;
    if (sl === null || !Number.isFinite(sl) || sl <= 0) {
      reasons.push('Yangi Stop-Loss qiymati noto‘g‘ri yoki bo‘sh.');
    } else if (order.side === 'LONG' && sl >= currentPrice) {
      reasons.push(`LONG pozitsiya uchun SL (${sl}) joriy narxdan (${currentPrice}) past bo‘lishi kerak.`);
    } else if (order.side === 'SHORT' && sl <= currentPrice) {
      reasons.push(`SHORT pozitsiya uchun SL (${sl}) joriy narxdan (${currentPrice}) yuqori bo‘lishi kerak.`);
    }
  }
  if (proposal.proposedAction === 'MOVE_TP') {
    const tp = proposal.proposedTakeProfit;
    if (tp === null || !Number.isFinite(tp) || tp <= 0) {
      reasons.push('Yangi Take-Profit qiymati noto‘g‘ri yoki bo‘sh.');
    } else if (order.side === 'LONG' && tp <= currentPrice) {
      reasons.push(`LONG pozitsiya uchun TP (${tp}) joriy narxdan (${currentPrice}) yuqori bo‘lishi kerak.`);
    } else if (order.side === 'SHORT' && tp >= currentPrice) {
      reasons.push(`SHORT pozitsiya uchun TP (${tp}) joriy narxdan (${currentPrice}) past bo‘lishi kerak.`);
    }
  }
  if (db.control.stopNewTrades && proposal.proposedAction !== 'CLOSE_POSITION') {
    reasons.push('STOP NEW TRADES rejimi faol — faqat pozitsiyani yopish ruxsat etilgan.');
  }
  return { allowed: reasons.length === 0, reasons };
}

export async function generateChatResponse(params: {
  chatId: AiChatId;
  triggerType: AiChatTriggerType;
  userQuestion?: string;
  symbol?: string;
  timeframe?: Timeframe;
  orderId?: string;
  dedupKey?: string;
  refreshIfStale?: boolean;
  autoExecuteTradeManager?: boolean;
}): Promise<{
  ok: boolean;
  userMessage?: AiChatMessageRecord;
  aiMessage: AiChatMessageRecord;
  deduplicated?: boolean;
}> {
  const { chatId, triggerType } = params;
  const db = loadMemoryDb();

  // Deduplication check for autonomous background triggers
  if (params.dedupKey && triggerType !== 'USER_QUERY' && triggerType !== 'MANUAL_BRIEF') {
    if (db.aiChatDedupIndex[params.dedupKey]) {
      totalDuplicatesSkipped++;
      const existing = (db.aiChats[chatId] ?? []).find((m) => m.dedupKey === params.dedupKey);
      if (existing) {
        return { ok: true, aiMessage: existing, deduplicated: true };
      }
    }
  }

  // Refresh market data first if stale and requested (so AI NEVER reasons on stale prices!)
  const requestedSymbol = resolveExactBrokerSymbol(
    params.symbol || getSupportedInstruments()[0]?.brokerSymbol || 'XAUUSD'
  );
  if (
    params.refreshIfStale &&
    (chatId === 'chief_analyst' || chatId === 'market_intelligence' || chatId === 'strategy_analyst')
  ) {
    const existingAnl = db.unifiedAnalyses[requestedSymbol];
    if (!isAnalysisFresh(existingAnl)) {
      await runRealInstrumentAnalysis({
        db,
        symbol: requestedSymbol,
        timeframe: params.timeframe ?? 'M15',
        fullMtf: false,
        forceRefresh: true,
        llmEvaluator: undefined,
      });
      saveMemoryDb(db);
    }
  }

  const grounded = buildGroundedContextForChat({
    db,
    chatId,
    symbol: params.symbol,
    orderId: params.orderId,
  });

  let userMessage: AiChatMessageRecord | undefined;
  if (params.userQuestion && params.userQuestion.trim()) {
    userMessage = appendChatMessage(db, {
      messageId: `msg-usr-${Date.now()}-${crypto.randomBytes(2).toString('hex')}`,
      chatId,
      role: 'user',
      contentUz: params.userQuestion.trim().slice(0, 1200),
      provider: null,
      model: null,
      createdAt: new Date().toISOString(),
      triggerType: 'USER_QUERY',
      analysisId: grounded.analysisId,
      symbol: grounded.targetSymbol,
      dataSnapshotRef: grounded.dataSnapshotRef,
      dataFreshnessSec: grounded.dataFreshnessSec,
      sourceReferences: grounded.sourceReferences,
      generationStatus: 'USER_INPUT',
    });
    saveMemoryDb(db);
  }

  const historyTurns = buildChatHistoryTurns(db, chatId);
  const taskLine = params.userQuestion?.trim()
    ? `FOYDALANUVCHI SAVOLI: "${params.userQuestion.trim()}"`
    : triggerType === 'TRADE_CLOSED'
      ? 'YANGI HODISA: Savdo yopildi. Yopilgan savdoni chuqur tahlil qilib, Strategy Memory uchun xolis xulosa yoz.'
      : triggerType === 'NEW_CANDLE' || triggerType === 'REGIME_CHANGE' || triggerType === 'VALID_SETUP'
        ? `AVTONOM BOZOR HODISASI (${triggerType}): Yangi tasdiqlangan ma’lumotlar asosida tabiiy tahliliy fikringni yoz.`
        : 'JORIY HOLAT TAHLILI: Eng so‘nggi tekshirilgan bozor va tizim ma’lumotlari asosida to‘liq tahliliy xulosa yoz.';

  const userPrompt = `${taskLine}\n\nHAQIQIY TEKSHIRILGAN KONTEKST (JSON):\n${JSON.stringify(grounded.contextPayload)}`;
  const messages = [...historyTurns, { role: 'user' as const, text: userPrompt }];
  const sysInst = buildSystemInstruction(chatId);

  // Branch 1: Decision-focused chats (structured trade decision + natural Uzbek analysis)
  if (chatId === 'chief_analyst' || chatId === 'market_intelligence' || chatId === 'strategy_analyst') {
    type DecisionLlmPayload = {
      reasoningUz: string;
      tradeDecision?: {
        instrument: string;
        marketCondition: string;
        decision: 'BUY' | 'SELL' | 'WAIT';
        entry: number | null;
        stopLoss: number | null;
        takeProfit: number | null;
        riskReward: string;
        strategyAgreement: string;
        confidenceCalibration: string;
        reasoningSummary: string;
        invalidationConditions: string;
      };
    };

    const llmRes = await generateRealLlmJson<DecisionLlmPayload>({
      systemInstruction: sysInst,
      messages,
      jsonHint:
        'JSON schema: { "reasoningUz": "tabiiy o‘zbek tilida batafsil tahlil", "tradeDecision": { "instrument": "BTCUSD", "marketCondition": "...", "decision": "BUY|SELL|WAIT", "entry": number|null, "stopLoss": number|null, "takeProfit": number|null, "riskReward": "1:2.0", "strategyAgreement": "...", "confidenceCalibration": "...", "reasoningSummary": "...", "invalidationConditions": "..." } }',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          reasoningUz: { type: Type.STRING },
          tradeDecision: {
            type: Type.OBJECT,
            properties: {
              instrument: { type: Type.STRING },
              marketCondition: { type: Type.STRING },
              decision: { type: Type.STRING },
              entry: { type: Type.NUMBER, nullable: true },
              stopLoss: { type: Type.NUMBER, nullable: true },
              takeProfit: { type: Type.NUMBER, nullable: true },
              riskReward: { type: Type.STRING },
              strategyAgreement: { type: Type.STRING },
              confidenceCalibration: { type: Type.STRING },
              reasoningSummary: { type: Type.STRING },
              invalidationConditions: { type: Type.STRING },
            },
            required: [
              'instrument',
              'marketCondition',
              'decision',
              'strategyAgreement',
              'confidenceCalibration',
              'reasoningSummary',
              'invalidationConditions',
            ],
          },
        },
        required: ['reasoningUz', 'tradeDecision'],
      },
    });

    syncLlmHealth(db, llmRes);

    if (!llmRes.ok || !llmRes.parsed?.reasoningUz) {
      const notice = appendChatMessage(db, {
        messageId: `msg-sys-${Date.now()}-${crypto.randomBytes(2).toString('hex')}`,
        chatId,
        role: 'system_notice',
        contentUz:
          llmRes.generationStatus === 'AI_UNAVAILABLE'
            ? 'AI UNAVAILABLE: Haqiqiy LLM provider sozlanmagan. Soxta yoki oldindan tayyorlangan AI fikri chiqarilmadi.'
            : `${llmRes.generationStatus}: Haqiqiy LLM javobi olinmadi. ${llmRes.error || ''}`,
        provider: llmRes.provider,
        model: llmRes.model,
        createdAt: new Date().toISOString(),
        triggerType,
        analysisId: grounded.analysisId,
        symbol: grounded.targetSymbol,
        dataSnapshotRef: grounded.dataSnapshotRef,
        dataFreshnessSec: grounded.dataFreshnessSec,
        sourceReferences: grounded.sourceReferences,
        generationStatus: llmRes.generationStatus,
        errorDetail: llmRes.error,
        dedupKey: params.dedupKey ?? null,
      });
      saveMemoryDb(db);
      return { ok: false, userMessage, aiMessage: notice };
    }

    const rawTd = llmRes.parsed.tradeDecision;
    const normalizedDec =
      rawTd?.decision === 'BUY' || rawTd?.decision === 'SELL' ? rawTd.decision : 'WAIT';
    const riskBlocked = grounded.targetAnl?.risk ? !grounded.targetAnl.risk.allowed : false;
    const structuredDecision: AiStructuredTradeDecision | null = rawTd
      ? {
          instrument: rawTd.instrument || grounded.targetSymbol,
          marketCondition: rawTd.marketCondition || grounded.targetAnl?.marketRegimeUz || 'Aniqlanmoqda',
          decision: normalizedDec,
          entry: typeof rawTd.entry === 'number' && Number.isFinite(rawTd.entry) ? rawTd.entry : grounded.targetAnl?.entry ?? null,
          stopLoss: typeof rawTd.stopLoss === 'number' && Number.isFinite(rawTd.stopLoss) ? rawTd.stopLoss : grounded.targetAnl?.stopLoss ?? null,
          takeProfit: typeof rawTd.takeProfit === 'number' && Number.isFinite(rawTd.takeProfit) ? rawTd.takeProfit : grounded.targetAnl?.takeProfit ?? null,
          riskReward:
            rawTd.riskReward ||
            (grounded.targetAnl?.riskRewardRatio ? `1:${grounded.targetAnl.riskRewardRatio}` : null),
          strategyAgreement: rawTd.strategyAgreement || grounded.targetAnl?.ensemble.strategyConfirmation || '—',
          confidenceCalibration: rawTd.confidenceCalibration || 'Tarixiy kalibratsiya kuzatilmoqda',
          reasoningSummary: rawTd.reasoningSummary || '',
          invalidationConditions: rawTd.invalidationConditions || '',
          // STRICT SEPARATION: AI reasoning NEVER equals an executed order!
          executionStatus: riskBlocked ? 'RISK_BLOCKED' : 'ANALYSIS_ONLY_NOT_EXECUTED',
          linkedOrderId: null,
        }
      : null;

    const aiMsg = appendChatMessage(db, {
      messageId: `msg-ai-${Date.now()}-${crypto.randomBytes(2).toString('hex')}`,
      chatId,
      role: 'ai',
      contentUz: llmRes.parsed.reasoningUz.trim(),
      provider: llmRes.provider,
      model: llmRes.model,
      createdAt: new Date().toISOString(),
      triggerType,
      analysisId: grounded.analysisId,
      symbol: structuredDecision?.instrument ?? grounded.targetSymbol,
      dataSnapshotRef: grounded.dataSnapshotRef,
      dataFreshnessSec: grounded.dataFreshnessSec,
      sourceReferences: grounded.sourceReferences,
      generationStatus: 'GENERATED',
      dedupKey: params.dedupKey ?? null,
      tradeDecision: structuredDecision,
    });
    saveMemoryDb(db);
    return { ok: true, userMessage, aiMessage: aiMsg };
  }

  // Branch 2: AI Trade Manager (structured position action proposal + Risk Engine validation)
  if (chatId === 'trade_manager') {
    type TradeMgrPayload = {
      reasoningUz: string;
      actionProposal?: {
        orderId: string;
        symbol: string;
        proposedAction: AiTradeManagerProposal['proposedAction'];
        proposedStopLoss: number | null;
        proposedTakeProfit: number | null;
        rationaleUz: string;
      } | null;
    };

    const llmRes = await generateRealLlmJson<TradeMgrPayload>({
      systemInstruction: sysInst,
      messages,
      jsonHint:
        'JSON schema: { "reasoningUz": "...", "actionProposal": { "orderId": "...", "symbol": "...", "proposedAction": "HOLD|MOVE_SL|MOVE_TP|BREAK_EVEN|TRAILING_STOP|CLOSE_POSITION", "proposedStopLoss": number|null, "proposedTakeProfit": number|null, "rationaleUz": "..." } | null }',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          reasoningUz: { type: Type.STRING },
          actionProposal: {
            type: Type.OBJECT,
            nullable: true,
            properties: {
              orderId: { type: Type.STRING },
              symbol: { type: Type.STRING },
              proposedAction: { type: Type.STRING },
              proposedStopLoss: { type: Type.NUMBER, nullable: true },
              proposedTakeProfit: { type: Type.NUMBER, nullable: true },
              rationaleUz: { type: Type.STRING },
            },
          },
        },
        required: ['reasoningUz'],
      },
    });

    syncLlmHealth(db, llmRes);

    if (!llmRes.ok || !llmRes.parsed?.reasoningUz) {
      const notice = appendChatMessage(db, {
        messageId: `msg-sys-${Date.now()}-${crypto.randomBytes(2).toString('hex')}`,
        chatId,
        role: 'system_notice',
        contentUz:
          llmRes.generationStatus === 'AI_UNAVAILABLE'
            ? 'AI UNAVAILABLE: Haqiqiy LLM provider sozlanmagan. Trade Manager soxta tavsiya bermaydi.'
            : `${llmRes.generationStatus}: Trade Manager LLM javobi olinmadi. ${llmRes.error || ''}`,
        provider: llmRes.provider,
        model: llmRes.model,
        createdAt: new Date().toISOString(),
        triggerType,
        analysisId: grounded.analysisId,
        symbol: grounded.targetSymbol,
        dataSnapshotRef: grounded.dataSnapshotRef,
        dataFreshnessSec: grounded.dataFreshnessSec,
        sourceReferences: grounded.sourceReferences,
        generationStatus: llmRes.generationStatus,
        errorDetail: llmRes.error,
        dedupKey: params.dedupKey ?? null,
      });
      saveMemoryDb(db);
      return { ok: false, userMessage, aiMessage: notice };
    }

    let tradeManagerAction: AiTradeManagerProposal | null = null;
    const rawProp = llmRes.parsed.actionProposal;
    if (rawProp && rawProp.orderId) {
      const matchedOrder = db.orders.find((o) => o.id === rawProp.orderId && o.status !== 'CLOSED');
      if (matchedOrder) {
        const validActions: AiTradeManagerProposal['proposedAction'][] = [
          'HOLD',
          'MOVE_SL',
          'MOVE_TP',
          'BREAK_EVEN',
          'TRAILING_STOP',
          'CLOSE_POSITION',
        ];
        const act = validActions.includes(rawProp.proposedAction) ? rawProp.proposedAction : 'HOLD';
        const proposedSl =
          act === 'BREAK_EVEN'
            ? matchedOrder.entryPrice
            : typeof rawProp.proposedStopLoss === 'number' && Number.isFinite(rawProp.proposedStopLoss)
              ? rawProp.proposedStopLoss
              : matchedOrder.stopLoss;
        const proposedTp =
          typeof rawProp.proposedTakeProfit === 'number' && Number.isFinite(rawProp.proposedTakeProfit)
            ? rawProp.proposedTakeProfit
            : matchedOrder.takeProfit;

        const riskCheck = validateTradeManagerProposalRisk(db, matchedOrder, {
          proposedAction: act,
          proposedStopLoss: proposedSl,
          proposedTakeProfit: proposedTp,
        });

        let execStatus: AiTradeManagerProposal['executionStatus'] = riskCheck.allowed
          ? 'PROPOSED_ONLY'
          : 'BLOCKED_BY_RISK_OR_PERMISSION';
        let executedAt: string | null = null;

        // Only auto-execute if explicitly permitted in AUTONOMOUS mode with Risk Engine approval
        if (
          params.autoExecuteTradeManager &&
          act !== 'HOLD' &&
          riskCheck.allowed &&
          db.control.autonomousMode === 'AUTONOMOUS' &&
          !db.control.stopNewTrades &&
          db.control.aiAutoSlTpEnabled
        ) {
          if (act === 'CLOSE_POSITION') {
            const closeRes = closePersistentOrder({
              db,
              orderId: matchedOrder.id,
              reasonUz: `AI Trade Manager: ${rawProp.rationaleUz || 'Pozitsiya yopildi'}`,
            });
            if (closeRes.ok) {
              execStatus = 'EXECUTED';
              executedAt = new Date().toISOString();
            }
          } else {
            const modRes = updatePersistentOrderTargets({
              db,
              orderId: matchedOrder.id,
              stopLoss: proposedSl,
              takeProfit: proposedTp,
            });
            if (modRes.ok) {
              execStatus = 'EXECUTED';
              executedAt = new Date().toISOString();
            }
          }
        }

        tradeManagerAction = {
          orderId: matchedOrder.id,
          symbol: matchedOrder.symbol,
          proposedAction: act,
          proposedStopLoss: proposedSl,
          proposedTakeProfit: proposedTp,
          rationaleUz: rawProp.rationaleUz || '',
          riskCheckAllowed: riskCheck.allowed,
          riskBlockReasons: riskCheck.reasons,
          executionStatus: execStatus,
          executedAt,
        };
      }
    }

    const aiMsg = appendChatMessage(db, {
      messageId: `msg-ai-${Date.now()}-${crypto.randomBytes(2).toString('hex')}`,
      chatId,
      role: 'ai',
      contentUz: llmRes.parsed.reasoningUz.trim(),
      provider: llmRes.provider,
      model: llmRes.model,
      createdAt: new Date().toISOString(),
      triggerType,
      analysisId: grounded.analysisId,
      symbol: tradeManagerAction?.symbol ?? grounded.targetSymbol,
      dataSnapshotRef: grounded.dataSnapshotRef,
      dataFreshnessSec: grounded.dataFreshnessSec,
      sourceReferences: grounded.sourceReferences,
      generationStatus: 'GENERATED',
      dedupKey: params.dedupKey ?? null,
      tradeManagerAction,
    });
    saveMemoryDb(db);
    return { ok: true, userMessage, aiMessage: aiMsg };
  }

  // Branch 3: Self-Evaluation (natural Uzbek post-mortem + Strategy Memory record, NEVER modifies live code)
  if (chatId === 'self_evaluation') {
    type SelfEvalPayload = {
      reasoningUz: string;
      lessonSummaryUz: string;
    };

    const llmRes = await generateRealLlmJson<SelfEvalPayload>({
      systemInstruction: sysInst,
      messages,
      jsonHint:
        'JSON schema: { "reasoningUz": "yopilgan savdo bo‘yicha batafsil tahlil", "lessonSummaryUz": "Strategy Memory uchun 1-2 jumlalik aniq saboq" }',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          reasoningUz: { type: Type.STRING },
          lessonSummaryUz: { type: Type.STRING },
        },
        required: ['reasoningUz', 'lessonSummaryUz'],
      },
    });

    syncLlmHealth(db, llmRes);

    if (!llmRes.ok || !llmRes.parsed?.reasoningUz) {
      const notice = appendChatMessage(db, {
        messageId: `msg-sys-${Date.now()}-${crypto.randomBytes(2).toString('hex')}`,
        chatId,
        role: 'system_notice',
        contentUz:
          llmRes.generationStatus === 'AI_UNAVAILABLE'
            ? 'AI UNAVAILABLE: Self-Evaluation uchun LLM provider sozlanmagan. Soxta xulosa saqlanmadi.'
            : `${llmRes.generationStatus}: Self-Evaluation LLM javobi olinmadi. ${llmRes.error || ''}`,
        provider: llmRes.provider,
        model: llmRes.model,
        createdAt: new Date().toISOString(),
        triggerType,
        analysisId: grounded.analysisId,
        symbol: grounded.targetOrder?.symbol ?? grounded.targetSymbol,
        dataSnapshotRef: grounded.dataSnapshotRef,
        dataFreshnessSec: grounded.dataFreshnessSec,
        sourceReferences: grounded.sourceReferences,
        generationStatus: llmRes.generationStatus,
        errorDetail: llmRes.error,
        dedupKey: params.dedupKey ?? null,
      });
      saveMemoryDb(db);
      return { ok: false, userMessage, aiMessage: notice };
    }

    const createdAt = new Date().toISOString();
    const messageId = `msg-ai-${Date.now()}-${crypto.randomBytes(2).toString('hex')}`;
    const aiMsg = appendChatMessage(db, {
      messageId,
      chatId,
      role: 'ai',
      contentUz: llmRes.parsed.reasoningUz.trim(),
      provider: llmRes.provider,
      model: llmRes.model,
      createdAt,
      triggerType,
      analysisId: grounded.targetOrder?.analysisId ?? grounded.analysisId,
      symbol: grounded.targetOrder?.symbol ?? grounded.targetSymbol,
      dataSnapshotRef: grounded.dataSnapshotRef,
      dataFreshnessSec: grounded.dataFreshnessSec,
      sourceReferences: grounded.sourceReferences,
      generationStatus: 'GENERATED',
      dedupKey: params.dedupKey ?? null,
    });

    // Save structured lesson into Strategy Self-Evaluation Memory (if evaluating a closed trade)
    const closedOrd = grounded.targetOrder?.status === 'CLOSED' ? grounded.targetOrder : null;
    if (closedOrd) {
      const alreadySaved = db.strategySelfEvalMemory.some((m) => m.orderId === closedOrd.id);
      if (!alreadySaved) {
        const memRecord: StrategySelfEvalMemoryRecord = {
          id: `eval-${Date.now()}-${crypto.randomBytes(2).toString('hex')}`,
          orderId: closedOrd.id,
          symbol: closedOrd.symbol,
          side: closedOrd.side,
          entryPrice: closedOrd.entryPrice,
          exitPrice: closedOrd.markPrice,
          realizedPnlUsd: closedOrd.realizedPnl ?? 0,
          mfeUsd: closedOrd.mfeUsd ?? null,
          maeUsd: closedOrd.maeUsd ?? null,
          originalAnalysisId: closedOrd.analysisId,
          originalDecision: closedOrd.originalDecision ?? null,
          originalStrategyVotes: closedOrd.originalStrategyVotes ?? null,
          marketConditionUz: closedOrd.originalRegimeUz ?? null,
          lessonSummaryUz: llmRes.parsed.lessonSummaryUz.trim().slice(0, 420),
          messageId,
          provider: llmRes.provider || 'LLM',
          model: llmRes.model || 'unknown',
          evaluatedAt: createdAt,
        };
        db.strategySelfEvalMemory.unshift(memRecord);
        db.strategySelfEvalMemory = db.strategySelfEvalMemory.slice(0, 150);
      }
    }

    saveMemoryDb(db);
    return { ok: true, userMessage, aiMessage: aiMsg };
  }

  // Branch 4: Risk Intelligence (natural Uzbek deep risk reasoning)
  const llmRes = await generateRealLlmText({
    systemInstruction: sysInst,
    messages,
  });

  syncLlmHealth(db, llmRes);

  if (!llmRes.ok || !llmRes.text) {
    const notice = appendChatMessage(db, {
      messageId: `msg-sys-${Date.now()}-${crypto.randomBytes(2).toString('hex')}`,
      chatId,
      role: 'system_notice',
      contentUz:
        llmRes.generationStatus === 'AI_UNAVAILABLE'
          ? 'AI UNAVAILABLE: Risk Intelligence uchun LLM provider sozlanmagan. Soxta risk matni chiqarilmadi.'
          : `${llmRes.generationStatus}: Risk Intelligence LLM javobi olinmadi. ${llmRes.error || ''}`,
      provider: llmRes.provider,
      model: llmRes.model,
      createdAt: new Date().toISOString(),
      triggerType,
      analysisId: grounded.analysisId,
      symbol: grounded.targetSymbol,
      dataSnapshotRef: grounded.dataSnapshotRef,
      dataFreshnessSec: grounded.dataFreshnessSec,
      sourceReferences: grounded.sourceReferences,
      generationStatus: llmRes.generationStatus,
      errorDetail: llmRes.error,
      dedupKey: params.dedupKey ?? null,
    });
    saveMemoryDb(db);
    return { ok: false, userMessage, aiMessage: notice };
  }

  const aiMsg = appendChatMessage(db, {
    messageId: `msg-ai-${Date.now()}-${crypto.randomBytes(2).toString('hex')}`,
    chatId,
    role: 'ai',
    contentUz: llmRes.text,
    provider: llmRes.provider,
    model: llmRes.model,
    createdAt: new Date().toISOString(),
    triggerType,
    analysisId: grounded.analysisId,
    symbol: grounded.targetSymbol,
    dataSnapshotRef: grounded.dataSnapshotRef,
    dataFreshnessSec: grounded.dataFreshnessSec,
    sourceReferences: grounded.sourceReferences,
    generationStatus: 'GENERATED',
    dedupKey: params.dedupKey ?? null,
  });
  saveMemoryDb(db);
  return { ok: true, userMessage, aiMessage: aiMsg };
}

/**
 * Risk-gated execution of a Trade Manager proposed action from the UI.
 */
export function executeTradeManagerProposal(params: {
  messageId: string;
}): { ok: boolean; error?: string; message?: AiChatMessageRecord; order?: PersistentOrderRecord } {
  const db = loadMemoryDb();
  const msg = (db.aiChats.trade_manager ?? []).find((m) => m.messageId === params.messageId);
  if (!msg || !msg.tradeManagerAction) {
    return { ok: false, error: 'Trade Manager tavsiyasi topilmadi.' };
  }
  const prop = msg.tradeManagerAction;
  if (prop.executionStatus === 'EXECUTED') {
    return { ok: false, error: 'Ushbu tavsiya allaqachon bajarilgan.' };
  }
  if (prop.proposedAction === 'HOLD') {
    return { ok: false, error: 'HOLD tavsiyasi bo‘yicha amaliy o‘zgartirish talab qilinmaydi.' };
  }

  const order = db.orders.find((o) => o.id === prop.orderId);
  const check = validateTradeManagerProposalRisk(db, order, prop);
  prop.riskCheckAllowed = check.allowed;
  prop.riskBlockReasons = check.reasons;

  if (!check.allowed || !order) {
    prop.executionStatus = 'BLOCKED_BY_RISK_OR_PERMISSION';
    saveMemoryDb(db);
    return { ok: false, error: `Risk Engine / Ruxsat rad etdi: ${check.reasons.join(' · ')}`, message: msg };
  }

  if (prop.proposedAction === 'CLOSE_POSITION') {
    const res = closePersistentOrder({
      db,
      orderId: order.id,
      reasonUz: `AI Trade Manager tavsiyasi tasdiqlandi: ${prop.rationaleUz}`,
    });
    if (!res.ok || !res.order) {
      prop.executionStatus = 'BLOCKED_BY_RISK_OR_PERMISSION';
      prop.riskBlockReasons = [res.error || 'Pozitsiyani yopib bo‘lmadi.'];
      saveMemoryDb(db);
      return { ok: false, error: res.error || 'Pozitsiyani yopib bo‘lmadi.', message: msg };
    }
    prop.executionStatus = 'EXECUTED';
    prop.executedAt = new Date().toISOString();
    saveMemoryDb(db);
    pushNotification({
      priority: 'HIGH',
      category: 'POSITION',
      title: `Trade Manager: ${res.order.symbol} yopildi`,
      message: `ID: ${res.order.id} · P/L: ${(res.order.realizedPnl ?? 0) >= 0 ? '+' : ''}$${(res.order.realizedPnl ?? 0).toFixed(2)}`,
      symbol: res.order.symbol,
    });
    // Trigger automatic self-evaluation after closing
    enqueueAutonomousChatEvent({
      chatId: 'self_evaluation',
      triggerType: 'TRADE_CLOSED',
      symbol: res.order.symbol,
      orderId: res.order.id,
      dedupKey: `self-eval-close-${res.order.id}`,
      eventNoteUz: `Yopilgan savdo: ${res.order.symbol} (${res.order.id})`,
    });
    return { ok: true, message: msg, order: res.order };
  }

  const modRes = updatePersistentOrderTargets({
    db,
    orderId: order.id,
    stopLoss: prop.proposedStopLoss,
    takeProfit: prop.proposedTakeProfit,
  });
  if (!modRes.ok || !modRes.order) {
    prop.executionStatus = 'BLOCKED_BY_RISK_OR_PERMISSION';
    prop.riskBlockReasons = [modRes.error || 'SL/TP yangilanmadi.'];
    saveMemoryDb(db);
    return { ok: false, error: modRes.error || 'SL/TP yangilanmadi.', message: msg };
  }

  prop.executionStatus = 'EXECUTED';
  prop.executedAt = new Date().toISOString();
  saveMemoryDb(db);
  pushNotification({
    priority: 'NORMAL',
    category: 'POSITION',
    title: `Trade Manager (${prop.proposedAction}): ${modRes.order.symbol}`,
    message: `SL: ${modRes.order.stopLoss ?? '—'} · TP: ${modRes.order.takeProfit ?? '—'}`,
    symbol: modRes.order.symbol,
  });
  return { ok: true, message: msg, order: modRes.order };
}

/**
 * Serial background queue for autonomous event-driven AI reasoning (never spams LLM on ticks).
 */
export function enqueueAutonomousChatEvent(event: QueuedAutonomousEvent): boolean {
  const provider = resolveActiveLlmProvider();
  if (!provider.configured) {
    return false;
  }

  const db = loadMemoryDb();
  if (db.aiChatDedupIndex[event.dedupKey]) {
    totalDuplicatesSkipped++;
    return false;
  }

  if (eventQueue.some((e) => e.dedupKey === event.dedupKey)) {
    totalDuplicatesSkipped++;
    return false;
  }

  // Enforce per-chat cooldown for non-trade-closed background events
  if (event.triggerType !== 'TRADE_CLOSED') {
    const lastTs = lastAutonomousRunByChat[event.chatId] ?? 0;
    if (Date.now() - lastTs < AUTONOMOUS_CHAT_COOLDOWN_MS) {
      return false;
    }
  }

  if (eventQueue.length >= 12) {
    // Keep queue bounded so bursts never backlog stale market events
    return false;
  }

  eventQueue.push(event);
  void drainEventQueue();
  return true;
}

async function drainEventQueue() {
  if (queueRunning) return;
  queueRunning = true;
  try {
    while (eventQueue.length > 0) {
      const next = eventQueue.shift();
      if (!next) break;
      try {
        lastAutonomousRunByChat[next.chatId] = Date.now();
        await generateChatResponse({
          chatId: next.chatId,
          triggerType: next.triggerType,
          symbol: next.symbol,
          timeframe: next.timeframe,
          orderId: next.orderId,
          dedupKey: next.dedupKey,
          refreshIfStale: false,
          autoExecuteTradeManager: next.autoExecuteTradeManager,
        });
        totalAutonomousProcessed++;
        lastQueueProcessedAt = new Date().toISOString();
      } catch (err) {
        console.error('Autonomous AI chat event error:', err);
      }
      // Small spacing between consecutive LLM calls to respect provider rate limits
      await new Promise((r) => setTimeout(r, 1500));
    }
  } finally {
    queueRunning = false;
  }
}

export function buildAiChatsStatePayload(db: LocalMemoryDatabase) {
  const providerInfo = resolveActiveLlmProvider();
  const chats = AI_CHAT_CATALOG.map((def) => {
    const msgs = db.aiChats[def.id] ?? [];
    const lastAi = [...msgs].reverse().find((m) => m.role === 'ai' && m.generationStatus === 'GENERATED') ?? null;
    return {
      ...def,
      messageCount: msgs.length,
      aiMessageCount: msgs.filter((m) => m.role === 'ai' && m.generationStatus === 'GENERATED').length,
      lastMessageAt: msgs.length > 0 ? msgs[msgs.length - 1].createdAt : null,
      lastAiAnalysisId: lastAi?.analysisId ?? null,
    };
  });

  return {
    timestamp: new Date().toISOString(),
    provider: {
      configured: providerInfo.configured,
      providerLabel: providerInfo.providerLabel,
      model: providerInfo.model,
      healthStatus: db.llmHealth.status,
      lastCheckedAt: db.llmHealth.lastCheckedAt,
      lastError: db.llmHealth.lastError,
    },
    queue: getAiChatQueueStatus(),
    chats,
    messagesByChat: db.aiChats,
    strategySelfEvalMemory: db.strategySelfEvalMemory,
  };
}
