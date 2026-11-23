import React, { useMemo, useState } from 'react';
import { AiScanSignal, MarketPair, StrategyBrainSnapshot } from '../types/trading';
import { formatPrice } from '../data/initialData';
import { ArrowUpRight, Pause, Play, RefreshCw, Search, Sparkles } from 'lucide-react';
import { apiFetch } from '../utils/apiClient';

interface ScannerViewProps {
  pairs: MarketPair[];
  allPairBrains?: StrategyBrainSnapshot[];
  scannerStatus?: 'RUNNING' | 'PAUSED';
  lastAnalysisTime?: string | null;
  onToggleScanner?: (pause: boolean) => void;
  onTradePair: (symbol: string) => void;
  onExecuteSignal: (signal: AiScanSignal) => void;
}

export const ScannerView: React.FC<ScannerViewProps> = ({
  pairs,
  allPairBrains = [],
  scannerStatus = 'RUNNING',
  lastAnalysisTime = null,
  onToggleScanner,
  onTradePair,
  onExecuteSignal,
}) => {
  const [query, setQuery] = useState('');
  const [trendFilter, setTrendFilter] = useState<'ALL' | 'Ko‘tarilish' | 'Pasayish' | 'Yonlama'>('ALL');
  const [scanStyle, setScanStyle] = useState<'ALL' | 'Skalping' | 'Uzoq muddatli'>('ALL');
  const [aiSignals, setAiSignals] = useState<AiScanSignal[]>([]);
  const [overallSummary, setOverallSummary] = useState<string>('');
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);

  const brainBySymbol = useMemo(() => {
    const map = new Map<string, StrategyBrainSnapshot>();
    for (const b of allPairBrains) map.set(b.symbol, b);
    return map;
  }, [allPairBrains]);

  const filtered = useMemo(() => {
    return pairs.filter((p) => {
      const matchTrend = trendFilter === 'ALL' || p.trend === trendFilter;
      const q = query.trim().toLowerCase();
      const matchQuery = !q || p.symbol.toLowerCase().includes(q) || p.base.toLowerCase().includes(q);
      return matchTrend && matchQuery;
    });
  }, [pairs, query, trendFilter]);

  const handleRunAiScan = async () => {
    if (scanning) return;
    setScanning(true);
    setScanError(null);
    try {
      const enrichedPairs = pairs.map((p) => ({
        ...p,
        strategyBrain: brainBySymbol.get(p.symbol) ?? null,
      }));
      const res = await apiFetch('/api/ai/scan', {
        method: 'POST',
        body: JSON.stringify({
          pairs: enrichedPairs,
          styleFilter: scanStyle === 'ALL' ? 'Skalping va Uzoq muddatli' : scanStyle,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setOverallSummary(data.overallSummary || '');
      setAiSignals(Array.isArray(data.signals) ? data.signals : []);
    } catch (err) {
      setScanError(err instanceof Error ? err.message : 'AI skanerlashda xatolik.');
    } finally {
      setScanning(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* AI Full Market Scanner Section */}
      <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#131B2B] neon-surface p-5">
        <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-200 dark:border-slate-800">
          <div>
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-[#C8285E] dark:text-[#FF7AA5]" />
              <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                AI To‘liq Bozor Skaneri (12-Strategiya Konfluensiyasi)
              </h2>
            </div>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Holat:{' '}
              <span
                className={
                  scannerStatus === 'RUNNING'
                    ? 'font-mono font-semibold text-emerald-500'
                    : 'font-mono font-semibold text-amber-500'
                }
              >
                {scannerStatus === 'RUNNING' ? '24/7 Faol' : 'Pauzada'}
              </span>
              {lastAnalysisTime && (
                <span className="font-mono tabular-nums">
                  {' '}
                  · Oxirgi tahlil: {new Date(lastAnalysisTime).toLocaleTimeString('en-GB')}
                </span>
              )}
              {' '}· SMC, PAC34, Leviathan BOS, Geraked UT/ZLSMA, Double Supertrend, ADX va Ichimoku Sweep.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {onToggleScanner && (
              <button
                type="button"
                onClick={() => onToggleScanner(scannerStatus === 'RUNNING')}
                className={`inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  scannerStatus === 'RUNNING'
                    ? 'border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-300 hover:bg-amber-500/20'
                    : 'border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-300 hover:bg-emerald-500/20'
                }`}
              >
                {scannerStatus === 'RUNNING' ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                <span>{scannerStatus === 'RUNNING' ? 'Pauza' : 'Davom ettirish'}</span>
              </button>
            )}
            <div className="flex items-center gap-1 p-1 rounded-lg bg-slate-100 dark:bg-[#0D1320] border border-slate-200 dark:border-slate-800">
              {(['ALL', 'Skalping', 'Uzoq muddatli'] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setScanStyle(s)}
                  className={`px-2.5 py-1 text-xs font-medium rounded-md cursor-pointer whitespace-nowrap ${
                    scanStyle === s
                      ? 'bg-white dark:bg-[#F25F8C]/20 text-slate-900 dark:text-[#FF7AA5]'
                      : 'text-slate-500 dark:text-slate-400'
                  }`}
                >
                  {s === 'ALL' ? 'Ikkalasi' : s}
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={handleRunAiScan}
              disabled={scanning || scannerStatus === 'PAUSED'}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-lg bg-gradient-to-r from-[#F25F8C] via-[#EB6B7B] to-[#E87769] text-slate-950 hover:brightness-110 disabled:opacity-50 neon-glow-cyan cursor-pointer whitespace-nowrap"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${scanning ? 'animate-spin' : ''}`} />
              <span>{scanning ? 'Skanerlanmoqda...' : 'To‘liq AI Skaner boshlash'}</span>
            </button>
          </div>
        </div>

        {scanError && <p className="mt-3 text-xs text-rose-600 dark:text-rose-400">{scanError}</p>}

        {overallSummary && (
          <p className="mt-4 text-sm text-slate-700 dark:text-slate-200 bg-slate-50 dark:bg-[#0D1320] border border-slate-200 dark:border-slate-800 rounded-lg p-3.5">
            {overallSummary}
          </p>
        )}

        {aiSignals.length > 0 && (
          <div className="mt-4 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {aiSignals.map((sig, idx) => (
              <div
                key={`${sig.symbol}-${idx}`}
                className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-[#0D1320] flex flex-col justify-between gap-3"
              >
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="font-semibold text-sm text-slate-900 dark:text-white">
                      {sig.symbol}
                      <span className="ml-2 text-xs font-normal text-slate-500 dark:text-slate-400">
                        · {sig.style} · {sig.timeframe}
                      </span>
                    </div>
                    <span
                      className={`text-xs font-semibold font-mono tabular-nums ${
                        sig.signal === 'BUY'
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : sig.signal === 'SELL'
                            ? 'text-red-600 dark:text-rose-400'
                            : 'text-amber-600 dark:text-amber-400'
                      }`}
                    >
                      {sig.signal} · Ball {sig.confidencePct}/100
                    </span>
                  </div>

                  <div className="text-xs font-mono tabular-nums text-slate-500 dark:text-slate-400">
                    Kirish: {sig.entry} · SL: {sig.stopLoss} · TP: {sig.takeProfit}
                  </div>
                  <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                    {sig.summary}
                  </p>
                </div>

                {(sig.signal === 'BUY' || sig.signal === 'SELL') && (
                  <button
                    type="button"
                    onClick={() => onExecuteSignal(sig)}
                    className="inline-flex items-center justify-center gap-1.5 w-full py-2 text-xs font-semibold rounded-lg border border-[#F25F8C]/45 text-[#C8285E] dark:text-[#FF7AA5] hover:bg-[#F25F8C]/15 cursor-pointer"
                  >
                    <Play className="w-3 h-3" />
                    <span>MT5 da darhol ochish</span>
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Raw MT5 Market Watch Table */}
      <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#131B2B] neon-surface overflow-hidden">
        <div className="p-5 flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800">
          <div className="flex flex-wrap items-center gap-4">
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              MT5 Bozor Kuzatuv Jadvali
            </h2>
            <div className="flex items-center gap-1 p-1 rounded-lg bg-slate-100 dark:bg-[#0D1320] border border-slate-200 dark:border-slate-800">
              {(
                [
                  ['ALL', 'Barchasi'],
                  ['Ko‘tarilish', 'Ko‘tarilish'],
                  ['Pasayish', 'Pasayish'],
                  ['Yonlama', 'Yonlama'],
                ] as const
              ).map(([val, label]) => (
                <button
                  key={val}
                  type="button"
                  onClick={() => setTrendFilter(val)}
                  className={`px-3 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    trendFilter === val
                      ? 'bg-white dark:bg-[#F25F8C]/20 text-slate-900 dark:text-[#FF7AA5]'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="relative w-full sm:w-64">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Instrument qidirish (XAUUSD)..."
              className="w-full pl-9 pr-3 py-1.5 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#0D1320] text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#F25F8C]"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          {filtered.length === 0 ? (
            <div className="py-12 px-6 text-center">
              <p className="text-sm font-medium text-slate-900 dark:text-white">
                Instrument topilmadi
              </p>
            </div>
          ) : (
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 text-xs font-medium text-slate-500 dark:text-slate-400">
                  <th className="py-3 px-5">Instrument</th>
                  <th className="py-3 px-4 text-right">Kotirovka</th>
                  <th className="py-3 px-4 text-right">24s O‘zgarish</th>
                  <th className="py-3 px-4 text-right">24s Diapazon</th>
                  <th className="py-3 px-4 text-right">Spred</th>
                  <th className="py-3 px-4 text-right">RSI (14)</th>
                  <th className="py-3 px-4">Trend</th>
                  <th className="py-3 px-4">AI Miya (12 Strategiya)</th>
                  <th className="py-3 px-5 text-right">Terminal</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800/80 text-sm">
                {filtered.map((p) => {
                  const pos = p.change24h >= 0;
                  const brain = brainBySymbol.get(p.symbol);
                  return (
                    <tr
                      key={p.symbol}
                      className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors"
                    >
                      <td className="py-3.5 px-5 font-semibold text-slate-900 dark:text-slate-100">
                        {p.symbol}
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono tabular-nums text-slate-900 dark:text-slate-100">
                        {formatPrice(p.price)}
                      </td>
                      <td
                        className={`py-3.5 px-4 text-right font-mono tabular-nums font-medium ${
                          pos
                            ? 'text-emerald-600 dark:text-emerald-400'
                            : 'text-rose-600 dark:text-rose-400'
                        }`}
                      >
                        {pos ? '+' : ''}
                        {p.change24h.toFixed(2)}%
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono tabular-nums text-xs text-slate-500 dark:text-slate-400">
                        {formatPrice(p.low24h)} – {formatPrice(p.high24h)}
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono tabular-nums text-[#C8285E] dark:text-[#FF7AA5]">
                        {p.spreadPoints} pt
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono tabular-nums text-slate-700 dark:text-slate-300">
                        {(brain?.rsiBars.rsi14 ?? p.rsi14).toFixed(1)}
                      </td>
                      <td className="py-3.5 px-4 text-xs font-medium">
                        <span
                          className={
                            p.trend === 'Ko‘tarilish'
                              ? 'text-emerald-600 dark:text-emerald-400'
                              : p.trend === 'Pasayish'
                                ? 'text-rose-600 dark:text-rose-400'
                                : 'text-amber-600 dark:text-amber-400'
                          }
                        >
                          {p.trend}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-xs font-mono tabular-nums text-slate-600 dark:text-slate-300">
                        {brain ? (
                          <div className="space-y-0.5">
                            <div>
                              {brain.regime ? `${brain.regime.regime} · ` : ''}
                              {brain.smc.swingBias} · UT:{brain.gerakedMt5.utBotSignal} · ST:
                              {brain.alorseSuite.doubleSupertrend === 'DOUBLE_BULL'
                                ? 'BULL'
                                : brain.alorseSuite.doubleSupertrend === 'DOUBLE_BEAR'
                                  ? 'BEAR'
                                  : 'MIX'}{' '}
                              · ADX:{brain.pandasTaClassic.adx14.toFixed(0)}
                            </div>
                            {brain.candlestickReport?.latestConfirmedPattern && (
                              <div className="text-[11px] font-sans text-[#C8285E] dark:text-[#FF7AA5]">
                                Sham: {brain.candlestickReport.latestConfirmedPattern.patternName}
                              </div>
                            )}
                          </div>
                        ) : (
                          'Hisoblanmoqda'
                        )}
                      </td>
                      <td className="py-3.5 px-5 text-right">
                        <button
                          type="button"
                          onClick={() => onTradePair(p.symbol)}
                          className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 text-[#C8285E] dark:text-[#FF7AA5] hover:bg-[#F25F8C]/12 hover:border-[#F25F8C]/40 transition-colors cursor-pointer whitespace-nowrap"
                        >
                          <span>Savdo qilish</span>
                          <ArrowUpRight className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </section>
    </div>
  );
};
