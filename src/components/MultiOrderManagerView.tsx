import React, { useMemo, useState } from 'react';
import {
  CheckSquare,
  Layers,
  Power,
  Search,
  ShieldCheck,
  Square,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';
import { MarketPair, Position, PositionStatus } from '../types/trading';
import { formatCurrency, formatPrice } from '../data/initialData';

interface MultiOrderManagerViewProps {
  positions: Position[];
  pairs: MarketPair[];
  mt5Connected: boolean;
  tradingBlocked: boolean;
  onClosePosition: (id: string) => void;
  onUpdateTargets: (id: string, stopLoss: number | null, takeProfit: number | null) => void;
  onPlaceOrder: (order: Omit<Position, 'id' | 'openedAt'>) => void;
  onRequestCloseAll: () => void;
  onSelectPair: (symbol: string) => void;
}

function calcPnl(pos: Position): number {
  if (pos.status === 'CLOSED' && pos.realizedPnl !== undefined) return pos.realizedPnl;
  if (pos.status === 'OPEN' && typeof pos.profit === 'number') return pos.profit;
  if (pos.status === 'PENDING') return 0;
  const diff =
    pos.side === 'LONG'
      ? (pos.markPrice - pos.entryPrice) / Math.max(1e-9, pos.entryPrice)
      : (pos.entryPrice - pos.markPrice) / Math.max(1e-9, pos.entryPrice);
  return pos.sizeUsdt * diff;
}

export const MultiOrderManagerView: React.FC<MultiOrderManagerViewProps> = ({
  positions,
  pairs,
  mt5Connected,
  tradingBlocked,
  onClosePosition,
  onUpdateTargets,
  onPlaceOrder,
  onRequestCloseAll,
  onSelectPair,
}) => {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [statusFilter, setStatusFilter] = useState<'ALL' | PositionStatus>('OPEN');
  const [directionFilter, setDirectionFilter] = useState<'ALL' | 'LONG' | 'SHORT'>('ALL');
  const [symbolFilter, setSymbolFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [batchSlPct, setBatchSlPct] = useState<string>('0.8');
  const [batchTpPct, setBatchTpPct] = useState<string>('1.8');
  const [feedback, setFeedback] = useState<string | null>(null);

  const uniqueSymbols = useMemo(
    () => Array.from(new Set(positions.map((p) => p.symbol))).sort(),
    [positions]
  );

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return positions.filter((p) => {
      if (statusFilter !== 'ALL' && p.status !== statusFilter) return false;
      if (directionFilter !== 'ALL' && p.side !== directionFilter) return false;
      if (symbolFilter !== 'ALL' && p.symbol !== symbolFilter) return false;
      if (
        q &&
        !p.symbol.toLowerCase().includes(q) &&
        !p.id.toLowerCase().includes(q) &&
        !p.strategyName.toLowerCase().includes(q)
      ) {
        return false;
      }
      return true;
    });
  }, [positions, statusFilter, directionFilter, symbolFilter, searchQuery]);

  const summary = useMemo(() => {
    const openOrders = positions.filter((p) => p.status === 'OPEN');
    const pendingOrders = positions.filter((p) => p.status === 'PENDING');
    const totalLot = openOrders.reduce((s, p) => s + p.lotSize, 0);
    const floatingPnl = openOrders.reduce((s, p) => s + calcPnl(p), 0);
    const winningCount = openOrders.filter((p) => calcPnl(p) > 0).length;
    const losingCount = openOrders.filter((p) => calcPnl(p) < 0).length;
    return {
      totalCount: positions.length,
      openCount: openOrders.length,
      pendingCount: pendingOrders.length,
      totalLot,
      floatingPnl,
      winningCount,
      losingCount,
    };
  }, [positions]);

  const showToast = (msg: string) => {
    setFeedback(msg);
    window.setTimeout(() => setFeedback(null), 3500);
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const toggleSelectAllVisible = () => {
    const activeVisibleIds = filtered.filter((p) => p.status !== 'CLOSED').map((p) => p.id);
    if (activeVisibleIds.length === 0) return;
    const allSelected = activeVisibleIds.every((id) => selectedIds.includes(id));
    if (allSelected) {
      setSelectedIds((prev) => prev.filter((id) => !activeVisibleIds.includes(id)));
    } else {
      setSelectedIds(Array.from(new Set([...selectedIds, ...activeVisibleIds])));
    }
  };

  const handleCloseSelected = () => {
    if (selectedIds.length === 0) return;
    selectedIds.forEach((id) => onClosePosition(id));
    showToast(`${selectedIds.length} ta tanlangan order yopildi.`);
    setSelectedIds([]);
  };

  const handleCloseWinners = () => {
    const winners = positions.filter((p) => p.status === 'OPEN' && calcPnl(p) > 0);
    if (winners.length === 0) {
      showToast('Foydadagi ochiq order topilmadi.');
      return;
    }
    winners.forEach((p) => onClosePosition(p.id));
    showToast(`${winners.length} ta foydadagi order fiksatsiya qilindi.`);
  };

  const handleCloseLosers = () => {
    const losers = positions.filter((p) => p.status === 'OPEN' && calcPnl(p) < 0);
    if (losers.length === 0) {
      showToast('Zarardagi ochiq order topilmadi.');
      return;
    }
    losers.forEach((p) => onClosePosition(p.id));
    showToast(`${losers.length} ta zarardagi order yopildi.`);
  };

  const handleMoveSelectedToBreakEven = () => {
    const targets = positions.filter(
      (p) => p.status === 'OPEN' && selectedIds.includes(p.id)
    );
    if (targets.length === 0) {
      showToast('Avval ochiq orderlarni belgilang.');
      return;
    }
    targets.forEach((p) => onUpdateTargets(p.id, p.entryPrice, p.takeProfit));
    showToast(`${targets.length} ta order Stop-Loss narxi Break-Even (Entry) ga ko‘chirildi.`);
  };

  const handleApplyBatchSlTp = () => {
    const slPct = Math.max(0.1, Number(batchSlPct) || 0.8) / 100;
    const tpPct = Math.max(0.1, Number(batchTpPct) || 1.8) / 100;
    const targets = positions.filter(
      (p) => p.status === 'OPEN' && (selectedIds.length > 0 ? selectedIds.includes(p.id) : true)
    );
    if (targets.length === 0) {
      showToast('Yangilash uchun ochiq order yo‘q.');
      return;
    }
    targets.forEach((p) => {
      const dec = p.entryPrice >= 100 ? 2 : 4;
      const newSl = Number(
        (p.side === 'LONG' ? p.entryPrice * (1 - slPct) : p.entryPrice * (1 + slPct)).toFixed(dec)
      );
      const newTp = Number(
        (p.side === 'LONG' ? p.entryPrice * (1 + tpPct) : p.entryPrice * (1 - tpPct)).toFixed(dec)
      );
      onUpdateTargets(p.id, newSl, newTp);
    });
    showToast(`${targets.length} ta order uchun SL (${batchSlPct}%) / TP (${batchTpPct}%) yangilandi.`);
  };

  const handleSpawnDemoBatch = (count: number) => {
    if (mt5Connected) {
      showToast('Real/MT5 hisob ulanganda demo batch generator bloklanadi.');
      return;
    }
    if (tradingBlocked) {
      showToast('STOP NEW TRADES faol — yangi demo orderlar ham bloklangan.');
      return;
    }
    const strategyLabels = [
      'ICT/SMC BOS + OB',
      'EMA 20/50/200 Ribbon',
      'RSI Divergensiya',
      'VWAP Mean Reversion',
      'Leviathan PA',
    ];
    for (let i = 0; i < count; i++) {
      const pair = pairs[i % pairs.length];
      const side = i % 2 === 0 ? 'LONG' : 'SHORT';
      const jitter = 1 + ((i % 7) - 3) * 0.0008;
      const entry = Number((pair.price * jitter).toFixed(pair.price >= 100 ? 2 : 4));
      const dec = pair.price >= 100 ? 2 : 4;
      const sl = Number((side === 'LONG' ? entry * 0.993 : entry * 1.007).toFixed(dec));
      const tp = Number((side === 'LONG' ? entry * 1.016 : entry * 0.984).toFixed(dec));
      onPlaceOrder({
        symbol: pair.symbol,
        side,
        orderType: 'MARKET',
        entryPrice: entry,
        markPrice: pair.price,
        lotSize: 0.05,
        sizeUsdt: 500,
        leverage: 100,
        stopLoss: sl,
        takeProfit: tp,
        status: 'OPEN',
        strategyName: `${strategyLabels[i % strategyLabels.length]} (Demo)`,
      });
    }
    showToast(`${count} ta demo test orderi portfelga qo‘shildi.`);
  };

  return (
    <div className="space-y-4">
      {/* Header & Portfolio Summary */}
      <section className="rounded-xl border border-slate-200 dark:border-violet-500/30 bg-white dark:bg-[#0B1120] tk-glass-purple p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="font-display text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Layers className="w-4 h-4 text-violet-500 dark:text-violet-400" />
              <span>Multi-Order Menejeri (10 / 20 / 50+ Order Boshqaruvi)</span>
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Barcha faol, kutilayotgan va yopilgan orderlarni yakka va guruh (batch) rejimida tezkor boshqarish.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {!mt5Connected && (
              <div className="flex items-center gap-1 text-[11px]">
                <span className="text-slate-500 mr-1">Demo stress-test:</span>
                {[10, 20, 50].map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => handleSpawnDemoBatch(n)}
                    className="px-2 py-1 font-mono font-semibold rounded border border-sky-500/35 bg-sky-500/10 text-sky-600 dark:text-sky-300 hover:bg-sky-500/20 cursor-pointer whitespace-nowrap"
                  >
                    +{n}
                  </button>
                ))}
              </div>
            )}
            <button
              type="button"
              onClick={onRequestCloseAll}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-rose-500/45 bg-rose-500/15 text-rose-600 dark:text-rose-300 hover:bg-rose-600 hover:text-white transition-colors cursor-pointer whitespace-nowrap"
            >
              <Power className="w-3.5 h-3.5" />
              <span>Barchasini yopish</span>
            </button>
          </div>
        </div>

        {/* Compact Metric Strip */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5 pt-2 border-t border-slate-200 dark:border-violet-500/15 text-xs font-mono tabular-nums">
          <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-[#070C18] border border-slate-200 dark:border-violet-500/15">
            <div className="font-sans text-[11px] text-slate-500">Ochiq / Kutilmoqda</div>
            <div className="text-sm font-bold text-slate-900 dark:text-white">
              {summary.openCount} / {summary.pendingCount}
            </div>
          </div>
          <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-[#070C18] border border-slate-200 dark:border-violet-500/15">
            <div className="font-sans text-[11px] text-slate-500">Jami Lot Hajmi</div>
            <div className="text-sm font-bold text-sky-600 dark:text-sky-400">
              {summary.totalLot.toFixed(2)} lot
            </div>
          </div>
          <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-[#070C18] border border-slate-200 dark:border-violet-500/15">
            <div className="font-sans text-[11px] text-slate-500">Floating P/L</div>
            <div
              className={`text-sm font-bold ${
                summary.floatingPnl >= 0 ? 'text-emerald-600 dark:text-[#00E5A0]' : 'text-rose-500'
              }`}
            >
              {summary.floatingPnl >= 0 ? '+' : ''}
              {formatCurrency(summary.floatingPnl)}
            </div>
          </div>
          <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-[#070C18] border border-slate-200 dark:border-violet-500/15">
            <div className="font-sans text-[11px] text-slate-500">Foydada / Zararda</div>
            <div className="text-sm font-bold">
              <span className="text-emerald-600 dark:text-[#00E5A0]">{summary.winningCount}</span>
              <span className="text-slate-500 mx-1">/</span>
              <span className="text-rose-500">{summary.losingCount}</span>
            </div>
          </div>
          <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-[#070C18] border border-slate-200 dark:border-violet-500/15">
            <div className="font-sans text-[11px] text-slate-500">Tanlangan</div>
            <div className="text-sm font-bold text-violet-600 dark:text-violet-400">
              {selectedIds.length} ta order
            </div>
          </div>
        </div>
      </section>

      {feedback && (
        <div className="px-4 py-2 rounded-lg border border-sky-500/35 bg-sky-500/10 text-xs text-sky-700 dark:text-sky-300">
          {feedback}
        </div>
      )}

      {/* Group Batch Actions Bar */}
      <section className="rounded-xl border border-slate-200 dark:border-sky-500/25 bg-white dark:bg-[#0B1120] tk-glass-blue p-3.5 flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            disabled={selectedIds.length === 0}
            onClick={handleCloseSelected}
            className="px-2.5 py-1.5 font-semibold rounded-md border border-rose-500/40 bg-rose-500/10 text-rose-600 dark:text-rose-300 hover:bg-rose-600 hover:text-white disabled:opacity-40 cursor-pointer whitespace-nowrap"
          >
            Tanlanganlarni yopish ({selectedIds.length})
          </button>

          <button
            type="button"
            onClick={handleCloseWinners}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 font-semibold rounded-md border border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-[#00E5A0] hover:bg-emerald-600 hover:text-white cursor-pointer whitespace-nowrap"
          >
            <TrendingUp className="w-3.5 h-3.5" />
            <span>Foydadagilarni yopish</span>
          </button>

          <button
            type="button"
            onClick={handleCloseLosers}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 font-semibold rounded-md border border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300 hover:bg-amber-600 hover:text-white cursor-pointer whitespace-nowrap"
          >
            <TrendingDown className="w-3.5 h-3.5" />
            <span>Zarardagilarni yopish</span>
          </button>

          <button
            type="button"
            disabled={selectedIds.length === 0}
            onClick={handleMoveSelectedToBreakEven}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 font-semibold rounded-md border border-violet-500/40 bg-violet-500/10 text-violet-700 dark:text-violet-300 hover:bg-violet-600 hover:text-white disabled:opacity-40 cursor-pointer whitespace-nowrap"
          >
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>Break-Even (SL→Entry)</span>
          </button>
        </div>

        {/* Batch SL/TP Updater */}
        <div className="flex flex-wrap items-center gap-1.5 font-mono">
          <span className="font-sans text-[11px] text-slate-500">Guruh SL/TP %:</span>
          <input
            type="number"
            step="0.1"
            min="0.1"
            value={batchSlPct}
            onChange={(e) => setBatchSlPct(e.target.value)}
            aria-label="Guruh Stop Loss foizi"
            className="w-16 px-2 py-1 text-xs rounded border border-slate-200 dark:border-violet-500/25 bg-slate-50 dark:bg-[#060A15] text-slate-900 dark:text-white"
          />
          <input
            type="number"
            step="0.1"
            min="0.1"
            value={batchTpPct}
            onChange={(e) => setBatchTpPct(e.target.value)}
            aria-label="Guruh Take Profit foizi"
            className="w-16 px-2 py-1 text-xs rounded border border-slate-200 dark:border-violet-500/25 bg-slate-50 dark:bg-[#060A15] text-slate-900 dark:text-white"
          />
          <button
            type="button"
            onClick={handleApplyBatchSlTp}
            className="px-2.5 py-1 font-sans font-semibold rounded bg-sky-600 text-white hover:bg-sky-500 cursor-pointer whitespace-nowrap"
          >
            Qo‘llash
          </button>
        </div>
      </section>

      {/* High-Density Multi-Order Table */}
      <section className="rounded-xl border border-slate-200 dark:border-violet-500/25 bg-white dark:bg-[#0B1120] tk-glass overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-200 dark:border-violet-500/15 flex flex-wrap items-center justify-between gap-2.5">
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-0.5 p-0.5 rounded-lg bg-slate-100 dark:bg-[#060A15] border border-slate-200 dark:border-violet-500/20">
              {(['ALL', 'OPEN', 'PENDING', 'CLOSED'] as const).map((st) => (
                <button
                  key={st}
                  type="button"
                  onClick={() => setStatusFilter(st)}
                  className={`px-2.5 py-1 text-[11px] font-semibold rounded cursor-pointer ${
                    statusFilter === st
                      ? 'bg-violet-600 text-white'
                      : 'text-slate-500 dark:text-slate-400 hover:text-white'
                  }`}
                >
                  {st === 'ALL' ? 'Barchasi' : st === 'OPEN' ? 'Ochiq' : st === 'PENDING' ? 'Kutilmoqda' : 'Yopilgan'}
                </button>
              ))}
            </div>

            <select
              value={directionFilter}
              onChange={(e) => setDirectionFilter(e.target.value as 'ALL' | 'LONG' | 'SHORT')}
              aria-label="Yo‘nalish filtri"
              className="px-2 py-1 text-xs rounded-lg border border-slate-200 dark:border-violet-500/25 bg-slate-50 dark:bg-[#060A15] text-slate-700 dark:text-slate-200 cursor-pointer"
            >
              <option value="ALL">Barcha yo‘nalish</option>
              <option value="LONG">BUY / LONG</option>
              <option value="SHORT">SELL / SHORT</option>
            </select>

            <select
              value={symbolFilter}
              onChange={(e) => setSymbolFilter(e.target.value)}
              aria-label="Instrument filtri"
              className="px-2 py-1 text-xs font-mono rounded-lg border border-slate-200 dark:border-violet-500/25 bg-slate-50 dark:bg-[#060A15] text-slate-700 dark:text-slate-200 cursor-pointer"
            >
              <option value="ALL">Barcha instrument</option>
              {uniqueSymbols.map((sym) => (
                <option key={sym} value={sym}>
                  {sym}
                </option>
              ))}
            </select>
          </div>

          <div className="relative w-full sm:w-56">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Ticket, instrument, strategiya..."
              className="w-full pl-8 pr-3 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-violet-500/25 bg-slate-50 dark:bg-[#060A15] text-slate-900 dark:text-white"
            />
          </div>
        </div>

        <div className="overflow-x-auto max-h-[560px]">
          <table className="w-full text-xs text-left">
            <thead className="sticky top-0 z-10 bg-slate-50 dark:bg-[#070C18] border-b border-slate-200 dark:border-violet-500/20 text-[11px] text-slate-500 dark:text-slate-400">
              <tr>
                <th className="py-2.5 px-3 w-8">
                  <button
                    type="button"
                    onClick={toggleSelectAllVisible}
                    aria-label="Barchasini belgilash"
                    className="text-slate-400 hover:text-violet-400 cursor-pointer"
                  >
                    {selectedIds.length > 0 ? (
                      <CheckSquare className="w-4 h-4 text-violet-400" />
                    ) : (
                      <Square className="w-4 h-4" />
                    )}
                  </button>
                </th>
                <th className="py-2.5 px-2 font-medium">Instrument</th>
                <th className="py-2.5 px-2 font-medium">Yo‘nalish</th>
                <th className="py-2.5 px-2 font-medium text-right">Lot</th>
                <th className="py-2.5 px-2 font-medium text-right">Entry</th>
                <th className="py-2.5 px-2 font-medium text-right">SL</th>
                <th className="py-2.5 px-2 font-medium text-right">TP</th>
                <th className="py-2.5 px-2 font-medium text-right">Floating P/L</th>
                <th className="py-2.5 px-2 font-medium">Strategiya</th>
                <th className="py-2.5 px-2 font-medium">Holat</th>
                <th className="py-2.5 px-3 font-medium text-right">Amal</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200/70 dark:divide-violet-500/10 font-mono tabular-nums">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={11} className="py-8 text-center font-sans text-xs text-slate-500">
                    Tanlangan filtr bo‘yicha orderlar topilmadi.
                  </td>
                </tr>
              ) : (
                filtered.map((pos) => {
                  const pnl = calcPnl(pos);
                  const isChecked = selectedIds.includes(pos.id);
                  return (
                    <tr
                      key={pos.id}
                      className={`hover:bg-slate-50 dark:hover:bg-violet-500/5 transition-colors ${
                        isChecked ? 'bg-violet-500/10' : ''
                      }`}
                    >
                      <td className="py-2 px-3">
                        {pos.status !== 'CLOSED' ? (
                          <button
                            type="button"
                            onClick={() => toggleSelect(pos.id)}
                            aria-label={`Order ${pos.id} ni belgilash`}
                            className="text-slate-400 hover:text-violet-400 cursor-pointer"
                          >
                            {isChecked ? (
                              <CheckSquare className="w-4 h-4 text-violet-400" />
                            ) : (
                              <Square className="w-4 h-4" />
                            )}
                          </button>
                        ) : (
                          <span className="text-slate-600">—</span>
                        )}
                      </td>
                      <td className="py-2 px-2">
                        <button
                          type="button"
                          onClick={() => onSelectPair(pos.symbol)}
                          className="font-bold text-slate-900 dark:text-white hover:text-sky-400 cursor-pointer"
                        >
                          {pos.symbol}
                        </button>
                        <div className="text-[10px] text-slate-500">{pos.id}</div>
                      </td>
                      <td className="py-2 px-2">
                        <span
                          className={`font-bold ${
                            pos.side === 'LONG'
                              ? 'text-emerald-600 dark:text-[#00E5A0]'
                              : 'text-rose-500'
                          }`}
                        >
                          {pos.side === 'LONG' ? 'BUY' : 'SELL'}
                        </span>
                      </td>
                      <td className="py-2 px-2 text-right text-slate-700 dark:text-slate-200">
                        {pos.lotSize.toFixed(2)}
                      </td>
                      <td className="py-2 px-2 text-right text-slate-700 dark:text-slate-200">
                        {formatPrice(pos.entryPrice)}
                      </td>
                      <td className="py-2 px-2 text-right text-rose-500/90">
                        {pos.stopLoss !== null ? formatPrice(pos.stopLoss) : '—'}
                      </td>
                      <td className="py-2 px-2 text-right text-emerald-500/90 dark:text-[#00E5A0]">
                        {pos.takeProfit !== null ? formatPrice(pos.takeProfit) : '—'}
                      </td>
                      <td
                        className={`py-2 px-2 text-right font-bold ${
                          pnl >= 0 ? 'text-emerald-600 dark:text-[#00E5A0]' : 'text-rose-500'
                        }`}
                      >
                        {pnl >= 0 ? '+' : ''}
                        {formatCurrency(pnl)}
                      </td>
                      <td className="py-2 px-2 font-sans text-slate-600 dark:text-slate-300 max-w-[160px] truncate">
                        {pos.strategyName}
                      </td>
                      <td className="py-2 px-2 font-sans text-[11px]">
                        <span
                          className={
                            pos.status === 'OPEN'
                              ? 'text-sky-600 dark:text-sky-400 font-semibold'
                              : pos.status === 'PENDING'
                                ? 'text-amber-500 font-semibold'
                                : 'text-slate-500'
                          }
                        >
                          {pos.status === 'OPEN' ? 'Ochiq' : pos.status === 'PENDING' ? 'Kutilmoqda' : 'Yopilgan'}
                        </span>
                      </td>
                      <td className="py-2 px-3 text-right whitespace-nowrap">
                        {pos.status !== 'CLOSED' ? (
                          <div className="inline-flex items-center gap-1.5 font-sans">
                            <button
                              type="button"
                              onClick={() => onUpdateTargets(pos.id, pos.entryPrice, pos.takeProfit)}
                              className="px-2 py-0.5 text-[10.5px] rounded border border-violet-500/35 text-violet-600 dark:text-violet-300 hover:bg-violet-500/15 cursor-pointer"
                            >
                              BE
                            </button>
                            <button
                              type="button"
                              onClick={() => onClosePosition(pos.id)}
                              className="px-2 py-0.5 text-[10.5px] rounded border border-rose-500/40 text-rose-600 dark:text-rose-300 hover:bg-rose-600 hover:text-white cursor-pointer"
                            >
                              Yopish
                            </button>
                          </div>
                        ) : (
                          <span className="text-slate-500 text-[10px]">{pos.closedAt ?? '—'}</span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
};
