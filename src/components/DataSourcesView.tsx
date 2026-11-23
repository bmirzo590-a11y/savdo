import React, { useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Database,
  DownloadCloud,
  Eye,
  Plug,
  RefreshCw,
  Search,
  Server,
  ShieldAlert,
  WifiOff,
} from 'lucide-react';
import {
  MarketPair,
  Mt5ConnectionStatus,
  Mt5DataSourceRow,
  Mt5DataSourcesSnapshot,
  Position,
  RiskGuardSettings,
  ServerConfig,
  StrategyConfig,
  Timeframe,
} from '../types/trading';
import { apiJson } from '../utils/apiClient';
import { ServerBridgeView } from './ServerBridgeView';

interface DataSourcesViewProps {
  dataSources: Mt5DataSourcesSnapshot | null;
  serverConfig: ServerConfig;
  onUpdateServerConfig: (cfg: ServerConfig) => void;
  pairs: MarketPair[];
  positions: Position[];
  strategies: StrategyConfig[];
  riskGuard: RiskGuardSettings;
  onSyncFromServer: (data: Record<string, unknown>) => void;
  onRefreshUnified: () => Promise<void>;
  refreshing: boolean;
}

const ALL_TFS: Timeframe[] = ['M1', 'M5', 'M15', 'M30', 'H1', 'H4', 'D1', 'W1'];

function formatQuotePrice(val: number | null, digits: number): string {
  if (val === null || !Number.isFinite(val)) return '—';
  const safeDigits = Math.max(0, Math.min(6, digits || 5));
  return val.toLocaleString('en-US', {
    minimumFractionDigits: safeDigits,
    maximumFractionDigits: safeDigits,
  });
}

function formatTickTime(iso: string | null): string {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '—';
    return d.toLocaleTimeString('uz-UZ', { hour12: false });
  } catch {
    return '—';
  }
}

function formatDataAge(ageSec: number | null): string {
  if (ageSec === null || !Number.isFinite(ageSec)) return '—';
  if (ageSec < 60) return `${ageSec}s`;
  const mins = Math.floor(ageSec / 60);
  const rem = ageSec % 60;
  if (mins < 60) return `${mins}m ${rem}s`;
  const hrs = Math.floor(mins / 60);
  return `${hrs}h ${mins % 60}m`;
}

function statusBadgeClass(status: Mt5ConnectionStatus): string {
  switch (status) {
    case 'LIVE':
      return 'border-emerald-500/40 bg-emerald-500/15 text-emerald-600 dark:text-[#00E5A0]';
    case 'DELAYED':
      return 'border-amber-500/40 bg-amber-500/15 text-amber-600 dark:text-amber-300';
    case 'STALE':
      return 'border-orange-500/40 bg-orange-500/15 text-orange-600 dark:text-orange-300';
    case 'DISCONNECTED':
      return 'border-rose-500/40 bg-rose-500/15 text-rose-600 dark:text-rose-400';
    default:
      return 'border-slate-400/30 bg-slate-500/10 text-slate-600 dark:text-slate-400';
  }
}

export const DataSourcesView: React.FC<DataSourcesViewProps> = ({
  dataSources,
  serverConfig,
  onUpdateServerConfig,
  pairs,
  positions,
  strategies,
  riskGuard,
  onSyncFromServer,
  onRefreshUnified,
  refreshing,
}) => {
  const conn = dataSources?.connection;
  const rows = dataSources?.rows ?? [];
  const summary = dataSources?.summary;

  const [bridgeUrlInput, setBridgeUrlInput] = useState<string>(
    conn?.bridgeUrl || serverConfig.apiBaseUrl || 'http://127.0.0.1:8000'
  );
  const [historyYears, setHistoryYears] = useState<number>(conn?.historyTargetYears ?? 2.5);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [assetFilter, setAssetFilter] = useState<string>('ALL');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [visibleOnly, setVisibleOnly] = useState<boolean>(false);
  const [expandedSymbol, setExpandedSymbol] = useState<string | null>(null);

  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const filteredRows = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return rows.filter((row) => {
      if (visibleOnly && !row.visible) return false;
      if (assetFilter !== 'ALL' && row.assetClass !== assetFilter) return false;
      if (statusFilter !== 'ALL' && row.connectionStatus !== statusFilter) return false;
      if (q) {
        const hay = `${row.brokerSymbol} ${row.instrument} ${row.description} ${row.assetClass}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [rows, searchQuery, assetFilter, statusFilter, visibleOnly]);

  const handleSaveBridgeConfig = async () => {
    setBusyAction('config');
    setFeedback(null);
    try {
      const res = await apiJson<{
        ok: boolean;
        sync?: { connected: boolean; symbolsCount: number; error: string | null };
        error?: string;
      }>('/api/mt5/config', {
        method: 'POST',
        body: JSON.stringify({
          bridgeUrl: bridgeUrlInput.trim(),
          autoSync: true,
          historyTargetYears: historyYears,
        }),
      });
      onUpdateServerConfig({
        ...serverConfig,
        apiBaseUrl: bridgeUrlInput.trim().replace(/\/$/, ''),
      });
      await onRefreshUnified();
      if (res.sync?.connected) {
        setFeedback({
          type: 'ok',
          text: `MT5 Bridge ulandi: ${res.sync.symbolsCount} ta broker instrumenti aniqlandi.`,
        });
      } else {
        setFeedback({
          type: 'err',
          text: `Manzil saqlandi, lekin MT5 Bridge javob bermadi: ${res.sync?.error || 'DISCONNECTED'}`,
        });
      }
    } catch (err) {
      setFeedback({
        type: 'err',
        text: err instanceof Error ? err.message : 'MT5 Bridge sozlamasini saqlashda xatolik.',
      });
    } finally {
      setBusyAction(null);
    }
  };

  const handleForceSync = async () => {
    setBusyAction('sync');
    setFeedback(null);
    try {
      const res = await apiJson<{
        ok: boolean;
        sync?: { connected: boolean; symbolsCount: number; ticksCount: number; positionsCount: number; error: string | null };
      }>('/api/mt5/sync', { method: 'POST', body: JSON.stringify({}) });
      await onRefreshUnified();
      if (res.sync?.connected) {
        setFeedback({
          type: 'ok',
          text: `MT5 jonli sinxronlandi: ${res.sync.symbolsCount} symbol · ${res.sync.ticksCount} tick · ${res.sync.positionsCount} ochiq pozitsiya.`,
        });
      } else {
        setFeedback({
          type: 'err',
          text: res.sync?.error || 'MT5 Bridge ulanmagan (DISCONNECTED).',
        });
      }
    } catch (err) {
      setFeedback({
        type: 'err',
        text: err instanceof Error ? err.message : 'MT5 sinxronizatsiya xatosi.',
      });
    } finally {
      setBusyAction(null);
    }
  };

  const handleSyncSymbolHistory = async (row: Mt5DataSourceRow) => {
    setBusyAction(`hist:${row.brokerSymbol}`);
    setFeedback(null);
    try {
      const res = await apiJson<{
        ok: boolean;
        brokerSymbol: string;
        results: Array<{ timeframe: Timeframe; fetchedBars: number; storedTotalBars: number; ok: boolean }>;
        error?: string;
      }>('/api/mt5/history/sync', {
        method: 'POST',
        body: JSON.stringify({
          symbol: row.brokerSymbol,
          timeframes: ALL_TFS,
          years: historyYears,
        }),
      });
      await onRefreshUnified();
      const totalLoaded = (res.results || []).reduce(
        (acc: number, r: { storedTotalBars: number }) => acc + r.storedTotalBars,
        0
      );
      const tfsLoaded = (res.results || []).filter(
        (r: { storedTotalBars: number }) => r.storedTotalBars > 0
      ).length;
      if (res.ok) {
        setFeedback({
          type: 'ok',
          text: `${row.brokerSymbol}: ${tfsLoaded}/8 timeframe bo‘yicha jami ${totalLoaded.toLocaleString()} ta haqiqiy MT5 sham saqlandi.`,
        });
      } else {
        setFeedback({
          type: 'err',
          text: res.error || `${row.brokerSymbol} tarixiy shamlari yuklanmadi.`,
        });
      }
    } catch (err) {
      setFeedback({
        type: 'err',
        text: err instanceof Error ? err.message : 'MT5 tarix yuklash xatosi.',
      });
    } finally {
      setBusyAction(null);
    }
  };

  const handleSelectMarketWatch = async (row: Mt5DataSourceRow) => {
    setBusyAction(`sel:${row.brokerSymbol}`);
    setFeedback(null);
    try {
      await apiJson('/api/mt5/symbols/select', {
        method: 'POST',
        body: JSON.stringify({ symbol: row.brokerSymbol, enable: true }),
      });
      await onRefreshUnified();
      setFeedback({
        type: 'ok',
        text: `${row.brokerSymbol} MT5 Market Watch ro‘yxatiga qo‘shildi.`,
      });
    } catch (err) {
      setFeedback({
        type: 'err',
        text: err instanceof Error ? err.message : 'Market Watch ga qo‘shishda xatolik.',
      });
    } finally {
      setBusyAction(null);
    }
  };

  return (
    <div className="space-y-4">
      {/* MT5-ONLY HEADER & CONNECTION BAR */}
      <section className="rounded-xl border border-slate-200 dark:border-violet-500/25 bg-white dark:bg-[#0B1120] tk-glass p-4 space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-3 pb-3 border-b border-slate-200 dark:border-violet-500/15">
          <div>
            <h1 className="text-base font-semibold text-slate-900 dark:text-white flex items-center gap-2">
              <Database className="w-4 h-4 text-sky-400" />
              <span>Data Sources — Faqat MetaTrader 5 Broker Serveri</span>
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Barcha tashqi market-data API’lar (Binance, Kraken, Yahoo Finance) butunlay o‘chirilgan. Yagona manba — MetaTrader 5 broker serveri.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border text-[11px] font-semibold font-mono ${
                conn?.connected
                  ? 'border-emerald-500/40 bg-emerald-500/15 text-emerald-600 dark:text-[#00E5A0]'
                  : 'border-rose-500/40 bg-rose-500/15 text-rose-600 dark:text-rose-400'
              }`}
            >
              {conn?.connected ? <CheckCircle2 className="w-3.5 h-3.5" /> : <WifiOff className="w-3.5 h-3.5" />}
              <span>{conn?.connected ? 'MT5 CONNECTED' : 'MT5 DISCONNECTED'}</span>
            </span>
            <button
              type="button"
              onClick={() => void handleForceSync()}
              disabled={busyAction === 'sync' || refreshing}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-sky-500/40 bg-sky-500/10 text-sky-600 dark:text-sky-300 hover:bg-sky-500/20 disabled:opacity-50 cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${busyAction === 'sync' || refreshing ? 'animate-spin' : ''}`} />
              <span>MT5 Sinxronlash</span>
            </button>
          </div>
        </div>

        {/* DISCONNECT SAFETY BANNER */}
        {!conn?.connected && (
          <div className="rounded-lg border border-rose-500/35 bg-rose-500/10 px-3 py-2.5 flex items-start gap-2.5 text-xs text-rose-700 dark:text-rose-300">
            <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5 text-rose-500" />
            <div className="space-y-0.5">
              <div className="font-semibold">
                MetaTrader 5 Bridge ulanmagan (DISCONNECTED) — Tahlil va Yangi Orderlar Xavfsizlik Uchun To‘xtatilgan
              </div>
              <div className="text-[11px] opacity-90">
                {conn?.disconnectReasonUz ||
                  'Windows kompyuteringizda MetaTrader 5 terminalini oching va mt5_bridge.py serverini ishga tushiring. Eskirgan yoki tashqi narxlar bilan savdo qilinmaydi.'}
              </div>
            </div>
          </div>
        )}

        {/* BRIDGE URL CONFIG + ACCOUNT TELEMETRY */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 items-end">
          <div className="lg:col-span-5">
            <label className="block text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1">
              MT5 Bridge Backend URL (masalan: http://127.0.0.1:8000)
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={bridgeUrlInput}
                onChange={(e) => setBridgeUrlInput(e.target.value)}
                placeholder="http://127.0.0.1:8000"
                className="flex-1 px-2.5 py-1.5 text-xs font-mono rounded-lg border border-slate-300 dark:border-violet-500/30 bg-slate-50 dark:bg-[#070B16] text-slate-900 dark:text-slate-100 focus:outline-none focus:border-sky-500"
              />
              <button
                type="button"
                onClick={() => void handleSaveBridgeConfig()}
                disabled={busyAction === 'config'}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-violet-500/40 bg-violet-500/15 text-violet-700 dark:text-violet-300 hover:bg-violet-500/25 disabled:opacity-50 cursor-pointer whitespace-nowrap"
              >
                <Plug className="w-3.5 h-3.5" />
                <span>Saqlash &amp; Ulash</span>
              </button>
            </div>
          </div>

          <div className="lg:col-span-2">
            <label className="block text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1">
              Tarix maqsadi (yil)
            </label>
            <select
              value={historyYears}
              onChange={(e) => setHistoryYears(Number(e.target.value))}
              className="w-full px-2.5 py-1.5 text-xs font-mono rounded-lg border border-slate-300 dark:border-violet-500/30 bg-slate-50 dark:bg-[#070B16] text-slate-900 dark:text-slate-100"
            >
              <option value={1}>1 yil</option>
              <option value={2}>2 yil</option>
              <option value={2.5}>2.5 yil</option>
              <option value={3}>3 yil</option>
            </select>
          </div>

          <div className="lg:col-span-5 grid grid-cols-3 gap-2 text-[11px] font-mono tabular-nums">
            <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#070B16] px-2.5 py-1.5">
              <div className="text-[10px] font-sans text-slate-400">MT5 Hisob</div>
              <div className="font-semibold text-slate-900 dark:text-white truncate">
                {conn?.account ? `#${conn.account.login} (${conn.account.tradeMode})` : 'Ulanmagan'}
              </div>
              <div className="text-[10px] text-slate-500 truncate">{conn?.account?.server || '—'}</div>
            </div>
            <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#070B16] px-2.5 py-1.5">
              <div className="text-[10px] font-sans text-slate-400">Balans / Equity</div>
              <div className="font-semibold text-emerald-600 dark:text-[#00E5A0]">
                {conn?.account ? `$${conn.account.equity.toLocaleString()}` : '—'}
              </div>
              <div className="text-[10px] text-slate-500">
                Free: {conn?.account ? `$${conn.account.marginFree.toLocaleString()}` : '—'}
              </div>
            </div>
            <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#070B16] px-2.5 py-1.5">
              <div className="text-[10px] font-sans text-slate-400">Broker Symbols</div>
              <div className="font-semibold text-sky-600 dark:text-sky-400">
                {summary?.totalSymbols ?? 0} ({summary?.liveCount ?? 0} LIVE)
              </div>
              <div className="text-[10px] text-slate-500">
                {(summary?.totalHistoricalBars ?? 0).toLocaleString()} bar arxiv
              </div>
            </div>
          </div>
        </div>

        {/* FEEDBACK MESSAGE */}
        {feedback && (
          <div
            className={`rounded-lg border px-3 py-2 text-xs flex items-center gap-2 ${
              feedback.type === 'ok'
                ? 'border-emerald-500/35 bg-emerald-500/10 text-emerald-700 dark:text-[#00E5A0]'
                : 'border-rose-500/35 bg-rose-500/10 text-rose-700 dark:text-rose-300'
            }`}
          >
            {feedback.type === 'ok' ? <CheckCircle2 className="w-3.5 h-3.5 shrink-0" /> : <AlertTriangle className="w-3.5 h-3.5 shrink-0" />}
            <span>{feedback.text}</span>
          </div>
        )}

        {/* STATUS COUNTERS & FILTERS */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
          <div className="flex flex-wrap items-center gap-1.5 text-[11px] font-mono">
            <span className="px-2 py-0.5 rounded border border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-[#00E5A0]">
              LIVE: {summary?.liveCount ?? 0}
            </span>
            <span className="px-2 py-0.5 rounded border border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-300">
              DELAYED: {summary?.delayedCount ?? 0}
            </span>
            <span className="px-2 py-0.5 rounded border border-orange-500/30 bg-orange-500/10 text-orange-600 dark:text-orange-300">
              STALE: {summary?.staleCount ?? 0}
            </span>
            <span className="px-2 py-0.5 rounded border border-rose-500/30 bg-rose-500/10 text-rose-600 dark:text-rose-400">
              DISCONNECTED: {summary?.disconnectedCount ?? 0}
            </span>
            <span className="px-2 py-0.5 rounded border border-slate-500/30 bg-slate-500/10 text-slate-600 dark:text-slate-400">
              DATA UNAVAILABLE: {summary?.unavailableCount ?? 0}
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Broker symbol qidirish..."
                className="pl-7 pr-2.5 py-1 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#070B16] text-slate-900 dark:text-slate-100 w-44"
              />
            </div>
            <select
              value={assetFilter}
              onChange={(e) => setAssetFilter(e.target.value)}
              className="px-2 py-1 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#070B16] text-slate-900 dark:text-slate-100"
            >
              <option value="ALL">Barcha sinflar</option>
              <option value="FOREX">FOREX</option>
              <option value="METAL">METAL</option>
              <option value="INDEX">INDEX</option>
              <option value="CRYPTO">CRYPTO</option>
              <option value="ENERGY">ENERGY</option>
              <option value="OTHER">OTHER</option>
            </select>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-2 py-1 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#070B16] text-slate-900 dark:text-slate-100"
            >
              <option value="ALL">Barcha holatlar</option>
              <option value="LIVE">LIVE</option>
              <option value="DELAYED">DELAYED</option>
              <option value="STALE">STALE</option>
              <option value="DISCONNECTED">DISCONNECTED</option>
              <option value="DATA UNAVAILABLE">DATA UNAVAILABLE</option>
            </select>
            <label className="inline-flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-300 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={visibleOnly}
                onChange={(e) => setVisibleOnly(e.target.checked)}
                className="rounded border-slate-400"
              />
              <span>Faqat Market Watch</span>
            </label>
          </div>
        </div>

        {/* EXACT 11-COLUMN MT5 DATA SOURCES TABLE */}
        <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-violet-500/20">
          <table className="w-full text-[11.5px] font-mono tabular-nums border-collapse">
            <thead>
              <tr className="text-left bg-slate-50 dark:bg-[#080D1B] text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-violet-500/20">
                <th className="py-2 px-2.5 font-sans font-semibold whitespace-nowrap">Instrument</th>
                <th className="py-2 px-2.5 font-sans font-semibold whitespace-nowrap">Broker Symbol</th>
                <th className="py-2 px-2.5 font-sans font-semibold whitespace-nowrap">Data Source</th>
                <th className="py-2 px-2.5 font-sans font-semibold whitespace-nowrap text-right">Bid</th>
                <th className="py-2 px-2.5 font-sans font-semibold whitespace-nowrap text-right">Ask</th>
                <th className="py-2 px-2.5 font-sans font-semibold whitespace-nowrap text-right">Spread</th>
                <th className="py-2 px-2.5 font-sans font-semibold whitespace-nowrap">Last Tick Time</th>
                <th className="py-2 px-2.5 font-sans font-semibold whitespace-nowrap text-right">Data Age</th>
                <th className="py-2 px-2.5 font-sans font-semibold whitespace-nowrap text-right">Historical Bars</th>
                <th className="py-2 px-2.5 font-sans font-semibold whitespace-nowrap">Timeframes Available</th>
                <th className="py-2 px-2.5 font-sans font-semibold whitespace-nowrap">Connection Status</th>
                <th className="py-2 px-2.5 font-sans font-semibold whitespace-nowrap text-right">Amallar</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200/70 dark:divide-violet-500/10">
              {filteredRows.length === 0 ? (
                <tr>
                  <td colSpan={12} className="py-8 text-center font-sans text-xs text-slate-500 dark:text-slate-400">
                    <div className="flex flex-col items-center gap-2">
                      <Server className="w-6 h-6 text-slate-400" />
                      <span>
                        {rows.length === 0
                          ? 'Hozircha broker instrumentlari yuklanmagan. MetaTrader 5 Bridge ulanganidan so‘ng barcha broker symbollari avtomatik ko‘rinadi.'
                          : 'Qidiruv filtriga mos broker instrumenti topilmadi.'}
                      </span>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredRows.slice(0, 150).map((row) => {
                  const isExpanded = expandedSymbol === row.brokerSymbol;
                  return (
                    <React.Fragment key={row.brokerSymbol}>
                      <tr className="hover:bg-slate-50/80 dark:hover:bg-violet-500/5 transition-colors">
                        <td className="py-2 px-2.5 whitespace-nowrap">
                          <div className="font-semibold text-slate-900 dark:text-white">{row.instrument}</div>
                          <div className="text-[10px] font-sans text-slate-400">{row.assetClass}</div>
                        </td>
                        <td className="py-2 px-2.5 whitespace-nowrap">
                          <button
                            type="button"
                            onClick={() => setExpandedSymbol(isExpanded ? null : row.brokerSymbol)}
                            className="font-bold text-sky-600 dark:text-sky-400 hover:underline cursor-pointer text-left"
                            title="Kontrakt spetsifikatsiyalarini ko‘rish"
                          >
                            {row.brokerSymbol}
                          </button>
                          {row.visible && (
                            <span className="ml-1.5 text-[9px] px-1 py-0.5 rounded bg-violet-500/15 text-violet-600 dark:text-violet-300 font-sans">
                              MW
                            </span>
                          )}
                        </td>
                        <td className="py-2 px-2.5 whitespace-nowrap text-violet-600 dark:text-violet-300 font-semibold">
                          {row.dataSource}
                        </td>
                        <td className="py-2 px-2.5 whitespace-nowrap text-right text-slate-800 dark:text-slate-100">
                          {formatQuotePrice(row.bid, row.digits)}
                        </td>
                        <td className="py-2 px-2.5 whitespace-nowrap text-right text-slate-800 dark:text-slate-100">
                          {formatQuotePrice(row.ask, row.digits)}
                        </td>
                        <td className="py-2 px-2.5 whitespace-nowrap text-right text-slate-600 dark:text-slate-300">
                          {row.spreadPoints !== null ? `${row.spreadPoints} pt` : '—'}
                        </td>
                        <td className="py-2 px-2.5 whitespace-nowrap text-slate-600 dark:text-slate-300">
                          {formatTickTime(row.lastTickTime)}
                        </td>
                        <td className="py-2 px-2.5 whitespace-nowrap text-right">
                          <span
                            className={
                              row.dataAgeSec === null
                                ? 'text-slate-400'
                                : row.dataAgeSec <= 15
                                  ? 'text-emerald-600 dark:text-[#00E5A0]'
                                  : row.dataAgeSec <= 90
                                    ? 'text-amber-500'
                                    : 'text-rose-500'
                            }
                          >
                            {formatDataAge(row.dataAgeSec)}
                          </span>
                        </td>
                        <td className="py-2 px-2.5 whitespace-nowrap text-right text-slate-700 dark:text-slate-200">
                          {row.historicalBars > 0 ? row.historicalBars.toLocaleString() : '0'}
                        </td>
                        <td className="py-2 px-2.5 whitespace-nowrap">
                          {row.timeframesAvailable.length > 0 ? (
                            <div className="flex flex-wrap gap-1">
                              {row.timeframesAvailable.map((tf) => (
                                <span
                                  key={tf}
                                  title={`${tf}: ${row.barsByTimeframe[tf]?.barsCount ?? 0} bar`}
                                  className="px-1 py-0.5 text-[9.5px] rounded bg-sky-500/15 text-sky-600 dark:text-sky-300 border border-sky-500/25"
                                >
                                  {tf}
                                </span>
                              ))}
                            </div>
                          ) : (
                            <span className="text-slate-400 text-[10.5px]">Yuklanmagan</span>
                          )}
                        </td>
                        <td className="py-2 px-2.5 whitespace-nowrap">
                          <span
                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded border text-[10px] font-bold ${statusBadgeClass(
                              row.connectionStatus
                            )}`}
                          >
                            <Activity className="w-2.5 h-2.5" />
                            <span>{row.connectionStatus}</span>
                          </span>
                        </td>
                        <td className="py-2 px-2.5 whitespace-nowrap text-right">
                          <div className="inline-flex items-center gap-1">
                            {!row.visible && conn?.connected && (
                              <button
                                type="button"
                                onClick={() => void handleSelectMarketWatch(row)}
                                disabled={busyAction === `sel:${row.brokerSymbol}`}
                                title="Market Watch ga qo‘shish"
                                className="p-1 rounded border border-violet-500/30 bg-violet-500/10 text-violet-600 dark:text-violet-300 hover:bg-violet-500/20 disabled:opacity-40 cursor-pointer"
                              >
                                <Eye className="w-3.5 h-3.5" />
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => void handleSyncSymbolHistory(row)}
                              disabled={!conn?.connected || busyAction === `hist:${row.brokerSymbol}`}
                              title={`${historyYears} yillik haqiqiy MT5 OHLC tarixini yuklash (M1–W1)`}
                              className="inline-flex items-center gap-1 px-2 py-1 rounded border border-sky-500/30 bg-sky-500/10 text-sky-600 dark:text-sky-300 hover:bg-sky-500/20 disabled:opacity-40 cursor-pointer text-[10px] font-sans font-semibold"
                            >
                              <DownloadCloud className={`w-3 h-3 ${busyAction === `hist:${row.brokerSymbol}` ? 'animate-pulse' : ''}`} />
                              <span>Tarix</span>
                            </button>
                          </div>
                        </td>
                      </tr>
                      {isExpanded && (
                        <tr className="bg-slate-50/90 dark:bg-[#060B18]">
                          <td colSpan={12} className="px-3 py-2.5 text-[11px] font-sans">
                            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-2 font-mono text-[10.5px]">
                              <div>
                                <span className="text-slate-400 block font-sans">Digits / Point</span>
                                <span className="text-slate-900 dark:text-white">{row.digits} / {row.point}</span>
                              </div>
                              <div>
                                <span className="text-slate-400 block font-sans">Tick Size / Value</span>
                                <span className="text-slate-900 dark:text-white">{row.tickSize} / {row.tickValue}</span>
                              </div>
                              <div>
                                <span className="text-slate-400 block font-sans">Contract Size</span>
                                <span className="text-slate-900 dark:text-white">{row.contractSize.toLocaleString()}</span>
                              </div>
                              <div>
                                <span className="text-slate-400 block font-sans">Lot Min / Max / Step</span>
                                <span className="text-slate-900 dark:text-white">
                                  {row.volumeMin} / {row.volumeMax} / {row.volumeStep}
                                </span>
                              </div>
                              <div>
                                <span className="text-slate-400 block font-sans">Trade Mode</span>
                                <span className={row.tradable ? 'text-emerald-500' : 'text-rose-500'}>
                                  {row.tradeModeLabel} ({row.tradable ? 'Savdoga ochiq' : 'Yopiq'})
                                </span>
                              </div>
                              <div>
                                <span className="text-slate-400 block font-sans">Tick / Real Volume</span>
                                <span className="text-slate-900 dark:text-white">
                                  {row.tickVolume ?? '—'} / {row.realVolume ?? '—'}
                                </span>
                              </div>
                            </div>
                            {row.timeframesAvailable.length > 0 && (
                              <div className="mt-2 pt-2 border-t border-slate-200 dark:border-slate-800 flex flex-wrap gap-2 font-mono text-[10px]">
                                {row.timeframesAvailable.map((tf) => {
                                  const meta = row.barsByTimeframe[tf];
                                  return (
                                    <span key={tf} className="px-2 py-0.5 rounded bg-slate-200/70 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                                      {tf}: <strong>{meta?.barsCount.toLocaleString()}</strong> bar
                                      {meta?.firstCandleIso ? ` (${meta.firstCandleIso.slice(0, 10)} → ${meta.lastCandleIso?.slice(0, 10)})` : ''}
                                    </span>
                                  );
                                })}
                              </div>
                            )}
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        {filteredRows.length > 150 && (
          <div className="text-[11px] text-slate-500 dark:text-slate-400">
            Dastlabki 150 ta broker symbol ko‘rsatilmoqda (jami {filteredRows.length}). Kerakli instrumentni qidiruv orqali toping.
          </div>
        )}
      </section>

      {/* MT5 BRIDGE DOWNLOAD & SETUP ASSISTANT */}
      <ServerBridgeView
        serverConfig={serverConfig}
        onUpdateConfig={onUpdateServerConfig}
        pairs={pairs}
        positions={positions}
        strategies={strategies}
        riskGuard={riskGuard}
        onSyncFromServer={onSyncFromServer}
      />
    </div>
  );
};
