import React, { useEffect, useMemo, useState } from 'react';
import {
  BacktestParams,
  BacktestResult,
  CandlePoint,
  MarketPair,
  ServerConfig,
  Timeframe,
  TradingStyle,
} from '../types/trading';
import { formatCurrency, formatPrice } from '../data/initialData';
import { generateMt5Candles, runBacktestEngine } from '../utils/backtestEngine';
import { Play, Sparkles, RefreshCw } from 'lucide-react';

interface BacktestViewProps {
  pairs: MarketPair[];
  serverConfig: ServerConfig;
  initialParams?: Partial<BacktestParams> | null;
  onResultChange?: (res: BacktestResult) => void;
}

interface AiBacktestReport {
  verdict: string;
  summary: string;
  strengths: string[];
  weaknesses: string[];
  recommendedTimeframe: string;
  suggestedSlPct: number;
  suggestedTpPct: number;
}

const TIMEFRAMES: Timeframe[] = ['M1', 'M5', 'M15', 'H1', 'H4', 'D1', 'W1'];

export const BacktestView: React.FC<BacktestViewProps> = ({
  pairs,
  serverConfig,
  initialParams,
  onResultChange,
}) => {
  const [params, setParams] = useState<BacktestParams>({
    symbol: initialParams?.symbol || pairs[0].symbol,
    style: initialParams?.style || 'SCALPING',
    timeframe: initialParams?.timeframe || 'M5',
    barsCount: initialParams?.barsCount || 300,
    strategyId: initialParams?.strategyId || 'all_6_confluence',
    lotSize: initialParams?.lotSize || 0.2,
    stopLossPct: initialParams?.stopLossPct || 0.6,
    takeProfitPct: initialParams?.takeProfitPct || 1.4,
    initialCapital: initialParams?.initialCapital || 10000,
  });

  const [result, setResult] = useState<BacktestResult | null>(null);
  const [running, setRunning] = useState(false);
  const [aiReport, setAiReport] = useState<AiBacktestReport | null>(null);
  const [analyzingAi, setAnalyzingAi] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  const executeBacktest = async (overrideParams?: BacktestParams) => {
    const activeParams = overrideParams ?? params;
    setRunning(true);
    setAiReport(null);

    let candles: CandlePoint[] = [];
    let dataSource: 'MT5 Real Tarix' | 'Simulyatsiya (MT5 ulanmagan)' =
      'Simulyatsiya (MT5 ulanmagan)';

    const primaryBase = serverConfig.apiBaseUrl.replace(/\/$/, '');
    const candidates =
      primaryBase === 'http://127.0.0.1:8000'
        ? [primaryBase, 'http://localhost:8000']
        : [primaryBase];

    for (const base of candidates) {
      try {
        const controller = new AbortController();
        const timeout = window.setTimeout(() => controller.abort(), 1800);
        const url = `${base}/api/candles?symbol=${encodeURIComponent(
          activeParams.symbol
        )}&timeframe=${activeParams.timeframe}&count=${activeParams.barsCount}`;
        const res = await fetch(url, { signal: controller.signal });
        window.clearTimeout(timeout);
        if (res.ok) {
          const json = await res.json();
          if (Array.isArray(json.candles) && json.candles.length > 20) {
            candles = json.candles;
            dataSource = 'MT5 Real Tarix';
            break;
          }
        }
      } catch {
        // Try next candidate or fallback
      }
    }

    if (candles.length === 0) {
      const pair = pairs.find((p) => p.symbol === activeParams.symbol) ?? pairs[0];
      candles = generateMt5Candles(
        activeParams.symbol,
        pair.price,
        activeParams.timeframe,
        activeParams.barsCount
      );
    }

    const computed = runBacktestEngine(activeParams, candles, dataSource);
    setResult(computed);
    if (onResultChange) onResultChange(computed);
    setRunning(false);
  };

  useEffect(() => {
    if (initialParams) {
      const merged: BacktestParams = {
        ...params,
        ...initialParams,
      };
      setParams(merged);
      executeBacktest(merged);
    } else if (!result) {
      executeBacktest();
    }
  }, [initialParams]);

  const handleStyleSwitch = (style: TradingStyle) => {
    const next: BacktestParams = {
      ...params,
      style,
      timeframe: style === 'SCALPING' ? 'M5' : 'H4',
      stopLossPct: style === 'SCALPING' ? 0.6 : 1.8,
      takeProfitPct: style === 'SCALPING' ? 1.4 : 4.2,
    };
    setParams(next);
  };

  const handleAnalyzeWithAi = async () => {
    if (!result || analyzingAi) return;
    setAnalyzingAi(true);
    setAiError(null);
    try {
      const payload = {
        params: result.params,
        dataSource: result.dataSource,
        totalTrades: result.totalTrades,
        winTrades: result.winTrades,
        lossTrades: result.lossTrades,
        winRatePct: Number(result.winRatePct.toFixed(2)),
        netProfitUsd: Number(result.netProfitUsd.toFixed(2)),
        netReturnPct: Number(result.netReturnPct.toFixed(2)),
        profitFactor: Number(result.profitFactor.toFixed(2)),
        maxDrawdownPct: Number(result.maxDrawdownPct.toFixed(2)),
        sampleTrades: result.trades.slice(0, 12),
      };

      const res = await fetch('/api/ai/backtest-analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ result: payload }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setAiReport(data);
    } catch (err) {
      setAiError(err instanceof Error ? err.message : 'AI tahlilida xatolik.');
    } finally {
      setAnalyzingAi(false);
    }
  };

  const applyAiOptimization = () => {
    if (!aiReport) return;
    const validTf = TIMEFRAMES.includes(aiReport.recommendedTimeframe as Timeframe)
      ? (aiReport.recommendedTimeframe as Timeframe)
      : params.timeframe;
    const next: BacktestParams = {
      ...params,
      timeframe: validTf,
      stopLossPct: aiReport.suggestedSlPct > 0 ? aiReport.suggestedSlPct : params.stopLossPct,
      takeProfitPct: aiReport.suggestedTpPct > 0 ? aiReport.suggestedTpPct : params.takeProfitPct,
    };
    setParams(next);
    executeBacktest(next);
  };

  const equitySvg = useMemo(() => {
    if (!result || result.equityCurve.length < 2) return null;
    const w = 780;
    const h = 210;
    const pad = 18;
    const values = result.equityCurve.map((e) => e.equity);
    const min = Math.min(...values, result.params.initialCapital) * 0.995;
    const max = Math.max(...values, result.params.initialCapital) * 1.005;

    const pts = result.equityCurve.map((pt, i) => {
      const x = pad + (i / (result.equityCurve.length - 1)) * (w - pad * 2);
      const y = pad + (1 - (pt.equity - min) / (max - min || 1)) * (h - pad * 2);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    });

    const baseLineY =
      pad +
      (1 - (result.params.initialCapital - min) / (max - min || 1)) * (h - pad * 2);
    const isProfit = result.netProfitUsd >= 0;

    return {
      w,
      h,
      polyline: pts.join(' '),
      baseLineY,
      stroke: isProfit ? '#22C58B' : '#F05A70',
    };
  }, [result]);

  return (
    <div className="space-y-6">
      {/* Configuration Panel */}
      <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#131B2B] neon-surface p-6">
        <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-200 dark:border-slate-800">
          <div>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
              MT5 Tarixiy Ma’lumotlar va Backtest Laboratoriyasi
            </h2>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              Kompyuterdagi MT5 tarixiy shamlari asosida 6 ta AI Miya strategiyasi (SMC LuxAlgo, PAC34 Pullback, EMA/RSI Div, VWAP) bo‘yicha backtest o‘tkazing.
            </p>
          </div>

          <div className="flex items-center gap-1 p-1 rounded-lg bg-slate-100 dark:bg-[#0D1320] border border-slate-200 dark:border-slate-800">
            <button
              type="button"
              onClick={() => handleStyleSwitch('SCALPING')}
              className={`px-3.5 py-1.5 text-xs font-semibold rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                params.style === 'SCALPING'
                  ? 'bg-white dark:bg-[#F25F8C]/20 text-slate-900 dark:text-[#FF7AA5]'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              Skalping (M1–M15)
            </button>
            <button
              type="button"
              onClick={() => handleStyleSwitch('LONG_TERM')}
              className={`px-3.5 py-1.5 text-xs font-semibold rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                params.style === 'LONG_TERM'
                  ? 'bg-white dark:bg-[#F25F8C]/20 text-slate-900 dark:text-[#FF7AA5]'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              Uzoq muddatli (H4–W1)
            </button>
          </div>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            executeBacktest();
          }}
          className="mt-5 grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3 items-end"
        >
          <div>
            <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">
              Instrument
            </label>
            <select
              value={params.symbol}
              onChange={(e) => setParams({ ...params, symbol: e.target.value })}
              className="w-full px-2.5 py-2 text-xs font-semibold rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#0D1320] text-slate-900 dark:text-white"
            >
              {pairs.map((p) => (
                <option key={p.symbol} value={p.symbol}>
                  {p.symbol}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">
              Taymfreym
            </label>
            <select
              value={params.timeframe}
              onChange={(e) => setParams({ ...params, timeframe: e.target.value as Timeframe })}
              className="w-full px-2.5 py-2 text-xs font-mono rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#0D1320] text-slate-900 dark:text-white"
            >
              {TIMEFRAMES.map((tf) => (
                <option key={tf} value={tf}>
                  {tf}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">
              Shamlar soni
            </label>
            <select
              value={params.barsCount}
              onChange={(e) => setParams({ ...params, barsCount: Number(e.target.value) })}
              className="w-full px-2.5 py-2 text-xs font-mono rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#0D1320] text-slate-900 dark:text-white"
            >
              {[150, 300, 600, 1200].map((cnt) => (
                <option key={cnt} value={cnt}>
                  {cnt} bar
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">
              AI Strategiyasi
            </label>
            <select
              value={params.strategyId}
              onChange={(e) =>
                setParams({
                  ...params,
                  strategyId: e.target.value as BacktestParams['strategyId'],
                })
              }
              className="w-full px-2.5 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#0D1320] text-slate-900 dark:text-white"
            >
              <option value="all_6_confluence">6-Strategiya Konfluensiya</option>
              <option value="smc_luxalgo">SMC LuxAlgo (BOS/CHoCH + OB)</option>
              <option value="scalp_pullback">Scalping PullBack R1.1 (PAC34)</option>
              <option value="ema_ribbon_rsi">EMA 20/50/100/200 + RSI Div</option>
              <option value="vwap_bands">VWAP Stdev Bands (±2.01σ)</option>
            </select>
          </div>

          <div>
            <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">
              Lot hajmi
            </label>
            <input
              type="number"
              step="0.01"
              min="0.01"
              value={params.lotSize}
              onChange={(e) => setParams({ ...params, lotSize: Number(e.target.value) || 0.1 })}
              className="w-full px-2.5 py-2 text-xs font-mono tabular-nums rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#0D1320] text-slate-900 dark:text-white"
            />
          </div>

          <div>
            <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">
              SL (%)
            </label>
            <input
              type="number"
              step="0.1"
              min="0.1"
              value={params.stopLossPct}
              onChange={(e) => setParams({ ...params, stopLossPct: Number(e.target.value) || 0.5 })}
              className="w-full px-2.5 py-2 text-xs font-mono tabular-nums rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#0D1320] text-slate-900 dark:text-white"
            />
          </div>

          <div>
            <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">
              TP (%)
            </label>
            <input
              type="number"
              step="0.1"
              min="0.1"
              value={params.takeProfitPct}
              onChange={(e) => setParams({ ...params, takeProfitPct: Number(e.target.value) || 1 })}
              className="w-full px-2.5 py-2 text-xs font-mono tabular-nums rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#0D1320] text-slate-900 dark:text-white"
            />
          </div>

          <button
            type="submit"
            disabled={running}
            className="inline-flex items-center justify-center gap-1.5 py-2 px-4 text-xs font-semibold rounded-lg bg-gradient-to-r from-[#F25F8C] via-[#EB6B7B] to-[#E87769] text-slate-950 hover:brightness-110 neon-glow-cyan cursor-pointer whitespace-nowrap"
          >
            <Play className="w-3.5 h-3.5" />
            <span>{running ? 'Hisob...' : 'Backtest boshlash'}</span>
          </button>
        </form>
      </section>

      {result && (
        <>
          {/* Metrics Row */}
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#131B2B] neon-surface p-5">
              <div className="text-xs text-slate-500 dark:text-slate-400">Sof natija (Net PnL)</div>
              <div
                className={`mt-2 text-2xl font-semibold font-mono tabular-nums ${
                  result.netProfitUsd >= 0
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : 'text-red-600 dark:text-rose-400'
                }`}
              >
                {result.netProfitUsd >= 0 ? '+' : ''}
                {formatCurrency(result.netProfitUsd)}
              </div>
              <div className="mt-1.5 text-xs font-mono tabular-nums text-slate-500 dark:text-slate-400">
                Daromad: {result.netReturnPct >= 0 ? '+' : ''}
                {result.netReturnPct.toFixed(2)}% · {result.dataSource}
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#131B2B] neon-surface p-5">
              <div className="text-xs text-slate-500 dark:text-slate-400">Yutuq darajasi (Win Rate)</div>
              <div className="mt-2 text-2xl font-semibold font-mono tabular-nums text-slate-900 dark:text-white">
                {result.winRatePct.toFixed(1)}%
              </div>
              <div className="mt-1.5 text-xs font-mono tabular-nums text-slate-500 dark:text-slate-400">
                Jami: {result.totalTrades} ta · Foyda: {result.winTrades} / Zarar: {result.lossTrades}
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#131B2B] neon-surface p-5">
              <div className="text-xs text-slate-500 dark:text-slate-400">Profit Factor</div>
              <div className="mt-2 text-2xl font-semibold font-mono tabular-nums text-[#C8285E] dark:text-[#FF7AA5]">
                {result.profitFactor.toFixed(2)}
              </div>
              <div className="mt-1.5 text-xs font-mono tabular-nums text-slate-500 dark:text-slate-400">
                Yakuniy balans: {formatCurrency(result.finalCapital)}
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#131B2B] neon-surface p-5">
              <div className="text-xs text-slate-500 dark:text-slate-400">Maksimal pasayish (DD)</div>
              <div className="mt-2 text-2xl font-semibold font-mono tabular-nums text-amber-600 dark:text-amber-400">
                -{result.maxDrawdownPct.toFixed(2)}%
              </div>
              <div className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">
                {result.params.symbol} · {result.params.timeframe} ({result.candles.length} sham)
              </div>
            </div>
          </div>

          {/* Equity Curve + AI Backtest Analysis */}
          <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-stretch">
            <section className="xl:col-span-7 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#131B2B] neon-surface p-5">
              <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
                <h3 className="text-base font-semibold text-slate-900 dark:text-white">
                  Balans o‘sish egri chizig‘i (Equity Curve)
                </h3>
                <span className="text-xs font-mono tabular-nums text-slate-500 dark:text-slate-400">
                  Boshlang‘ich: {formatCurrency(result.params.initialCapital)}
                </span>
              </div>

              {equitySvg && (
                <div className="mt-4">
                  <svg viewBox={`0 0 ${equitySvg.w} ${equitySvg.h}`} className="w-full h-56 select-none">
                    <line
                      x1="18"
                      y1={equitySvg.baseLineY}
                      x2={equitySvg.w - 18}
                      y2={equitySvg.baseLineY}
                      stroke="currentColor"
                      className="text-slate-300 dark:text-slate-700"
                      strokeDasharray="4 4"
                      strokeWidth="1"
                    />
                    <polyline
                      fill="none"
                      stroke={equitySvg.stroke}
                      strokeWidth="2.4"
                      points={equitySvg.polyline}
                    />
                  </svg>
                </div>
              )}
            </section>

            <section className="xl:col-span-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#131B2B] neon-surface p-5 flex flex-col justify-between">
              <div className="space-y-4">
                <div className="flex items-center justify-between gap-2 pb-3 border-b border-slate-200 dark:border-slate-800">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-[#C8285E] dark:text-[#FF7AA5]" />
                    <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                      AI Backtest Xulosasi
                    </h3>
                  </div>
                  <button
                    type="button"
                    onClick={handleAnalyzeWithAi}
                    disabled={analyzingAi}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-[#F25F8C]/45 bg-[#F25F8C]/12 text-[#C8285E] dark:text-[#FF7AA5] hover:bg-[#F25F8C]/20 cursor-pointer whitespace-nowrap"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${analyzingAi ? 'animate-spin' : ''}`} />
                    <span>{analyzingAi ? 'Tahlil...' : 'AI Tahlil Qilsin'}</span>
                  </button>
                </div>

                {aiError && (
                  <p className="text-xs text-rose-600 dark:text-rose-400">{aiError}</p>
                )}

                {!aiReport ? (
                  <p className="text-xs text-slate-500 dark:text-slate-400 py-8 text-center">
                    Backtest natijalarini AI ga yuboring — AI kuchli va zaif tomonlarni aniqlab, optimal taymfreym hamda SL/TP nisbatini tavsiya qiladi.
                  </p>
                ) : (
                  <div className="space-y-3 text-xs">
                    <div className="flex items-center justify-between font-mono">
                      <span className="text-slate-500 dark:text-slate-400">Hukm:</span>
                      <span className="font-semibold text-[#C8285E] dark:text-[#FF7AA5]">
                        {aiReport.verdict}
                      </span>
                    </div>
                    <p className="text-sm text-slate-800 dark:text-slate-200 leading-relaxed">
                      {aiReport.summary}
                    </p>
                    <div className="space-y-1 text-emerald-700 dark:text-emerald-400">
                      {aiReport.strengths?.map((s, i) => (
                        <div key={i}>+ {s}</div>
                      ))}
                    </div>
                    <div className="space-y-1 text-amber-700 dark:text-amber-400">
                      {aiReport.weaknesses?.map((w, i) => (
                        <div key={i}>- {w}</div>
                      ))}
                    </div>
                    <div className="pt-2 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2">
                      <span className="font-mono text-slate-500 dark:text-slate-400">
                        Tavsiya: {aiReport.recommendedTimeframe} · SL {aiReport.suggestedSlPct}% · TP{' '}
                        {aiReport.suggestedTpPct}%
                      </span>
                      <button
                        type="button"
                        onClick={applyAiOptimization}
                        className="px-3 py-1.5 text-xs font-semibold rounded bg-emerald-600 dark:bg-emerald-500 text-white dark:text-slate-950 hover:opacity-90 cursor-pointer whitespace-nowrap"
                      >
                        Qo‘llash
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </section>
          </div>

          {/* Historical Trade Log */}
          <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#131B2B] neon-surface overflow-hidden">
            <div className="p-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <h3 className="text-base font-semibold text-slate-900 dark:text-white">
                Tarixiy sinov bitimlari jurnali
              </h3>
              <span className="text-xs font-mono text-slate-500 dark:text-slate-400">
                {result.trades.length} ta bitim
              </span>
            </div>
            <div className="overflow-x-auto max-h-80 overflow-y-auto">
              {result.trades.length === 0 ? (
                <div className="p-8 text-center text-xs text-slate-500 dark:text-slate-400">
                  Tanlangan parametrlar bo‘yicha tarixda kirish signali topilmadi. Shamlar sonini yoki strategiyani o‘zgartiring.
                </div>
              ) : (
                <table className="w-full text-left border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-800 text-xs text-slate-500 dark:text-slate-400">
                      <th className="py-2.5 px-5">#</th>
                      <th className="py-2.5 px-4">Yo‘nalish</th>
                      <th className="py-2.5 px-4">Kirish vaqti</th>
                      <th className="py-2.5 px-4">Chiqish vaqti</th>
                      <th className="py-2.5 px-4 text-right">Kirish narxi</th>
                      <th className="py-2.5 px-4 text-right">Chiqish narxi</th>
                      <th className="py-2.5 px-4">Sabab</th>
                      <th className="py-2.5 px-5 text-right">Natija</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-slate-800/80 font-mono tabular-nums text-xs">
                    {result.trades.map((t) => (
                      <tr key={t.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                        <td className="py-2.5 px-5 text-slate-400">{t.id}</td>
                        <td
                          className={`py-2.5 px-4 font-semibold ${
                            t.side === 'LONG'
                              ? 'text-emerald-600 dark:text-emerald-400'
                              : 'text-red-600 dark:text-rose-400'
                          }`}
                        >
                          {t.side === 'LONG' ? 'BUY' : 'SELL'}
                        </td>
                        <td className="py-2.5 px-4 text-slate-600 dark:text-slate-300">{t.entryTime}</td>
                        <td className="py-2.5 px-4 text-slate-600 dark:text-slate-300">{t.exitTime}</td>
                        <td className="py-2.5 px-4 text-right">{formatPrice(t.entryPrice)}</td>
                        <td className="py-2.5 px-4 text-right">{formatPrice(t.exitPrice)}</td>
                        <td className="py-2.5 px-4 font-sans text-slate-500 dark:text-slate-400">
                          {t.exitReason}
                        </td>
                        <td
                          className={`py-2.5 px-5 text-right font-semibold ${
                            t.pnlUsd >= 0
                              ? 'text-emerald-600 dark:text-emerald-400'
                              : 'text-red-600 dark:text-rose-400'
                          }`}
                        >
                          {t.pnlUsd >= 0 ? '+' : ''}
                          {formatCurrency(t.pnlUsd)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </section>
        </>
      )}
    </div>
  );
};
