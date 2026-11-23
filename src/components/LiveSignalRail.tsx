import React, { useEffect, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  Brain,
  CheckCircle2,
  Cpu,
  Layers,
  Play,
  RefreshCw,
  ShieldAlert,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';
import {
  MarketPair,
  OrderSide,
  Timeframe,
  UnifiedAnalysisRecord,
  UnifiedStateSnapshot,
  ViewId,
} from '../types/trading';
import { formatPrice } from '../config/initialData';

interface LiveSignalRailProps {
  pairs: MarketPair[];
  selectedSymbol: string;
  timeframe: Timeframe;
  unifiedState: UnifiedStateSnapshot | null;
  analyzingSymbol: string | null;
  refreshing: boolean;
  onSelectSymbol: (symbol: string) => void;
  onRunAnalysis: (symbol: string, timeframe: Timeframe) => Promise<void>;
  onRefreshUnified: () => Promise<void>;
  onSubmitOrder: (payload: {
    symbol: string;
    side: OrderSide;
    orderType: 'MARKET' | 'LIMIT';
    lotSize: number;
    entryPrice?: number;
    stopLoss: number | null;
    takeProfit: number | null;
    analysisId?: string | null;
    strategyName?: string;
  }) => Promise<{ ok: boolean; error?: string }>;
  onNavigate: (view: ViewId) => void;
}

export const LiveSignalRail: React.FC<LiveSignalRailProps> = ({
  pairs,
  selectedSymbol,
  timeframe,
  unifiedState,
  analyzingSymbol,
  refreshing,
  onSelectSymbol,
  onRunAnalysis,
  onRefreshUnified,
  onSubmitOrder,
  onNavigate,
}) => {
  const [activeTab, setActiveTab] = useState<'analyst' | 'signals' | 'order'>('analyst');

  const analysis: UnifiedAnalysisRecord | null =
    unifiedState?.analysesBySymbol[selectedSymbol] ?? null;
  const signals = unifiedState?.signals ?? [];

  const activePair = pairs.find((p) => p.symbol === selectedSymbol) ?? pairs[0];
  const livePrice = analysis?.latestPrice ?? activePair?.price ?? 0;

  // Order ticket state (strictly Test Mode validated by backend 8-dimension Risk Engine)
  const [side, setSide] = useState<OrderSide>('LONG');
  const [orderType, setOrderType] = useState<'MARKET' | 'LIMIT'>('MARKET');
  const [lotSize, setLotSize] = useState<string>('0.05');
  const [entryInput, setEntryInput] = useState<string>('');
  const [slInput, setSlInput] = useState<string>('');
  const [tpInput, setTpInput] = useState<string>('');
  const [submittingOrder, setSubmittingOrder] = useState(false);
  const [orderFeedback, setOrderFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  useEffect(() => {
    if (!analysis) return;
    if (analysis.decision === 'SELL') setSide('SHORT');
    else if (analysis.decision === 'BUY') setSide('LONG');
    if (analysis.risk?.recommendedLot) {
      setLotSize(String(Math.min(analysis.risk.recommendedLot, 0.5)));
    }
    setEntryInput(analysis.entry ? String(analysis.entry) : livePrice > 0 ? String(livePrice) : '');
    setSlInput(analysis.stopLoss ? String(analysis.stopLoss) : '');
    setTpInput(analysis.takeProfit ? String(analysis.takeProfit) : '');
    setOrderFeedback(null);
  }, [analysis?.analysisId, selectedSymbol]);

  const handlePlaceOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmittingOrder(true);
    setOrderFeedback(null);
    const parsedLot = Number(lotSize);
    const parsedEntry = Number(entryInput);
    const parsedSl = slInput.trim() ? Number(slInput) : null;
    const parsedTp = tpInput.trim() ? Number(tpInput) : null;

    const res = await onSubmitOrder({
      symbol: selectedSymbol,
      side,
      orderType,
      lotSize: Number.isFinite(parsedLot) && parsedLot > 0 ? parsedLot : 0.05,
      entryPrice: orderType === 'LIMIT' && Number.isFinite(parsedEntry) ? parsedEntry : undefined,
      stopLoss: parsedSl && Number.isFinite(parsedSl) ? parsedSl : null,
      takeProfit: parsedTp && Number.isFinite(parsedTp) ? parsedTp : null,
      analysisId: analysis?.analysisId ?? null,
      strategyName: analysis?.ensemble.strategyConfirmation ?? 'AI Ensemble Test',
    });

    setSubmittingOrder(false);
    if (res.ok) {
      setOrderFeedback({ type: 'ok', text: `${selectedSymbol} ${side} Test-Mode buyurtma Risk Engine tasdig‘i bilan ochildi.` });
    } else {
      setOrderFeedback({ type: 'err', text: res.error || 'Buyurtma rad etildi.' });
    }
  };

  const decisionColor = (d?: string) => {
    if (d === 'BUY') return 'text-emerald-600 dark:text-[#00E5A0]';
    if (d === 'SELL') return 'text-rose-600 dark:text-rose-400';
    if (d === 'DATA_UNAVAILABLE') return 'text-rose-500 dark:text-rose-400';
    return 'text-amber-600 dark:text-amber-300';
  };

  const isAnalyzingCurrent = analyzingSymbol === selectedSymbol;

  return (
    <aside className="rounded-xl border border-slate-200 dark:border-violet-500/25 bg-white dark:bg-[#0D1426] p-3.5 h-full flex flex-col gap-3">
      {/* Header & Tabs */}
      <div className="flex items-center justify-between gap-2 border-b border-slate-200 dark:border-violet-500/15 pb-2.5">
        <div className="flex items-center gap-1 p-0.5 rounded-lg bg-slate-100 dark:bg-[#080D1B] border border-slate-200 dark:border-violet-500/20">
          <button
            type="button"
            onClick={() => setActiveTab('analyst')}
            className={`px-2.5 py-1 text-[11px] font-semibold rounded-md transition-colors cursor-pointer ${
              activeTab === 'analyst'
                ? 'bg-white dark:bg-violet-500/25 text-slate-900 dark:text-violet-200'
                : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            AI Analyst
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('signals')}
            className={`px-2.5 py-1 text-[11px] font-semibold rounded-md transition-colors cursor-pointer font-mono tabular-nums ${
              activeTab === 'signals'
                ? 'bg-white dark:bg-sky-500/25 text-slate-900 dark:text-sky-200'
                : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            Signallar ({signals.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('order')}
            className={`px-2.5 py-1 text-[11px] font-semibold rounded-md transition-colors cursor-pointer ${
              activeTab === 'order'
                ? 'bg-white dark:bg-emerald-500/25 text-slate-900 dark:text-emerald-200'
                : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            Test Order
          </button>
        </div>

        <button
          type="button"
          onClick={() => void onRefreshUnified()}
          disabled={refreshing}
          className="p-1.5 rounded-lg border border-slate-200 dark:border-violet-500/25 text-slate-500 dark:text-slate-300 hover:text-sky-400 hover:border-sky-400/50 transition-colors cursor-pointer disabled:opacity-50"
          title="Backend holatini yangilash"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* TAB 1: UNIFIED AI ANALYST (CANONICAL BACKEND STATE) */}
      {activeTab === 'analyst' && (
        <div className="flex-1 flex flex-col gap-2.5 min-h-0 overflow-y-auto pr-0.5">
          {/* Primary Action Bar */}
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <Brain className="w-3.5 h-3.5 text-violet-500 dark:text-violet-400 shrink-0" />
                <span className="text-xs font-bold text-slate-900 dark:text-white font-mono">
                  {selectedSymbol} · {timeframe}
                </span>
              </div>
              <p className="text-[10px] font-mono text-slate-400 truncate mt-0.5">
                {analysis ? `ID: ${analysis.analysisId}` : 'Tahlil hali ishga tushmagan'}
              </p>
            </div>

            <button
              type="button"
              onClick={() => void onRunAnalysis(selectedSymbol, timeframe)}
              disabled={isAnalyzingCurrent}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-violet-600 hover:bg-violet-500 text-white transition-colors cursor-pointer disabled:opacity-60 shrink-0"
            >
              {isAnalyzingCurrent ? (
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Play className="w-3 h-3" />
              )}
              <span>{isAnalyzingCurrent ? 'Tahlil...' : 'Analyze Now'}</span>
            </button>
          </div>

          {!analysis ? (
            <div className="rounded-lg border border-slate-200 dark:border-violet-500/20 bg-slate-50 dark:bg-[#080D1B] p-4 text-center">
              <p className="text-xs font-medium text-slate-700 dark:text-slate-300">
                {selectedSymbol} uchun real OHLC tahlili kutilmoqda.
              </p>
              <p className="text-[11px] text-slate-500 mt-1">
                M1–W1, 18-strategiya Ensemble va Risk Engine ni ishga tushirish uchun <strong>Analyze Now</strong> tugmasini bosing.
              </p>
            </div>
          ) : analysis.status === 'DATA_UNAVAILABLE' ? (
            <div className="rounded-lg border border-rose-500/35 bg-rose-500/10 p-3 text-xs">
              <div className="flex items-center gap-1.5 font-bold font-mono text-rose-500 dark:text-rose-400">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>DATA UNAVAILABLE</span>
              </div>
              <p className="text-[11px] text-slate-700 dark:text-slate-300 mt-1.5 leading-relaxed">
                {analysis.error || analysis.explanationUz}
              </p>
            </div>
          ) : (
            <>
              {/* Decision & Confidence Headline */}
              <div className="rounded-lg border border-slate-200 dark:border-violet-500/20 bg-slate-50 dark:bg-[#080D1B] p-3">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <span className="text-[10px] uppercase tracking-wider text-slate-500 dark:text-slate-400">
                      Yakuniy Qaror
                    </span>
                    <div className={`text-xl font-bold font-mono tracking-tight flex items-center gap-1.5 ${decisionColor(analysis.decision)}`}>
                      {analysis.decision === 'BUY' && <TrendingUp className="w-4 h-4" />}
                      {analysis.decision === 'SELL' && <TrendingDown className="w-4 h-4" />}
                      <span>{analysis.decision}</span>
                    </div>
                  </div>
                  <div className="text-right font-mono tabular-nums">
                    <span className="text-[10px] uppercase tracking-wider text-slate-500 dark:text-slate-400 block">
                      Ishonch · R:R
                    </span>
                    <span className="text-sm font-bold text-slate-900 dark:text-white">
                      {analysis.confidence}%
                    </span>
                    <span className="text-xs text-sky-500 dark:text-sky-400 ml-1.5">
                      {analysis.riskRewardRatio ? `1:${analysis.riskRewardRatio}` : '—'}
                    </span>
                  </div>
                </div>

                {/* Data Source + Freshness + Regime */}
                <div className="mt-2 pt-2 border-t border-slate-200 dark:border-slate-800/80 flex flex-wrap items-center justify-between gap-x-2 gap-y-1 text-[10.5px] font-mono tabular-nums text-slate-500 dark:text-slate-400">
                  <span className="text-emerald-600 dark:text-[#00E5A0]">
                    {analysis.dataSource} · {analysis.barsCount} bar
                    {analysis.dataFreshnessSec !== null ? ` (${analysis.dataFreshnessSec}s)` : ''}
                  </span>
                  <span className="text-violet-600 dark:text-violet-300 font-sans font-medium">
                    {analysis.marketRegimeUz}
                  </span>
                </div>
              </div>

              {/* Trade Plan Grid (Entry / SL / TP / Lot) */}
              <div className="grid grid-cols-4 gap-1.5 font-mono tabular-nums">
                <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#080D1B] p-2">
                  <div className="text-[9.5px] text-slate-400">ENTRY</div>
                  <div className="text-xs font-semibold text-slate-900 dark:text-white mt-0.5 truncate">
                    {analysis.entry !== null ? formatPrice(analysis.entry) : '—'}
                  </div>
                </div>
                <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#080D1B] p-2">
                  <div className="text-[9.5px] text-rose-400">STOP LOSS</div>
                  <div className="text-xs font-semibold text-rose-600 dark:text-rose-400 mt-0.5 truncate">
                    {analysis.stopLoss !== null ? formatPrice(analysis.stopLoss) : '—'}
                  </div>
                </div>
                <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#080D1B] p-2">
                  <div className="text-[9.5px] text-emerald-400">TAKE PROFIT</div>
                  <div className="text-xs font-semibold text-emerald-600 dark:text-[#00E5A0] mt-0.5 truncate">
                    {analysis.takeProfit !== null ? formatPrice(analysis.takeProfit) : '—'}
                  </div>
                </div>
                <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#080D1B] p-2">
                  <div className="text-[9.5px] text-sky-400">REC LOT</div>
                  <div className="text-xs font-semibold text-sky-600 dark:text-sky-300 mt-0.5 truncate">
                    {analysis.risk ? analysis.risk.recommendedLot.toFixed(2) : '—'}
                  </div>
                </div>
              </div>

              {/* 18-Strategy Ensemble Vote Summary */}
              <div className="rounded-lg border border-slate-200 dark:border-violet-500/20 bg-slate-50 dark:bg-[#080D1B] p-2.5 text-[11px]">
                <div className="flex items-center justify-between font-mono tabular-nums">
                  <span className="font-sans font-semibold text-slate-700 dark:text-slate-200 flex items-center gap-1">
                    <Layers className="w-3.5 h-3.5 text-sky-400" />
                    Ensemble ({analysis.ensemble.activeStrategiesCount}/{analysis.ensemble.totalStrategiesCount})
                  </span>
                  <span>
                    <strong className="text-emerald-500">{analysis.ensemble.buyVotes}B</strong>
                    {' / '}
                    <strong className="text-rose-400">{analysis.ensemble.sellVotes}S</strong>
                    {' / '}
                    <strong className="text-slate-400">{analysis.ensemble.waitVotes}W</strong>
                  </span>
                </div>
                <p className="text-[10.5px] text-slate-500 dark:text-slate-400 mt-1 truncate" title={analysis.ensemble.strategyConfirmation}>
                  {analysis.ensemble.strategyConfirmation}
                </p>
                {analysis.ensemble.contradictionDetected && (
                  <p className="text-[10.5px] text-amber-500 dark:text-amber-300 mt-1">
                    Ziddiyat aniqlandi (BUY vs SELL) — xavfsizlik uchun WAIT berildi.
                  </p>
                )}
              </div>

              {/* MTF Alignment Strip */}
              <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#080D1B] p-2.5 text-[10.5px]">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="font-semibold text-slate-700 dark:text-slate-200">
                    MTF ({analysis.mtfSummary.availableTimeframes.length} TF)
                  </span>
                  <span className="font-mono tabular-nums text-sky-500 dark:text-sky-400 font-semibold">
                    Moslik: {analysis.mtfSummary.alignmentPct}%
                  </span>
                </div>
                <div className="grid grid-cols-4 gap-1 font-mono tabular-nums">
                  {analysis.mtfSummary.entries.map((m) => (
                    <div
                      key={m.timeframe}
                      className="px-1.5 py-1 rounded border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1426] flex items-center justify-between"
                    >
                      <span className="text-slate-500 dark:text-slate-400">{m.timeframe}</span>
                      <span
                        className={
                          m.bias === 'BULLISH'
                            ? 'text-emerald-500 font-bold'
                            : m.bias === 'BEARISH'
                              ? 'text-rose-400 font-bold'
                              : 'text-slate-400'
                        }
                      >
                        {m.bias === 'BULLISH' ? '▲' : m.bias === 'BEARISH' ? '▼' : '—'}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Technicals, Candlestick, SMC & Explanation */}
              <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#080D1B] p-2.5 text-[11px] space-y-1.5">
                {analysis.indicators && (
                  <div className="flex flex-wrap gap-x-2.5 gap-y-0.5 font-mono tabular-nums text-[10.5px] text-slate-600 dark:text-slate-300">
                    <span>RSI: <strong>{analysis.indicators.rsi14}</strong></span>
                    <span>ADX: <strong>{analysis.indicators.adx14}</strong></span>
                    <span>ATR: <strong>{analysis.indicators.atrPct}%</strong></span>
                    <span>Vol: <strong>{analysis.indicators.volumeRatio}x</strong></span>
                  </div>
                )}
                <p className="text-[10.5px] text-slate-600 dark:text-slate-300 leading-snug">
                  <strong className="text-slate-800 dark:text-slate-100">SMC:</strong> {analysis.smcSummary}
                </p>
                <p className="text-[10.5px] text-slate-600 dark:text-slate-300 leading-snug">
                  <strong className="text-slate-800 dark:text-slate-100">Shamlar:</strong> {analysis.candlestickSummary}
                </p>
                <p className="text-[10.5px] text-slate-500 dark:text-slate-400 leading-relaxed pt-1 border-t border-slate-200 dark:border-slate-800">
                  {analysis.explanationUz}
                </p>
              </div>

              {/* Honest LLM Status Box */}
              <div
                className={`rounded-lg border p-2.5 text-[10.5px] ${
                  analysis.llmStatus === 'ACTIVE'
                    ? 'border-emerald-500/30 bg-emerald-500/5'
                    : analysis.llmStatus === 'ERROR'
                      ? 'border-rose-500/30 bg-rose-500/5'
                      : 'border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#080D1B]'
                }`}
              >
                <div className="flex items-center justify-between font-mono">
                  <span className="flex items-center gap-1 font-sans font-semibold text-slate-700 dark:text-slate-200">
                    <Cpu className="w-3.5 h-3.5 text-violet-400" />
                    LLM Sharh ({analysis.llmStatus})
                  </span>
                  <span className="text-slate-400">{analysis.llmProvider ?? 'API yo‘q'}</span>
                </div>
                {analysis.llmSummaryUz ? (
                  <p className="mt-1 text-slate-700 dark:text-slate-200 leading-relaxed">
                    {analysis.llmSummaryUz}
                  </p>
                ) : analysis.llmError ? (
                  <p className="mt-1 text-rose-600 dark:text-rose-400 leading-snug">
                    {analysis.llmError}
                  </p>
                ) : (
                  <p className="mt-1 text-slate-500 dark:text-slate-400">
                    Quant dvigatel real OHLC asosida hisobladi. LLM sharhi uchun <strong>Analyze Now</strong> bosing.
                  </p>
                )}
              </div>

              {/* Risk Engine Verdict */}
              {analysis.risk && !analysis.risk.allowed && (
                <div className="rounded-lg border border-amber-500/35 bg-amber-500/10 p-2 text-[10.5px] text-amber-700 dark:text-amber-300 flex items-start gap-1.5">
                  <ShieldAlert className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  <span>Risk cheklovi: {analysis.risk.blockReasons.join(' · ')}</span>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* TAB 2: DEDUPLICATED CANONICAL SIGNAL FEED (IDENTICAL analysisId!) */}
      {activeTab === 'signals' && (
        <div className="flex-1 flex flex-col gap-2 min-h-0 overflow-y-auto pr-0.5">
          {signals.length === 0 ? (
            <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#080D1B] p-4 text-center text-xs text-slate-500">
              Hali tahlil signallari shakllanmadi. Skaner ishga tushishi yoki <strong>Analyze Now</strong> bosilishini kuting.
            </div>
          ) : (
            signals.map((sig) => {
              const isSelected = sig.symbol === selectedSymbol;
              return (
                <button
                  key={sig.symbol}
                  type="button"
                  onClick={() => {
                    onSelectSymbol(sig.symbol);
                    setActiveTab('analyst');
                  }}
                  className={`w-full text-left rounded-lg border p-2.5 transition-colors cursor-pointer ${
                    isSelected
                      ? 'border-violet-500/60 bg-violet-500/10 dark:bg-violet-500/10'
                      : 'border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#080D1B] hover:border-sky-400/50'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2 font-mono tabular-nums">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-bold text-slate-900 dark:text-white">{sig.symbol}</span>
                      <span className="text-[10px] text-slate-400">{sig.timeframe}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`text-xs font-bold ${decisionColor(sig.decision)}`}>
                        {sig.decision}
                      </span>
                      <span className="text-[11px] font-semibold text-slate-700 dark:text-slate-200">
                        {sig.confidence}%
                      </span>
                    </div>
                  </div>

                  {sig.entry !== null && (
                    <div className="mt-1.5 grid grid-cols-3 gap-1 text-[10px] font-mono tabular-nums text-slate-500 dark:text-slate-400">
                      <span>E: {formatPrice(sig.entry)}</span>
                      <span className="text-rose-500 dark:text-rose-400">
                        SL: {sig.stopLoss !== null ? formatPrice(sig.stopLoss) : '—'}
                      </span>
                      <span className="text-emerald-600 dark:text-[#00E5A0]">
                        TP: {sig.takeProfit !== null ? formatPrice(sig.takeProfit) : '—'}
                      </span>
                    </div>
                  )}

                  <div className="mt-1 flex items-center justify-between text-[10px] text-slate-400 font-mono">
                    <span className="truncate max-w-[165px]" title={sig.strategyConfirmation}>
                      {sig.strategyConfirmation}
                    </span>
                    <span>{sig.dataSource}</span>
                  </div>
                </button>
              );
            })
          )}
        </div>
      )}

      {/* TAB 3: SAFE TEST-MODE ORDER TICKET (BACKEND RISK-ENGINE VALIDATED) */}
      {activeTab === 'order' && (
        <form onSubmit={handlePlaceOrder} className="flex-1 flex flex-col gap-2.5 text-xs">
          <div className="rounded-lg border border-sky-500/30 bg-sky-500/10 p-2 text-[10.5px] text-sky-700 dark:text-sky-300 flex items-center justify-between">
            <span>Xavfsiz TEST rejimi · 8-o‘lchovli Risk Engine</span>
            <span className="font-mono font-bold">{selectedSymbol}</span>
          </div>

          <div className="grid grid-cols-2 gap-1.5">
            <button
              type="button"
              onClick={() => setSide('LONG')}
              className={`py-1.5 rounded-lg font-semibold border transition-colors cursor-pointer ${
                side === 'LONG'
                  ? 'border-emerald-500 bg-emerald-500/20 text-emerald-700 dark:text-[#00E5A0]'
                  : 'border-slate-200 dark:border-slate-800 text-slate-500'
              }`}
            >
              BUY / LONG
            </button>
            <button
              type="button"
              onClick={() => setSide('SHORT')}
              className={`py-1.5 rounded-lg font-semibold border transition-colors cursor-pointer ${
                side === 'SHORT'
                  ? 'border-rose-500 bg-rose-500/20 text-rose-700 dark:text-rose-400'
                  : 'border-slate-200 dark:border-slate-800 text-slate-500'
              }`}
            >
              SELL / SHORT
            </button>
          </div>

          <div className="grid grid-cols-2 gap-1.5">
            <button
              type="button"
              onClick={() => setOrderType('MARKET')}
              className={`py-1 rounded-md text-[11px] font-medium border cursor-pointer ${
                orderType === 'MARKET'
                  ? 'border-violet-500/60 bg-violet-500/15 text-violet-700 dark:text-violet-300'
                  : 'border-slate-200 dark:border-slate-800 text-slate-500'
              }`}
            >
              MARKET ({livePrice > 0 ? formatPrice(livePrice) : '—'})
            </button>
            <button
              type="button"
              onClick={() => setOrderType('LIMIT')}
              className={`py-1 rounded-md text-[11px] font-medium border cursor-pointer ${
                orderType === 'LIMIT'
                  ? 'border-violet-500/60 bg-violet-500/15 text-violet-700 dark:text-violet-300'
                  : 'border-slate-200 dark:border-slate-800 text-slate-500'
              }`}
            >
              LIMIT
            </button>
          </div>

          <div className="grid grid-cols-2 gap-2 font-mono tabular-nums">
            <label className="block">
              <span className="text-[10px] font-sans text-slate-500 dark:text-slate-400">Lot hajmi</span>
              <input
                type="number"
                step="0.01"
                min="0.01"
                value={lotSize}
                onChange={(e) => setLotSize(e.target.value)}
                className="mt-0.5 w-full px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#080D1B] text-slate-900 dark:text-white"
              />
            </label>
            <label className="block">
              <span className="text-[10px] font-sans text-slate-500 dark:text-slate-400">
                {orderType === 'LIMIT' ? 'Limit kirish' : 'Joriy narx'}
              </span>
              <input
                type="number"
                step="any"
                disabled={orderType === 'MARKET'}
                value={orderType === 'MARKET' ? (livePrice > 0 ? String(livePrice) : '') : entryInput}
                onChange={(e) => setEntryInput(e.target.value)}
                className="mt-0.5 w-full px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#080D1B] text-slate-900 dark:text-white disabled:opacity-60"
              />
            </label>
            <label className="block">
              <span className="text-[10px] font-sans text-rose-400">Stop-Loss</span>
              <input
                type="number"
                step="any"
                value={slInput}
                onChange={(e) => setSlInput(e.target.value)}
                placeholder="Avto ATR SL"
                className="mt-0.5 w-full px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#080D1B] text-slate-900 dark:text-white"
              />
            </label>
            <label className="block">
              <span className="text-[10px] font-sans text-emerald-400">Take-Profit</span>
              <input
                type="number"
                step="any"
                value={tpInput}
                onChange={(e) => setTpInput(e.target.value)}
                placeholder="Avto R:R TP"
                className="mt-0.5 w-full px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#080D1B] text-slate-900 dark:text-white"
              />
            </label>
          </div>

          {orderFeedback && (
            <div
              className={`rounded-lg border p-2 text-[11px] flex items-start gap-1.5 ${
                orderFeedback.type === 'ok'
                  ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-[#00E5A0]'
                  : 'border-rose-500/40 bg-rose-500/10 text-rose-700 dark:text-rose-300'
              }`}
            >
              {orderFeedback.type === 'ok' ? (
                <CheckCircle2 className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              ) : (
                <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              )}
              <span>{orderFeedback.text}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={submittingOrder || livePrice <= 0}
            className="mt-auto w-full py-2 rounded-lg font-semibold bg-gradient-to-r from-violet-600 to-sky-600 hover:from-violet-500 hover:to-sky-500 text-white transition-all cursor-pointer disabled:opacity-50"
          >
            {submittingOrder ? 'Risk tekshirilmoqda...' : `${side} Test Order Yuborish`}
          </button>
        </form>
      )}

      {/* Footer Quick Link */}
      <div className="pt-2 border-t border-slate-200 dark:border-violet-500/15 flex items-center justify-between text-[10.5px]">
        <button
          type="button"
          onClick={() => onNavigate('analyst')}
          className="text-violet-600 dark:text-violet-300 hover:underline cursor-pointer flex items-center gap-1"
        >
          <Activity className="w-3 h-3" />
          To‘liq AI Analyst Hub
        </button>
        <button
          type="button"
          onClick={() => onNavigate('backtest')}
          className="text-sky-600 dark:text-sky-400 hover:underline cursor-pointer"
        >
          Backtest Lab →
        </button>
      </div>
    </aside>
  );
};
