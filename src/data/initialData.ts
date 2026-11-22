import {
  CandlePoint,
  MarketPair,
  Position,
  RiskGuardSettings,
  ServerConfig,
  StrategyConfig,
} from '../types/trading';

export const INITIAL_PAIRS: MarketPair[] = [
  {
    symbol: 'XAUUSD',
    base: 'XAU',
    quote: 'USD',
    price: 2684.4,
    spreadPoints: 18,
    change24h: 1.42,
    high24h: 2696.8,
    low24h: 2644.2,
    volume24h: 942000000,
    rsi14: 62.5,
    trend: 'Ko‘tarilish',
    contractSize: 100,
  },
  {
    symbol: 'EURUSD',
    base: 'EUR',
    quote: 'USD',
    price: 1.0842,
    spreadPoints: 7,
    change24h: 0.38,
    high24h: 1.0875,
    low24h: 1.0795,
    volume24h: 1420000000,
    rsi14: 55.3,
    trend: 'Ko‘tarilish',
    contractSize: 100000,
  },
  {
    symbol: 'BTCUSD',
    base: 'BTC',
    quote: 'USD',
    price: 94280.5,
    spreadPoints: 240,
    change24h: 2.84,
    high24h: 95120.0,
    low24h: 91410.0,
    volume24h: 1842500000,
    rsi14: 61.4,
    trend: 'Ko‘tarilish',
    contractSize: 1,
  },
  {
    symbol: 'GBPUSD',
    base: 'GBP',
    quote: 'USD',
    price: 1.2715,
    spreadPoints: 11,
    change24h: -0.44,
    high24h: 1.2782,
    low24h: 1.2688,
    volume24h: 685000000,
    rsi14: 43.8,
    trend: 'Pasayish',
    contractSize: 100000,
  },
  {
    symbol: 'US100',
    base: 'NDX',
    quote: 'USD',
    price: 20845.2,
    spreadPoints: 95,
    change24h: 1.15,
    high24h: 20920.0,
    low24h: 20590.0,
    volume24h: 1120000000,
    rsi14: 59.1,
    trend: 'Ko‘tarilish',
    contractSize: 20,
  },
  {
    symbol: 'USDJPY',
    base: 'USD',
    quote: 'JPY',
    price: 154.32,
    spreadPoints: 9,
    change24h: -0.21,
    high24h: 155.1,
    low24h: 153.85,
    volume24h: 790000000,
    rsi14: 49.4,
    trend: 'Yonlama',
    contractSize: 100000,
  },
];

export const INITIAL_POSITIONS: Position[] = [
  {
    id: 'MT5-508491',
    symbol: 'XAUUSD',
    side: 'LONG',
    orderType: 'MARKET',
    entryPrice: 2669.5,
    markPrice: 2684.4,
    lotSize: 0.25,
    sizeUsdt: 6673.75,
    leverage: 100,
    stopLoss: 2655.0,
    takeProfit: 2705.0,
    status: 'OPEN',
    strategyName: 'AI Trend Hunter',
    openedAt: '10:14:22',
  },
  {
    id: 'MT5-508492',
    symbol: 'GBPUSD',
    side: 'SHORT',
    orderType: 'MARKET',
    entryPrice: 1.2752,
    markPrice: 1.2715,
    lotSize: 0.5,
    sizeUsdt: 6376.0,
    leverage: 100,
    stopLoss: 1.2795,
    takeProfit: 1.264,
    status: 'OPEN',
    strategyName: 'Scalp Killer',
    openedAt: '11:02:09',
  },
  {
    id: 'MT5-508493',
    symbol: 'EURUSD',
    side: 'LONG',
    orderType: 'LIMIT',
    entryPrice: 1.081,
    markPrice: 1.0842,
    lotSize: 0.4,
    sizeUsdt: 4324.0,
    leverage: 100,
    stopLoss: 1.0775,
    takeProfit: 1.091,
    status: 'PENDING',
    strategyName: 'AI Buyurtma',
    openedAt: '11:28:45',
  },
  {
    id: 'MT5-508488',
    symbol: 'BTCUSD',
    side: 'LONG',
    orderType: 'MARKET',
    entryPrice: 92450.0,
    markPrice: 94280.5,
    lotSize: 0.1,
    sizeUsdt: 9245.0,
    leverage: 50,
    stopLoss: 91200.0,
    takeProfit: 94500.0,
    status: 'CLOSED',
    strategyName: 'AI Trend Hunter',
    openedAt: '08:15:10',
    closedAt: '09:42:18',
    realizedPnl: 183.05,
  },
];

export const INITIAL_STRATEGIES: StrategyConfig[] = [
  {
    id: 'strat-smc-luxalgo',
    name: 'Smart Money Concepts [LuxAlgo]',
    style: 'LONG_TERM',
    description:
      'Internal va Swing BOS/CHoCH tuzilmasi, Order Blocks, Fair Value Gaps (FVG), EQH/EQL va Premium/Equilibrium/Discount zonalari.',
    pairScope: 'XAUUSD, EURUSD, US100, BTCUSD',
    enabled: true,
    maxAllocationUsdt: 5000,
    leverageCap: 50,
    stopLossPct: 1.4,
    takeProfitPct: 3.8,
    trailingStop: true,
    winRate: 71.4,
    totalTrades: 92,
    netPnlUsdt: 6180.5,
  },
  {
    id: 'strat-scalp-pullback',
    name: 'Scalping PullBack R1.1 (PAC 34 + EMA 89/200/600)',
    style: 'SCALPING',
    description:
      'Heikin Ashi PAC EMA(34) High/Low kanali, EMA 89/200/600 lentasi, Williams Fraktallar va PAC dan qaytish (Pullback BUY/SELL) skalping algoritmi.',
    pairScope: 'XAUUSD, GBPUSD, USDJPY (M1–M15)',
    enabled: true,
    maxAllocationUsdt: 2500,
    leverageCap: 100,
    stopLossPct: 0.5,
    takeProfitPct: 1.3,
    trailingStop: true,
    winRate: 69.8,
    totalTrades: 186,
    netPnlUsdt: 3420.25,
  },
  {
    id: 'strat-ema-rsi-div',
    name: 'EMA 20/50/100/200 + Glaz RSI Bars & Libertus Divergensiya',
    style: 'LONG_TERM',
    description:
      '4 qatlamli EMA lenta yo‘nalishi, RSI(14) 70/30 chegara ranglari va 90-barlik BULL/BEAR yashirin hamda klassik divergensiyalarni aniqlash.',
    pairScope: 'Barcha MT5 juftliklari',
    enabled: true,
    maxAllocationUsdt: 3000,
    leverageCap: 50,
    stopLossPct: 1.2,
    takeProfitPct: 3.0,
    trailingStop: true,
    winRate: 66.2,
    totalTrades: 118,
    netPnlUsdt: 2890.4,
  },
  {
    id: 'strat-vwap-stdev',
    name: 'VWAP Stdev Bands v2 Mod (±1.28 / ±2.01 / ±2.51σ)',
    style: 'SCALPING',
    description:
      'Kunlik sessiya VWAP va standart og‘ish zonalari orqali keskin qimmat (Overbought) va arzon (Oversold) nuqtalardan qaytish savdosi.',
    pairScope: 'XAUUSD, US100, BTCUSD',
    enabled: true,
    maxAllocationUsdt: 2000,
    leverageCap: 100,
    stopLossPct: 0.6,
    takeProfitPct: 1.5,
    trailingStop: false,
    winRate: 64.9,
    totalTrades: 134,
    netPnlUsdt: 1945.1,
  },
];

export const INITIAL_RISK_GUARD: RiskGuardSettings = {
  dailyMaxLossUsdt: 750,
  maxOpenPositions: 8,
  autoKillOnDrawdown: true,
  drawdownLimitPct: 4.5,
};

export const INITIAL_SERVER_CONFIG: ServerConfig = {
  apiBaseUrl: 'http://127.0.0.1:8000',
  wsUrl: 'ws://127.0.0.1:8000/ws',
  mt5Login: '50192841',
  mt5Server: 'MetaQuotes-Demo',
  llmProxyUrl: 'http://localhost:3001/v1',
  pollingIntervalMs: 2000,
  autoSyncMt5: true,
};

export function generateCandlesForPair(basePrice: number, points = 36): CandlePoint[] {
  const candles: CandlePoint[] = [];
  let current = basePrice * 0.985;
  const stepVolatility = basePrice * 0.0045;
  const now = new Date();

  for (let i = points - 1; i >= 0; i--) {
    const t = new Date(now.getTime() - i * 3600 * 1000);
    const label = `${String(t.getHours()).padStart(2, '0')}:00`;
    const wave = Math.sin(i * 0.55 + basePrice) * 0.55 + Math.cos(i * 1.15) * 0.45;
    const delta = wave * stepVolatility + (basePrice - current) * 0.1;
    const open = current;
    const close = i === 0 ? basePrice : Math.max(0.0001, open + delta);
    const wickUp = Math.abs(Math.sin(i * 2.1)) * stepVolatility * 0.7;
    const wickDown = Math.abs(Math.cos(i * 1.7)) * stepVolatility * 0.7;
    const high = Math.max(open, close) + wickUp;
    const low = Math.max(0.0001, Math.min(open, close) - wickDown);
    const volume = Math.round(120 + Math.abs(Math.sin(i * 0.9)) * 480);

    candles.push({
      time: label,
      open,
      high,
      low,
      close,
      volume,
    });
    current = close;
  }

  return candles;
}

export function formatCurrency(value: number, decimals = 2): string {
  const abs = Math.abs(value);
  const formatted = abs.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
  return value < 0 ? `-$${formatted}` : `$${formatted}`;
}

export function formatPrice(price: number): string {
  if (price >= 100) {
    return price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  return price.toLocaleString('en-US', { minimumFractionDigits: 4, maximumFractionDigits: 4 });
}
