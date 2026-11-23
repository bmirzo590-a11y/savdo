import fs from 'node:fs';
import path from 'node:path';
import { CandlePoint, Timeframe } from '../src/types/trading';
import { DATA_DIR } from './security';

export interface StoredMt5Candle extends CandlePoint {
  epochMs: number;
  timeIso: string;
  tickVolume: number;
  realVolume: number | null;
  spread?: number;
}

export interface TimeframeHistoryMeta {
  timeframe: Timeframe;
  barsCount: number;
  firstCandleIso: string | null;
  lastCandleIso: string | null;
  updatedAt: string;
}

export interface SymbolHistorySummary {
  brokerSymbol: string;
  totalBars: number;
  timeframesAvailable: Timeframe[];
  barsByTimeframe: Partial<Record<Timeframe, TimeframeHistoryMeta>>;
}

const HISTORY_DIR = path.resolve(DATA_DIR, 'mt5_history');
const INDEX_FILE = path.resolve(HISTORY_DIR, '_index.json');
const ALL_TFS: Timeframe[] = ['M1', 'M5', 'M15', 'M30', 'H1', 'H4', 'D1', 'W1'];

// Max retained bars per TF on disk to balance 2-3 years coverage with fast JSON I/O
const MAX_BARS_BY_TF: Record<Timeframe, number> = {
  M1: 60000,
  M5: 50000,
  M15: 40000,
  M30: 35000,
  H1: 30000, // ~3.4 years of 24h bars
  H4: 15000, // ~6.8 years
  D1: 5000,  // ~13+ years
  W1: 1500,  // ~28+ years
};

let indexCache: Record<string, Partial<Record<Timeframe, TimeframeHistoryMeta>>> | null = null;

function ensureHistoryDir(): void {
  if (!fs.existsSync(HISTORY_DIR)) {
    fs.mkdirSync(HISTORY_DIR, { recursive: true, mode: 0o700 });
  }
}

/**
 * Strictly sanitize broker symbol (preserving uniqueness even for suffixes like EURUSD.a, #US100, XAUUSDm)
 * while completely preventing any path traversal.
 */
function safeHistoryFilePath(brokerSymbol: string, timeframe: Timeframe): string {
  const safeSym = brokerSymbol
    .trim()
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .replace(/\.\.+/g, '_')
    .slice(0, 64);
  const filename = `${safeSym}__${timeframe}.json`;
  const resolved = path.resolve(HISTORY_DIR, filename);
  if (!resolved.startsWith(HISTORY_DIR + path.sep)) {
    throw new Error('Noto‘g‘ri tarix fayl yo‘li.');
  }
  return resolved;
}

function loadIndex(): Record<string, Partial<Record<Timeframe, TimeframeHistoryMeta>>> {
  if (indexCache) return indexCache;
  ensureHistoryDir();
  if (!fs.existsSync(INDEX_FILE)) {
    indexCache = {};
    return indexCache;
  }
  try {
    const raw = fs.readFileSync(INDEX_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    indexCache = parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    indexCache = {};
  }
  return indexCache!;
}

function saveIndex(): void {
  if (!indexCache) return;
  ensureHistoryDir();
  const tmp = `${INDEX_FILE}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(indexCache, null, 2), { encoding: 'utf8', mode: 0o600 });
  fs.renameSync(tmp, INDEX_FILE);
}

/**
 * Reads persisted MT5 historical candles from disk for a broker symbol + timeframe.
 */
export function loadStoredMt5Candles(
  brokerSymbol: string,
  timeframe: Timeframe,
  limit?: number
): StoredMt5Candle[] {
  ensureHistoryDir();
  try {
    const filePath = safeHistoryFilePath(brokerSymbol, timeframe);
    if (!fs.existsSync(filePath)) return [];
    const raw = fs.readFileSync(filePath, 'utf8');
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const candles = parsed as StoredMt5Candle[];
    if (limit && limit > 0 && candles.length > limit) {
      return candles.slice(-limit);
    }
    return candles;
  } catch {
    return [];
  }
}

/**
 * Merges incoming real MT5 candles into disk storage with strict timestamp deduplication,
 * ascending chronological order, and incremental updates (updates latest forming candle cleanly).
 * NEVER fabricates missing bars!
 */
export function upsertMt5Candles(
  brokerSymbol: string,
  timeframe: Timeframe,
  incoming: StoredMt5Candle[]
): {
  totalBars: number;
  addedBars: number;
  updatedBars: number;
  firstCandleIso: string | null;
  lastCandleIso: string | null;
} {
  if (!brokerSymbol || incoming.length === 0) {
    const existing = loadStoredMt5Candles(brokerSymbol, timeframe);
    return {
      totalBars: existing.length,
      addedBars: 0,
      updatedBars: 0,
      firstCandleIso: existing[0]?.timeIso ?? null,
      lastCandleIso: existing[existing.length - 1]?.timeIso ?? null,
    };
  }

  ensureHistoryDir();
  const existing = loadStoredMt5Candles(brokerSymbol, timeframe);
  const byEpoch = new Map<number, StoredMt5Candle>();
  for (const c of existing) {
    if (Number.isFinite(c.epochMs) && c.epochMs > 0) {
      byEpoch.set(c.epochMs, c);
    }
  }

  let addedBars = 0;
  let updatedBars = 0;
  for (const c of incoming) {
    if (
      !Number.isFinite(c.epochMs) ||
      c.epochMs <= 0 ||
      !Number.isFinite(c.open) ||
      !Number.isFinite(c.high) ||
      !Number.isFinite(c.low) ||
      !Number.isFinite(c.close) ||
      c.close <= 0
    ) {
      continue;
    }
    const prev = byEpoch.get(c.epochMs);
    if (!prev) {
      addedBars++;
      byEpoch.set(c.epochMs, c);
    } else if (
      prev.close !== c.close ||
      prev.high !== c.high ||
      prev.low !== c.low ||
      prev.tickVolume !== c.tickVolume
    ) {
      updatedBars++;
      byEpoch.set(c.epochMs, c);
    }
  }

  let merged = Array.from(byEpoch.values()).sort((a, b) => a.epochMs - b.epochMs);
  const maxBars = MAX_BARS_BY_TF[timeframe] ?? 25000;
  if (merged.length > maxBars) {
    merged = merged.slice(-maxBars);
  }

  const filePath = safeHistoryFilePath(brokerSymbol, timeframe);
  const tmp = `${filePath}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(merged), { encoding: 'utf8', mode: 0o600 });
  fs.renameSync(tmp, filePath);

  const firstCandleIso = merged[0]?.timeIso ?? null;
  const lastCandleIso = merged[merged.length - 1]?.timeIso ?? null;
  const idx = loadIndex();
  if (!idx[brokerSymbol]) idx[brokerSymbol] = {};
  idx[brokerSymbol][timeframe] = {
    timeframe,
    barsCount: merged.length,
    firstCandleIso,
    lastCandleIso,
    updatedAt: new Date().toISOString(),
  };
  saveIndex();

  return {
    totalBars: merged.length,
    addedBars,
    updatedBars,
    firstCandleIso,
    lastCandleIso,
  };
}

export function getSymbolHistorySummary(brokerSymbol: string): SymbolHistorySummary {
  const idx = loadIndex();
  const entry = idx[brokerSymbol] ?? {};
  const timeframesAvailable: Timeframe[] = [];
  let totalBars = 0;

  for (const tf of ALL_TFS) {
    const meta = entry[tf];
    if (meta && meta.barsCount > 0) {
      timeframesAvailable.push(tf);
      totalBars += meta.barsCount;
    }
  }

  return {
    brokerSymbol,
    totalBars,
    timeframesAvailable,
    barsByTimeframe: entry,
  };
}

export function getAllHistorySummaries(): Record<string, SymbolHistorySummary> {
  const idx = loadIndex();
  const out: Record<string, SymbolHistorySummary> = {};
  for (const sym of Object.keys(idx)) {
    out[sym] = getSymbolHistorySummary(sym);
  }
  return out;
}

export function clearSymbolHistoryCacheForTests(): void {
  indexCache = null;
}
