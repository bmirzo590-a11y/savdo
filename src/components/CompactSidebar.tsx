import React, { useEffect, useState } from 'react';
import {
  Activity,
  BarChart3,
  Bell,
  Bot,
  BrainCircuit,
  ChevronDown,
  ChevronRight,
  Cpu,
  History,
  Lock,
  LogOut,
  PanelLeftClose,
  PanelLeftOpen,
  Settings,
  ShieldAlert,
  ShieldCheck,
  UserCheck,
  X,
} from 'lucide-react';
import { ViewId } from '../types/trading';

export type RiskSubTab = 'portfolio' | 'position' | 'settings';
export type SettingsSubTab = 'terminal' | 'ai' | 'data' | 'system';

export interface SubNavItem {
  key: string;
  label: string;
  view: ViewId;
  riskTab?: RiskSubTab;
  settingsTab?: SettingsSubTab;
}

export interface SidebarGroupItem {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  defaultView: ViewId;
  matchViews: ViewId[];
  subItems?: SubNavItem[];
}

export const SIDEBAR_GROUPS: SidebarGroupItem[] = [
  {
    id: 'dashboard',
    label: 'Dashboard',
    icon: BarChart3,
    defaultView: 'dashboard',
    matchViews: ['dashboard'],
  },
  {
    id: 'ai',
    label: 'AI Intelligence',
    icon: BrainCircuit,
    defaultView: 'aichat',
    matchViews: ['aichat', 'analyst', 'candlesticks', 'smc'],
    subItems: [
      { key: 'aichat', label: 'AI Chat Center (6)', view: 'aichat' },
      { key: 'analyst', label: 'AI Analyst', view: 'analyst' },
      { key: 'candlesticks', label: 'Candlestick Intelligence', view: 'candlesticks' },
      { key: 'smc', label: 'Smart Money / ICT', view: 'smc' },
    ],
  },
  {
    id: 'scanner',
    label: 'Market Scanner',
    icon: Activity,
    defaultView: 'scanner',
    matchViews: ['scanner', 'calendar'],
    subItems: [
      { key: 'scanner', label: '24/7 Scanner', view: 'scanner' },
      { key: 'calendar', label: 'Economic Calendar', view: 'calendar' },
    ],
  },
  {
    id: 'strategies',
    label: 'Strategies',
    icon: Cpu,
    defaultView: 'strategies',
    matchViews: ['strategies', 'ensemble', 'research'],
    subItems: [
      { key: 'strategies', label: 'Strategy Center', view: 'strategies' },
      { key: 'ensemble', label: 'Strategy Ensemble', view: 'ensemble' },
      { key: 'research', label: 'AI Research Lab', view: 'research' },
    ],
  },
  {
    id: 'trading',
    label: 'Trading & Orders',
    icon: Bot,
    defaultView: 'autotrading',
    matchViews: ['autotrading', 'multiorder'],
    subItems: [
      { key: 'autotrading', label: 'Auto Trading', view: 'autotrading' },
      { key: 'multiorder', label: 'Multi-Order Manager', view: 'multiorder' },
    ],
  },
  {
    id: 'risk',
    label: 'Risk Manager',
    icon: ShieldAlert,
    defaultView: 'risk',
    matchViews: ['risk'],
    subItems: [
      { key: 'risk-portfolio', label: 'Portfolio Risk', view: 'risk', riskTab: 'portfolio' },
      { key: 'risk-position', label: 'Position Risk', view: 'risk', riskTab: 'position' },
      { key: 'risk-settings', label: 'Risk Settings', view: 'risk', riskTab: 'settings' },
    ],
  },
  {
    id: 'history',
    label: 'History & Backtest',
    icon: History,
    defaultView: 'memory',
    matchViews: ['memory', 'backtest', 'journal'],
    subItems: [
      { key: 'memory', label: 'Historical Memory', view: 'memory' },
      { key: 'backtest', label: 'Backtest Lab', view: 'backtest' },
      { key: 'journal', label: 'Trading Journal', view: 'journal' },
    ],
  },
  {
    id: 'notifications',
    label: 'Notifications',
    icon: Bell,
    defaultView: 'notifications',
    matchViews: ['notifications'],
  },
  {
    id: 'owner',
    label: 'Owner Center',
    icon: UserCheck,
    defaultView: 'owner',
    matchViews: ['owner'],
  },
  {
    id: 'settings',
    label: 'Settings',
    icon: Settings,
    defaultView: 'settings',
    matchViews: ['settings', 'monitor'],
    subItems: [
      { key: 'settings-terminal', label: 'Terminal Settings', view: 'settings', settingsTab: 'terminal' },
      { key: 'settings-ai', label: 'AI Configuration', view: 'settings', settingsTab: 'ai' },
      { key: 'settings-data', label: 'Data Sources', view: 'settings', settingsTab: 'data' },
      { key: 'settings-system', label: 'System Config', view: 'settings', settingsTab: 'system' },
      { key: 'settings-health', label: 'System Health', view: 'monitor' },
    ],
  },
];

export function findActiveGroup(view: ViewId): SidebarGroupItem {
  return SIDEBAR_GROUPS.find((g) => g.matchViews.includes(view)) ?? SIDEBAR_GROUPS[0];
}

export function getActiveBreadcrumbTitle(
  view: ViewId,
  riskTab: RiskSubTab,
  settingsTab: SettingsSubTab
): string {
  const group = findActiveGroup(view);
  if (!group.subItems) return group.label;
  const activeSub = group.subItems.find((sub) => {
    if (sub.view !== view) return false;
    if (sub.riskTab) return sub.riskTab === riskTab;
    if (sub.settingsTab) return sub.settingsTab === settingsTab;
    return true;
  });
  return activeSub ? `${group.label} · ${activeSub.label}` : group.label;
}

interface CompactSidebarProps {
  activeView: ViewId;
  riskTab: RiskSubTab;
  settingsTab: SettingsSubTab;
  unreadNotifs: number;
  openOrdersCount: number;
  ownerVerified: boolean;
  mt5Connected: boolean;
  mt5Login: string;
  autoLockMinutes: number;
  mobileMenuOpen: boolean;
  onCloseMobileMenu: () => void;
  onNavigate: (view: ViewId, opts?: { riskTab?: RiskSubTab; settingsTab?: SettingsSubTab }) => void;
  onLockSystem: () => void;
  onLogout: () => void;
}

export const CompactSidebar: React.FC<CompactSidebarProps> = ({
  activeView,
  riskTab,
  settingsTab,
  unreadNotifs,
  openOrdersCount,
  ownerVerified,
  mt5Connected,
  mt5Login,
  autoLockMinutes,
  mobileMenuOpen,
  onCloseMobileMenu,
  onNavigate,
  onLockSystem,
  onLogout,
}) => {
  const [collapsed, setCollapsed] = useState(false);
  const [expandedGroupId, setExpandedGroupId] = useState<string | null>(() => {
    const g = findActiveGroup(activeView);
    return g.subItems ? g.id : null;
  });

  useEffect(() => {
    const g = findActiveGroup(activeView);
    if (g.subItems) {
      setExpandedGroupId(g.id);
    }
  }, [activeView]);

  const isSubActive = (sub: SubNavItem) => {
    if (sub.view !== activeView) return false;
    if (sub.riskTab) return sub.riskTab === riskTab;
    if (sub.settingsTab) return sub.settingsTab === settingsTab;
    return true;
  };

  const handleGroupClick = (group: SidebarGroupItem, isMobile = false) => {
    const alreadyInGroup = group.matchViews.includes(activeView);
    if (group.subItems) {
      if (alreadyInGroup && !collapsed) {
        setExpandedGroupId((prev) => (prev === group.id ? null : group.id));
        return;
      }
      setExpandedGroupId(group.id);
    }
    onNavigate(group.defaultView, {
      riskTab: group.id === 'risk' ? 'portfolio' : undefined,
      settingsTab: group.id === 'settings' ? 'terminal' : undefined,
    });
    if (isMobile) onCloseMobileMenu();
  };

  const handleSubClick = (sub: SubNavItem, isMobile = false) => {
    onNavigate(sub.view, {
      riskTab: sub.riskTab,
      settingsTab: sub.settingsTab,
    });
    if (isMobile) onCloseMobileMenu();
  };

  const renderNavItems = (isCompactIconsOnly: boolean, isMobile = false) => (
    <nav className="px-2 py-2 space-y-0.5 overflow-y-auto flex-1" aria-label="Asosiy navigatsiya">
      {SIDEBAR_GROUPS.map((group) => {
        const Icon = group.icon;
        const isActive = group.matchViews.includes(activeView);
        const hasSubs = Boolean(group.subItems && group.subItems.length > 0);
        const isExpanded = !isCompactIconsOnly && hasSubs && expandedGroupId === group.id;

        return (
          <div key={group.id}>
            <div className="relative flex items-center">
              <button
                type="button"
                onClick={() => handleGroupClick(group, isMobile)}
                title={isCompactIconsOnly ? group.label : undefined}
                className={`group w-full flex items-center ${
                  isCompactIconsOnly ? 'justify-center px-1.5' : 'justify-between px-2.5'
                } py-2 text-[12px] font-medium rounded-lg transition-all whitespace-nowrap cursor-pointer border ${
                  isActive
                    ? 'bg-slate-900 text-white border-slate-800 dark:bg-gradient-to-r dark:from-violet-600/25 dark:to-sky-500/15 dark:text-sky-200 dark:border-violet-400/45 shadow-[0_0_12px_rgba(139,92,246,0.18)]'
                    : 'border-transparent text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-violet-500/10 hover:text-slate-900 dark:hover:text-slate-100'
                }`}
              >
                <span className="flex items-center gap-2 min-w-0">
                  <Icon
                    className={`w-4 h-4 shrink-0 transition-colors ${
                      isActive
                        ? 'text-sky-400'
                        : 'text-slate-400 dark:text-slate-500 group-hover:text-violet-400'
                    }`}
                  />
                  {!isCompactIconsOnly && <span className="truncate">{group.label}</span>}
                </span>

                {!isCompactIconsOnly && (
                  <span className="flex items-center gap-1 shrink-0">
                    {group.id === 'notifications' && unreadNotifs > 0 && (
                      <span className="px-1.5 py-0.5 min-w-[18px] text-center rounded-md text-[10px] font-mono tabular-nums font-bold bg-violet-600 text-white shadow-[0_0_8px_rgba(139,92,246,0.5)]">
                        {unreadNotifs > 99 ? '99+' : unreadNotifs}
                      </span>
                    )}
                    {group.id === 'trading' && openOrdersCount > 0 && (
                      <span className="px-1.5 py-0.5 rounded-md text-[10px] font-mono tabular-nums font-bold bg-sky-500/20 text-sky-400">
                        {openOrdersCount}
                      </span>
                    )}
                    {group.id === 'owner' && ownerVerified && (
                      <ShieldCheck className="w-3.5 h-3.5 text-[#00E5A0]" />
                    )}
                    {hasSubs &&
                      (isExpanded ? (
                        <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
                      ) : (
                        <ChevronRight className="w-3.5 h-3.5 text-slate-500" />
                      ))}
                  </span>
                )}
              </button>

              {isCompactIconsOnly && group.id === 'notifications' && unreadNotifs > 0 && (
                <span className="pointer-events-none absolute top-0.5 right-1 px-1 rounded-full text-[9px] font-mono font-bold bg-violet-600 text-white">
                  {unreadNotifs > 9 ? '9+' : unreadNotifs}
                </span>
              )}
            </div>

            {isExpanded && group.subItems && (
              <div className="mt-0.5 ml-4 pl-2.5 border-l border-slate-200 dark:border-violet-500/25 space-y-0.5 py-0.5">
                {group.subItems.map((sub) => {
                  const subActive = isSubActive(sub);
                  return (
                    <button
                      key={sub.key}
                      type="button"
                      onClick={() => handleSubClick(sub, isMobile)}
                      className={`w-full text-left px-2 py-1.5 text-[11px] rounded-md transition-colors truncate cursor-pointer ${
                        subActive
                          ? 'bg-sky-500/15 text-sky-700 dark:text-sky-300 font-semibold'
                          : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-100/70 dark:hover:bg-violet-500/10'
                      }`}
                    >
                      {sub.label}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </nav>
  );

  return (
    <>
      {/* Desktop Compact Narrow Institutional Sidebar */}
      <aside
        className={`hidden lg:flex shrink-0 flex-col justify-between border-r border-slate-200 dark:border-violet-500/20 bg-white dark:bg-[#080D1B] sticky top-0 h-screen transition-all duration-150 ${
          collapsed ? 'w-[60px]' : 'w-[208px]'
        }`}
      >
        <div className="flex flex-col min-h-0 flex-1">
          <div className="h-12 px-2.5 flex items-center justify-between border-b border-slate-200 dark:border-violet-500/20 shrink-0">
            {!collapsed && (
              <a
                href="#top"
                onClick={(e) => {
                  e.preventDefault();
                  onNavigate('dashboard');
                }}
                className="font-display text-[13px] font-bold tracking-tight text-slate-900 dark:bg-gradient-to-r dark:from-violet-400 dark:via-sky-400 dark:to-[#00E5A0] dark:bg-clip-text dark:text-transparent whitespace-nowrap truncate"
              >
                Trade Killer AI
              </a>
            )}
            <button
              type="button"
              onClick={() => setCollapsed((v) => !v)}
              className="p-1.5 rounded-md text-slate-400 hover:text-sky-400 hover:bg-slate-100 dark:hover:bg-violet-500/10 cursor-pointer mx-auto lg:mx-0"
              aria-label={collapsed ? 'Menyuni kengaytirish' : 'Menyuni ixchamlash'}
              title={collapsed ? 'Menyuni kengaytirish' : 'Ixcham rejim'}
            >
              {collapsed ? <PanelLeftOpen className="w-4 h-4" /> : <PanelLeftClose className="w-4 h-4" />}
            </button>
          </div>

          {renderNavItems(collapsed, false)}
        </div>

        {/* Compact Footer Controls */}
        <div className="p-2 border-t border-slate-200 dark:border-violet-500/20 space-y-1.5 bg-slate-50/70 dark:bg-[#060A15]">
          {!collapsed && (
            <div className="flex items-center justify-between text-[10px] text-slate-500 dark:text-slate-400 px-1 font-mono tabular-nums">
              <span className={mt5Connected ? 'text-[#00E5A0]' : 'text-rose-400'}>
                {mt5Connected ? `MT5 #${mt5Login}` : 'MT5 Uzilgan'}
              </span>
              <span>{autoLockMinutes}m qulf</span>
            </div>
          )}
          <div className={collapsed ? 'flex flex-col gap-1.5' : 'grid grid-cols-2 gap-1.5'}>
            <button
              type="button"
              onClick={onLockSystem}
              title="Qulflash"
              className="flex items-center justify-center gap-1 py-1.5 px-1.5 text-[11px] font-semibold rounded-md border border-violet-500/35 bg-violet-500/10 text-violet-700 dark:text-violet-300 hover:bg-violet-500/20 cursor-pointer whitespace-nowrap"
            >
              <Lock className="w-3.5 h-3.5 shrink-0" />
              {!collapsed && <span>Qulflash</span>}
            </button>
            <button
              type="button"
              onClick={onLogout}
              title="Chiqish"
              className="flex items-center justify-center gap-1 py-1.5 px-1.5 text-[11px] font-semibold rounded-md border border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-sky-400/50 hover:text-white cursor-pointer whitespace-nowrap"
            >
              <LogOut className="w-3.5 h-3.5 shrink-0" />
              {!collapsed && <span>Chiqish</span>}
            </button>
          </div>
        </div>
      </aside>

      {/* Mobile / Tablet Responsive Drawer */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div className="fixed inset-0 bg-black/80 backdrop-blur-xs" onClick={onCloseMobileMenu} />
          <aside className="relative z-10 w-64 max-w-[82vw] bg-white dark:bg-[#080D1B] border-r border-slate-200 dark:border-violet-500/25 flex flex-col justify-between">
            <div className="flex flex-col min-h-0 flex-1">
              <div className="h-12 px-3.5 flex items-center justify-between border-b border-slate-200 dark:border-violet-500/20">
                <span className="font-display text-sm font-bold text-slate-900 dark:bg-gradient-to-r dark:from-violet-400 dark:via-sky-400 dark:to-[#00E5A0] dark:bg-clip-text dark:text-transparent">
                  Trade Killer AI
                </span>
                <button
                  type="button"
                  onClick={onCloseMobileMenu}
                  className="p-1 text-slate-500 hover:text-slate-900 dark:hover:text-white cursor-pointer"
                  aria-label="Menyuni yopish"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              {renderNavItems(false, true)}
            </div>
            <div className="p-3 border-t border-slate-200 dark:border-violet-500/20 grid grid-cols-2 gap-2 bg-slate-50 dark:bg-[#060A15]">
              <button
                type="button"
                onClick={() => {
                  onCloseMobileMenu();
                  onLockSystem();
                }}
                className="py-2 text-xs font-semibold rounded-lg border border-violet-500/40 bg-violet-500/10 text-violet-600 dark:text-violet-300 cursor-pointer"
              >
                Qulflash
              </button>
              <button
                type="button"
                onClick={() => {
                  onCloseMobileMenu();
                  onLogout();
                }}
                className="py-2 text-xs font-semibold rounded-lg border border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-300 cursor-pointer"
              >
                Chiqish
              </button>
            </div>
          </aside>
        </div>
      )}
    </>
  );
};

interface SectionSubNavBarProps {
  activeView: ViewId;
  riskTab: RiskSubTab;
  settingsTab: SettingsSubTab;
  onNavigate: (view: ViewId, opts?: { riskTab?: RiskSubTab; settingsTab?: SettingsSubTab }) => void;
}

export const SectionSubNavBar: React.FC<SectionSubNavBarProps> = ({
  activeView,
  riskTab,
  settingsTab,
  onNavigate,
}) => {
  const group = findActiveGroup(activeView);
  if (!group.subItems || group.subItems.length <= 1) return null;

  const Icon = group.icon;

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 border-b border-slate-200 dark:border-violet-500/20">
      <div className="flex items-center gap-2 text-xs font-semibold text-slate-700 dark:text-slate-200">
        <Icon className="w-4 h-4 text-violet-500 dark:text-violet-400" />
        <span>{group.label}</span>
      </div>

      <div className="flex flex-wrap items-center gap-1 p-0.5 rounded-lg bg-slate-100 dark:bg-[#080D1B] border border-slate-200 dark:border-violet-500/20">
        {group.subItems.map((sub) => {
          const active =
            sub.view === activeView &&
            (!sub.riskTab || sub.riskTab === riskTab) &&
            (!sub.settingsTab || sub.settingsTab === settingsTab);

          return (
            <button
              key={sub.key}
              type="button"
              onClick={() =>
                onNavigate(sub.view, {
                  riskTab: sub.riskTab,
                  settingsTab: sub.settingsTab,
                })
              }
              className={`px-2.5 py-1 text-[11.5px] font-medium rounded-md transition-all whitespace-nowrap cursor-pointer ${
                active
                  ? 'bg-white dark:bg-gradient-to-r dark:from-violet-600/30 dark:to-sky-500/25 text-slate-900 dark:text-sky-200 shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              {sub.label}
            </button>
          );
        })}
      </div>
    </div>
  );
};
