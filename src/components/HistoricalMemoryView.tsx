import React, { useCallback, useEffect, useState } from 'react';
import { Database, HardDrive, RefreshCw, RotateCcw, Save } from 'lucide-react';
import {
  LearningOutcome,
  LearningRecord,
  LearningSystemReport,
  LocalMemoryOverview,
} from '../types/trading';
import { apiJson } from '../utils/apiClient';
import { LearningHistoryView } from './LearningHistoryView';

interface HistoricalMemoryViewProps {
  ownerVerified: boolean;
  onGoToOwnerCenter: () => void;
  // Embedded LearningHistoryView props
  learningRecords: LearningRecord[];
  learningReport: LearningSystemReport;
  onResolveLearningRecord: (id: string, outcome: LearningOutcome, pnlUsd: number) => void;
  onSyncPositions: () => void;
  onLogCurrentDecision: () => void;
  onClearJournal: () => void;
}

export const HistoricalMemoryView: React.FC<HistoricalMemoryViewProps> = ({
  ownerVerified,
  onGoToOwnerCenter,
  learningRecords,
  learningReport,
  onResolveLearningRecord,
  onSyncPositions,
  onLogCurrentDecision,
  onClearJournal,
}) => {
  const [tab, setTab] = useState<'disk' | 'learning'>('disk');
  const [overview, setOverview] = useState<LocalMemoryOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pendingRestoreFile, setPendingRestoreFile] = useState<string | null>(null);

  const loadOverview = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiJson<LocalMemoryOverview>('/api/memory/overview');
      setOverview(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Lokal baza ma’lumotlarini yuklab bo‘lmadi.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadOverview();
  }, [loadOverview]);

  const handleManualBackup = async () => {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const res = await apiJson<{ ok: boolean; backup: { filename: string } }>('/api/memory/backup', {
        method: 'POST',
      });
      setMessage(`Zaxira nusxa yaratildi: ${res.backup.filename}`);
      await loadOverview();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Backup yaratib bo‘lmadi.');
    } finally {
      setBusy(false);
    }
  };

  const handleToggleAutoBackup = async () => {
    if (!overview) return;
    setBusy(true);
    setError(null);
    try {
      await apiJson('/api/system/control', {
        method: 'POST',
        body: JSON.stringify({
          action: 'TOGGLE_AUTO_BACKUP',
          enabled: !overview.autoBackupEnabled,
        }),
      });
      await loadOverview();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Avto-backup holatini o‘zgartirib bo‘lmadi.');
    } finally {
      setBusy(false);
    }
  };

  const handleConfirmRestore = async () => {
    if (!pendingRestoreFile) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await apiJson('/api/memory/restore', {
        method: 'POST',
        body: JSON.stringify({ filename: pendingRestoreFile }),
      });
      setMessage(`Baza muvaffaqiyatli tiklandi: ${pendingRestoreFile}`);
      setPendingRestoreFile(null);
      await loadOverview();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Bazani tiklashda xatolik.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-slate-200 dark:border-slate-800/90 bg-white dark:bg-[#131B2B] neon-surface p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-200 dark:border-slate-800">
          <div>
            <h1 className="text-lg font-semibold text-slate-900 dark:text-white">
              Tarixiy Xotira & Lokal Disk Bazasi
            </h1>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Strategiyalar, tahlillar, signallar va savdo tarixi lokal diskda saqlanadi. Avtomatik backup, tiklash va disk monitoringi faol.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1 p-1 rounded-lg bg-slate-100 dark:bg-[#0D1320] border border-slate-200 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setTab('disk')}
                className={`px-3 py-1.5 text-xs font-medium rounded-md cursor-pointer whitespace-nowrap ${
                  tab === 'disk'
                    ? 'bg-white dark:bg-[#F25F8C]/20 text-slate-900 dark:text-[#FF7AA5]'
                    : 'text-slate-500 dark:text-slate-400'
                }`}
              >
                Lokal Baza & Backup
              </button>
              <button
                type="button"
                onClick={() => setTab('learning')}
                className={`px-3 py-1.5 text-xs font-medium rounded-md cursor-pointer whitespace-nowrap ${
                  tab === 'learning'
                    ? 'bg-white dark:bg-[#F25F8C]/20 text-slate-900 dark:text-[#FF7AA5]'
                    : 'text-slate-500 dark:text-slate-400'
                }`}
              >
                AI O‘rganish Jurnali
              </button>
            </div>
          </div>
        </div>

        {tab === 'disk' && (
          <div className="space-y-5">
            {error && (
              <div className="px-3.5 py-2.5 rounded-lg border border-rose-500/40 bg-rose-950/25 text-xs text-rose-400">
                {error}
              </div>
            )}
            {message && (
              <div className="px-3.5 py-2.5 rounded-lg border border-emerald-500/40 bg-emerald-500/10 text-xs text-emerald-400">
                {message}
              </div>
            )}

            {loading || !overview ? (
              <div className="py-8 text-center text-xs font-mono text-slate-400">
                Disk bazasi holati o‘qilmoqda...
              </div>
            ) : (
              <>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
                  <div className="p-3.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0D1320]">
                    <div className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400">
                      <Database className="w-3.5 h-3.5" />
                      <span>Baza holati & Hajmi</span>
                    </div>
                    <div className="mt-1.5 text-base font-mono font-semibold text-emerald-500">
                      {overview.dbHealthy ? 'Sog‘lom' : 'Tiklangan'} · {overview.dbSizeKb} KB
                    </div>
                  </div>

                  <div className="p-3.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0D1320]">
                    <div className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400">
                      <HardDrive className="w-3.5 h-3.5" />
                      <span>Disk maydoni</span>
                    </div>
                    <div className="mt-1.5 text-base font-mono tabular-nums font-semibold text-slate-900 dark:text-white">
                      {overview.disk.freeGb !== null && overview.disk.totalGb !== null
                        ? `${overview.disk.freeGb} / ${overview.disk.totalGb} GB`
                        : 'Aniqlanmadi'}
                    </div>
                  </div>

                  <div className="p-3.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0D1320]">
                    <div className="text-slate-500 dark:text-slate-400">Saqlangan yozuvlar</div>
                    <div className="mt-1.5 text-sm font-mono tabular-nums font-semibold text-slate-900 dark:text-white">
                      {overview.counts.analyses} analiz · {overview.counts.signals} signal
                    </div>
                  </div>

                  <div className="p-3.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0D1320]">
                    <div className="text-slate-500 dark:text-slate-400">Oxirgi zaxira</div>
                    <div className="mt-1.5 text-sm font-mono tabular-nums font-semibold text-[#FF7AA5]">
                      {overview.lastBackupAt
                        ? new Date(overview.lastBackupAt).toLocaleTimeString('en-GB')
                        : 'Hali yo‘q'}
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={handleManualBackup}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg bg-gradient-to-r from-[#F25F8C] via-[#EB6B7B] to-[#E87769] text-slate-950 hover:brightness-110 disabled:opacity-50 cursor-pointer whitespace-nowrap"
                    >
                      <Save className="w-3.5 h-3.5" />
                      <span>Hozir Zaxira (Backup) olish</span>
                    </button>

                    <button
                      type="button"
                      disabled={busy}
                      onClick={handleToggleAutoBackup}
                      className={`px-3 py-2 text-xs font-semibold rounded-lg border cursor-pointer whitespace-nowrap ${
                        overview.autoBackupEnabled
                          ? 'border-emerald-500/45 bg-emerald-500/10 text-emerald-500'
                          : 'border-slate-300 dark:border-slate-700 text-slate-500'
                      }`}
                    >
                      Avto-Backup: {overview.autoBackupEnabled ? 'Yoqilgan (soatlik)' : 'O‘chirilgan'}
                    </button>
                  </div>

                  <button
                    type="button"
                    disabled={loading}
                    onClick={() => void loadOverview()}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-[#F25F8C]/50 cursor-pointer"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
                    <span>Yangilash</span>
                  </button>
                </div>

                {/* Backups & Recovery Table */}
                <div className="rounded-lg border border-slate-200 dark:border-slate-800 overflow-hidden">
                  <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs">
                    <span className="font-semibold text-slate-900 dark:text-white">
                      Zaxira Nusxalar va Ma’lumotlarni Tiklash (Recovery)
                    </span>
                    <span className="font-mono text-slate-500">{overview.backups.length} ta fayl</span>
                  </div>
                  {overview.backups.length === 0 ? (
                    <div className="p-6 text-center text-xs text-slate-500">
                      Hali zaxira nusxa yaratilmagan. Yuqoridagi tugma orqali ilk nusxani yarating.
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse text-xs font-mono tabular-nums">
                        <thead>
                          <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500 font-sans">
                            <th className="py-2.5 px-4">Fayl nomi</th>
                            <th className="py-2.5 px-4">Yaratilgan vaqt</th>
                            <th className="py-2.5 px-4 text-right">Hajmi</th>
                            <th className="py-2.5 px-4 text-right">Tiklash</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-200 dark:divide-slate-800/80">
                          {overview.backups.map((b) => (
                            <tr key={b.filename} className="hover:bg-slate-50 dark:hover:bg-slate-800/35">
                              <td className="py-2.5 px-4 text-slate-900 dark:text-slate-200">{b.filename}</td>
                              <td className="py-2.5 px-4 text-slate-500">
                                {new Date(b.createdAt).toLocaleString('en-GB')}
                              </td>
                              <td className="py-2.5 px-4 text-right text-slate-500">
                                {(b.sizeBytes / 1024).toFixed(1)} KB
                              </td>
                              <td className="py-2.5 px-4 text-right font-sans">
                                {ownerVerified ? (
                                  <button
                                    type="button"
                                    disabled={busy}
                                    onClick={() => setPendingRestoreFile(b.filename)}
                                    className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold rounded border border-amber-500/45 text-amber-500 hover:bg-amber-500/15 cursor-pointer"
                                  >
                                    <RotateCcw className="w-3 h-3" />
                                    <span>Tiklash</span>
                                  </button>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={onGoToOwnerCenter}
                                    className="text-[11px] text-[#FF7AA5] hover:underline cursor-pointer"
                                  >
                                    Owner tasdig‘i kerak
                                  </button>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

                {/* Recent Saved Analyses & Signals */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <div className="rounded-lg border border-slate-200 dark:border-slate-800 overflow-hidden">
                    <div className="px-4 py-2.5 border-b border-slate-200 dark:border-slate-800 text-xs font-semibold text-slate-900 dark:text-white">
                      Diskdagi so‘nggi AI tahlillar ({overview.recentAnalyses.length})
                    </div>
                    <div className="max-h-60 overflow-y-auto divide-y divide-slate-200 dark:divide-slate-800/80 text-xs">
                      {overview.recentAnalyses.length === 0 ? (
                        <div className="p-5 text-center text-slate-500">Hali tahlil yozilmagan.</div>
                      ) : (
                        overview.recentAnalyses.map((an) => (
                          <div key={an.id} className="px-4 py-2.5 space-y-0.5">
                            <div className="flex items-center justify-between font-mono">
                              <span className="font-semibold text-slate-900 dark:text-white">
                                {an.symbol} · {an.timeframe} · {an.action} ({an.analyticalScore})
                              </span>
                              <span className="text-[11px] text-slate-500">
                                {new Date(an.timestamp).toLocaleTimeString('en-GB')}
                              </span>
                            </div>
                            <p className="text-slate-500 dark:text-slate-400 line-clamp-2">{an.summaryUz}</p>
                          </div>
                        ))
                      )}
                    </div>
                  </div>

                  <div className="rounded-lg border border-slate-200 dark:border-slate-800 overflow-hidden">
                    <div className="px-4 py-2.5 border-b border-slate-200 dark:border-slate-800 text-xs font-semibold text-slate-900 dark:text-white">
                      Diskdagi signallar va savdolar ({overview.recentSignals.length})
                    </div>
                    <div className="max-h-60 overflow-y-auto divide-y divide-slate-200 dark:divide-slate-800/80 text-xs">
                      {overview.recentSignals.length === 0 ? (
                        <div className="p-5 text-center text-slate-500">Hali signal yozilmagan.</div>
                      ) : (
                        overview.recentSignals.map((sig) => (
                          <div key={sig.id} className="px-4 py-2.5 flex items-center justify-between gap-2 font-mono tabular-nums">
                            <div>
                              <div className="font-semibold text-slate-900 dark:text-white">
                                {sig.symbol} · {sig.direction} ({sig.timeframe})
                              </div>
                              <div className="font-sans text-[11px] text-slate-500">{sig.strategyName}</div>
                            </div>
                            <div className="text-right">
                              <div className="text-slate-300">{sig.entryPrice}</div>
                              <div className="text-[11px] text-slate-500">{sig.outcome}</div>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        )}
      </section>

      {tab === 'learning' && (
        <LearningHistoryView
          records={learningRecords}
          report={learningReport}
          onResolveRecord={onResolveLearningRecord}
          onSyncPositions={onSyncPositions}
          onLogCurrentDecision={onLogCurrentDecision}
          onClearJournal={onClearJournal}
        />
      )}

      {/* Confirm Restore Dialog */}
      {pendingRestoreFile && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" role="dialog" aria-modal="true">
          <div className="w-full max-w-md rounded-xl border border-amber-500/40 bg-[#0D1320] p-6 space-y-4">
            <h2 className="text-base font-semibold text-white">Bazani zaxiradan tiklash</h2>
            <p className="text-xs text-slate-300 leading-relaxed">
              <strong className="font-mono text-amber-300">{pendingRestoreFile}</strong> fayli hozirgi lokal bazaning o‘rniga yuklanadi. Joriy baza avtomatik ravishda pre-restore nusxa sifatida saqlanadi. Davom etasizmi?
            </p>
            <div className="flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setPendingRestoreFile(null)}
                className="px-3.5 py-2 text-xs font-medium rounded-lg border border-slate-700 text-slate-300 hover:bg-slate-800 cursor-pointer"
              >
                Bekor qilish
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void handleConfirmRestore()}
                className="px-3.5 py-2 text-xs font-semibold rounded-lg bg-amber-500 text-slate-950 hover:bg-amber-400 cursor-pointer"
              >
                {busy ? 'Tiklanmoqda...' : 'Ha, bazani tiklash'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
