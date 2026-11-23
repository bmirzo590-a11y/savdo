import React, { useMemo } from 'react';
import {
  IntelligentDecisionReport,
  LiveSystemStatusSnapshot,
  StrategyRegistryRecord,
  ViewId,
} from '../types/trading';
import { formatPrice } from '../config/initialData';

interface AiBrainStripProps {
  decisionReport: IntelligentDecisionReport;
  currentPrice: number;
  systemStatus: LiveSystemStatusSnapshot | null;
  registry: StrategyRegistryRecord[];
  learningRecordsCount: number;
  dailyPnlUsd: number;
  dailyMaxLossUsd: number;
  mt5Connected: boolean;
  onNavigate: (view: ViewId) => void;
}

export const AiBrainStrip: React.FC<AiBrainStripProps> = ({
  decisionReport,
  currentPrice,
  systemStatus,
  registry,
  learningRecordsCount,
  dailyPnlUsd,
  dailyMaxLossUsd,
  mt5Connected,
  onNavigate,
}) => {
  const agreement = useMemo(() => {
    const cards = decisionReport.strategyDecisions;
    if (cards.length === 0) {
      return { pct: 0, buy: 0, sell: 0, wait: 0, total: 0, label: 'Kutish' };
    }
    const buy = cards.filter((s) => s.signal === 'BUY').length;
    const sell = cards.filter((s) => s.signal === 'SELL').length;
    const wait = cards.length - buy - sell;
    const dominant = Math.max(buy, sell);
    const pct = Math.round((dominant / cards.length) * 100);
    const label = buy > sell ? 'Buqa (BUY)' : sell > buy ? 'Ayiq (SELL)' : 'Neytral';
    return { pct, buy, sell, wait, total: cards.length, label };
  }, [decisionReport.strategyDecisions]);

  const confidence = Math.max(0, Math.min(100, Math.round(decisionReport.analyticalScore)));
  const portfolioRiskPct = Math.max(
    0,
    Math.min(100, Math.round((decisionReport.riskEvaluation.riskPct / 5) * 100))
  );
  const dailyDrawdownUsedPct =
    dailyMaxLossUsd > 0 && dailyPnlUsd < 0
      ? Math.min(100, Math.round((Math.abs(dailyPnlUsd) / dailyMaxLossUsd) * 100))
      : 0;

  const slDist = Math.abs(currentPrice - decisionReport.riskEvaluation.dynamicStopLoss);
  const tpDist = Math.abs(decisionReport.riskEvaluation.takeProfit - currentPrice);
  const rrRatio = slDist > 0 ? tpDist / slDist : 2.0;

  const pendingResearchCount = registry.filter(
    (s) => !s.ownerApproved && (s.backtestStatus === 'PASSED' || s.codeReviewStatus === 'PASSED')
  ).length;
  const approvedCount = registry.filter((s) => s.ownerApproved || s.active).length;

  const freshnessLabel = systemStatus?.control.lastAnalysisTime
    ? new Date(systemStatus.control.lastAnalysisTime).toLocaleTimeString('en-GB')
    : 'Hali yozilmagan';

  const actionColor =
    decisionReport.finalAction === 'BUY'
      ? 'text-emerald-500 dark:text-[#00E5A0]'
      : decisionReport.finalAction === 'SELL'
        ? 'text-rose-500 dark:text-rose-400'
        : 'text-sky-500 dark:text-sky-400';

  const strokeRadius = 22;
  const circumference = 2 * Math.PI * strokeRadius;
  const agreementOffset = circumference - (agreement.pct / 100) * circumference;
  const confidenceOffset = circumference - (confidence / 100) * circumference;

  return (
    <section className="rounded-xl border border-slate-200 dark:border-violet-500/25 bg-white dark:bg-[#0B1120] tk-glass overflow-hidden">
      {/* Compact Header */}
      <div className="px-4 py-2.5 border-b border-slate-200 dark:border-violet-500/15 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <h2 className="font-display font-semibold text-slate-900 dark:text-white">
            AI Intellektual Tahlil Paneli
          </h2>
          <span aria-hidden="true" className="text-slate-400">·</span>
          <span className="font-mono text-slate-500 dark:text-slate-400">
            {decisionReport.symbol} ({decisionReport.timeframe})
          </span>
          <span aria-hidden="true" className="text-slate-400">·</span>
          <span className={`font-mono font-bold ${actionColor}`}>
            Hukm: {decisionReport.finalAction} ({confidence}/100)
          </span>
        </div>

        <div className="flex items-center gap-3 text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400">
          <span>
            Yangilanish: <strong className="text-slate-800 dark:text-slate-200">{freshnessLabel}</strong>
          </span>
          <button
            type="button"
            onClick={() => onNavigate('analyst')}
            className="text-sky-600 dark:text-sky-400 hover:underline font-sans font-medium cursor-pointer whitespace-nowrap"
          >
            Batafsil tahlil →
          </button>
        </div>
      </div>

      {/* Dense 4-Column Institutional AI Visualization Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-slate-200/80 dark:divide-violet-500/15 text-xs">
        {/* 1. AI Brain + Strategy Agreement & Confidence Rings */}
        <div className="p-3.5 flex items-center justify-between gap-3">
          <div className="space-y-1 min-w-0">
            <div className="text-[11px] text-slate-500 dark:text-slate-400">AI Miya & Kelishuv</div>
            <div className={`text-sm font-mono font-bold ${actionColor}`}>
              {decisionReport.finalAction} · {agreement.label}
            </div>
            <div className="text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400">
              BUY {agreement.buy} / SELL {agreement.sell} / WAIT {agreement.wait}
            </div>
            <button
              type="button"
              onClick={() => onNavigate('ensemble')}
              className="text-[11px] text-violet-600 dark:text-violet-400 hover:underline cursor-pointer"
            >
              Ansambl paneli →
            </button>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <div className="relative w-14 h-14 flex items-center justify-center" title="Strategiyalar kelishuvi">
              <svg className="w-14 h-14 -rotate-90" viewBox="0 0 56 56">
                <circle
                  cx="28"
                  cy="28"
                  r={strokeRadius}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="4.5"
                  className="text-slate-200 dark:text-slate-800"
                />
                <circle
                  cx="28"
                  cy="28"
                  r={strokeRadius}
                  fill="none"
                  stroke="#A855F7"
                  strokeWidth="4.5"
                  strokeLinecap="round"
                  strokeDasharray={circumference}
                  strokeDashoffset={agreementOffset}
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center font-mono tabular-nums">
                <span className="text-[11px] font-bold text-slate-900 dark:text-white">{agreement.pct}%</span>
                <span className="text-[8px] text-slate-400">Moslik</span>
              </div>
            </div>

            <div className="relative w-14 h-14 flex items-center justify-center" title="Signal ishonchi">
              <svg className="w-14 h-14 -rotate-90" viewBox="0 0 56 56">
                <circle
                  cx="28"
                  cy="28"
                  r={strokeRadius}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="4.5"
                  className="text-slate-200 dark:text-slate-800"
                />
                <circle
                  cx="28"
                  cy="28"
                  r={strokeRadius}
                  fill="none"
                  stroke={
                    decisionReport.finalAction === 'BUY'
                      ? '#00E5A0'
                      : decisionReport.finalAction === 'SELL'
                        ? '#F43F5E'
                        : '#38BDF8'
                  }
                  strokeWidth="4.5"
                  strokeLinecap="round"
                  strokeDasharray={circumference}
                  strokeDashoffset={confidenceOffset}
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center font-mono tabular-nums">
                <span className="text-[11px] font-bold text-slate-900 dark:text-white">{confidence}</span>
                <span className="text-[8px] text-slate-400">Ball</span>
              </div>
            </div>
          </div>
        </div>

        {/* 2. Market Regime & Multi-Timeframe Alignment */}
        <div className="p-3.5 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] text-slate-500 dark:text-slate-400">Bozor Rejimi & MTF</span>
            <span className="font-mono tabular-nums text-[11px] font-semibold text-sky-600 dark:text-sky-400">
              MTF {decisionReport.mtf.alignmentPct}%
            </span>
          </div>
          <div className="text-xs font-semibold text-slate-900 dark:text-slate-100 truncate">
            {decisionReport.regime.labelUz}
          </div>
          <div className="grid grid-cols-4 gap-1 font-mono text-[10px] tabular-nums">
            {decisionReport.mtf.entries.slice(0, 8).map((entry) => {
              const cls =
                entry.bias === 'BULLISH'
                  ? 'border-emerald-500/35 bg-emerald-500/10 text-emerald-600 dark:text-[#00E5A0]'
                  : entry.bias === 'BEARISH'
                    ? 'border-rose-500/35 bg-rose-500/10 text-rose-600 dark:text-rose-400'
                    : 'border-slate-200 dark:border-slate-700/80 bg-slate-50 dark:bg-slate-900/70 text-slate-500 dark:text-slate-400';
              return (
                <div
                  key={entry.timeframe}
                  className={`px-1.5 py-0.5 rounded border text-center font-semibold ${cls}`}
                  title={`${entry.timeframe}: ${entry.bias} · RSI ${entry.rsi14.toFixed(0)} · SMC ${entry.smcBias}`}
                >
                  {entry.timeframe}
                </div>
              );
            })}
          </div>
        </div>

        {/* 3. Portfolio Risk Meter & Trade Levels */}
        <div className="p-3.5 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] text-slate-500 dark:text-slate-400">Portfolio Risk Metri</span>
            <span
              className={`font-mono tabular-nums text-[11px] font-semibold ${
                decisionReport.riskEvaluation.overallAllowed
                  ? 'text-emerald-600 dark:text-[#00E5A0]'
                  : 'text-rose-500'
              }`}
            >
              {decisionReport.riskEvaluation.overallAllowed ? 'Ruxsat' : 'Bloklangan'}
            </span>
          </div>

          <div className="space-y-1">
            <div className="flex items-center justify-between text-[11px] font-mono tabular-nums">
              <span className="text-slate-500 dark:text-slate-400">Savdo riski</span>
              <span className="text-slate-900 dark:text-slate-100 font-semibold">
                {decisionReport.riskEvaluation.riskPct.toFixed(2)}% (${decisionReport.riskEvaluation.riskAmountUsd.toFixed(0)})
              </span>
            </div>
            <div className="h-1.5 w-full rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${
                  portfolioRiskPct > 70
                    ? 'bg-rose-500'
                    : portfolioRiskPct > 40
                      ? 'bg-amber-400'
                      : 'bg-gradient-to-r from-sky-400 to-[#00E5A0]'
                }`}
                style={{ width: `${Math.max(6, portfolioRiskPct)}%` }}
              />
            </div>
          </div>

          <div className="flex items-center justify-between text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400 pt-0.5">
            <span>SL: {formatPrice(decisionReport.riskEvaluation.dynamicStopLoss)}</span>
            <span>TP: {formatPrice(decisionReport.riskEvaluation.takeProfit)}</span>
            <span>DD: {dailyDrawdownUsedPct}%</span>
          </div>
        </div>

        {/* 4. Active Research & Historical Knowledge Coverage */}
        <div className="p-3.5 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] text-slate-500 dark:text-slate-400">Tadqiqot & Bilim Bazasi</span>
            <span className="font-mono text-[10px] text-violet-600 dark:text-violet-400">
              {mt5Connected ? 'Real Oqim' : 'Demo Oqim'}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2 font-mono tabular-nums">
            <div>
              <div className="text-[10px] font-sans text-slate-500">Tasdiq / Navbat</div>
              <div className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                {approvedCount} / {pendingResearchCount} ta
              </div>
            </div>
            <div>
              <div className="text-[10px] font-sans text-slate-500">Xotira yozuvi</div>
              <div className="text-xs font-semibold text-sky-600 dark:text-sky-400">
                {(systemStatus?.dbSizeKb ?? 0)}KB · {learningRecordsCount} jurn.
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between text-[11px] pt-0.5">
            <button
              type="button"
              onClick={() => onNavigate('research')}
              className="text-violet-600 dark:text-violet-400 hover:underline cursor-pointer"
            >
              AI Tadqiqot Lab →
            </button>
            <button
              type="button"
              onClick={() => onNavigate('memory')}
              className="text-sky-600 dark:text-sky-400 hover:underline cursor-pointer"
            >
              Tarixiy Xotira →
            </button>
          </div>
        </div>
      </div>

      {/* 1-Line Transparent AI Reasoning Footer */}
      <div className="px-4 py-2 border-t border-slate-200/80 dark:border-violet-500/15 bg-slate-50/70 dark:bg-[#070C18]/80 text-[11px] text-slate-600 dark:text-slate-300 flex flex-wrap items-center justify-between gap-2">
        <p className="truncate max-w-4xl">
          <span className="font-semibold text-violet-600 dark:text-violet-400 mr-1.5">AI Izoh:</span>
          {decisionReport.explanationUz}
        </p>
        <span className="font-mono tabular-nums text-slate-500 shrink-0">
          R:R 1:{rrRatio.toFixed(2)} · Lot {decisionReport.riskEvaluation.recommendedLot.toFixed(2)}
        </span>
      </div>
    </section>
  );
};
