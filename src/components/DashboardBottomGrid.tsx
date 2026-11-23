import React from 'react';
import {
  Activity,
  AlertOctagon,
  Bot,
  CalendarDays,
  Cpu,
  Layers,
  Pause,
  Play,
  Power,
  ShieldAlert,
  ShieldOff,
} from 'lucide-react';
import {
  IntelligentDecisionReport,
  LiveSystemStatusSnapshot,
  MarketPair,
  Position,
  RiskGuardSettings,
  StrategyBrainSnapshot,
  TradingStyle,
  ViewId,
} from '../types/trading';
import { formatCurrency, formatPrice } from '../config/initialData';

interface DashboardBottomGridProps {
  pairs: MarketPair[];
  allPairBrains: StrategyBrainSnapshot[];
  selectedSymbol: string;
  tradingStyle: TradingStyle;
  onSelectSymbol: (symbol: string) => void;
  decisionReport: IntelligentDecisionReport;
  positions: Position[];
  riskGuard: RiskGuardSettings;
  systemStatus: LiveSystemStatusSnapshot | null;
  mt5Connected: boolean;
  busyAction: string | null;
  onClosePosition: (id: string) => void;
  onStopNewTrades: () => void;
  onResumeNewTrades: () => void;
  onPauseScanner: () => void;
  onResumeScanner: () => void;
  onDisableAutoTrading: () => void;
  onRequestCloseAll: () => void;
  onNavigate: (view: ViewId) => void;
}

function posPnl(pos: Position): number {
  if (pos.status === 'CLOSED' && pos.realizedPnl !== undefined) return pos.realizedPnl;
  if (pos.status === 'OPEN' && typeof pos.profit === 'number') return pos.profit;
  if (pos.status === 'PENDING') return 0;
  const diff =
    pos.side === 'LONG'
      ? (pos.markPrice - pos.entryPrice) / Math.max(1e-9, pos.entryPrice)
      : (pos.entryPrice - pos.markPrice) / Math.max(1e-9, pos.entryPrice);
  return pos.sizeUsdt * diff;
}

export const DashboardBottomGrid: React.FC<DashboardBottomGridProps> = ({
  pairs,
  allPairBrains,
  selectedSymbol,
  tradingStyle,
  onSelectSymbol,
  decisionReport,
  positions,
  riskGuard,
  systemStatus,
  mt5Connected,
  busyAction,
  onClosePosition,
  onStopNewTrades,
  onResumeNewTrades,
  onPauseScanner,
  onResumeScanner,
  onDisableAutoTrading,
  onRequestCloseAll,
  onNavigate,
}) => {
  const openPositions = positions.filter((p) => p.status === 'OPEN');
  const ensembleCards = decisionReport.strategyDecisions;
  const buyVotes = ensembleCards.filter((s) => s.signal === 'BUY').length;
  const sellVotes = ensembleCards.filter((s) => s.signal === 'SELL').length;
  const waitVotes = Math.max(0, ensembleCards.length - buyVotes - sellVotes);

  const stopNewTrades = Boolean(systemStatus?.control.stopNewTrades);
  const scannerRunning = systemStatus ? systemStatus.control.scannerStatus === 'RUNNING' : true;
  const mode = systemStatus?.control.autonomousMode ?? 'OBSERVATION';

  const modeLabel =
    mode === 'AUTONOMOUS'
      ? 'AVTONOM SAVDO'
      : mode === 'SIGNAL'
        ? 'SIGNAL REJIMI'
        : 'KUZATUV (OBSERVATION)';

  const utcHour = new Date().getUTCHours();
  const activeSession =
    utcHour >= 12 && utcHour < 16
      ? 'London + NY Overlap'
      : utcHour >= 7 && utcHour < 16
        ? 'London Sessiyasi'
        : utcHour >= 12 && utcHour < 21
          ? 'New York Sessiyasi'
          : 'Asia / Tokyo Sessiyasi';

  return (
    <div className="space-y-3.5">
      {/* Row 1: Market Scanner + Strategy Ensemble + Risk Intelligence */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3.5">
        {/* 1. Market Scanner */}
        <section className="lg:col-span-4 rounded-xl border border-slate-200 dark:border-sky-500/25 bg-white dark:bg-[#0B1120] tk-glass-blue p-3.5 flex flex-col justify-between gap-2.5">
          <div className="flex items-center justify-between gap-2 pb-2 border-b border-slate-200 dark:border-violet-500/15">
            <h2 className="text-xs font-semibold text-slate-900 dark:text-white flex items-center gap-1.5">
              <Activity className="w-3.5 h-3.5 text-sky-500 dark:text-sky-400" />
              <span>Market Scanner</span>
            </h2>
            <button
              type="button"
              onClick={() => onNavigate('scanner')}
              className="text-[11px] text-sky-600 dark:text-sky-400 hover:underline cursor-pointer"
            >
              24/7 Skaner →
            </button>
          </div>

          <div className="divide-y divide-slate-200/70 dark:divide-violet-500/10 text-xs font-mono tabular-nums">
            {pairs.slice(0, 5).map((p) => {
              const b = allPairBrains.find((item) => item.symbol === p.symbol);
              const sig =
                tradingStyle === 'SCALPING'
                  ? b?.verdict.scalpingAction ?? 'KUTISH'
                  : b?.verdict.longTermAction ?? 'KUTISH';
              const conf = Math.round(
                tradingStyle === 'SCALPING'
                  ? b?.verdict.scalpingScore ?? 50
                  : b?.verdict.longTermScore ?? 50
              );
              return (
                <button
                  key={p.symbol}
                  type="button"
                  onClick={() => onSelectSymbol(p.symbol)}
                  className={`w-full py-1.5 flex items-center justify-between gap-2 text-left hover:text-sky-400 transition-colors cursor-pointer ${
                    p.symbol === selectedSymbol ? 'text-sky-600 dark:text-sky-300 font-semibold' : ''
                  }`}
                >
                  <span className="font-bold text-slate-900 dark:text-slate-100">{p.symbol}</span>
                  <span className="text-slate-500">{formatPrice(p.price)}</span>
                  <span
                    className={`font-bold ${
                      sig === 'BUY'
                        ? 'text-emerald-600 dark:text-[#00E5A0]'
                        : sig === 'SELL'
                          ? 'text-rose-500'
                          : 'text-slate-400'
                    }`}
                  >
                    {sig === 'KUTISH' ? 'WAIT' : sig} {conf}%
                  </span>
                </button>
              );
            })}
          </div>
        </section>

        {/* 2. Strategy Ensemble Mini */}
        <section className="lg:col-span-4 rounded-xl border border-slate-200 dark:border-violet-500/25 bg-white dark:bg-[#0B1120] tk-glass-purple p-3.5 flex flex-col justify-between gap-2.5">
          <div className="flex items-center justify-between gap-2 pb-2 border-b border-slate-200 dark:border-violet-500/15">
            <h2 className="text-xs font-semibold text-slate-900 dark:text-white flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5 text-violet-500 dark:text-violet-400" />
              <span>Strategy Ensemble ({selectedSymbol})</span>
            </h2>
            <button
              type="button"
              onClick={() => onNavigate('ensemble')}
              className="text-[11px] text-violet-600 dark:text-violet-400 hover:underline cursor-pointer"
            >
              To‘liq ansambl →
            </button>
          </div>

          <div className="space-y-2 text-xs">
            <div className="flex items-center justify-between font-mono tabular-nums text-[11px]">
              <span className="text-emerald-600 dark:text-[#00E5A0] font-semibold">BUY: {buyVotes}</span>
              <span className="text-sky-600 dark:text-sky-400 font-semibold">WAIT: {waitVotes}</span>
              <span className="text-rose-500 font-semibold">SELL: {sellVotes}</span>
            </div>
            <div className="space-y-1.5">
              {ensembleCards.slice(0, 4).map((s) => (
                <div key={s.strategyId} className="flex items-center justify-between gap-2 text-[11px]">
                  <span className="text-slate-600 dark:text-slate-300 truncate">{s.strategyName}</span>
                  <span
                    className={`font-mono tabular-nums font-bold shrink-0 ${
                      s.signal === 'BUY'
                        ? 'text-emerald-600 dark:text-[#00E5A0]'
                        : s.signal === 'SELL'
                          ? 'text-rose-500'
                          : 'text-slate-400'
                    }`}
                  >
                    {s.signal} · R:R {s.riskReward.toFixed(1)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* 3. Risk Intelligence + Emergency Quick Controls */}
        <section className="lg:col-span-4 rounded-xl border border-slate-200 dark:border-violet-500/25 bg-white dark:bg-[#0B1120] tk-glass p-3.5 flex flex-col justify-between gap-2.5">
          <div className="flex items-center justify-between gap-2 pb-2 border-b border-slate-200 dark:border-violet-500/15">
            <h2 className="text-xs font-semibold text-slate-900 dark:text-white flex items-center gap-1.5">
              <ShieldAlert className="w-3.5 h-3.5 text-rose-500" />
              <span>Risk Intelligence & Favqulodda Nazorat</span>
            </h2>
            <button
              type="button"
              onClick={() => onNavigate('risk')}
              className="text-[11px] text-sky-600 dark:text-sky-400 hover:underline cursor-pointer"
            >
              Risk panel →
            </button>
          </div>

          <div className="grid grid-cols-3 gap-2 text-[11px] font-mono tabular-nums">
            <div>
              <span className="font-sans text-slate-500 block">Kunlik limit</span>
              <span className="font-bold text-slate-900 dark:text-white">-${riskGuard.dailyMaxLossUsdt}</span>
            </div>
            <div>
              <span className="font-sans text-slate-500 block">Max DD</span>
              <span className="font-bold text-slate-900 dark:text-white">{riskGuard.drawdownLimitPct}%</span>
            </div>
            <div>
              <span className="font-sans text-slate-500 block">Filtr holati</span>
              <span
                className={
                  decisionReport.riskEvaluation.overallAllowed && !stopNewTrades
                    ? 'font-bold text-emerald-600 dark:text-[#00E5A0]'
                    : 'font-bold text-rose-500'
                }
              >
                {stopNewTrades ? 'BLOK' : decisionReport.riskEvaluation.overallAllowed ? 'OK' : 'E’TIBOR'}
              </span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-1.5 pt-1">
            {!stopNewTrades ? (
              <button
                type="button"
                disabled={busyAction !== null}
                onClick={onStopNewTrades}
                className="inline-flex items-center gap-1 px-2 py-1 text-[10.5px] font-semibold rounded border border-rose-500/45 bg-rose-500/15 text-rose-600 dark:text-rose-300 hover:bg-rose-600 hover:text-white cursor-pointer disabled:opacity-40"
              >
                <AlertOctagon className="w-3 h-3" />
                <span>STOP TRADES</span>
              </button>
            ) : (
              <button
                type="button"
                disabled={busyAction !== null}
                onClick={onResumeNewTrades}
                className="inline-flex items-center gap-1 px-2 py-1 text-[10.5px] font-semibold rounded border border-emerald-500/45 bg-emerald-500/15 text-emerald-600 dark:text-[#00E5A0] hover:bg-emerald-600 hover:text-white cursor-pointer disabled:opacity-40"
              >
                <Play className="w-3 h-3" />
                <span>RESUME</span>
              </button>
            )}

            <button
              type="button"
              disabled={busyAction !== null}
              onClick={scannerRunning ? onPauseScanner : onResumeScanner}
              className="inline-flex items-center gap-1 px-2 py-1 text-[10.5px] font-semibold rounded border border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-300 hover:bg-amber-500/20 cursor-pointer disabled:opacity-40"
            >
              {scannerRunning ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3" />}
              <span>{scannerRunning ? 'PAUSE SCAN' : 'RESUME SCAN'}</span>
            </button>

            <button
              type="button"
              disabled={busyAction !== null}
              onClick={onDisableAutoTrading}
              className="inline-flex items-center gap-1 px-2 py-1 text-[10.5px] font-semibold rounded border border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-rose-500/50 cursor-pointer disabled:opacity-40"
            >
              <ShieldOff className="w-3 h-3" />
              <span>OFF AUTO</span>
            </button>

            <button
              type="button"
              onClick={onRequestCloseAll}
              className="inline-flex items-center gap-1 px-2 py-1 text-[10.5px] font-semibold rounded border border-rose-500/35 text-rose-500 hover:bg-rose-500/15 cursor-pointer"
            >
              <Power className="w-3 h-3" />
              <span>Yopish</span>
            </button>
          </div>
        </section>
      </div>

      {/* Row 2: Open Positions + Economic Calendar + System Health + Trading Mode */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3.5">
        {/* 4. Open Positions */}
        <section className="lg:col-span-5 rounded-xl border border-slate-200 dark:border-violet-500/25 bg-white dark:bg-[#0B1120] tk-glass p-3.5 space-y-2">
          <div className="flex items-center justify-between gap-2 pb-2 border-b border-slate-200 dark:border-violet-500/15">
            <h2 className="text-xs font-semibold text-slate-900 dark:text-white">
              Ochiq Pozitsiyalar ({openPositions.length})
            </h2>
            <button
              type="button"
              onClick={() => onNavigate('multiorder')}
              className="text-[11px] text-violet-600 dark:text-violet-400 hover:underline cursor-pointer"
            >
              Multi-Order Manager →
            </button>
          </div>

          {openPositions.length === 0 ? (
            <div className="py-4 text-center text-xs text-slate-500">
              Hozirda ochiq pozitsiyalar yo‘q (EMPTY).
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-[11px] font-mono tabular-nums text-left">
                <thead>
                  <tr className="text-slate-500 border-b border-slate-200/70 dark:border-violet-500/10">
                    <th className="py-1 pr-2 font-sans font-medium">Juftlik</th>
                    <th className="py-1 px-2 font-sans font-medium">Tomon</th>
                    <th className="py-1 px-2 font-sans font-medium text-right">Lot</th>
                    <th className="py-1 px-2 font-sans font-medium text-right">P/L</th>
                    <th className="py-1 pl-2 font-sans font-medium text-right">Amal</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200/60 dark:divide-violet-500/10">
                  {openPositions.slice(0, 4).map((pos) => {
                    const pnl = posPnl(pos);
                    return (
                      <tr key={pos.id}>
                        <td className="py-1.5 pr-2 font-bold text-slate-900 dark:text-white">
                          {pos.symbol}
                        </td>
                        <td
                          className={`py-1.5 px-2 font-bold ${
                            pos.side === 'LONG' ? 'text-emerald-600 dark:text-[#00E5A0]' : 'text-rose-500'
                          }`}
                        >
                          {pos.side === 'LONG' ? 'BUY' : 'SELL'}
                        </td>
                        <td className="py-1.5 px-2 text-right text-slate-600 dark:text-slate-300">
                          {pos.lotSize.toFixed(2)}
                        </td>
                        <td
                          className={`py-1.5 px-2 text-right font-bold ${
                            pnl >= 0 ? 'text-emerald-600 dark:text-[#00E5A0]' : 'text-rose-500'
                          }`}
                        >
                          {pnl >= 0 ? '+' : ''}
                          {formatCurrency(pnl)}
                        </td>
                        <td className="py-1.5 pl-2 text-right font-sans">
                          <button
                            type="button"
                            onClick={() => onClosePosition(pos.id)}
                            className="text-rose-500 hover:underline cursor-pointer"
                          >
                            Yopish
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* 5. Economic Calendar */}
        <section className="lg:col-span-3 rounded-xl border border-slate-200 dark:border-violet-500/25 bg-white dark:bg-[#0B1120] tk-glass p-3.5 flex flex-col justify-between gap-2">
          <div className="flex items-center justify-between gap-2 pb-2 border-b border-slate-200 dark:border-violet-500/15">
            <h2 className="text-xs font-semibold text-slate-900 dark:text-white flex items-center gap-1.5">
              <CalendarDays className="w-3.5 h-3.5 text-sky-500 dark:text-sky-400" />
              <span>Economic Calendar</span>
            </h2>
            <button
              type="button"
              onClick={() => onNavigate('calendar')}
              className="text-[11px] text-sky-600 dark:text-sky-400 hover:underline cursor-pointer"
            >
              Ochish →
            </button>
          </div>
          <div className="space-y-1.5 text-xs">
            <div className="font-mono text-[11px] text-amber-500 font-semibold">
              Feed: Ulanmagan (DISCONNECTED)
            </div>
            <div className="text-[11px] text-slate-600 dark:text-slate-300">
              Faol sessiya: <strong className="text-sky-500 dark:text-sky-400">{activeSession}</strong>
            </div>
            <p className="text-[11px] text-slate-500 leading-snug">
              Soxta yangiliklar ko‘rsatilmaydi. Real jadvalni Taqvim bo‘limidan kiritish mumkin.
            </p>
          </div>
        </section>

        {/* 6. System Health */}
        <section className="lg:col-span-2 rounded-xl border border-slate-200 dark:border-sky-500/25 bg-white dark:bg-[#0B1120] tk-glass-blue p-3.5 flex flex-col justify-between gap-2">
          <div className="flex items-center justify-between gap-1 pb-2 border-b border-slate-200 dark:border-violet-500/15">
            <h2 className="text-xs font-semibold text-slate-900 dark:text-white flex items-center gap-1.5">
              <Cpu className="w-3.5 h-3.5 text-emerald-500 dark:text-[#00E5A0]" />
              <span>System Health</span>
            </h2>
            <button
              type="button"
              onClick={() => onNavigate('monitor')}
              className="text-[11px] text-sky-600 dark:text-sky-400 hover:underline cursor-pointer"
            >
              →
            </button>
          </div>

          <div className="space-y-1 text-[11px] font-mono tabular-nums">
            <div className="flex justify-between">
              <span className="font-sans text-slate-500">RAM</span>
              <span className="text-slate-900 dark:text-slate-100">{systemStatus ? `${systemStatus.memory.usedPct}%` : '—'}</span>
            </div>
            <div className="flex justify-between">
              <span className="font-sans text-slate-500">Disk</span>
              <span className="text-slate-900 dark:text-slate-100">
                {systemStatus?.disk.freeGb !== null && systemStatus ? `${systemStatus.disk.freeGb}GB` : '—'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="font-sans text-slate-500">Baza</span>
              <span className="text-emerald-600 dark:text-[#00E5A0]">
                {systemStatus ? `${systemStatus.dbSizeKb}KB` : '...'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="font-sans text-slate-500">MT5</span>
              <span className={mt5Connected ? 'text-emerald-500 dark:text-[#00E5A0]' : 'text-amber-500'}>
                {mt5Connected ? 'REAL' : 'DEMO'}
              </span>
            </div>
          </div>
        </section>

        {/* 7. Trading Mode */}
        <section className="lg:col-span-2 rounded-xl border border-slate-200 dark:border-violet-500/30 bg-white dark:bg-[#0B1120] tk-glass-purple p-3.5 flex flex-col justify-between gap-2">
          <div className="flex items-center justify-between gap-1 pb-2 border-b border-slate-200 dark:border-violet-500/15">
            <h2 className="text-xs font-semibold text-slate-900 dark:text-white flex items-center gap-1.5">
              <Bot className="w-3.5 h-3.5 text-violet-500 dark:text-violet-400" />
              <span>Trading Mode</span>
            </h2>
          </div>

          <div className="space-y-1 text-xs">
            <div
              className={`font-mono font-bold text-[11px] ${
                mode === 'AUTONOMOUS'
                  ? 'text-emerald-600 dark:text-[#00E5A0]'
                  : mode === 'SIGNAL'
                    ? 'text-sky-600 dark:text-sky-400'
                    : 'text-violet-600 dark:text-violet-300'
              }`}
            >
              {modeLabel}
            </div>
            <div className="text-[11px] font-mono tabular-nums text-slate-500">
              Faol strat: {systemStatus?.strategiesCount.active ?? 0} ta
            </div>
          </div>

          <button
            type="button"
            onClick={() => onNavigate('autotrading')}
            className="w-full py-1.5 text-[11px] font-semibold rounded-md border border-violet-500/40 bg-violet-500/15 text-violet-700 dark:text-violet-300 hover:bg-violet-500/25 cursor-pointer"
          >
            Rejimni boshqarish
          </button>
        </section>
      </div>
    </div>
  );
};
