import React, { useEffect, useMemo, useState } from 'react';
import {
  Bell,
  Lock,
  Menu,
  Moon,
  Settings,
  Sun,
} from 'lucide-react';
import { LiveSystemStatusSnapshot, ViewId } from '../types/trading';

interface TopTerminalBarProps {
  currentTitle: string;
  status: LiveSystemStatusSnapshot | null;
  mt5Connected: boolean;
  mt5Login: string;
  unreadNotifs: number;
  darkMode: boolean;
  onToggleDarkMode: () => void;
  onOpenMobileMenu: () => void;
  onNavigate: (view: ViewId) => void;
  onLockSystem: () => void;
}

interface SessionStatus {
  name: string;
  active: boolean;
}

function computeUtcSessions(now: Date): SessionStatus[] {
  const utcHour = now.getUTCHours();
  // Real FX market sessions in UTC:
  // Asia (Tokyo): 00:00 - 09:00 UTC
  // London: 07:00 - 16:00 UTC
  // New York: 12:00 - 21:00 UTC
  const day = now.getUTCDay();
  const isWeekend = day === 6 || (day === 0 && utcHour < 22) || (day === 5 && utcHour >= 22);
  if (isWeekend) {
    return [
      { name: 'Asia', active: false },
      { name: 'London', active: false },
      { name: 'NY', active: false },
    ];
  }
  return [
    { name: 'Asia', active: utcHour >= 0 && utcHour < 9 },
    { name: 'London', active: utcHour >= 7 && utcHour < 16 },
    { name: 'NY', active: utcHour >= 12 && utcHour < 21 },
  ];
}

export const TopTerminalBar: React.FC<TopTerminalBarProps> = ({
  currentTitle,
  status,
  mt5Connected,
  mt5Login,
  unreadNotifs,
  darkMode,
  onToggleDarkMode,
  onOpenMobileMenu,
  onNavigate,
  onLockSystem,
}) => {
  const [now, setNow] = useState<Date>(() => new Date());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const localTimeStr = useMemo(
    () =>
      now.toLocaleTimeString('en-GB', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      }),
    [now]
  );

  const sessions = useMemo(() => computeUtcSessions(now), [now]);
  const activeSessionsLabel = useMemo(() => {
    const open = sessions.filter((s) => s.active).map((s) => s.name);
    return open.length > 0 ? open.join(' / ') : 'Yopiq (Dam olish)';
  }, [sessions]);

  const aiLabel = !status
    ? 'Yuklanmoqda'
    : status.aiStatus === 'LOCAL_PROXY_READY'
      ? 'Proksi Tayyor'
      : status.aiStatus === 'GEMINI_READY'
        ? 'AI Tayyor'
        : 'Sozlanmagan';

  const aiColor = !status
    ? 'text-slate-400'
    : status.aiStatus === 'UNCONFIGURED'
      ? 'text-amber-400'
      : 'text-emerald-400';

  const dbLabel = !status
    ? 'Yuklanmoqda'
    : `${status.databaseStatus === 'HEALTHY' ? 'Sog‘lom' : 'Tiklangan'} · ${status.dbSizeKb}KB`;

  return (
    <header className="h-12 px-3 sm:px-4 border-b border-slate-200 dark:border-violet-500/20 bg-white/95 dark:bg-[#080D1B]/95 backdrop-blur-md flex items-center justify-between gap-3 sticky top-0 z-30">
      {/* Left: Mobile Trigger + Breadcrumb */}
      <div className="flex items-center gap-2.5 min-w-0 shrink-0">
        <button
          type="button"
          onClick={onOpenMobileMenu}
          className="lg:hidden p-1.5 -ml-1 text-slate-600 dark:text-slate-300 hover:text-sky-400 cursor-pointer"
          aria-label="Menyuni ochish"
        >
          <Menu className="w-4 h-4" />
        </button>
        <div className="flex items-center gap-1.5 text-xs whitespace-nowrap truncate">
          <span className="font-display font-bold tracking-tight text-slate-900 dark:bg-gradient-to-r dark:from-violet-400 dark:via-sky-400 dark:to-emerald-400 dark:bg-clip-text dark:text-transparent">
            Trade Killer AI
          </span>
          <span aria-hidden="true" className="text-slate-400 dark:text-slate-600">/</span>
          <span className="font-medium text-slate-700 dark:text-sky-300 truncate max-w-[140px] sm:max-w-[220px]">
            {currentTitle}
          </span>
        </div>
      </div>

      {/* Center: Compact Live Institutional Telemetry Strip */}
      <div className="hidden xl:flex items-center gap-3 text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400 min-w-0 overflow-hidden">
        <div className="flex items-center gap-1.5 whitespace-nowrap">
          <span className="font-sans text-slate-400 dark:text-slate-500">Vaqt:</span>
          <span className="text-slate-900 dark:text-slate-100 font-semibold">{localTimeStr}</span>
        </div>

        <span aria-hidden="true" className="text-slate-300 dark:text-slate-700">·</span>

        <button
          type="button"
          onClick={() => onNavigate('calendar')}
          className="flex items-center gap-1.5 whitespace-nowrap hover:text-sky-400 transition-colors cursor-pointer"
        >
          <span className="font-sans text-slate-400 dark:text-slate-500">Sessiya:</span>
          <span className={sessions.some((s) => s.active) ? 'text-sky-500 dark:text-sky-400 font-semibold' : 'text-slate-500'}>
            {activeSessionsLabel}
          </span>
        </button>

        <span aria-hidden="true" className="text-slate-300 dark:text-slate-700">·</span>

        <button
          type="button"
          onClick={() => onNavigate('settings')}
          className="flex items-center gap-1.5 whitespace-nowrap hover:text-sky-400 transition-colors cursor-pointer"
        >
          <span className="font-sans text-slate-400 dark:text-slate-500">MT5:</span>
          <span className={mt5Connected ? 'text-emerald-500 dark:text-[#00E5A0] font-semibold' : 'text-amber-500 dark:text-amber-400 font-semibold'}>
            {mt5Connected ? `Ulangan #${mt5Login}` : 'Uzilgan (Demo)'}
          </span>
        </button>

        <span aria-hidden="true" className="text-slate-300 dark:text-slate-700">·</span>

        <button
          type="button"
          onClick={() => onNavigate('monitor')}
          className="flex items-center gap-1.5 whitespace-nowrap hover:text-sky-400 transition-colors cursor-pointer"
        >
          <span className="font-sans text-slate-400 dark:text-slate-500">VPS:</span>
          <span className={status?.serverOnline ? 'text-emerald-500 dark:text-[#00E5A0] font-semibold' : 'text-rose-500 font-semibold'}>
            {status?.serverOnline ? 'Faol' : status ? 'Uzilgan' : '...'}
          </span>
        </button>

        <span aria-hidden="true" className="text-slate-300 dark:text-slate-700">·</span>

        <button
          type="button"
          onClick={() => onNavigate('analyst')}
          className="flex items-center gap-1.5 whitespace-nowrap hover:text-violet-400 transition-colors cursor-pointer"
        >
          <span className="font-sans text-slate-400 dark:text-slate-500">AI:</span>
          <span className={`${aiColor} font-semibold`}>{aiLabel}</span>
        </button>

        <span aria-hidden="true" className="text-slate-300 dark:text-slate-700">·</span>

        <button
          type="button"
          onClick={() => onNavigate('memory')}
          className="flex items-center gap-1.5 whitespace-nowrap hover:text-violet-400 transition-colors cursor-pointer"
        >
          <span className="font-sans text-slate-400 dark:text-slate-500">DB:</span>
          <span className="text-slate-700 dark:text-slate-200 font-semibold">{dbLabel}</span>
        </button>
      </div>

      {/* Right: Functional Action Controls */}
      <div className="flex items-center gap-1.5 shrink-0">
        <span className="xl:hidden font-mono tabular-nums text-[11px] text-slate-500 dark:text-slate-400 mr-1 hidden sm:inline">
          {localTimeStr}
        </span>

        <button
          type="button"
          onClick={() => onNavigate('notifications')}
          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-mono tabular-nums rounded-lg border border-slate-200 dark:border-violet-500/25 bg-slate-50 dark:bg-[#0D1426] text-slate-700 dark:text-slate-200 hover:border-sky-400/60 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          aria-label="Bildirishnomalar"
        >
          <Bell className={`w-3.5 h-3.5 ${unreadNotifs > 0 ? 'text-violet-500 dark:text-violet-400' : 'text-slate-400'}`} />
          <span>{unreadNotifs}</span>
        </button>

        <button
          type="button"
          onClick={() => onNavigate('settings')}
          className="inline-flex items-center justify-center p-1.5 rounded-lg border border-slate-200 dark:border-violet-500/25 bg-slate-50 dark:bg-[#0D1426] text-slate-600 dark:text-slate-300 hover:border-sky-400/60 hover:text-sky-400 transition-colors cursor-pointer"
          aria-label="Sozlamalar"
          title="Sozlamalar"
        >
          <Settings className="w-3.5 h-3.5" />
        </button>

        <button
          type="button"
          onClick={onToggleDarkMode}
          className="inline-flex items-center justify-center p-1.5 rounded-lg border border-slate-200 dark:border-violet-500/25 bg-slate-50 dark:bg-[#0D1426] text-slate-600 dark:text-slate-300 hover:border-sky-400/60 hover:text-sky-400 transition-colors cursor-pointer"
          aria-label="Mavzuni almashtirish"
          title={darkMode ? 'Yorug‘ rejim' : 'Tungi neon rejim'}
        >
          {darkMode ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
        </button>

        <button
          type="button"
          onClick={onLockSystem}
          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold rounded-lg border border-violet-500/40 bg-violet-500/10 text-violet-700 dark:text-violet-300 hover:bg-violet-500/20 hover:border-violet-400 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
        >
          <Lock className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Qulflash</span>
        </button>
      </div>
    </header>
  );
};
