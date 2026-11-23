import React, { useMemo, useState } from 'react';
import {
  ArrowDownRight,
  ArrowUpRight,
  BrainCircuit,
  Clock,
  ShieldCheck,
  SlidersHorizontal,
} from 'lucide-react';
import {
  LiveSystemStatusSnapshot,
  MarketPair,
  Position,
  RiskEvaluationResult,
  StrategyBrainSnapshot,
  TradingStyle,
  ViewId,
} from '../types/trading';
import { formatPrice } from '../data/initialData';
import { OrderPanel } from './OrderPanel';

interface LiveSignalRailProps {
  pairs: MarketPair[];
  selectedSymbol: string;
  tradingStyle: TradingStyle;
  onSelectSymbol: (symbol: string) => void;
  allPairBrains: StrategyBrainSnapshot[];
  systemStatus: LiveSystemStatusSnapshot | null;
  availableBalance: number;
  equity: number;
  riskEvaluation: RiskEvaluationResult;
  tradingBlocked: boolean;
  mt5Connected: boolean;
  onPlaceOrder: (order: Omit<Position, 'id' | 'openedAt'>) => void;
  onNavigate: (view: ViewId) => void;
}

export const LiveSignalRail: React.FC<LiveSignalRailProps> = ({
  pairs,
  selectedSymbol,
  tradingStyle,
  onSelectSymbol,
  allPairBrains,
  systemStatus,
  availableBalance,
  equity,
  riskEvaluation,
  tradingBlocked,
  mt5Connected,
  onPlaceOrder,
  onNavigate,
}) => {
  const [rightTab, setRightTab] = useState<'signals' | 'order'>('signals');
  const [signalFilter, setSignalFilter] = useState<'ALL' | 'BUY' | 'SELL' | 'WAIT'>('ALL');

  const activePair = useMemo(
    () => pairs.find((p) => p.symbol === selectedSymbol) ?? pairs[0],
    [pairs, selectedSymbol]
  );

  const brainBySymbol = useMemo(() => {
    const map = new Map<string, StrategyBrainSnapshot>();
    allPairBrains.forEach((b) => map.set(b.symbol, b));
    return map;
  }, [allPairBrains]);

  // Build real deterministic signal feed across all pairs from Strategy Brain
  const liveSignals = useMemo(() => {
    return pairs
      .map((pair) => {
        const brain = brainBySymbol.get(pair.symbol);
        const rawVerdict =
          tradingStyle === 'SCALPING'
            ? brain?.verdict.scalpingAction ?? 'KUTISH'
            : brain?.verdict.longTermAction ?? 'KUTISH';
        const action: 'BUY' | 'SELL' | 'WAIT' =
          rawVerdict === 'BUY' ? 'BUY' : rawVerdict === 'SELL' ? 'SELL' : 'WAIT';
        const confidence = Math.round(
          tradingStyle === 'SCALPING'
            ? brain?.verdict.scalpingScore ?? 50
            : brain?.verdict.longTermScore ?? 50
        );
        const atrProxy = pair.price * (pair.assetClass === 'CRYPTO' ? 0.012 : 0.0045);
        const sl = action === 'SELL' ? pair.price + atrProxy : pair.price - atrProxy;
        const tp = action === 'SELL' ? pair.price - atrProxy * 2.1 : pair.price + atrProxy * 2.1;
        const topReason = brain?.verdict.reasons?.[0] ?? 'Multi-Strategy Ensemble';
        const smcZone = brain?.smcDeep?.zone ?? brain?.smc.zone ?? 'Equilibrium';
        return {
          symbol: pair.symbol,
          price: pair.price,
          change24h: pair.change24h,
          spreadPoints: pair.spreadPoints,
          action,
          confidence,
          entry: pair.price,
          sl,
          tp,
          topReason,
          smcZone,
        };
      })
      .sort((a, b) => {
        if (a.action !== 'WAIT' && b.action === 'WAIT') return -1;
        if (a.action === 'WAIT' && b.action !== 'WAIT') return 1;
        return b.confidence - a.confidence;
      });
  }, [pairs, brainBySymbol, tradingStyle]);

  const filteredSignals = useMemo(() => {
    if (signalFilter === 'ALL') return liveSignals;
    return liveSignals.filter((s) => s.action === signalFilter);
  }, [liveSignals, signalFilter]);

  const capabilities = [
    {
      label: 'AI Analitik',
      state: systemStatus?.aiStatus === 'UNCONFIGURED' ? 'Lokal dvigatel' : 'LLM + Kvant',
      ok: true,
      target: 'analyst' as ViewId,
    },
    {
      label: '24/7 Skaner',
      state: systemStatus?.control.scannerStatus === 'PAUSED' ? 'Pauzada' : 'Faol',
      ok: systemStatus?.control.scannerStatus !== 'PAUSED',
      target: 'scanner' as ViewId,
    },
    {
      label: 'ICT / SMC',
      state: 'BOS · OB · FVG',
      ok: true,
      target: 'smc' as ViewId,
    },
    {
      label: 'Risk Himoya',
      state: tradingBlocked ? 'Bloklangan' : 'Kuzatmoqda',
      ok: !tradingBlocked,
      target: 'risk' as ViewId,
    },
  ];

  return (
    <aside className="rounded-xl border border-slate-200 dark:border-violet-500/25 bg-white dark:bg-[#0B1120] tk-glass flex flex-col h-full overflow-hidden">
      {/* Top Mode Switcher: Live AI Signals vs Fast MT5 Order */}
      <div className="p-2.5 border-b border-slate-200 dark:border-violet-500/20 flex items-center justify-between gap-2 bg-slate-50/70 dark:bg-[#080D1B]/80">
        <div className="grid grid-cols-2 gap-1 p-0.5 rounded-lg bg-slate-200/70 dark:bg-[#050811] border border-slate-200 dark:border-violet-500/20 w-full">
          <button
            type="button"
            onClick={() => setRightTab('signals')}
            className={`px-2.5 py-1.5 text-xs font-semibold rounded-md transition-all flex items-center justify-center gap-1.5 cursor-pointer whitespace-nowrap ${
              rightTab === 'signals'
                ? 'bg-white dark:bg-gradient-to-r dark:from-violet-600/35 dark:to-sky-600/35 text-slate-900 dark:text-white border border-transparent dark:border-violet-400/40'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <BrainCircuit className="w-3.5 h-3.5 text-violet-500 dark:text-violet-400" />
            <span>AI Signallar</span>
          </button>

          <button
            type="button"
            onClick={() => setRightTab('order')}
            className={`px-2.5 py-1.5 text-xs font-semibold rounded-md transition-all flex items-center justify-center gap-1.5 cursor-pointer whitespace-nowrap ${
              rightTab === 'order'
                ? 'bg-white dark:bg-gradient-to-r dark:from-sky-600/35 dark:to-emerald-600/30 text-slate-900 dark:text-white border border-transparent dark:border-sky-400/40'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <SlidersHorizontal className="w-3.5 h-3.5 text-sky-500 dark:text-sky-400" />
            <span>Tezkor Order</span>
          </button>
        </div>
      </div>

      {rightTab === 'order' ? (
        <div className="flex-1 overflow-y-auto">
          <OrderPanel
            pair={activePair}
            availableBalance={availableBalance}
            equity={equity}
            riskEvaluation={riskEvaluation}
            tradingBlocked={tradingBlocked}
            onPlaceOrder={onPlaceOrder}
          />
        </div>
      ) : (
        <div className="flex-1 flex flex-col min-h-0">
          {/* AI Capabilities Compact Matrix */}
          <div className="p-3 border-b border-slate-200 dark:border-violet-500/15 space-y-2">
            <div className="flex items-center justify-between text-[11px]">
              <span className="font-semibold text-slate-800 dark:text-slate-200">
                AI Qobiliyatlar Moduli
              </span>
              <span className="font-mono text-slate-500 dark:text-slate-400">
                {mt5Connected ? 'MT5 Real' : 'Demo Oqim'}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              {capabilities.map((cap) => (
                <button
                  key={cap.label}
                  type="button"
                  onClick={() => onNavigate(cap.target)}
                  className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-violet-500/20 bg-slate-50/70 dark:bg-[#080E1E] hover:border-sky-400/50 text-left transition-colors cursor-pointer"
                >
                  <div className="text-[11px] font-medium text-slate-700 dark:text-slate-300 truncate">
                    {cap.label}
                  </div>
                  <div
                    className={`text-[10px] font-mono font-semibold truncate ${
                      cap.ok ? 'text-emerald-600 dark:text-[#00E5A0]' : 'text-amber-500'
                    }`}
                  >
                    {cap.state}
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Signal Filter Controls */}
          <div className="px-3 py-2 border-b border-slate-200 dark:border-violet-500/15 flex items-center justify-between gap-2">
            <span className="text-[11px] font-semibold text-slate-800 dark:text-slate-200 whitespace-nowrap">
              Jonli Signal Lentasi
            </span>
            <div className="flex items-center gap-1">
              {(['ALL', 'BUY', 'SELL', 'WAIT'] as const).map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setSignalFilter(f)}
                  className={`px-2 py-0.5 text-[10px] font-mono font-semibold rounded transition-colors cursor-pointer ${
                    signalFilter === f
                      ? 'bg-violet-500/20 text-violet-700 dark:text-violet-300 border border-violet-500/40'
                      : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                  }`}
                >
                  {f}
                </button>
              ))}
            </div>
          </div>

          {/* Scrollable Live Signal Feed */}
          <div className="flex-1 overflow-y-auto divide-y divide-slate-200/80 dark:divide-violet-500/15 max-h-[560px]">
            {filteredSignals.length === 0 ? (
              <div className="p-6 text-center text-xs text-slate-500 dark:text-slate-400 space-y-2">
                <p>Tanlangan filtr bo‘yicha faol signal yo‘q.</p>
                <button
                  type="button"
                  onClick={() => setSignalFilter('ALL')}
                  className="text-sky-500 hover:underline cursor-pointer"
                >
                  Barcha signallarni ko‘rsatish
                </button>
              </div>
            ) : (
              filteredSignals.map((sig) => {
                const isSelected = sig.symbol === selectedSymbol;
                const isBuy = sig.action === 'BUY';
                const isSell = sig.action === 'SELL';
                const actionClass = isBuy
                  ? 'text-emerald-600 dark:text-[#00E5A0]'
                  : isSell
                    ? 'text-rose-600 dark:text-rose-400'
                    : 'text-sky-600 dark:text-sky-400';

                return (
                  <div
                    key={sig.symbol}
                    className={`p-3 space-y-1.5 transition-colors tk-signal-enter ${
                      isSelected
                        ? 'bg-violet-50/70 dark:bg-violet-500/10'
                        : 'hover:bg-slate-50 dark:hover:bg-slate-900/50'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <button
                        type="button"
                        onClick={() => onSelectSymbol(sig.symbol)}
                        className="flex items-center gap-1.5 text-left cursor-pointer group"
                      >
                        <span className="font-mono font-bold text-xs text-slate-900 dark:text-white group-hover:text-sky-400">
                          {sig.symbol}
                        </span>
                        <span className="font-mono tabular-nums text-[11px] text-slate-500">
                          {formatPrice(sig.price)}
                        </span>
                      </button>

                      <div className="flex items-center gap-2 font-mono tabular-nums text-xs">
                        <span className={`font-bold flex items-center gap-0.5 ${actionClass}`}>
                          {isBuy && <ArrowUpRight className="w-3.5 h-3.5" />}
                          {isSell && <ArrowDownRight className="w-3.5 h-3.5" />}
                          {!isBuy && !isSell && <Clock className="w-3 h-3" />}
                          {sig.action}
                        </span>
                        <span className="text-[11px] font-semibold text-slate-700 dark:text-slate-300">
                          {sig.confidence}%
                        </span>
                      </div>
                    </div>

                    {/* Confidence Neon Micro Bar */}
                    <div className="h-1 w-full rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
                      <div
                        className={`h-full rounded-full ${
                          isBuy
                            ? 'bg-gradient-to-r from-sky-400 to-[#00E5A0]'
                            : isSell
                              ? 'bg-gradient-to-r from-violet-500 to-rose-500'
                              : 'bg-sky-400/70'
                        }`}
                        style={{ width: `${Math.min(100, Math.max(12, sig.confidence))}%` }}
                      />
                    </div>

                    <div className="flex items-center justify-between text-[10.5px] font-mono tabular-nums text-slate-500 dark:text-slate-400">
                      <span>E: {formatPrice(sig.entry)}</span>
                      <span className="text-rose-500/90">SL: {formatPrice(sig.sl)}</span>
                      <span className="text-emerald-500/90 dark:text-[#00E5A0]">TP: {formatPrice(sig.tp)}</span>
                    </div>

                    <div className="flex items-center justify-between gap-2 pt-0.5 text-[10.5px]">
                      <span className="text-slate-500 dark:text-slate-400 truncate max-w-[185px]" title={sig.topReason}>
                        {sig.topReason} · {sig.smcZone}
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          onSelectSymbol(sig.symbol);
                          setRightTab('order');
                        }}
                        className="text-sky-600 dark:text-sky-400 hover:underline font-medium cursor-pointer shrink-0"
                      >
                        Order
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Risk Guard Mini Footer */}
          <div className="p-2.5 border-t border-slate-200 dark:border-violet-500/20 bg-slate-50/70 dark:bg-[#080D1B]/80 flex items-center justify-between text-[11px]">
            <span className="flex items-center gap-1.5 text-slate-600 dark:text-slate-300">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-500 dark:text-[#00E5A0]" />
              <span>Risk: {riskEvaluation.riskPct.toFixed(1)}% · Lot {riskEvaluation.recommendedLot.toFixed(2)}</span>
            </span>
            <button
              type="button"
              onClick={() => setRightTab('order')}
              className="font-semibold text-violet-600 dark:text-violet-400 hover:underline cursor-pointer"
            >
              Order ochish →
            </button>
          </div>
        </div>
      )}
    </aside>
  );
};
