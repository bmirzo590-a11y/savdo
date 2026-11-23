import React, { useEffect, useState } from 'react';
import {
  Activity,
  CheckCircle2,
  Cpu,
  Eye,
  Layers,
  Pause,
  Play,
  Radar,
  RefreshCw,
  Save,
  Shield,
  X,
} from 'lucide-react';
import {
  PersistentOrderRecord,
  PersistentRiskSettings,
  UnifiedAnalysisRecord,
  UnifiedStateSnapshot,
  ViewId,
} from '../types/trading';
import { formatPrice } from '../config/initialData';
import { apiJson } from '../utils/apiClient';

interface DashboardBottomGridProps {
  selectedSymbol: string;
  unifiedState: UnifiedStateSnapshot | null;
  mt5Connected: boolean;
  onSelectSymbol: (symbol: string) => void;
  onToggleEnsembleStrategy: (id: string, enabled: boolean) => Promise<void>;
  onScannerAction: (action: 'start' | 'pause' | 'resume' | 'scan-now') => Promise<void>;
  onSaveRiskSettings: (settings: PersistentRiskSettings) => Promise<{ ok: boolean; error?: string }>;
  onCloseOrder: (orderId: string) => Promise<{ ok: boolean; error?: string }>;
  onNavigate: (view: ViewId) => void;
}

export const DashboardBottomGrid: React.FC<DashboardBottomGridProps> = ({
  selectedSymbol,
  unifiedState,
  mt5Connected,
  onSelectSymbol,
  onToggleEnsembleStrategy,
  onScannerAction,
  onSaveRiskSettings,
  onCloseOrder,
  onNavigate,
}) => {
  const [orderTab, setOrderTab] = useState<'OPEN' | 'PENDING' | 'CLOSED'>('OPEN');
  const [togglingStratId, setTogglingStratId] = useState<string | null>(null);
  const [scannerBusy, setScannerBusy] = useState(false);
  const [closingOrderId, setClosingOrderId] = useState<string | null>(null);

  // Risk Manager editable settings
  const [riskForm, setRiskForm] = useState<PersistentRiskSettings>({
    dailyMaxLossUsd: 750,
    maxOpenPositions: 8,
    maxDrawdownPct: 10,
    riskPerTradePct: 1,
    maxPortfolioRiskPct: 5,
    maxMarginUsagePct: 45,
    maxCorrelatedExposure: 3,
    maxSpreadPoints: 60,
    maxVolatilityAtrPct: 5,
    testAccountBalanceUsd: 10000,
  });
  const [savingRisk, setSavingRisk] = useState(false);
  const [riskNotice, setRiskNotice] = useState<string | null>(null);

  // Order Details Modal (loaded from GET /api/orders/:id)
  const [detailModal, setDetailModal] = useState<{
    order: PersistentOrderRecord;
    analysis: UnifiedAnalysisRecord | null;
  } | null>(null);
  const [loadingDetailId, setLoadingDetailId] = useState<string | null>(null);

  useEffect(() => {
    if (unifiedState?.riskSettings) {
      setRiskForm(unifiedState.riskSettings);
    }
  }, [unifiedState?.riskSettings]);

  const selectedAnalysis = unifiedState?.analysesBySymbol[selectedSymbol] ?? null;
  const strategies = unifiedState?.ensembleStrategies ?? [];
  const scannerItems = Object.values(unifiedState?.scannerStates ?? {});
  const allOrders = unifiedState?.orders ?? [];
  const filteredOrders = allOrders.filter((o) => o.status === orderTab);
  const account = unifiedState?.account;
  const scannerRunning = unifiedState?.scanner.status === 'RUNNING';

  const handleToggleStrategy = async (id: string, currentEnabled: boolean) => {
    setTogglingStratId(id);
    await onToggleEnsembleStrategy(id, !currentEnabled);
    setTogglingStratId(null);
  };

  const handleScannerBtn = async (action: 'start' | 'pause' | 'resume' | 'scan-now') => {
    setScannerBusy(true);
    await onScannerAction(action);
    setScannerBusy(false);
  };

  const handleSaveRisk = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingRisk(true);
    setRiskNotice(null);
    const res = await onSaveRiskSettings(riskForm);
    setSavingRisk(false);
    setRiskNotice(res.ok ? 'Sozlamalar bazaga saqlandi.' : res.error || 'Saqlashda xato.');
    window.setTimeout(() => setRiskNotice(null), 3500);
  };

  const handleOpenOrderDetails = async (orderId: string) => {
    setLoadingDetailId(orderId);
    try {
      const data = await apiJson<{
        ok: boolean;
        order: PersistentOrderRecord;
        analysis: UnifiedAnalysisRecord | null;
      }>(`/api/orders/${encodeURIComponent(orderId)}`);
      if (data.ok && data.order) {
        setDetailModal({ order: data.order, analysis: data.analysis ?? null });
      }
    } catch {
      const localOrder = allOrders.find((o) => o.id === orderId);
      if (localOrder) {
        setDetailModal({
          order: localOrder,
          analysis: unifiedState?.analysesBySymbol[localOrder.symbol] ?? null,
        });
      }
    } finally {
      setLoadingDetailId(null);
    }
  };

  const handleClosePosition = async (orderId: string) => {
    setClosingOrderId(orderId);
    await onCloseOrder(orderId);
    setClosingOrderId(null);
    if (detailModal?.order.id === orderId) {
      setDetailModal(null);
    }
  };

  const statusTone = (status: string) => {
    if (status === 'SIGNAL FOUND') return 'text-emerald-500 dark:text-[#00E5A0]';
    if (status === 'DATA UNAVAILABLE' || status === 'ERROR') return 'text-rose-500 dark:text-rose-400';
    if (status === 'SCANNING' || status === 'ANALYZING') return 'text-sky-500 dark:text-sky-400';
    return 'text-slate-500 dark:text-slate-400';
  };

  const uptimeMins = Math.floor((unifiedState?.system?.serverUptimeSec ?? 0) / 60);

  return (
    <>
      {/* COMPACT 5-MODULE NEON INSTITUTIONAL GRID */}
      <section className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-12 gap-3">
        {/* MODULE 1: STRATEGY ENSEMBLE (18 REAL STRATEGIES + LIVE TOGGLES) */}
        <div className="xl:col-span-4 rounded-xl border border-slate-200 dark:border-violet-500/25 bg-white dark:bg-[#0D1426] p-3.5 flex flex-col max-h-[340px]">
          <div className="flex items-center justify-between gap-2 pb-2 border-b border-slate-200 dark:border-violet-500/15">
            <div className="flex items-center gap-1.5 min-w-0">
              <Layers className="w-4 h-4 text-violet-500 dark:text-violet-400 shrink-0" />
              <h3 className="text-xs font-bold text-slate-900 dark:text-white truncate">
                Strategy Ensemble ({unifiedState?.activeStrategiesCount ?? 0}/{unifiedState?.totalStrategiesCount ?? 18})
              </h3>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('ensemble')}
              className="text-[11px] font-medium text-sky-600 dark:text-sky-400 hover:underline cursor-pointer shrink-0"
            >
              Barchasi →
            </button>
          </div>

          {selectedAnalysis && selectedAnalysis.status === 'OK' && (
            <div className="py-1.5 text-[10.5px] font-mono tabular-nums flex items-center justify-between border-b border-slate-100 dark:border-slate-800/80 text-slate-500 dark:text-slate-400">
              <span>
                {selectedSymbol}: <strong className="text-emerald-500">{selectedAnalysis.ensemble.buyVotes} BUY</strong> ·{' '}
                <strong className="text-rose-400">{selectedAnalysis.ensemble.sellVotes} SELL</strong> ·{' '}
                <span>{selectedAnalysis.ensemble.waitVotes} WAIT</span>
              </span>
              {selectedAnalysis.ensemble.contradictionDetected && (
                <span className="text-amber-400 font-semibold">Ziddiyat</span>
              )}
            </div>
          )}

          <div className="flex-1 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800/70 mt-1 pr-1">
            {strategies.map((strat) => {
              const vote = selectedAnalysis?.strategyResults.find((r) => r.strategyId === strat.id);
              const sig = vote?.signal ?? strat.lastSignal;
              const conf = vote?.confidence ?? strat.lastConfidence;
              return (
                <div key={strat.id} className="py-1.5 flex items-center justify-between gap-2 text-[11px]">
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="font-medium text-slate-800 dark:text-slate-200 truncate">
                        {strat.name}
                      </span>
                      <span className="text-[9.5px] font-mono text-slate-400">w:{strat.weight}</span>
                    </div>
                    <p className="text-[10px] text-slate-400 truncate max-w-[205px]" title={vote?.evidenceUz ?? strat.lastReasonUz}>
                      {vote?.evidenceUz ?? strat.lastReasonUz}
                    </p>
                  </div>

                  <div className="flex items-center gap-2 shrink-0 font-mono tabular-nums">
                    <span
                      className={`text-[10.5px] font-bold ${
                        sig === 'BUY'
                          ? 'text-emerald-500 dark:text-[#00E5A0]'
                          : sig === 'SELL'
                            ? 'text-rose-500 dark:text-rose-400'
                            : 'text-slate-400'
                      }`}
                    >
                      {sig} {conf > 0 ? `${conf}%` : ''}
                    </span>
                    <button
                      type="button"
                      disabled={togglingStratId === strat.id}
                      onClick={() => void handleToggleStrategy(strat.id, strat.enabled)}
                      className={`px-2 py-0.5 text-[10px] font-sans font-semibold rounded border transition-colors cursor-pointer ${
                        strat.enabled
                          ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-[#00E5A0] hover:bg-emerald-500/20'
                          : 'border-slate-300 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:border-violet-400'
                      }`}
                    >
                      {togglingStratId === strat.id ? '...' : strat.enabled ? 'Faol' : 'O‘chiq'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* MODULE 2: 24/7 MARKET SCANNER (REAL START/PAUSE/RESUME/SCAN-NOW + STATUS) */}
        <div className="xl:col-span-4 rounded-xl border border-slate-200 dark:border-violet-500/25 bg-white dark:bg-[#0D1426] p-3.5 flex flex-col max-h-[340px]">
          <div className="flex items-center justify-between gap-2 pb-2 border-b border-slate-200 dark:border-violet-500/15">
            <div className="flex items-center gap-1.5 min-w-0">
              <Radar className="w-4 h-4 text-sky-500 dark:text-sky-400 shrink-0" />
              <h3 className="text-xs font-bold text-slate-900 dark:text-white truncate">
                24/7 Market Scanner
              </h3>
            </div>

            <div className="flex items-center gap-1 shrink-0">
              {scannerRunning ? (
                <button
                  type="button"
                  disabled={scannerBusy}
                  onClick={() => void handleScannerBtn('pause')}
                  className="inline-flex items-center gap-1 px-2 py-1 text-[10.5px] font-semibold rounded border border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-300 hover:bg-amber-500/20 cursor-pointer disabled:opacity-50"
                >
                  <Pause className="w-3 h-3" />
                  Pauza
                </button>
              ) : (
                <button
                  type="button"
                  disabled={scannerBusy}
                  onClick={() => void handleScannerBtn('resume')}
                  className="inline-flex items-center gap-1 px-2 py-1 text-[10.5px] font-semibold rounded border border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-[#00E5A0] hover:bg-emerald-500/20 cursor-pointer disabled:opacity-50"
                >
                  <Play className="w-3 h-3" />
                  Boshlash
                </button>
              )}
              <button
                type="button"
                disabled={scannerBusy || unifiedState?.scanInProgress}
                onClick={() => void handleScannerBtn('scan-now')}
                className="inline-flex items-center gap-1 px-2 py-1 text-[10.5px] font-semibold rounded border border-sky-500/40 bg-sky-500/10 text-sky-600 dark:text-sky-300 hover:bg-sky-500/20 cursor-pointer disabled:opacity-50"
                title="Barcha instrumentlarni hozir skanerlash"
              >
                <RefreshCw className={`w-3 h-3 ${scannerBusy || unifiedState?.scanInProgress ? 'animate-spin' : ''}`} />
                Skan
              </button>
            </div>
          </div>

          <div className="py-1.5 text-[10.5px] font-mono tabular-nums flex items-center justify-between border-b border-slate-100 dark:border-slate-800/80 text-slate-500 dark:text-slate-400">
            <span>
              Holat:{' '}
              <strong className={scannerRunning ? 'text-emerald-500 dark:text-[#00E5A0]' : 'text-amber-400'}>
                {unifiedState?.scanInProgress ? 'SCANNING' : scannerRunning ? 'RUNNING' : 'PAUSED'}
              </strong>
            </span>
            <span>Yangi sham: {unifiedState?.scanner.newCandlesDetected ?? 0}</span>
          </div>

          <div className="flex-1 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800/70 mt-1 pr-1">
            {scannerItems.length === 0 ? (
              <p className="py-6 text-center text-xs text-slate-400">
                Skaner ishga tushishi kutilmoqda...
              </p>
            ) : (
              scannerItems.map((item) => (
                <button
                  key={item.symbol}
                  type="button"
                  onClick={() => onSelectSymbol(item.symbol)}
                  className={`w-full py-1.5 px-1 text-left flex items-center justify-between gap-2 text-[11px] hover:bg-slate-50 dark:hover:bg-[#131C33] rounded transition-colors cursor-pointer ${
                    item.symbol === selectedSymbol ? 'bg-violet-500/10' : ''
                  }`}
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 font-mono">
                      <span className="font-bold text-slate-900 dark:text-white">{item.symbol}</span>
                      <span className="text-[10px] text-slate-400">{item.timeframe}</span>
                      {item.newCandleDetected && (
                        <span className="text-[9.5px] font-sans font-semibold text-sky-500 dark:text-sky-400">
                          • Yangi sham
                        </span>
                      )}
                    </div>
                    <div className="text-[10px] font-mono text-slate-400 truncate">
                      {item.dataSource}
                      {item.freshnessSec !== null ? ` · ${item.freshnessSec}s` : ''}
                    </div>
                  </div>

                  <div className="text-right font-mono tabular-nums shrink-0">
                    <div className={`text-[10.5px] font-bold ${statusTone(item.status)}`}>
                      {item.status}
                    </div>
                    <div className="text-[10px] text-slate-500 dark:text-slate-400">
                      {item.decision} {item.confidence > 0 ? `${item.confidence}%` : ''}
                    </div>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>

        {/* MODULE 3: 8-DIMENSION RISK MANAGER + PERSISTENT SAVE SETTINGS */}
        <form
          onSubmit={handleSaveRisk}
          className="xl:col-span-4 rounded-xl border border-slate-200 dark:border-violet-500/25 bg-white dark:bg-[#0D1426] p-3.5 flex flex-col justify-between max-h-[340px]"
        >
          <div className="flex items-center justify-between gap-2 pb-2 border-b border-slate-200 dark:border-violet-500/15">
            <div className="flex items-center gap-1.5">
              <Shield className="w-4 h-4 text-emerald-500 dark:text-[#00E5A0]" />
              <h3 className="text-xs font-bold text-slate-900 dark:text-white">
                Risk Manager (8-O‘lchovli)
              </h3>
            </div>
            <button
              type="submit"
              disabled={savingRisk}
              className="inline-flex items-center gap-1 px-2.5 py-1 text-[10.5px] font-semibold rounded bg-emerald-600 hover:bg-emerald-500 text-white transition-colors cursor-pointer disabled:opacity-50"
            >
              <Save className="w-3 h-3" />
              {savingRisk ? 'Saqlanmoqda...' : 'Save Settings'}
            </button>
          </div>

          {/* Live 8-Dimension Status Summary */}
          <div className="grid grid-cols-4 gap-1.5 py-2 text-[10px] font-mono tabular-nums border-b border-slate-100 dark:border-slate-800/80">
            <div>
              <span className="text-slate-400 block">Portfolio Risk</span>
              <strong className={(account?.portfolioRiskPct ?? 0) > riskForm.maxPortfolioRiskPct ? 'text-rose-400' : 'text-emerald-500 dark:text-[#00E5A0]'}>
                {(account?.portfolioRiskPct ?? 0).toFixed(1)}%/{riskForm.maxPortfolioRiskPct}%
              </strong>
            </div>
            <div>
              <span className="text-slate-400 block">Drawdown</span>
              <strong className="text-slate-800 dark:text-slate-200">
                {(account?.currentDrawdownPct ?? 0).toFixed(1)}%/{riskForm.maxDrawdownPct}%
              </strong>
            </div>
            <div>
              <span className="text-slate-400 block">Margin</span>
              <strong className="text-sky-500 dark:text-sky-400">
                {(account?.marginUsagePct ?? 0).toFixed(1)}%
              </strong>
            </div>
            <div>
              <span className="text-slate-400 block">Exposure</span>
              <strong className="text-slate-800 dark:text-slate-200">
                ${Math.round(account?.totalExposureUsd ?? 0)}
              </strong>
            </div>
          </div>

          {/* Editable Inputs */}
          <div className="grid grid-cols-3 gap-2 py-2 text-[10.5px] font-mono tabular-nums">
            <label>
              <span className="text-[9.5px] font-sans text-slate-400 block">Risk/Savdo %</span>
              <input
                type="number"
                step="0.1"
                min="0.1"
                max="10"
                value={riskForm.riskPerTradePct}
                onChange={(e) => setRiskForm((f) => ({ ...f, riskPerTradePct: Number(e.target.value) }))}
                className="mt-0.5 w-full px-2 py-1 rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#080D1B] text-slate-900 dark:text-white"
              />
            </label>
            <label>
              <span className="text-[9.5px] font-sans text-slate-400 block">Max Portfolio %</span>
              <input
                type="number"
                step="0.5"
                min="0.5"
                max="30"
                value={riskForm.maxPortfolioRiskPct}
                onChange={(e) => setRiskForm((f) => ({ ...f, maxPortfolioRiskPct: Number(e.target.value) }))}
                className="mt-0.5 w-full px-2 py-1 rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#080D1B] text-slate-900 dark:text-white"
              />
            </label>
            <label>
              <span className="text-[9.5px] font-sans text-slate-400 block">Max DD %</span>
              <input
                type="number"
                step="0.5"
                min="1"
                max="50"
                value={riskForm.maxDrawdownPct}
                onChange={(e) => setRiskForm((f) => ({ ...f, maxDrawdownPct: Number(e.target.value) }))}
                className="mt-0.5 w-full px-2 py-1 rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#080D1B] text-slate-900 dark:text-white"
              />
            </label>
            <label>
              <span className="text-[9.5px] font-sans text-slate-400 block">Kunlik Limit $</span>
              <input
                type="number"
                step="50"
                min="50"
                value={riskForm.dailyMaxLossUsd}
                onChange={(e) => setRiskForm((f) => ({ ...f, dailyMaxLossUsd: Number(e.target.value) }))}
                className="mt-0.5 w-full px-2 py-1 rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#080D1B] text-slate-900 dark:text-white"
              />
            </label>
            <label>
              <span className="text-[9.5px] font-sans text-slate-400 block">Max Orderlar</span>
              <input
                type="number"
                min="1"
                max="50"
                value={riskForm.maxOpenPositions}
                onChange={(e) => setRiskForm((f) => ({ ...f, maxOpenPositions: Number(e.target.value) }))}
                className="mt-0.5 w-full px-2 py-1 rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#080D1B] text-slate-900 dark:text-white"
              />
            </label>
            <label>
              <span className="text-[9.5px] font-sans text-slate-400 block">Korrelyatsiya</span>
              <input
                type="number"
                min="1"
                max="10"
                value={riskForm.maxCorrelatedExposure}
                onChange={(e) => setRiskForm((f) => ({ ...f, maxCorrelatedExposure: Number(e.target.value) }))}
                className="mt-0.5 w-full px-2 py-1 rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#080D1B] text-slate-900 dark:text-white"
              />
            </label>
          </div>

          <div className="text-[10.5px] flex items-center justify-between pt-1.5 border-t border-slate-100 dark:border-slate-800/80">
            {riskNotice ? (
              <span className="text-emerald-600 dark:text-[#00E5A0] flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3" />
                {riskNotice}
              </span>
            ) : (
              <span className="text-slate-400 font-mono">
                Balans (Test): ${riskForm.testAccountBalanceUsd.toLocaleString()}
              </span>
            )}
            <button
              type="button"
              onClick={() => onNavigate('risk')}
              className="text-sky-600 dark:text-sky-400 hover:underline cursor-pointer"
            >
              Batafsil →
            </button>
          </div>
        </form>

        {/* MODULE 4: PERSISTENT MULTI-ORDER MANAGER (OPEN / PENDING / CLOSED + DETAILS + CLOSE) */}
        <div className="xl:col-span-7 rounded-xl border border-slate-200 dark:border-violet-500/25 bg-white dark:bg-[#0D1426] p-3.5 flex flex-col max-h-[300px]">
          <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-slate-200 dark:border-violet-500/15">
            <div className="flex items-center gap-2">
              <Activity className="w-4 h-4 text-sky-400" />
              <h3 className="text-xs font-bold text-slate-900 dark:text-white">
                Multi-Order Manager (Persistent)
              </h3>
            </div>

            <div className="flex items-center gap-1 p-0.5 rounded-lg bg-slate-100 dark:bg-[#080D1B] border border-slate-200 dark:border-violet-500/20 font-mono tabular-nums text-[10.5px]">
              {(['OPEN', 'PENDING', 'CLOSED'] as const).map((tab) => {
                const count = allOrders.filter((o) => o.status === tab).length;
                return (
                  <button
                    key={tab}
                    type="button"
                    onClick={() => setOrderTab(tab)}
                    className={`px-2 py-0.5 rounded transition-colors cursor-pointer ${
                      orderTab === tab
                        ? 'bg-white dark:bg-violet-500/25 text-slate-900 dark:text-violet-200 font-semibold'
                        : 'text-slate-500 dark:text-slate-400'
                    }`}
                  >
                    {tab} ({count})
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex-1 overflow-x-auto overflow-y-auto mt-1.5">
            {filteredOrders.length === 0 ? (
              <div className="py-8 text-center text-xs text-slate-500 dark:text-slate-400">
                {orderTab} buyurtmalar mavjud emas (soxta pozitsiyalar olib tashlangan). O‘ng paneldagi <strong>Test Order</strong> orqali yangi buyurtma ochishingiz mumkin.
              </div>
            ) : (
              <table className="w-full text-left border-collapse text-[11px] font-mono tabular-nums">
                <thead>
                  <tr className="text-[10px] font-sans uppercase tracking-wider text-slate-400 border-b border-slate-200 dark:border-slate-800">
                    <th className="py-1.5 pr-2">Instrument</th>
                    <th className="py-1.5 pr-2">Lot</th>
                    <th className="py-1.5 pr-2">Entry / Mark</th>
                    <th className="py-1.5 pr-2">SL / TP</th>
                    <th className="py-1.5 pr-2 text-right">P/L ($)</th>
                    <th className="py-1.5 text-right">Amal</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/70">
                  {filteredOrders.map((ord) => {
                    const pnl = ord.status === 'CLOSED' ? ord.realizedPnl ?? 0 : ord.profit ?? 0;
                    return (
                      <tr key={ord.id} className="hover:bg-slate-50 dark:hover:bg-[#131C33]">
                        <td className="py-1.5 pr-2 whitespace-nowrap">
                          <span className="font-bold text-slate-900 dark:text-white">{ord.symbol}</span>
                          <span
                            className={`ml-1.5 text-[10px] font-bold ${
                              ord.side === 'LONG' ? 'text-emerald-500' : 'text-rose-400'
                            }`}
                          >
                            {ord.side}
                          </span>
                        </td>
                        <td className="py-1.5 pr-2 text-slate-700 dark:text-slate-300">
                          {ord.lotSize.toFixed(2)}
                        </td>
                        <td className="py-1.5 pr-2 text-slate-600 dark:text-slate-300 whitespace-nowrap">
                          {formatPrice(ord.entryPrice)} → {formatPrice(ord.markPrice)}
                        </td>
                        <td className="py-1.5 pr-2 text-[10px] whitespace-nowrap">
                          <span className="text-rose-400">{ord.stopLoss ? formatPrice(ord.stopLoss) : '—'}</span>
                          {' / '}
                          <span className="text-emerald-400">{ord.takeProfit ? formatPrice(ord.takeProfit) : '—'}</span>
                        </td>
                        <td
                          className={`py-1.5 pr-2 text-right font-semibold whitespace-nowrap ${
                            pnl >= 0 ? 'text-emerald-600 dark:text-[#00E5A0]' : 'text-rose-500 dark:text-rose-400'
                          }`}
                        >
                          {pnl >= 0 ? '+' : ''}
                          {pnl.toFixed(2)}
                        </td>
                        <td className="py-1.5 text-right whitespace-nowrap">
                          <div className="inline-flex items-center gap-1 font-sans">
                            <button
                              type="button"
                              disabled={loadingDetailId === ord.id}
                              onClick={() => void handleOpenOrderDetails(ord.id)}
                              className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-medium rounded border border-sky-500/40 bg-sky-500/10 text-sky-600 dark:text-sky-300 hover:bg-sky-500/20 cursor-pointer"
                            >
                              <Eye className="w-3 h-3" />
                              Details
                            </button>
                            {ord.status !== 'CLOSED' && (
                              <button
                                type="button"
                                disabled={closingOrderId === ord.id}
                                onClick={() => void handleClosePosition(ord.id)}
                                className="px-2 py-0.5 text-[10px] font-semibold rounded border border-rose-500/40 bg-rose-500/10 text-rose-600 dark:text-rose-300 hover:bg-rose-500/20 cursor-pointer disabled:opacity-50"
                              >
                                {closingOrderId === ord.id ? '...' : 'Close'}
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* MODULE 5: REAL SYSTEM HEALTH & INTEGRITY MONITOR */}
        <div className="xl:col-span-5 rounded-xl border border-slate-200 dark:border-violet-500/25 bg-white dark:bg-[#0D1426] p-3.5 flex flex-col justify-between max-h-[300px]">
          <div className="flex items-center justify-between gap-2 pb-2 border-b border-slate-200 dark:border-violet-500/15">
            <div className="flex items-center gap-1.5">
              <Cpu className="w-4 h-4 text-violet-400" />
              <h3 className="text-xs font-bold text-slate-900 dark:text-white">
                System Health (Halol Diagnostika)
              </h3>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('monitor')}
              className="text-[11px] font-medium text-sky-600 dark:text-sky-400 hover:underline cursor-pointer"
            >
              Monitor →
            </button>
          </div>

          <div className="grid grid-cols-2 gap-2 py-2 text-[11px] font-mono tabular-nums">
            <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#080D1B] p-2">
              <div className="text-[10px] font-sans text-slate-400">Backend Express API</div>
              <div className="font-bold text-emerald-600 dark:text-[#00E5A0] mt-0.5">
                {unifiedState?.system?.serverOnline ? `ONLINE · ${uptimeMins}m` : 'OFFLINE'}
              </div>
            </div>

            <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#080D1B] p-2">
              <div className="text-[10px] font-sans text-slate-400">Real Market Feed</div>
              <div className="font-bold text-sky-600 dark:text-sky-400 mt-0.5">
                {unifiedState
                  ? `${unifiedState.instruments.filter((i) => i.dataSource !== 'DATA_UNAVAILABLE').length}/${unifiedState.instruments.length} LIVE`
                  : 'Yuklanmoqda'}
              </div>
            </div>

            <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#080D1B] p-2">
              <div className="text-[10px] font-sans text-slate-400">AI LLM API</div>
              <div
                className={`font-bold mt-0.5 ${
                  unifiedState?.llmHealth.status === 'ACTIVE'
                    ? 'text-emerald-600 dark:text-[#00E5A0]'
                    : unifiedState?.llmHealth.status === 'ERROR'
                      ? 'text-rose-500 dark:text-rose-400'
                      : 'text-amber-500 dark:text-amber-300'
                }`}
              >
                {unifiedState?.llmHealth.status ?? 'CHECKING'}
              </div>
            </div>

            <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#080D1B] p-2">
              <div className="text-[10px] font-sans text-slate-400">Persistent DB</div>
              <div className="font-bold text-slate-800 dark:text-slate-100 mt-0.5">
                {unifiedState?.system?.dbSizeKb ?? 0}KB · {unifiedState?.historyCounts.analyses ?? 0} tahlil
              </div>
            </div>
          </div>

          <div className="text-[10.5px] text-slate-500 dark:text-slate-400 pt-1.5 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between gap-2">
            <span className="truncate">
              MT5 Bridge: <strong className={mt5Connected ? 'text-emerald-400' : 'text-rose-400'}>{mt5Connected ? 'Ulangan (MT5 BROKER)' : 'DISCONNECTED (Faqat MT5)'}</strong>
            </span>
            <span className="font-mono shrink-0">RAM {unifiedState?.system?.memoryUsedPct ?? 0}%</span>
          </div>
        </div>
      </section>

      {/* ORDER DETAILS MODAL */}
      {detailModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-lg rounded-xl border border-violet-500/35 bg-white dark:bg-[#0D1426] p-5 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-violet-500/20">
              <div>
                <h4 className="text-sm font-bold text-slate-900 dark:text-white font-mono">
                  Order Details · {detailModal.order.id}
                </h4>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  {detailModal.order.symbol} · {detailModal.order.side} · {detailModal.order.orderType} · {detailModal.order.executionMode}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setDetailModal(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 cursor-pointer"
                aria-label="Yopish"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 py-4 text-xs font-mono tabular-nums">
              <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-[#080D1B] border border-slate-200 dark:border-slate-800">
                <div className="text-[10px] font-sans text-slate-400">Kirish narxi</div>
                <div className="font-bold text-slate-900 dark:text-white mt-0.5">
                  {formatPrice(detailModal.order.entryPrice)}
                </div>
              </div>
              <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-[#080D1B] border border-slate-200 dark:border-slate-800">
                <div className="text-[10px] font-sans text-slate-400">Joriy / Yopilish</div>
                <div className="font-bold text-sky-500 dark:text-sky-400 mt-0.5">
                  {formatPrice(detailModal.order.markPrice)}
                </div>
              </div>
              <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-[#080D1B] border border-slate-200 dark:border-slate-800">
                <div className="text-[10px] font-sans text-slate-400">Lot / Risk</div>
                <div className="font-bold text-slate-900 dark:text-white mt-0.5">
                  {detailModal.order.lotSize} ({detailModal.order.riskPct}%)
                </div>
              </div>
              <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-[#080D1B] border border-slate-200 dark:border-slate-800">
                <div className="text-[10px] font-sans text-rose-400">Stop-Loss</div>
                <div className="font-bold text-rose-500 dark:text-rose-400 mt-0.5">
                  {detailModal.order.stopLoss ? formatPrice(detailModal.order.stopLoss) : '—'}
                </div>
              </div>
              <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-[#080D1B] border border-slate-200 dark:border-slate-800">
                <div className="text-[10px] font-sans text-emerald-400">Take-Profit</div>
                <div className="font-bold text-emerald-500 dark:text-[#00E5A0] mt-0.5">
                  {detailModal.order.takeProfit ? formatPrice(detailModal.order.takeProfit) : '—'}
                </div>
              </div>
              <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-[#080D1B] border border-slate-200 dark:border-slate-800">
                <div className="text-[10px] font-sans text-slate-400">Holat</div>
                <div className="font-bold text-violet-500 dark:text-violet-300 mt-0.5">
                  {detailModal.order.status}
                </div>
              </div>
            </div>

            <div className="space-y-2 text-xs border-t border-slate-200 dark:border-slate-800 pt-3">
              <div>
                <span className="text-slate-400">Strategiya: </span>
                <span className="text-slate-800 dark:text-slate-200 font-medium">
                  {detailModal.order.strategyName}
                </span>
              </div>
              {detailModal.order.analysisId && (
                <div className="font-mono text-[11px] text-slate-400">
                  Analysis ID: {detailModal.order.analysisId}
                </div>
              )}
              {detailModal.order.notesUz && (
                <p className="text-[11px] text-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-[#080D1B] p-2.5 rounded-lg border border-slate-200 dark:border-slate-800">
                  {detailModal.order.notesUz}
                </p>
              )}
            </div>

            <div className="mt-4 flex items-center justify-end gap-2">
              {detailModal.order.status !== 'CLOSED' && (
                <button
                  type="button"
                  disabled={closingOrderId === detailModal.order.id}
                  onClick={() => void handleClosePosition(detailModal.order.id)}
                  className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-rose-600 hover:bg-rose-500 text-white cursor-pointer disabled:opacity-50"
                >
                  Pozitsiyani yopish
                </button>
              )}
              <button
                type="button"
                onClick={() => setDetailModal(null)}
                className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              >
                Yopish
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
