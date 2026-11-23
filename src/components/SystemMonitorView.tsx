import React from 'react';
import { Activity, Cpu, Database, HardDrive, RefreshCw, Server, Wifi } from 'lucide-react';
import { LiveSystemStatusSnapshot, ViewId } from '../types/trading';
import { LiveSystemBar } from './LiveSystemBar';

interface SystemMonitorViewProps {
  status: LiveSystemStatusSnapshot | null;
  mt5Connected: boolean;
  mt5Login: string;
  mt5Server: string;
  openPositionsCount: number;
  dailyPnlUsd: number;
  currentRiskPct: number;
  currentRiskUsd: number;
  busyAction: string | null;
  onRefresh: () => void;
  onStopNewTrades: () => void;
  onResumeNewTrades: () => void;
  onPauseScanner: () => void;
  onResumeScanner: () => void;
  onDisableAutoTrading: () => void;
  onLockSystem: () => void;
  onLogout: () => void;
  onRequestClosePositions: () => void;
  onNavigate: (view: ViewId) => void;
}

export const SystemMonitorView: React.FC<SystemMonitorViewProps> = ({
  status,
  mt5Connected,
  mt5Login,
  mt5Server,
  openPositionsCount,
  dailyPnlUsd,
  currentRiskPct,
  currentRiskUsd,
  busyAction,
  onRefresh,
  onStopNewTrades,
  onResumeNewTrades,
  onPauseScanner,
  onResumeScanner,
  onDisableAutoTrading,
  onLockSystem,
  onLogout,
  onRequestClosePositions,
  onNavigate,
}) => {
  const memPct = status?.memory.usedPct ?? 0;
  const diskUsedPct =
    status?.disk.totalGb && status.disk.freeGb !== null && status.disk.totalGb > 0
      ? Math.round(((status.disk.totalGb - status.disk.freeGb) / status.disk.totalGb) * 100)
      : 0;

  const services = [
    {
      name: 'MetaTrader 5 Terminal / Bridge',
      status: mt5Connected ? `Ulangan (#${mt5Login} · ${mt5Server})` : 'Uzilgan (Lokal Demo rejim)',
      ok: mt5Connected,
      icon: Wifi,
      actionLabel: 'Bridge sozlash',
      target: 'settings' as ViewId,
    },
    {
      name: 'Backend Express Server (VPS)',
      status: status?.serverOnline
        ? `Faol · Uptime ${Math.floor((status.serverUptimeSec || 0) / 60)} daq`
        : 'Tekshirilmoqda / Uzilgan',
      ok: Boolean(status?.serverOnline),
      icon: Server,
      actionLabel: 'Tarixiy baza',
      target: 'memory' as ViewId,
    },
    {
      name: 'AI Analitik Engine',
      status: !status
        ? 'Tekshirilmoqda'
        : status.aiStatus === 'LOCAL_PROXY_READY'
          ? 'Lokal Proksi Tayyor'
          : status.aiStatus === 'GEMINI_READY'
            ? 'AI API Tayyor'
            : 'API Kalit Sozlanmagan',
      ok: Boolean(status && status.aiStatus !== 'UNCONFIGURED'),
      icon: Cpu,
      actionLabel: 'AI Analitik',
      target: 'analyst' as ViewId,
    },
    {
      name: '24/7 Market Scanner',
      status:
        status?.control.scannerStatus === 'RUNNING'
          ? `Ishlamoqda · ${status.control.instrumentsScanned} ta instrument`
          : 'Pauzada',
      ok: status?.control.scannerStatus === 'RUNNING',
      icon: Activity,
      actionLabel: 'Skaner',
      target: 'scanner' as ViewId,
    },
    {
      name: 'Tarixiy Xotira Bazasi',
      status: status
        ? `${status.databaseStatus === 'HEALTHY' ? 'Sog‘lom' : 'Tiklangan'} · ${status.dbSizeKb} KB`
        : 'Tekshirilmoqda',
      ok: status?.databaseStatus === 'HEALTHY',
      icon: Database,
      actionLabel: 'Backup / Restore',
      target: 'memory' as ViewId,
    },
    {
      name: 'Server Disk Maydoni',
      status:
        status?.disk.freeGb !== null && status?.disk.totalGb !== null && status
          ? `Bo‘sh: ${status.disk.freeGb} GB / Jami: ${status.disk.totalGb} GB`
          : 'Aniqlanmadi',
      ok: status?.disk.freeGb !== null ? (status?.disk.freeGb ?? 0) > 1 : true,
      icon: HardDrive,
      actionLabel: 'Sozlamalar',
      target: 'settings' as ViewId,
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-lg font-bold text-slate-900 dark:text-white">
            Tizim Monitori & Favqulodda Boshqaruv
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Barcha real backend xizmatlari, xotira sarfi, disk holati va xavfsizlik tugmalari.
          </p>
        </div>
        <button
          type="button"
          onClick={onRefresh}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-sky-500/40 bg-sky-500/10 text-sky-600 dark:text-sky-300 hover:bg-sky-500/20 cursor-pointer"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          <span>Holatni yangilash</span>
        </button>
      </div>

      <LiveSystemBar
        status={status}
        mt5Connected={mt5Connected}
        mt5Login={mt5Login}
        openPositionsCount={openPositionsCount}
        dailyPnlUsd={dailyPnlUsd}
        currentRiskPct={currentRiskPct}
        currentRiskUsd={currentRiskUsd}
        busyAction={busyAction}
        onStopNewTrades={onStopNewTrades}
        onResumeNewTrades={onResumeNewTrades}
        onPauseScanner={onPauseScanner}
        onResumeScanner={onResumeScanner}
        onDisableAutoTrading={onDisableAutoTrading}
        onLockSystem={onLockSystem}
        onLogout={onLogout}
        onRequestClosePositions={onRequestClosePositions}
      />

      {/* Real Resource Gauges */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <section className="rounded-xl border border-slate-200 dark:border-sky-500/25 bg-white dark:bg-[#0B1120] tk-glass-blue p-4 space-y-2.5 text-xs">
          <div className="flex items-center justify-between">
            <span className="font-semibold text-slate-900 dark:text-white">RAM Xotira Sarfi (Real OS)</span>
            <span className="font-mono tabular-nums font-bold text-sky-600 dark:text-sky-400">
              {memPct}% · RSS {status?.memory.processRssMb ?? 0} MB
            </span>
          </div>
          <div className="h-2.5 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
            <div
              className={`h-full rounded-full ${
                memPct > 85 ? 'bg-rose-500' : 'bg-gradient-to-r from-violet-500 to-sky-400'
              }`}
              style={{ width: `${Math.min(100, Math.max(4, memPct))}%` }}
            />
          </div>
          <div className="font-mono text-[11px] text-slate-500">
            Ishlatilgan: {status?.memory.usedMb ?? 0} MB / Jami: {status?.memory.totalMb ?? 0} MB
          </div>
        </section>

        <section className="rounded-xl border border-slate-200 dark:border-violet-500/25 bg-white dark:bg-[#0B1120] tk-glass p-4 space-y-2.5 text-xs">
          <div className="flex items-center justify-between">
            <span className="font-semibold text-slate-900 dark:text-white">Disk Maydoni Bandligi</span>
            <span className="font-mono tabular-nums font-bold text-violet-600 dark:text-violet-400">
              {diskUsedPct}% · DB {status?.dbSizeKb ?? 0} KB
            </span>
          </div>
          <div className="h-2.5 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
            <div
              className={`h-full rounded-full ${
                diskUsedPct > 85 ? 'bg-rose-500' : 'bg-gradient-to-r from-sky-400 to-[#00E5A0]'
              }`}
              style={{ width: `${Math.min(100, Math.max(4, diskUsedPct))}%` }}
            />
          </div>
          <div className="font-mono text-[11px] text-slate-500">
            Bo‘sh joy: {status?.disk.freeGb ?? '—'} GB / Jami: {status?.disk.totalGb ?? '—'} GB
          </div>
        </section>
      </div>

      {/* Component Health Matrix */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
        {services.map((svc) => {
          const Icon = svc.icon;
          return (
            <div
              key={svc.name}
              className="rounded-xl border border-slate-200 dark:border-violet-500/20 bg-white dark:bg-[#0B1120] tk-glass p-4 flex flex-col justify-between gap-3 text-xs"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Icon className="w-4 h-4 text-sky-500 dark:text-sky-400 shrink-0" />
                  <span className="font-semibold text-slate-900 dark:text-white">{svc.name}</span>
                </div>
                <span
                  className={`font-mono text-[10.5px] font-bold ${
                    svc.ok ? 'text-emerald-600 dark:text-[#00E5A0]' : 'text-amber-500'
                  }`}
                >
                  {svc.ok ? 'OK' : 'E’TIBOR'}
                </span>
              </div>
              <div className="font-mono text-[11px] text-slate-600 dark:text-slate-300">
                {svc.status}
              </div>
              <button
                type="button"
                onClick={() => onNavigate(svc.target)}
                className="self-start text-[11px] text-violet-600 dark:text-violet-400 hover:underline font-medium cursor-pointer"
              >
                {svc.actionLabel} →
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
};
