import React, { useState } from 'react';
import {
  Activity,
  AlertTriangle,
  BrainCircuit,
  CheckCircle2,
  FlaskConical,
  RefreshCw,
  ShieldAlert,
  Sparkles,
  Terminal,
} from 'lucide-react';
import {
  DemoStressTestResult,
  LiveSystemStatusSnapshot,
  ViewId,
} from '../types/trading';
import { formatPrice } from '../config/initialData';
import { apiJson } from '../utils/apiClient';

interface AutonomousDiagnosticsPanelProps {
  status: LiveSystemStatusSnapshot | null;
  aiBusy: boolean;
  lastAiBriefUz: string | null;
  lastAiProvider: string | null;
  lastAiError: string | null;
  onRunFullAiCycle: () => void;
  onSelectSymbol?: (symbol: string) => void;
  onNavigate?: (view: ViewId) => void;
  compact?: boolean;
}

export const AutonomousDiagnosticsPanel: React.FC<AutonomousDiagnosticsPanelProps> = ({
  status,
  aiBusy,
  lastAiBriefUz,
  lastAiProvider,
  lastAiError,
  onRunFullAiCycle,
  onSelectSymbol,
  onNavigate,
  compact = false,
}) => {
  const [stressBusy, setStressBusy] = useState(false);
  const [stressResult, setStressResult] = useState<DemoStressTestResult | null>(null);
  const [stressError, setStressError] = useState<string | null>(null);

  const metrics = status?.engineMetrics;
  const diagnostics = status?.diagnostics ?? [];
  const logs = status?.executionLogs ?? [];
  const perSymbol = Object.values(status?.perSymbolReports ?? {}).sort(
    (a, b) => b.analyticalScore - a.analyticalScore
  );

  const aiState = metrics?.aiAnalysisState ?? 'IDLE';
  const aiStateColor =
    aiState === 'ACTIVE'
      ? 'text-emerald-600 dark:text-[#00E5A0]'
      : aiState === 'ERROR'
        ? 'text-rose-500'
        : 'text-amber-500';

  const runStressTest = async () => {
    setStressBusy(true);
    setStressError(null);
    try {
      const res = await apiJson<{ ok: boolean; result: DemoStressTestResult }>(
        '/api/engine/demo-stress-test',
        { method: 'POST', body: JSON.stringify({}) }
      );
      setStressResult(res.result);
    } catch (err) {
      setStressError(err instanceof Error ? err.message : 'Stress testda xatolik.');
    } finally {
      setStressBusy(false);
    }
  };

  const formatTime = (iso: string | null | undefined) => {
    if (!iso) return '—';
    try {
      return new Date(iso).toLocaleTimeString('en-GB');
    } catch {
      return iso;
    }
  };

  return (
    <section className="rounded-xl border border-slate-200 dark:border-violet-500/30 bg-white dark:bg-[#0B1120] tk-glass p-4 space-y-3.5">
      {/* Header + Actions */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-200 dark:border-violet-500/20">
        <div className="flex items-center gap-2 min-w-0">
          <BrainCircuit className="w-4 h-4 text-violet-500 dark:text-sky-400 shrink-0" />
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-2 flex-wrap">
              <span>AI Real Tahlil, Avto-Ijro va Diagnostika Markazi</span>
              <span className={`font-mono text-[11px] font-bold ${aiStateColor}`}>
                • {aiState}
              </span>
            </h2>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
              Barcha raqamlar real backend natijalaridan olinadi · Strategiya ansambli + LLM chuqur tahlili + Avto SL/TP
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={aiBusy}
            onClick={onRunFullAiCycle}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-gradient-to-r from-violet-600 to-sky-500 text-white hover:brightness-110 disabled:opacity-50 cursor-pointer transition-all"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${aiBusy ? 'animate-spin' : ''}`} />
            <span>{aiBusy ? 'AI tahlil qilmoqda...' : 'AI Tahlil & SL/TP Hozir'}</span>
          </button>

          {!compact && (
            <button
              type="button"
              disabled={stressBusy}
              onClick={() => void runStressTest()}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-violet-500/40 bg-violet-500/10 text-violet-700 dark:text-sky-300 hover:bg-violet-500/20 disabled:opacity-50 cursor-pointer"
            >
              <FlaskConical className="w-3.5 h-3.5" />
              <span>{stressBusy ? 'Tekshirilmoqda...' : '10-Order Demo Test'}</span>
            </button>
          )}

          {compact && onNavigate && (
            <button
              type="button"
              onClick={() => onNavigate('autotrading')}
              className="px-2.5 py-1.5 text-xs font-medium rounded-lg border border-slate-200 dark:border-violet-500/30 text-slate-700 dark:text-slate-300 hover:border-sky-400 cursor-pointer"
            >
              Avto-Savdo →
            </button>
          )}
        </div>
      </div>

      {/* Real Backend Status Counters Grid (All 13+ required real metrics) */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2 text-[11px]">
        <div className="rounded-lg border border-slate-200 dark:border-violet-500/20 bg-slate-50 dark:bg-[#070C18] px-2.5 py-2">
          <div className="text-slate-500">AI Analysis</div>
          <div className={`font-mono font-bold text-xs mt-0.5 ${aiStateColor}`}>{aiState}</div>
          <div className="font-mono text-[10px] text-slate-400 truncate">
            {formatTime(metrics?.lastCycleTime ?? status?.control.lastAnalysisTime)}
          </div>
        </div>

        <div className="rounded-lg border border-slate-200 dark:border-violet-500/20 bg-slate-50 dark:bg-[#070C18] px-2.5 py-2">
          <div className="text-slate-500">Tahlil / Signallar</div>
          <div className="font-mono tabular-nums font-bold text-xs text-slate-900 dark:text-white mt-0.5">
            {metrics?.instrumentsAnalyzed ?? 0} inst · {metrics?.signalsGenerated ?? 0} sig
          </div>
          <div className="font-mono text-[10px] text-sky-400">
            LLM: {formatTime(metrics?.lastAiLlmTime)}
          </div>
        </div>

        <div className="rounded-lg border border-slate-200 dark:border-violet-500/20 bg-slate-50 dark:bg-[#070C18] px-2.5 py-2">
          <div className="text-slate-500">BUY / SELL / WAIT</div>
          <div className="font-mono tabular-nums font-bold text-xs mt-0.5 flex items-center gap-1.5">
            <span className="text-emerald-500 dark:text-[#00E5A0]">{metrics?.buySignals ?? 0}B</span>
            <span className="text-rose-500">{metrics?.sellSignals ?? 0}S</span>
            <span className="text-slate-400">{(metrics?.waitSignals ?? 0) + (metrics?.noTradeSignals ?? 0)}W</span>
          </div>
          <div className="font-mono text-[10px] text-slate-400">Real ensemble</div>
        </div>

        <div className="rounded-lg border border-slate-200 dark:border-violet-500/20 bg-slate-50 dark:bg-[#070C18] px-2.5 py-2">
          <div className="text-slate-500">Strategiyalar</div>
          <div className="font-mono tabular-nums font-bold text-xs text-slate-900 dark:text-white mt-0.5">
            {status?.strategiesCount.approved ?? 0} tasd · {status?.strategiesCount.active ?? 0} faol
          </div>
          <div className="font-mono text-[10px] text-slate-400">
            Jami: {status?.strategiesCount.total ?? 0}
          </div>
        </div>

        <div className="rounded-lg border border-slate-200 dark:border-violet-500/20 bg-slate-50 dark:bg-[#070C18] px-2.5 py-2">
          <div className="text-slate-500">Orderlar (Sent / Rej)</div>
          <div className="font-mono tabular-nums font-bold text-xs mt-0.5">
            <span className="text-emerald-500 dark:text-[#00E5A0]">{metrics?.ordersSent ?? 0}</span>
            <span className="text-slate-500"> / </span>
            <span className={(metrics?.ordersRejected ?? 0) > 0 ? 'text-rose-500' : 'text-slate-400'}>
              {metrics?.ordersRejected ?? 0}
            </span>
          </div>
          <div className="font-mono text-[10px] text-slate-400 truncate">
            Oxirgi: {formatTime(metrics?.lastSuccessfulExecution)}
          </div>
        </div>

        <div className="rounded-lg border border-slate-200 dark:border-violet-500/20 bg-slate-50 dark:bg-[#070C18] px-2.5 py-2">
          <div className="text-slate-500">Ochiq / Limit</div>
          <div className="font-mono tabular-nums font-bold text-xs text-sky-600 dark:text-sky-400 mt-0.5">
            {metrics?.openPositionsCount ?? 0} / {status?.control.maxOpenOrders ?? 20}
          </div>
          <div className="font-mono text-[10px] text-slate-400">
            Risk: {(metrics?.currentPortfolioRiskPct ?? 0).toFixed(2)}% / {status?.control.maxPortfolioRiskPct ?? 5}%
          </div>
        </div>

        <div className="rounded-lg border border-slate-200 dark:border-violet-500/20 bg-slate-50 dark:bg-[#070C18] px-2.5 py-2">
          <div className="text-slate-500">AI SL/TP Boshqaruv</div>
          <div className="font-mono tabular-nums font-bold text-xs text-violet-600 dark:text-violet-400 mt-0.5">
            {metrics?.aiSlTpModifications ?? 0} mod · {metrics?.aiClosedPositions ?? 0} exit
          </div>
          <div className="font-mono text-[10px] text-emerald-500">
            {status?.control.aiAutoSlTpEnabled ? 'AVTO FAOL' : 'O‘CHIQ'}
          </div>
        </div>
      </div>

      {/* Latest AI LLM Reasoning Brief or Error */}
      {(lastAiBriefUz || lastAiError || metrics?.aiAnalysisError) && (
        <div
          className={`rounded-lg border px-3 py-2 text-xs ${
            lastAiError || metrics?.aiAnalysisError
              ? 'border-rose-500/40 bg-rose-500/10 text-rose-600 dark:text-rose-300'
              : 'border-sky-500/35 bg-sky-500/10 text-slate-800 dark:text-sky-200'
          }`}
        >
          <div className="flex items-center justify-between gap-2 font-semibold mb-0.5">
            <span className="inline-flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-sky-400 shrink-0" />
              <span>
                {lastAiError || metrics?.aiAnalysisError
                  ? 'AI API Xabari / Xatosi'
                  : `AI Mustaqil Tahlil va Pozitsiya Boshqaruvi (${lastAiProvider ?? 'AI API'})`}
              </span>
            </span>
          </div>
          <p className="leading-relaxed">
            {lastAiError || metrics?.aiAnalysisError || lastAiBriefUz}
          </p>
        </div>
      )}

      {/* Explicit Root-Cause Diagnostics (Never just silent WAIT/IDLE) */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-[11px]">
          <span className="font-semibold text-slate-700 dark:text-slate-200 flex items-center gap-1.5">
            <ShieldAlert className="w-3.5 h-3.5 text-violet-400" />
            <span>Real Diagnostika (Nega order ochildi yoki ochilmadi?)</span>
          </span>
          <span className="font-mono text-slate-400">{diagnostics.length} ta holat</span>
        </div>

        {diagnostics.length === 0 ? (
          <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-600 dark:text-[#00E5A0] flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>Barcha tizim shartlari ochiq: Skaner faol, strategiyalar tasdiqlangan, risk chegarada, avtonom ijro tayyor.</span>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-1.5">
            {diagnostics.slice(0, compact ? 4 : 10).map((d, idx) => (
              <div
                key={`${d.code}-${idx}`}
                className={`rounded-lg border px-2.5 py-2 text-[11.5px] flex items-start gap-2 ${
                  d.severity === 'CRITICAL'
                    ? 'border-rose-500/40 bg-rose-500/10 text-rose-700 dark:text-rose-300'
                    : d.severity === 'WARNING'
                      ? 'border-amber-500/35 bg-amber-500/10 text-amber-700 dark:text-amber-300'
                      : 'border-slate-200 dark:border-violet-500/20 bg-slate-50 dark:bg-[#070C18] text-slate-600 dark:text-slate-300'
                }`}
              >
                <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                <div className="min-w-0">
                  <div className="font-semibold leading-snug">
                    {d.titleUz}{' '}
                    <span className="font-mono text-[10px] opacity-75">[{d.code}]</span>
                  </div>
                  <div className="text-[11px] opacity-90 leading-snug mt-0.5">{d.detailUz}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Stress Test Verification Output */}
      {stressError && (
        <div className="rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-xs text-rose-400">
          {stressError}
        </div>
      )}
      {stressResult && (
        <div className="rounded-lg border border-emerald-500/35 bg-emerald-500/10 p-3 space-y-2 text-xs">
          <div className="flex flex-wrap items-center justify-between gap-2 font-semibold text-emerald-700 dark:text-[#00E5A0]">
            <span>
              10-Order Parallel & Risk Verification Test:{' '}
              {stressResult.passed ? 'MUVAFFAQIYATLI O‘TDI' : 'TEKSHIRISH KERAK'}
            </span>
            <span className="font-mono text-[11px]">
              Ochildi: {stressResult.ordersExecuted} · Dublikat blok: {stressResult.duplicatesBlocked} · Risk blok:{' '}
              {stressResult.riskBlocked} · Broker reject: {stressResult.brokerRejected} · SL/TP sync:{' '}
              {stressResult.slTpSynced}
            </span>
          </div>
          <div className="max-h-36 overflow-y-auto font-mono text-[10.5px] space-y-0.5 text-slate-700 dark:text-slate-300">
            {stressResult.details.map((line, idx) => (
              <div key={idx}>{line}</div>
            ))}
          </div>
        </div>
      )}

      {/* Full Mode: Saved Per-Instrument Analysis Table + Execution & SL/TP Audit Log */}
      {!compact && (
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-3 pt-1">
          <div className="xl:col-span-7 rounded-lg border border-slate-200 dark:border-violet-500/20 bg-slate-50 dark:bg-[#070C18] overflow-hidden">
            <div className="px-3 py-2 border-b border-slate-200 dark:border-violet-500/20 flex items-center justify-between text-xs font-semibold text-slate-900 dark:text-white">
              <span className="flex items-center gap-1.5">
                <Activity className="w-3.5 h-3.5 text-sky-400" />
                <span>Backend Saqlangan Instrument Tahlillari ({perSymbol.length})</span>
              </span>
              <span className="font-mono text-[10.5px] text-slate-400">Ensemble + LLM</span>
            </div>
            <div className="overflow-x-auto max-h-64 overflow-y-auto">
              <table className="w-full text-left border-collapse text-[11px]">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-violet-500/15 text-slate-500 font-mono">
                    <th className="py-1.5 px-2.5">Juftlik</th>
                    <th className="py-1.5 px-2">Qaror</th>
                    <th className="py-1.5 px-2 text-right">Ball</th>
                    <th className="py-1.5 px-2 text-right">MTF</th>
                    <th className="py-1.5 px-2 text-right">SL / TP</th>
                    <th className="py-1.5 px-2.5">LLM Qarori</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200/70 dark:divide-violet-500/10 font-mono tabular-nums">
                  {perSymbol.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-6 text-center text-slate-500 font-sans">
                        Hali sikl yakunlanmagan — "AI Tahlil & SL/TP Hozir" tugmasini bosing.
                      </td>
                    </tr>
                  ) : (
                    perSymbol.map((row) => (
                      <tr
                        key={row.symbol}
                        onClick={() => onSelectSymbol?.(row.symbol)}
                        className="hover:bg-violet-500/10 cursor-pointer"
                      >
                        <td className="py-1.5 px-2.5 font-semibold text-slate-900 dark:text-white">
                          {row.symbol}
                          <span className="text-[10px] text-slate-400 ml-1">{row.timeframe}</span>
                        </td>
                        <td className="py-1.5 px-2">
                          <span
                            className={`font-bold ${
                              row.action === 'BUY'
                                ? 'text-emerald-500 dark:text-[#00E5A0]'
                                : row.action === 'SELL'
                                  ? 'text-rose-500'
                                  : 'text-slate-400'
                            }`}
                          >
                            {row.action}
                          </span>
                        </td>
                        <td className="py-1.5 px-2 text-right">{row.analyticalScore}</td>
                        <td className="py-1.5 px-2 text-right">{row.mtfAlignmentPct}%</td>
                        <td className="py-1.5 px-2 text-right text-[10px] text-slate-500 dark:text-slate-400">
                          {formatPrice(row.stopLoss)} / {formatPrice(row.takeProfit)}
                        </td>
                        <td className="py-1.5 px-2.5 text-[10.5px] text-sky-500 dark:text-sky-300 truncate max-w-[160px]">
                          {row.llmDecision
                            ? `${row.llmDecision} (${row.llmConfidencePct ?? row.analyticalScore}%)`
                            : 'Deterministik'}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="xl:col-span-5 rounded-lg border border-slate-200 dark:border-violet-500/20 bg-slate-50 dark:bg-[#070C18] overflow-hidden">
            <div className="px-3 py-2 border-b border-slate-200 dark:border-violet-500/20 flex items-center justify-between text-xs font-semibold text-slate-900 dark:text-white">
              <span className="flex items-center gap-1.5">
                <Terminal className="w-3.5 h-3.5 text-violet-400" />
                <span>AI Ijro va Avto SL/TP Jurnal ({logs.length})</span>
              </span>
              <span className="font-mono text-[10.5px] text-slate-400">Real Audit</span>
            </div>
            <div className="max-h-64 overflow-y-auto divide-y divide-slate-200/70 dark:divide-violet-500/10 text-[11px]">
              {logs.length === 0 ? (
                <div className="py-6 px-3 text-center text-slate-500">
                  Hali avtonom ijro yoki SL/TP o‘zgartirish yozilmagan.
                </div>
              ) : (
                logs.slice(0, 20).map((log) => (
                  <div key={log.id} className="px-3 py-2 space-y-0.5">
                    <div className="flex items-center justify-between gap-2 font-mono text-[10.5px]">
                      <span
                        className={`font-bold ${
                          log.type === 'ORDER_SENT' || log.type === 'BREAK_EVEN' || log.type === 'TRAILING_STOP'
                            ? 'text-emerald-500 dark:text-[#00E5A0]'
                            : log.type === 'ORDER_REJECTED'
                              ? 'text-rose-500'
                              : 'text-sky-400'
                        }`}
                      >
                        {log.type} · {log.symbol}
                      </span>
                      <span className="text-slate-400">
                        {formatTime(log.timestamp)} · {log.source}
                      </span>
                    </div>
                    <div className="text-slate-600 dark:text-slate-300 leading-snug">{log.reasonUz}</div>
                    {log.brokerMessage && (
                      <div className="font-mono text-[10px] text-rose-400">Broker: {log.brokerMessage}</div>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </section>
  );
};
