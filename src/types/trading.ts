export type ViewId =
  | 'dashboard'
  | 'analyst'
  | 'scanner'
  | 'strategies'
  | 'ensemble'
  | 'candlesticks'
  | 'smc'
  | 'memory'
  | 'backtest'
  | 'research'
  | 'autotrading'
  | 'multiorder'
  | 'risk'
  | 'calendar'
  | 'journal'
  | 'monitor'
  | 'notifications'
  | 'owner'
  | 'settings';

export type OrderSide = 'LONG' | 'SHORT';
export type OrderType = 'MARKET' | 'LIMIT';
export type Timeframe = 'M1' | 'M5' | 'M15' | 'M30' | 'H1' | 'H4' | 'D1' | 'W1';
export type TradingStyle = 'SCALPING' | 'LONG_TERM';
export type PositionStatus = 'OPEN' | 'CLOSED' | 'PENDING';
export type AssetClass = 'FOREX' | 'METAL' | 'CRYPTO' | 'INDEX' | 'ENERGY';

export interface CandlePoint {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface MarketPair {
  symbol: string;
  base: string;
  quote: string;
  price: number;
  spreadPoints: number;
  change24h: number;
  high24h: number;
  low24h: number;
  volume24h: number;
  rsi14: number;
  trend: 'Ko‘tarilish' | 'Pasayish' | 'Yonlama';
  contractSize: number;
  tickSize?: number;
  point?: number;
  assetClass?: AssetClass;
  tradingSession?: string;
}

export interface Position {
  id: string;
  symbol: string;
  side: OrderSide;
  orderType: OrderType;
  entryPrice: number;
  markPrice: number;
  lotSize: number;
  sizeUsdt: number;
  leverage: number;
  stopLoss: number | null;
  takeProfit: number | null;
  status: PositionStatus;
  strategyName: string;
  openedAt: string;
  closedAt?: string;
  realizedPnl?: number;
  profit?: number;
}

export interface StrategyConfig {
  id: string;
  name: string;
  style: TradingStyle;
  description: string;
  pairScope: string;
  enabled: boolean;
  maxAllocationUsdt: number;
  leverageCap: number;
  stopLossPct: number;
  takeProfitPct: number;
  trailingStop: boolean;
  winRate: number;
  totalTrades: number;
  netPnlUsdt: number;
  sourceRepo?: string;
}

export interface RiskGuardSettings {
  dailyMaxLossUsdt: number;
  maxOpenPositions: number;
  autoKillOnDrawdown: boolean;
  drawdownLimitPct: number;
  maxSpreadPoints?: number;
  maxVolatilityAtrPct?: number;
  defaultRiskPct?: number;
}

export interface ServerConfig {
  apiBaseUrl: string;
  wsUrl: string;
  mt5Login: string;
  mt5Server: string;
  llmProxyUrl: string;
  pollingIntervalMs: number;
  autoSyncMt5: boolean;
}

export interface AiActionLog {
  id: string;
  name: string;
  summary: string;
  timestamp: string;
}

export interface AiChatMessage {
  id: string;
  role: 'user' | 'model';
  text: string;
  timestamp: string;
  actions?: AiActionLog[];
}

export interface AiRecommendation {
  symbol: string;
  action: 'BUY' | 'SELL' | 'WAIT' | 'NO TRADE' | string;
  style?: string;
  entry: string;
  stopLoss: string;
  takeProfit: string;
  rationale: string;
}

export interface AiSummaryReport {
  marketBias: string;
  confidencePct: number;
  headline: string;
  riskNote: string;
  recommendations: AiRecommendation[];
  generatedAt: string;
}

export interface AiScanSignal {
  symbol: string;
  style: 'Skalping' | 'Uzoq muddatli' | string;
  timeframe: string;
  signal: 'BUY' | 'SELL' | 'NEUTRAL' | 'WAIT' | string;
  confidencePct: number;
  entry: string;
  stopLoss: string;
  takeProfit: string;
  summary: string;
}

/* ---------------- CANDLESTICK INTELLIGENCE ---------------- */
export type CandleDirection = 'BULLISH' | 'BEARISH' | 'NEUTRAL';
export type CandlestickCategory = 'REVERSAL' | 'CONTINUATION' | 'NEUTRAL';
export type PatternConfirmationStatus = 'TASDIQLANGAN' | 'KUTILMOQDA' | 'RAD_ETILGAN';

export interface CandleGeometry {
  index: number;
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  bodySize: number;
  upperWick: number;
  lowerWick: number;
  candleRange: number;
  bodyRatio: number;
  direction: CandleDirection;
}

export interface DetectedCandlestickPattern {
  id: string;
  index: number;
  time: string;
  patternName: string;
  category: CandlestickCategory;
  bias: CandleDirection;
  strength: number;
  confirmationStatus: PatternConfirmationStatus;
  confirmationReasons: string[];
  invalidationPrice: number;
  invalidationCondition: string;
  geometry: CandleGeometry;
}

export interface CandlestickIntelligenceReport {
  latestGeometry: CandleGeometry;
  patterns: DetectedCandlestickPattern[];
  latestConfirmedPattern: DetectedCandlestickPattern | null;
  latestActivePattern: DetectedCandlestickPattern | null;
  bullishCount: number;
  bearishCount: number;
  neutralCount: number;
  summaryUz: string;
}

/* ---------------- CHART PATTERN INTELLIGENCE ---------------- */
export type ChartPatternCategory = 'REVERSAL' | 'CONTINUATION' | 'BILATERAL' | 'HARMONIC';
export type ChartPatternStatus = 'SHAKLLANMOQDA' | 'BREAKOUT_TASDIQLANDI' | 'BEKOR_QILINGAN';

export interface ChartPatternPoint {
  index: number;
  price: number;
  label?: string;
}

export interface DetectedChartPattern {
  id: string;
  name: string;
  category: ChartPatternCategory;
  bias: CandleDirection;
  status: ChartPatternStatus;
  strength: number;
  startIndex: number;
  endIndex: number;
  breakoutLevel: number;
  targetPrice: number;
  invalidationLevel: number;
  points: ChartPatternPoint[];
  descriptionUz: string;
}

export interface ChartPatternIntelligenceReport {
  patterns: DetectedChartPattern[];
  activePattern: DetectedChartPattern | null;
  confirmedBreakoutCount: number;
  formingCount: number;
}

/* ---------------- TECHNICAL INDICATORS ENGINE ---------------- */
export interface FibonacciLevels {
  swingHigh: number;
  swingLow: number;
  direction: 'UP' | 'DOWN';
  fib236: number;
  fib382: number;
  fib500: number;
  fib618: number;
  fib786: number;
  ext1272: number;
  ext1618: number;
  currentZone: string;
}

export interface TechnicalIndicatorsReport {
  trend: {
    ema9: number;
    ema20: number;
    ema50: number;
    ema100: number;
    ema200: number;
    sma20: number;
    hma21: number;
    supertrendDir: 1 | -1;
    supertrendLevel: number;
    psar: number;
    psarBias: 'BULLISH' | 'BEARISH';
    ichimokuTenkan: number;
    ichimokuKijun: number;
    ichimokuKumo: 'BULL_KUMO' | 'BEAR_KUMO' | 'KUMO_ICHIDA';
    adx14: number;
    plusDi: number;
    minusDi: number;
  };
  momentum: {
    rsi14: number;
    macdLine: number;
    macdSignal: number;
    macdHist: number;
    stochK: number;
    stochD: number;
    cci20: number;
    ttmSqueezeOn: boolean;
    ttmMomentum: number;
  };
  volatility: {
    atr14: number;
    atrPct: number;
    bbUpper: number;
    bbMiddle: number;
    bbLower: number;
    bbWidthPct: number;
    vwap: number;
    vwapUpper201: number;
    vwapLower201: number;
  };
  volume: {
    currentVolume: number;
    avgVolume20: number;
    volumeRatio: number;
    obv: number;
    obvTrend: 'OSHISH' | 'PASAYISH' | 'YONLAMA';
  };
  fibonacci: FibonacciLevels;
  deduplicationNotes: string[];
}

/* ---------------- SMART MONEY & LIQUIDITY ---------------- */
export interface LiquidityPool {
  type: 'BSL' | 'SSL';
  price: number;
  swept: boolean;
  label: string;
}

export interface SessionLevels {
  asiaHigh: number;
  asiaLow: number;
  londonHigh: number;
  londonLow: number;
  nyHigh: number;
  nyLow: number;
}

export interface SmcDeepReport {
  structureState: 'BULLISH_STRUCTURE' | 'BEARISH_STRUCTURE' | 'CONSOLIDATION';
  mssDetected: 'BULLISH_MSS' | 'BEARISH_MSS' | 'YO‘Q';
  lastBosOrChoch: string;
  bslLevels: LiquidityPool[];
  sslLevels: LiquidityPool[];
  recentSweep: 'BSL_SWEEP' | 'SSL_SWEEP' | 'YO‘Q';
  equalHighs: boolean;
  equalLows: boolean;
  zone: 'Premium' | 'Equilibrium' | 'Discount';
  zonePct: number;
  activeBullObCount: number;
  activeBearObCount: number;
  activeFvgCount: number;
  sessionLevels: SessionLevels;
  summaryUz: string;
}

/* ---------------- MARKET REGIME DETECTION ---------------- */
export type MarketRegimeId =
  | 'Strong Bullish Trend'
  | 'Strong Bearish Trend'
  | 'Sideways / Range'
  | 'Accumulation'
  | 'Distribution'
  | 'High Volatility'
  | 'Low Volatility'
  | 'Breakout'
  | 'Reversal'
  | 'Uncertain Market';

export interface MarketRegimeReport {
  regime: MarketRegimeId;
  labelUz: string;
  trendStrength: number;
  volatilityState: 'PAST' | 'NORMAL' | 'YUQORI';
  selectedStrategyIds: string[];
  suppressedStrategyIds: string[];
  rationaleUz: string;
}

/* ---------------- MULTI-TIMEFRAME BRAIN ---------------- */
export interface TimeframeBiasEntry {
  timeframe: Timeframe;
  layer: 'MAKRO (D1/W1/H4)' | 'SETUP (H1/M30)' | 'KIRISH (M15/M5/M1)';
  bias: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  regime: MarketRegimeId;
  rsi14: number;
  adx14: number;
  candlestickNote: string;
  smcBias: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
}

export interface MultiTimeframeReport {
  symbol: string;
  entries: TimeframeBiasEntry[];
  macroBias: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  setupBias: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  entryBias: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  alignmentPct: number;
  conflictDetected: boolean;
  conflictReasonUz: string | null;
}

/* ---------------- STRATEGY SELECTION & INTELLIGENT DECISION ---------------- */
export interface StrategyDecisionCard {
  strategyId: string;
  strategyName: string;
  selectedForRegime: boolean;
  signal: 'BUY' | 'SELL' | 'WAIT';
  reasonUz: string;
  confirmingIndicators: string[];
  opposingSignals: string[];
  entryCondition: string;
  invalidation: string;
  sl: number;
  tp: number;
  riskReward: number;
}

export interface DecisionDimensionScores {
  trendAlignment: number;
  candlestickConfirmation: number;
  marketStructure: number;
  liquidity: number;
  momentum: number;
  volatility: number;
  volume: number;
  multiTimeframe: number;
  strategyAgreement: number;
  riskReward: number;
}

export interface RiskEvaluationResult {
  atr14: number;
  atrStopLoss: number;
  dynamicStopLoss: number;
  takeProfit: number;
  trailingStopDistance: number;
  breakEvenPrice: number;
  recommendedLot: number;
  riskAmountUsd: number;
  riskPct: number;
  spreadPoints: number;
  spreadOk: boolean;
  volatilityOk: boolean;
  dailyLossOk: boolean;
  drawdownOk: boolean;
  overallAllowed: boolean;
  blockReasons: string[];
}

export type FinalDecisionAction = 'BUY' | 'SELL' | 'WAIT' | 'NO TRADE';

export interface IntelligentDecisionReport {
  symbol: string;
  timeframe: Timeframe;
  timestamp: string;
  finalAction: FinalDecisionAction;
  analyticalScore: number;
  calibratedWinProbPct: number | null;
  calibrationNoteUz: string;
  regime: MarketRegimeReport;
  mtf: MultiTimeframeReport;
  dimensions: DecisionDimensionScores;
  supportingEvidenceUz: string[];
  opposingEvidenceUz: string[];
  explanationUz: string;
  strategyDecisions: StrategyDecisionCard[];
  riskEvaluation: RiskEvaluationResult;
}

/* ---------------- SELF-EVALUATION & LEARNING SYSTEM ---------------- */
export type LearningOutcome = 'PENDING' | 'WIN' | 'LOSS' | 'BREAKEVEN';

export interface LearningRecord {
  id: string;
  timestamp: string;
  symbol: string;
  timeframe: Timeframe;
  action: FinalDecisionAction;
  strategyId: string;
  strategyName: string;
  candlestickPattern: string;
  regime: MarketRegimeId;
  analyticalScore: number;
  entryPrice: number;
  stopLoss: number;
  takeProfit: number;
  outcome: LearningOutcome;
  pnlUsd: number;
  rMultiple: number;
  notesUz: string;
}

export interface LearningPerformanceBucket {
  key: string;
  total: number;
  wins: number;
  losses: number;
  winRatePct: number;
  netPnlUsd: number;
  avgR: number;
}

export interface LearningSystemReport {
  totalLogged: number;
  resolvedCount: number;
  overallWinRatePct: number | null;
  byStrategy: LearningPerformanceBucket[];
  byPattern: LearningPerformanceBucket[];
  byTimeframe: LearningPerformanceBucket[];
  byRegime: LearningPerformanceBucket[];
  recommendationsUz: string[];
  calibrationSampleReady: boolean;
}

/* ---------------- LEGACY + UNIFIED BRAIN SNAPSHOT ---------------- */
export interface StrategyBrainSnapshot {
  symbol: string;
  timeframe: Timeframe;
  lastPrice: number;
  emaRibbon: {
    ema20: number;
    ema50: number;
    ema100: number;
    ema200: number;
    alignment: 'Buqa Fan (20>50>100>200)' | 'Ayiq Fan (20<50<100<200)' | 'Aralash';
  };
  rsiBars: {
    rsi14: number;
    zone: 'Overbought (>70)' | 'Oversold (<30)' | 'Neytral (30-70)';
  };
  rsiDivergence: {
    latestType: 'BULL' | 'BEAR' | 'YO‘Q';
    barsAgo: number | null;
    pivotHigh: boolean;
    pivotLow: boolean;
  };
  smc: {
    swingBias: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
    internalBias: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
    lastStructureTag: string;
    zone: 'Premium' | 'Equilibrium' | 'Discount';
    zonePct: number;
    activeBullishObCount: number;
    activeBearishObCount: number;
    activeFvgCount: number;
    equalHighsDetected: boolean;
    equalLowsDetected: boolean;
    nearestBullOb: { top: number; bottom: number } | null;
    nearestBearOb: { top: number; bottom: number } | null;
  };
  scalpingPullback: {
    pacUpper: number;
    pacLower: number;
    pacCenter: number;
    fastEma89: number;
    mediumEma200: number;
    slowEma600: number;
    trendDirection: 1 | -1 | 0;
    barLocation: 'PAC Yuqorisida' | 'PAC Ichida' | 'PAC Pastida';
    signal: 'BUY' | 'SELL' | 'KUTISH';
    latestFractal: 'HH' | 'LH' | 'HL' | 'LL' | 'YO‘Q';
  };
  vwapBands: {
    vwap: number;
    upper128: number;
    lower128: number;
    upper201: number;
    lower201: number;
    upper251: number;
    lower251: number;
    zone: string;
  };
  verdict: {
    scalpingAction: 'BUY' | 'SELL' | 'KUTISH';
    scalpingScore: number;
    longTermAction: 'BUY' | 'SELL' | 'KUTISH';
    longTermScore: number;
    reasons: string[];
  };
  leviathan: {
    trend: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
    bos: 'BULLISH BOS' | 'BEARISH BOS' | 'YO‘Q';
    pattern: 'Bullish Engulfing' | 'Bearish Engulfing' | 'Bullish Pinbar' | 'Bearish Pinbar' | 'YO‘Q';
    signal: 'BUY' | 'SELL' | 'KUTISH';
  };
  gerakedMt5: {
    utBotSignal: 'BUY' | 'SELL' | 'KUTISH';
    utStop: number;
    zlsma14: number;
    chandelierBias: 'LONG' | 'SHORT';
  };
  alorseSuite: {
    supertrend1Dir: 1 | -1;
    supertrend2Dir: 1 | -1;
    doubleSupertrend: 'DOUBLE_BULL' | 'DOUBLE_BEAR' | 'ARALASH';
    supertrendLevel: number;
    ttmSqueezeOn: boolean;
    ttmMomentum: number;
  };
  pandasTaClassic: {
    adx14: number;
    plusDi: number;
    minusDi: number;
    macdHist: number;
    stochK: number;
    candlePattern: string;
  };
  azadoneTools: {
    tenkan: number;
    kijun: number;
    kumoBias: 'BULL_KUMO' | 'BEAR_KUMO' | 'KUMO_ICHIDA';
    sweepSignal: 'BUY_SWEEP' | 'SELL_SWEEP' | 'YO‘Q';
  };
  pynecoreSuite: {
    hma21: number;
    hmaSlope: 'UP' | 'DOWN';
    flowSignal: 'BULL_FLOW' | 'BEAR_FLOW' | 'NEUTRAL';
  };
  candlestickReport?: CandlestickIntelligenceReport;
  chartPatternReport?: ChartPatternIntelligenceReport;
  technicals?: TechnicalIndicatorsReport;
  smcDeep?: SmcDeepReport;
  regime?: MarketRegimeReport;
}

export type BacktestStrategyId =
  | 'smc_luxalgo'
  | 'scalp_pullback'
  | 'ema_ribbon_rsi'
  | 'vwap_bands'
  | 'all_6_confluence'
  | 'leviathan_pa'
  | 'geraked_ut_zlsma'
  | 'alorse_supertrend_squeeze'
  | 'ichimoku_sweep'
  | 'all_12_mega_brain';

export interface BacktestParams {
  symbol: string;
  style: TradingStyle;
  timeframe: Timeframe;
  barsCount: number;
  strategyId: BacktestStrategyId;
  lotSize: number;
  stopLossPct: number;
  takeProfitPct: number;
  initialCapital: number;
  spreadPoints?: number;
  commissionPerLotUsd?: number;
  slippagePoints?: number;
}

export interface BacktestTrade {
  id: number;
  side: OrderSide;
  entryTime: string;
  exitTime: string;
  entryPrice: number;
  exitPrice: number;
  pnlUsd: number;
  returnPct: number;
  rMultiple: number;
  costsUsd: number;
  exitReason: 'Take-Profit' | 'Stop-Loss' | 'Signal';
}

export interface BacktestStyleBreakdown {
  label: 'Scalping (M1-M15)' | 'Intraday (M30-H1)' | 'Swing (H4-W1)';
  timeframe: Timeframe;
  totalTrades: number;
  winRatePct: number;
  profitFactor: number;
  netProfitUsd: number;
}

export interface BacktestResult {
  params: BacktestParams;
  dataSource: 'MT5 Real Tarix' | 'Simulyatsiya (MT5 ulanmagan)';
  totalTrades: number;
  winTrades: number;
  lossTrades: number;
  winRatePct: number;
  netProfitUsd: number;
  netReturnPct: number;
  profitFactor: number;
  maxDrawdownPct: number;
  avgRiskReward: number;
  expectancyUsd: number;
  sharpeRatio: number;
  totalCostsUsd: number;
  inSampleWinRatePct: number;
  outOfSampleWinRatePct: number;
  noLookaheadVerified: boolean;
  styleBreakdown: BacktestStyleBreakdown[];
  finalCapital: number;
  equityCurve: { index: number; time: string; equity: number }[];
  trades: BacktestTrade[];
  candles: CandlePoint[];
}

/* ---------------- SECURITY, OWNER, REGISTRY, LOCAL MEMORY & MONITORING ---------------- */
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

export interface AuthSessionState {
  token: string;
  csrfToken: string;
  ownerVerified: boolean;
  autoLockMinutes: number;
}

export interface OwnerProfileData {
  fullName: string;
  role: string;
  project: string;
  instagramHandle: string;
  instagramUrl: string;
}

export interface SecurityAuditEntry {
  id: string;
  timestamp: string;
  event: string;
  detail: string;
}

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

export interface ControlStateRecord {
  scannerStatus: 'RUNNING' | 'PAUSED';
  stopNewTrades: boolean;
  autonomousMode: AutonomousMode;
  autoBackupEnabled: boolean;
  lastAnalysisTime: string | null;
  instrumentsScanned: number;
  lastBackupAt: string | null;
}

export interface LiveSystemStatusSnapshot {
  serverOnline: boolean;
  serverUptimeSec: number;
  platform: string;
  aiStatus: 'LOCAL_PROXY_READY' | 'GEMINI_READY' | 'UNCONFIGURED';
  databaseStatus: 'HEALTHY' | 'RECOVERED';
  dbSizeKb: number;
  control: ControlStateRecord;
  strategiesCount: {
    total: number;
    approved: number;
    active: number;
    pending: number;
  };
  memory: {
    usedMb: number;
    totalMb: number;
    usedPct: number;
    processRssMb: number;
  };
  disk: {
    freeGb: number | null;
    totalGb: number | null;
    usedPct: number | null;
  };
  activeSessions: number;
  unreadNotifications: number;
  timestamp: string;
}

export interface LocalMemoryOverview {
  dbHealthy: boolean;
  dbSizeKb: number;
  disk: {
    freeGb: number | null;
    totalGb: number | null;
    usedPct: number | null;
  };
  autoBackupEnabled: boolean;
  lastBackupAt: string | null;
  counts: {
    strategies: number;
    analyses: number;
    signals: number;
    notifications: number;
  };
  backups: {
    filename: string;
    sizeBytes: number;
    createdAt: string;
  }[];
  recentAnalyses: {
    id: string;
    timestamp: string;
    symbol: string;
    timeframe: string;
    action: string;
    analyticalScore: number;
    regime: string;
    summaryUz: string;
  }[];
  recentSignals: {
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
  }[];
}

