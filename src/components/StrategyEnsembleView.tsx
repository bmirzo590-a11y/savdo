import React, { useMemo, useState } from 'react';
import {
  IntelligentDecisionReport,
  MarketPair,
  StrategyBrainSnapshot,
  StrategyConfig,
  StrategyRegistryRecord,
  Timeframe,
} from '../types/trading';

interface StrategyEnsembleViewProps {
  pairs: MarketPair[];
  selectedSymbol: string;
  onSelectSymbol: (symbol: string) => void;
  timeframe: Timeframe;
  onChangeTimeframe: (tf: Timeframe) => void;
  brainSnapshot: StrategyBrainSnapshot | null;
  decisionReport: IntelligentDecisionReport;
  strategies: StrategyConfig[];
  registry: StrategyRegistryRecord[];
}

interface EnsembleRow {
  id: string;
  name: string;
  category: string;
  vote: 'BUY' | 'SELL' | 'WAIT';
  confidence: number;
  weightPct: number;
  performanceWinRate: number | null;
  agreement: 'MOS' | 'QARAMA-QARSHI' | 'NEYTRAL';
  detail: string;
}

const TIMEFRAMES: Timeframe[] = ['M1', 'M5', 'M15', 'M30', 'H1', 'H4', 'D1', 'W1'];

export const StrategyEnsembleView: React.FC<StrategyEnsembleViewProps> = ({
  pairs,
  selectedSymbol,
  onSelectSymbol,
  timeframe,
  onChangeTimeframe,
  brainSnapshot,
  decisionReport,
  strategies,
  registry,
}) => {
  const [filterVote, setFilterVote] = useState<'ALL' | 'BUY' | 'SELL' | 'WAIT'>('ALL');
  const [sortBy, setSortBy] = useState<'weight' | 'confidence' | 'winrate'>('weight');

  const ensembleRows = useMemo<EnsembleRow[]>(() => {
    const consensusVote: 'BUY' | 'SELL' | 'WAIT' =
      decisionReport.finalAction === 'BUY'
        ? 'BUY'
        : decisionReport.finalAction === 'SELL'
          ? 'SELL'
          : 'WAIT';

    // Map each strategy decision from IntelligentDecisionReport
    const baseItems: Omit<EnsembleRow, 'weightPct' | 'agreement'>[] =
      decisionReport.strategyDecisions.map((card, idx) => {
        const matchedCfg = strategies[idx % Math.max(1, strategies.length)];
        const matchedReg = registry.find((r) =>
          r.name.toLowerCase().includes(card.strategyName.toLowerCase().split(' ')[0])
        );
        const lowerName = card.strategyName.toLowerCase();
        const category =
          lowerName.includes('smc') || lowerName.includes('smart') || lowerName.includes('sweep')
            ? 'ICT / Smart Money'
            : lowerName.includes('ema') || lowerName.includes('hma') || lowerName.includes('supertrend') || lowerName.includes('trend')
              ? 'EMA / Trend'
              : lowerName.includes('rsi') || lowerName.includes('macd') || lowerName.includes('adx')
                ? 'RSI / MACD Momentum'
                : lowerName.includes('vwap') || lowerName.includes('mean')
                  ? 'Volume & VWAP'
                  : lowerName.includes('candle') || lowerName.includes('sham')
                    ? 'Candlestick'
                    : 'Price Action';

        const baseConf = card.signal === 'WAIT'
          ? 46
          : Math.min(95, 58 + card.confirmingIndicators.length * 8 + (card.selectedForRegime ? 10 : 0));

        return {
          id: card.strategyId,
          name: card.strategyName,
          category,
          vote: card.signal,
          confidence: baseConf,
          performanceWinRate: matchedReg?.winRatePct ?? matchedCfg?.winRate ?? null,
          detail: card.reasonUz,
        };
      });

    // Add Candlestick Intelligence Engine row
    const candleReport = brainSnapshot?.candlestickReport;
    if (candleReport) {
      const latest = candleReport.latestConfirmedPattern ?? candleReport.latestActivePattern;
      const vote: 'BUY' | 'SELL' | 'WAIT' =
        latest?.bias === 'BULLISH' ? 'BUY' : latest?.bias === 'BEARISH' ? 'SELL' : 'WAIT';
      baseItems.push({
        id: 'ensemble-candlestick',
        name: 'Candlestick Intelligence (36+ Pattern)',
        category: 'Candlestick',
        vote,
        confidence: latest ? Math.min(95, Math.round(latest.strength)) : 45,
        performanceWinRate: null,
        detail: latest
          ? `${latest.patternName} (${latest.confirmationStatus})`
          : 'Aniq tasdiqlangan sham patterni kutilmoqda',
      });
    }

    // Add Volume & OBV Flow row
    const vol = brainSnapshot?.technicals?.volume;
    if (vol) {
      const vote: 'BUY' | 'SELL' | 'WAIT' =
        vol.obvTrend === 'OSHISH' && vol.volumeRatio >= 1.05
          ? 'BUY'
          : vol.obvTrend === 'PASAYISH' && vol.volumeRatio >= 1.05
            ? 'SELL'
            : 'WAIT';
      baseItems.push({
        id: 'ensemble-volume',
        name: 'Volume Flow & OBV Pressure',
        category: 'Volume',
        vote,
        confidence: vote === 'WAIT' ? 48 : Math.min(90, Math.round(58 + vol.volumeRatio * 14)),
        performanceWinRate: null,
        detail: `OBV: ${vol.obvTrend} · Hajm nisbati: ${vol.volumeRatio.toFixed(2)}x`,
      });
    }

    // Add Auto-Fibonacci Retracement row
    const fib = brainSnapshot?.technicals?.fibonacci;
    if (fib) {
      const zoneLower = fib.currentZone.toLowerCase();
      const vote: 'BUY' | 'SELL' | 'WAIT' =
        zoneLower.includes('discount') || zoneLower.includes('golden') || zoneLower.includes('61.8')
          ? 'BUY'
          : zoneLower.includes('premium')
            ? 'SELL'
            : 'WAIT';
      baseItems.push({
        id: 'ensemble-fibonacci',
        name: 'Auto-Fibonacci Retracement (61.8%)',
        category: 'Fibonacci',
        vote,
        confidence: vote === 'WAIT' ? 50 : 72,
        performanceWinRate: null,
        detail: `Zona: ${fib.currentZone} · 61.8%: ${fib.fib618.toFixed(2)}`,
      });
    }

    const totalConf = baseItems.reduce((acc, item) => acc + Math.max(20, item.confidence), 0) || 1;

    return baseItems.map((item) => {
      const weightPct = Number(((Math.max(20, item.confidence) / totalConf) * 100).toFixed(1));
      const agreement: 'MOS' | 'QARAMA-QARSHI' | 'NEYTRAL' =
        item.vote === 'WAIT'
          ? 'NEYTRAL'
          : consensusVote === 'WAIT'
            ? 'NEYTRAL'
            : item.vote === consensusVote
              ? 'MOS'
              : 'QARAMA-QARSHI';
      return {
        ...item,
        weightPct,
        agreement,
      };
    });
  }, [brainSnapshot, decisionReport.strategyDecisions, decisionReport.finalAction, strategies, registry]);

  const stats = useMemo(() => {
    const buy = ensembleRows.filter((r) => r.vote === 'BUY');
    const sell = ensembleRows.filter((r) => r.vote === 'SELL');
    const wait = ensembleRows.filter((r) => r.vote === 'WAIT');
    const total = ensembleRows.length || 1;
    const buyWeight = buy.reduce((s, r) => s + r.weightPct, 0);
    const sellWeight = sell.reduce((s, r) => s + r.weightPct, 0);
    const waitWeight = Math.max(0, 100 - buyWeight - sellWeight);
    const agreementPct = Math.round((Math.max(buy.length, sell.length) / total) * 100);
    return {
      total: ensembleRows.length,
      buyCount: buy.length,
      sellCount: sell.length,
      waitCount: wait.length,
      buyWeight: Number(buyWeight.toFixed(1)),
      sellWeight: Number(sellWeight.toFixed(1)),
      waitWeight: Number(waitWeight.toFixed(1)),
      agreementPct,
    };
  }, [ensembleRows]);

  const visibleRows = useMemo(() => {
    const filtered =
      filterVote === 'ALL' ? ensembleRows : ensembleRows.filter((r) => r.vote === filterVote);
    return [...filtered].sort((a, b) => {
      if (sortBy === 'confidence') return b.confidence - a.confidence;
      if (sortBy === 'winrate') return (b.performanceWinRate ?? 0) - (a.performanceWinRate ?? 0);
      return b.weightPct - a.weightPct;
    });
  }, [ensembleRows, filterVote, sortBy]);

  return (
    <div className="space-y-4">
      {/* Header + Controls */}
      <section className="rounded-xl border border-slate-200 dark:border-violet-500/30 bg-white dark:bg-[#0B1120] tk-glass-purple p-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-lg font-bold text-slate-900 dark:text-white">
            Strategy Ensemble — Ko‘p Strategiyali Ovoz Berish Markazi
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            ICT/SMC, EMA Trend, RSI Divergensiya, MACD, Price Action, Shamlar, Volume va Fibonacci strategiyalarining real vaqtdagi hamkorligi.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            value={selectedSymbol}
            onChange={(e) => onSelectSymbol(e.target.value)}
            aria-label="Instrumentni tanlash"
            className="px-2.5 py-1.5 text-xs font-mono font-semibold rounded-lg border border-slate-200 dark:border-violet-500/30 bg-slate-50 dark:bg-[#070B16] text-slate-900 dark:text-white cursor-pointer"
          >
            {pairs.map((p) => (
              <option key={p.symbol} value={p.symbol}>
                {p.symbol}
              </option>
            ))}
          </select>

          <div className="flex items-center gap-0.5 p-0.5 rounded-lg bg-slate-100 dark:bg-[#060A15] border border-slate-200 dark:border-violet-500/20">
            {TIMEFRAMES.map((tf) => (
              <button
                key={tf}
                type="button"
                onClick={() => onChangeTimeframe(tf)}
                className={`px-2 py-1 text-[11px] font-mono rounded transition-colors cursor-pointer ${
                  timeframe === tf
                    ? 'bg-violet-600 text-white font-semibold'
                    : 'text-slate-500 dark:text-slate-400 hover:text-white'
                }`}
              >
                {tf}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* Top Visual Consensus Diagrams */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Stacked Neon Weight Distribution Diagram */}
        <section className="lg:col-span-7 rounded-xl border border-slate-200 dark:border-sky-500/25 bg-white dark:bg-[#0B1120] tk-glass-blue p-4 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
                Ansambl Vazn Taqsimoti ({selectedSymbol} · {timeframe})
              </h2>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Bozor rejimi: {decisionReport.regime.labelUz} · Jami {stats.total} ta mustaqil dvigatel
              </p>
            </div>
            <div
              className={`font-mono text-base font-bold ${
                decisionReport.finalAction === 'BUY'
                  ? 'text-emerald-500 dark:text-[#00E5A0]'
                  : decisionReport.finalAction === 'SELL'
                    ? 'text-rose-500'
                    : 'text-sky-500 dark:text-sky-400'
              }`}
            >
              {decisionReport.finalAction} · {decisionReport.analyticalScore}/100
            </div>
          </div>

          {/* Segmented Neon Progress Bar */}
          <div className="space-y-1.5">
            <div className="h-4 w-full rounded-lg overflow-hidden bg-slate-200 dark:bg-[#060A15] border border-slate-200 dark:border-violet-500/20 flex">
              {stats.buyWeight > 0 && (
                <div
                  className="h-full bg-gradient-to-r from-emerald-500 to-[#00E5A0] transition-all"
                  style={{ width: `${stats.buyWeight}%` }}
                  title={`BUY vazni: ${stats.buyWeight}%`}
                />
              )}
              {stats.waitWeight > 0 && (
                <div
                  className="h-full bg-sky-500/45 transition-all"
                  style={{ width: `${stats.waitWeight}%` }}
                  title={`WAIT vazni: ${stats.waitWeight}%`}
                />
              )}
              {stats.sellWeight > 0 && (
                <div
                  className="h-full bg-gradient-to-r from-violet-500 to-rose-500 transition-all"
                  style={{ width: `${stats.sellWeight}%` }}
                  title={`SELL vazni: ${stats.sellWeight}%`}
                />
              )}
            </div>
            <div className="grid grid-cols-3 text-xs font-mono tabular-nums pt-1">
              <div className="text-emerald-600 dark:text-[#00E5A0] font-semibold">
                BUY: {stats.buyCount} ta ({stats.buyWeight}%)
              </div>
              <div className="text-center text-sky-600 dark:text-sky-400 font-semibold">
                WAIT: {stats.waitCount} ta ({stats.waitWeight}%)
              </div>
              <div className="text-right text-rose-600 dark:text-rose-400 font-semibold">
                SELL: {stats.sellCount} ta ({stats.sellWeight}%)
              </div>
            </div>
          </div>

          {/* Visual Confidence Comparison Bars */}
          <div className="space-y-2 pt-2 border-t border-slate-200 dark:border-violet-500/15">
            <div className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
              Strategiyalar bo‘yicha ishonch va vazn diagrammasi
            </div>
            <div className="space-y-1.5">
              {ensembleRows.slice(0, 8).map((row) => (
                <div key={row.id} className="grid grid-cols-12 items-center gap-2 text-[11px]">
                  <span className="col-span-4 truncate text-slate-700 dark:text-slate-200 font-medium">
                    {row.name}
                  </span>
                  <div className="col-span-6 h-2 rounded-full bg-slate-200 dark:bg-slate-800/90 overflow-hidden">
                    <div
                      className={`h-full rounded-full ${
                        row.vote === 'BUY'
                          ? 'bg-gradient-to-r from-sky-400 to-[#00E5A0]'
                          : row.vote === 'SELL'
                            ? 'bg-gradient-to-r from-violet-500 to-rose-500'
                            : 'bg-sky-500/50'
                      }`}
                      style={{ width: `${Math.min(100, Math.max(8, row.confidence))}%` }}
                    />
                  </div>
                  <span
                    className={`col-span-2 text-right font-mono tabular-nums font-semibold ${
                      row.vote === 'BUY'
                        ? 'text-emerald-500 dark:text-[#00E5A0]'
                        : row.vote === 'SELL'
                          ? 'text-rose-500'
                          : 'text-slate-400'
                    }`}
                  >
                    {row.vote} {row.confidence}%
                  </span>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Agreement Gauge & Category Breakdown */}
        <section className="lg:col-span-5 rounded-xl border border-slate-200 dark:border-violet-500/25 bg-white dark:bg-[#0B1120] tk-glass p-4 flex flex-col justify-between gap-4">
          <div className="flex items-center justify-between gap-4">
            <div className="space-y-1">
              <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
                Kelishuv Darajasi (Consensus)
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Turli yo‘nalishdagi strategiyalar bir xil qarorga kelish darajasi.
              </p>
              <div className="pt-2 space-y-1 text-xs font-mono tabular-nums">
                <div className="text-slate-600 dark:text-slate-300">
                  MTF Moslik: <strong className="text-sky-500 dark:text-sky-400">{decisionReport.mtf.alignmentPct}%</strong>
                </div>
                <div className="text-slate-600 dark:text-slate-300">
                  Qarama-qarshi dalil:{' '}
                  <strong className={decisionReport.opposingEvidenceUz.length > 0 ? 'text-amber-500' : 'text-[#00E5A0]'}>
                    {decisionReport.opposingEvidenceUz.length} ta
                  </strong>
                </div>
              </div>
            </div>

            {/* SVG Consensus Donut */}
            <div className="relative w-28 h-28 shrink-0 flex items-center justify-center">
              <svg className="w-28 h-28 -rotate-90" viewBox="0 0 100 100">
                <circle
                  cx="50"
                  cy="50"
                  r="40"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="8"
                  className="text-slate-200 dark:text-slate-800"
                />
                <circle
                  cx="50"
                  cy="50"
                  r="40"
                  fill="none"
                  stroke="url(#ensembleGrad)"
                  strokeWidth="8"
                  strokeLinecap="round"
                  strokeDasharray={2 * Math.PI * 40}
                  strokeDashoffset={2 * Math.PI * 40 * (1 - stats.agreementPct / 100)}
                />
                <defs>
                  <linearGradient id="ensembleGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%" stopColor="#A855F7" />
                    <stop offset="50%" stopColor="#38BDF8" />
                    <stop offset="100%" stopColor="#00E5A0" />
                  </linearGradient>
                </defs>
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center font-mono tabular-nums">
                <span className="text-xl font-bold text-slate-900 dark:text-white">
                  {stats.agreementPct}%
                </span>
                <span className="text-[10px] text-slate-400">Kelishuv</span>
              </div>
            </div>
          </div>

          <div className="p-3 rounded-lg border border-slate-200 dark:border-violet-500/20 bg-slate-50 dark:bg-[#070C18] text-xs space-y-1">
            <div className="font-semibold text-slate-800 dark:text-violet-300">
              AI Ansambl Xulosasi
            </div>
            <p className="text-slate-600 dark:text-slate-300 leading-relaxed">
              {decisionReport.explanationUz}
            </p>
          </div>
        </section>
      </div>

      {/* Detailed Compact Strategy Ranking Table */}
      <section className="rounded-xl border border-slate-200 dark:border-violet-500/25 bg-white dark:bg-[#0B1120] tk-glass overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-200 dark:border-violet-500/15 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
              Barcha Strategiyalar Reytingi va Ovozlar
            </h2>
            <span className="text-xs font-mono text-slate-500">({visibleRows.length} ta)</span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1 p-0.5 rounded-lg bg-slate-100 dark:bg-[#060A15] border border-slate-200 dark:border-violet-500/20">
              {(['ALL', 'BUY', 'SELL', 'WAIT'] as const).map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setFilterVote(v)}
                  className={`px-2.5 py-1 text-[11px] font-mono font-semibold rounded cursor-pointer ${
                    filterVote === v
                      ? 'bg-violet-600 text-white'
                      : 'text-slate-500 dark:text-slate-400 hover:text-white'
                  }`}
                >
                  {v}
                </button>
              ))}
            </div>

            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as 'weight' | 'confidence' | 'winrate')}
              aria-label="Saralash"
              className="px-2.5 py-1 text-xs rounded-lg border border-slate-200 dark:border-violet-500/25 bg-slate-50 dark:bg-[#060A15] text-slate-700 dark:text-slate-200 cursor-pointer"
            >
              <option value="weight">Vazn bo‘yicha</option>
              <option value="confidence">Ishonch bo‘yicha</option>
              <option value="winrate">Natija (Win Rate) bo‘yicha</option>
            </select>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead>
              <tr className="border-b border-slate-200 dark:border-violet-500/15 text-[11px] text-slate-500 dark:text-slate-400 bg-slate-50/70 dark:bg-[#070C18]">
                <th className="py-2.5 px-4 font-medium">Strategiya</th>
                <th className="py-2.5 px-3 font-medium">Yo‘nalish</th>
                <th className="py-2.5 px-3 font-medium">Signal</th>
                <th className="py-2.5 px-3 font-medium text-right">Ishonch</th>
                <th className="py-2.5 px-3 font-medium text-right">Natija (WR)</th>
                <th className="py-2.5 px-3 font-medium text-right">Vazn</th>
                <th className="py-2.5 px-3 font-medium">Kelishuv</th>
                <th className="py-2.5 px-4 font-medium">Texnik Sabab</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200/70 dark:divide-violet-500/10">
              {visibleRows.map((row) => (
                <tr key={row.id} className="hover:bg-slate-50 dark:hover:bg-violet-500/5 transition-colors">
                  <td className="py-2.5 px-4 font-medium text-slate-900 dark:text-slate-100 whitespace-nowrap">
                    {row.name}
                  </td>
                  <td className="py-2.5 px-3 text-slate-500 dark:text-slate-400 whitespace-nowrap">
                    {row.category}
                  </td>
                  <td className="py-2.5 px-3 font-mono font-bold whitespace-nowrap">
                    <span
                      className={
                        row.vote === 'BUY'
                          ? 'text-emerald-600 dark:text-[#00E5A0]'
                          : row.vote === 'SELL'
                            ? 'text-rose-600 dark:text-rose-400'
                            : 'text-sky-600 dark:text-sky-400'
                      }
                    >
                      {row.vote}
                    </span>
                  </td>
                  <td className="py-2.5 px-3 font-mono tabular-nums text-right text-slate-800 dark:text-slate-200">
                    {row.confidence}%
                  </td>
                  <td className="py-2.5 px-3 font-mono tabular-nums text-right text-slate-600 dark:text-slate-300">
                    {row.performanceWinRate !== null ? `${row.performanceWinRate}%` : '—'}
                  </td>
                  <td className="py-2.5 px-3 font-mono tabular-nums text-right text-violet-600 dark:text-violet-300 font-semibold">
                    {row.weightPct}%
                  </td>
                  <td className="py-2.5 px-3 font-mono text-[11px] whitespace-nowrap">
                    <span
                      className={
                        row.agreement === 'MOS'
                          ? 'text-emerald-600 dark:text-[#00E5A0]'
                          : row.agreement === 'QARAMA-QARSHI'
                            ? 'text-rose-500'
                            : 'text-slate-400'
                      }
                    >
                      {row.agreement}
                    </span>
                  </td>
                  <td className="py-2.5 px-4 text-slate-500 dark:text-slate-400 max-w-xs truncate" title={row.detail}>
                    {row.detail}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
};
