import React, { useMemo, useState } from 'react';
import { Position, PositionStatus } from '../types/trading';
import { formatCurrency, formatPrice } from '../config/initialData';
import { Search, X } from 'lucide-react';

interface PositionsTableProps {
  positions: Position[];
  onClosePosition: (id: string) => void;
  onUpdateTargets: (id: string, stopLoss: number | null, takeProfit: number | null) => void;
  onSelectPair?: (symbol: string) => void;
  title?: string;
}

export const PositionsTable: React.FC<PositionsTableProps> = ({
  positions,
  onClosePosition,
  onUpdateTargets,
  onSelectPair,
  title = 'MT5 Pozitsiyalar va Buyurtmalar',
}) => {
  const [filterStatus, setFilterStatus] = useState<'ALL' | PositionStatus>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [editingPos, setEditingPos] = useState<Position | null>(null);
  const [editSl, setEditSl] = useState('');
  const [editTp, setEditTp] = useState('');

  const calculatePnl = (pos: Position): number => {
    if (pos.status === 'CLOSED' && pos.realizedPnl !== undefined) {
      return pos.realizedPnl;
    }
    if (pos.status === 'OPEN' && typeof pos.profit === 'number') {
      return pos.profit;
    }
    if (pos.status === 'PENDING') return 0;
    const diff =
      pos.side === 'LONG'
        ? (pos.markPrice - pos.entryPrice) / pos.entryPrice
        : (pos.entryPrice - pos.markPrice) / pos.entryPrice;
    return pos.sizeUsdt * diff;
  };

  const filtered = useMemo(() => {
    return positions.filter((p) => {
      const matchesStatus = filterStatus === 'ALL' || p.status === filterStatus;
      const q = searchQuery.trim().toLowerCase();
      const matchesQuery =
        !q ||
        p.symbol.toLowerCase().includes(q) ||
        p.id.toLowerCase().includes(q) ||
        p.strategyName.toLowerCase().includes(q);
      return matchesStatus && matchesQuery;
    });
  }, [positions, filterStatus, searchQuery]);

  const openEditModal = (pos: Position) => {
    setEditingPos(pos);
    setEditSl(pos.stopLoss !== null ? String(pos.stopLoss) : '');
    setEditTp(pos.takeProfit !== null ? String(pos.takeProfit) : '');
  };

  const handleSaveTargets = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingPos) return;
    onUpdateTargets(
      editingPos.id,
      editSl.trim() ? Number(editSl) : null,
      editTp.trim() ? Number(editTp) : null
    );
    setEditingPos(null);
  };

  const statusLabel = (status: PositionStatus) => {
    if (status === 'OPEN') return 'Ochiq';
    if (status === 'PENDING') return 'Kutilmoqda';
    return 'Yopilgan';
  };

  return (
    <section className="rounded-xl border border-slate-200 dark:border-violet-500/25 bg-white dark:bg-[#0B1120] tk-glass overflow-hidden">
      <div className="p-4 flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 dark:border-violet-500/20">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-white">{title}</h2>
          <div className="flex items-center gap-1 p-1 rounded-lg bg-slate-100 dark:bg-[#080D1B] border border-slate-200 dark:border-violet-500/20">
            {(
              [
                ['ALL', 'Barchasi'],
                ['OPEN', 'Ochiq'],
                ['PENDING', 'Kutilmoqda'],
                ['CLOSED', 'Yopilgan'],
              ] as const
            ).map(([val, label]) => (
              <button
                key={val}
                type="button"
                onClick={() => setFilterStatus(val)}
                className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  filterStatus === val
                    ? 'bg-white dark:bg-violet-500/20 text-slate-900 dark:text-sky-300 shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="relative w-full sm:w-64">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Ticket, juftlik yoki AI..."
            className="w-full pl-9 pr-3 py-1.5 text-sm rounded-lg border border-slate-200 dark:border-violet-500/25 bg-slate-50 dark:bg-[#080D1B] text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
          />
        </div>
      </div>

      <div className="overflow-x-auto">
        {filtered.length === 0 ? (
          <div className="py-12 px-6 text-center">
            <p className="text-sm font-medium text-slate-900 dark:text-white">
              Mos keluvchi MT5 pozitsiyalar topilmadi
            </p>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Filtrlarni o‘zgartiring yoki AI orqali yangi buyurtma bering.
            </p>
          </div>
        ) : (
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 text-xs font-medium text-slate-500 dark:text-slate-400">
                <th className="py-3 px-5">Instrument · Ticket</th>
                <th className="py-3 px-4">Yo‘nalish</th>
                <th className="py-3 px-4 text-right">Lot hajmi</th>
                <th className="py-3 px-4 text-right">Kirish</th>
                <th className="py-3 px-4 text-right">Joriy narx</th>
                <th className="py-3 px-4 text-right">SL / TP</th>
                <th className="py-3 px-4 text-right">Foyda / Zarar</th>
                <th className="py-3 px-4">Holat</th>
                <th className="py-3 px-5 text-right">Amal</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800/80 text-sm">
              {filtered.map((pos) => {
                const pnl = calculatePnl(pos);

                return (
                  <tr
                    key={pos.id}
                    className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors"
                  >
                    <td className="py-3 px-5">
                      <button
                        type="button"
                        onClick={() => onSelectPair && onSelectPair(pos.symbol)}
                        className="font-semibold text-slate-900 dark:text-white hover:text-sky-400 transition-colors cursor-pointer text-left"
                      >
                        {pos.symbol}
                      </button>
                      <div className="text-xs text-slate-500 dark:text-slate-400 font-mono">
                        {pos.id} · {pos.strategyName}
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <span
                        className={`text-xs font-semibold ${
                          pos.side === 'LONG'
                            ? 'text-emerald-600 dark:text-emerald-400'
                            : 'text-red-600 dark:text-rose-400'
                        }`}
                      >
                        {pos.side === 'LONG' ? 'BUY' : 'SELL'}
                      </span>
                      <span className="text-xs text-slate-400 ml-1.5">· {pos.orderType}</span>
                    </td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums text-violet-600 dark:text-sky-300">
                      {pos.lotSize.toFixed(2)} lot
                    </td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-700 dark:text-slate-300">
                      {formatPrice(pos.entryPrice)}
                    </td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-900 dark:text-white">
                      {formatPrice(pos.markPrice)}
                    </td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums text-xs text-slate-500 dark:text-slate-400">
                      <div>SL: {pos.stopLoss ? formatPrice(pos.stopLoss) : '—'}</div>
                      <div>TP: {pos.takeProfit ? formatPrice(pos.takeProfit) : '—'}</div>
                    </td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums">
                      {pos.status === 'PENDING' ? (
                        <span className="text-slate-400">—</span>
                      ) : (
                        <span
                          className={`font-semibold ${
                            pnl >= 0
                              ? 'text-emerald-600 dark:text-emerald-400'
                              : 'text-red-600 dark:text-rose-400'
                          }`}
                        >
                          {pnl >= 0 ? '+' : ''}
                          {formatCurrency(pnl)}
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-xs">
                      <span
                        className={
                          pos.status === 'OPEN'
                            ? 'text-emerald-600 dark:text-emerald-400 font-medium'
                            : pos.status === 'PENDING'
                              ? 'text-amber-600 dark:text-amber-400 font-medium'
                              : 'text-slate-500 dark:text-slate-400'
                        }
                      >
                        {statusLabel(pos.status)}
                      </span>
                      <div className="text-slate-400 font-mono">{pos.openedAt}</div>
                    </td>
                    <td className="py-3 px-5 text-right whitespace-nowrap">
                      {pos.status !== 'CLOSED' ? (
                        <div className="inline-flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => openEditModal(pos)}
                            className="px-2.5 py-1 text-xs font-medium rounded border border-slate-200 dark:border-violet-500/30 text-slate-700 dark:text-slate-300 hover:border-sky-400 transition-colors cursor-pointer"
                          >
                            SL/TP
                          </button>
                          <button
                            type="button"
                            onClick={() => onClosePosition(pos.id)}
                            className="px-2.5 py-1 text-xs font-medium rounded border border-red-200 dark:border-rose-500/40 text-red-600 dark:text-rose-400 hover:bg-red-50 dark:hover:bg-rose-950/40 transition-colors cursor-pointer"
                          >
                            {pos.status === 'PENDING' ? 'Bekor qilish' : 'Yopish'}
                          </button>
                        </div>
                      ) : (
                        <span className="text-xs text-slate-400 font-mono">
                          {pos.closedAt ?? '—'}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {editingPos && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-md rounded-xl border border-slate-200 dark:border-violet-500/40 bg-white dark:bg-[#0B1120] tk-glass-purple p-6">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-violet-500/20">
              <h3 className="text-base font-semibold text-slate-900 dark:text-white">
                {editingPos.symbol} · SL / TP tahrirlash
              </h3>
              <button
                type="button"
                onClick={() => setEditingPos(null)}
                className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-white cursor-pointer"
                aria-label="Yopish"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleSaveTargets} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">
                  Stop-Loss narxi
                </label>
                <input
                  type="number"
                  step="any"
                  value={editSl}
                  onChange={(e) => setEditSl(e.target.value)}
                  className="w-full px-3 py-2 text-sm font-mono tabular-nums rounded-lg border border-slate-200 dark:border-violet-500/25 bg-slate-50 dark:bg-[#080D1B] text-slate-900 dark:text-white"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">
                  Take-Profit narxi
                </label>
                <input
                  type="number"
                  step="any"
                  value={editTp}
                  onChange={(e) => setEditTp(e.target.value)}
                  className="w-full px-3 py-2 text-sm font-mono tabular-nums rounded-lg border border-slate-200 dark:border-violet-500/25 bg-slate-50 dark:bg-[#080D1B] text-slate-900 dark:text-white"
                />
              </div>
              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setEditingPos(null)}
                  className="px-4 py-2 text-sm font-medium rounded-lg border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                >
                  Bekor qilish
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-sm font-semibold rounded-lg bg-gradient-to-r from-violet-600 to-sky-500 text-white hover:brightness-110 neon-glow-purple cursor-pointer"
                >
                  Saqlash
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </section>
  );
};
