import React, { useCallback, useEffect, useState } from 'react';
import {
  Clock,
  ExternalLink,
  KeyRound,
  Lock,
  ShieldAlert,
  ShieldCheck,
  UserCheck,
} from 'lucide-react';
import {
  OwnerProfileData,
  SecurityAuditEntry,
  StrategyRegistryRecord,
} from '../types/trading';
import { apiJson } from '../utils/apiClient';

interface OwnerCenterViewProps {
  ownerVerified: boolean;
  autoLockMinutes: number;
  registry: StrategyRegistryRecord[];
  onOwnerVerified: () => void;
  onAutoLockUpdated: (mins: number) => void;
  onRegistryUpdated: (next: StrategyRegistryRecord[]) => void;
}

interface OwnerProfileResponse {
  profile: OwnerProfileData;
  autoLockMinutes: number;
  pinUpdatedAt: string | null;
  ownerPasswordUpdatedAt: string | null;
  auditLog: SecurityAuditEntry[];
}

export const OwnerCenterView: React.FC<OwnerCenterViewProps> = ({
  ownerVerified,
  autoLockMinutes,
  registry,
  onOwnerVerified,
  onAutoLockUpdated,
  onRegistryUpdated,
}) => {
  const [ownerPassInput, setOwnerPassInput] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [verifyError, setVerifyError] = useState<string | null>(null);

  const [profileData, setProfileData] = useState<OwnerProfileResponse | null>(null);
  const [loadingProfile, setLoadingProfile] = useState(false);

  // Change PIN form
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [pinMsg, setPinMsg] = useState<string | null>(null);
  const [pinErr, setPinErr] = useState<string | null>(null);

  // Change Owner Password form
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passMsg, setPassMsg] = useState<string | null>(null);
  const [passErr, setPassErr] = useState<string | null>(null);

  // Auto-Lock setting
  const [lockMinsInput, setLockMinsInput] = useState(String(autoLockMinutes));
  const [lockMsg, setLockMsg] = useState<string | null>(null);

  const [saving, setSaving] = useState(false);

  const fetchOwnerProfile = useCallback(async () => {
    setLoadingProfile(true);
    try {
      const data = await apiJson<OwnerProfileResponse>('/api/owner/profile');
      setProfileData(data);
      setLockMinsInput(String(data.autoLockMinutes));
    } catch {
      setProfileData(null);
    } finally {
      setLoadingProfile(false);
    }
  }, []);

  useEffect(() => {
    if (ownerVerified) {
      void fetchOwnerProfile();
    } else {
      setProfileData(null);
    }
  }, [ownerVerified, fetchOwnerProfile]);

  const handleVerifyOwner = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ownerPassInput.trim() || verifying) return;
    setVerifying(true);
    setVerifyError(null);
    try {
      await apiJson('/api/auth/owner-verify', {
        method: 'POST',
        body: JSON.stringify({ password: ownerPassInput }),
      });
      setOwnerPassInput('');
      onOwnerVerified();
      await fetchOwnerProfile();
    } catch (err) {
      setVerifyError(err instanceof Error ? err.message : 'Owner paroli noto‘g‘ri.');
    } finally {
      setVerifying(false);
    }
  };

  const handleChangePin = async (e: React.FormEvent) => {
    e.preventDefault();
    setPinErr(null);
    setPinMsg(null);
    if (!/^\d{4}$/.test(newPin)) {
      setPinErr('Yangi PIN aniq 4 ta raqamdan iborat bo‘lishi kerak.');
      return;
    }
    if (newPin !== confirmPin) {
      setPinErr('Yangi PIN ikkala maydonda ham bir xil kiritilishi shart.');
      return;
    }
    setSaving(true);
    try {
      await apiJson('/api/owner/change-pin', {
        method: 'POST',
        body: JSON.stringify({ newPin, confirmPin }),
      });
      setNewPin('');
      setConfirmPin('');
      setPinMsg('4-xonali kirish PIN kodi serverda yangi hash bilan saqlandi.');
      await fetchOwnerProfile();
    } catch (err) {
      setPinErr(err instanceof Error ? err.message : 'PIN almashtirishda xatolik.');
    } finally {
      setSaving(false);
    }
  };

  const handleChangeOwnerPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPassErr(null);
    setPassMsg(null);
    if (newPassword.trim().length < 6) {
      setPassErr('Yangi parol kamida 6 ta belgidan iborat bo‘lishi kerak.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setPassErr('Parollar bir-biriga mos kelmadi.');
      return;
    }
    setSaving(true);
    try {
      await apiJson('/api/owner/change-password', {
        method: 'POST',
        body: JSON.stringify({
          newPassword: newPassword.trim(),
          confirmPassword: confirmPassword.trim(),
        }),
      });
      setNewPassword('');
      setConfirmPassword('');
      setPassMsg('Owner bosh paroli muvaffaqiyatli yangilandi.');
      await fetchOwnerProfile();
    } catch (err) {
      setPassErr(err instanceof Error ? err.message : 'Parolni almashtirishda xatolik.');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveAutoLock = async (e: React.FormEvent) => {
    e.preventDefault();
    setLockMsg(null);
    const mins = Number(lockMinsInput);
    if (!Number.isFinite(mins) || mins < 1 || mins > 240) return;
    setSaving(true);
    try {
      const res = await apiJson<{ ok: boolean; autoLockMinutes: number }>('/api/owner/auto-lock', {
        method: 'POST',
        body: JSON.stringify({ autoLockMinutes: mins }),
      });
      onAutoLockUpdated(res.autoLockMinutes);
      setLockMsg(`Avto-qulflash ${res.autoLockMinutes} daqiqaga o‘rnatildi.`);
      await fetchOwnerProfile();
    } finally {
      setSaving(false);
    }
  };

  const handleQuickApproveStrategy = async (id: string) => {
    setSaving(true);
    try {
      const res = await apiJson<{ ok: boolean; strategies: StrategyRegistryRecord[] }>(
        `/api/registry/strategies/${encodeURIComponent(id)}/stage`,
        {
          method: 'POST',
          body: JSON.stringify({
            codeReviewStatus: 'PASSED',
            backtestStatus: 'PASSED',
            demoTestStatus: 'PASSED',
            ownerApproved: true,
            active: true,
          }),
        }
      );
      onRegistryUpdated(res.strategies);
    } finally {
      setSaving(false);
    }
  };

  // Strict Gate: NEVER render Owner Profile before Owner Master Password verification
  if (!ownerVerified) {
    return (
      <section className="max-w-lg mx-auto rounded-xl border border-slate-200 dark:border-slate-800/90 bg-white dark:bg-[#131B2B] neon-surface p-6 space-y-5">
        <div className="flex items-start gap-3 pb-4 border-b border-slate-200 dark:border-slate-800">
          <div className="w-10 h-10 rounded-lg border border-[#F25F8C]/40 bg-[#F25F8C]/10 flex items-center justify-center text-[#FF7AA5] shrink-0">
            <Lock className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-base font-semibold text-slate-900 dark:text-white">
              Owner Autentifikatsiyasi (Alohida Himoya)
            </h1>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Owner profili, 4-xonali PIN’ni almashtirish, strategiya tasdig‘i, backup tiklash va Avtonom Savdoni boshqarish faqat Owner paroli tasdiqlangandan keyin ochiladi.
            </p>
          </div>
        </div>

        <form onSubmit={handleVerifyOwner} className="space-y-4">
          <div>
            <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1.5">
              Owner Bosh Paroli
            </label>
            <input
              type="password"
              value={ownerPassInput}
              onChange={(e) => setOwnerPassInput(e.target.value)}
              placeholder="Owner parolini kiriting"
              required
              autoFocus
              className="w-full px-3.5 py-2.5 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#0D1320] text-slate-900 dark:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-[#F25F8C]"
            />
          </div>

          {verifyError && (
            <div className="px-3 py-2 rounded-lg border border-rose-500/40 bg-rose-950/25 text-xs text-rose-400 flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 shrink-0" />
              <span>{verifyError}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={verifying || !ownerPassInput.trim()}
            className="w-full py-2.5 px-4 text-sm font-semibold rounded-lg bg-gradient-to-r from-[#F25F8C] via-[#EB6B7B] to-[#E87769] text-slate-950 hover:brightness-110 disabled:opacity-40 neon-glow-cyan transition-all cursor-pointer"
          >
            {verifying ? 'Tekshirilmoqda...' : 'Owner Markazini ochish'}
          </button>
        </form>
      </section>
    );
  }

  const pendingApprovals = registry.filter((s) => !s.ownerApproved);

  return (
    <div className="space-y-6">
      {/* Authenticated Owner Profile Card */}
      <section className="rounded-xl border border-[#F25F8C]/40 bg-white dark:bg-[#131B2B] neon-surface p-5">
        {loadingProfile || !profileData ? (
          <div className="py-6 text-center text-xs font-mono text-slate-400">
            Owner ma’lumotlari yuklanmoqda...
          </div>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl border border-[#F25F8C]/45 bg-[#F25F8C]/15 flex items-center justify-center text-[#FF7AA5] shrink-0">
                <UserCheck className="w-6 h-6" />
              </div>
              <div>
                <div className="text-[11px] font-mono font-semibold text-[#C8285E] dark:text-[#FF7AA5]">
                  {profileData.profile.role} · {profileData.profile.project}
                </div>
                <h1 className="text-xl font-bold text-slate-900 dark:text-white">
                  {profileData.profile.fullName}
                </h1>
                <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                  <span>Instagram: {profileData.profile.instagramHandle}</span>
                  <span aria-hidden="true">·</span>
                  <a
                    href={profileData.profile.instagramUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-[#C8285E] dark:text-[#FF7AA5] hover:underline font-mono"
                  >
                    <span>instagram.com/aa770k</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              </div>
            </div>

            <div className="text-right text-xs font-mono text-emerald-500 flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4" />
              <span>Owner Vakolati Faol</span>
            </div>
          </div>
        )}
      </section>

      {/* PIN Change + Owner Password Change + Auto Lock */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Change 4-Digit PIN */}
        <section className="rounded-xl border border-slate-200 dark:border-slate-800/90 bg-white dark:bg-[#131B2B] neon-surface p-5 space-y-4">
          <div className="flex items-center gap-2 pb-3 border-b border-slate-200 dark:border-slate-800">
            <KeyRound className="w-4 h-4 text-[#FF7AA5]" />
            <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
              4-xonali PIN Kodni Almashtirish
            </h2>
          </div>

          <form onSubmit={handleChangePin} className="space-y-3">
            <div>
              <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">
                Yangi 4-xonali PIN
              </label>
              <input
                type="password"
                inputMode="numeric"
                maxLength={4}
                value={newPin}
                onChange={(e) => setNewPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                placeholder="••••"
                required
                className="w-full px-3 py-2 text-center tracking-[0.4em] font-mono text-base rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#0D1320] text-slate-900 dark:text-white"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">
                Yangi PIN’ni qayta tasdiqlang
              </label>
              <input
                type="password"
                inputMode="numeric"
                maxLength={4}
                value={confirmPin}
                onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                placeholder="••••"
                required
                className="w-full px-3 py-2 text-center tracking-[0.4em] font-mono text-base rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#0D1320] text-slate-900 dark:text-white"
              />
            </div>

            {pinErr && <p className="text-xs text-rose-400">{pinErr}</p>}
            {pinMsg && <p className="text-xs text-emerald-400">{pinMsg}</p>}

            <button
              type="submit"
              disabled={saving}
              className="w-full py-2 px-3 text-xs font-semibold rounded-lg bg-gradient-to-r from-[#F25F8C] via-[#EB6B7B] to-[#E87769] text-slate-950 hover:brightness-110 disabled:opacity-50 cursor-pointer"
            >
              PIN’ni yangilash
            </button>
          </form>
        </section>

        {/* Change Owner Master Password */}
        <section className="rounded-xl border border-slate-200 dark:border-slate-800/90 bg-white dark:bg-[#131B2B] neon-surface p-5 space-y-4">
          <div className="flex items-center gap-2 pb-3 border-b border-slate-200 dark:border-slate-800">
            <Lock className="w-4 h-4 text-[#FF7AA5]" />
            <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
              Owner Bosh Parolini Almashtirish
            </h2>
          </div>

          <form onSubmit={handleChangeOwnerPassword} className="space-y-3">
            <div>
              <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">
                Yangi Owner paroli (min 6 belgi)
              </label>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
                minLength={6}
                className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#0D1320] text-slate-900 dark:text-white"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">
                Yangi parolni tasdiqlang
              </label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                minLength={6}
                className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#0D1320] text-slate-900 dark:text-white"
              />
            </div>

            {passErr && <p className="text-xs text-rose-400">{passErr}</p>}
            {passMsg && <p className="text-xs text-emerald-400">{passMsg}</p>}

            <button
              type="submit"
              disabled={saving}
              className="w-full py-2 px-3 text-xs font-semibold rounded-lg border border-[#F25F8C]/50 bg-[#F25F8C]/12 text-[#FF7AA5] hover:bg-[#F25F8C]/20 disabled:opacity-50 cursor-pointer"
            >
              Owner parolini yangilash
            </button>
          </form>
        </section>

        {/* Auto-Lock Idle Timeout */}
        <section className="rounded-xl border border-slate-200 dark:border-slate-800/90 bg-white dark:bg-[#131B2B] neon-surface p-5 space-y-4">
          <div className="flex items-center gap-2 pb-3 border-b border-slate-200 dark:border-slate-800">
            <Clock className="w-4 h-4 text-[#FF7AA5]" />
            <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
              Sessiyani Avtomatik Qulflash
            </h2>
          </div>

          <form onSubmit={handleSaveAutoLock} className="space-y-3">
            <div>
              <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">
                Harakatsizlik vaqti (1 – 240 daqiqa)
              </label>
              <input
                type="number"
                min={1}
                max={240}
                value={lockMinsInput}
                onChange={(e) => setLockMinsInput(e.target.value)}
                className="w-full px-3 py-2 text-sm font-mono tabular-nums rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#0D1320] text-slate-900 dark:text-white"
              />
            </div>
            <p className="text-[11px] text-slate-500 leading-relaxed">
              Belgilangan vaqt davomida faollik bo‘lmasa, terminal avtomatik ravishda 4-xonali PIN qulfiga qaytadi.
            </p>
            {lockMsg && <p className="text-xs text-emerald-400">{lockMsg}</p>}
            <button
              type="submit"
              disabled={saving}
              className="w-full py-2 px-3 text-xs font-semibold rounded-lg border border-slate-700 text-slate-200 hover:border-[#F25F8C]/50 cursor-pointer"
            >
              Vaqtni saqlash
            </button>
          </form>
        </section>
      </div>

      {/* Pending Strategy Approvals + Security Audit Log */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <section className="rounded-xl border border-slate-200 dark:border-slate-800/90 bg-white dark:bg-[#131B2B] neon-surface overflow-hidden">
          <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs">
            <span className="font-semibold text-slate-900 dark:text-white">
              Tasdiq Kutayotgan Strategiyalar ({pendingApprovals.length})
            </span>
          </div>
          <div className="max-h-64 overflow-y-auto divide-y divide-slate-200 dark:divide-slate-800/80 text-xs">
            {pendingApprovals.length === 0 ? (
              <div className="p-6 text-center text-slate-500">Barcha strategiyalar tasdiqlangan.</div>
            ) : (
              pendingApprovals.map((s) => (
                <div key={s.id} className="px-4 py-2.5 flex items-center justify-between gap-2">
                  <div>
                    <div className="font-semibold text-slate-900 dark:text-white">{s.name}</div>
                    <div className="text-[11px] font-mono text-slate-500">{s.source}</div>
                  </div>
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => void handleQuickApproveStrategy(s.id)}
                    className="px-2.5 py-1 text-[11px] font-semibold rounded border border-emerald-500/45 text-emerald-400 hover:bg-emerald-500/15 cursor-pointer whitespace-nowrap"
                  >
                    Tasdiqlash & Faollashtirish
                  </button>
                </div>
              ))
            )}
          </div>
        </section>

        <section className="rounded-xl border border-slate-200 dark:border-slate-800/90 bg-white dark:bg-[#131B2B] neon-surface overflow-hidden">
          <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs">
            <span className="font-semibold text-slate-900 dark:text-white">
              Xavfsizlik Audit Jurnali
            </span>
            <span className="font-mono text-slate-500">
              {profileData?.auditLog.length ?? 0} ta hodisa
            </span>
          </div>
          <div className="max-h-64 overflow-y-auto divide-y divide-slate-200 dark:divide-slate-800/80 text-xs">
            {!profileData || profileData.auditLog.length === 0 ? (
              <div className="p-6 text-center text-slate-500">Audit yozuvlari yo‘q.</div>
            ) : (
              profileData.auditLog.map((entry) => (
                <div key={entry.id} className="px-4 py-2 flex items-center justify-between gap-2">
                  <div>
                    <span className="font-mono font-semibold text-[#FF7AA5]">{entry.event}</span>
                    <span className="ml-2 text-slate-400">{entry.detail}</span>
                  </div>
                  <span className="font-mono tabular-nums text-[11px] text-slate-500 shrink-0">
                    {new Date(entry.timestamp).toLocaleTimeString('en-GB')}
                  </span>
                </div>
              ))
            )}
          </div>
        </section>
      </div>
    </div>
  );
};
