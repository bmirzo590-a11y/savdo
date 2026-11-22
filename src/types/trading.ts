export type ViewId =
  | 'terminal'
  | 'ai'
  | 'backtest'
  | 'positions'
  | 'strategies'
  | 'scanner'
  | 'server';

export type OrderSide = 'LONG' | 'SHORT';
export type OrderType = 'MARKET' | 'LIMIT';
export type Timeframe = 'M1' | 'M5' | 'M15' | 'H1' | 'H4' | 'D1' | 'W1';
export type TradingStyle = 'SCALPING' | 'LONG_TERM';
export type PositionStatus = 'OPEN' | 'CLOSED' | 'PENDING';

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
}

export interface RiskGuardSettings {
  dailyMaxLossUsdt: number;
  maxOpenPositions: number;
  autoKillOnDrawdown: boolean;
  drawdownLimitPct: number;
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
  action: 'BUY' | 'SELL' | 'WAIT' | string;
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
  signal: 'BUY' | 'SELL' | 'NEUTRAL' | string;
  confidencePct: number;
  entry: string;
  stopLoss: string;
  takeProfit: string;
  summary: string;
}

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
}

export type BacktestStrategyId =
  | 'smc_luxalgo'
  | 'scalp_pullback'
  | 'ema_ribbon_rsi'
  | 'vwap_bands'
  | 'all_6_confluence';

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
  exitReason: 'Take-Profit' | 'Stop-Loss' | 'Signal';
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
  finalCapital: number;
  equityCurve: { index: number; time: string; equity: number }[];
  trades: BacktestTrade[];
  candles: CandlePoint[];
}
