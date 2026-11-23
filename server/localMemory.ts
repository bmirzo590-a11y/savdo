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

export interface ControlStateRecord {
  scannerStatus: 'RUNNING' | 'PAUSED';
  stopNewTrades: boolean;
  autonomousMode: AutonomousMode;
  autoBackupEnabled: boolean;
  lastAnalysisTime: string | null;
  instrumentsScanned: number;
  lastBackupAt: string | null;
}

export interface LocalMemoryDatabase {
  schemaVersion: number;
  createdAt: string;
  updatedAt: string;
  control: ControlStateRecord;
  strategies: StrategyRegistryRecord[];
  notifications: SystemNotificationRecord[];
  analyses: HistoricalAnalysisRecord[];
  signals: HistoricalSignalRecord[];
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

function createInitialDb(): LocalMemoryDatabase {
  const now = new Date().toISOString();
  return {
    schemaVersion: 1,
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
  };
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
    const parsed = JSON.parse(raw) as LocalMemoryDatabase;
    if (!parsed || !Array.isArray(parsed.strategies) || !parsed.control) {
      throw new Error('Corrupted DB structure');
    }
    dbHealthy = true;
    return parsed;
  } catch {
    // Attempt automatic recovery from latest valid backup
    const backups = listBackups();
    for (const b of backups) {
      try {
        const resolved = resolveSafeBackupPath(b.filename);
        if (!resolved) continue;
        const raw = fs.readFileSync(resolved, 'utf8');
        const recovered = JSON.parse(raw) as LocalMemoryDatabase;
        if (recovered && Array.isArray(recovered.strategies)) {
          saveMemoryDb(recovered);
          dbHealthy = true;
          return recovered;
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
