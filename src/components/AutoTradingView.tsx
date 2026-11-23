import React, { useEffect, useState } from 'react';
import {
  AlertOctagon,
  Bot,
  CheckCheck,
  Eye,
  Lock,
  Radio,
  ShieldCheck,
  ShieldOff,
  SlidersHorizontal,
} from 'lucide-react';
import {
  AutonomousMode,
  ControlStateRecord,
  LiveSystemStatusSnapshot,
  StrategyRegistryRecord,
  ViewId,
} from '../types/trading';
import { apiJson } from '../utils/apiClient';
import { AutonomousDiagnosticsPanel } from './AutonomousDiagnosticsPanel';

interface AutoTradingViewProps {
  control: ControlStateRecord | null;
  systemStatus: LiveSystemStatusSnapshot | null;
  registry: StrategyRegistryRecord[];
  ownerVerified: boolean;
  mt5Connected: boolean;
  mt5AccountMode?: string;
  aiBusy: boolean;
  lastAiBriefUz: string | null;
  lastAiProvider: string | null;
  lastAiError: string | null;
  onRunFullAiCycle: () => void;
  onSelectSymbol?: (symbol: string) => void;
  onControlUpdated: () => void;
  onGoToOwnerCenter: () => void;
  onGoToStrategies: () => void;
  onNavigate?: (view: ViewId) => void;
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
    subtitle: 'Tasdiqlangan strategiyalar + AI LLM ongi birgalikda order ochadi va foyda/zararga qarab SL/TP, Break-Even va Trailing Stop boshqaradi.',
    icon: Bot,
  },
];

export const AutoTradingView: React.FC<AutoTradingViewProps> = ({
  control,
  systemStatus,
  registry,
  ownerVerified,
  mt5Connected,
  mt5AccountMode = 'DEMO',
  aiBusy,
  lastAiBriefUz,
  lastAiProvider,
  lastAiError,
  onRunFullAiCycle,
  onSelectSymbol,
  onControlUpdated,
  onGoToOwnerCenter,
  onGoToStrategies,
  onNavigate,
}) => {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [maxOpenOrders, setMaxOpenOrders] = useState<number>(control?.maxOpenOrders ?? 20);
  const [maxPortfolioRiskPct, setMaxPortfolioRiskPct] = useState<number>(
    control?.maxPortfolioRiskPct ?? 5.0
  );
  const [aiAutoSlTpEnabled, setAiAutoSlTpEnabled] = useState<boolean>(
    control?.aiAutoSlTpEnabled ?? true
  );
  const [allowRealAccountTrading, setAllowRealAccountTrading] = useState<boolean>(
    control?.allowRealAccountTrading ?? false
  );

  useEffect(() => {
    if (!control) return;
    setMaxOpenOrders(control.maxOpenOrders ?? 20);
    setMaxPortfolioRiskPct(control.maxPortfolioRiskPct ?? 5.0);
    setAiAutoSlTpEnabled(control.aiAutoSlTpEnabled ?? true);
    setAllowRealAccountTrading(Boolean(control.allowRealAccountTrading));
  }, [control]);

  const currentMode: AutonomousMode = control?.autonomousMode ?? 'OBSERVATION';
  const stopNewTrades = Boolean(control?.stopNewTrades);
  const eligibleStrategies = registry.filter((s) => s.ownerApproved && s.active);
  const readyToApproveCount = registry.filter(
    (s) =>
      s.codeReviewStatus === 'PASSED' &&
      s.backtestStatus === 'PASSED' &&
      s.demoTestStatus === 'PASSED' &&
      (!s.ownerApproved || !s.active)
  ).length;

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

  const saveEngineSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await apiJson('/api/engine/settings', {
        method: 'POST',
        body: JSON.stringify({
          maxOpenOrders,
          maxPortfolioRiskPct,
          aiAutoSlTpEnabled,
          allowRealAccountTrading,
        }),
      });
      setNotice('Avtonom Multi-Order va AI SL/TP sozlamalari saqlandi.');
      onControlUpdated();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sozlamalarni saqlashda xatolik.');
    } finally {
      setBusy(false);
    }
  };

  const handleApproveReadyStrategies = async () => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const res = await apiJson<{ ok: boolean; approvedCount: number }>(
        '/api/registry/strategies/approve-ready',
        { method: 'POST', body: JSON.stringify({}) }
      );
      setNotice(
        res.approvedCount > 0
          ? `${res.approvedCount} ta tayyor (PASSED) strategiya Owner tomonidan tasdiqlandi va faollashtirildi.`
          : 'Barcha tayyor strategiyalar allaqachon tasdiqlangan.'
      );
      onControlUpdated();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Strategiyalarni tasdiqlashda xatolik.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-slate-200 dark:border-violet-500/30 bg-white dark:bg-[#0B1120] tk-glass p-5 space-y-5">
        <div className="flex flex-wrap items-start justify-between gap-4 pb-4 border-b border-slate-200 dark:border-violet-500/20">
          <div className="space-y-1">
            <h1 className="font-display text-lg font-bold text-slate-900 dark:text-white">
              24/7 Avtonom AI Savdo va Dinamik SL/TP Boshqaruvi
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400 max-w-2xl">
              AUTONOMOUS rejimida AI ham tasdiqlangan strategiyalar ansamblini, ham siz sozlagan AI API ongini ishga soladi: parallel multi-order ochadi va foyda/zararga qarab SL/TP, Break-Even, Trailing Stop hamda chiqishlarni avtomatik boshqaradi.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => void quickControl('DISABLE_AUTO_TRADING')}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-slate-300 dark:border-violet-500/30 text-slate-700 dark:text-slate-200 hover:border-rose-500/50 hover:text-rose-400 cursor-pointer whitespace-nowrap"
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
                    ? 'border-violet-500/60 bg-violet-500/10 dark:bg-violet-500/15'
                    : 'border-slate-200 dark:border-violet-500/20 bg-slate-50/70 dark:bg-[#080D1B]'
                }`}
              >
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-white">
                      <Icon className={`w-4 h-4 ${active ? 'text-sky-400' : 'text-slate-400'}`} />
                      <span>{m.title}</span>
                    </div>
                    {active && (
                      <span className="text-[11px] font-mono font-semibold text-emerald-500 dark:text-[#00E5A0]">
                        FAOL
                      </span>
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
                      ? 'bg-violet-500/20 text-sky-300 border border-violet-500/40 cursor-default'
                      : disabled
                        ? 'bg-slate-800/50 text-slate-500 border border-slate-800 cursor-not-allowed'
                        : 'bg-gradient-to-r from-violet-600 to-sky-500 text-white hover:brightness-110 cursor-pointer'
                  }`}
                >
                  {active ? 'Joriy Rejim' : `${m.title.split(' ')[0]} rejimini yoqish`}
                </button>
              </div>
            );
          })}
        </div>

        {/* Autonomous Trading Safety Checklist */}
        <div className="rounded-lg border border-slate-200 dark:border-violet-500/20 bg-slate-50 dark:bg-[#080D1B] p-4 space-y-3 text-xs">
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
              <span className="font-sans text-slate-500 block">4. MT5 Hisob & Bridge</span>
              <span className={mt5Connected ? 'text-emerald-500 font-semibold' : 'text-amber-500'}>
                {mt5Connected ? `MT5 (${mt5AccountMode})` : 'DEMO SIMULYATSIYA'}
              </span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 pt-1">
            {!ownerVerified && (
              <button
                type="button"
                onClick={onGoToOwnerCenter}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md border border-violet-500/45 text-violet-600 dark:text-sky-300 hover:bg-violet-500/15 cursor-pointer"
              >
                <Lock className="w-3.5 h-3.5" />
                <span>Owner tasdig‘idan o‘tish</span>
              </button>
            )}
            {ownerVerified && readyToApproveCount > 0 && (
              <button
                type="button"
                disabled={busy}
                onClick={() => void handleApproveReadyStrategies()}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md bg-emerald-600 hover:bg-emerald-500 text-white cursor-pointer"
              >
                <CheckCheck className="w-3.5 h-3.5" />
                <span>{readyToApproveCount} ta tayyor strategiyani 1 klikda tasdiqlash</span>
              </button>
            )}
            {eligibleStrategies.length === 0 && (
              <button
                type="button"
                onClick={onGoToStrategies}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md border border-slate-700 text-slate-200 hover:border-sky-400 cursor-pointer"
              >
                <ShieldCheck className="w-3.5 h-3.5" />
                <span>Strategiya Markazida boshqarish</span>
              </button>
            )}
          </div>
        </div>

        {/* Owner Multi-Order & AI Dynamic SL/TP Settings */}
        <form
          onSubmit={saveEngineSettings}
          className="rounded-lg border border-slate-200 dark:border-violet-500/25 bg-slate-50 dark:bg-[#080D1B] p-4 space-y-3"
        >
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-900 dark:text-white">
              <SlidersHorizontal className="w-3.5 h-3.5 text-sky-400" />
              <span>Multi-Order (10/20/50+) va AI Dinamik SL/TP Sozlamalari (Owner)</span>
            </div>
            {!ownerVerified && (
              <span className="text-[11px] font-mono text-amber-500">Saqlash uchun Owner kirishi kerak</span>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
            <div>
              <label className="block text-[11px] text-slate-500 mb-1">
                Maksimal ochiq orderlar (1–100)
              </label>
              <div className="flex items-center gap-1.5">
                <input
                  type="number"
                  min={1}
                  max={100}
                  value={maxOpenOrders}
                  onChange={(e) => setMaxOpenOrders(Number(e.target.value))}
                  className="w-20 px-2.5 py-1.5 font-mono rounded-md border border-slate-300 dark:border-violet-500/30 bg-white dark:bg-[#0B1120] text-slate-900 dark:text-white"
                />
                {[10, 20, 50].map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => setMaxOpenOrders(preset)}
                    className={`px-2 py-1.5 font-mono text-[11px] rounded border cursor-pointer ${
                      maxOpenOrders === preset
                        ? 'border-sky-400 bg-sky-500/15 text-sky-300'
                        : 'border-slate-300 dark:border-violet-500/20 text-slate-400'
                    }`}
                  >
                    {preset}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-[11px] text-slate-500 mb-1">
                Maksimal portfolio risk (%)
              </label>
              <input
                type="number"
                min={0.5}
                max={25}
                step={0.5}
                value={maxPortfolioRiskPct}
                onChange={(e) => setMaxPortfolioRiskPct(Number(e.target.value))}
                className="w-full px-2.5 py-1.5 font-mono rounded-md border border-slate-300 dark:border-violet-500/30 bg-white dark:bg-[#0B1120] text-slate-900 dark:text-white"
              />
            </div>

            <label className="flex items-center justify-between gap-2 rounded-md border border-slate-200 dark:border-violet-500/20 bg-white dark:bg-[#0B1120] px-3 py-2 cursor-pointer">
              <div>
                <div className="font-semibold text-slate-900 dark:text-white">AI Avto SL/TP</div>
                <div className="text-[10.5px] text-slate-500">Foyda/zararga qarab SL/TP, BE, Trailing</div>
              </div>
              <input
                type="checkbox"
                checked={aiAutoSlTpEnabled}
                onChange={(e) => setAiAutoSlTpEnabled(e.target.checked)}
                className="accent-violet-500 w-4 h-4"
              />
            </label>

            <label className="flex items-center justify-between gap-2 rounded-md border border-slate-200 dark:border-violet-500/20 bg-white dark:bg-[#0B1120] px-3 py-2 cursor-pointer">
              <div>
                <div className="font-semibold text-slate-900 dark:text-white">Real MT5 ruxsati</div>
                <div className="text-[10.5px] text-slate-500">Faqat REAL hisob uchun qulf</div>
              </div>
              <input
                type="checkbox"
                checked={allowRealAccountTrading}
                onChange={(e) => setAllowRealAccountTrading(e.target.checked)}
                className="accent-rose-500 w-4 h-4"
              />
            </label>
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={busy || !ownerVerified}
              className="px-4 py-1.5 text-xs font-semibold rounded-lg bg-gradient-to-r from-violet-600 to-sky-500 text-white hover:brightness-110 disabled:opacity-40 cursor-pointer"
            >
              Sozlamalarni Saqlash
            </button>
          </div>
        </form>
      </section>

      {/* Full Real Backend Diagnostics, Per-Symbol Reports, 10-Order Test & Execution Log */}
      <AutonomousDiagnosticsPanel
        status={systemStatus}
        aiBusy={aiBusy}
        lastAiBriefUz={lastAiBriefUz}
        lastAiProvider={lastAiProvider}
        lastAiError={lastAiError}
        onRunFullAiCycle={onRunFullAiCycle}
        onSelectSymbol={onSelectSymbol}
        onNavigate={onNavigate}
        compact={false}
      />

      {/* Eligible Approved Strategies */}
      <section className="rounded-xl border border-slate-200 dark:border-violet-500/25 bg-white dark:bg-[#0B1120] tk-glass overflow-hidden">
        <div className="p-4 border-b border-slate-200 dark:border-violet-500/20 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
            Avto-Savdoga Ruxsat Etilgan (Owner Tasdiqlagan) Strategiyalar
          </h2>
          <span className="text-xs font-mono tabular-nums text-sky-400">
            {eligibleStrategies.length} / {registry.length}
          </span>
        </div>

        {eligibleStrategies.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-500 dark:text-slate-400">
            Hozircha birorta strategiya Owner tomonidan tasdiqlanib faollashtirilmagan. Avto-savdo xavfsizlik sababli bloklangan.
          </div>
        ) : (
          <div className="divide-y divide-slate-200 dark:divide-violet-500/15 text-xs">
            {eligibleStrategies.map((s) => (
              <div key={s.id} className="px-4 py-3 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="font-semibold text-slate-900 dark:text-white">{s.name}</div>
                  <div className="font-mono text-[11px] text-slate-500">
                    {s.source} · {s.license} · Tasdiqlangan:{' '}
                    {s.ownerApprovedAt ? new Date(s.ownerApprovedAt).toLocaleString('en-GB') : 'Ha'}
                  </div>
                </div>
                <span className="font-mono font-semibold text-emerald-500 dark:text-[#00E5A0]">
                  FAOL · RUXSAT ETILGAN
                </span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
};
