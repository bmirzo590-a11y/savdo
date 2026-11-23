import React, { useMemo, useState } from 'react';
import { Bell, CheckCheck } from 'lucide-react';
import {
  NotificationCategory,
  NotificationPriority,
  SystemNotificationRecord,
} from '../types/trading';
import { apiJson } from '../utils/apiClient';

interface NotificationsViewProps {
  notifications: SystemNotificationRecord[];
  onNotificationsUpdated: (next: SystemNotificationRecord[]) => void;
}

const PRIORITY_WEIGHT: Record<NotificationPriority, number> = {
  CRITICAL: 0,
  HIGH: 1,
  NORMAL: 2,
};

const CATEGORY_LABELS: Record<NotificationCategory, string> = {
  SIGNAL: 'Yangi signal',
  SETUP: 'BUY/SELL setup',
  BREAKOUT: 'Breakout',
  SWEEP: 'Liquidity sweep',
  POSITION: 'Pozitsiya',
  RISK: 'Risk / Blok',
  MT5: 'MT5 ulanish',
  SERVER: 'Server / Baza',
  SCANNER: 'Skaner',
  STRATEGY: 'Strategiya',
};

export const NotificationsView: React.FC<NotificationsViewProps> = ({
  notifications,
  onNotificationsUpdated,
}) => {
  const [priorityFilter, setPriorityFilter] = useState<'ALL' | NotificationPriority>('ALL');
  const [categoryFilter, setCategoryFilter] = useState<'ALL' | NotificationCategory>('ALL');
  const [onlyUnread, setOnlyUnread] = useState(false);
  const [busy, setBusy] = useState(false);

  const sortedAndFiltered = useMemo(() => {
    return [...notifications]
      .filter((n) => {
        if (priorityFilter !== 'ALL' && n.priority !== priorityFilter) return false;
        if (categoryFilter !== 'ALL' && n.category !== categoryFilter) return false;
        if (onlyUnread && n.acknowledged) return false;
        return true;
      })
      .sort((a, b) => {
        if (a.acknowledged !== b.acknowledged) return a.acknowledged ? 1 : -1;
        const pw = PRIORITY_WEIGHT[a.priority] - PRIORITY_WEIGHT[b.priority];
        if (pw !== 0) return pw;
        return b.timestamp.localeCompare(a.timestamp);
      });
  }, [notifications, priorityFilter, categoryFilter, onlyUnread]);

  const unreadCount = notifications.filter((n) => !n.acknowledged).length;

  const handleAck = async (id: string) => {
    setBusy(true);
    try {
      const res = await apiJson<{ ok: boolean; notifications: SystemNotificationRecord[] }>(
        '/api/notifications/ack',
        {
          method: 'POST',
          body: JSON.stringify({ id }),
        }
      );
      onNotificationsUpdated(res.notifications);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="rounded-xl border border-slate-200 dark:border-slate-800/90 bg-white dark:bg-[#131B2B] neon-surface overflow-hidden">
      <div className="p-5 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Bell className="w-4 h-4 text-[#C8285E] dark:text-[#FF7AA5]" />
            <h1 className="text-lg font-semibold text-slate-900 dark:text-white">
              Jonli Monitoring & Bildirishnomalar Lentasi
            </h1>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Muhim hodisalar (CRITICAL / HIGH) ustuvor tartibda ko‘rsatiladi. O‘qilmagan: {unreadCount} ta.
          </p>
        </div>

        <button
          type="button"
          disabled={busy || unreadCount === 0}
          onClick={() => void handleAck('ALL')}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-[#F25F8C]/45 text-[#C8285E] dark:text-[#FF7AA5] hover:bg-[#F25F8C]/15 disabled:opacity-40 cursor-pointer whitespace-nowrap"
        >
          <CheckCheck className="w-3.5 h-3.5" />
          <span>Barchasini o‘qilgan deb belgilash</span>
        </button>
      </div>

      {/* Filters */}
      <div className="px-5 py-3 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3 bg-slate-50/70 dark:bg-[#0D1320] text-xs">
        <div className="flex flex-wrap items-center gap-1.5">
          {(['ALL', 'CRITICAL', 'HIGH', 'NORMAL'] as const).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setPriorityFilter(p)}
              className={`px-2.5 py-1 rounded-md font-mono text-[11px] cursor-pointer ${
                priorityFilter === p
                  ? 'bg-[#F25F8C]/20 text-[#C8285E] dark:text-[#FF7AA5] font-semibold'
                  : 'text-slate-500 dark:text-slate-400 hover:text-white'
              }`}
            >
              {p === 'ALL' ? 'Barcha daraja' : p}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            aria-label="Hodisa turi"
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value as 'ALL' | NotificationCategory)}
            className="px-2.5 py-1 text-xs rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#131B2B] text-slate-900 dark:text-slate-200"
          >
            <option value="ALL">Barcha kategoriyalar</option>
            {(Object.keys(CATEGORY_LABELS) as NotificationCategory[]).map((cat) => (
              <option key={cat} value={cat}>
                {CATEGORY_LABELS[cat]}
              </option>
            ))}
          </select>

          <label className="inline-flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 cursor-pointer">
            <input
              type="checkbox"
              checked={onlyUnread}
              onChange={(e) => setOnlyUnread(e.target.checked)}
              className="accent-[#F25F8C]"
            />
            <span>Faqat o‘qilmagan</span>
          </label>
        </div>
      </div>

      {/* Live Feed */}
      <div className="divide-y divide-slate-200 dark:divide-slate-800/80 max-h-[620px] overflow-y-auto">
        {sortedAndFiltered.length === 0 ? (
          <div className="p-10 text-center text-xs text-slate-500">
            Tanlangan filtr bo‘yicha bildirishnomalar yo‘q.
          </div>
        ) : (
          sortedAndFiltered.map((item) => {
            const prioColor =
              item.priority === 'CRITICAL'
                ? 'text-rose-500'
                : item.priority === 'HIGH'
                  ? 'text-amber-500'
                  : 'text-slate-400';
            return (
              <div
                key={item.id}
                className={`px-5 py-3.5 flex flex-wrap items-start justify-between gap-3 transition-colors ${
                  item.acknowledged
                    ? 'opacity-65'
                    : item.priority === 'CRITICAL'
                      ? 'bg-rose-500/5'
                      : ''
                }`}
              >
                <div className="space-y-1 max-w-3xl">
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span className={`font-mono font-bold ${prioColor}`}>{item.priority}</span>
                    <span aria-hidden="true" className="text-slate-500">·</span>
                    <span className="font-mono text-[#C8285E] dark:text-[#FF7AA5]">
                      {CATEGORY_LABELS[item.category] ?? item.category}
                    </span>
                    {item.symbol && (
                      <>
                        <span aria-hidden="true" className="text-slate-500">·</span>
                        <span className="font-mono font-semibold text-slate-900 dark:text-white">
                          {item.symbol}
                        </span>
                      </>
                    )}
                    <span aria-hidden="true" className="text-slate-500">·</span>
                    <span className="font-mono tabular-nums text-[11px] text-slate-500">
                      {new Date(item.timestamp).toLocaleString('en-GB')}
                    </span>
                  </div>
                  <div className="text-sm font-semibold text-slate-900 dark:text-white">
                    {item.title}
                  </div>
                  <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                    {item.message}
                  </p>
                </div>

                {!item.acknowledged && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void handleAck(item.id)}
                    className="px-2.5 py-1 text-[11px] font-medium rounded border border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-[#F25F8C]/50 hover:text-[#FF7AA5] cursor-pointer whitespace-nowrap shrink-0"
                  >
                    O‘qildi
                  </button>
                )}
              </div>
            );
          })
        )}
      </div>
    </section>
  );
};
