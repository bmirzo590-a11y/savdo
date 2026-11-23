import { CandlePoint, Timeframe } from '../src/types/trading';
import {
  loadMemoryDb,
  Mt5BridgeConfigRecord,
  Mt5CachedSymbolSpec,
  pushNotification,
  saveMemoryDb,
} from './localMemory';
import {
  getAllHistorySummaries,
  getSymbolHistorySummary,
  loadStoredMt5Candles,
  StoredMt5Candle,
  TimeframeHistoryMeta,
  upsertMt5Candles,
} from './mt5HistoryStore';

export type Mt5ConnectionStatus =
  | 'LIVE'
  | 'DELAYED'
  | 'STALE'
  | 'DISCONNECTED'
  | 'DATA UNAVAILABLE';

export type MarketDataSourceTag =
  | 'MT5_BROKER'
  | 'MT5_HISTORY_CACHE'
  | 'MT5_DISCONNECTED'
  | 'MT5_STALE'
  | 'DATA_UNAVAILABLE';

export interface InstrumentDefinition {
  symbol: string;
  brokerSymbol: string;
  instrument: string;
  base: string;
  quote: string;
  assetClass: 'FOREX' | 'METAL' | 'CRYPTO' | 'INDEX' | 'ENERGY' | 'OTHER';
  digits: number;
  contractSize: number;
  tickSize: number;
  tickValue: number;
  point: number;
  volumeMin: number;
  volumeMax: number;
  volumeStep: number;
  typicalSpreadPoints: number;
  tradeMode: number;
  tradeModeLabel: string;
  tradable: boolean;
  visible: boolean;
  tradingSession: string;
  description: string;
}

export interface Mt5LiveTick {
  brokerSymbol: string;
  bid: number | null;
  ask: number | null;
  last: number | null;
  spreadPoints: number;
  spreadPrice: number;
  tickTimeSec: number;
  tickTimeMs: number;
  tickTimeIso: string | null;
  tickVolume: number;
  realVolume: number | null;
  receivedAtMs: number;
}

export interface Mt5AccountSnapshot {
  login: number;
  server: string;
  company: string;
  balance: number;
  equity: number;
  margin: number;
  marginFree: number;
  marginLevel: number;
  profit: number;
  realizedToday: number;
  tradeMode: 'REAL' | 'DEMO' | 'CONTEST';
  tradeAllowed: boolean;
  investorReadOnly: boolean;
  currency: string;
  leverage: number;
}

export interface Mt5TerminalInfo {
  connected: boolean;
  tradeAllowed: boolean;
  company: string;
  name: string;
  build: number;
}

export interface Mt5PositionSnapshot {
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
  profit: number;
  status: 'OPEN' | 'PENDING';
  strategyName: string;
  openedAt: string;
}

export interface Mt5ClosedDealSnapshot {
  ticket: string;
  order: string;
  positionId: string;
  symbol: string;
  side: 'LONG' | 'SHORT';
  volume: number;
  price: number;
  profit: number;
  closedAt: string;
  comment: string;
}

export interface Mt5DataSourceRow {
  instrument: string;
  brokerSymbol: string;
  dataSource: 'MT5 BROKER';
  bid: number | null;
  ask: number | null;
  last: number | null;
  spreadPoints: number | null;
  lastTickTime: string | null;
  tickTimeMs: number | null;
  dataAgeSec: number | null;
  historicalBars: number;
  timeframesAvailable: Timeframe[];
  barsByTimeframe: Partial<Record<Timeframe, TimeframeHistoryMeta>>;
  connectionStatus: Mt5ConnectionStatus;
  assetClass: string;
  digits: number;
  point: number;
  tickSize: number;
  tickValue: number;
  contractSize: number;
  volumeMin: number;
  volumeMax: number;
  volumeStep: number;
  tradeMode: number;
  tradeModeLabel: string;
  tradable: boolean;
  visible: boolean;
  tradingSession: string;
  description: string;
  tickVolume: number | null;
  realVolume: number | null;
}

export interface RealOhlcResult {
  ok: boolean;
  symbol: string;
  brokerSymbol: string;
  timeframe: Timeframe;
  source: MarketDataSourceTag;
  connectionStatus: Mt5ConnectionStatus;
  fetchedAt: string;
  freshnessSec: number | null;
  lastCandleTimeIso: string | null;
  isNewCandle: boolean;
  latestPrice: number | null;
  bid: number | null;
  ask: number | null;
  spreadPoints: number | null;
  change24hPct: number | null;
  high24h: number | null;
  low24h: number | null;
  volume24h: number | null;
  barsCount: number;
  candles: CandlePoint[];
  error: string | null;
}

export const ALL_TIMEFRAMES: Timeframe[] = ['M1', 'M5', 'M15', 'M30', 'H1', 'H4', 'D1', 'W1'];

// Strict tick freshness thresholds (seconds) — NEVER fake LIVE!
export const TICK_LIVE_MAX_AGE_SEC = 15;
export const TICK_DELAYED_MAX_AGE_SEC = 90;

interface Mt5RuntimeState {
  connected: boolean;
  bridgeUrl: string;
  autoSync: boolean;
  pollingIntervalMs: number;
  historyTargetYears: number;
  lastSyncAt: string | null;
  lastHeartbeatMs: number | null;
  lastError: string | null;
  disconnectReasonUz: string | null;
  reconnectAttempts: number;
  terminal: Mt5TerminalInfo | null;
  account: Mt5AccountSnapshot | null;
  brokerSymbols: Map<string, InstrumentDefinition>;
  liveTicks: Map<string, Mt5LiveTick>;
  positions: Mt5PositionSnapshot[];
  pendingOrders: Mt5PositionSnapshot[];
  closedDeals: Mt5ClosedDealSnapshot[];
  totalBrokerSymbolsCount: number;
  visibleSymbolsCount: number;
}

const runtime: Mt5RuntimeState = {
  connected: false,
  bridgeUrl: (process.env.MT5_BRIDGE_URL || 'http://127.0.0.1:8000').replace(/\/$/, ''),
  autoSync: true,
  pollingIntervalMs: 3000,
  historyTargetYears: 2.5,
  lastSyncAt: null,
  lastHeartbeatMs: null,
  lastError: 'MT5 Bridge hali ulanmagan.',
  disconnectReasonUz: 'MetaTrader 5 Bridge serveriga ulanilmagan. Windows kompyuteringizda mt5_bridge.py ni ishga tushiring.',
  reconnectAttempts: 0,
  terminal: null,
  account: null,
  brokerSymbols: new Map(),
  liveTicks: new Map(),
  positions: [],
  pendingOrders: [],
  closedDeals: [],
  totalBrokerSymbolsCount: 0,
  visibleSymbolsCount: 0,
};

const lastCandleTimestampByKey = new Map<string, number>();
let syncLoopTimer: ReturnType<typeof setInterval> | null = null;
let syncInFlight = false;
let initializedFromDb = false;

/**
 * Validates user-configured MT5 Bridge URL (allows http/https to localhost, LAN, or tunnel,
 * while strictly blocking non-HTTP schemes and cloud metadata endpoints).
 */
export function validateMt5BridgeUrl(rawUrl: string): { ok: true; normalized: string } | { ok: false; error: string } {
  const trimmed = String(rawUrl || '').trim();
  if (!trimmed) {
    return { ok: false, error: 'MT5 Bridge URL bo‘sh bo‘lmasligi kerak.' };
  }
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return { ok: false, error: 'MT5 Bridge URL formati noto‘g‘ri (masalan: http://127.0.0.1:8000).' };
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { ok: false, error: 'Faqat http:// yoki https:// protokoliga ruxsat beriladi.' };
  }
  const host = parsed.hostname.toLowerCase();
  if (
    host === '169.254.169.254' ||
    host === 'metadata.google.internal' ||
    host === 'metadata.goog' ||
    host.startsWith('169.254.')
  ) {
    return { ok: false, error: 'Xavfsizlik cheklovi: bu manzilga so‘rov yuborish taqiqlangan.' };
  }
  const normalized = `${parsed.origin}${parsed.pathname}`.replace(/\/$/, '');
  return { ok: true, normalized };
}

function normalizeAssetClass(raw: string | undefined): InstrumentDefinition['assetClass'] {
  const up = String(raw || '').toUpperCase();
  if (up === 'FOREX' || up === 'METAL' || up === 'CRYPTO' || up === 'INDEX' || up === 'ENERGY') {
    return up;
  }
  return 'OTHER';
}

function specToInstrumentDef(s: Mt5CachedSymbolSpec): InstrumentDefinition {
  return {
    symbol: s.brokerSymbol,
    brokerSymbol: s.brokerSymbol,
    instrument: s.instrument || s.brokerSymbol,
    base: s.base || s.brokerSymbol.slice(0, 3),
    quote: s.quote || 'USD',
    assetClass: normalizeAssetClass(s.assetClass),
    digits: Number.isFinite(s.digits) ? s.digits : 5,
    contractSize: Number.isFinite(s.contractSize) && s.contractSize > 0 ? s.contractSize : 1,
    tickSize: Number.isFinite(s.tickSize) && s.tickSize > 0 ? s.tickSize : s.point || 0.00001,
    tickValue: Number.isFinite(s.tickValue) ? s.tickValue : 0,
    point: Number.isFinite(s.point) && s.point > 0 ? s.point : 0.00001,
    volumeMin: Number.isFinite(s.volumeMin) && s.volumeMin > 0 ? s.volumeMin : 0.01,
    volumeMax: Number.isFinite(s.volumeMax) && s.volumeMax > 0 ? s.volumeMax : 100,
    volumeStep: Number.isFinite(s.volumeStep) && s.volumeStep > 0 ? s.volumeStep : 0.01,
    typicalSpreadPoints: Number.isFinite(s.spreadPoints) ? s.spreadPoints : 0,
    tradeMode: Number.isFinite(s.tradeMode) ? s.tradeMode : 4,
    tradeModeLabel: s.tradeModeLabel || 'FULL',
    tradable: Boolean(s.tradable),
    visible: Boolean(s.visible),
    tradingSession: s.tradingSession || 'MT5 Broker Session',
    description: s.description || '',
  };
}

function hydrateRuntimeFromDbOnce(): void {
  if (initializedFromDb) return;
  initializedFromDb = true;
  try {
    const db = loadMemoryDb();
    if (db.mt5Config?.bridgeUrl) {
      runtime.bridgeUrl = db.mt5Config.bridgeUrl.replace(/\/$/, '');
    }
    runtime.autoSync = db.mt5Config?.autoSync !== false;
    runtime.pollingIntervalMs = db.mt5Config?.pollingIntervalMs ?? 3000;
    runtime.historyTargetYears = db.mt5Config?.historyTargetYears ?? 2.5;
    if (Array.isArray(db.mt5SymbolsCache)) {
      for (const s of db.mt5SymbolsCache) {
        if (s && s.brokerSymbol) {
          runtime.brokerSymbols.set(s.brokerSymbol, specToInstrumentDef(s));
        }
      }
      runtime.totalBrokerSymbolsCount = runtime.brokerSymbols.size;
      runtime.visibleSymbolsCount = Array.from(runtime.brokerSymbols.values()).filter((x) => x.visible).length;
    }
  } catch {
    // ignore startup hydrate errors
  }
}

/**
 * STRICT tick-timestamp freshness evaluator.
 * NEVER reports LIVE simply because HTTP polling succeeded!
 */
export function computeMt5ConnectionStatus(params: {
  connected: boolean;
  tickTimeMs: number | null;
  hasPrice: boolean;
  nowMs?: number;
}): { status: Mt5ConnectionStatus; ageSec: number | null } {
  const nowMs = params.nowMs ?? Date.now();
  if (!params.connected) {
    const ageSec =
      params.tickTimeMs && params.tickTimeMs > 0
        ? Math.max(0, Math.round((nowMs - params.tickTimeMs) / 1000))
        : null;
    return { status: 'DISCONNECTED', ageSec };
  }
  if (!params.hasPrice || !params.tickTimeMs || params.tickTimeMs <= 0) {
    return { status: 'DATA UNAVAILABLE', ageSec: null };
  }
  const ageSec = Math.max(0, Math.round((nowMs - params.tickTimeMs) / 1000));
  if (ageSec <= TICK_LIVE_MAX_AGE_SEC) {
    return { status: 'LIVE', ageSec };
  }
  if (ageSec <= TICK_DELAYED_MAX_AGE_SEC) {
    return { status: 'DELAYED', ageSec };
  }
  return { status: 'STALE', ageSec };
}

/**
 * Preserves exact broker symbol names (e.g., EURUSD.a, XAUUSDm) without arbitrary rewriting.
 * Only performs case-insensitive exact match when needed.
 */
export function resolveExactBrokerSymbol(requested: string): string {
  hydrateRuntimeFromDbOnce();
  const trimmed = String(requested || '').trim();
  if (!trimmed) return '';
  if (runtime.brokerSymbols.has(trimmed)) return trimmed;
  const upper = trimmed.toUpperCase();
  for (const key of runtime.brokerSymbols.keys()) {
    if (key.toUpperCase() === upper) return key;
  }
  return trimmed;
}

export function getInstrumentDefinition(symbol: string): InstrumentDefinition | undefined {
  hydrateRuntimeFromDbOnce();
  const exact = resolveExactBrokerSymbol(symbol);
  return runtime.brokerSymbols.get(exact);
}

/**
 * Returns dynamically discovered MT5 broker symbols (Market Watch visible symbols first).
 */
export function getDiscoveredInstruments(options?: { visibleOnly?: boolean; limit?: number }): InstrumentDefinition[] {
  hydrateRuntimeFromDbOnce();
  let list = Array.from(runtime.brokerSymbols.values());
  if (options?.visibleOnly) {
    const visible = list.filter((s) => s.visible);
    if (visible.length > 0) list = visible;
  } else {
    // Sort visible Market Watch symbols first, then alphabetically
    list.sort((a, b) => {
      if (a.visible !== b.visible) return a.visible ? -1 : 1;
      return a.brokerSymbol.localeCompare(b.brokerSymbol);
    });
  }
  if (options?.limit && options.limit > 0) {
    return list.slice(0, options.limit);
  }
  return list;
}

/**
 * Backward-compatible accessor returning currently known MT5 broker instruments.
 * Contains ZERO hardcoded external Binance/Kraken/Yahoo mappings!
 */
export function getSupportedInstruments(): InstrumentDefinition[] {
  return getDiscoveredInstruments({ visibleOnly: true, limit: 60 });
}

export function getMt5ConnectionState() {
  hydrateRuntimeFromDbOnce();
  return {
    connected: runtime.connected,
    bridgeUrl: runtime.bridgeUrl,
    autoSync: runtime.autoSync,
    pollingIntervalMs: runtime.pollingIntervalMs,
    historyTargetYears: runtime.historyTargetYears,
    lastSyncAt: runtime.lastSyncAt,
    lastHeartbeatMs: runtime.lastHeartbeatMs,
    lastError: runtime.lastError,
    disconnectReasonUz: runtime.disconnectReasonUz,
    reconnectAttempts: runtime.reconnectAttempts,
    terminal: runtime.terminal,
    account: runtime.account,
    totalBrokerSymbolsCount: runtime.totalBrokerSymbolsCount,
    visibleSymbolsCount: runtime.visibleSymbolsCount,
    positions: runtime.positions,
    pendingOrders: runtime.pendingOrders,
    closedDeals: runtime.closedDeals,
  };
}

export function getMt5LiveTick(symbol: string): Mt5LiveTick | null {
  hydrateRuntimeFromDbOnce();
  const exact = resolveExactBrokerSymbol(symbol);
  return runtime.liveTicks.get(exact) ?? null;
}

export function updateMt5BridgeConfig(patch: Partial<Mt5BridgeConfigRecord>): {
  ok: boolean;
  config?: Mt5BridgeConfigRecord;
  error?: string;
} {
  hydrateRuntimeFromDbOnce();
  const db = loadMemoryDb();
  let nextUrl = db.mt5Config.bridgeUrl;
  if (typeof patch.bridgeUrl === 'string') {
    const check = validateMt5BridgeUrl(patch.bridgeUrl);
    if (!check.ok) {
      return { ok: false, error: check.error };
    }
    nextUrl = check.normalized;
  }

  const nextConfig: Mt5BridgeConfigRecord = {
    bridgeUrl: nextUrl,
    autoSync: typeof patch.autoSync === 'boolean' ? patch.autoSync : db.mt5Config.autoSync,
    pollingIntervalMs:
      typeof patch.pollingIntervalMs === 'number' && Number.isFinite(patch.pollingIntervalMs)
        ? Math.max(1000, Math.min(30000, Math.round(patch.pollingIntervalMs)))
        : db.mt5Config.pollingIntervalMs,
    historyTargetYears:
      typeof patch.historyTargetYears === 'number' && Number.isFinite(patch.historyTargetYears)
        ? Math.max(0.5, Math.min(5, Number(patch.historyTargetYears.toFixed(1))))
        : db.mt5Config.historyTargetYears,
  };

  db.mt5Config = nextConfig;
  saveMemoryDb(db);

  runtime.bridgeUrl = nextConfig.bridgeUrl;
  runtime.autoSync = nextConfig.autoSync;
  runtime.pollingIntervalMs = nextConfig.pollingIntervalMs;
  runtime.historyTargetYears = nextConfig.historyTargetYears;

  return { ok: true, config: nextConfig };
}

async function fetchBridgeJson<T>(endpoint: string, options?: { method?: 'GET' | 'POST'; body?: unknown; timeoutMs?: number }): Promise<T> {
  hydrateRuntimeFromDbOnce();
  const check = validateMt5BridgeUrl(runtime.bridgeUrl);
  if (!check.ok) {
    throw new Error(check.error);
  }
  const url = `${check.normalized}${endpoint}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options?.timeoutMs ?? 6000);
  try {
    const resp = await fetch(url, {
      method: options?.method ?? 'GET',
      headers: {
        Accept: 'application/json',
        ...(options?.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      },
      body: options?.body !== undefined ? JSON.stringify(options.body) : undefined,
      signal: controller.signal,
    });
    if (!resp.ok) {
      let detail = `HTTP ${resp.status}`;
      try {
        const errBody = (await resp.json()) as { detail?: string; error?: string };
        if (errBody?.detail) detail = String(errBody.detail);
        else if (errBody?.error) detail = String(errBody.error);
      } catch {
        // ignore non-json error body
      }
      throw new Error(detail);
    }
    return (await resp.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

function handleDisconnect(reason: string): void {
  const wasConnected = runtime.connected;
  runtime.connected = false;
  runtime.reconnectAttempts += 1;
  runtime.lastError = reason;
  runtime.disconnectReasonUz = `MetaTrader 5 ulanishi uzildi: ${reason}. Yangi tahlil, signal va real orderlar xavfsizlik uchun to‘xtatildi.`;

  if (wasConnected) {
    pushNotification({
      priority: 'CRITICAL',
      category: 'MT5',
      title: 'MetaTrader 5 ulanishi uzildi (DISCONNECTED)',
      message: runtime.disconnectReasonUz,
    });
  }
}

interface BridgeStatusResponse {
  connected?: boolean;
  serverTimeMs?: number;
  terminal?: Mt5TerminalInfo;
  account?: {
    login?: number;
    server?: string;
    company?: string;
    balance?: number;
    equity?: number;
    margin?: number;
    margin_free?: number;
    margin_level?: number;
    profit?: number;
    realizedToday?: number;
    tradeMode?: 'REAL' | 'DEMO' | 'CONTEST';
    tradeAllowed?: boolean;
    investorReadOnly?: boolean;
    currency?: string;
    leverage?: number;
  };
  totalBrokerSymbols?: number;
  visibleSymbolsCount?: number;
  symbols?: Mt5CachedSymbolSpec[];
  ticks?: Record<string, Omit<Mt5LiveTick, 'receivedAtMs'>>;
  positions?: Mt5PositionSnapshot[];
  pendingOrders?: Mt5PositionSnapshot[];
  closedDeals?: Mt5ClosedDealSnapshot[];
}

/**
 * Synchronizes full real-time state from the MT5 Bridge:
 * terminal status, broker account, ALL discovered broker symbols & contract specs,
 * real Bid/Ask/Last/Spread ticks, open positions, pending orders, and recent closed deals.
 */
export async function syncMt5BridgeNow(): Promise<{
  ok: boolean;
  connected: boolean;
  symbolsCount: number;
  ticksCount: number;
  positionsCount: number;
  error: string | null;
}> {
  hydrateRuntimeFromDbOnce();
  if (syncInFlight) {
    return {
      ok: runtime.connected,
      connected: runtime.connected,
      symbolsCount: runtime.brokerSymbols.size,
      ticksCount: runtime.liveTicks.size,
      positionsCount: runtime.positions.length,
      error: runtime.lastError,
    };
  }

  syncInFlight = true;
  try {
    const payload = await fetchBridgeJson<BridgeStatusResponse>('/api/status', { timeoutMs: 5000 });
    const nowMs = Date.now();
    const nowIso = new Date(nowMs).toISOString();

    if (payload.connected === false || (payload.terminal && payload.terminal.connected === false)) {
      handleDisconnect('MetaTrader 5 terminali broker serveriga ulanmagan.');
      return {
        ok: false,
        connected: false,
        symbolsCount: runtime.brokerSymbols.size,
        ticksCount: runtime.liveTicks.size,
        positionsCount: runtime.positions.length,
        error: runtime.lastError,
      };
    }

    const wasDisconnected = !runtime.connected;
    runtime.connected = true;
    runtime.reconnectAttempts = 0;
    runtime.lastSyncAt = nowIso;
    runtime.lastHeartbeatMs = nowMs;
    runtime.lastError = null;
    runtime.disconnectReasonUz = null;
    runtime.terminal = payload.terminal ?? {
      connected: true,
      tradeAllowed: Boolean(payload.account?.tradeAllowed),
      company: payload.account?.company || '',
      name: 'MetaTrader 5',
      build: 0,
    };

    if (payload.account) {
      runtime.account = {
        login: Number(payload.account.login) || 0,
        server: String(payload.account.server || ''),
        company: String(payload.account.company || ''),
        balance: Number(payload.account.balance) || 0,
        equity: Number(payload.account.equity) || 0,
        margin: Number(payload.account.margin) || 0,
        marginFree: Number(payload.account.margin_free) || 0,
        marginLevel: Number(payload.account.margin_level) || 0,
        profit: Number(payload.account.profit) || 0,
        realizedToday: Number(payload.account.realizedToday) || 0,
        tradeMode: payload.account.tradeMode ?? 'DEMO',
        tradeAllowed: Boolean(payload.account.tradeAllowed),
        investorReadOnly: Boolean(payload.account.investorReadOnly),
        currency: String(payload.account.currency || 'USD'),
        leverage: Number(payload.account.leverage) || 100,
      };
    }

    // Update ALL discovered broker symbols preserving exact broker names
    if (Array.isArray(payload.symbols) && payload.symbols.length > 0) {
      const nextMap = new Map<string, InstrumentDefinition>();
      const cacheList: Mt5CachedSymbolSpec[] = [];
      for (const s of payload.symbols) {
        if (!s || !s.brokerSymbol) continue;
        nextMap.set(s.brokerSymbol, specToInstrumentDef(s));
        cacheList.push(s);
      }
      runtime.brokerSymbols = nextMap;
      runtime.totalBrokerSymbolsCount = nextMap.size;
      runtime.visibleSymbolsCount = cacheList.filter((s) => s.visible).length;

      // Persist up to 500 broker symbol specs so symbols list survives restarts cleanly
      const db = loadMemoryDb();
      const sortedForCache = [...cacheList].sort((a, b) => (a.visible === b.visible ? 0 : a.visible ? -1 : 1));
      db.mt5SymbolsCache = sortedForCache.slice(0, 500);
      saveMemoryDb(db);
    }

    // Update real live ticks atomically (omitted or null-price symbols immediately report DATA UNAVAILABLE)
    if (payload.ticks && typeof payload.ticks === 'object') {
      const nextTicks = new Map<string, Mt5LiveTick>();
      for (const [sym, tick] of Object.entries(payload.ticks)) {
        if (!tick || !sym) continue;
        const bid = typeof tick.bid === 'number' && tick.bid > 0 ? tick.bid : null;
        const ask = typeof tick.ask === 'number' && tick.ask > 0 ? tick.ask : null;
        if (bid === null && ask === null) continue;
        nextTicks.set(sym, {
          brokerSymbol: sym,
          bid,
          ask,
          last: typeof tick.last === 'number' && tick.last > 0 ? tick.last : null,
          spreadPoints: Number.isFinite(tick.spreadPoints) ? tick.spreadPoints : 0,
          spreadPrice: Number.isFinite(tick.spreadPrice) ? tick.spreadPrice : 0,
          tickTimeSec: Number(tick.tickTimeSec) || 0,
          tickTimeMs: Number(tick.tickTimeMs) || 0,
          tickTimeIso: tick.tickTimeIso ?? null,
          tickVolume: Number(tick.tickVolume) || 0,
          realVolume: typeof tick.realVolume === 'number' && tick.realVolume > 0 ? tick.realVolume : null,
          receivedAtMs: nowMs,
        });
      }
      runtime.liveTicks = nextTicks;
    }

    // Sync real positions, pending orders, and closed deals from MT5
    runtime.positions = Array.isArray(payload.positions) ? payload.positions : [];
    runtime.pendingOrders = Array.isArray(payload.pendingOrders) ? payload.pendingOrders : [];
    runtime.closedDeals = Array.isArray(payload.closedDeals) ? payload.closedDeals : [];

    if (wasDisconnected) {
      pushNotification({
        priority: 'NORMAL',
        category: 'MT5',
        title: 'MetaTrader 5 Bridge ulandi',
        message: `Hisob #${runtime.account?.login ?? 0} (${runtime.account?.server || 'MT5'}) · ${runtime.totalBrokerSymbolsCount} broker symbol aniqlandi · ${runtime.positions.length} ochiq pozitsiya sinxronlandi.`,
      });
    }

    return {
      ok: true,
      connected: true,
      symbolsCount: runtime.brokerSymbols.size,
      ticksCount: runtime.liveTicks.size,
      positionsCount: runtime.positions.length,
      error: null,
    };
  } catch (err) {
    const msg =
      err instanceof Error
        ? err.name === 'AbortError'
          ? `MT5 Bridge javob bermadi (timeout: ${runtime.bridgeUrl})`
          : err.message
        : 'MT5 Bridge ulanish xatosi';
    handleDisconnect(msg);
    return {
      ok: false,
      connected: false,
      symbolsCount: runtime.brokerSymbols.size,
      ticksCount: runtime.liveTicks.size,
      positionsCount: runtime.positions.length,
      error: msg,
    };
  } finally {
    syncInFlight = false;
  }
}

export async function selectMt5BrokerSymbol(brokerSymbol: string, enable = true): Promise<{
  ok: boolean;
  brokerSymbol: string;
  error?: string;
}> {
  hydrateRuntimeFromDbOnce();
  if (!runtime.connected) {
    return { ok: false, brokerSymbol, error: 'MT5 Bridge ulanmagan.' };
  }
  try {
    const res = await fetchBridgeJson<{
      ok: boolean;
      brokerSymbol: string;
      spec?: Mt5CachedSymbolSpec | null;
      tick?: Omit<Mt5LiveTick, 'receivedAtMs'> | null;
    }>('/api/symbols/select', {
      method: 'POST',
      body: { symbol: brokerSymbol, enable },
      timeoutMs: 5000,
    });
    if (res.spec?.brokerSymbol) {
      runtime.brokerSymbols.set(res.spec.brokerSymbol, specToInstrumentDef(res.spec));
    }
    if (res.tick?.brokerSymbol) {
      runtime.liveTicks.set(res.tick.brokerSymbol, {
        ...res.tick,
        receivedAtMs: Date.now(),
      });
    }
    return { ok: true, brokerSymbol: res.brokerSymbol || brokerSymbol };
  } catch (err) {
    return {
      ok: false,
      brokerSymbol,
      error: err instanceof Error ? err.message : 'Market Watch tanlashda xatolik.',
    };
  }
}

interface BridgeCandlesResponse {
  brokerSymbol: string;
  timeframe: Timeframe;
  dataSource?: string;
  barsCount: number;
  firstTimeIso?: string | null;
  lastTimeIso?: string | null;
  tick?: Omit<Mt5LiveTick, 'receivedAtMs'> | null;
  candles: Array<{
    time: string;
    epochMs: number;
    timeIso: string;
    open: number;
    high: number;
    low: number;
    close: number;
    volume?: number;
    tickVolume?: number;
    realVolume?: number | null;
    spread?: number;
  }>;
}

function toStoredCandles(raw: BridgeCandlesResponse['candles']): StoredMt5Candle[] {
  const out: StoredMt5Candle[] = [];
  for (const c of raw || []) {
    const open = Number(c.open);
    const high = Number(c.high);
    const low = Number(c.low);
    const close = Number(c.close);
    const epochMs = Number(c.epochMs);
    if (
      !Number.isFinite(open) ||
      !Number.isFinite(high) ||
      !Number.isFinite(low) ||
      !Number.isFinite(close) ||
      close <= 0 ||
      !Number.isFinite(epochMs) ||
      epochMs <= 0
    ) {
      continue;
    }
    const tickVol = Number.isFinite(c.tickVolume)
      ? Number(c.tickVolume)
      : Number.isFinite(c.volume)
        ? Number(c.volume)
        : 0;
    const realVol = typeof c.realVolume === 'number' && c.realVolume > 0 ? c.realVolume : null;
    out.push({
      time: String(c.time || new Date(epochMs).toISOString().slice(11, 16)),
      epochMs,
      timeIso: String(c.timeIso || new Date(epochMs).toISOString()),
      open,
      high,
      low,
      close,
      volume: tickVol,
      tickVolume: tickVol,
      realVolume: realVol,
      spread: Number.isFinite(c.spread) ? Number(c.spread) : 0,
    });
  }
  return out;
}

function summarizeCandleMetrics(candles: StoredMt5Candle[]) {
  if (candles.length === 0) {
    return {
      latestPrice: null,
      change24hPct: null,
      high24h: null,
      low24h: null,
      volume24h: null,
      lastCandleTimeIso: null,
      lastEpochMs: 0,
    };
  }
  const latest = candles[candles.length - 1];
  const windowBars = candles.slice(-24);
  const firstOpen = windowBars[0]?.open ?? latest.open;
  const high24h = Math.max(...windowBars.map((c) => c.high));
  const low24h = Math.min(...windowBars.map((c) => c.low));
  const volume24h = Math.round(windowBars.reduce((acc, c) => acc + (c.tickVolume || c.volume || 0), 0));
  const change24hPct =
    firstOpen > 0 ? Number((((latest.close - firstOpen) / firstOpen) * 100).toFixed(2)) : 0;

  return {
    latestPrice: latest.close,
    change24hPct,
    high24h,
    low24h,
    volume24h,
    lastCandleTimeIso: latest.timeIso,
    lastEpochMs: latest.epochMs,
  };
}

/**
 * Fetches real OHLC candles STRICTLY from MetaTrader 5 Bridge.
 * ZERO Binance, Kraken, Yahoo Finance, or synthetic fallbacks!
 * When allowOfflineHistory is true (used ONLY for historical chart/backtest viewing),
 * returns real persisted MT5 disk candles clearly tagged `MT5_HISTORY_CACHE` + `DISCONNECTED`.
 * For live analysis/trading (`allowOfflineHistory: false`), returns `ok: false` when MT5 is disconnected.
 */
export async function fetchRealOhlc(
  symbolInput: string,
  timeframe: Timeframe,
  options?: { limit?: number; forceRefresh?: boolean; allowOfflineHistory?: boolean }
): Promise<RealOhlcResult> {
  hydrateRuntimeFromDbOnce();
  const brokerSymbol = resolveExactBrokerSymbol(symbolInput);
  const limit = Math.max(20, Math.min(25000, options?.limit ?? 200));
  const nowIso = new Date().toISOString();

  // If MT5 is disconnected, NEVER call any external API!
  if (!runtime.connected) {
    if (options?.allowOfflineHistory) {
      const archived = loadStoredMt5Candles(brokerSymbol, timeframe, limit);
      if (archived.length > 0) {
        const metrics = summarizeCandleMetrics(archived);
        return {
          ok: true,
          symbol: brokerSymbol,
          brokerSymbol,
          timeframe,
          source: 'MT5_HISTORY_CACHE',
          connectionStatus: 'DISCONNECTED',
          fetchedAt: nowIso,
          freshnessSec: null,
          lastCandleTimeIso: metrics.lastCandleTimeIso,
          isNewCandle: false,
          latestPrice: metrics.latestPrice,
          bid: null,
          ask: null,
          spreadPoints: null,
          change24hPct: metrics.change24hPct,
          high24h: metrics.high24h,
          low24h: metrics.low24h,
          volume24h: metrics.volume24h,
          barsCount: archived.length,
          candles: archived.map((c) => ({
            time: c.time,
            open: c.open,
            high: c.high,
            low: c.low,
            close: c.close,
            volume: c.tickVolume,
          })),
          error: 'MT5 Bridge ulanmagan — avval saqlangan MT5 tarixiy arxivi ko‘rsatilmoqda.',
        };
      }
    }

    return {
      ok: false,
      symbol: brokerSymbol,
      brokerSymbol,
      timeframe,
      source: 'MT5_DISCONNECTED',
      connectionStatus: 'DISCONNECTED',
      fetchedAt: nowIso,
      freshnessSec: null,
      lastCandleTimeIso: null,
      isNewCandle: false,
      latestPrice: null,
      bid: null,
      ask: null,
      spreadPoints: null,
      change24hPct: null,
      high24h: null,
      low24h: null,
      volume24h: null,
      barsCount: 0,
      candles: [],
      error:
        runtime.disconnectReasonUz ||
        'MetaTrader 5 Bridge ulanmagan — faqat MT5 broker serveri ma’lumotlari ishlatiladi.',
    };
  }

  try {
    const res = await fetchBridgeJson<BridgeCandlesResponse>(
      `/api/candles?symbol=${encodeURIComponent(brokerSymbol)}&timeframe=${encodeURIComponent(timeframe)}&count=${limit}`,
      { timeoutMs: 8000 }
    );

    const exactSym = res.brokerSymbol || brokerSymbol;
    const stored = toStoredCandles(res.candles);

    if (res.tick) {
      runtime.liveTicks.set(exactSym, {
        ...res.tick,
        brokerSymbol: exactSym,
        receivedAtMs: Date.now(),
      });
    }

    if (stored.length === 0) {
      return {
        ok: false,
        symbol: exactSym,
        brokerSymbol: exactSym,
        timeframe,
        source: 'DATA_UNAVAILABLE',
        connectionStatus: 'DATA UNAVAILABLE',
        fetchedAt: nowIso,
        freshnessSec: null,
        lastCandleTimeIso: null,
        isNewCandle: false,
        latestPrice: null,
        bid: null,
        ask: null,
        spreadPoints: null,
        change24hPct: null,
        high24h: null,
        low24h: null,
        volume24h: null,
        barsCount: 0,
        candles: [],
        error: `${exactSym} (${timeframe}) uchun MT5 broker serveri sham qaytarmadi.`,
      };
    }

    // Persist & deduplicate every real MT5 OHLC batch into local disk store
    upsertMt5Candles(exactSym, timeframe, stored);

    const tick = runtime.liveTicks.get(exactSym) ?? null;
    const metrics = summarizeCandleMetrics(stored);
    const livePrice = tick?.bid ?? tick?.last ?? metrics.latestPrice;
    const { status: connStatus, ageSec } = computeMt5ConnectionStatus({
      connected: runtime.connected,
      tickTimeMs: tick?.tickTimeMs ?? metrics.lastEpochMs,
      hasPrice: Boolean(livePrice && livePrice > 0),
    });

    const dedupKey = `${exactSym}:${timeframe}`;
    const prevLastEpoch = lastCandleTimestampByKey.get(dedupKey);
    const isNewCandle = Boolean(prevLastEpoch && metrics.lastEpochMs > prevLastEpoch);
    if (metrics.lastEpochMs > 0) {
      lastCandleTimestampByKey.set(dedupKey, metrics.lastEpochMs);
    }

    return {
      ok: true,
      symbol: exactSym,
      brokerSymbol: exactSym,
      timeframe,
      source: connStatus === 'STALE' ? 'MT5_STALE' : 'MT5_BROKER',
      connectionStatus: connStatus,
      fetchedAt: nowIso,
      freshnessSec: ageSec,
      lastCandleTimeIso: metrics.lastCandleTimeIso,
      isNewCandle,
      latestPrice: livePrice,
      bid: tick?.bid ?? null,
      ask: tick?.ask ?? null,
      spreadPoints: tick?.spreadPoints ?? null,
      change24hPct: metrics.change24hPct,
      high24h: metrics.high24h,
      low24h: metrics.low24h,
      volume24h: metrics.volume24h,
      barsCount: stored.length,
      candles: stored.map((c) => ({
        time: c.time,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
        volume: c.tickVolume,
      })),
      error: connStatus === 'STALE' ? `MT5 tick ma’lumoti eskirgan (${ageSec}s).` : null,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'MT5 OHLC yuklash xatosi';
    // If bridge became unreachable (connection refused / network error), mark disconnected
    if (/fetch failed|ECONNREFUSED|AbortError|timeout|MT5 ulanmadi/i.test(msg)) {
      handleDisconnect(msg);
    }
    return {
      ok: false,
      symbol: brokerSymbol,
      brokerSymbol,
      timeframe,
      source: runtime.connected ? 'DATA_UNAVAILABLE' : 'MT5_DISCONNECTED',
      connectionStatus: runtime.connected ? 'DATA UNAVAILABLE' : 'DISCONNECTED',
      fetchedAt: nowIso,
      freshnessSec: null,
      lastCandleTimeIso: null,
      isNewCandle: false,
      latestPrice: null,
      bid: null,
      ask: null,
      spreadPoints: null,
      change24hPct: null,
      high24h: null,
      low24h: null,
      volume24h: null,
      barsCount: 0,
      candles: [],
      error: msg,
    };
  }
}

export async function fetchAllTimeframesOhlc(
  symbol: string,
  options?: { forceRefresh?: boolean; timeframes?: Timeframe[] }
): Promise<Record<Timeframe, RealOhlcResult>> {
  const tfs = options?.timeframes ?? ALL_TIMEFRAMES;
  const results = await Promise.all(
    tfs.map((tf) => fetchRealOhlc(symbol, tf, { forceRefresh: options?.forceRefresh, limit: 150 }))
  );
  const map = {} as Record<Timeframe, RealOhlcResult>;
  for (let i = 0; i < tfs.length; i++) {
    map[tfs[i]] = results[i];
  }
  return map;
}

/**
 * Pulls 2–3 years of real historical OHLC directly from MT5 Broker across requested timeframes,
 * deduplicates by timestamp, and persists to local disk storage.
 * NEVER fabricates missing periods!
 */
export async function syncMt5HistoricalData(params: {
  symbol: string;
  timeframes?: Timeframe[];
  years?: number;
}): Promise<{
  ok: boolean;
  brokerSymbol: string;
  requestedYears: number;
  results: Array<{
    timeframe: Timeframe;
    ok: boolean;
    fetchedBars: number;
    storedTotalBars: number;
    addedBars: number;
    firstCandleIso: string | null;
    lastCandleIso: string | null;
    error: string | null;
  }>;
  error?: string;
}> {
  hydrateRuntimeFromDbOnce();
  const brokerSymbol = resolveExactBrokerSymbol(params.symbol);
  const years = Math.max(0.1, Math.min(5, params.years ?? runtime.historyTargetYears ?? 2.5));
  const timeframes = params.timeframes && params.timeframes.length > 0 ? params.timeframes : ALL_TIMEFRAMES;

  if (!runtime.connected) {
    return {
      ok: false,
      brokerSymbol,
      requestedYears: years,
      results: [],
      error: 'MT5 Bridge ulanmagan — tarixiy OHLC ma’lumotlarini yuklash uchun MetaTrader 5 ulangan bo‘lishi shart.',
    };
  }

  const results: Array<{
    timeframe: Timeframe;
    ok: boolean;
    fetchedBars: number;
    storedTotalBars: number;
    addedBars: number;
    firstCandleIso: string | null;
    lastCandleIso: string | null;
    error: string | null;
  }> = [];

  for (const tf of timeframes) {
    try {
      const resp = await fetchBridgeJson<BridgeCandlesResponse>(
        `/api/history?symbol=${encodeURIComponent(brokerSymbol)}&timeframe=${encodeURIComponent(tf)}&years=${years}`,
        { timeoutMs: 25000 }
      );
      const exactSym = resp.brokerSymbol || brokerSymbol;
      const candles = toStoredCandles(resp.candles);
      const saved = upsertMt5Candles(exactSym, tf, candles);
      results.push({
        timeframe: tf,
        ok: candles.length > 0,
        fetchedBars: candles.length,
        storedTotalBars: saved.totalBars,
        addedBars: saved.addedBars,
        firstCandleIso: saved.firstCandleIso,
        lastCandleIso: saved.lastCandleIso,
        error: candles.length === 0 ? `Broker ${exactSym} (${tf}) uchun tarixiy sham qaytarmadi.` : null,
      });
    } catch (err) {
      results.push({
        timeframe: tf,
        ok: false,
        fetchedBars: 0,
        storedTotalBars: loadStoredMt5Candles(brokerSymbol, tf).length,
        addedBars: 0,
        firstCandleIso: null,
        lastCandleIso: null,
        error: err instanceof Error ? err.message : 'Tarix yuklash xatosi',
      });
    }
  }

  return {
    ok: results.some((r) => r.ok),
    brokerSymbol,
    requestedYears: years,
    results,
  };
}

/**
 * Builds the exact 11-column MT5-Only Data Sources table rows for ALL discovered broker symbols.
 */
export function getMt5DataSourcesPayload(nowMs = Date.now()) {
  hydrateRuntimeFromDbOnce();
  const historySummaries = getAllHistorySummaries();
  const defs = getDiscoveredInstruments();

  const rows: Mt5DataSourceRow[] = defs.map((def) => {
    const tick = runtime.liveTicks.get(def.brokerSymbol) ?? null;
    const hist = historySummaries[def.brokerSymbol] ?? getSymbolHistorySummary(def.brokerSymbol);
    const hasPrice = Boolean(tick && ((tick.bid && tick.bid > 0) || (tick.last && tick.last > 0)));
    const { status: connectionStatus, ageSec } = computeMt5ConnectionStatus({
      connected: runtime.connected,
      tickTimeMs: tick?.tickTimeMs ?? null,
      hasPrice,
      nowMs,
    });

    return {
      instrument: def.instrument,
      brokerSymbol: def.brokerSymbol,
      dataSource: 'MT5 BROKER',
      bid: runtime.connected ? tick?.bid ?? null : null,
      ask: runtime.connected ? tick?.ask ?? null : null,
      last: runtime.connected ? tick?.last ?? null : null,
      spreadPoints: runtime.connected && tick ? tick.spreadPoints : null,
      lastTickTime: tick?.tickTimeIso ?? null,
      tickTimeMs: tick?.tickTimeMs ?? null,
      dataAgeSec: ageSec,
      historicalBars: hist.totalBars,
      timeframesAvailable: hist.timeframesAvailable,
      barsByTimeframe: hist.barsByTimeframe,
      connectionStatus,
      assetClass: def.assetClass,
      digits: def.digits,
      point: def.point,
      tickSize: def.tickSize,
      tickValue: def.tickValue,
      contractSize: def.contractSize,
      volumeMin: def.volumeMin,
      volumeMax: def.volumeMax,
      volumeStep: def.volumeStep,
      tradeMode: def.tradeMode,
      tradeModeLabel: def.tradeModeLabel,
      tradable: def.tradable,
      visible: def.visible,
      tradingSession: def.tradingSession,
      description: def.description,
      tickVolume: runtime.connected && tick ? tick.tickVolume : null,
      realVolume: runtime.connected && tick ? tick.realVolume : null,
    };
  });

  const liveCount = rows.filter((r) => r.connectionStatus === 'LIVE').length;
  const delayedCount = rows.filter((r) => r.connectionStatus === 'DELAYED').length;
  const staleCount = rows.filter((r) => r.connectionStatus === 'STALE').length;
  const disconnectedCount = rows.filter((r) => r.connectionStatus === 'DISCONNECTED').length;
  const unavailableCount = rows.filter((r) => r.connectionStatus === 'DATA UNAVAILABLE').length;
  const totalHistoricalBars = rows.reduce((sum, r) => sum + r.historicalBars, 0);

  return {
    timestamp: new Date(nowMs).toISOString(),
    mode: 'MT5_ONLY' as const,
    externalApisDisabled: true,
    connection: getMt5ConnectionState(),
    summary: {
      totalSymbols: rows.length,
      visibleSymbols: rows.filter((r) => r.visible).length,
      liveCount,
      delayedCount,
      staleCount,
      disconnectedCount,
      unavailableCount,
      totalHistoricalBars,
    },
    rows,
  };
}

/**
 * Sends a real order / close / SL-TP modify directly through the MT5 Bridge.
 * Strictly blocks if MT5 is disconnected!
 */
export async function sendOrderToMt5Bridge(body: {
  symbol: string;
  side: 'LONG' | 'SHORT';
  lotSize: number;
  stopLoss?: number | null;
  takeProfit?: number | null;
}) {
  hydrateRuntimeFromDbOnce();
  if (!runtime.connected) {
    return {
      ok: false,
      error: 'MT5 Bridge ulanmagan — yangi real buyurtma xavfsizlik uchun bloklandi.',
    };
  }
  const tick = getMt5LiveTick(body.symbol);
  const { status, ageSec } = computeMt5ConnectionStatus({
    connected: runtime.connected,
    tickTimeMs: tick?.tickTimeMs ?? null,
    hasPrice: Boolean(tick && (tick.bid || tick.last)),
  });
  if (status === 'STALE' || status === 'DISCONNECTED' || status === 'DATA UNAVAILABLE') {
    return {
      ok: false,
      error: `MT5 narx ma’lumoti yaroqsiz (${status}${ageSec !== null ? `, ${ageSec}s` : ''}) — buyurtma bloklandi.`,
    };
  }
  try {
    const res = await fetchBridgeJson<{ ticket: number; price: number; volume: number; symbol: string }>(
      '/api/orders',
      {
        method: 'POST',
        body: {
          symbol: resolveExactBrokerSymbol(body.symbol),
          side: body.side,
          lotSize: body.lotSize,
          stopLoss: body.stopLoss ?? null,
          takeProfit: body.takeProfit ?? null,
        },
        timeoutMs: 10000,
      }
    );
    void syncMt5BridgeNow();
    return { ok: true, ...res };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'MT5 order yuborishda xatolik.',
    };
  }
}

export function startMt5BridgeSyncLoop(intervalMs?: number): void {
  hydrateRuntimeFromDbOnce();
  if (syncLoopTimer) {
    clearInterval(syncLoopTimer);
    syncLoopTimer = null;
  }
  const stepMs = Math.max(1500, intervalMs ?? runtime.pollingIntervalMs ?? 3000);
  if (runtime.autoSync) {
    void syncMt5BridgeNow();
  }
  syncLoopTimer = setInterval(() => {
    if (!runtime.autoSync) return;
    void syncMt5BridgeNow();
  }, stepMs);
}

export function stopMt5BridgeSyncLoop(): void {
  if (syncLoopTimer) {
    clearInterval(syncLoopTimer);
    syncLoopTimer = null;
  }
}
