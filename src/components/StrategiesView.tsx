import React, { useState } from 'react';
import { IntelligentDecisionReport, RiskGuardSettings, StrategyConfig } from '../types/trading';
import { formatCurrency, formatPrice } from '../config/initialData';

interface StrategiesViewProps {
  strategies: StrategyConfig[];
  riskGuard: RiskGuardSettings;
  decisionReport?: IntelligentDecisionReport | null;
  onToggleStrategy: (id: string) => void;
  onUpdateStrategy: (updated: StrategyConfig) => void;
  onUpdateRiskGuard: (updated: RiskGuardSettings) => void;
}

export const StrategiesView: React.FC<StrategiesViewProps> = ({
  strategies,
  riskGuard,
  decisionReport,
  onToggleStrategy,
  onUpdateStrategy,
  onUpdateRiskGuard,
}) => {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftStrategy, setDraftStrategy] = useState<StrategyConfig | null>(null);
  const [savedNotice, setSavedNotice] = useState(false);

  const startEdit = (s: StrategyConfig) => {
    setEditingId(s.id);
    setDraftStrategy({ ...s });
  };

  const saveEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!draftStrategy) return;
    onUpdateStrategy(draftStrategy);
    setEditingId(null);
    setDraftStrategy(null);
  };

  const handleRiskSave = (e: React.FormEvent) => {
    e.preventDefault();
    setSavedNotice(true);
    window.setTimeout(() => setSavedNotice(false), 2500);
  };

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#131B2B] neon-surface p-6">
        <div className="flex flex-wrap items-start justify-between gap-4 pb-4 border-b border-slate-200 dark:border-slate-800">
          <div>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
              Global Risk Guard (MT5 Himoya qoidalari)
            </h2>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              Kunlik zarar chegarasi yoki umumiy pasayish oshib ketganda AI va botlarni avtomatik to‘xtatish qoidalari.
            </p>
          </div>
          {savedNotice && (
            <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400">
              Sozlamalar saqlandi
            </span>
          )}
        </div>

        <form onSubmit={handleRiskSave} className="mt-5 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 items-end">
          <div>
            <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1.5">
              Kunlik maksimal zarar (USD)
            </label>
            <input
              type="number"
              min={50}
              value={riskGuard.dailyMaxLossUsdt}
              onChange={(e) =>
                onUpdateRiskGuard({ ...riskGuard, dailyMaxLossUsdt: Number(e.target.value) || 0 })
              }
              className="w-full px-3 py-2 text-sm font-mono tabular-nums rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#0D1320] text-slate-900 dark:text-white"
            />
          </div>

          <div>
            <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1.5">
              Maksimal ochiq pozitsiyalar
            </label>
            <input
              type="number"
              min={1}
              max={30}
              value={riskGuard.maxOpenPositions}
              onChange={(e) =>
                onUpdateRiskGuard({ ...riskGuard, maxOpenPositions: Number(e.target.value) || 1 })
              }
              className="w-full px-3 py-2 text-sm font-mono tabular-nums rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#0D1320] text-slate-900 dark:text-white"
            />
          </div>

          <div>
            <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1.5">
              Drawdown Kill-Switch (%)
            </label>
            <input
              type="number"
              step="0.5"
              min={1}
              max={50}
              value={riskGuard.drawdownLimitPct}
              onChange={(e) =>
                onUpdateRiskGuard({ ...riskGuard, drawdownLimitPct: Number(e.target.value) || 1 })
              }
              className="w-full px-3 py-2 text-sm font-mono tabular-nums rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#0D1320] text-slate-900 dark:text-white"
            />
          </div>

          <div>
            <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1.5">
              Standart savdo riski (%)
            </label>
            <input
              type="number"
              step="0.1"
              min={0.1}
              max={10}
              value={riskGuard.defaultRiskPct ?? 1.0}
              onChange={(e) =>
                onUpdateRiskGuard({ ...riskGuard, defaultRiskPct: Number(e.target.value) || 1.0 })
              }
              className="w-full px-3 py-2 text-sm font-mono tabular-nums rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#0D1320] text-slate-900 dark:text-white"
            />
          </div>

          <div>
            <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1.5">
              Maks. Spred filtri (pt)
            </label>
            <input
              type="number"
              min={10}
              max={5000}
              value={riskGuard.maxSpreadPoints ?? 300}
              onChange={(e) =>
                onUpdateRiskGuard({ ...riskGuard, maxSpreadPoints: Number(e.target.value) || 300 })
              }
              className="w-full px-3 py-2 text-sm font-mono tabular-nums rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#0D1320] text-slate-900 dark:text-white"
            />
          </div>

          <div>
            <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1.5">
              Maks. ATR volatillik (%)
            </label>
            <input
              type="number"
              step="0.1"
              min={0.2}
              max={20}
              value={riskGuard.maxVolatilityAtrPct ?? 2.5}
              onChange={(e) =>
                onUpdateRiskGuard({ ...riskGuard, maxVolatilityAtrPct: Number(e.target.value) || 2.5 })
              }
              className="w-full px-3 py-2 text-sm font-mono tabular-nums rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#0D1320] text-slate-900 dark:text-white"
            />
          </div>

          <div className="sm:col-span-2 flex items-center justify-between gap-3">
            <label className="flex items-center gap-2.5 text-sm text-slate-700 dark:text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                checked={riskGuard.autoKillOnDrawdown}
                onChange={(e) =>
                  onUpdateRiskGuard({ ...riskGuard, autoKillOnDrawdown: e.target.checked })
                }
                className="w-4 h-4 rounded accent-[#F25F8C] cursor-pointer"
              />
              <span>Avto Kill-Switch</span>
            </label>
            <button
              type="submit"
              className="px-4 py-2 text-sm font-semibold rounded-lg bg-gradient-to-r from-[#F25F8C] via-[#EB6B7B] to-[#E87769] text-slate-950 hover:brightness-110 neon-glow-cyan transition-all cursor-pointer whitespace-nowrap"
            >
              Saqlash
            </button>
          </div>
        </form>
      </section>

      {decisionReport && (
        <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#131B2B] neon-surface overflow-hidden">
          <div className="p-6 border-b border-slate-200 dark:border-slate-800 space-y-1.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
                Bozor Rejimi va Strategiya Tanlash Miyasi ({decisionReport.symbol} · {decisionReport.timeframe})
              </h2>
              <span className="text-xs font-mono font-semibold text-[#C8285E] dark:text-[#FF7AA5]">
                {decisionReport.regime.labelUz} ({decisionReport.regime.regime})
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {decisionReport.regime.rationaleUz}
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400">
                  <th className="py-3 px-5">Strategiya</th>
                  <th className="py-3 px-4">Rejim mosligi</th>
                  <th className="py-3 px-4">Signal</th>
                  <th className="py-3 px-4">Tasdiq / Qarshi signal</th>
                  <th className="py-3 px-4">Kirish / Invalidatsiya</th>
                  <th className="py-3 px-5 text-right">SL / TP (R:R)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800/80">
                {decisionReport.strategyDecisions.map((card) => (
                  <tr
                    key={card.strategyId}
                    className={`hover:bg-slate-50 dark:hover:bg-slate-800/40 ${
                      !card.selectedForRegime ? 'opacity-65' : ''
                    }`}
                  >
                    <td className="py-3 px-5 font-medium text-slate-900 dark:text-white">
                      <div>{card.strategyName}</div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400">{card.reasonUz}</div>
                    </td>
                    <td className="py-3 px-4 font-mono">
                      <span className={card.selectedForRegime ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-500'}>
                        {card.selectedForRegime ? 'Tanlangan' : 'Chetlatilgan'}
                      </span>
                    </td>
                    <td
                      className={`py-3 px-4 font-mono font-semibold ${
                        card.signal === 'BUY'
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : card.signal === 'SELL'
                            ? 'text-rose-600 dark:text-rose-400'
                            : 'text-amber-600 dark:text-amber-400'
                      }`}
                    >
                      {card.signal}
                    </td>
                    <td className="py-3 px-4 text-slate-600 dark:text-slate-300 max-w-xs">
                      {card.confirmingIndicators.length > 0 && (
                        <div className="text-emerald-600 dark:text-emerald-400">
                          + {card.confirmingIndicators.join(', ')}
                        </div>
                      )}
                      {card.opposingSignals.length > 0 && (
                        <div className="text-amber-600 dark:text-amber-400">
                          - {card.opposingSignals.join(', ')}
                        </div>
                      )}
                    </td>
                    <td className="py-3 px-4 text-slate-600 dark:text-slate-300 max-w-xs">
                      <div>{card.entryCondition}</div>
                      <div className="text-[11px] text-slate-400">Inv: {card.invalidation}</div>
                    </td>
                    <td className="py-3 px-5 text-right font-mono tabular-nums text-slate-700 dark:text-slate-200">
                      <div>{formatPrice(card.sl)} / {formatPrice(card.tp)}</div>
                      <div className="text-[11px] text-[#C8285E] dark:text-[#FF7AA5]">1:{card.riskReward}</div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#131B2B] neon-surface divide-y divide-slate-200 dark:divide-slate-800">
        <div className="p-6">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
            Avtomatlashtirilgan AI va MT5 strategiyalari
          </h2>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Har bir algoritm uchun ajratilgan kapital, stop-loss va trailing stop parametrlarini boshqaring.
          </p>
        </div>

        {strategies.map((strat) => {
          const isEditing = editingId === strat.id && draftStrategy;
          return (
            <div key={strat.id} className="p-6">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="max-w-2xl">
                  <div className="flex flex-wrap items-center gap-3">
                    <h3 className="text-base font-semibold text-slate-900 dark:text-white">
                      {strat.name}
                    </h3>
                    <span className="text-xs text-slate-500 dark:text-slate-400">
                      {strat.pairScope}
                    </span>
                    {strat.sourceRepo && (
                      <>
                        <span aria-hidden="true" className="text-slate-400">
                          ·
                        </span>
                        <span className="text-xs font-mono text-[#C8285E] dark:text-[#FF7AA5]">
                          {strat.sourceRepo}
                        </span>
                      </>
                    )}
                    <span aria-hidden="true" className="text-slate-400">
                      ·
                    </span>
                    <span
                      className={`text-xs font-medium ${
                        strat.enabled
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : 'text-slate-500 dark:text-slate-400'
                      }`}
                    >
                      {strat.enabled ? 'Faol' : 'To‘xtatilgan'}
                    </span>
                  </div>
                  <p className="mt-1.5 text-sm text-slate-600 dark:text-slate-400">
                    {strat.description}
                  </p>
                </div>

                <div className="flex items-center gap-3 shrink-0">
                  <button
                    type="button"
                    onClick={() => (isEditing ? setEditingId(null) : startEdit(strat))}
                    className="px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:border-[#F25F8C]/45 transition-colors cursor-pointer"
                  >
                    {isEditing ? 'Yopish' : 'Parametrlar'}
                  </button>
                  <button
                    type="button"
                    onClick={() => onToggleStrategy(strat.id)}
                    className={`px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-colors cursor-pointer whitespace-nowrap ${
                      strat.enabled
                        ? 'bg-red-600/10 text-red-600 dark:text-rose-400 hover:bg-red-600/20'
                        : 'bg-emerald-600 dark:bg-emerald-500 text-white dark:text-slate-950 hover:opacity-90'
                    }`}
                  >
                    {strat.enabled ? 'O‘chirish' : 'Yoqish'}
                  </button>
                </div>
              </div>

              <div className="mt-4 grid grid-cols-2 sm:grid-cols-5 gap-4 pt-4 border-t border-slate-100 dark:border-slate-800/70 text-xs">
                <div>
                  <span className="text-slate-500 dark:text-slate-400 block">Maks. kapital</span>
                  <span className="mt-0.5 block font-mono tabular-nums text-sm font-medium text-slate-900 dark:text-white">
                    ${strat.maxAllocationUsdt.toLocaleString('en-US')}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 dark:text-slate-400 block">SL / TP</span>
                  <span className="mt-0.5 block font-mono tabular-nums text-sm font-medium text-slate-900 dark:text-white">
                    {strat.stopLossPct}% / {strat.takeProfitPct}%
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 dark:text-slate-400 block">Yelka limiti</span>
                  <span className="mt-0.5 block font-mono tabular-nums text-sm font-medium text-slate-900 dark:text-white">
                    1:{strat.leverageCap} · {strat.trailingStop ? 'Trailing' : 'Fix'}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 dark:text-slate-400 block">Yutuq / Savdolar</span>
                  <span className="mt-0.5 block font-mono tabular-nums text-sm font-medium text-slate-900 dark:text-white">
                    {strat.winRate}% · {strat.totalTrades} ta
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 dark:text-slate-400 block">Sof foyda</span>
                  <span
                    className={`mt-0.5 block font-mono tabular-nums text-sm font-medium ${
                      strat.netPnlUsdt >= 0
                        ? 'text-emerald-600 dark:text-emerald-400'
                        : 'text-red-600 dark:text-rose-400'
                    }`}
                  >
                    +{formatCurrency(strat.netPnlUsdt)}
                  </span>
                </div>
              </div>

              {isEditing && draftStrategy && (
                <form
                  onSubmit={saveEdit}
                  className="mt-4 pt-4 border-t border-slate-200 dark:border-slate-800 grid grid-cols-2 sm:grid-cols-5 gap-3 items-end"
                >
                  <div>
                    <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">
                      Kapital (USD)
                    </label>
                    <input
                      type="number"
                      value={draftStrategy.maxAllocationUsdt}
                      onChange={(e) =>
                        setDraftStrategy({
                          ...draftStrategy,
                          maxAllocationUsdt: Number(e.target.value) || 0,
                        })
                      }
                      className="w-full px-2.5 py-1.5 text-sm font-mono tabular-nums rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#0D1320] text-slate-900 dark:text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">
                      Stop-Loss (%)
                    </label>
                    <input
                      type="number"
                      step="0.1"
                      value={draftStrategy.stopLossPct}
                      onChange={(e) =>
                        setDraftStrategy({
                          ...draftStrategy,
                          stopLossPct: Number(e.target.value) || 0.5,
                        })
                      }
                      className="w-full px-2.5 py-1.5 text-sm font-mono tabular-nums rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#0D1320] text-slate-900 dark:text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">
                      Take-Profit (%)
                    </label>
                    <input
                      type="number"
                      step="0.1"
                      value={draftStrategy.takeProfitPct}
                      onChange={(e) =>
                        setDraftStrategy({
                          ...draftStrategy,
                          takeProfitPct: Number(e.target.value) || 1,
                        })
                      }
                      className="w-full px-2.5 py-1.5 text-sm font-mono tabular-nums rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#0D1320] text-slate-900 dark:text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">
                      Maks. yelka
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={500}
                      value={draftStrategy.leverageCap}
                      onChange={(e) =>
                        setDraftStrategy({
                          ...draftStrategy,
                          leverageCap: Number(e.target.value) || 10,
                        })
                      }
                      className="w-full px-2.5 py-1.5 text-sm font-mono tabular-nums rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#0D1320] text-slate-900 dark:text-white"
                    />
                  </div>
                  <button
                    type="submit"
                    className="py-2 px-4 text-xs font-semibold rounded-lg bg-gradient-to-r from-[#F25F8C] via-[#EB6B7B] to-[#E87769] text-slate-950 hover:brightness-110 neon-glow-cyan transition-all cursor-pointer"
                  >
                    Yangilash
                  </button>
                </form>
              )}
            </div>
          );
        })}
      </section>
    </div>
  );
};
