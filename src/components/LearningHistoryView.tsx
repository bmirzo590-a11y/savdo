import React, { useState } from 'react';
import {
  LearningOutcome,
  LearningPerformanceBucket,
  LearningRecord,
  LearningSystemReport,
} from '../types/trading';
import { formatCurrency, formatPrice } from '../config/initialData';

interface LearningHistoryViewProps {
  records: LearningRecord[];
  report: LearningSystemReport;
  onResolveRecord: (id: string, outcome: LearningOutcome, pnlUsd: number) => void;
  onSyncPositions: () => void;
  onLogCurrentDecision?: () => void;
  onClearJournal?: () => void;
}

type BucketView = 'strategy' | 'pattern' | 'timeframe' | 'regime';

export const LearningHistoryView: React.FC<LearningHistoryViewProps> = ({
  records,
  report,
  onResolveRecord,
  onSyncPositions,
  onLogCurrentDecision,
  onClearJournal,
}) => {
  const [bucketTab, setBucketTab] = useState<BucketView>('strategy');
  const [outcomeFilter, setOutcomeFilter] = useState<'ALL' | LearningOutcome>('ALL');

  const activeBuckets: LearningPerformanceBucket[] =
    bucketTab === 'strategy'
      ? report.byStrategy
      : bucketTab === 'pattern'
        ? report.byPattern
        : bucketTab === 'timeframe'
          ? report.byTimeframe
          : report.byRegime;

  const filteredRecords =
    outcomeFilter === 'ALL'
      ? records
      : records.filter((r) => r.outcome === outcomeFilter);

  return (
    <div className="space-y-6">
      {/* Header & Calibration Status */}
      <section className="rounded-xl border border-slate-200 dark:border-slate-800/90 bg-white dark:bg-[#131B2B] neon-surface p-6 space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-4 pb-4 border-b border-slate-200 dark:border-slate-800">
          <div>
            <h1 className="text-lg font-semibold text-slate-900 dark:text-white">
              AI O‘zini Baholash va O‘rganish Tarixi
            </h1>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Har bir signal va yopilgan bitim strategiya, sham patterni, taymfreym hamda bozor rejimi bo‘yicha saqlanadi. Parametrlar faqat tarixiy va Out-of-Sample sinovdan keyin yangilanadi.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {onLogCurrentDecision && (
              <button
                type="button"
                onClick={onLogCurrentDecision}
                className="px-3.5 py-2 text-xs font-semibold rounded-lg bg-gradient-to-r from-[#F25F8C] via-[#EB6B7B] to-[#E87769] text-slate-950 hover:brightness-110 cursor-pointer whitespace-nowrap"
              >
                Joriy signalni yozish
              </button>
            )}
            <button
              type="button"
              onClick={onSyncPositions}
              className="px-3 py-2 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:border-[#F25F8C]/50 cursor-pointer whitespace-nowrap"
            >
              MT5 yopilgan savdolarni sinxronlash
            </button>
            {onClearJournal && records.length > 0 && (
              <button
                type="button"
                onClick={onClearJournal}
                className="px-3 py-2 text-xs font-medium rounded-lg border border-rose-500/35 text-rose-600 dark:text-rose-400 hover:bg-rose-500/10 cursor-pointer whitespace-nowrap"
              >
                Jurnalni tozalash
              </button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
          <div>
            <span className="text-slate-500 dark:text-slate-400 block">Jami yozilgan signallar</span>
            <span className="mt-1 block text-2xl font-semibold font-mono tabular-nums text-slate-900 dark:text-white">
              {report.totalLogged}
            </span>
          </div>
          <div>
            <span className="text-slate-500 dark:text-slate-400 block">Kalibratsiya namunasi (Yopilgan)</span>
            <span className="mt-1 block text-2xl font-semibold font-mono tabular-nums text-[#C8285E] dark:text-[#FF7AA5]">
              {report.resolvedCount} / 30
            </span>
          </div>
          <div>
            <span className="text-slate-500 dark:text-slate-400 block">Umumiy haqiqiy Win Rate</span>
            <span className="mt-1 block text-2xl font-semibold font-mono tabular-nums text-emerald-600 dark:text-emerald-400">
              {report.overallWinRatePct !== null ? `${report.overallWinRatePct.toFixed(1)}%` : 'Yetarli namuna yo‘q'}
            </span>
          </div>
        </div>

        {report.recommendationsUz.length > 0 && (
          <div className="pt-3 border-t border-slate-200 dark:border-slate-800 space-y-1.5 text-xs text-slate-600 dark:text-slate-300">
            {report.recommendationsUz.map((rec, i) => (
              <div key={i}>• {rec}</div>
            ))}
          </div>
        )}
      </section>

      {/* Performance Breakdown Tabs */}
      <section className="rounded-xl border border-slate-200 dark:border-slate-800/90 bg-white dark:bg-[#131B2B] neon-surface overflow-hidden">
        <div className="p-5 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-base font-semibold text-slate-900 dark:text-white">
            Statistik Samaradorlik Taqsimoti
          </h2>
          <div className="flex items-center gap-1 p-1 rounded-lg bg-slate-100 dark:bg-[#0D1320] border border-slate-200 dark:border-slate-800">
            {(
              [
                ['strategy', 'Strategiyalar'],
                ['pattern', 'Sham patternlari'],
                ['timeframe', 'Timeframe'],
                ['regime', 'Bozor rejimi'],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setBucketTab(id)}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                  bucketTab === id
                    ? 'bg-white dark:bg-[#F25F8C]/20 text-slate-900 dark:text-[#FF7AA5]'
                    : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {activeBuckets.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-500 dark:text-slate-400">
            Statistika shakllanishi uchun signallarni jurnalga yozing yoki MT5 yopilgan savdolarini sinxronlang.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400">
                  <th className="py-3 px-5">Guruh nomi</th>
                  <th className="py-3 px-4 text-right">Jami</th>
                  <th className="py-3 px-4 text-right">Yutuq / Zarar</th>
                  <th className="py-3 px-4 text-right">Win Rate</th>
                  <th className="py-3 px-4 text-right">O‘rtacha R</th>
                  <th className="py-3 px-5 text-right">Sof PnL</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800/80 font-mono tabular-nums">
                {activeBuckets.map((b) => (
                  <tr key={b.key} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                    <td className="py-3 px-5 font-sans font-medium text-slate-900 dark:text-white">{b.key}</td>
                    <td className="py-3 px-4 text-right text-slate-600 dark:text-slate-300">{b.total}</td>
                    <td className="py-3 px-4 text-right text-slate-600 dark:text-slate-300">
                      {b.wins} / {b.losses}
                    </td>
                    <td className="py-3 px-4 text-right text-[#C8285E] dark:text-[#FF7AA5]">
                      {b.winRatePct.toFixed(1)}%
                    </td>
                    <td className="py-3 px-4 text-right text-slate-700 dark:text-slate-200">
                      {b.avgR >= 0 ? '+' : ''}{b.avgR.toFixed(2)}R
                    </td>
                    <td
                      className={`py-3 px-5 text-right font-semibold ${
                        b.netPnlUsd >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'
                      }`}
                    >
                      {b.netPnlUsd >= 0 ? '+' : ''}{formatCurrency(b.netPnlUsd)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Signal Journal Log */}
      <section className="rounded-xl border border-slate-200 dark:border-slate-800/90 bg-white dark:bg-[#131B2B] neon-surface overflow-hidden">
        <div className="p-5 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-base font-semibold text-slate-900 dark:text-white">
            AI Signallar va Natijalar Jurnali
          </h2>

          <div className="flex items-center gap-1 p-1 rounded-lg bg-slate-100 dark:bg-[#0D1320] border border-slate-200 dark:border-slate-800">
            {(['ALL', 'PENDING', 'WIN', 'LOSS', 'BREAKEVEN'] as const).map((st) => (
              <button
                key={st}
                type="button"
                onClick={() => setOutcomeFilter(st)}
                className={`px-2.5 py-1 text-xs font-medium rounded-md cursor-pointer whitespace-nowrap ${
                  outcomeFilter === st
                    ? 'bg-white dark:bg-[#F25F8C]/20 text-slate-900 dark:text-[#FF7AA5]'
                    : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                {st === 'ALL' ? 'Barchasi' : st}
              </button>
            ))}
          </div>
        </div>

        {filteredRecords.length === 0 ? (
          <div className="p-8 text-center space-y-2">
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Hozircha bu filtr bo‘yicha yozuvlar mavjud emas.
            </p>
            {onLogCurrentDecision && (
              <button
                type="button"
                onClick={onLogCurrentDecision}
                className="px-3.5 py-1.5 text-xs font-semibold rounded-lg border border-[#F25F8C]/45 text-[#C8285E] dark:text-[#FF7AA5] hover:bg-[#F25F8C]/10 cursor-pointer"
              >
                Birinchi signalni yozish
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto max-h-96 overflow-y-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400">
                  <th className="py-3 px-5">Instrument / TF</th>
                  <th className="py-3 px-4">Qaror / Ball</th>
                  <th className="py-3 px-4">Strategiya · Sham · Rejim</th>
                  <th className="py-3 px-4 text-right">Kirish / SL / TP</th>
                  <th className="py-3 px-4">Holat</th>
                  <th className="py-3 px-5 text-right">Amal / PnL</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800/80">
                {filteredRecords.map((rec) => (
                  <tr key={rec.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                    <td className="py-3 px-5 font-mono tabular-nums">
                      <div className="font-semibold text-slate-900 dark:text-white">
                        {rec.symbol} · {rec.timeframe}
                      </div>
                      <div className="text-[11px] text-slate-400">
                        {new Date(rec.timestamp).toLocaleString('en-GB')}
                      </div>
                    </td>
                    <td className="py-3 px-4 font-mono tabular-nums">
                      <span
                        className={
                          rec.action === 'BUY'
                            ? 'text-emerald-600 dark:text-emerald-400 font-semibold'
                            : rec.action === 'SELL'
                              ? 'text-rose-600 dark:text-rose-400 font-semibold'
                              : 'text-amber-600 dark:text-amber-400 font-semibold'
                        }
                      >
                        {rec.action}
                      </span>
                      <span className="text-slate-400"> · {rec.analyticalScore}/100</span>
                    </td>
                    <td className="py-3 px-4 text-slate-700 dark:text-slate-300">
                      <div>{rec.strategyName}</div>
                      <div className="text-[11px] text-slate-400">
                        {rec.candlestickPattern} · {rec.regime}
                      </div>
                    </td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-600 dark:text-slate-300">
                      {formatPrice(rec.entryPrice)} / {formatPrice(rec.stopLoss)} / {formatPrice(rec.takeProfit)}
                    </td>
                    <td
                      className={`py-3 px-4 font-mono font-semibold ${
                        rec.outcome === 'WIN'
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : rec.outcome === 'LOSS'
                            ? 'text-rose-600 dark:text-rose-400'
                            : 'text-amber-600 dark:text-amber-400'
                      }`}
                    >
                      {rec.outcome}
                    </td>
                    <td className="py-3 px-5 text-right font-mono tabular-nums">
                      {rec.outcome === 'PENDING' ? (
                        <div className="inline-flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => onResolveRecord(rec.id, 'WIN', 200)}
                            className="px-2 py-1 rounded border border-emerald-500/40 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/10 cursor-pointer"
                          >
                            WIN (+2R)
                          </button>
                          <button
                            type="button"
                            onClick={() => onResolveRecord(rec.id, 'LOSS', -100)}
                            className="px-2 py-1 rounded border border-rose-500/40 text-rose-600 dark:text-rose-400 hover:bg-rose-500/10 cursor-pointer"
                          >
                            LOSS (-1R)
                          </button>
                          <button
                            type="button"
                            onClick={() => onResolveRecord(rec.id, 'BREAKEVEN', 0)}
                            className="px-2 py-1 rounded border border-slate-400/40 text-slate-600 dark:text-slate-300 hover:bg-slate-500/10 cursor-pointer"
                          >
                            BE
                          </button>
                        </div>
                      ) : (
                        <span
                          className={
                            rec.pnlUsd >= 0
                              ? 'text-emerald-600 dark:text-emerald-400 font-semibold'
                              : 'text-rose-600 dark:text-rose-400 font-semibold'
                          }
                        >
                          {rec.pnlUsd >= 0 ? '+' : ''}
                          {formatCurrency(rec.pnlUsd)} ({rec.rMultiple}R)
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
};
