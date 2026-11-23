import React from 'react';
import {
  AlertOctagon,
  Lock,
  LogOut,
  Pause,
  Play,
  Power,
  ShieldOff,
} from 'lucide-react';
import { LiveSystemStatusSnapshot } from '../types/trading';
import { formatCurrency } from '../config/initialData';

interface LiveSystemBarProps {
  status: LiveSystemStatusSnapshot | null;
  mt5Connected: boolean;
  mt5Login: string;
  openPositionsCount: number;
  dailyPnlUsd: number;
  currentRiskPct: number;
  currentRiskUsd: number;
  busyAction: string | null;
  onStopNewTrades: () => void;
  onResumeNewTrades: () => void;
  onPauseScanner: () => void;
  onResumeScanner: () => void;
  onDisableAutoTrading: () => void;
  onLockSystem: () => void;
  onLogout: () => void;
  onRequestClosePositions: () => void;
}

function formatUptime(sec: number): string {
  if (!Number.isFinite(sec) || sec <= 0) return '0m';
  const hrs = Math.floor(sec / 3600);
  const mins = Math.floor((sec % 3600) / 60);
  return hrs > 0 ? `${hrs}s ${mins}d` : `${mins}d`;
}

export const LiveSystemBar: React.FC<LiveSystemBarProps> = ({
  status,
  mt5Connected,
  mt5Login,
  openPositionsCount,
  dailyPnlUsd,
  currentRiskPct,
  currentRiskUsd,
  busyAction,
  onStopNewTrades,
  onResumeNewTrades,
  onPauseScanner,
  onResumeScanner,
  onDisableAutoTrading,
  onLockSystem,
  onLogout,
  onRequestClosePositions,
}) => {
  const control = status?.control;
  const strategiesCount = status?.strategiesCount;
  const scannerRunning = control ? control.scannerStatus === 'RUNNING' : false;
  const stopNewTrades = Boolean(control?.stopNewTrades);

  const aiLabel = !status
    ? 'Tekshirilmoqda'
    : status.aiStatus === 'LOCAL_PROXY_READY'
      ? 'Lokal Proksi Tayyor'
      : status.aiStatus === 'GEMINI_READY'
        ? 'AI Tayyor'
        : 'Sozlanmagan';

  const aiColor = !status
    ? 'text-slate-400'
    : status.aiStatus === 'UNCONFIGURED'
      ? 'text-amber-500'
      : 'text-emerald-500';

  const lastAnalysisLabel = control?.lastAnalysisTime
    ? new Date(control.lastAnalysisTime).toLocaleTimeString('en-GB')
    : 'Hali yo‘q';

  const diskLabel =
    status?.disk.freeGb !== null && status?.disk.totalGb !== null && status
      ? `${status.disk.freeGb} / ${status.disk.totalGb} GB`
      : 'Aniqlanmadi';

  const modeLabel =
    control?.autonomousMode === 'AUTONOMOUS'
      ? 'Avtonom Savdo'
      : control?.autonomousMode === 'SIGNAL'
        ? 'Signal Rejimi'
        : 'Kuzatuv';

  return (
    <section className="rounded-xl border border-slate-200 dark:border-violet-500/25 bg-white dark:bg-[#0B1120] tk-glass overflow-hidden">
      {/* Compact Header & Emergency Controls */}
      <div className="p-3.5 sm:p-4 border-b border-slate-200 dark:border-violet-500/15 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs">
          <span className="font-semibold text-slate-900 dark:text-white">
            Jonli Tizim Holati
          </span>
          <span aria-hidden="true" className="text-slate-400">·</span>
          <span className="font-mono text-slate-500 dark:text-slate-400">
            Rejim:{' '}
            <strong
              className={
                control?.autonomousMode === 'AUTONOMOUS'
                  ? 'text-violet-600 dark:text-violet-400'
                  : 'text-slate-900 dark:text-slate-200'
              }
            >
              {modeLabel}
            </strong>
          </span>
          {stopNewTrades && (
            <>
              <span aria-hidden="true" className="text-slate-400">·</span>
              <span className="font-mono font-semibold text-rose-500">
                YANGI SAVDOLAR BLOKLANGAN
              </span>
            </>
          )}
        </div>

        {/* Emergency Control Buttons */}
        <div className="flex flex-wrap items-center gap-1.5">
          {!stopNewTrades ? (
            <button
              type="button"
              disabled={busyAction !== null}
              onClick={onStopNewTrades}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-semibold rounded-md border border-rose-500/50 bg-rose-500/15 text-rose-600 dark:text-rose-300 hover:bg-rose-600 hover:text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50"
            >
              <AlertOctagon className="w-3.5 h-3.5" />
              <span>STOP NEW TRADES</span>
            </button>
          ) : (
            <button
              type="button"
              disabled={busyAction !== null}
              onClick={onResumeNewTrades}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-semibold rounded-md border border-emerald-500/50 bg-emerald-500/15 text-emerald-600 dark:text-emerald-300 hover:bg-emerald-600 hover:text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50"
            >
              <Play className="w-3.5 h-3.5" />
              <span>SAVDONI OCHISH</span>
            </button>
          )}

          <button
            type="button"
            disabled={busyAction !== null || !scannerRunning}
            onClick={onPauseScanner}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-semibold rounded-md border border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-300 hover:bg-amber-500/20 disabled:opacity-40 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Pause className="w-3.5 h-3.5" />
            <span>PAUSE SCANNER</span>
          </button>

          <button
            type="button"
            disabled={busyAction !== null || scannerRunning}
            onClick={onResumeScanner}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-semibold rounded-md border border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-300 hover:bg-emerald-500/20 disabled:opacity-40 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Play className="w-3.5 h-3.5" />
            <span>RESUME SCANNER</span>
          </button>

          <button
            type="button"
            disabled={busyAction !== null}
            onClick={onDisableAutoTrading}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-semibold rounded-md border border-slate-300 dark:border-slate-700 bg-slate-100 dark:bg-[#0D1320] text-slate-700 dark:text-slate-200 hover:border-rose-500/50 hover:text-rose-400 transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50"
          >
            <ShieldOff className="w-3.5 h-3.5" />
            <span>DISABLE AUTO TRADING</span>
          </button>

          <button
            type="button"
            onClick={onRequestClosePositions}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-semibold rounded-md border border-rose-500/35 text-rose-600 dark:text-rose-400 hover:bg-rose-500/15 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Power className="w-3.5 h-3.5" />
            <span>Pozitsiyalarni yopish</span>
          </button>

          <button
            type="button"
            onClick={onLockSystem}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-semibold rounded-md border border-violet-500/40 bg-violet-500/10 text-violet-700 dark:text-violet-300 hover:bg-violet-500/20 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Lock className="w-3.5 h-3.5" />
            <span>LOCK SYSTEM</span>
          </button>

          <button
            type="button"
            onClick={onLogout}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-semibold rounded-md border border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-slate-500 hover:text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>LOGOUT</span>
          </button>
        </div>
      </div>

      {/* 16 Honest Live Telemetry Cells */}
      <div className="grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-8 divide-y sm:divide-y-0 sm:divide-x divide-slate-200/80 dark:divide-slate-800/80 text-xs">
        <div className="p-3 space-y-0.5">
          <div className="text-[11px] text-slate-500 dark:text-slate-400">MT5 ulanish</div>
          <div className={`font-mono font-semibold ${mt5Connected ? 'text-emerald-500' : 'text-amber-500'}`}>
            {mt5Connected ? `Ulangan (#${mt5Login})` : 'Uzilgan (Demo)'}
          </div>
        </div>

        <div className="p-3 space-y-0.5">
          <div className="text-[11px] text-slate-500 dark:text-slate-400">24/7 Skaner</div>
          <div className={`font-mono font-semibold ${scannerRunning ? 'text-emerald-500' : 'text-amber-500'}`}>
            {!status ? 'Tekshirilmoqda' : scannerRunning ? 'Ishlamoqda' : 'Pauzada'}
          </div>
        </div>

        <div className="p-3 space-y-0.5">
          <div className="text-[11px] text-slate-500 dark:text-slate-400">AI holati</div>
          <div className={`font-mono font-semibold ${aiColor}`}>{aiLabel}</div>
        </div>

        <div className="p-3 space-y-0.5">
          <div className="text-[11px] text-slate-500 dark:text-slate-400">Tarixiy baza</div>
          <div className="font-mono tabular-nums font-semibold text-slate-900 dark:text-slate-100">
            {status ? `${status.databaseStatus === 'HEALTHY' ? 'Sog‘lom' : 'Tiklangan'} · ${status.dbSizeKb}KB` : 'Tekshirilmoqda'}
          </div>
        </div>

        <div className="p-3 space-y-0.5">
          <div className="text-[11px] text-slate-500 dark:text-slate-400">Oxirgi tahlil</div>
          <div className="font-mono tabular-nums font-semibold text-slate-900 dark:text-slate-100">
            {lastAnalysisLabel}
          </div>
        </div>

        <div className="p-3 space-y-0.5">
          <div className="text-[11px] text-slate-500 dark:text-slate-400">Instrumentlar</div>
          <div className="font-mono tabular-nums font-semibold text-slate-900 dark:text-slate-100">
            {control?.instrumentsScanned ?? 0} ta skaner
          </div>
        </div>

        <div className="p-3 space-y-0.5">
          <div className="text-[11px] text-slate-500 dark:text-slate-400">Strategiyalar (Jami/Tasdiq)</div>
          <div className="font-mono tabular-nums font-semibold text-slate-900 dark:text-slate-100">
            {strategiesCount ? `${strategiesCount.total} / ${strategiesCount.approved}` : '0 / 0'}
          </div>
        </div>

        <div className="p-3 space-y-0.5">
          <div className="text-[11px] text-slate-500 dark:text-slate-400">Faol / Kutilmoqda</div>
          <div className="font-mono tabular-nums font-semibold text-sky-600 dark:text-sky-400">
            {strategiesCount ? `${strategiesCount.active} / ${strategiesCount.pending}` : '0 / 0'}
          </div>
        </div>
      </div>

      <div className="border-t border-slate-200/80 dark:border-slate-800/80 grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-6 divide-y sm:divide-y-0 sm:divide-x divide-slate-200/80 dark:divide-slate-800/80 text-xs">
        <div className="p-3 space-y-0.5">
          <div className="text-[11px] text-slate-500 dark:text-slate-400">Ochiq pozitsiyalar</div>
          <div className="font-mono tabular-nums font-semibold text-slate-900 dark:text-slate-100">
            {openPositionsCount} ta
          </div>
        </div>

        <div className="p-3 space-y-0.5">
          <div className="text-[11px] text-slate-500 dark:text-slate-400">Kunlik P/L</div>
          <div
            className={`font-mono tabular-nums font-semibold ${
              dailyPnlUsd >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'
            }`}
          >
            {dailyPnlUsd >= 0 ? '+' : ''}
            {formatCurrency(dailyPnlUsd)}
          </div>
        </div>

        <div className="p-3 space-y-0.5">
          <div className="text-[11px] text-slate-500 dark:text-slate-400">Joriy risk</div>
          <div className="font-mono tabular-nums font-semibold text-slate-900 dark:text-slate-100">
            {currentRiskPct.toFixed(1)}% (${currentRiskUsd.toFixed(0)})
          </div>
        </div>

        <div className="p-3 space-y-0.5">
          <div className="text-[11px] text-slate-500 dark:text-slate-400">VPS / Server</div>
          <div className={`font-mono tabular-nums font-semibold ${status?.serverOnline ? 'text-emerald-500' : 'text-rose-500'}`}>
            {status?.serverOnline ? `Faol · ${formatUptime(status.serverUptimeSec)}` : 'Uzilgan'}
          </div>
        </div>

        <div className="p-3 space-y-0.5">
          <div className="text-[11px] text-slate-500 dark:text-slate-400">RAM / Jarayon</div>
          <div className="font-mono tabular-nums font-semibold text-slate-900 dark:text-slate-100">
            {status ? `${status.memory.usedPct}% · RSS ${status.memory.processRssMb}MB` : '—'}
          </div>
        </div>

        <div className="p-3 space-y-0.5">
          <div className="text-[11px] text-slate-500 dark:text-slate-400">Disk maydoni</div>
          <div className="font-mono tabular-nums font-semibold text-slate-900 dark:text-slate-100">
            {diskLabel}
          </div>
        </div>
      </div>
    </section>
  );
};
