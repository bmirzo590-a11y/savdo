import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Request, Response, NextFunction } from 'express';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const DATA_DIR = path.resolve(__dirname, '..', 'data');
const AUTH_FILE = path.resolve(DATA_DIR, 'auth.json');

interface ScryptHashRecord {
  salt: string;
  hash: string;
  updatedAt: string;
}

interface StoredAuthConfig {
  pin: ScryptHashRecord | null;
  ownerPassword: ScryptHashRecord | null;
  autoLockMinutes: number;
  setupCompletedAt: string | null;
  auditLog: {
    id: string;
    timestamp: string;
    event: string;
    detail: string;
  }[];
}

export interface SessionRecord {
  token: string;
  csrfToken: string;
  createdAt: number;
  lastActivityAt: number;
  ownerVerifiedUntil: number;
  ip: string;
}

interface RateLimitState {
  failedCount: number;
  lockoutUntil: number;
  escalationLevel: number;
}

const sessions = new Map<string, SessionRecord>();
const pinRateLimits = new Map<string, RateLimitState>();
const ownerRateLimits = new Map<string, RateLimitState>();

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true, mode: 0o700 });
  }
}

export function hashSecret(secret: string): ScryptHashRecord {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(secret, salt, 64).toString('hex');
  return {
    salt,
    hash: derived,
    updatedAt: new Date().toISOString(),
  };
}

export function verifySecret(secret: string, record: ScryptHashRecord | null): boolean {
  if (!record || !record.salt || !record.hash) return false;
  const derived = crypto.scryptSync(secret, record.salt, 64);
  const expected = Buffer.from(record.hash, 'hex');
  if (derived.length !== expected.length) return false;
  return crypto.timingSafeEqual(derived, expected);
}

function defaultAuthConfig(): StoredAuthConfig {
  return {
    pin: null,
    ownerPassword: null,
    autoLockMinutes: 15,
    setupCompletedAt: null,
    auditLog: [],
  };
}

export function loadAuthConfig(): StoredAuthConfig {
  ensureDataDir();
  if (!fs.existsSync(AUTH_FILE)) {
    return defaultAuthConfig();
  }
  try {
    const raw = fs.readFileSync(AUTH_FILE, 'utf8');
    const parsed = JSON.parse(raw) as Partial<StoredAuthConfig>;
    return {
      pin: parsed.pin ?? null,
      ownerPassword: parsed.ownerPassword ?? null,
      autoLockMinutes:
        typeof parsed.autoLockMinutes === 'number' && parsed.autoLockMinutes >= 1 && parsed.autoLockMinutes <= 240
          ? parsed.autoLockMinutes
          : 15,
      setupCompletedAt: parsed.setupCompletedAt ?? null,
      auditLog: Array.isArray(parsed.auditLog) ? parsed.auditLog.slice(0, 80) : [],
    };
  } catch {
    return defaultAuthConfig();
  }
}

export function saveAuthConfig(config: StoredAuthConfig): void {
  ensureDataDir();
  const tmpFile = `${AUTH_FILE}.tmp`;
  fs.writeFileSync(tmpFile, JSON.stringify(config, null, 2), { encoding: 'utf8', mode: 0o600 });
  fs.renameSync(tmpFile, AUTH_FILE);
}

export function appendSecurityAudit(event: string, detail: string): void {
  const cfg = loadAuthConfig();
  cfg.auditLog.unshift({
    id: `aud-${Date.now()}-${crypto.randomBytes(2).toString('hex')}`,
    timestamp: new Date().toISOString(),
    event,
    detail,
  });
  cfg.auditLog = cfg.auditLog.slice(0, 80);
  saveAuthConfig(cfg);
}

function getEnvPin(): string | null {
  const v = (process.env.APP_INITIAL_PIN || '').trim();
  return /^\d{4}$/.test(v) ? v : null;
}

function getEnvOwnerPassword(): string | null {
  const v = (process.env.OWNER_MASTER_PASSWORD || '').trim();
  return v.length >= 6 ? v : null;
}

export function isInitialSetupRequired(): boolean {
  const cfg = loadAuthConfig();
  const hasPin = Boolean(cfg.pin || getEnvPin());
  const hasOwner = Boolean(cfg.ownerPassword || getEnvOwnerPassword());
  return !hasPin || !hasOwner;
}

export function getClientIp(req: Request): string {
  const fwd = req.headers['x-forwarded-for'];
  if (typeof fwd === 'string' && fwd.length > 0) {
    return fwd.split(',')[0].trim();
  }
  return req.ip || req.socket.remoteAddress || 'unknown';
}

function checkRateLimit(bucket: Map<string, RateLimitState>, key: string): { allowed: boolean; retryAfterSec: number } {
  const now = Date.now();
  const state = bucket.get(key);
  if (!state) return { allowed: true, retryAfterSec: 0 };
  if (state.lockoutUntil > now) {
    return { allowed: false, retryAfterSec: Math.ceil((state.lockoutUntil - now) / 1000) };
  }
  return { allowed: true, retryAfterSec: 0 };
}

function recordFailedAttempt(bucket: Map<string, RateLimitState>, key: string): { locked: boolean; retryAfterSec: number; remainingAttempts: number } {
  const now = Date.now();
  const state = bucket.get(key) ?? { failedCount: 0, lockoutUntil: 0, escalationLevel: 0 };
  if (state.lockoutUntil > 0 && state.lockoutUntil <= now) {
    state.failedCount = 0;
    state.lockoutUntil = 0;
  }
  state.failedCount += 1;
  const maxBeforeLock = 5;
  if (state.failedCount >= maxBeforeLock) {
    state.escalationLevel = Math.min(4, state.escalationLevel + 1);
    const durationsSec = [30, 120, 300, 600];
    const lockSec = durationsSec[state.escalationLevel - 1] ?? 600;
    state.lockoutUntil = now + lockSec * 1000;
    state.failedCount = 0;
    bucket.set(key, state);
    return { locked: true, retryAfterSec: lockSec, remainingAttempts: 0 };
  }
  bucket.set(key, state);
  return { locked: false, retryAfterSec: 0, remainingAttempts: maxBeforeLock - state.failedCount };
}

function clearRateLimit(bucket: Map<string, RateLimitState>, key: string): void {
  bucket.delete(key);
}

export function checkPinRateLimit(ip: string) {
  return checkRateLimit(pinRateLimits, ip);
}

export function recordPinFailure(ip: string) {
  return recordFailedAttempt(pinRateLimits, ip);
}

export function clearPinRateLimit(ip: string) {
  clearRateLimit(pinRateLimits, ip);
}

export function checkOwnerRateLimit(ip: string) {
  return checkRateLimit(ownerRateLimits, ip);
}

export function recordOwnerFailure(ip: string) {
  return recordFailedAttempt(ownerRateLimits, ip);
}

export function clearOwnerRateLimit(ip: string) {
  clearRateLimit(ownerRateLimits, ip);
}

export function verifyPinInput(pin: string): boolean {
  if (!/^\d{4}$/.test(pin)) return false;
  const cfg = loadAuthConfig();
  if (cfg.pin) {
    return verifySecret(pin, cfg.pin);
  }
  const envPin = getEnvPin();
  if (envPin) {
    const a = Buffer.from(pin, 'utf8');
    const b = Buffer.from(envPin, 'utf8');
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  }
  return false;
}

export function verifyOwnerPasswordInput(password: string): boolean {
  if (typeof password !== 'string' || password.length < 4) return false;
  const envPwd = getEnvOwnerPassword();
  if (envPwd) {
    const a = crypto.createHash('sha256').update(password).digest();
    const b = crypto.createHash('sha256').update(envPwd).digest();
    if (crypto.timingSafeEqual(a, b)) return true;
  }
  const cfg = loadAuthConfig();
  if (cfg.ownerPassword) {
    return verifySecret(password, cfg.ownerPassword);
  }
  return false;
}

export function completeInitialSetup(pin: string, ownerPassword: string): { ok: boolean; error?: string } {
  if (!isInitialSetupRequired()) {
    return { ok: false, error: 'Boshlang‘ich sozlash allaqachon yakunlangan.' };
  }
  if (!/^\d{4}$/.test(pin)) {
    return { ok: false, error: 'PIN aniq 4 ta raqamdan iborat bo‘lishi shart.' };
  }
  if (typeof ownerPassword !== 'string' || ownerPassword.trim().length < 6) {
    return { ok: false, error: 'Owner paroli kamida 6 ta belgidan iborat bo‘lishi shart.' };
  }
  const cfg = loadAuthConfig();
  cfg.pin = hashSecret(pin);
  cfg.ownerPassword = hashSecret(ownerPassword.trim());
  cfg.setupCompletedAt = new Date().toISOString();
  cfg.auditLog.unshift({
    id: `aud-${Date.now()}`,
    timestamp: new Date().toISOString(),
    event: 'INITIAL_SETUP',
    detail: '4-xonali PIN va alohida Owner paroli xavfsiz scrypt hash bilan o‘rnatildi.',
  });
  saveAuthConfig(cfg);
  return { ok: true };
}

export function createSession(ip: string): SessionRecord {
  const token = crypto.randomBytes(32).toString('hex');
  const csrfToken = crypto.randomBytes(24).toString('hex');
  const now = Date.now();
  const session: SessionRecord = {
    token,
    csrfToken,
    createdAt: now,
    lastActivityAt: now,
    ownerVerifiedUntil: 0,
    ip,
  };
  sessions.set(token, session);
  return session;
}

export function extractBearerToken(req: Request): string | null {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) return null;
  const token = auth.slice(7).trim();
  return token.length >= 32 ? token : null;
}

export function getValidSession(req: Request): SessionRecord | null {
  const token = extractBearerToken(req);
  if (!token) return null;
  const sess = sessions.get(token);
  if (!sess) return null;
  const cfg = loadAuthConfig();
  const maxIdleMs = cfg.autoLockMinutes * 60 * 1000;
  const now = Date.now();
  if (now - sess.lastActivityAt > maxIdleMs) {
    sessions.delete(token);
    return null;
  }
  sess.lastActivityAt = now;
  return sess;
}

export function revokeSession(req: Request): void {
  const token = extractBearerToken(req);
  if (token) {
    sessions.delete(token);
  }
}

export function revokeAllSessions(): void {
  sessions.clear();
}

export function getActiveSessionCount(): number {
  const cfg = loadAuthConfig();
  const maxIdleMs = cfg.autoLockMinutes * 60 * 1000;
  const now = Date.now();
  for (const [tok, sess] of sessions.entries()) {
    if (now - sess.lastActivityAt > maxIdleMs) {
      sessions.delete(tok);
    }
  }
  return sessions.size;
}

export interface AuthedRequest extends Request {
  session?: SessionRecord;
}

export function requireAuth(req: AuthedRequest, res: Response, next: NextFunction) {
  const sess = getValidSession(req);
  if (!sess) {
    return res.status(401).json({ error: 'Sessiya qulflangan yoki muddati tugagan. PIN orqali qayta kiring.', code: 'AUTH_REQUIRED' });
  }
  req.session = sess;
  return next();
}

export function requireCsrf(req: AuthedRequest, res: Response, next: NextFunction) {
  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') {
    return next();
  }
  const sess = req.session ?? getValidSession(req);
  if (!sess) {
    return res.status(401).json({ error: 'Autentifikatsiya talab qilinadi.' });
  }
  const headerToken = String(req.headers['x-csrf-token'] || '');
  if (!headerToken || headerToken.length !== sess.csrfToken.length) {
    return res.status(403).json({ error: 'CSRF tekshiruvi muvaffaqiyatsiz tugadi.' });
  }
  const a = Buffer.from(headerToken, 'utf8');
  const b = Buffer.from(sess.csrfToken, 'utf8');
  if (!crypto.timingSafeEqual(a, b)) {
    return res.status(403).json({ error: 'CSRF token mos kelmadi.' });
  }
  return next();
}

export function requireOwner(req: AuthedRequest, res: Response, next: NextFunction) {
  const sess = req.session ?? getValidSession(req);
  if (!sess) {
    return res.status(401).json({ error: 'Sessiya faol emas.' });
  }
  if (Date.now() > sess.ownerVerifiedUntil) {
    return res.status(403).json({
      error: 'Ushbu amal uchun Owner autentifikatsiyasi talab qilinadi.',
      code: 'OWNER_AUTH_REQUIRED',
    });
  }
  return next();
}

export const OWNER_PROFILE = {
  fullName: 'Baratov Boburmirzo',
  role: 'FOUNDER / CREATOR / OWNER',
  project: 'Trade Killer AI',
  instagramHandle: '@aa770k',
  instagramUrl: 'https://www.instagram.com/aa770k/',
} as const;
