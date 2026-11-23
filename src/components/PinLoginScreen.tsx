import React, { useCallback, useEffect, useState } from 'react';
import { Delete, KeyRound, Lock, ShieldAlert, ShieldCheck } from 'lucide-react';
import { AuthSessionState } from '../types/trading';

interface PinLoginScreenProps {
  onAuthenticated: (session: AuthSessionState) => void;
  lockMessage?: string | null;
}

interface AuthStatusResponse {
  authenticated: boolean;
  needsInitialSetup: boolean;
  ownerVerified: boolean;
  autoLockMinutes: number;
  lockedOut: boolean;
  retryAfterSec: number;
  httpsDetected: boolean;
}

const KEYPAD_KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'CLEAR', '0', 'BACK'] as const;

export const PinLoginScreen: React.FC<PinLoginScreenProps> = ({
  onAuthenticated,
  lockMessage,
}) => {
  const [loadingStatus, setLoadingStatus] = useState(true);
  const [needsInitialSetup, setNeedsInitialSetup] = useState(false);
  const [pin, setPin] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retryAfterSec, setRetryAfterSec] = useState(0);
  const [httpsDetected, setHttpsDetected] = useState(false);

  // First-run initial setup state
  const [setupPin, setSetupPin] = useState('');
  const [setupConfirmPin, setSetupConfirmPin] = useState('');
  const [ownerPassword, setOwnerPassword] = useState('');
  const [confirmOwnerPassword, setConfirmOwnerPassword] = useState('');

  const fetchAuthStatus = useCallback(async () => {
    setLoadingStatus(true);
    try {
      const res = await fetch('/api/auth/status');
      const data = (await res.json()) as AuthStatusResponse;
      setNeedsInitialSetup(Boolean(data.needsInitialSetup));
      setRetryAfterSec(data.lockedOut ? Math.max(0, Number(data.retryAfterSec) || 0) : 0);
      setHttpsDetected(Boolean(data.httpsDetected));
    } catch {
      setError('Backend autentifikatsiya serveri bilan bog‘lanib bo‘lmadi.');
    } finally {
      setLoadingStatus(false);
    }
  }, []);

  useEffect(() => {
    void fetchAuthStatus();
  }, [fetchAuthStatus]);

  // Countdown timer when temporarily locked out due to brute-force protection
  useEffect(() => {
    if (retryAfterSec <= 0) return;
    const timer = window.setInterval(() => {
      setRetryAfterSec((prev) => (prev <= 1 ? 0 : prev - 1));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [retryAfterSec]);

  const submitPin = useCallback(
    async (candidatePin: string) => {
      if (submitting || retryAfterSec > 0 || candidatePin.length !== 4) return;
      setSubmitting(true);
      setError(null);
      try {
        const res = await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ pin: candidatePin }),
        });
        const data = (await res.json()) as Partial<AuthSessionState> & {
          error?: string;
          retryAfterSec?: number;
          needsInitialSetup?: boolean;
        };

        if (!res.ok) {
          setPin('');
          if (data.needsInitialSetup) {
            setNeedsInitialSetup(true);
          }
          if (res.status === 429 && data.retryAfterSec) {
            setRetryAfterSec(Number(data.retryAfterSec));
          }
          setError(data.error || 'Noto‘g‘ri PIN kod.');
          return;
        }

        if (data.token && data.csrfToken) {
          onAuthenticated({
            token: data.token,
            csrfToken: data.csrfToken,
            ownerVerified: Boolean(data.ownerVerified),
            autoLockMinutes: Number(data.autoLockMinutes) || 15,
          });
        }
      } catch {
        setPin('');
        setError('Server bilan aloqa uzildi. Qayta urinib ko‘ring.');
      } finally {
        setSubmitting(false);
      }
    },
    [onAuthenticated, retryAfterSec, submitting]
  );

  const handleDigitInput = useCallback(
    (digit: string) => {
      if (submitting || retryAfterSec > 0) return;
      setError(null);
      setPin((prev) => {
        if (prev.length >= 4) return prev;
        const next = prev + digit;
        if (next.length === 4) {
          window.setTimeout(() => {
            void submitPin(next);
          }, 80);
        }
        return next;
      });
    },
    [retryAfterSec, submitPin, submitting]
  );

  const handleBackspace = useCallback(() => {
    if (submitting) return;
    setPin((prev) => prev.slice(0, -1));
  }, [submitting]);

  const handleClear = useCallback(() => {
    if (submitting) return;
    setPin('');
    setError(null);
  }, [submitting]);

  // Keyboard support for numeric PIN entry
  useEffect(() => {
    if (needsInitialSetup || loadingStatus) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (/^\d$/.test(e.key)) {
        e.preventDefault();
        handleDigitInput(e.key);
      } else if (e.key === 'Backspace') {
        e.preventDefault();
        handleBackspace();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        handleClear();
      } else if (e.key === 'Enter' && pin.length === 4) {
        e.preventDefault();
        void submitPin(pin);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [handleBackspace, handleClear, handleDigitInput, loadingStatus, needsInitialSetup, pin, submitPin]);

  const handleSetupSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setError(null);

    if (!/^\d{4}$/.test(setupPin)) {
      setError('Kirish PIN kodi aniq 4 ta raqamdan iborat bo‘lishi kerak.');
      return;
    }
    if (setupPin !== setupConfirmPin) {
      setError('PIN kodlari bir-biriga mos kelmadi.');
      return;
    }
    if (ownerPassword.trim().length < 6) {
      setError('Owner bosh paroli kamida 6 ta belgidan iborat bo‘lishi kerak.');
      return;
    }
    if (ownerPassword !== confirmOwnerPassword) {
      setError('Owner parollari bir-biriga mos kelmadi.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch('/api/auth/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pin: setupPin,
          confirmPin: setupConfirmPin,
          ownerPassword: ownerPassword.trim(),
          confirmOwnerPassword: confirmOwnerPassword.trim(),
        }),
      });
      const data = (await res.json()) as Partial<AuthSessionState> & { error?: string };
      if (!res.ok) {
        setError(data.error || 'Boshlang‘ich sozlashda xatolik.');
        return;
      }
      if (data.token && data.csrfToken) {
        onAuthenticated({
          token: data.token,
          csrfToken: data.csrfToken,
          ownerVerified: Boolean(data.ownerVerified),
          autoLockMinutes: Number(data.autoLockMinutes) || 15,
        });
      }
    } catch {
      setError('Server bilan aloqa uzildi.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen w-full bg-[#050811] tk-canvas-bg text-slate-100 flex items-center justify-center p-4">
      <div className="w-full max-w-md rounded-2xl border border-violet-500/30 bg-[#0B1120] tk-glass-purple p-6 sm:p-8 space-y-6">
        <div className="text-center space-y-2">
          <div className="mx-auto w-11 h-11 rounded-xl border border-violet-500/40 bg-violet-500/15 flex items-center justify-center text-sky-400">
            {needsInitialSetup ? <KeyRound className="w-5 h-5" /> : <Lock className="w-5 h-5" />}
          </div>
          <h1 className="font-display text-xl font-bold tracking-tight bg-gradient-to-r from-violet-400 via-sky-400 to-[#00E5A0] bg-clip-text text-transparent">
            Trade Killer AI
          </h1>
          <p className="text-xs text-slate-400">
            {needsInitialSetup
              ? 'Birinchi ishga tushirish · Kirish PIN va Owner parolini serverda xavfsiz saqlash'
              : 'Himoyalangan Trading Terminali · Kirish uchun 4-xonali PIN kodni kiriting'}
          </p>
        </div>

        {lockMessage && (
          <div className="px-3.5 py-2.5 rounded-lg border border-amber-500/35 bg-amber-500/10 text-xs text-amber-300 text-center">
            {lockMessage}
          </div>
        )}

        {loadingStatus ? (
          <div className="py-12 text-center text-xs font-mono text-slate-400">
            Xavfsizlik holati tekshirilmoqda...
          </div>
        ) : needsInitialSetup ? (
          <form onSubmit={handleSetupSubmit} className="space-y-4">
            <div className="rounded-lg border border-slate-800 bg-[#0D1320] p-3 text-xs text-slate-400 leading-relaxed">
              PIN kod va Owner paroli brauzerda yoki GitHub’da saqlanmaydi — faqat server diskida kriptografik hash ko‘rinishida qulflanadi.
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-slate-400 mb-1">4-xonali Kirish PIN</label>
                <input
                  type="password"
                  inputMode="numeric"
                  maxLength={4}
                  value={setupPin}
                  onChange={(e) => setSetupPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                  placeholder="••••"
                  required
                  className="w-full px-3 py-2 text-center text-base tracking-[0.4em] font-mono rounded-lg border border-slate-700 bg-[#0D1320] text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-[#F25F8C]"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">PIN tasdig‘i</label>
                <input
                  type="password"
                  inputMode="numeric"
                  maxLength={4}
                  value={setupConfirmPin}
                  onChange={(e) => setSetupConfirmPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                  placeholder="••••"
                  required
                  className="w-full px-3 py-2 text-center text-base tracking-[0.4em] font-mono rounded-lg border border-slate-700 bg-[#0D1320] text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-[#F25F8C]"
                />
              </div>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs text-slate-400 mb-1">
                  Owner Bosh Paroli (alohida autentifikatsiya, min 6 belgi)
                </label>
                <input
                  type="password"
                  value={ownerPassword}
                  onChange={(e) => setOwnerPassword(e.target.value)}
                  placeholder="Kuchli Owner parolini kiriting"
                  required
                  minLength={6}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-700 bg-[#0D1320] text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-[#F25F8C]"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Owner Parolini tasdiqlang</label>
                <input
                  type="password"
                  value={confirmOwnerPassword}
                  onChange={(e) => setConfirmOwnerPassword(e.target.value)}
                  placeholder="Parolni qayta kiriting"
                  required
                  minLength={6}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-700 bg-[#0D1320] text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-[#F25F8C]"
                />
              </div>
            </div>

            {error && (
              <div className="px-3 py-2 rounded-lg border border-rose-500/40 bg-rose-950/30 text-xs text-rose-300 flex items-center gap-2">
                <ShieldAlert className="w-4 h-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="w-full py-2.5 px-4 text-sm font-semibold rounded-lg bg-gradient-to-r from-violet-600 via-sky-500 to-emerald-500 text-slate-950 hover:brightness-110 disabled:opacity-50 tk-glow-primary transition-all cursor-pointer"
            >
              {submitting ? 'Saqlanmoqda...' : 'PIN va Owner himoyasini faollashtirish'}
            </button>
          </form>
        ) : (
          <div className="space-y-5">
            {/* 4-Digit PIN Slots */}
            <div className="flex items-center justify-center gap-3.5" aria-label="4 xonali PIN holati">
              {[0, 1, 2, 3].map((idx) => {
                const filled = idx < pin.length;
                return (
                  <div
                    key={idx}
                    className={`w-12 h-13 rounded-xl border flex items-center justify-center transition-all ${
                      filled
                        ? 'border-sky-400 bg-violet-500/20 tk-glow-primary'
                        : 'border-violet-500/25 bg-[#070C18]'
                    }`}
                  >
                    <span
                      className={`w-3 h-3 rounded-sm transition-all ${
                        filled ? 'bg-sky-400 scale-100' : 'bg-slate-700 scale-75'
                      }`}
                    />
                  </div>
                );
              })}
            </div>

            {retryAfterSec > 0 && (
              <div className="px-3.5 py-2.5 rounded-lg border border-rose-500/40 bg-rose-950/35 text-xs text-rose-300 text-center font-mono tabular-nums">
                Brute-force himoya faol · Qayta urinish: {retryAfterSec} soniya
              </div>
            )}

            {error && retryAfterSec === 0 && (
              <div className="px-3.5 py-2 rounded-lg border border-rose-500/40 bg-rose-950/30 text-xs text-rose-300 text-center">
                {error}
              </div>
            )}

            {/* Modern Numeric Keypad */}
            <div className="grid grid-cols-3 gap-2.5">
              {KEYPAD_KEYS.map((key) => {
                if (key === 'CLEAR') {
                  return (
                    <button
                      key={key}
                      type="button"
                      disabled={submitting || retryAfterSec > 0}
                      onClick={handleClear}
                      className="h-13 rounded-xl border border-slate-800 bg-[#0D1320] hover:border-slate-700 text-xs font-medium text-slate-400 hover:text-slate-200 disabled:opacity-40 transition-colors cursor-pointer"
                    >
                      Tozalash
                    </button>
                  );
                }
                if (key === 'BACK') {
                  return (
                    <button
                      key={key}
                      type="button"
                      disabled={submitting || retryAfterSec > 0}
                      onClick={handleBackspace}
                      aria-label="O‘chirish"
                      className="h-13 rounded-xl border border-slate-800 bg-[#0D1320] hover:border-slate-700 flex items-center justify-center text-slate-400 hover:text-slate-200 disabled:opacity-40 transition-colors cursor-pointer"
                    >
                      <Delete className="w-4 h-4" />
                    </button>
                  );
                }
                return (
                  <button
                    key={key}
                    type="button"
                    disabled={submitting || retryAfterSec > 0}
                    onClick={() => handleDigitInput(key)}
                    className="h-13 rounded-xl border border-violet-500/20 bg-[#070C18] hover:border-sky-400/60 hover:bg-violet-500/15 text-lg font-semibold font-mono tabular-nums text-slate-100 active:scale-[0.98] disabled:opacity-40 transition-all cursor-pointer"
                  >
                    {key}
                  </button>
                );
              })}
            </div>

            <button
              type="button"
              disabled={submitting || retryAfterSec > 0 || pin.length !== 4}
              onClick={() => void submitPin(pin)}
              className="w-full py-2.5 px-4 text-sm font-semibold rounded-lg bg-gradient-to-r from-violet-600 via-sky-500 to-emerald-500 text-slate-950 hover:brightness-110 disabled:opacity-40 tk-glow-primary transition-all cursor-pointer"
            >
              {submitting ? 'Tekshirilmoqda...' : 'Terminalni ochish'}
            </button>
          </div>
        )}

        <div className="pt-4 border-t border-slate-800/90 flex items-center justify-between text-[11px] font-mono text-slate-500">
          <span className="inline-flex items-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
            Server Hash · CSRF · Lockout
          </span>
          <span>{httpsDetected ? 'HTTPS Faol' : 'Lokal Sessiya'}</span>
        </div>
      </div>
    </div>
  );
};
