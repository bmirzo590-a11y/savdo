import React, { useEffect, useMemo, useState } from 'react';
import { CalendarDays, Clock, Plus, ShieldAlert, Trash2 } from 'lucide-react';

export interface EconomicEventRecord {
  id: string;
  timeUtc: string;
  currency: string;
  title: string;
  impact: 'HIGH' | 'MEDIUM' | 'LOW';
  forecast: string;
  previous: string;
}

const STORAGE_KEY = 'tk_ai_economic_events_v1';
const SHIELD_KEY = 'tk_ai_news_shield_v1';

export const EconomicCalendarView: React.FC = () => {
  const [now, setNow] = useState<Date>(() => new Date());
  const [events, setEvents] = useState<EconomicEventRecord[]>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed as EconomicEventRecord[];
      }
    } catch {
      // Ignore
    }
    return [];
  });

  const [shieldConfig, setShieldConfig] = useState<{
    enabled: boolean;
    blockBeforeMin: number;
    blockAfterMin: number;
  }>(() => {
    try {
      const raw = localStorage.getItem(SHIELD_KEY);
      if (raw) return JSON.parse(raw);
    } catch {
      // Ignore
    }
    return { enabled: true, blockBeforeMin: 30, blockAfterMin: 15 };
  });

  const [title, setTitle] = useState('');
  const [currency, setCurrency] = useState('USD');
  const [timeUtc, setTimeUtc] = useState('13:30');
  const [impact, setImpact] = useState<'HIGH' | 'MEDIUM' | 'LOW'>('HIGH');
  const [forecast, setForecast] = useState('');
  const [previous, setPrevious] = useState('');

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const saveEvents = (next: EconomicEventRecord[]) => {
    setEvents(next);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Ignore
    }
  };

  const updateShield = (next: { enabled: boolean; blockBeforeMin: number; blockAfterMin: number }) => {
    setShieldConfig(next);
    try {
      localStorage.setItem(SHIELD_KEY, JSON.stringify(next));
    } catch {
      // Ignore
    }
  };

  const handleAddEvent = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    const item: EconomicEventRecord = {
      id: `eco-${Date.now()}`,
      timeUtc: timeUtc || '13:30',
      currency,
      title: title.trim(),
      impact,
      forecast: forecast.trim() || '—',
      previous: previous.trim() || '—',
    };
    saveEvents([...events, item].sort((a, b) => a.timeUtc.localeCompare(b.timeUtc)));
    setTitle('');
    setForecast('');
    setPrevious('');
  };

  const sessions = useMemo(() => {
    const h = now.getUTCHours();
    const day = now.getUTCDay();
    const isWeekend = day === 6 || (day === 0 && h < 22) || (day === 5 && h >= 22);
    return [
      { name: 'Sydney', hours: '22:00 – 07:00 UTC', open: !isWeekend && (h >= 22 || h < 7) },
      { name: 'Tokyo (Asia)', hours: '00:00 – 09:00 UTC', open: !isWeekend && h >= 0 && h < 9 },
      { name: 'London (Europe)', hours: '07:00 – 16:00 UTC', open: !isWeekend && h >= 7 && h < 16 },
      { name: 'New York (US)', hours: '12:00 – 21:00 UTC', open: !isWeekend && h >= 12 && h < 21 },
    ];
  }, [now]);

  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-slate-200 dark:border-violet-500/30 bg-white dark:bg-[#0B1120] tk-glass-purple p-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <CalendarDays className="w-4 h-4 text-sky-500 dark:text-sky-400" />
            <span>Iqtisodiy Taqvim va Yangiliklardan Himoya</span>
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            NFP, CPI, FOMC, Foiz stavkalari va YaIM oldidan savdoni himoyalash. Tashqi API ulanmaganida soxta yangilik yaratilmaydi.
          </p>
        </div>

        <div className="text-right font-mono tabular-nums text-xs">
          <div className="text-slate-500">UTC Vaqti</div>
          <div className="text-sm font-bold text-sky-600 dark:text-sky-400">
            {now.toISOString().slice(11, 19)} UTC
          </div>
        </div>
      </section>

      {/* Honest Feed Status Notice + News Shield Config */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <section className="lg:col-span-7 rounded-xl border border-amber-500/35 bg-amber-500/5 dark:bg-[#0B1120] p-4 space-y-3">
          <div className="flex items-start gap-2.5">
            <ShieldAlert className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
            <div className="space-y-1 text-xs">
              <div className="font-semibold text-amber-700 dark:text-amber-300">
                Tashqi iqtisodiy taqvim API ulanmagan (DISCONNECTED)
              </div>
              <p className="text-slate-600 dark:text-slate-300 leading-relaxed">
                Halollik qoidasiga ko‘ra, tizim taxminiy yoki soxta NFP / CPI / FOMC raqamlarini to‘qib chiqarmaydi. Real feed ulangunga qadar muhim yangiliklar jadvalini quyida qo‘lda kiritishingiz mumkin.
              </p>
            </div>
          </div>

          {/* Real UTC Market Sessions */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 border-t border-amber-500/20 text-xs">
            {sessions.map((s) => (
              <div
                key={s.name}
                className={`p-2.5 rounded-lg border ${
                  s.open
                    ? 'border-emerald-500/35 bg-emerald-500/10'
                    : 'border-slate-200 dark:border-slate-800 bg-white/60 dark:bg-[#070C18]'
                }`}
              >
                <div className="font-semibold text-slate-900 dark:text-white">{s.name}</div>
                <div className="font-mono text-[10px] text-slate-500">{s.hours}</div>
                <div
                  className={`mt-1 font-mono text-[10.5px] font-bold ${
                    s.open ? 'text-emerald-600 dark:text-[#00E5A0]' : 'text-slate-500'
                  }`}
                >
                  {s.open ? 'OCHIQ' : 'YOPIQ'}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Pre-News Shield Controls */}
        <section className="lg:col-span-5 rounded-xl border border-slate-200 dark:border-violet-500/25 bg-white dark:bg-[#0B1120] tk-glass p-4 space-y-3 text-xs">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-1.5">
              <Clock className="w-4 h-4 text-violet-500 dark:text-violet-400" />
              <span>Yangilik Oldi Savdo Blokirovkasi</span>
            </h2>
            <button
              type="button"
              onClick={() => updateShield({ ...shieldConfig, enabled: !shieldConfig.enabled })}
              className={`px-2.5 py-1 font-mono font-semibold rounded border cursor-pointer ${
                shieldConfig.enabled
                  ? 'border-emerald-500/40 bg-emerald-500/15 text-emerald-600 dark:text-[#00E5A0]'
                  : 'border-slate-300 dark:border-slate-700 text-slate-500'
              }`}
            >
              {shieldConfig.enabled ? 'FAOL' : 'O‘CHIRILGAN'}
            </button>
          </div>

          <div className="grid grid-cols-2 gap-3 font-mono">
            <div>
              <label className="block font-sans text-[11px] text-slate-500 mb-1">
                Yangilikdan oldin (daqiqa)
              </label>
              <input
                type="number"
                min={5}
                max={120}
                value={shieldConfig.blockBeforeMin}
                onChange={(e) =>
                  updateShield({
                    ...shieldConfig,
                    blockBeforeMin: Math.max(5, Number(e.target.value) || 30),
                  })
                }
                className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-violet-500/25 bg-slate-50 dark:bg-[#060A15] text-slate-900 dark:text-white"
              />
            </div>
            <div>
              <label className="block font-sans text-[11px] text-slate-500 mb-1">
                Yangilikdan keyin (daqiqa)
              </label>
              <input
                type="number"
                min={5}
                max={120}
                value={shieldConfig.blockAfterMin}
                onChange={(e) =>
                  updateShield({
                    ...shieldConfig,
                    blockAfterMin: Math.max(5, Number(e.target.value) || 15),
                  })
                }
                className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-violet-500/25 bg-slate-50 dark:bg-[#060A15] text-slate-900 dark:text-white"
              />
            </div>
          </div>

          <p className="text-[11px] text-slate-500 dark:text-slate-400">
            HIGH ta’sirli makro-hodisa jadvalda mavjud bo‘lsa, belgilangan oyna davomida yangi avtonom order ochish bloklanadi.
          </p>
        </section>
      </div>

      {/* Add & View Manual Scheduled Events */}
      <section className="rounded-xl border border-slate-200 dark:border-violet-500/25 bg-white dark:bg-[#0B1120] tk-glass p-4 space-y-4">
        <form onSubmit={handleAddEvent} className="grid grid-cols-2 sm:grid-cols-6 gap-2 text-xs">
          <input
            type="time"
            value={timeUtc}
            onChange={(e) => setTimeUtc(e.target.value)}
            aria-label="UTC Vaqti"
            className="px-2.5 py-1.5 font-mono rounded-lg border border-slate-200 dark:border-violet-500/25 bg-slate-50 dark:bg-[#060A15] text-slate-900 dark:text-white"
          />
          <select
            value={currency}
            onChange={(e) => setCurrency(e.target.value)}
            aria-label="Valyuta"
            className="px-2.5 py-1.5 font-mono rounded-lg border border-slate-200 dark:border-violet-500/25 bg-slate-50 dark:bg-[#060A15] text-slate-900 dark:text-white"
          >
            {['USD', 'EUR', 'GBP', 'JPY', 'XAU', 'CHF', 'CAD', 'AUD'].map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Hodisa (masalan: US NFP / CPI)"
            className="col-span-2 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-violet-500/25 bg-slate-50 dark:bg-[#060A15] text-slate-900 dark:text-white"
          />
          <select
            value={impact}
            onChange={(e) => setImpact(e.target.value as 'HIGH' | 'MEDIUM' | 'LOW')}
            aria-label="Ta’sir darajasi"
            className="px-2.5 py-1.5 font-mono rounded-lg border border-slate-200 dark:border-violet-500/25 bg-slate-50 dark:bg-[#060A15] text-slate-900 dark:text-white"
          >
            <option value="HIGH">HIGH (Yuqori)</option>
            <option value="MEDIUM">MEDIUM (O‘rta)</option>
            <option value="LOW">LOW (Past)</option>
          </select>
          <button
            type="submit"
            className="inline-flex items-center justify-center gap-1 px-3 py-1.5 font-semibold rounded-lg bg-gradient-to-r from-violet-600 to-sky-600 text-white hover:brightness-110 cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Qo‘shish</span>
          </button>
        </form>

        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead>
              <tr className="border-b border-slate-200 dark:border-violet-500/15 text-[11px] text-slate-500">
                <th className="py-2 px-3">UTC Vaqt</th>
                <th className="py-2 px-3">Valyuta</th>
                <th className="py-2 px-3">Hodisa</th>
                <th className="py-2 px-3">Ta’sir</th>
                <th className="py-2 px-3">Prognoz / Oldingi</th>
                <th className="py-2 px-3 text-right">Amal</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200/70 dark:divide-violet-500/10 font-mono tabular-nums">
              {events.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-6 text-center font-sans text-slate-500">
                    Jadval bo‘sh (EMPTY). Yuqoridan kutilayotgan real makro-hodisani qo‘shing.
                  </td>
                </tr>
              ) : (
                events.map((ev) => (
                  <tr key={ev.id}>
                    <td className="py-2 px-3 text-sky-600 dark:text-sky-400 font-semibold">
                      {ev.timeUtc} UTC
                    </td>
                    <td className="py-2 px-3 font-bold text-slate-900 dark:text-white">
                      {ev.currency}
                    </td>
                    <td className="py-2 px-3 font-sans text-slate-700 dark:text-slate-200">
                      {ev.title}
                    </td>
                    <td className="py-2 px-3 font-bold">
                      <span
                        className={
                          ev.impact === 'HIGH'
                            ? 'text-rose-500'
                            : ev.impact === 'MEDIUM'
                              ? 'text-amber-500'
                              : 'text-slate-400'
                        }
                      >
                        {ev.impact}
                      </span>
                    </td>
                    <td className="py-2 px-3 text-slate-500">
                      {ev.forecast} / {ev.previous}
                    </td>
                    <td className="py-2 px-3 text-right">
                      <button
                        type="button"
                        onClick={() => saveEvents(events.filter((x) => x.id !== ev.id))}
                        aria-label="O‘chirish"
                        className="text-slate-400 hover:text-rose-500 cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
};
