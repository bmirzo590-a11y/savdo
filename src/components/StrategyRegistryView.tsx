import React, { useState } from 'react';
import { CheckCircle2, Lock, ShieldAlert, ShieldCheck } from 'lucide-react';
import {
  IntelligentDecisionReport,
  RiskGuardSettings,
  StrategyConfig,
  StrategyRegistryRecord,
} from '../types/trading';
import { apiJson } from '../utils/apiClient';
import { StrategiesView } from './StrategiesView';

interface StrategyRegistryViewProps {
  registry: StrategyRegistryRecord[];
  ownerVerified: boolean;
  onRegistryUpdated: (next: StrategyRegistryRecord[]) => void;
  onGoToOwnerCenter: () => void;
  // Embedded StrategiesView props
  strategies: StrategyConfig[];
  riskGuard: RiskGuardSettings;
  decisionReport?: IntelligentDecisionReport | null;
  onToggleStrategy: (id: string) => void;
  onUpdateStrategy: (updated: StrategyConfig) => void;
  onUpdateRiskGuard: (updated: RiskGuardSettings) => void;
}

export const StrategyRegistryView: React.FC<StrategyRegistryViewProps> = ({
  registry,
  ownerVerified,
  onRegistryUpdated,
  onGoToOwnerCenter,
  strategies,
  riskGuard,
  decisionReport,
  onToggleStrategy,
  onUpdateStrategy,
  onUpdateRiskGuard,
}) => {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const totalCount = registry.length;
  const approvedCount = registry.filter((s) => s.ownerApproved).length;
  const activeCount = registry.filter((s) => s.ownerApproved && s.active).length;
  const pendingCount = registry.filter((s) => !s.ownerApproved).length;

  const updateStage = async (
    id: string,
    payload: {
      codeReviewStatus?: 'PASSED' | 'PENDING' | 'REJECTED';
      backtestStatus?: 'PASSED' | 'PENDING' | 'FAILED';
      demoTestStatus?: 'PASSED' | 'PENDING' | 'FAILED';
      ownerApproved?: boolean;
      active?: boolean;
    }
  ) => {
    setBusyId(id);
    setError(null);
    setNotice(null);
    try {
      const res = await apiJson<{ ok: boolean; strategies: StrategyRegistryRecord[] }>(
        `/api/registry/strategies/${encodeURIComponent(id)}/stage`,
        {
          method: 'POST',
          body: JSON.stringify(payload),
        }
      );
      onRegistryUpdated(res.strategies);
      setNotice('Strategiya bosqichi lokal bazada yangilandi.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Yangilashda xatolik yuz berdi.');
    } finally {
      setBusyId(null);
    }
  };

  const stageColor = (val: string) => {
    if (val === 'PASSED') return 'text-emerald-600 dark:text-emerald-400';
    if (val === 'REJECTED' || val === 'FAILED') return 'text-rose-600 dark:text-rose-400';
    return 'text-amber-600 dark:text-amber-400';
  };

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-slate-200 dark:border-slate-800/90 bg-white dark:bg-[#131B2B] neon-surface overflow-hidden">
        <div className="p-5 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-1">
            <h1 className="text-lg font-semibold text-slate-900 dark:text-white">
              Strategiya Tasdiqlash Registry (Haqiqiy Lokal Baza)
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400 max-w-2xl">
              Har bir strategiya Source → License → Code Review → Backtest → Demo Test → Owner Approval → Active bosqichlaridan o‘tishi shart. Owner tasdiqlamagan strategiya avtomatik savdoga qo‘shilmaydi.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-4 text-xs font-mono tabular-nums">
            <div>
              <span className="font-sans text-slate-500 dark:text-slate-400">Jami: </span>
              <strong className="text-slate-900 dark:text-white">{totalCount}</strong>
            </div>
            <div>
              <span className="font-sans text-slate-500 dark:text-slate-400">Tasdiqlangan: </span>
              <strong className="text-emerald-500">{approvedCount}</strong>
            </div>
            <div>
              <span className="font-sans text-slate-500 dark:text-slate-400">Faol: </span>
              <strong className="text-[#FF7AA5]">{activeCount}</strong>
            </div>
            <div>
              <span className="font-sans text-slate-500 dark:text-slate-400">Kutilmoqda: </span>
              <strong className="text-amber-500">{pendingCount}</strong>
            </div>
          </div>
        </div>

        {!ownerVerified && (
          <div className="px-5 py-3 border-b border-slate-200 dark:border-slate-800 bg-amber-500/5 flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2 text-amber-600 dark:text-amber-300">
              <Lock className="w-4 h-4 shrink-0" />
              <span>
                Owner tasdig‘ini berish yoki strategiyani Avto-Savdo uchun faollashtirish uchun Owner Markazida parol bilan tasdiqlang.
              </span>
            </div>
            <button
              type="button"
              onClick={onGoToOwnerCenter}
              className="px-3 py-1.5 text-xs font-semibold rounded-md border border-[#F25F8C]/45 text-[#C8285E] dark:text-[#FF7AA5] hover:bg-[#F25F8C]/15 cursor-pointer whitespace-nowrap"
            >
              Owner Markaziga o‘tish
            </button>
          </div>
        )}

        {error && (
          <div className="mx-5 mt-4 px-3.5 py-2.5 rounded-lg border border-rose-500/40 bg-rose-950/25 text-xs text-rose-400 flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {notice && (
          <div className="mx-5 mt-4 px-3.5 py-2 rounded-lg border border-emerald-500/35 bg-emerald-500/10 text-xs text-emerald-400 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{notice}</span>
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400">
                <th className="py-3 px-5">Strategiya & Manba</th>
                <th className="py-3 px-3">Litsenziya</th>
                <th className="py-3 px-3">Code Review</th>
                <th className="py-3 px-3">Backtest</th>
                <th className="py-3 px-3">Demo Test</th>
                <th className="py-3 px-3">Owner Tasdig‘i</th>
                <th className="py-3 px-5 text-right">Avto-Savdo Holati</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800/80">
              {registry.map((item) => {
                const gatesPassed =
                  item.codeReviewStatus === 'PASSED' &&
                  item.backtestStatus === 'PASSED' &&
                  item.demoTestStatus === 'PASSED';
                const isBusy = busyId === item.id;
                return (
                  <tr key={item.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/35">
                    <td className="py-3 px-5">
                      <div className="font-semibold text-slate-900 dark:text-white">{item.name}</div>
                      <div className="text-[11px] font-mono text-slate-500 dark:text-slate-400">
                        {item.source} · {item.style === 'SCALPING' ? 'Skalping' : 'Uzoq muddat'}
                      </div>
                    </td>
                    <td className="py-3 px-3 font-mono text-slate-600 dark:text-slate-300">
                      {item.license}
                    </td>
                    <td className="py-3 px-3">
                      <select
                        aria-label={`${item.name} Code Review`}
                        disabled={isBusy}
                        value={item.codeReviewStatus}
                        onChange={(e) =>
                          void updateStage(item.id, {
                            codeReviewStatus: e.target.value as 'PASSED' | 'PENDING' | 'REJECTED',
                          })
                        }
                        className={`px-2 py-1 rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#0D1320] font-mono text-[11px] ${stageColor(item.codeReviewStatus)}`}
                      >
                        <option value="PENDING">PENDING</option>
                        <option value="PASSED">PASSED</option>
                        <option value="REJECTED">REJECTED</option>
                      </select>
                    </td>
                    <td className="py-3 px-3">
                      <select
                        aria-label={`${item.name} Backtest`}
                        disabled={isBusy}
                        value={item.backtestStatus}
                        onChange={(e) =>
                          void updateStage(item.id, {
                            backtestStatus: e.target.value as 'PASSED' | 'PENDING' | 'FAILED',
                          })
                        }
                        className={`px-2 py-1 rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#0D1320] font-mono text-[11px] ${stageColor(item.backtestStatus)}`}
                      >
                        <option value="PENDING">PENDING</option>
                        <option value="PASSED">PASSED</option>
                        <option value="FAILED">FAILED</option>
                      </select>
                    </td>
                    <td className="py-3 px-3">
                      <select
                        aria-label={`${item.name} Demo Test`}
                        disabled={isBusy}
                        value={item.demoTestStatus}
                        onChange={(e) =>
                          void updateStage(item.id, {
                            demoTestStatus: e.target.value as 'PASSED' | 'PENDING' | 'FAILED',
                          })
                        }
                        className={`px-2 py-1 rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#0D1320] font-mono text-[11px] ${stageColor(item.demoTestStatus)}`}
                      >
                        <option value="PENDING">PENDING</option>
                        <option value="PASSED">PASSED</option>
                        <option value="FAILED">FAILED</option>
                      </select>
                    </td>
                    <td className="py-3 px-3">
                      <button
                        type="button"
                        disabled={isBusy || (!item.ownerApproved && !gatesPassed)}
                        onClick={() =>
                          void updateStage(item.id, { ownerApproved: !item.ownerApproved })
                        }
                        title={
                          !gatesPassed && !item.ownerApproved
                            ? 'Avval Code Review, Backtest va Demo Test PASSED bo‘lishi shart'
                            : 'Owner tasdig‘ini o‘zgartirish'
                        }
                        className={`inline-flex items-center gap-1 px-2.5 py-1 rounded border font-semibold whitespace-nowrap cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
                          item.ownerApproved
                            ? 'border-emerald-500/45 bg-emerald-500/15 text-emerald-500'
                            : 'border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-[#F25F8C]/50'
                        }`}
                      >
                        <ShieldCheck className="w-3.5 h-3.5" />
                        <span>{item.ownerApproved ? 'Tasdiqlangan' : 'Tasdiqlash'}</span>
                      </button>
                    </td>
                    <td className="py-3 px-5 text-right">
                      <button
                        type="button"
                        disabled={isBusy || !item.ownerApproved}
                        onClick={() => void updateStage(item.id, { active: !item.active })}
                        className={`px-3 py-1 rounded border font-semibold whitespace-nowrap cursor-pointer disabled:opacity-35 disabled:cursor-not-allowed ${
                          item.active
                            ? 'border-[#F25F8C]/55 bg-[#F25F8C]/15 text-[#FF7AA5]'
                            : 'border-slate-300 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:text-white'
                        }`}
                      >
                        {item.active ? 'Faol (Avto)' : 'Nofaol'}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* Strategy Brain & Parameter Configuration */}
      <StrategiesView
        strategies={strategies}
        riskGuard={riskGuard}
        decisionReport={decisionReport}
        onToggleStrategy={onToggleStrategy}
        onUpdateStrategy={onUpdateStrategy}
        onUpdateRiskGuard={onUpdateRiskGuard}
      />
    </div>
  );
};
