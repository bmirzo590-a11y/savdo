import React, { useState } from 'react';
import { AlertOctagon, Bot, Eye, Lock, Radio, ShieldCheck, ShieldOff } from 'lucide-react';
import {
  AutonomousMode,
  ControlStateRecord,
  StrategyRegistryRecord,
} from '../types/trading';
import { apiJson } from '../utils/apiClient';

interface AutoTradingViewProps {
  control: ControlStateRecord | null;
  registry: StrategyRegistryRecord[];
  ownerVerified: boolean;
  mt5Connected: boolean;
  onControlUpdated: () => void;
  onGoToOwnerCenter: () => void;
  onGoToStrategies: () => void;
}

const MODES: {
  id: AutonomousMode;
  title: string;
  subtitle: string;
  icon: React.ComponentType<{ className?: string }>;
}[] = [
  {
    id: 'OBSERVATION',
    title: 'Kuzatuv (Observation)',
    subtitle: 'Bozor 24/7 tahlil qilinadi, tarixiy baza to‘ldiriladi. Hech qanday savdo ochilmaydi.',
    icon: Eye,
  },
  {
    id: 'SIGNAL',
    title: 'Signal Rejimi (Signal)',
    subtitle: 'Kuchli BUY/SELL setup, breakout va sweep holatlarida ustuvor bildirishnomalar yuboriladi. Savdoni o‘zingiz tasdiqlaysiz.',
    icon: Radio,
  },
  {
    id: 'AUTONOMOUS',
    title: 'Avtonom Savdo (Autonomous Trading)',
    subtitle: 'Faqat Owner tasdiqlagan va faol strategiyalar bo‘yicha risk limitlari doirasida avtomatik savdo ijrosi.',
    icon: Bot,
  },
];

export const AutoTradingView: React.FC<AutoTradingViewProps> = ({
  control,
  registry,
  ownerVerified,
  mt5Connected,
  onControlUpdated,
  onGoToOwnerCenter,
  onGoToStrategies,
}) => {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const currentMode: AutonomousMode = control?.autonomousMode ?? 'OBSERVATION';
  const stopNewTrades = Boolean(control?.stopNewTrades);
  const eligibleStrategies = registry.filter((s) => s.ownerApproved && s.active);

  const canEnableAutonomous =
    ownerVerified && !stopNewTrades && eligibleStrategies.length > 0;

  const setMode = async (mode: AutonomousMode) => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await apiJson('/api/system/control', {
        method: 'POST',
        body: JSON.stringify({ action: 'SET_MODE', mode }),
      });
      setNotice(`Savdo rejimi muvaffaqiyatli o‘zgartirildi: ${mode}`);
      onControlUpdated();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Rejimni o‘zgartirishda xatolik.');
    } finally {
      setBusy(false);
    }
  };

  const quickControl = async (action: 'DISABLE_AUTO_TRADING' | 'STOP_NEW_TRADES') => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await apiJson('/api/system/control', {
        method: 'POST',
        body: JSON.stringify({ action }),
      });
      setNotice(
        action === 'STOP_NEW_TRADES'
          ? 'STOP NEW TRADES faollashtirildi — barcha yangi savdolar bloklandi.'
          : 'Avto-Savdo o‘chirildi va Kuzatuv rejimiga o‘tkazildi.'
      );
      onControlUpdated();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Boshqaruv buyrug‘ida xatolik.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-slate-200 dark:border-slate-800/90 bg-white dark:bg-[#131B2B] neon-surface p-5 space-y-5">
        <div className="flex flex-wrap items-start justify-between gap-4 pb-4 border-b border-slate-200 dark:border-slate-800">
          <div className="space-y-1">
            <h1 className="text-lg font-semibold text-slate-900 dark:text-white">
              24/7 Avtonom Savdo Boshqaruvi
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400 max-w-2xl">
              Avtomatik savdo faqat Owner aniq ruxsati, STOP NEW TRADES o‘chirilgani va Registry bazasida kamida 1 ta Owner tasdiqlagan strategiya faol bo‘lganda ishga tushadi.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => void quickControl('DISABLE_AUTO_TRADING')}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:border-rose-500/50 hover:text-rose-400 cursor-pointer whitespace-nowrap"
            >
              <ShieldOff className="w-3.5 h-3.5" />
              <span>DISABLE AUTO TRADING</span>
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void quickControl('STOP_NEW_TRADES')}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-rose-500/50 bg-rose-500/15 text-rose-500 hover:bg-rose-600 hover:text-white cursor-pointer whitespace-nowrap"
            >
              <AlertOctagon className="w-3.5 h-3.5" />
              <span>STOP NEW TRADES</span>
            </button>
          </div>
        </div>

        {error && (
          <div className="px-3.5 py-2.5 rounded-lg border border-rose-500/40 bg-rose-950/25 text-xs text-rose-400">
            {error}
          </div>
        )}
        {notice && (
          <div className="px-3.5 py-2.5 rounded-lg border border-emerald-500/40 bg-emerald-500/10 text-xs text-emerald-400">
            {notice}
          </div>
        )}

        {/* 3 Modes */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {MODES.map((m) => {
            const Icon = m.icon;
            const active = currentMode === m.id;
            const disabled = busy || (m.id === 'AUTONOMOUS' && !canEnableAutonomous);
            return (
              <div
                key={m.id}
                className={`rounded-xl border p-4 flex flex-col justify-between gap-4 transition-all ${
                  active
                    ? 'border-[#F25F8C]/60 bg-[#F25F8C]/8 dark:bg-[#F25F8C]/10'
                    : 'border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-[#0D1320]'
                }`}
              >
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-white">
                      <Icon className={`w-4 h-4 ${active ? 'text-[#FF7AA5]' : 'text-slate-400'}`} />
                      <span>{m.title}</span>
                    </div>
                    {active && (
                      <span className="text-[11px] font-mono font-semibold text-[#FF7AA5]">FAOL</span>
                    )}
                  </div>
                  <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                    {m.subtitle}
                  </p>
                </div>

                <button
                  type="button"
                  disabled={disabled || active}
                  onClick={() => void setMode(m.id)}
                  className={`w-full py-2 px-3 text-xs font-semibold rounded-lg transition-all whitespace-nowrap ${
                    active
                      ? 'bg-[#F25F8C]/20 text-[#FF7AA5] border border-[#F25F8C]/40 cursor-default'
                      : disabled
                        ? 'bg-slate-800/50 text-slate-500 border border-slate-800 cursor-not-allowed'
                        : 'bg-gradient-to-r from-[#F25F8C] via-[#EB6B7B] to-[#E87769] text-slate-950 hover:brightness-110 cursor-pointer'
                  }`}
                >
                  {active ? 'Joriy Rejim' : `${m.title.split(' ')[0]} rejimini yoqish`}
                </button>
              </div>
            );
          })}
        </div>

        {/* Autonomous Trading Safety Checklist */}
        <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0D1320] p-4 space-y-3 text-xs">
          <div className="font-semibold text-slate-900 dark:text-white">
            Avtonom Savdo Xavfsizlik Shartlari
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 font-mono">
            <div className="flex items-center justify-between sm:block space-y-0.5">
              <span className="font-sans text-slate-500 block">1. Owner autentifikatsiyasi</span>
              <span className={ownerVerified ? 'text-emerald-500 font-semibold' : 'text-amber-500'}>
                {ownerVerified ? 'TASDIQLANGAN' : 'TALAB QILINADI'}
              </span>
            </div>
            <div className="flex items-center justify-between sm:block space-y-0.5">
              <span className="font-sans text-slate-500 block">2. Tasdiqlangan strategiyalar</span>
              <span className={eligibleStrategies.length > 0 ? 'text-emerald-500 font-semibold' : 'text-amber-500'}>
                {eligibleStrategies.length} ta faol
              </span>
            </div>
            <div className="flex items-center justify-between sm:block space-y-0.5">
              <span className="font-sans text-slate-500 block">3. Favqulodda blokirovka</span>
              <span className={!stopNewTrades ? 'text-emerald-500 font-semibold' : 'text-rose-500'}>
                {stopNewTrades ? 'BLOKLANGAN' : 'OCHIQ'}
              </span>
            </div>
            <div className="flex items-center justify-between sm:block space-y-0.5">
              <span className="font-sans text-slate-500 block">4. MT5 Bridge ulanishi</span>
              <span className={mt5Connected ? 'text-emerald-500 font-semibold' : 'text-amber-500'}>
                {mt5Connected ? 'REAL MT5' : 'DEMO (ULANMAGAN)'}
              </span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 pt-1">
            {!ownerVerified && (
              <button
                type="button"
                onClick={onGoToOwnerCenter}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md border border-[#F25F8C]/45 text-[#FF7AA5] hover:bg-[#F25F8C]/15 cursor-pointer"
              >
                <Lock className="w-3.5 h-3.5" />
                <span>Owner tasdig‘idan o‘tish</span>
              </button>
            )}
            {eligibleStrategies.length === 0 && (
              <button
                type="button"
                onClick={onGoToStrategies}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md border border-slate-700 text-slate-200 hover:border-[#F25F8C]/50 cursor-pointer"
              >
                <ShieldCheck className="w-3.5 h-3.5" />
                <span>Strategiya Markazida tasdiqlash</span>
              </button>
            )}
          </div>
        </div>
      </section>

      {/* Eligible Approved Strategies */}
      <section className="rounded-xl border border-slate-200 dark:border-slate-800/90 bg-white dark:bg-[#131B2B] neon-surface overflow-hidden">
        <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
            Avto-Savdoga Ruxsat Etilgan (Owner Tasdiqlagan) Strategiyalar
          </h2>
          <span className="text-xs font-mono tabular-nums text-slate-500">
            {eligibleStrategies.length} / {registry.length}
          </span>
        </div>

        {eligibleStrategies.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-500 dark:text-slate-400">
            Hozircha birorta strategiya Owner tomonidan tasdiqlanib faollashtirilmagan. Avto-savdo xavfsizlik sababli bloklangan.
          </div>
        ) : (
          <div className="divide-y divide-slate-200 dark:divide-slate-800/80 text-xs">
            {eligibleStrategies.map((s) => (
              <div key={s.id} className="px-4 py-3 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="font-semibold text-slate-900 dark:text-white">{s.name}</div>
                  <div className="font-mono text-[11px] text-slate-500">
                    {s.source} · {s.license} · Tasdiqlangan:{' '}
                    {s.ownerApprovedAt ? new Date(s.ownerApprovedAt).toLocaleString('en-GB') : 'Ha'}
                  </div>
                </div>
                <span className="font-mono font-semibold text-emerald-500">FAOL · RUXSAT ETILGAN</span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
};
