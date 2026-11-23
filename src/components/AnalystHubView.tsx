import React, { useEffect, useState } from 'react';
import {
  IntelligentDecisionReport,
  MarketPair,
  StrategyBrainSnapshot,
  Timeframe,
} from '../types/trading';
import { formatPrice } from '../data/initialData';

export type AnalystTab = 'verdict' | 'candlesticks' | 'patterns_tech' | 'smc' | 'mtf';

interface AnalystHubViewProps {
  pair: MarketPair;
  pairs: MarketPair[];
  timeframe: Timeframe;
  onChangeTimeframe: (tf: Timeframe) => void;
  onSelectSymbol?: (sym: string) => void;
  brainSnapshot: StrategyBrainSnapshot | null;
  decisionReport: IntelligentDecisionReport | null;
  onLogDecisionToJournal?: () => void;
  initialTab?: AnalystTab;
}

const TIMEFRAMES: Timeframe[] = ['M1', 'M5', 'M15', 'M30', 'H1', 'H4', 'D1', 'W1'];

const TABS: { id: AnalystTab; label: string }[] = [
  { id: 'verdict', label: 'AI Analitik' },
  { id: 'candlesticks', label: 'Sham Intellekti' },
  { id: 'patterns_tech', label: 'Pattern & Indikatorlar' },
  { id: 'smc', label: 'Smart Money' },
  { id: 'mtf', label: 'Multi-Timeframe' },
];

export const AnalystHubView: React.FC<AnalystHubViewProps> = ({
  pair,
  pairs,
  timeframe,
  onChangeTimeframe,
  onSelectSymbol,
  brainSnapshot,
  decisionReport,
  onLogDecisionToJournal,
  initialTab = 'verdict',
}) => {
  const [activeTab, setActiveTab] = useState<AnalystTab>(initialTab);
  const [journalSaved, setJournalSaved] = useState(false);

  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);

  const handleLogClick = () => {
    if (!onLogDecisionToJournal) return;
    onLogDecisionToJournal();
    setJournalSaved(true);
    window.setTimeout(() => setJournalSaved(false), 2600);
  };

  const actionColor = (act: string) => {
    if (act === 'BUY' || act === 'BULLISH') return 'text-emerald-600 dark:text-emerald-400';
    if (act === 'SELL' || act === 'BEARISH') return 'text-red-600 dark:text-rose-400';
    if (act === 'NO TRADE') return 'text-rose-600 dark:text-rose-400';
    return 'text-amber-600 dark:text-amber-400';
  };

  const candlestickReport = brainSnapshot?.candlestickReport ?? null;
  const chartPatternReport = brainSnapshot?.chartPatternReport ?? null;
  const technicals = brainSnapshot?.technicals ?? null;
  const smcDeep = brainSnapshot?.smcDeep ?? null;
  const mtf = decisionReport?.mtf ?? null;

  return (
    <div className="space-y-6">
      {/* Top Toolbar: Symbol, Timeframe, Sub-tab Segmented Navigation */}
      <section className="rounded-xl border border-slate-200 dark:border-slate-800/90 bg-white dark:bg-[#131B2B] neon-surface p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-200 dark:border-slate-800">
          <div>
            <h1 className="text-lg font-semibold text-slate-900 dark:text-white">
              AI Analitika Markazi · {pair.symbol} ({timeframe})
            </h1>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Bozor rejimi, sham geometriyasi, grafik patternlar, SMC likvidlik, 8-taymfreym matritsa va xavf filtrlari bo‘yicha chuqur tahlil.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {onSelectSymbol && (
              <select
                aria-label="Instrument tanlash"
                value={pair.symbol}
                onChange={(e) => onSelectSymbol(e.target.value)}
                className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-slate-200 dark:border-[#F25F8C]/35 bg-slate-50 dark:bg-[#0D1320] text-[#C8285E] dark:text-[#FF7AA5]"
              >
                {pairs.map((p) => (
                  <option key={p.symbol} value={p.symbol}>
                    {p.symbol}
                  </option>
                ))}
              </select>
            )}

            <div className="flex items-center gap-0.5 p-1 rounded-lg bg-slate-100 dark:bg-[#0D1320] border border-slate-200 dark:border-slate-800 overflow-x-auto">
              {TIMEFRAMES.map((tf) => (
                <button
                  key={tf}
                  type="button"
                  onClick={() => onChangeTimeframe(tf)}
                  className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    timeframe === tf
                      ? 'bg-white dark:bg-[#F25F8C]/15 text-slate-900 dark:text-[#FF7AA5]'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                  }`}
                >
                  {tf}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-1 p-1 rounded-lg bg-slate-100 dark:bg-[#0D1320] border border-slate-200 dark:border-slate-800">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  activeTab === tab.id
                    ? 'bg-white dark:bg-[#F25F8C]/20 text-slate-900 dark:text-[#FF7AA5]'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {onLogDecisionToJournal && decisionReport && (
            <button
              type="button"
              onClick={handleLogClick}
              className="px-3.5 py-1.5 text-xs font-semibold rounded-lg bg-gradient-to-r from-[#F25F8C] via-[#EB6B7B] to-[#E87769] text-slate-950 hover:brightness-110 transition-all cursor-pointer whitespace-nowrap shrink-0"
            >
              {journalSaved ? 'Jurnalga yozildi' : 'Qarorni o‘rganish jurnaliga yozish'}
            </button>
          )}
        </div>
      </section>

      {!decisionReport || !brainSnapshot ? (
        <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#131B2B] p-8 text-center text-sm text-slate-500 dark:text-slate-400">
          Tanlangan juftlik bo‘yicha chuqur AI tahlili hisoblanmoqda...
        </section>
      ) : (
        <>
          {/* TAB 1: AI MARKET ANALYST */}
          {activeTab === 'verdict' && (
            <div className="space-y-6">
              <section className="rounded-xl border border-slate-200 dark:border-slate-800/90 bg-white dark:bg-[#131B2B] neon-surface p-6 space-y-5">
                <div className="flex flex-wrap items-start justify-between gap-4 pb-4 border-b border-slate-200 dark:border-slate-800">
                  <div className="space-y-1.5 max-w-3xl">
                    <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                      <span>{decisionReport.symbol}</span>
                      <span aria-hidden="true">·</span>
                      <span>{decisionReport.timeframe}</span>
                      <span aria-hidden="true">·</span>
                      <span>Rejim: {decisionReport.regime.labelUz}</span>
                      <span aria-hidden="true">·</span>
                      <span className="font-mono tabular-nums">Yangilangan: {decisionReport.timestamp}</span>
                    </div>
                    <h2 className={`text-3xl font-bold font-mono tabular-nums ${actionColor(decisionReport.finalAction)}`}>
                      {decisionReport.finalAction}
                    </h2>
                    <p className="text-sm text-slate-700 dark:text-slate-200 leading-relaxed">
                      {decisionReport.explanationUz}
                    </p>
                  </div>

                  <div className="text-right space-y-1 shrink-0">
                    <div className="text-xs text-slate-500 dark:text-slate-400">Tahliliy ball (Konfluensiya)</div>
                    <div className="text-3xl font-bold font-mono tabular-nums text-[#C8285E] dark:text-[#FF7AA5]">
                      {decisionReport.analyticalScore} / 100
                    </div>
                    <div className="text-xs font-mono tabular-nums text-slate-500 dark:text-slate-400">
                      {decisionReport.calibratedWinProbPct !== null
                        ? `Kalibrlangan ehtimollik: ${decisionReport.calibratedWinProbPct.toFixed(1)}%`
                        : 'Statistik ehtimollik: Kalibrlanmagan (<30 namuna)'}
                    </div>
                  </div>
                </div>

                <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                  {decisionReport.calibrationNoteUz}
                </p>

                {/* 10-Dimension Analytical Breakdown */}
                <div>
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-white mb-3">
                    10-O‘lchamli Tahliliy Baholash (0–100)
                  </h3>
                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-x-5 gap-y-3 text-xs">
                    {[
                      ['Trend mosligi', decisionReport.dimensions.trendAlignment],
                      ['Sham tasdig‘i', decisionReport.dimensions.candlestickConfirmation],
                      ['Bozor strukturasi', decisionReport.dimensions.marketStructure],
                      ['Likvidlik / SMC', decisionReport.dimensions.liquidity],
                      ['Momentum', decisionReport.dimensions.momentum],
                      ['Volatillik', decisionReport.dimensions.volatility],
                      ['Hajm (Volume)', decisionReport.dimensions.volume],
                      ['Multi-Timeframe', decisionReport.dimensions.multiTimeframe],
                      ['Strategiya roziligi', decisionReport.dimensions.strategyAgreement],
                      ['Risk / Mukofot', decisionReport.dimensions.riskReward],
                    ].map(([label, val]) => {
                      const num = Number(val);
                      return (
                        <div key={String(label)} className="space-y-1">
                          <div className="flex items-center justify-between">
                            <span className="text-slate-500 dark:text-slate-400">{label}</span>
                            <span className="font-mono tabular-nums font-semibold text-slate-900 dark:text-slate-100">
                              {num}
                            </span>
                          </div>
                          <div className="h-1.5 rounded bg-slate-100 dark:bg-[#0D1320] overflow-hidden">
                            <div
                              className="h-full bg-gradient-to-r from-[#F25F8C] to-[#E87769]"
                              style={{ width: `${Math.max(4, Math.min(100, num))}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </section>

              {/* Evidence & Risk Manager Split */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-stretch">
                <section className="rounded-xl border border-slate-200 dark:border-slate-800/90 bg-white dark:bg-[#131B2B] neon-surface p-5 space-y-4">
                  <h3 className="text-base font-semibold text-slate-900 dark:text-white pb-3 border-b border-slate-200 dark:border-slate-800">
                    Dalillar va Ziddiyatlar (Shaffof Baho)
                  </h3>
                  <div className="space-y-2">
                    <div className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                      Tasdiqlovchi dalillar
                    </div>
                    <ul className="space-y-1.5 text-xs text-slate-700 dark:text-slate-300">
                      {decisionReport.supportingEvidenceUz.map((ev, i) => (
                        <li key={i} className="leading-relaxed">
                          + {ev}
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div className="pt-3 border-t border-slate-200 dark:border-slate-800 space-y-2">
                    <div className="text-xs font-semibold text-amber-600 dark:text-amber-400">
                      Qarshi signallar va xavf ogohlantirishlari
                    </div>
                    <ul className="space-y-1.5 text-xs text-slate-700 dark:text-slate-300">
                      {decisionReport.opposingEvidenceUz.map((ev, i) => (
                        <li key={i} className="leading-relaxed">
                          - {ev}
                        </li>
                      ))}
                    </ul>
                  </div>
                </section>

                <section className="rounded-xl border border-slate-200 dark:border-slate-800/90 bg-white dark:bg-[#131B2B] neon-surface p-5 space-y-4">
                  <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
                    <h3 className="text-base font-semibold text-slate-900 dark:text-white">
                      Intelligent Risk Manager
                    </h3>
                    <span
                      className={`text-xs font-semibold font-mono ${
                        decisionReport.riskEvaluation.overallAllowed
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : 'text-rose-600 dark:text-rose-400'
                      }`}
                    >
                      {decisionReport.riskEvaluation.overallAllowed ? 'RUXSAT ETILGAN' : 'BLOKLANGAN'}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-xs">
                    <div>
                      <span className="text-slate-500 dark:text-slate-400 block">Dinamik SL</span>
                      <span className="mt-0.5 block font-mono tabular-nums font-semibold text-rose-600 dark:text-rose-400">
                        {formatPrice(decisionReport.riskEvaluation.dynamicStopLoss)}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-500 dark:text-slate-400 block">Take-Profit (2R+)</span>
                      <span className="mt-0.5 block font-mono tabular-nums font-semibold text-emerald-600 dark:text-emerald-400">
                        {formatPrice(decisionReport.riskEvaluation.takeProfit)}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-500 dark:text-slate-400 block">Break-Even (1R)</span>
                      <span className="mt-0.5 block font-mono tabular-nums font-semibold text-slate-900 dark:text-white">
                        {formatPrice(decisionReport.riskEvaluation.breakEvenPrice)}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-500 dark:text-slate-400 block">Trailing masofa</span>
                      <span className="mt-0.5 block font-mono tabular-nums text-slate-900 dark:text-white">
                        {formatPrice(decisionReport.riskEvaluation.trailingStopDistance)}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-500 dark:text-slate-400 block">Tavsiya lot</span>
                      <span className="mt-0.5 block font-mono tabular-nums font-semibold text-[#C8285E] dark:text-[#FF7AA5]">
                        {decisionReport.riskEvaluation.recommendedLot.toFixed(2)} lot
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-500 dark:text-slate-400 block">Risk summasi</span>
                      <span className="mt-0.5 block font-mono tabular-nums text-slate-900 dark:text-white">
                        ${decisionReport.riskEvaluation.riskAmountUsd.toFixed(2)} ({decisionReport.riskEvaluation.riskPct}%)
                      </span>
                    </div>
                  </div>

                  <div className="pt-3 border-t border-slate-200 dark:border-slate-800 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs font-mono tabular-nums">
                    <div>
                      <span className="text-slate-500 dark:text-slate-400 block font-sans">Spread filtr</span>
                      <span className={decisionReport.riskEvaluation.spreadOk ? 'text-emerald-500' : 'text-rose-500'}>
                        {decisionReport.riskEvaluation.spreadOk ? 'OK' : 'BLOK'} ({decisionReport.riskEvaluation.spreadPoints} pt)
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-500 dark:text-slate-400 block font-sans">Volatillik</span>
                      <span className={decisionReport.riskEvaluation.volatilityOk ? 'text-emerald-500' : 'text-rose-500'}>
                        {decisionReport.riskEvaluation.volatilityOk ? 'OK' : 'BLOK'}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-500 dark:text-slate-400 block font-sans">Kunlik limit</span>
                      <span className={decisionReport.riskEvaluation.dailyLossOk ? 'text-emerald-500' : 'text-rose-500'}>
                        {decisionReport.riskEvaluation.dailyLossOk ? 'OK' : 'TO‘LGAN'}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-500 dark:text-slate-400 block font-sans">Drawdown</span>
                      <span className={decisionReport.riskEvaluation.drawdownOk ? 'text-emerald-500' : 'text-rose-500'}>
                        {decisionReport.riskEvaluation.drawdownOk ? 'OK' : 'HIMOYA'}
                      </span>
                    </div>
                  </div>
                </section>
              </div>
            </div>
          )}

          {/* TAB 2: CANDLESTICK INTELLIGENCE */}
          {activeTab === 'candlesticks' && candlestickReport && (
            <div className="space-y-6">
              <section className="rounded-xl border border-slate-200 dark:border-slate-800/90 bg-white dark:bg-[#131B2B] neon-surface p-5 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-200 dark:border-slate-800">
                  <div>
                    <h2 className="text-base font-semibold text-slate-900 dark:text-white">
                      Joriy Sham Geometriyasi ({candlestickReport.latestGeometry.time})
                    </h2>
                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                      {candlestickReport.summaryUz}
                    </p>
                  </div>
                  <div className="text-xs font-mono tabular-nums text-slate-500 dark:text-slate-400">
                    Bullish: {candlestickReport.bullishCount} · Bearish: {candlestickReport.bearishCount} · Neytral: {candlestickReport.neutralCount}
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-5 gap-4 text-xs font-mono tabular-nums">
                  <div>
                    <span className="font-sans text-slate-500 dark:text-slate-400 block">Open / Close</span>
                    <span className="text-slate-900 dark:text-white font-semibold">
                      {formatPrice(candlestickReport.latestGeometry.open)} / {formatPrice(candlestickReport.latestGeometry.close)}
                    </span>
                  </div>
                  <div>
                    <span className="font-sans text-slate-500 dark:text-slate-400 block">High / Low</span>
                    <span className="text-slate-900 dark:text-white font-semibold">
                      {formatPrice(candlestickReport.latestGeometry.high)} / {formatPrice(candlestickReport.latestGeometry.low)}
                    </span>
                  </div>
                  <div>
                    <span className="font-sans text-slate-500 dark:text-slate-400 block">Tana (Body)</span>
                    <span className="text-slate-900 dark:text-white">
                      {formatPrice(candlestickReport.latestGeometry.bodySize)} ({(candlestickReport.latestGeometry.bodyRatio * 100).toFixed(0)}%)
                    </span>
                  </div>
                  <div>
                    <span className="font-sans text-slate-500 dark:text-slate-400 block">Yuqori / Pastki Fitil</span>
                    <span className="text-slate-900 dark:text-white">
                      {formatPrice(candlestickReport.latestGeometry.upperWick)} / {formatPrice(candlestickReport.latestGeometry.lowerWick)}
                    </span>
                  </div>
                  <div>
                    <span className="font-sans text-slate-500 dark:text-slate-400 block">Diapazon & Yo‘nalish</span>
                    <span className={actionColor(candlestickReport.latestGeometry.direction)}>
                      {formatPrice(candlestickReport.latestGeometry.candleRange)} · {candlestickReport.latestGeometry.direction}
                    </span>
                  </div>
                </div>
              </section>

              <section className="rounded-xl border border-slate-200 dark:border-slate-800/90 bg-white dark:bg-[#131B2B] neon-surface overflow-hidden">
                <div className="p-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
                  <h3 className="text-base font-semibold text-slate-900 dark:text-white">
                    Aniqlangan Sham Patternlari (Multi-Faktor Tasdiqlash Bilan)
                  </h3>
                  <span className="text-xs font-mono text-slate-500 dark:text-slate-400">
                    {candlestickReport.patterns.length} ta pattern
                  </span>
                </div>

                {candlestickReport.patterns.length === 0 ? (
                  <div className="p-8 text-center text-xs text-slate-500 dark:text-slate-400">
                    So‘nggi shamlarda kuchli yapon sham patterni aniqlanmadi.
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400">
                          <th className="py-3 px-5">Vaqt</th>
                          <th className="py-3 px-4">Pattern</th>
                          <th className="py-3 px-4">Kategoriya / Yo‘nalish</th>
                          <th className="py-3 px-4 text-right">Kuch</th>
                          <th className="py-3 px-4">Tasdiqlanish holati</th>
                          <th className="py-3 px-4 text-right">Invalidatsiya</th>
                          <th className="py-3 px-5">Dalillar</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200 dark:divide-slate-800/80">
                        {candlestickReport.patterns.slice(-15).reverse().map((pat) => (
                          <tr key={pat.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                            <td className="py-3 px-5 font-mono tabular-nums text-slate-500 dark:text-slate-400">
                              {pat.time}
                            </td>
                            <td className="py-3 px-4 font-semibold text-slate-900 dark:text-white">
                              {pat.patternName}
                            </td>
                            <td className="py-3 px-4 font-mono">
                              <span>{pat.category}</span>
                              <span aria-hidden="true" className="mx-1.5 text-slate-400">·</span>
                              <span className={actionColor(pat.bias)}>{pat.bias}</span>
                            </td>
                            <td className="py-3 px-4 text-right font-mono tabular-nums text-[#C8285E] dark:text-[#FF7AA5]">
                              {pat.strength}%
                            </td>
                            <td
                              className={`py-3 px-4 font-mono font-semibold ${
                                pat.confirmationStatus === 'TASDIQLANGAN'
                                  ? 'text-emerald-600 dark:text-emerald-400'
                                  : pat.confirmationStatus === 'RAD_ETILGAN'
                                    ? 'text-rose-600 dark:text-rose-400'
                                    : 'text-amber-600 dark:text-amber-400'
                              }`}
                            >
                              {pat.confirmationStatus}
                            </td>
                            <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-600 dark:text-slate-300">
                              {formatPrice(pat.invalidationPrice)}
                            </td>
                            <td className="py-3 px-5 text-slate-600 dark:text-slate-300 max-w-xs">
                              {pat.confirmationReasons.join(' · ') || pat.invalidationCondition}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            </div>
          )}

          {/* TAB 3: CHART PATTERNS & DEDUPLICATED TECHNICALS */}
          {activeTab === 'patterns_tech' && (
            <div className="space-y-6">
              <section className="rounded-xl border border-slate-200 dark:border-slate-800/90 bg-white dark:bg-[#131B2B] neon-surface p-5 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-200 dark:border-slate-800">
                  <h2 className="text-base font-semibold text-slate-900 dark:text-white">
                    Chart Pattern Intelligence (Kauzal Pivotlar: left=3, right=3)
                  </h2>
                  {chartPatternReport && (
                    <span className="text-xs font-mono tabular-nums text-slate-500 dark:text-slate-400">
                      Breakout: {chartPatternReport.confirmedBreakoutCount} · Shakllanmoqda: {chartPatternReport.formingCount}
                    </span>
                  )}
                </div>

                {!chartPatternReport || chartPatternReport.patterns.length === 0 ? (
                  <p className="py-4 text-xs text-slate-500 dark:text-slate-400">
                    Joriy oyna ichida aniq klassik yoki garmonik chart pattern shakllanmadi.
                  </p>
                ) : (
                  <div className="divide-y divide-slate-200 dark:divide-slate-800">
                    {chartPatternReport.patterns.map((cp) => (
                      <div key={cp.id} className="py-3.5 first:pt-0 last:pb-0 flex flex-wrap items-start justify-between gap-4">
                        <div className="space-y-1 max-w-2xl">
                          <div className="flex flex-wrap items-center gap-2 text-xs">
                            <span className="text-sm font-semibold text-slate-900 dark:text-white">{cp.name}</span>
                            <span aria-hidden="true" className="text-slate-400">·</span>
                            <span className="font-mono text-slate-500 dark:text-slate-400">{cp.category}</span>
                            <span aria-hidden="true" className="text-slate-400">·</span>
                            <span className={`font-mono font-semibold ${actionColor(cp.bias)}`}>{cp.bias}</span>
                            <span aria-hidden="true" className="text-slate-400">·</span>
                            <span className="font-mono text-[#C8285E] dark:text-[#FF7AA5]">{cp.status}</span>
                          </div>
                          <p className="text-xs text-slate-600 dark:text-slate-300">{cp.descriptionUz}</p>
                        </div>

                        <div className="grid grid-cols-3 gap-4 text-xs font-mono tabular-nums shrink-0">
                          <div>
                            <span className="font-sans text-slate-500 dark:text-slate-400 block">Breakout</span>
                            <span className="text-slate-900 dark:text-white">{formatPrice(cp.breakoutLevel)}</span>
                          </div>
                          <div>
                            <span className="font-sans text-slate-500 dark:text-slate-400 block">Target</span>
                            <span className="text-emerald-600 dark:text-emerald-400">{formatPrice(cp.targetPrice)}</span>
                          </div>
                          <div>
                            <span className="font-sans text-slate-500 dark:text-slate-400 block">Invalidatsiya</span>
                            <span className="text-rose-600 dark:text-rose-400">{formatPrice(cp.invalidationLevel)}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>

              {technicals && (
                <section className="rounded-xl border border-slate-200 dark:border-slate-800/90 bg-white dark:bg-[#131B2B] neon-surface p-5 space-y-5">
                  <div className="pb-3 border-b border-slate-200 dark:border-slate-800">
                    <h2 className="text-base font-semibold text-slate-900 dark:text-white">
                      Deduplikatsiyalangan Texnik Indikatorlar Majmuasi
                    </h2>
                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                      Bir xil ma’noni takrorlamaydigan Trend, Momentum, Volatillik, Hajm va Avto-Fibonacci qatlamlari.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6 text-xs">
                    <div className="space-y-2">
                      <div className="font-semibold text-[#C8285E] dark:text-[#FF7AA5]">Trend Qatlami</div>
                      <div className="space-y-1 font-mono tabular-nums text-slate-700 dark:text-slate-300">
                        <div className="flex justify-between"><span>EMA 20 / 50</span><span>{formatPrice(technicals.trend.ema20)} / {formatPrice(technicals.trend.ema50)}</span></div>
                        <div className="flex justify-between"><span>EMA 200 / SMA 20</span><span>{formatPrice(technicals.trend.ema200)} / {formatPrice(technicals.trend.sma20)}</span></div>
                        <div className="flex justify-between"><span>HMA(21) / PSAR</span><span>{formatPrice(technicals.trend.hma21)} · {technicals.trend.psarBias}</span></div>
                        <div className="flex justify-between"><span>Supertrend</span><span>{technicals.trend.supertrendDir === 1 ? 'BULL' : 'BEAR'} ({formatPrice(technicals.trend.supertrendLevel)})</span></div>
                        <div className="flex justify-between"><span>ADX(14) / +DI / -DI</span><span>{technicals.trend.adx14.toFixed(1)} · {technicals.trend.plusDi.toFixed(0)}/{technicals.trend.minusDi.toFixed(0)}</span></div>
                        <div className="flex justify-between"><span>Ichimoku Kumo</span><span>{technicals.trend.ichimokuKumo}</span></div>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <div className="font-semibold text-[#C8285E] dark:text-[#FF7AA5]">Momentum Qatlami</div>
                      <div className="space-y-1 font-mono tabular-nums text-slate-700 dark:text-slate-300">
                        <div className="flex justify-between"><span>RSI(14)</span><span>{technicals.momentum.rsi14.toFixed(1)}</span></div>
                        <div className="flex justify-between"><span>MACD / Signal</span><span>{technicals.momentum.macdLine.toFixed(4)} / {technicals.momentum.macdSignal.toFixed(4)}</span></div>
                        <div className="flex justify-between"><span>MACD Hist</span><span>{technicals.momentum.macdHist.toFixed(4)}</span></div>
                        <div className="flex justify-between"><span>Stoch %K / %D</span><span>{technicals.momentum.stochK.toFixed(1)} / {technicals.momentum.stochD.toFixed(1)}</span></div>
                        <div className="flex justify-between"><span>CCI(20)</span><span>{technicals.momentum.cci20.toFixed(1)}</span></div>
                        <div className="flex justify-between"><span>TTM Squeeze</span><span>{technicals.momentum.ttmSqueezeOn ? 'ON' : 'OFF'} ({technicals.momentum.ttmMomentum.toFixed(3)})</span></div>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <div className="font-semibold text-[#C8285E] dark:text-[#FF7AA5]">Volatillik & Hajm</div>
                      <div className="space-y-1 font-mono tabular-nums text-slate-700 dark:text-slate-300">
                        <div className="flex justify-between"><span>ATR(14)</span><span>{formatPrice(technicals.volatility.atr14)} ({technicals.volatility.atrPct.toFixed(2)}%)</span></div>
                        <div className="flex justify-between"><span>BB Upper / Lower</span><span>{formatPrice(technicals.volatility.bbUpper)} / {formatPrice(technicals.volatility.bbLower)}</span></div>
                        <div className="flex justify-between"><span>BB Kengligi</span><span>{technicals.volatility.bbWidthPct.toFixed(2)}%</span></div>
                        <div className="flex justify-between"><span>VWAP</span><span>{formatPrice(technicals.volatility.vwap)}</span></div>
                        <div className="flex justify-between"><span>Volume Nisbat</span><span>{technicals.volume.volumeRatio.toFixed(2)}x</span></div>
                        <div className="flex justify-between"><span>OBV Trend</span><span>{technicals.volume.obvTrend}</span></div>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <div className="font-semibold text-[#C8285E] dark:text-[#FF7AA5]">Auto Fibonacci ({technicals.fibonacci.direction})</div>
                      <div className="space-y-1 font-mono tabular-nums text-slate-700 dark:text-slate-300">
                        <div className="flex justify-between"><span>0.236 / 0.382</span><span>{formatPrice(technicals.fibonacci.fib236)} / {formatPrice(technicals.fibonacci.fib382)}</span></div>
                        <div className="flex justify-between"><span>0.500 / 0.618</span><span>{formatPrice(technicals.fibonacci.fib500)} / {formatPrice(technicals.fibonacci.fib618)}</span></div>
                        <div className="flex justify-between"><span>0.786</span><span>{formatPrice(technicals.fibonacci.fib786)}</span></div>
                        <div className="flex justify-between"><span>Ext 1.272 / 1.618</span><span>{formatPrice(technicals.fibonacci.ext1272)} / {formatPrice(technicals.fibonacci.ext1618)}</span></div>
                        <div className="pt-1 font-sans text-slate-500 dark:text-slate-400">
                          Zona: {technicals.fibonacci.currentZone}
                        </div>
                      </div>
                    </div>
                  </div>

                  {technicals.deduplicationNotes.length > 0 && (
                    <div className="pt-3 border-t border-slate-200 dark:border-slate-800 space-y-1 text-xs text-slate-500 dark:text-slate-400">
                      {technicals.deduplicationNotes.map((note, i) => (
                        <div key={i}>• {note}</div>
                      ))}
                    </div>
                  )}
                </section>
              )}
            </div>
          )}

          {/* TAB 4: SMART MONEY ANALYSIS */}
          {activeTab === 'smc' && smcDeep && (
            <div className="space-y-6">
              <section className="rounded-xl border border-slate-200 dark:border-slate-800/90 bg-white dark:bg-[#131B2B] neon-surface p-5 space-y-4">
                <div className="pb-3 border-b border-slate-200 dark:border-slate-800">
                  <h2 className="text-base font-semibold text-slate-900 dark:text-white">
                    ICT & Smart Money Concepts (SMC) Chuqur Tahlili
                  </h2>
                  <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">{smcDeep.summaryUz}</p>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
                  <div>
                    <span className="text-slate-500 dark:text-slate-400 block">Tuzilma / MSS</span>
                    <span className="mt-0.5 block font-mono font-semibold text-slate-900 dark:text-white">
                      {smcDeep.structureState} · {smcDeep.mssDetected}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-500 dark:text-slate-400 block">So‘nggi BOS / CHoCH</span>
                    <span className="mt-0.5 block font-mono font-semibold text-[#C8285E] dark:text-[#FF7AA5]">
                      {smcDeep.lastBosOrChoch}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-500 dark:text-slate-400 block">Liquidity Sweep & EQH/EQL</span>
                    <span className="mt-0.5 block font-mono text-slate-900 dark:text-white">
                      {smcDeep.recentSweep} · EQH:{smcDeep.equalHighs ? 'Ha' : 'Yo‘q'} / EQL:{smcDeep.equalLows ? 'Ha' : 'Yo‘q'}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-500 dark:text-slate-400 block">Premium / Discount & OB/FVG</span>
                    <span className="mt-0.5 block font-mono tabular-nums text-slate-900 dark:text-white">
                      {smcDeep.zone} ({smcDeep.zonePct.toFixed(0)}%) · OB:{smcDeep.activeBullObCount}/{smcDeep.activeBearObCount} · FVG:{smcDeep.activeFvgCount}
                    </span>
                  </div>
                </div>
              </section>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-stretch">
                <section className="rounded-xl border border-slate-200 dark:border-slate-800/90 bg-white dark:bg-[#131B2B] neon-surface p-5 space-y-3">
                  <h3 className="text-base font-semibold text-slate-900 dark:text-white pb-2 border-b border-slate-200 dark:border-slate-800">
                    Buy-Side (BSL) & Sell-Side (SSL) Likvidlik Havzalari
                  </h3>
                  <div className="grid grid-cols-2 gap-4 text-xs font-mono tabular-nums">
                    <div className="space-y-1.5">
                      <div className="font-sans font-semibold text-rose-600 dark:text-rose-400">BSL (Yuqori likvidlik)</div>
                      {smcDeep.bslLevels.length === 0 ? (
                        <div className="text-slate-500 font-sans">Aniqlanmadi</div>
                      ) : (
                        smcDeep.bslLevels.map((lvl, i) => (
                          <div key={i} className="flex justify-between text-slate-700 dark:text-slate-300">
                            <span>{lvl.label}</span>
                            <span>{formatPrice(lvl.price)} {lvl.swept ? '(Swept)' : ''}</span>
                          </div>
                        ))
                      )}
                    </div>
                    <div className="space-y-1.5">
                      <div className="font-sans font-semibold text-emerald-600 dark:text-emerald-400">SSL (Pastki likvidlik)</div>
                      {smcDeep.sslLevels.length === 0 ? (
                        <div className="text-slate-500 font-sans">Aniqlanmadi</div>
                      ) : (
                        smcDeep.sslLevels.map((lvl, i) => (
                          <div key={i} className="flex justify-between text-slate-700 dark:text-slate-300">
                            <span>{lvl.label}</span>
                            <span>{formatPrice(lvl.price)} {lvl.swept ? '(Swept)' : ''}</span>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </section>

                <section className="rounded-xl border border-slate-200 dark:border-slate-800/90 bg-white dark:bg-[#131B2B] neon-surface p-5 space-y-3">
                  <h3 className="text-base font-semibold text-slate-900 dark:text-white pb-2 border-b border-slate-200 dark:border-slate-800">
                    Sessiya High / Low Chegaralari (Asia · London · NY)
                  </h3>
                  <table className="w-full text-left border-collapse text-xs font-mono tabular-nums">
                    <thead>
                      <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 font-sans">
                        <th className="py-2">Sessiya</th>
                        <th className="py-2 text-right">High</th>
                        <th className="py-2 text-right">Low</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 dark:divide-slate-800/80 text-slate-700 dark:text-slate-200">
                      <tr>
                        <td className="py-2.5 font-sans">Asia Sessiyasi</td>
                        <td className="py-2.5 text-right">{formatPrice(smcDeep.sessionLevels.asiaHigh)}</td>
                        <td className="py-2.5 text-right">{formatPrice(smcDeep.sessionLevels.asiaLow)}</td>
                      </tr>
                      <tr>
                        <td className="py-2.5 font-sans">London Sessiyasi</td>
                        <td className="py-2.5 text-right">{formatPrice(smcDeep.sessionLevels.londonHigh)}</td>
                        <td className="py-2.5 text-right">{formatPrice(smcDeep.sessionLevels.londonLow)}</td>
                      </tr>
                      <tr>
                        <td className="py-2.5 font-sans">New York Sessiyasi</td>
                        <td className="py-2.5 text-right">{formatPrice(smcDeep.sessionLevels.nyHigh)}</td>
                        <td className="py-2.5 text-right">{formatPrice(smcDeep.sessionLevels.nyLow)}</td>
                      </tr>
                    </tbody>
                  </table>
                </section>
              </div>
            </div>
          )}

          {/* TAB 5: MULTI-TIMEFRAME MATRIX */}
          {activeTab === 'mtf' && mtf && (
            <div className="space-y-6">
              <section className="rounded-xl border border-slate-200 dark:border-slate-800/90 bg-white dark:bg-[#131B2B] neon-surface p-5 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-4 pb-3 border-b border-slate-200 dark:border-slate-800">
                  <div>
                    <h2 className="text-base font-semibold text-slate-900 dark:text-white">
                      Multi-Timeframe Brain (M1 – W1 Ierarxik Matritsa)
                    </h2>
                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                      Makro qatlam (W1/D1/H4) · Setup qatlami (H1/M30) · Kirish qatlami (M15/M5/M1)
                    </p>
                  </div>
                  <span className="text-sm font-mono tabular-nums font-semibold text-[#C8285E] dark:text-[#FF7AA5]">
                    Moslik: {mtf.alignmentPct}%
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
                  <div>
                    <span className="text-slate-500 dark:text-slate-400 block">Makro Trend (W1/D1/H4)</span>
                    <span className={`mt-0.5 block text-base font-mono font-bold ${actionColor(mtf.macroBias)}`}>
                      {mtf.macroBias}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-500 dark:text-slate-400 block">Setup (H1/M30)</span>
                    <span className={`mt-0.5 block text-base font-mono font-bold ${actionColor(mtf.setupBias)}`}>
                      {mtf.setupBias}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-500 dark:text-slate-400 block">Kirish vaqti (M15/M5/M1)</span>
                    <span className={`mt-0.5 block text-base font-mono font-bold ${actionColor(mtf.entryBias)}`}>
                      {mtf.entryBias}
                    </span>
                  </div>
                </div>

                {mtf.conflictDetected && mtf.conflictReasonUz && (
                  <p className="p-3 rounded-lg border border-amber-500/40 bg-amber-500/10 text-xs text-amber-700 dark:text-amber-300">
                    {mtf.conflictReasonUz}
                  </p>
                )}
              </section>

              <section className="rounded-xl border border-slate-200 dark:border-slate-800/90 bg-white dark:bg-[#131B2B] neon-surface overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400">
                        <th className="py-3 px-5">TF</th>
                        <th className="py-3 px-4">Qatlam</th>
                        <th className="py-3 px-4">Yo‘nalish</th>
                        <th className="py-3 px-4">Bozor Rejimi</th>
                        <th className="py-3 px-4 text-right">RSI(14)</th>
                        <th className="py-3 px-4 text-right">ADX(14)</th>
                        <th className="py-3 px-4">SMC Bias</th>
                        <th className="py-3 px-5">Sham Patterni</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 dark:divide-slate-800/80">
                      {mtf.entries.map((row) => (
                        <tr key={row.timeframe} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                          <td className="py-3 px-5 font-mono font-bold text-slate-900 dark:text-white">
                            {row.timeframe}
                          </td>
                          <td className="py-3 px-4 text-slate-500 dark:text-slate-400">{row.layer}</td>
                          <td className={`py-3 px-4 font-mono font-semibold ${actionColor(row.bias)}`}>
                            {row.bias}
                          </td>
                          <td className="py-3 px-4 text-slate-700 dark:text-slate-200">{row.regime}</td>
                          <td className="py-3 px-4 text-right font-mono tabular-nums">{row.rsi14.toFixed(1)}</td>
                          <td className="py-3 px-4 text-right font-mono tabular-nums">{row.adx14.toFixed(1)}</td>
                          <td className={`py-3 px-4 font-mono ${actionColor(row.smcBias)}`}>{row.smcBias}</td>
                          <td className="py-3 px-5 text-slate-600 dark:text-slate-300">{row.candlestickNote}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            </div>
          )}
        </>
      )}
    </div>
  );
};
