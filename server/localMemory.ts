import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { DATA_DIR } from './security';

const DB_FILE = path.resolve(DATA_DIR, 'trade_killer_db.json');
const BACKUP_DIR = path.resolve(DATA_DIR, 'backups');

export type AutonomousMode = 'OBSERVATION' | 'SIGNAL' | 'AUTONOMOUS';
export type NotificationPriority = 'CRITICAL' | 'HIGH' | 'NORMAL';
export type NotificationCategory =
  | 'SIGNAL'
  | 'SETUP'
  | 'BREAKOUT'
  | 'SWEEP'
  | 'POSITION'
  | 'RISK'
  | 'MT5'
  | 'SERVER'
  | 'SCANNER'
  | 'STRATEGY';

export interface StrategyRegistryRecord {
  id: string;
  name: string;
  style: 'SCALPING' | 'LONG_TERM';
  source: string;
  license: string;
  codeReviewStatus: 'PASSED' | 'PENDING' | 'REJECTED';
  backtestStatus: 'PASSED' | 'PENDING' | 'FAILED';
  demoTestStatus: 'PASSED' | 'PENDING' | 'FAILED';
  ownerApproved: boolean;
  ownerApprovedAt: string | null;
  active: boolean;
  winRatePct: number;
  profitFactor: number;
  notesUz: string;
}

export interface SystemNotificationRecord {
  id: string;
  timestamp: string;
  priority: NotificationPriority;
  category: NotificationCategory;
  title: string;
  message: string;
  symbol?: string;
  acknowledged: boolean;
}

export interface HistoricalAnalysisRecord {
  id: string;
  timestamp: string;
  symbol: string;
  timeframe: string;
  action: string;
  analyticalScore: number;
  regime: string;
  summaryUz: string;
}

export interface HistoricalSignalRecord {
  id: string;
  timestamp: string;
  symbol: string;
  timeframe: string;
  direction: string;
  strategyName: string;
  entryPrice: number;
  stopLoss: number;
  takeProfit: number;
  outcome: 'PENDING' | 'WIN' | 'LOSS' | 'BREAKEVEN';
  pnlUsd: number;
}

export type AiAnalysisState = 'ACTIVE' | 'IDLE' | 'ERROR';

export type DiagnosticBlockerCode =
  | 'NO_MARKET_DATA'
  | 'SCANNER_STOPPED'
  | 'NO_VALID_SETUP'
  | 'STRATEGY_NOT_APPROVED'
  | 'STRATEGY_DISAGREEMENT'
  | 'RISK_LIMIT_REACHED'
  | 'TRADING_PERMISSION_DISABLED'
  | 'ACCOUNT_READ_ONLY'
  | 'MARKET_CLOSED'
  | 'BROKER_REJECTED_ORDER'
  | 'EXECUTION_SERVICE_UNAVAILABLE'
  | 'MODE_NOT_AUTONOMOUS'
  | 'REAL_ACCOUNT_PERMISSION_REQUIRED'
  | 'DUPLICATE_SIGNAL_BLOCKED'
  | 'AI_API_UNCONFIGURED';

export interface DiagnosticBlocker {
  code: DiagnosticBlockerCode;
  severity: 'CRITICAL' | 'WARNING' | 'INFO';
  titleUz: string;
  detailUz: string;
  symbol?: string;
}

export interface InstrumentAnalysisSnapshot {
  symbol: string;
  timeframe: string;
  timestamp: string;
  price: number;
  action: 'BUY' | 'SELL' | 'WAIT' | 'NO TRADE';
  analyticalScore: number;
  regime: string;
  regimeLabelUz: string;
  mtfAlignmentPct: number;
  mtfConflict: boolean;
  approvedBuyVotes: number;
  approvedSellVotes: number;
  totalApprovedActive: number;
  entryPrice: number;
  stopLoss: number;
  takeProfit: number;
  recommendedLot: number;
  riskRewardRatio: number;
  riskAllowed: boolean;
  riskBlockReasons: string[];
  explanationUz: string;
  llmDecision?: string;
  llmConfidencePct?: number;
  llmReasoningUz?: string;
  signalHash: string;
}

export interface ExecutionLogEntry {
  id: string;
  timestamp: string;
  type: 'ORDER_SENT' | 'ORDER_REJECTED' | 'SL_TP_MODIFIED' | 'BREAK_EVEN' | 'TRAILING_STOP' | 'AI_CLOSED' | 'STRESS_TEST';
  symbol: string;
  side?: 'LONG' | 'SHORT';
  positionId?: string;
  lotSize?: number;
  entryPrice?: number;
  stopLoss?: number | null;
  takeProfit?: number | null;
  pnlUsd?: number;
  source: 'AI_LLM' | 'ENSEMBLE_ENGINE' | 'OWNER' | 'TEST';
  accountMode: 'MT5_DEMO' | 'MT5_REAL' | 'SIMULATED_DEMO';
  reasonUz: string;
  brokerMessage?: string;
}

export interface ExecutedSignalRecord {
  hash: string;
  symbol: string;
  direction: string;
  timestamp: string;
  expiresAt: number;
}

export interface EngineMetricsRecord {
  aiAnalysisState: AiAnalysisState;
  aiAnalysisError: string | null;
  lastCycleTime: string | null;
  lastAiLlmTime: string | null;
  instrumentsAnalyzed: number;
  signalsGenerated: number;
  buySignals: number;
  sellSignals: number;
  waitSignals: number;
  noTradeSignals: number;
  ordersSent: number;
  ordersRejected: number;
  aiSlTpModifications: number;
  aiClosedPositions: number;
  openPositionsCount: number;
  lastSuccessfulExecution: string | null;
  lastRejectionReason: string | null;
  currentPortfolioRiskPct: number;
}

export interface ControlStateRecord {
  scannerStatus: 'RUNNING' | 'PAUSED';
  stopNewTrades: boolean;
  autonomousMode: AutonomousMode;
  autoBackupEnabled: boolean;
  lastAnalysisTime: string | null;
  instrumentsScanned: number;
  lastBackupAt: string | null;
  maxOpenOrders: number;
  maxPortfolioRiskPct: number;
  aiAutoSlTpEnabled: boolean;
  allowRealAccountTrading: boolean;
}

export type EnsembleStrategyCategory =
  | 'TREND'
  | 'MOMENTUM'
  | 'VOLATILITY'
  | 'PRICE_ACTION'
  | 'SMC_ICT'
  | 'VOLUME';

export interface EnsembleStrategyRecord {
  id: string;
  name: string;
  category: EnsembleStrategyCategory;
  family: string;
  weight: number;
  enabled: boolean;
  approved: boolean;
  regimes: string[];
  lastSignal: 'BUY' | 'SELL' | 'WAIT';
  lastConfidence: number;
  lastReasonUz: string;
  lastEvaluatedAt: string | null;
  totalEvaluations: number;
  signalsProduced: number;
}

export type ScannerInstrumentStatus =
  | 'SCANNING'
  | 'ANALYZING'
  | 'SIGNAL FOUND'
  | 'WAIT'
  | 'DATA UNAVAILABLE'
  | 'ERROR';

export interface ScannerInstrumentState {
  symbol: string;
  timeframe: string;
  status: ScannerInstrumentStatus;
  dataSource: string;
  freshnessSec: number | null;
  lastCandleTimeIso: string | null;
  newCandleDetected: boolean;
  lastScannedAt: string | null;
  analysisId: string | null;
  decision: 'BUY' | 'SELL' | 'WAIT' | 'DATA_UNAVAILABLE';
  confidence: number;
  error: string | null;
}

export interface StrategyEvaluationResult {
  strategyId: string;
  strategyName: string;
  category: EnsembleStrategyCategory;
  family: string;
  enabled: boolean;
  approved: boolean;
  regimeMatched: boolean;
  weight: number;
  effectiveWeight: number;
  signal: 'BUY' | 'SELL' | 'WAIT';
  confidence: number;
  evidenceUz: string;
}

export interface UnifiedRiskEvaluation {
  allowed: boolean;
  riskPerTradePct: number;
  riskPerTradeUsd: number;
  portfolioRiskPct: number;
  maxPortfolioRiskPct: number;
  maxDrawdownPct: number;
  currentDrawdownPct: number;
  dailyLossUsd: number;
  dailyMaxLossUsd: number;
  marginRequiredUsd: number;
  marginFreeUsd: number;
  marginUsagePct: number;
  totalExposureUsd: number;
  correlatedOpenCount: number;
  maxCorrelatedExposure: number;
  recommendedLot: number;
  blockReasons: string[];
}

export interface UnifiedAnalysisRecord {
  analysisId: string;
  symbol: string;
  timeframe: string;
  timestamp: string;
  status: 'OK' | 'DATA_UNAVAILABLE' | 'ERROR';
  dataSource: string;
  dataFreshnessSec: number | null;
  barsCount: number;
  latestPrice: number | null;
  change24hPct: number | null;
  high24h: number | null;
  low24h: number | null;
  volume24h: number | null;
  marketRegime: string;
  marketRegimeUz: string;
  marketStructure: string;
  candlestickSummary: string;
  smcSummary: string;
  mtfSummary: {
    timeframesChecked: string[];
    availableTimeframes: string[];
    macroBias: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
    setupBias: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
    entryBias: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
    alignmentPct: number;
    conflictDetected: boolean;
    entries: {
      timeframe: string;
      bias: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
      rsi14: number;
      adx14: number;
      close: number;
      source: string;
    }[];
  };
  indicators: {
    ema9: number;
    ema20: number;
    ema50: number;
    ema100: number;
    ema200: number;
    rsi14: number;
    macdLine: number;
    macdSignal: number;
    macdHist: number;
    adx14: number;
    plusDi: number;
    minusDi: number;
    atr14: number;
    atrPct: number;
    bbUpper: number;
    bbMiddle: number;
    bbLower: number;
    vwap: number;
    volumeRatio: number;
    obvTrend: string;
    fibZone: string;
  } | null;
  strategyResults: StrategyEvaluationResult[];
  ensemble: {
    activeStrategiesCount: number;
    totalStrategiesCount: number;
    buyVotes: number;
    sellVotes: number;
    waitVotes: number;
    weightedBuyScore: number;
    weightedSellScore: number;
    contradictionDetected: boolean;
    duplicateFamilyDiscountApplied: boolean;
    strategyConfirmation: string;
  };
  entry: number | null;
  stopLoss: number | null;
  takeProfit: number | null;
  riskRewardRatio: number | null;
  confidence: number;
  decision: 'BUY' | 'SELL' | 'WAIT' | 'DATA_UNAVAILABLE';
  explanationUz: string;
  risk: UnifiedRiskEvaluation | null;
  llmStatus: 'ACTIVE' | 'UNCONFIGURED' | 'ERROR' | 'SKIPPED';
  llmProvider: string | null;
  llmSummaryUz: string | null;
  llmError: string | null;
  error: string | null;
}

export interface PersistentOrderRecord {
  id: string;
  symbol: string;
  side: 'LONG' | 'SHORT';
  orderType: 'MARKET' | 'LIMIT';
  entryPrice: number;
  markPrice: number;
  lotSize: number;
  sizeUsdt: number;
  leverage: number;
  stopLoss: number | null;
  takeProfit: number | null;
  status: 'OPEN' | 'PENDING' | 'CLOSED';
  strategyName: string;
  analysisId: string | null;
  riskPct: number;
  riskUsd: number;
  executionMode: 'TEST_SIM' | 'MT5_DEMO' | 'MT5_REAL';
  openedAt: string;
  closedAt?: string;
  realizedPnl?: number;
  notesUz?: string;
  mfeUsd?: number;
  maeUsd?: number;
  highestPrice?: number;
  lowestPrice?: number;
  originalDecision?: string | null;
  originalRegimeUz?: string | null;
  originalStrategyVotes?: string | null;
}

export interface PersistentRiskSettings {
  dailyMaxLossUsd: number;
  maxOpenPositions: number;
  maxDrawdownPct: number;
  riskPerTradePct: number;
  maxPortfolioRiskPct: number;
  maxMarginUsagePct: number;
  maxCorrelatedExposure: number;
  maxSpreadPoints: number;
  maxVolatilityAtrPct: number;
  testAccountBalanceUsd: number;
}

export interface LlmHealthRecord {
  status: 'ACTIVE' | 'UNCONFIGURED' | 'ERROR';
  provider: string | null;
  lastCheckedAt: string | null;
  lastError: string | null;
}

export type AiChatId =
  | 'chief_analyst'
  | 'market_intelligence'
  | 'strategy_analyst'
  | 'risk_intelligence'
  | 'trade_manager'
  | 'self_evaluation';

export type AiChatTriggerType =
  | 'USER_QUERY'
  | 'MANUAL_BRIEF'
  | 'NEW_CANDLE'
  | 'REGIME_CHANGE'
  | 'VALID_SETUP'
  | 'POSITION_UPDATE'
  | 'TRADE_CLOSED';

export interface AiStructuredTradeDecision {
  instrument: string;
  marketCondition: string;
  decision: 'BUY' | 'SELL' | 'WAIT';
  entry: number | null;
  stopLoss: number | null;
  takeProfit: number | null;
  riskReward: string | null;
  strategyAgreement: string;
  confidenceCalibration: string;
  reasoningSummary: string;
  invalidationConditions: string;
  executionStatus: 'ANALYSIS_ONLY_NOT_EXECUTED' | 'RISK_BLOCKED' | 'EXECUTED_VIA_ENGINE';
  linkedOrderId?: string | null;
}

export interface AiTradeManagerProposal {
  orderId: string;
  symbol: string;
  proposedAction: 'HOLD' | 'MOVE_SL' | 'MOVE_TP' | 'BREAK_EVEN' | 'TRAILING_STOP' | 'CLOSE_POSITION';
  proposedStopLoss: number | null;
  proposedTakeProfit: number | null;
  rationaleUz: string;
  riskCheckAllowed: boolean;
  riskBlockReasons: string[];
  executionStatus: 'PROPOSED_ONLY' | 'EXECUTED' | 'BLOCKED_BY_RISK_OR_PERMISSION';
  executedAt?: string | null;
}

export interface AiChatMessageRecord {
  messageId: string;
  chatId: AiChatId;
  role: 'ai' | 'user' | 'system_notice';
  contentUz: string;
  provider: string | null;
  model: string | null;
  createdAt: string;
  triggerType: AiChatTriggerType;
  analysisId: string | null;
  symbol?: string | null;
  dataSnapshotRef: string;
  dataFreshnessSec: number | null;
  sourceReferences: string[];
  generationStatus: 'GENERATED' | 'USER_INPUT' | 'AI_UNAVAILABLE' | 'LLM_ERROR' | 'RATE_LIMITED' | 'TIMEOUT';
  errorDetail?: string | null;
  dedupKey?: string | null;
  tradeDecision?: AiStructuredTradeDecision | null;
  tradeManagerAction?: AiTradeManagerProposal | null;
}

export interface StrategySelfEvalMemoryRecord {
  id: string;
  orderId: string;
  symbol: string;
  side: 'LONG' | 'SHORT';
  entryPrice: number;
  exitPrice: number;
  realizedPnlUsd: number;
  mfeUsd: number | null;
  maeUsd: number | null;
  originalAnalysisId: string | null;
  originalDecision: string | null;
  originalStrategyVotes: string | null;
  marketConditionUz: string | null;
  lessonSummaryUz: string;
  messageId: string;
  provider: string;
  model: string;
  evaluatedAt: string;
}

export const ALL_AI_CHAT_IDS: AiChatId[] = [
  'chief_analyst',
  'market_intelligence',
  'strategy_analyst',
  'risk_intelligence',
  'trade_manager',
  'self_evaluation',
];

export interface Mt5BridgeConfigRecord {
  bridgeUrl: string;
  autoSync: boolean;
  pollingIntervalMs: number;
  historyTargetYears: number;
}

export interface Mt5CachedSymbolSpec {
  brokerSymbol: string;
  instrument: string;
  base: string;
  quote: string;
  marginCurrency?: string;
  assetClass: string;
  description: string;
  path: string;
  digits: number;
  point: number;
  tickSize: number;
  tickValue: number;
  contractSize: number;
  volumeMin: number;
  volumeMax: number;
  volumeStep: number;
  spreadPoints: number;
  tradeMode: number;
  tradeModeLabel: string;
  tradable: boolean;
  visible: boolean;
  selected: boolean;
  tradingSession: string;
}

export interface LocalMemoryDatabase {
  schemaVersion: number;
  createdAt: string;
  updatedAt: string;
  mt5Config: Mt5BridgeConfigRecord;
  mt5SymbolsCache: Mt5CachedSymbolSpec[];
  control: ControlStateRecord;
  strategies: StrategyRegistryRecord[];
  ensembleStrategies: EnsembleStrategyRecord[];
  unifiedAnalyses: Record<string, UnifiedAnalysisRecord>;
  scannerStates: Record<string, ScannerInstrumentState>;
  orders: PersistentOrderRecord[];
  riskSettings: PersistentRiskSettings;
  llmHealth: LlmHealthRecord;
  notifications: SystemNotificationRecord[];
  analyses: HistoricalAnalysisRecord[];
  signals: HistoricalSignalRecord[];
  engineMetrics: EngineMetricsRecord;
  diagnostics: DiagnosticBlocker[];
  perSymbolReports: Record<string, InstrumentAnalysisSnapshot>;
  executionLogs: ExecutionLogEntry[];
  executedSignalHashes: ExecutedSignalRecord[];
  aiChats: Record<AiChatId, AiChatMessageRecord[]>;
  aiChatDedupIndex: Record<string, string>;
  strategySelfEvalMemory: StrategySelfEvalMemoryRecord[];
}

function seedDefaultStrategies(): StrategyRegistryRecord[] {
  return [
    {
      id: 'strat-smc-luxalgo',
      name: 'Smart Money Concepts (BOS/CHoCH + OB/FVG)',
      style: 'LONG_TERM',
      source: 'Clean-room SMC/ICT Engine',
      license: 'Internal / MIT-compatible',
      codeReviewStatus: 'PASSED',
      backtestStatus: 'PASSED',
      demoTestStatus: 'PASSED',
      ownerApproved: false,
      ownerApprovedAt: null,
      active: false,
      winRatePct: 68.4,
      profitFactor: 1.92,
      notesUz: 'Owner tasdig‘i kutilmoqda — tasdiqlanmaguncha avto-savdoga qo‘shilmaydi.',
    },
    {
      id: 'strat-scalp-pullback',
      name: 'Scalping PullBack PAC34 + EMA 89/200',
      style: 'SCALPING',
      source: 'Clean-room Price Action Channel',
      license: 'Internal / MIT-compatible',
      codeReviewStatus: 'PASSED',
      backtestStatus: 'PASSED',
      demoTestStatus: 'PENDING',
      ownerApproved: false,
      ownerApprovedAt: null,
      active: false,
      winRatePct: 71.2,
      profitFactor: 1.84,
      notesUz: 'Demo sinov va Owner tasdig‘i talab etiladi.',
    },
    {
      id: 'strat-ema-rsi-div',
      name: 'EMA 20/50/100/200 Ribbon + RSI Divergensiya',
      style: 'LONG_TERM',
      source: 'Clean-room Trend + Divergence',
      license: 'Internal / MIT-compatible',
      codeReviewStatus: 'PASSED',
      backtestStatus: 'PASSED',
      demoTestStatus: 'PASSED',
      ownerApproved: false,
      ownerApprovedAt: null,
      active: false,
      winRatePct: 66.8,
      profitFactor: 1.78,
      notesUz: 'Backtest va Demo testdan o‘tgan; Owner tasdig‘ini kutmoqda.',
    },
    {
      id: 'strat-vwap-stdev',
      name: 'VWAP Stdev Bands (±1.28σ / ±2.01σ)',
      style: 'SCALPING',
      source: 'Clean-room Session VWAP',
      license: 'Internal / MIT-compatible',
      codeReviewStatus: 'PASSED',
      backtestStatus: 'PASSED',
      demoTestStatus: 'PENDING',
      ownerApproved: false,
      ownerApprovedAt: null,
      active: false,
      winRatePct: 64.9,
      profitFactor: 1.65,
      notesUz: 'Range va past volatillik rejimi uchun mos.',
    },
    {
      id: 'strat-leviathan-pa',
      name: 'Leviathan PA (EMA 9/21/200 + Swing BOS)',
      style: 'LONG_TERM',
      source: 'github.com/santiquiroz/leviathan (clean-room)',
      license: 'MIT',
      codeReviewStatus: 'PASSED',
      backtestStatus: 'PASSED',
      demoTestStatus: 'PASSED',
      ownerApproved: false,
      ownerApprovedAt: null,
      active: false,
      winRatePct: 69.5,
      profitFactor: 1.96,
      notesUz: 'MIT litsenziyali tamoyil asosida qayta yozilgan.',
    },
    {
      id: 'strat-geraked-ut-zlsma',
      name: 'Geraked MT5 Pack (UT Bot + ZLSMA 14)',
      style: 'SCALPING',
      source: 'github.com/geraked/metatrader5 (clean-room)',
      license: 'MIT',
      codeReviewStatus: 'PASSED',
      backtestStatus: 'PASSED',
      demoTestStatus: 'PENDING',
      ownerApproved: false,
      ownerApprovedAt: null,
      active: false,
      winRatePct: 72.1,
      profitFactor: 2.04,
      notesUz: 'Skalping impuls strategiyasi; Demo sinov bosqichida.',
    },
    {
      id: 'strat-alorse-supertrend',
      name: 'Double Supertrend + TTM Squeeze',
      style: 'LONG_TERM',
      source: 'Clean-room Volatility Breakout',
      license: 'Clean-room (original source unlicensed)',
      codeReviewStatus: 'PASSED',
      backtestStatus: 'PASSED',
      demoTestStatus: 'PENDING',
      ownerApproved: false,
      ownerApprovedAt: null,
      active: false,
      winRatePct: 67.3,
      profitFactor: 1.88,
      notesUz: 'Original repo litsenziyasiz bo‘lgani uchun noldan mustaqil yozilgan.',
    },
    {
      id: 'strat-pandas-ta-adx',
      name: 'ADX(14) + MACD + Candlestick Filter',
      style: 'LONG_TERM',
      source: 'github.com/xgboosted/pandas-ta-classic (math)',
      license: 'MIT',
      codeReviewStatus: 'PASSED',
      backtestStatus: 'PASSED',
      demoTestStatus: 'PASSED',
      ownerApproved: false,
      ownerApprovedAt: null,
      active: false,
      winRatePct: 65.4,
      profitFactor: 1.72,
      notesUz: 'Kuchli trend filtri bilan ishlaydi.',
    },
    {
      id: 'strat-azadone-ichimoku-sweep',
      name: 'Ichimoku Kumo + Liquidity Sweep',
      style: 'SCALPING',
      source: 'Clean-room Ichimoku + Liquidity',
      license: 'Internal / Clean-room',
      codeReviewStatus: 'PASSED',
      backtestStatus: 'PENDING',
      demoTestStatus: 'PENDING',
      ownerApproved: false,
      ownerApprovedAt: null,
      active: false,
      winRatePct: 63.2,
      profitFactor: 1.61,
      notesUz: 'Backtest va Demo bosqichlaridan o‘tkazish zarur.',
    },
    {
      id: 'strat-pynecore-hma-flow',
      name: 'HMA(21) Trend Flow + Chart Breakout',
      style: 'LONG_TERM',
      source: 'github.com/theonetrade/pynecore-strategies (math)',
      license: 'Apache-2.0 / Clean-room',
      codeReviewStatus: 'PASSED',
      backtestStatus: 'PASSED',
      demoTestStatus: 'PENDING',
      ownerApproved: false,
      ownerApprovedAt: null,
      active: false,
      winRatePct: 66.0,
      profitFactor: 1.79,
      notesUz: 'Chart pattern breakout tasdig‘i bilan ishlaydi.',
    },
  ];
}

function createDefaultEngineMetrics(): EngineMetricsRecord {
  return {
    aiAnalysisState: 'IDLE',
    aiAnalysisError: null,
    lastCycleTime: null,
    lastAiLlmTime: null,
    instrumentsAnalyzed: 0,
    signalsGenerated: 0,
    buySignals: 0,
    sellSignals: 0,
    waitSignals: 0,
    noTradeSignals: 0,
    ordersSent: 0,
    ordersRejected: 0,
    aiSlTpModifications: 0,
    aiClosedPositions: 0,
    openPositionsCount: 0,
    lastSuccessfulExecution: null,
    lastRejectionReason: null,
    currentPortfolioRiskPct: 0,
  };
}

export function seedDefaultEnsembleStrategies(): EnsembleStrategyRecord[] {
  const base = (
    id: string,
    name: string,
    category: EnsembleStrategyCategory,
    family: string,
    weight: number,
    regimes: string[]
  ): EnsembleStrategyRecord => ({
    id,
    name,
    category,
    family,
    weight,
    enabled: true,
    approved: true,
    regimes,
    lastSignal: 'WAIT',
    lastConfidence: 0,
    lastReasonUz: 'Hali baholanmagan',
    lastEvaluatedAt: null,
    totalEvaluations: 0,
    signalsProduced: 0,
  });

  return [
    base('ema-trend', 'EMA Trend (9/20/50/100/200)', 'TREND', 'moving-average', 1.25, ['Strong Bullish Trend', 'Strong Bearish Trend', 'Breakout']),
    base('rsi', 'RSI (14) Momentum & Extremes', 'MOMENTUM', 'oscillator', 1.0, ['Sideways / Range', 'Reversal', 'Accumulation', 'Distribution']),
    base('macd', 'MACD (12/26/9) Histogram', 'MOMENTUM', 'oscillator', 1.05, ['Strong Bullish Trend', 'Strong Bearish Trend', 'Breakout', 'Reversal']),
    base('adx', 'ADX (14) & ±DI Trend Strength', 'TREND', 'trend-strength', 1.15, ['Strong Bullish Trend', 'Strong Bearish Trend', 'Breakout']),
    base('bollinger-bands', 'Bollinger Bands & Squeeze', 'VOLATILITY', 'volatility-bands', 1.0, ['Sideways / Range', 'Low Volatility', 'Breakout']),
    base('vwap', 'VWAP ±σ Institutional Bands', 'VOLATILITY', 'volatility-bands', 1.1, ['Sideways / Range', 'High Volatility', 'Accumulation', 'Distribution']),
    base('price-action', 'Price Action Swing Structure', 'PRICE_ACTION', 'price-structure', 1.2, ['Strong Bullish Trend', 'Strong Bearish Trend', 'Reversal', 'Breakout']),
    base('candlestick', 'Candlestick Pattern Engine', 'PRICE_ACTION', 'candlestick', 1.15, ['Reversal', 'Sideways / Range', 'Accumulation', 'Distribution']),
    base('fibonacci', 'Fibonacci Retracement & OTE', 'PRICE_ACTION', 'key-levels', 0.95, ['Strong Bullish Trend', 'Strong Bearish Trend', 'Reversal']),
    base('breakout', 'Chart & Range Breakout', 'PRICE_ACTION', 'breakout', 1.2, ['Breakout', 'Low Volatility', 'Strong Bullish Trend', 'Strong Bearish Trend']),
    base('support-resistance', 'Support / Resistance Zones', 'PRICE_ACTION', 'key-levels', 1.1, ['Sideways / Range', 'Reversal', 'Accumulation', 'Distribution']),
    base('ict', 'ICT Premium / Discount & OTE', 'SMC_ICT', 'ict-smc', 1.25, ['Strong Bullish Trend', 'Strong Bearish Trend', 'Accumulation', 'Distribution']),
    base('smc', 'Smart Money Concepts Composite', 'SMC_ICT', 'ict-smc', 1.35, ['Strong Bullish Trend', 'Strong Bearish Trend', 'Breakout', 'Reversal']),
    base('liquidity-sweep', 'Liquidity Sweep (BSL / SSL)', 'SMC_ICT', 'liquidity', 1.3, ['Reversal', 'Accumulation', 'Distribution', 'High Volatility']),
    base('bos-choch', 'BOS / CHoCH / MSS Structure', 'SMC_ICT', 'structure-break', 1.3, ['Strong Bullish Trend', 'Strong Bearish Trend', 'Breakout', 'Reversal']),
    base('fvg', 'Fair Value Gap (FVG Imbalance)', 'SMC_ICT', 'imbalance', 1.1, ['Strong Bullish Trend', 'Strong Bearish Trend', 'Breakout']),
    base('order-block', 'Institutional Order Block (OB)', 'SMC_ICT', 'order-flow', 1.2, ['Strong Bullish Trend', 'Strong Bearish Trend', 'Accumulation', 'Distribution']),
    base('volume-analysis', 'Volume Surge & OBV Confirmation', 'VOLUME', 'volume', 1.05, ['Breakout', 'Strong Bullish Trend', 'Strong Bearish Trend', 'High Volatility']),
  ];
}

export function createDefaultRiskSettings(): PersistentRiskSettings {
  return {
    dailyMaxLossUsd: 500,
    maxOpenPositions: 20,
    maxDrawdownPct: 5.0,
    riskPerTradePct: 1.0,
    maxPortfolioRiskPct: 5.0,
    maxMarginUsagePct: 40.0,
    maxCorrelatedExposure: 3,
    maxSpreadPoints: 300,
    maxVolatilityAtrPct: 3.5,
    testAccountBalanceUsd: 10000,
  };
}

function hydrateDb(parsed: Partial<LocalMemoryDatabase>): LocalMemoryDatabase {
  const now = new Date().toISOString();
  const baseControl = parsed.control ?? ({} as Partial<ControlStateRecord>);
  const seededEnsemble = seedDefaultEnsembleStrategies();
  const existingEnsembleMap = new Map(
    (Array.isArray(parsed.ensembleStrategies) ? parsed.ensembleStrategies : []).map((s) => [s.id, s])
  );
  const mergedEnsemble = seededEnsemble.map((def) => {
    const saved = existingEnsembleMap.get(def.id);
    if (!saved) return def;
    return {
      ...def,
      enabled: typeof saved.enabled === 'boolean' ? saved.enabled : def.enabled,
      approved: typeof saved.approved === 'boolean' ? saved.approved : def.approved,
      weight: typeof saved.weight === 'number' && saved.weight > 0 ? saved.weight : def.weight,
      lastSignal: saved.lastSignal ?? def.lastSignal,
      lastConfidence: typeof saved.lastConfidence === 'number' ? saved.lastConfidence : 0,
      lastReasonUz: saved.lastReasonUz ?? def.lastReasonUz,
      lastEvaluatedAt: saved.lastEvaluatedAt ?? null,
      totalEvaluations: typeof saved.totalEvaluations === 'number' ? saved.totalEvaluations : 0,
      signalsProduced: typeof saved.signalsProduced === 'number' ? saved.signalsProduced : 0,
    };
  });

  return {
    schemaVersion: 4,
    createdAt: parsed.createdAt ?? now,
    updatedAt: parsed.updatedAt ?? now,
    mt5Config: {
      bridgeUrl:
        typeof parsed.mt5Config?.bridgeUrl === 'string' && parsed.mt5Config.bridgeUrl.trim()
          ? parsed.mt5Config.bridgeUrl.trim().replace(/\/$/, '')
          : (process.env.MT5_BRIDGE_URL || 'http://127.0.0.1:8000').replace(/\/$/, ''),
      autoSync: parsed.mt5Config?.autoSync !== false,
      pollingIntervalMs:
        typeof parsed.mt5Config?.pollingIntervalMs === 'number' && parsed.mt5Config.pollingIntervalMs >= 1000
          ? Math.min(30000, Math.round(parsed.mt5Config.pollingIntervalMs))
          : 3000,
      historyTargetYears:
        typeof parsed.mt5Config?.historyTargetYears === 'number' && parsed.mt5Config.historyTargetYears >= 0.5
          ? Math.min(5, parsed.mt5Config.historyTargetYears)
          : 2.5,
    },
    mt5SymbolsCache: Array.isArray(parsed.mt5SymbolsCache) ? parsed.mt5SymbolsCache : [],
    control: {
      scannerStatus: baseControl.scannerStatus === 'PAUSED' ? 'PAUSED' : 'RUNNING',
      stopNewTrades: Boolean(baseControl.stopNewTrades),
      autonomousMode:
        baseControl.autonomousMode === 'AUTONOMOUS' || baseControl.autonomousMode === 'SIGNAL'
          ? baseControl.autonomousMode
          : 'OBSERVATION',
      autoBackupEnabled: baseControl.autoBackupEnabled ?? true,
      lastAnalysisTime: baseControl.lastAnalysisTime ?? null,
      instrumentsScanned: Number(baseControl.instrumentsScanned) || 0,
      lastBackupAt: baseControl.lastBackupAt ?? null,
      maxOpenOrders:
        typeof baseControl.maxOpenOrders === 'number' && baseControl.maxOpenOrders >= 1
          ? Math.min(100, Math.round(baseControl.maxOpenOrders))
          : 20,
      maxPortfolioRiskPct:
        typeof baseControl.maxPortfolioRiskPct === 'number' && baseControl.maxPortfolioRiskPct >= 0.5
          ? Math.min(25, baseControl.maxPortfolioRiskPct)
          : 5.0,
      aiAutoSlTpEnabled: baseControl.aiAutoSlTpEnabled ?? true,
      allowRealAccountTrading: Boolean(baseControl.allowRealAccountTrading),
    },
    strategies: Array.isArray(parsed.strategies) ? parsed.strategies : seedDefaultStrategies(),
    ensembleStrategies: mergedEnsemble,
    unifiedAnalyses:
      parsed.unifiedAnalyses && typeof parsed.unifiedAnalyses === 'object'
        ? parsed.unifiedAnalyses
        : {},
    scannerStates:
      parsed.scannerStates && typeof parsed.scannerStates === 'object'
        ? parsed.scannerStates
        : {},
    orders: Array.isArray(parsed.orders) ? parsed.orders : [],
    riskSettings: {
      ...createDefaultRiskSettings(),
      ...(parsed.riskSettings ?? {}),
    },
    llmHealth: {
      status: parsed.llmHealth?.status ?? 'UNCONFIGURED',
      provider: parsed.llmHealth?.provider ?? null,
      lastCheckedAt: parsed.llmHealth?.lastCheckedAt ?? null,
      lastError: parsed.llmHealth?.lastError ?? null,
    },
    notifications: Array.isArray(parsed.notifications) ? parsed.notifications : [],
    analyses: Array.isArray(parsed.analyses) ? parsed.analyses : [],
    signals: Array.isArray(parsed.signals) ? parsed.signals : [],
    engineMetrics: {
      ...createDefaultEngineMetrics(),
      ...(parsed.engineMetrics ?? {}),
    },
    diagnostics: Array.isArray(parsed.diagnostics) ? parsed.diagnostics : [],
    perSymbolReports:
      parsed.perSymbolReports && typeof parsed.perSymbolReports === 'object'
        ? parsed.perSymbolReports
        : {},
    executionLogs: Array.isArray(parsed.executionLogs) ? parsed.executionLogs : [],
    executedSignalHashes: Array.isArray(parsed.executedSignalHashes)
      ? parsed.executedSignalHashes
      : [],
    aiChats: {
      chief_analyst: Array.isArray(parsed.aiChats?.chief_analyst) ? parsed.aiChats.chief_analyst : [],
      market_intelligence: Array.isArray(parsed.aiChats?.market_intelligence) ? parsed.aiChats.market_intelligence : [],
      strategy_analyst: Array.isArray(parsed.aiChats?.strategy_analyst) ? parsed.aiChats.strategy_analyst : [],
      risk_intelligence: Array.isArray(parsed.aiChats?.risk_intelligence) ? parsed.aiChats.risk_intelligence : [],
      trade_manager: Array.isArray(parsed.aiChats?.trade_manager) ? parsed.aiChats.trade_manager : [],
      self_evaluation: Array.isArray(parsed.aiChats?.self_evaluation) ? parsed.aiChats.self_evaluation : [],
    },
    aiChatDedupIndex:
      parsed.aiChatDedupIndex && typeof parsed.aiChatDedupIndex === 'object'
        ? parsed.aiChatDedupIndex
        : {},
    strategySelfEvalMemory: Array.isArray(parsed.strategySelfEvalMemory)
      ? parsed.strategySelfEvalMemory
      : [],
  };
}

function createInitialDb(): LocalMemoryDatabase {
  const now = new Date().toISOString();
  return hydrateDb({
    schemaVersion: 2,
    createdAt: now,
    updatedAt: now,
    control: {
      scannerStatus: 'RUNNING',
      stopNewTrades: false,
      autonomousMode: 'OBSERVATION',
      autoBackupEnabled: true,
      lastAnalysisTime: null,
      instrumentsScanned: 0,
      lastBackupAt: null,
      maxOpenOrders: 20,
      maxPortfolioRiskPct: 5.0,
      aiAutoSlTpEnabled: true,
      allowRealAccountTrading: false,
    },
    strategies: seedDefaultStrategies(),
    notifications: [
      {
        id: `ntf-${Date.now()}`,
        timestamp: now,
        priority: 'NORMAL',
        category: 'SERVER',
        title: 'Lokal Xotira va Xavfsizlik Tizimi Ishga Tushdi',
        message: 'Barcha strategiyalar sukut bo‘yicha Kuzatuv (Observation) rejimida. Avto-savdo faqat Owner tasdig‘idan so‘ng faollashadi.',
        acknowledged: false,
      },
    ],
    analyses: [],
    signals: [],
    engineMetrics: createDefaultEngineMetrics(),
    diagnostics: [],
    perSymbolReports: {},
    executionLogs: [],
    executedSignalHashes: [],
  });
}

function ensureStorageDirs() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true, mode: 0o700 });
  }
  if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true, mode: 0o700 });
  }
}

let dbHealthy = true;
let lastAutoBackupTs = 0;

export function loadMemoryDb(): LocalMemoryDatabase {
  ensureStorageDirs();
  if (!fs.existsSync(DB_FILE)) {
    const fresh = createInitialDb();
    saveMemoryDb(fresh);
    dbHealthy = true;
    return fresh;
  }
  try {
    const raw = fs.readFileSync(DB_FILE, 'utf8');
    const parsed = JSON.parse(raw) as Partial<LocalMemoryDatabase>;
    if (!parsed || !Array.isArray(parsed.strategies) || !parsed.control) {
      throw new Error('Corrupted DB structure');
    }
    dbHealthy = true;
    return hydrateDb(parsed);
  } catch {
    // Attempt automatic recovery from latest valid backup
    const backups = listBackups();
    for (const b of backups) {
      try {
        const resolved = resolveSafeBackupPath(b.filename);
        if (!resolved) continue;
        const raw = fs.readFileSync(resolved, 'utf8');
        const recovered = JSON.parse(raw) as Partial<LocalMemoryDatabase>;
        if (recovered && Array.isArray(recovered.strategies)) {
          const hydrated = hydrateDb(recovered);
          saveMemoryDb(hydrated);
          dbHealthy = true;
          return hydrated;
        }
      } catch {
        // try older backup
      }
    }
    dbHealthy = false;
    const fresh = createInitialDb();
    saveMemoryDb(fresh);
    return fresh;
  }
}

export function saveMemoryDb(db: LocalMemoryDatabase): void {
  ensureStorageDirs();
  db.updatedAt = new Date().toISOString();
  const tmpFile = `${DB_FILE}.tmp`;
  fs.writeFileSync(tmpFile, JSON.stringify(db, null, 2), { encoding: 'utf8', mode: 0o600 });
  fs.renameSync(tmpFile, DB_FILE);
  dbHealthy = true;

  // Automatic hourly backup if enabled
  const now = Date.now();
  if (db.control.autoBackupEnabled && now - lastAutoBackupTs > 3600 * 1000) {
    lastAutoBackupTs = now;
    try {
      createBackup('auto', db);
    } catch {
      // ignore non-fatal auto backup errors
    }
  }
}

export function resolveSafeBackupPath(filename: string): string | null {
  if (typeof filename !== 'string' || !/^[a-zA-Z0-9._-]+\.json$/.test(filename)) {
    return null;
  }
  const resolved = path.resolve(BACKUP_DIR, filename);
  if (!resolved.startsWith(BACKUP_DIR + path.sep)) {
    return null;
  }
  return resolved;
}

export function createBackup(tag: 'manual' | 'auto' = 'manual', existingDb?: LocalMemoryDatabase) {
  ensureStorageDirs();
  const db = existingDb ?? loadMemoryDb();
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `tk-backup-${tag}-${stamp}.json`;
  const target = resolveSafeBackupPath(filename);
  if (!target) throw new Error('Backup fayl nomi xato.');
  fs.writeFileSync(target, JSON.stringify(db, null, 2), { encoding: 'utf8', mode: 0o600 });

  // Retain latest 25 backups to protect disk space
  const all = listBackups();
  if (all.length > 25) {
    for (const old of all.slice(25)) {
      const oldPath = resolveSafeBackupPath(old.filename);
      if (oldPath && fs.existsSync(oldPath)) {
        fs.unlinkSync(oldPath);
      }
    }
  }

  db.control.lastBackupAt = new Date().toISOString();
  if (!existingDb) {
    saveMemoryDb(db);
  }
  const stat = fs.statSync(target);
  return {
    filename,
    sizeBytes: stat.size,
    createdAt: stat.mtime.toISOString(),
  };
}

export function listBackups(): { filename: string; sizeBytes: number; createdAt: string }[] {
  ensureStorageDirs();
  try {
    const files = fs.readdirSync(BACKUP_DIR).filter((f) => /^[a-zA-Z0-9._-]+\.json$/.test(f));
    return files
      .map((filename) => {
        const full = resolveSafeBackupPath(filename);
        if (!full) return null;
        const st = fs.statSync(full);
        return {
          filename,
          sizeBytes: st.size,
          createdAt: st.mtime.toISOString(),
        };
      })
      .filter((x): x is { filename: string; sizeBytes: number; createdAt: string } => x !== null)
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  } catch {
    return [];
  }
}

export function restoreBackup(filename: string): { ok: boolean; error?: string } {
  const target = resolveSafeBackupPath(filename);
  if (!target || !fs.existsSync(target)) {
    return { ok: false, error: 'Tanlangan backup fayli topilmadi.' };
  }
  try {
    const raw = fs.readFileSync(target, 'utf8');
    const parsed = JSON.parse(raw) as LocalMemoryDatabase;
    if (!parsed || !Array.isArray(parsed.strategies) || !parsed.control) {
      return { ok: false, error: 'Backup fayli strukturasi buzilgan.' };
    }
    // Safety snapshot before overwrite
    createBackup('auto');
    saveMemoryDb(parsed);
    pushNotification({
      priority: 'HIGH',
      category: 'SERVER',
      title: 'Baza muvaffaqiyatli tiklandi',
      message: `Tarixiy xotira "${filename}" nusxasidan tiklandi.`,
    });
    return { ok: true };
  } catch {
    return { ok: false, error: 'Backup faylini o‘qib bo‘lmadi.' };
  }
}

export function pushNotification(input: {
  priority: NotificationPriority;
  category: NotificationCategory;
  title: string;
  message: string;
  symbol?: string;
}): SystemNotificationRecord {
  const db = loadMemoryDb();
  const item: SystemNotificationRecord = {
    id: `ntf-${Date.now()}-${crypto.randomBytes(2).toString('hex')}`,
    timestamp: new Date().toISOString(),
    priority: input.priority,
    category: input.category,
    title: input.title,
    message: input.message,
    symbol: input.symbol,
    acknowledged: false,
  };
  db.notifications.unshift(item);
  db.notifications = db.notifications.slice(0, 200);
  saveMemoryDb(db);
  return item;
}

export function getDiskAndSystemMetrics() {
  ensureStorageDirs();
  let dbSizeBytes = 0;
  try {
    if (fs.existsSync(DB_FILE)) {
      dbSizeBytes = fs.statSync(DB_FILE).size;
    }
  } catch {
    dbSizeBytes = 0;
  }

  let diskTotalGb: number | null = null;
  let diskFreeGb: number | null = null;
  let diskUsedPct: number | null = null;
  try {
    const statfs = fs.statfsSync(DATA_DIR);
    const total = Number(statfs.blocks) * Number(statfs.bsize);
    const avail = Number(statfs.bavail) * Number(statfs.bsize);
    if (total > 0) {
      diskTotalGb = Number((total / 1024 ** 3).toFixed(2));
      diskFreeGb = Number((avail / 1024 ** 3).toFixed(2));
      diskUsedPct = Number((((total - avail) / total) * 100).toFixed(1));
    }
  } catch {
    // statfs unavailable on restricted platforms
  }

  const totalMemMb = Math.round(os.totalmem() / 1024 ** 2);
  const freeMemMb = Math.round(os.freemem() / 1024 ** 2);
  const usedMemMb = Math.max(0, totalMemMb - freeMemMb);
  const processRssMb = Math.round(process.memoryUsage().rss / 1024 ** 2);
  const memUsedPct = totalMemMb > 0 ? Number(((usedMemMb / totalMemMb) * 100).toFixed(1)) : 0;

  return {
    dbHealthy,
    dbSizeKb: Number((dbSizeBytes / 1024).toFixed(1)),
    diskTotalGb,
    diskFreeGb,
    diskUsedPct,
    totalMemMb,
    usedMemMb,
    memUsedPct,
    processRssMb,
    uptimeSec: Math.round(process.uptime()),
    hostname: os.hostname(),
    platform: `${os.platform()} ${os.arch()}`,
  };
}
