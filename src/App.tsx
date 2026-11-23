import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  BarChart3,
  Bell,
  BookOpen,
  Bot,
  BrainCircuit,
  CalendarDays,
  CandlestickChart,
  Cpu,
  Database,
  Download,
  FlaskConical,
  History,
  Layers,
  ListOrdered,
  Lock,
  LogOut,
  MonitorCheck,
  Moon,
  Network,
  Power,
  Settings,
  ShieldAlert,
  ShieldCheck,
  Sun,
  UserCheck,
  X,
} from 'lucide-react';
import {
  INITIAL_PAIRS,
  INITIAL_POSITIONS,
  INITIAL_RISK_GUARD,
  INITIAL_SERVER_CONFIG,
  INITIAL_STRATEGIES,
  formatCurrency,
  formatPrice,
} from './config/initialData';
import {
  AiRecommendation,
  AiScanSignal,
  AuthSessionState,
  BacktestParams,
  BacktestStrategyId,
  CandlePoint,
  ControlStateRecord,
  DiagnosticBlocker,
  EngineMetricsRecord,
  ExecutionLogEntry,
  InstrumentAnalysisSnapshot,
  LearningOutcome,
  LearningRecord,
  LiveSystemStatusSnapshot,
  MarketPair,
  NotificationCategory,
  NotificationPriority,
  Position,
  RiskGuardSettings,
  ServerConfig,
  StrategyBrainSnapshot,
  StrategyConfig,
  StrategyRegistryRecord,
  SystemNotificationRecord,
  Timeframe,
  TradingStyle,
  ViewId,
} from './types/trading';
import { PriceChart } from './components/PriceChart';
import { PositionsTable } from './components/PositionsTable';
import { ScannerView } from './components/ScannerView';
import { ServerBridgeView } from './components/ServerBridgeView';
import { AiTradingPanel } from './components/AiTradingPanel';
import { BacktestView } from './components/BacktestView';
import { AnalystHubView } from './components/AnalystHubView';
import { PinLoginScreen } from './components/PinLoginScreen';
import { StrategyRegistryView } from './components/StrategyRegistryView';
import { HistoricalMemoryView } from './components/HistoricalMemoryView';
import { AutoTradingView } from './components/AutoTradingView';
import { AutonomousDiagnosticsPanel } from './components/AutonomousDiagnosticsPanel';
import { NotificationsView } from './components/NotificationsView';
import { OwnerCenterView } from './components/OwnerCenterView';
import { LearningHistoryView } from './components/LearningHistoryView';
import { TopTerminalBar } from './components/TopTerminalBar';
import { AiBrainStrip } from './components/AiBrainStrip';
import { LiveSignalRail } from './components/LiveSignalRail';
import { DashboardBottomGrid } from './components/DashboardBottomGrid';
import { StrategyEnsembleView } from './components/StrategyEnsembleView';
import { MultiOrderManagerView } from './components/MultiOrderManagerView';
import { ResearchKnowledgeView } from './components/ResearchKnowledgeView';
import { EconomicCalendarView } from './components/EconomicCalendarView';
import { SystemMonitorView } from './components/SystemMonitorView';
import { buildStandaloneIndexHtml } from './utils/standaloneHtmlExporter';
import { generateMt5Candles } from './utils/backtestEngine';
import { analyzeStrategyBrain, StrategyBrainAnalysis } from './utils/strategyBrain';
import { runIntelligentDecision } from './utils/decisionEngine';
import {
  createLearningRecordFromDecision,
  loadLearningJournal,
  resolveLearningRecord,
  saveLearningJournal,
  summarizeLearningPerformance,
  syncClosedPositionsToJournal,
} from './utils/learningEngine';
import {
  apiJson,
  registerUnauthorizedHandler,
  setAuthSessionMemory,
} from './utils/apiClient';

const NAV_ITEMS: { id: ViewId; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: 'dashboard', label: 'Dashboard', icon: BarChart3 },
  { id: 'analyst', label: 'AI Analitik', icon: BrainCircuit },
  { id: 'scanner', label: '24/7 Skaner', icon: Activity },
  { id: 'strategies', label: 'Strategiya Markazi', icon: Cpu },
  { id: 'ensemble', label: 'Strategiya Ansambli', icon: Network },
  { id: 'candlesticks', label: 'Sham Intellekti', icon: CandlestickChart },
  { id: 'smc', label: 'Smart Money', icon: Layers },
  { id: 'memory', label: 'Tarixiy Xotira', icon: Database },
  { id: 'backtest', label: 'Backtest Lab', icon: History },
  { id: 'research', label: 'AI Tadqiqot Lab', icon: FlaskConical },
  { id: 'autotrading', label: 'Avto-Savdo', icon: Bot },
  { id: 'multiorder', label: 'Multi-Order Manager', icon: ListOrdered },
  { id: 'risk', label: 'Risk Menejeri', icon: ShieldAlert },
  { id: 'calendar', label: 'Iqtisodiy Taqvim', icon: CalendarDays },
  { id: 'journal', label: 'Savdo Jurnali', icon: BookOpen },
  { id: 'monitor', label: 'Tizim Monitori', icon: MonitorCheck },
  { id: 'notifications', label: 'Bildirishnomalar', icon: Bell },
  { id: 'owner', label: 'Owner Markazi', icon: UserCheck },
  { id: 'settings', label: 'Sozlamalar', icon: Settings },
];

export default function App() {
  const [darkMode, setDarkMode] = useState(true);
  const [authSession, setAuthSession] = useState<AuthSessionState | null>(null);
  const [lockMessage, setLockMessage] = useState<string | null>(null);

  const [activeView, setActiveView] = useState<ViewId>('dashboard');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Live backend status, registry, notifications
  const [systemStatus, setSystemStatus] = useState<LiveSystemStatusSnapshot | null>(null);
  const [strategyRegistry, setStrategyRegistry] = useState<StrategyRegistryRecord[]>([]);
  const [notifications, setNotifications] = useState<SystemNotificationRecord[]>([]);
  const [controlBusy, setControlBusy] = useState<string | null>(null);
  const [controlFeedback, setControlFeedback] = useState<string | null>(null);

  // Trading terminal state
  const [pairs, setPairs] = useState<MarketPair[]>(INITIAL_PAIRS);
  const [selectedSymbol, setSelectedSymbol] = useState<string>(INITIAL_PAIRS[0].symbol);
  const [tradingStyle, setTradingStyle] = useState<TradingStyle>('SCALPING');
  const [positions, setPositions] = useState<Position[]>(INITIAL_POSITIONS);
  const [strategies, setStrategies] = useState<StrategyConfig[]>(INITIAL_STRATEGIES);
  const [riskGuard, setRiskGuard] = useState<RiskGuardSettings>(INITIAL_RISK_GUARD);
  const [serverConfig, setServerConfig] = useState<ServerConfig>(INITIAL_SERVER_CONFIG);

  const [baseBalance, setBaseBalance] = useState<number>(24500);
  const [mt5Account, setMt5Account] = useState<{
    login: number;
    server: string;
    balance: number;
    equity: number;
    marginFree: number;
    profit: number;
    realizedToday: number;
    tradeMode?: 'DEMO' | 'REAL' | 'CONTEST' | 'SIMULATED';
    tradeAllowed?: boolean;
    investorReadOnly?: boolean;
  } | null>(null);
  const [mt5Connected, setMt5Connected] = useState<boolean>(false);
  const [mt5SyncStatus, setMt5SyncStatus] = useState<
    'connecting' | 'connected' | 'https_blocked' | 'offline' | 'mt5_error'
  >('connecting');
  const [mt5ErrorDetail, setMt5ErrorDetail] = useState<string>('');
  const [showConnectionNotice, setShowConnectionNotice] = useState<boolean>(true);
  const [syncTrigger, setSyncTrigger] = useState<number>(0);
  const [liveTicks, setLiveTicks] = useState<boolean>(true);
  const [fullAiPermissions, setFullAiPermissions] = useState<boolean>(false);
  const [killModalOpen, setKillModalOpen] = useState<boolean>(false);
  const [aiBacktestTrigger, setAiBacktestTrigger] = useState<Partial<BacktestParams> | null>(null);
  const [chartBrainSnapshot, setChartBrainSnapshot] = useState<StrategyBrainSnapshot | null>(null);
  const [chartBrainAnalysis, setChartBrainAnalysis] = useState<StrategyBrainAnalysis | null>(null);
  const [activeTimeframe, setActiveTimeframe] = useState<Timeframe>('M5');
  const [liveCandles, setLiveCandles] = useState<CandlePoint[]>([]);
  const [mtfCandlesByTf, setMtfCandlesByTf] = useState<Partial<Record<Timeframe, CandlePoint[]>>>({});
  const [learningJournal, setLearningJournal] = useState<LearningRecord[]>(() => loadLearningJournal());

  // Autonomous AI Engine & LLM live feedback state
  const [aiEngineBusy, setAiEngineBusy] = useState<boolean>(false);
  const [lastAiBriefUz, setLastAiBriefUz] = useState<string | null>(null);
  const [lastAiProvider, setLastAiProvider] = useState<string | null>(null);
  const [lastAiError, setLastAiError] = useState<string | null>(null);

  // Refs for deduplicating live event notifications, idle timeout, and autonomous throttling
  const lastActivityRef = useRef<number>(Date.now());
  const prevMt5ConnectedRef = useRef<boolean | null>(null);
  const lastEventKeyRef = useRef<string>('');
  const lastLlmRunRef = useRef<number>(0);
  const engineRunningRef = useRef<boolean>(false);

  const handleStyleChange = (style: TradingStyle) => {
    setTradingStyle(style);
    setActiveTimeframe(style === 'SCALPING' ? 'M5' : 'H4');
  };

  useEffect(() => {
    const root = document.documentElement;
    if (darkMode) {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
  }, [darkMode]);

  const clearClientSession = useCallback((reason?: string) => {
    setAuthSessionMemory(null);
    setAuthSession(null);
    setSystemStatus(null);
    setLockMessage(reason ?? null);
  }, []);

  useEffect(() => {
    registerUnauthorizedHandler(() => {
      clearClientSession('Sessiya muddati tugadi yoki qulflandi. Qayta PIN kiriting.');
    });
    return () => registerUnauthorizedHandler(null);
  }, [clearClientSession]);

  const handleAuthenticated = useCallback((session: AuthSessionState) => {
    setAuthSessionMemory(session);
    setAuthSession(session);
    setLockMessage(null);
    lastActivityRef.current = Date.now();
  }, []);

  const handleLockSystem = useCallback(async (reason?: string) => {
    try {
      await apiJson('/api/auth/lock', { method: 'POST' });
    } catch {
      // Ignore network errors on lock
    }
    clearClientSession(reason ?? 'Tizim qo‘lda qulflandi. Davom etish uchun 4-xonali PIN kiriting.');
  }, [clearClientSession]);

  const handleLogout = useCallback(async () => {
    try {
      await apiJson('/api/auth/logout', { method: 'POST' });
    } catch {
      // Ignore network errors on logout
    }
    clearClientSession('Tizimdan xavfsiz chiqildi.');
  }, [clearClientSession]);

  // Automatic idle session lock
  useEffect(() => {
    if (!authSession) return;
    const touchActivity = () => {
      lastActivityRef.current = Date.now();
    };
    const events: (keyof WindowEventMap)[] = ['mousedown', 'keydown', 'touchstart', 'scroll'];
    events.forEach((ev) => window.addEventListener(ev, touchActivity, { passive: true }));

    const timer = window.setInterval(() => {
      const limitMs = Math.max(1, authSession.autoLockMinutes) * 60 * 1000;
      if (Date.now() - lastActivityRef.current >= limitMs) {
        void handleLockSystem(
          `Harakatsizlik sababli (${authSession.autoLockMinutes} daqiqa) sessiya avtomatik qulflandi.`
        );
      }
    }, 10000);

    return () => {
      events.forEach((ev) => window.removeEventListener(ev, touchActivity));
      window.clearInterval(timer);
    };
  }, [authSession, handleLockSystem]);

  // Backend live sync (system status, strategy registry, notifications)
  const refreshBackendState = useCallback(async () => {
    if (!authSession) return;
    try {
      const [statusData, regData, notifData] = await Promise.all([
        apiJson<LiveSystemStatusSnapshot>('/api/system/status'),
        apiJson<{ strategies: StrategyRegistryRecord[] }>('/api/registry/strategies'),
        apiJson<{ notifications: SystemNotificationRecord[] }>('/api/notifications'),
      ]);
      setSystemStatus(statusData);
      setStrategyRegistry(regData.strategies);
      setNotifications(notifData.notifications);
    } catch {
      // Handled by apiFetch 401 handler if session expired
    }
  }, [authSession]);

  useEffect(() => {
    if (!authSession) return;
    void refreshBackendState();
    const timer = window.setInterval(() => {
      void refreshBackendState();
    }, 6000);
    return () => window.clearInterval(timer);
  }, [authSession, refreshBackendState]);

  const pushSystemEvent = useCallback(
    async (
      priority: NotificationPriority,
      category: NotificationCategory,
      title: string,
      message: string,
      symbol?: string
    ) => {
      if (!authSession) return;
      try {
        await apiJson('/api/notifications', {
          method: 'POST',
          body: JSON.stringify({ priority, category, title, message, symbol }),
        });
      } catch {
        // Non-blocking notification failure
      }
    },
    [authSession]
  );

  const runSystemControl = useCallback(
    async (
      action:
        | 'STOP_NEW_TRADES'
        | 'RESUME_NEW_TRADES'
        | 'PAUSE_SCANNER'
        | 'RESUME_SCANNER'
        | 'DISABLE_AUTO_TRADING'
    ) => {
      setControlBusy(action);
      setControlFeedback(null);
      try {
        await apiJson('/api/system/control', {
          method: 'POST',
          body: JSON.stringify({ action }),
        });
        if (action === 'DISABLE_AUTO_TRADING' || action === 'STOP_NEW_TRADES') {
          setFullAiPermissions(false);
        }
        await refreshBackendState();
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Boshqaruv buyrug‘ida xatolik.';
        setControlFeedback(msg);
        window.setTimeout(() => setControlFeedback(null), 5000);
      } finally {
        setControlBusy(null);
      }
    },
    [refreshBackendState]
  );

  const applyServerSnapshot = (data: {
    account?: {
      login?: number;
      server?: string;
      balance?: number;
      equity?: number;
      margin_free?: number;
      profit?: number;
      realizedToday?: number;
      tradeMode?: string;
      tradeAllowed?: boolean;
      investorReadOnly?: boolean;
    };
    pairs?: MarketPair[];
    positions?: Position[];
  }) => {
    if (data.account) {
      const bal = Number(data.account.balance ?? 0);
      const eq = Number(data.account.equity ?? bal);
      const mf = Number(data.account.margin_free ?? bal);
      const prof = Number(data.account.profit ?? 0);
      const realToday = Number(data.account.realizedToday ?? 0);
      const rawMode = String(data.account.tradeMode ?? 'DEMO').toUpperCase();
      const tradeMode: 'DEMO' | 'REAL' | 'CONTEST' | 'SIMULATED' =
        rawMode === 'REAL' || rawMode === 'CONTEST' || rawMode === 'DEMO'
          ? rawMode
          : 'DEMO';
      setMt5Account({
        login: Number(data.account.login ?? 0),
        server: String(data.account.server ?? ''),
        balance: bal,
        equity: eq,
        marginFree: mf,
        profit: prof,
        realizedToday: realToday,
        tradeMode,
        tradeAllowed: data.account.tradeAllowed ?? true,
        investorReadOnly: Boolean(data.account.investorReadOnly),
      });
      setBaseBalance(bal);
      if (data.account.login) {
        setServerConfig((prev) =>
          prev.mt5Login === String(data.account?.login)
            ? prev
            : {
                ...prev,
                mt5Login: String(data.account?.login),
                mt5Server: data.account?.server || prev.mt5Server,
              }
        );
      }
    }
    if (Array.isArray(data.pairs) && data.pairs.length > 0) {
      const normalizedPairs: MarketPair[] = data.pairs.map((incoming) => ({
        ...incoming,
        base: incoming.base || incoming.symbol.slice(0, 3),
        quote: incoming.quote || incoming.symbol.slice(3) || 'USD',
        change24h: incoming.change24h ?? 0,
        high24h: incoming.high24h ?? incoming.price,
        low24h: incoming.low24h ?? incoming.price,
        volume24h: incoming.volume24h ?? 0,
        rsi14: incoming.rsi14 ?? 50,
        trend: incoming.trend ?? ('Yonlama' as const),
        contractSize: incoming.contractSize ?? 100,
      }));
      setPairs(normalizedPairs);
      setSelectedSymbol((curr) => {
        if (normalizedPairs.some((p) => p.symbol === curr)) return curr;
        const prefixMatch = normalizedPairs.find((p) =>
          p.symbol.toUpperCase().startsWith(curr.toUpperCase())
        );
        return prefixMatch ? prefixMatch.symbol : normalizedPairs[0].symbol;
      });
    }
    if (Array.isArray(data.positions)) {
      setPositions(data.positions);
    }
  };

  // Live poll real MetaTrader 5 account balance, equity, tick prices, and positions
  useEffect(() => {
    if (!authSession) return;
    if (!serverConfig.autoSyncMt5) {
      setMt5Connected(false);
      setMt5SyncStatus('offline');
      return;
    }
    let cancelled = false;
    const syncOnce = async () => {
      const primaryBase = serverConfig.apiBaseUrl.replace(/\/$/, '');
      const candidates =
        primaryBase === 'http://127.0.0.1:8000'
          ? [primaryBase, 'http://localhost:8000']
          : [primaryBase];

      let lastReason: 'https_blocked' | 'offline' | 'mt5_error' = 'offline';
      let lastDetail = '';

      for (const base of candidates) {
        try {
          const controller = new AbortController();
          const timeout = window.setTimeout(() => controller.abort(), 1600);
          const res = await fetch(`${base}/api/status`, { signal: controller.signal });
          window.clearTimeout(timeout);
          if (!res.ok) {
            let errText = `HTTP ${res.status}`;
            try {
              const errJson = await res.json();
              if (errJson?.detail) errText = String(errJson.detail);
            } catch {
              // ignore non-JSON body
            }
            lastReason = 'mt5_error';
            lastDetail = errText;
            continue;
          }
          const json = await res.json();
          if (!cancelled && json && json.account) {
            setMt5Connected(true);
            setMt5SyncStatus('connected');
            setMt5ErrorDetail('');
            applyServerSnapshot(json);
            return;
          }
        } catch {
          if (typeof window !== 'undefined' && window.location.protocol === 'https:' && base.startsWith('http://')) {
            lastReason = 'https_blocked';
          }
        }
      }

      if (!cancelled) {
        setMt5Connected(false);
        setMt5Account(null);
        setMt5SyncStatus(lastReason);
        setMt5ErrorDetail(lastDetail);
      }
    };
    void syncOnce();
    const timer = window.setInterval(syncOnce, Math.max(1500, serverConfig.pollingIntervalMs || 2000));
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [authSession, serverConfig.apiBaseUrl, serverConfig.autoSyncMt5, serverConfig.pollingIntervalMs, syncTrigger]);

  // Notify on MT5 connection / disconnection transitions
  useEffect(() => {
    if (!authSession) return;
    if (prevMt5ConnectedRef.current === null) {
      prevMt5ConnectedRef.current = mt5Connected;
      return;
    }
    if (prevMt5ConnectedRef.current !== mt5Connected) {
      prevMt5ConnectedRef.current = mt5Connected;
      if (mt5Connected) {
        void pushSystemEvent(
          'NORMAL',
          'MT5',
          'MetaTrader 5 Bridge ulandi',
          `MT5 hisob #${serverConfig.mt5Login} bilan jonli sinxronizatsiya faol.`
        );
      } else {
        void pushSystemEvent(
          'CRITICAL',
          'MT5',
          'MT5 ulanishi uzildi',
          'Lokal MT5 Bridge javob bermayapti. Demo kuzatuv rejimiga o‘tildi.'
        );
      }
    }
  }, [authSession, mt5Connected, pushSystemEvent, serverConfig.mt5Login]);

  // Continuous multi-instrument analysis & autonomous execution loop is mounted below after execution handlers.

  useEffect(() => {
    if (!authSession || !liveTicks || mt5Connected) return;
    const timer = window.setInterval(() => {
      setPairs((prevPairs) => {
        const nextPairs = prevPairs.map((pair) => {
          const jitter = (Math.random() - 0.495) * pair.price * 0.0009;
          const nextPrice = Math.max(
            0.0001,
            Number((pair.price + jitter).toFixed(pair.price >= 100 ? 2 : 4))
          );
          return { ...pair, price: nextPrice };
        });

        setPositions((prevPos) =>
          prevPos.map((pos) => {
            if (pos.status === 'CLOSED') return pos;
            const matched = nextPairs.find((p) => p.symbol === pos.symbol);
            return matched ? { ...pos, markPrice: matched.price } : pos;
          })
        );

        return nextPairs;
      });
    }, 2400);

    return () => window.clearInterval(timer);
  }, [authSession, liveTicks, mt5Connected]);

  const activePair = useMemo(
    () => pairs.find((p) => p.symbol === selectedSymbol) ?? pairs[0],
    [pairs, selectedSymbol]
  );

  // Sync closed MT5/local trades into the AI learning journal automatically
  useEffect(() => {
    setLearningJournal((prev) => syncClosedPositionsToJournal(prev, positions));
  }, [positions]);

  // Fetch multi-timeframe MT5 candles when local bridge is connected
  useEffect(() => {
    if (!authSession || !mt5Connected) {
      setMtfCandlesByTf({});
      return;
    }
    let cancelled = false;
    const loadMtf = async () => {
      const base = serverConfig.apiBaseUrl.replace(/\/$/, '');
      try {
        const controller = new AbortController();
        const timeout = window.setTimeout(() => controller.abort(), 2200);
        const res = await fetch(
          `${base}/api/mtf?symbol=${encodeURIComponent(selectedSymbol)}&count=120`,
          { signal: controller.signal }
        );
        window.clearTimeout(timeout);
        if (!res.ok) return;
        const json = await res.json();
        const tfMap = json?.candlesByTf ?? json?.timeframes;
        if (!cancelled && tfMap && typeof tfMap === 'object') {
          setMtfCandlesByTf(tfMap as Partial<Record<Timeframe, CandlePoint[]>>);
        }
      } catch {
        // Fallback to client MTF derivation when /api/mtf isn't running
      }
    };
    void loadMtf();
    const timer = window.setInterval(loadMtf, 15000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [authSession, mt5Connected, selectedSymbol, serverConfig.apiBaseUrl]);

  const allPairBrains = useMemo(() => {
    const tf: Timeframe = activeTimeframe;
    return pairs.map((pair) => {
      if (chartBrainSnapshot && chartBrainSnapshot.symbol === pair.symbol && chartBrainSnapshot.timeframe === tf) {
        return chartBrainSnapshot;
      }
      const candles = generateMt5Candles(pair.symbol, pair.price, tf, 140);
      return analyzeStrategyBrain(candles, pair.symbol, tf).snapshot;
    });
  }, [pairs, activeTimeframe, chartBrainSnapshot]);

  const activeBrain = useMemo(
    () =>
      chartBrainSnapshot && chartBrainSnapshot.symbol === selectedSymbol
        ? chartBrainSnapshot
        : allPairBrains.find((b) => b.symbol === selectedSymbol) ?? allPairBrains[0] ?? null,
    [chartBrainSnapshot, allPairBrains, selectedSymbol]
  );

  const learningSummary = useMemo(
    () => summarizeLearningPerformance(learningJournal),
    [learningJournal]
  );

  const metrics = useMemo(() => {
    if (mt5Connected && mt5Account) {
      const openCount = positions.filter((p) => p.status === 'OPEN').length;
      return {
        totalEquity: mt5Account.equity,
        availableBalance: mt5Account.marginFree,
        openPnl: mt5Account.profit,
        realizedToday: mt5Account.realizedToday,
        openCount,
      };
    }

    let openPnl = 0;
    let realizedToday = 0;
    let usedMargin = 0;
    let openCount = 0;

    for (const pos of positions) {
      if (pos.status === 'OPEN') {
        openCount += 1;
        usedMargin += pos.sizeUsdt / Math.max(1, pos.leverage);
        const diff =
          pos.side === 'LONG'
            ? (pos.markPrice - pos.entryPrice) / pos.entryPrice
            : (pos.entryPrice - pos.markPrice) / pos.entryPrice;
        openPnl += pos.sizeUsdt * diff;
      } else if (pos.status === 'CLOSED' && pos.realizedPnl !== undefined) {
        realizedToday += pos.realizedPnl;
      }
    }

    const totalEquity = baseBalance + openPnl;
    const availableBalance = Math.max(0, baseBalance - usedMargin);

    return {
      totalEquity,
      availableBalance,
      openPnl,
      realizedToday,
      openCount,
    };
  }, [positions, baseBalance, mt5Connected, mt5Account]);

  const activeCandles = useMemo(() => {
    if (liveCandles.length >= 30 && chartBrainSnapshot?.symbol === activePair.symbol && chartBrainSnapshot?.timeframe === activeTimeframe) {
      return liveCandles;
    }
    return generateMt5Candles(activePair.symbol, activePair.price, activeTimeframe, 160);
  }, [liveCandles, chartBrainSnapshot?.symbol, chartBrainSnapshot?.timeframe, activePair.symbol, activePair.price, activeTimeframe]);

  const decisionReport = useMemo(() => {
    const matchedAnalysis =
      chartBrainAnalysis &&
      chartBrainAnalysis.snapshot.symbol === activePair.symbol &&
      chartBrainAnalysis.snapshot.timeframe === activeTimeframe
        ? chartBrainAnalysis
        : undefined;
    return runIntelligentDecision({
      pair: activePair,
      timeframe: activeTimeframe,
      candles: activeCandles,
      brainAnalysis: matchedAnalysis,
      candlesByTf: mtfCandlesByTf,
      equity: metrics.totalEquity,
      riskGuard,
      openPositionsCount: metrics.openCount,
      realizedTodayUsd: metrics.realizedToday,
      calibratedSampleCount: learningSummary.resolvedCount,
      calibratedWinRatePct: learningSummary.overallWinRatePct,
    });
  }, [
    activePair,
    activeTimeframe,
    activeCandles,
    chartBrainAnalysis,
    mtfCandlesByTf,
    metrics.totalEquity,
    metrics.openCount,
    metrics.realizedToday,
    riskGuard,
    learningSummary.resolvedCount,
    learningSummary.overallWinRatePct,
  ]);

  // Log strong BUY/SELL setup, breakout, or liquidity sweep into Permanent Monitoring & Local Memory
  useEffect(() => {
    if (!authSession || systemStatus?.control.scannerStatus === 'PAUSED') return;
    const act = decisionReport.finalAction;
    const sweep = activeBrain?.smcDeep?.recentSweep ?? 'YO‘Q';
    const breakout = activeBrain?.chartPatternReport?.confirmedBreakoutCount ?? 0;
    const key = `${decisionReport.symbol}|${decisionReport.timeframe}|${act}|${sweep}|${breakout}`;
    if (key === lastEventKeyRef.current) return;

    if ((act === 'BUY' || act === 'SELL') && decisionReport.analyticalScore >= 65) {
      lastEventKeyRef.current = key;
      void pushSystemEvent(
        'HIGH',
        'SETUP',
        `Kuchli ${act} setup: ${decisionReport.symbol} (${decisionReport.timeframe})`,
        `Tahliliy ball: ${decisionReport.analyticalScore}/100 · Rejim: ${decisionReport.regime.labelUz}. SL: ${formatPrice(decisionReport.riskEvaluation.dynamicStopLoss)}, TP: ${formatPrice(decisionReport.riskEvaluation.takeProfit)}.`,
        decisionReport.symbol
      );
      void apiJson('/api/memory/log-analysis', {
        method: 'POST',
        body: JSON.stringify({
          symbol: decisionReport.symbol,
          timeframe: decisionReport.timeframe,
          action: act,
          analyticalScore: decisionReport.analyticalScore,
          regime: decisionReport.regime.regime,
          summaryUz: decisionReport.explanationUz,
        }),
      }).catch(() => {});
    } else if (sweep !== 'YO‘Q') {
      lastEventKeyRef.current = key;
      void pushSystemEvent(
        'HIGH',
        'SWEEP',
        `Liquidity Sweep aniqlandi: ${decisionReport.symbol}`,
        `${sweep} · Zona: ${activeBrain?.smcDeep?.zone ?? 'Equilibrium'} · Tuzilma: ${activeBrain?.smcDeep?.lastBosOrChoch ?? '—'}.`,
        decisionReport.symbol
      );
    } else if (breakout > 0) {
      lastEventKeyRef.current = key;
      void pushSystemEvent(
        'HIGH',
        'BREAKOUT',
        `Grafik Breakout tasdiqlandi: ${decisionReport.symbol}`,
        `${activeBrain?.chartPatternReport?.activePattern?.name ?? 'Chart pattern'} breakout bosqichiga o‘tdi.`,
        decisionReport.symbol
      );
    }
  }, [
    authSession,
    systemStatus?.control.scannerStatus,
    decisionReport,
    activeBrain,
    pushSystemEvent,
  ]);

  const handleLogCurrentDecision = () => {
    const latestPat =
      activeBrain?.candlestickReport?.latestConfirmedPattern?.patternName ??
      activeBrain?.candlestickReport?.latestActivePattern?.patternName ??
      'Standart sham';
    const record = createLearningRecordFromDecision(decisionReport, latestPat, activePair.price);
    setLearningJournal((prev) => {
      const next = [record, ...prev];
      saveLearningJournal(next);
      return next;
    });
    void apiJson('/api/memory/log-analysis', {
      method: 'POST',
      body: JSON.stringify({
        symbol: decisionReport.symbol,
        timeframe: decisionReport.timeframe,
        action: decisionReport.finalAction,
        analyticalScore: decisionReport.analyticalScore,
        regime: decisionReport.regime.regime,
        summaryUz: decisionReport.explanationUz,
      }),
    }).catch(() => {});
  };

  const handleResolveLearningRecord = (id: string, outcome: LearningOutcome, pnlUsd: number) => {
    setLearningJournal((prev) => resolveLearningRecord(prev, id, outcome, pnlUsd));
  };

  const handleClearLearningJournal = () => {
    saveLearningJournal([]);
    setLearningJournal([]);
  };

  const refreshMt5Now = async () => {
    try {
      const base = serverConfig.apiBaseUrl.replace(/\/$/, '');
      const res = await fetch(`${base}/api/status`);
      if (res.ok) {
        const json = await res.json();
        applyServerSnapshot(json);
      }
    } catch {
      // Ignore transient bridge errors
    }
  };

  const tradingBlocked = Boolean(systemStatus?.control.stopNewTrades);

  const getCurrentAccountMode = (): 'MT5_DEMO' | 'MT5_REAL' | 'SIMULATED_DEMO' => {
    if (!mt5Connected) return 'SIMULATED_DEMO';
    return mt5Account?.tradeMode === 'REAL' ? 'MT5_REAL' : 'MT5_DEMO';
  };

  const recordEngineExecution = async (payload: {
    type: 'ORDER_SENT' | 'ORDER_REJECTED' | 'SL_TP_MODIFIED' | 'BREAK_EVEN' | 'TRAILING_STOP' | 'AI_CLOSED';
    symbol: string;
    side?: 'LONG' | 'SHORT';
    positionId?: string;
    lotSize?: number;
    entryPrice?: number;
    stopLoss?: number | null;
    takeProfit?: number | null;
    pnlUsd?: number;
    signalHash?: string;
    source: 'AI_LLM' | 'ENSEMBLE_ENGINE' | 'OWNER';
    reasonUz: string;
    brokerMessage?: string;
  }) => {
    if (!authSession) return;
    try {
      const res = await apiJson<{
        ok: boolean;
        engineMetrics?: EngineMetricsRecord;
        executionLogs?: ExecutionLogEntry[];
      }>('/api/engine/record-execution', {
        method: 'POST',
        body: JSON.stringify({
          ...payload,
          accountMode: getCurrentAccountMode(),
        }),
      });
      if (res.engineMetrics || res.executionLogs) {
        setSystemStatus((prev) =>
          prev
            ? {
                ...prev,
                engineMetrics: res.engineMetrics ?? prev.engineMetrics,
                executionLogs: res.executionLogs ?? prev.executionLogs,
              }
            : prev
        );
      }
    } catch {
      // Non-blocking audit persistence error
    }
  };

  const executeVerifiedOrder = async (
    order: Omit<Position, 'id' | 'openedAt'>,
    meta?: {
      source?: 'AI_LLM' | 'ENSEMBLE_ENGINE' | 'OWNER';
      signalHash?: string;
      reasonUz?: string;
    }
  ): Promise<{ ok: boolean; positionId?: string; brokerMessage?: string }> => {
    const source = meta?.source ?? 'OWNER';
    const reasonUz = meta?.reasonUz ?? `${order.lotSize} lot @ ${formatPrice(order.entryPrice)} (${order.strategyName})`;

    if (tradingBlocked) {
      setControlFeedback('STOP NEW TRADES faol — yangi buyurtma bloklandi.');
      window.setTimeout(() => setControlFeedback(null), 4000);
      await recordEngineExecution({
        type: 'ORDER_REJECTED',
        symbol: order.symbol,
        side: order.side,
        lotSize: order.lotSize,
        entryPrice: order.entryPrice,
        stopLoss: order.stopLoss,
        takeProfit: order.takeProfit,
        source,
        reasonUz: 'STOP NEW TRADES blokirovkasi faol.',
        brokerMessage: 'TRADING_PERMISSION_DISABLED',
      });
      return { ok: false, brokerMessage: 'STOP NEW TRADES faol' };
    }

    if (mt5Connected && (mt5Account?.investorReadOnly || mt5Account?.tradeAllowed === false)) {
      const msg = 'MT5 hisob faqat o‘qish rejimida (Investor/Read-Only) — buyurtma rad etildi.';
      setControlFeedback(msg);
      window.setTimeout(() => setControlFeedback(null), 5000);
      await recordEngineExecution({
        type: 'ORDER_REJECTED',
        symbol: order.symbol,
        side: order.side,
        lotSize: order.lotSize,
        entryPrice: order.entryPrice,
        stopLoss: order.stopLoss,
        takeProfit: order.takeProfit,
        source,
        reasonUz: msg,
        brokerMessage: 'ACCOUNT_READ_ONLY',
      });
      return { ok: false, brokerMessage: msg };
    }

    if (mt5Connected) {
      const base = serverConfig.apiBaseUrl.replace(/\/$/, '');
      try {
        const res = await fetch(`${base}/api/orders`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            symbol: order.symbol,
            side: order.side,
            lotSize: order.lotSize,
            stopLoss: order.stopLoss,
            takeProfit: order.takeProfit,
          }),
        });
        let json: Record<string, unknown> = {};
        try {
          json = (await res.json()) as Record<string, unknown>;
        } catch {
          // non-JSON response
        }

        if (!res.ok) {
          const brokerErr = String(json?.detail || json?.error || `MT5 HTTP ${res.status}`);
          setControlFeedback(`Broker buyurtmani rad etdi (${order.symbol}): ${brokerErr}`);
          window.setTimeout(() => setControlFeedback(null), 6000);
          await recordEngineExecution({
            type: 'ORDER_REJECTED',
            symbol: order.symbol,
            side: order.side,
            lotSize: order.lotSize,
            entryPrice: order.entryPrice,
            stopLoss: order.stopLoss,
            takeProfit: order.takeProfit,
            source,
            reasonUz,
            brokerMessage: brokerErr,
          });
          return { ok: false, brokerMessage: brokerErr };
        }

        const ticketId = String(json?.ticket ?? json?.order ?? `MT5-${Date.now()}`);
        await refreshMt5Now();
        await recordEngineExecution({
          type: 'ORDER_SENT',
          symbol: order.symbol,
          side: order.side,
          positionId: ticketId,
          lotSize: order.lotSize,
          entryPrice: order.entryPrice,
          stopLoss: order.stopLoss,
          takeProfit: order.takeProfit,
          signalHash: meta?.signalHash,
          source,
          reasonUz,
          brokerMessage: `MT5 Ticket #${ticketId}`,
        });
        void pushSystemEvent(
          source === 'OWNER' ? 'NORMAL' : 'HIGH',
          'POSITION',
          `${source === 'OWNER' ? 'Yangi' : 'Avto-AI'} ${order.side === 'LONG' ? 'BUY' : 'SELL'}: ${order.symbol}`,
          `${order.lotSize} lot @ ${formatPrice(order.entryPrice)} · SL: ${order.stopLoss ? formatPrice(order.stopLoss) : '—'} · TP: ${order.takeProfit ? formatPrice(order.takeProfit) : '—'} (${order.strategyName}).`,
          order.symbol
        );
        void apiJson('/api/memory/log-signal', {
          method: 'POST',
          body: JSON.stringify({
            symbol: order.symbol,
            timeframe: activeTimeframe,
            direction: order.side === 'LONG' ? 'BUY' : 'SELL',
            strategyName: order.strategyName,
            entryPrice: order.entryPrice,
            stopLoss: order.stopLoss ?? 0,
            takeProfit: order.takeProfit ?? 0,
            outcome: 'PENDING',
            pnlUsd: 0,
          }),
        }).catch(() => {});
        return { ok: true, positionId: ticketId };
      } catch (err) {
        const brokerErr = err instanceof Error ? err.message : 'MT5 Bridge ulanish xatosi';
        await recordEngineExecution({
          type: 'ORDER_REJECTED',
          symbol: order.symbol,
          side: order.side,
          lotSize: order.lotSize,
          entryPrice: order.entryPrice,
          stopLoss: order.stopLoss,
          takeProfit: order.takeProfit,
          source,
          reasonUz: 'MT5 Bridge bilan aloqa uzildi.',
          brokerMessage: brokerErr,
        });
        return { ok: false, brokerMessage: brokerErr };
      }
    }

    // Simulated Demo execution path (honestly labeled SIMULATED_DEMO)
    const now = new Date().toLocaleTimeString('en-GB');
    const newId = `DEMO-${Math.floor(508500 + Math.random() * 400000)}`;
    const newPos: Position = {
      ...order,
      id: newId,
      openedAt: now,
    };
    setPositions((prev) => [newPos, ...prev]);

    await recordEngineExecution({
      type: 'ORDER_SENT',
      symbol: order.symbol,
      side: order.side,
      positionId: newId,
      lotSize: order.lotSize,
      entryPrice: order.entryPrice,
      stopLoss: order.stopLoss,
      takeProfit: order.takeProfit,
      signalHash: meta?.signalHash,
      source,
      reasonUz,
      brokerMessage: 'Simulyatsiya Demo order ochildi',
    });
    void pushSystemEvent(
      source === 'OWNER' ? 'NORMAL' : 'HIGH',
      'POSITION',
      `${source === 'OWNER' ? 'Yangi' : 'Avto-AI'} ${order.side === 'LONG' ? 'BUY' : 'SELL'} (Demo): ${order.symbol}`,
      `${order.lotSize} lot @ ${formatPrice(order.entryPrice)} · SL: ${order.stopLoss ? formatPrice(order.stopLoss) : '—'} · TP: ${order.takeProfit ? formatPrice(order.takeProfit) : '—'} (${order.strategyName}).`,
      order.symbol
    );
    void apiJson('/api/memory/log-signal', {
      method: 'POST',
      body: JSON.stringify({
        symbol: order.symbol,
        timeframe: activeTimeframe,
        direction: order.side === 'LONG' ? 'BUY' : 'SELL',
        strategyName: order.strategyName,
        entryPrice: order.entryPrice,
        stopLoss: order.stopLoss ?? 0,
        takeProfit: order.takeProfit ?? 0,
        outcome: 'PENDING',
        pnlUsd: 0,
      }),
    }).catch(() => {});

    return { ok: true, positionId: newId };
  };

  const handlePlaceOrder = (order: Omit<Position, 'id' | 'openedAt'>) => {
    void executeVerifiedOrder(order, {
      source: 'OWNER',
      reasonUz: `Qo‘lda order: ${order.lotSize} lot @ ${formatPrice(order.entryPrice)} (${order.strategyName})`,
    });
  };

  const closeVerifiedPosition = async (
    id: string,
    meta?: {
      source?: 'AI_LLM' | 'ENSEMBLE_ENGINE' | 'OWNER';
      reasonUz?: string;
    }
  ): Promise<{ ok: boolean; brokerMessage?: string }> => {
    const source = meta?.source ?? 'OWNER';
    const targetPos = positions.find((p) => p.id === id);
    const estPnl = targetPos
      ? targetPos.sizeUsdt *
        (targetPos.side === 'LONG'
          ? (targetPos.markPrice - targetPos.entryPrice) / Math.max(1e-9, targetPos.entryPrice)
          : (targetPos.entryPrice - targetPos.markPrice) / Math.max(1e-9, targetPos.entryPrice))
      : undefined;

    if (mt5Connected) {
      const base = serverConfig.apiBaseUrl.replace(/\/$/, '');
      try {
        const res = await fetch(`${base}/api/close`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ positionId: id }),
        });
        let json: Record<string, unknown> = {};
        try {
          json = (await res.json()) as Record<string, unknown>;
        } catch {
          // ignore
        }
        if (!res.ok) {
          const errMsg = String(json?.detail || json?.error || `MT5 Close HTTP ${res.status}`);
          return { ok: false, brokerMessage: errMsg };
        }
        await refreshMt5Now();
      } catch (err) {
        return { ok: false, brokerMessage: err instanceof Error ? err.message : 'MT5 close xatosi' };
      }
    } else {
      const now = new Date().toLocaleTimeString('en-GB');
      setPositions((prev) =>
        prev.map((pos) => {
          if (pos.id !== id || pos.status === 'CLOSED') return pos;
          if (pos.status === 'PENDING') {
            return { ...pos, status: 'CLOSED', closedAt: now, realizedPnl: 0 };
          }
          const diff =
            pos.side === 'LONG'
              ? (pos.markPrice - pos.entryPrice) / pos.entryPrice
              : (pos.entryPrice - pos.markPrice) / pos.entryPrice;
          const pnl = pos.sizeUsdt * diff;
          setBaseBalance((b) => b + pnl);
          return {
            ...pos,
            status: 'CLOSED',
            closedAt: now,
            realizedPnl: pnl,
          };
        })
      );
    }

    if (source !== 'OWNER') {
      await recordEngineExecution({
        type: 'AI_CLOSED',
        symbol: targetPos?.symbol ?? id,
        side: targetPos?.side,
        positionId: id,
        pnlUsd: estPnl !== undefined ? Number(estPnl.toFixed(2)) : undefined,
        source,
        reasonUz: meta?.reasonUz ?? 'AI dinamik foyda/zarar himoyasi pozitsiyani yopdi.',
      });
    }

    void pushSystemEvent(
      source === 'OWNER' ? 'NORMAL' : 'HIGH',
      'POSITION',
      `${source === 'OWNER' ? 'Pozitsiya yopildi' : 'AI pozitsiyani yopdi'}: ${targetPos?.symbol ?? id}`,
      meta?.reasonUz ?? 'Pozitsiya joriy bozor narxida yopildi.',
      targetPos?.symbol
    );
    return { ok: true };
  };

  const handleClosePosition = (id: string) => {
    void closeVerifiedPosition(id, { source: 'OWNER' });
  };

  const modifyVerifiedTargets = async (
    id: string,
    stopLoss: number | null,
    takeProfit: number | null,
    meta?: {
      type?: 'SL_TP_MODIFIED' | 'BREAK_EVEN' | 'TRAILING_STOP';
      source?: 'AI_LLM' | 'ENSEMBLE_ENGINE' | 'OWNER';
      reasonUz?: string;
    }
  ): Promise<{ ok: boolean; brokerMessage?: string }> => {
    const pos = positions.find((p) => p.id === id);
    if (pos) {
      const price = pos.markPrice > 0 ? pos.markPrice : pos.entryPrice;
      if (pos.side === 'LONG') {
        if (stopLoss !== null && stopLoss >= price) {
          return { ok: false, brokerMessage: 'LONG uchun SL joriy narxdan past bo‘lishi kerak.' };
        }
        if (takeProfit !== null && takeProfit <= price) {
          return { ok: false, brokerMessage: 'LONG uchun TP joriy narxdan yuqori bo‘lishi kerak.' };
        }
      } else {
        if (stopLoss !== null && stopLoss <= price) {
          return { ok: false, brokerMessage: 'SHORT uchun SL joriy narxdan yuqori bo‘lishi kerak.' };
        }
        if (takeProfit !== null && takeProfit >= price) {
          return { ok: false, brokerMessage: 'SHORT uchun TP joriy narxdan past bo‘lishi kerak.' };
        }
      }
    }

    if (mt5Connected) {
      const base = serverConfig.apiBaseUrl.replace(/\/$/, '');
      try {
        const res = await fetch(`${base}/api/modify`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ positionId: id, stopLoss, takeProfit }),
        });
        let json: Record<string, unknown> = {};
        try {
          json = (await res.json()) as Record<string, unknown>;
        } catch {
          // ignore
        }
        if (!res.ok) {
          const errMsg = String(json?.detail || json?.error || `MT5 Modify HTTP ${res.status}`);
          return { ok: false, brokerMessage: errMsg };
        }
        await refreshMt5Now();
      } catch (err) {
        return { ok: false, brokerMessage: err instanceof Error ? err.message : 'MT5 modify xatosi' };
      }
    }

    setPositions((prev) =>
      prev.map((p) => (p.id === id ? { ...p, stopLoss, takeProfit } : p))
    );

    if (meta?.source && meta.source !== 'OWNER') {
      await recordEngineExecution({
        type: meta.type ?? 'SL_TP_MODIFIED',
        symbol: pos?.symbol ?? id,
        side: pos?.side,
        positionId: id,
        stopLoss,
        takeProfit,
        source: meta.source,
        reasonUz: meta.reasonUz ?? 'AI dinamik SL/TP boshqaruvi yangilandi.',
      });
    }
    return { ok: true };
  };

  const handleUpdateTargets = (id: string, stopLoss: number | null, takeProfit: number | null) => {
    void modifyVerifiedTargets(id, stopLoss, takeProfit, { source: 'OWNER' });
  };

  // Fresh reactive inputs ref for the continuous 24/7 autonomous analysis & execution cycle
  const latestEngineInputsRef = useRef({
    pairs,
    positions,
    activePair,
    activeTimeframe,
    liveCandles,
    chartBrainAnalysis,
    mtfCandlesByTf,
    metrics,
    riskGuard,
    learningSummary,
    mt5Connected,
    mt5Account,
    systemStatus,
  });
  latestEngineInputsRef.current = {
    pairs,
    positions,
    activePair,
    activeTimeframe,
    liveCandles,
    chartBrainAnalysis,
    mtfCandlesByTf,
    metrics,
    riskGuard,
    learningSummary,
    mt5Connected,
    mt5Account,
    systemStatus,
  };

  const runAutonomousCycle = useCallback(
    async (forceLlm: boolean) => {
      if (!authSession || engineRunningRef.current) return;
      engineRunningRef.current = true;
      if (forceLlm) setAiEngineBusy(true);

      try {
        const snap = latestEngineInputsRef.current;
        const openPosList = snap.positions.filter((p) => p.status === 'OPEN');

        // 1. Run real deterministic multi-instrument analysis across ALL pairs
        const reports = snap.pairs.map((pair) => {
          const isSelected = pair.symbol === snap.activePair.symbol;
          const candles =
            isSelected && snap.liveCandles.length >= 30
              ? snap.liveCandles
              : generateMt5Candles(pair.symbol, pair.price, snap.activeTimeframe, 160);
          const brainAnalysis =
            isSelected &&
            snap.chartBrainAnalysis &&
            snap.chartBrainAnalysis.snapshot.symbol === pair.symbol &&
            snap.chartBrainAnalysis.snapshot.timeframe === snap.activeTimeframe
              ? snap.chartBrainAnalysis
              : analyzeStrategyBrain(candles, pair.symbol, snap.activeTimeframe);

          const decision = runIntelligentDecision({
            pair,
            timeframe: snap.activeTimeframe,
            candles,
            brainAnalysis,
            candlesByTf: isSelected ? snap.mtfCandlesByTf : undefined,
            equity: snap.metrics.totalEquity,
            riskGuard: snap.riskGuard,
            openPositionsCount: openPosList.length,
            realizedTodayUsd: snap.metrics.realizedToday,
            calibratedSampleCount: snap.learningSummary.resolvedCount,
            calibratedWinRatePct: snap.learningSummary.overallWinRatePct,
          });

          const latestCandlePat =
            brainAnalysis.snapshot.candlestickReport?.latestConfirmedPattern?.patternName ??
            brainAnalysis.snapshot.candlestickReport?.latestActivePattern?.patternName ??
            'Standart sham';

          return {
            symbol: pair.symbol,
            timeframe: snap.activeTimeframe,
            price: pair.price,
            spreadPoints: decision.riskEvaluation.spreadPoints,
            assetClass: pair.assetClass,
            action: decision.finalAction,
            analyticalScore: decision.analyticalScore,
            regime: decision.regime.regime,
            regimeLabelUz: decision.regime.labelUz,
            mtfAlignmentPct: decision.mtf.alignmentPct,
            mtfConflict: decision.mtf.conflictDetected,
            entryPrice: pair.price,
            stopLoss: decision.riskEvaluation.dynamicStopLoss,
            takeProfit: decision.riskEvaluation.takeProfit,
            recommendedLot: decision.riskEvaluation.recommendedLot,
            riskPct: decision.riskEvaluation.riskPct,
            riskAllowed: decision.riskEvaluation.overallAllowed,
            riskBlockReasons: decision.riskEvaluation.blockReasons,
            explanationUz: decision.explanationUz,
            strategyVotes: decision.strategyDecisions.map((sd) => ({
              strategyId: sd.strategyId,
              strategyName: sd.strategyName,
              signal: sd.signal,
              selectedForRegime: sd.selectedForRegime,
              reasonUz: sd.reasonUz,
            })),
            smcSummary: brainAnalysis.snapshot.smcDeep?.summaryUz,
            candlestickSummary: latestCandlePat,
            atr14: decision.riskEvaluation.atr14,
          };
        });

        const openPositionsPayload = openPosList.map((pos) => {
          const diff =
            pos.side === 'LONG'
              ? (pos.markPrice - pos.entryPrice) / Math.max(1e-9, pos.entryPrice)
              : (pos.entryPrice - pos.markPrice) / Math.max(1e-9, pos.entryPrice);
          return {
            id: pos.id,
            symbol: pos.symbol,
            side: pos.side,
            entryPrice: pos.entryPrice,
            markPrice: pos.markPrice,
            lotSize: pos.lotSize,
            sizeUsdt: pos.sizeUsdt,
            stopLoss: pos.stopLoss,
            takeProfit: pos.takeProfit,
            profit: Number((pos.sizeUsdt * diff).toFixed(2)),
            strategyName: pos.strategyName,
            openedAt: pos.openedAt,
          };
        });

        const accountPayload = {
          mt5Connected: snap.mt5Connected,
          tradeMode: snap.mt5Connected ? (snap.mt5Account?.tradeMode ?? 'DEMO') : ('SIMULATED' as const),
          tradeAllowed: snap.mt5Connected ? (snap.mt5Account?.tradeAllowed ?? true) : true,
          investorReadOnly: snap.mt5Connected ? Boolean(snap.mt5Account?.investorReadOnly) : false,
          equity: snap.metrics.totalEquity,
          marginFree: snap.metrics.availableBalance,
          realizedToday: snap.metrics.realizedToday,
          dailyMaxLossUsd: snap.riskGuard.dailyMaxLossUsdt,
        };

        // 2. Sync multi-instrument analysis & get backend diagnostics, order commands, and deterministic SL/TP actions
        const cycleRes = await apiJson<{
          ok: boolean;
          diagnostics: DiagnosticBlocker[];
          approvedOrderCommands: {
            signalHash: string;
            symbol: string;
            side: 'LONG' | 'SHORT';
            lotSize: number;
            entryPrice: number;
            stopLoss: number;
            takeProfit: number;
            riskPct: number;
            riskRewardRatio: number;
            analyticalScore: number;
            strategySummary: string;
            reasonUz: string;
          }[];
          deterministicPositionActions: {
            positionId: string;
            symbol: string;
            action: 'MOVE_BREAKEVEN' | 'TRAIL_PROFIT' | 'MODIFY_SL_TP' | 'CLOSE_PROFIT' | 'CLOSE_LOSS_CUT';
            newStopLoss: number | null;
            newTakeProfit: number | null;
            reasonUz: string;
            source: 'AI_LLM' | 'ENSEMBLE_ENGINE';
          }[];
          highConvictionCandidates: InstrumentAnalysisSnapshot[];
          canAutoExecute: boolean;
          engineMetrics: EngineMetricsRecord;
          perSymbolReports: Record<string, InstrumentAnalysisSnapshot>;
          control: ControlStateRecord;
        }>('/api/engine/cycle', {
          method: 'POST',
          body: JSON.stringify({
            reports,
            openPositions: openPositionsPayload,
            account: accountPayload,
          }),
        });

        setSystemStatus((prev) =>
          prev
            ? {
                ...prev,
                control: cycleRes.control,
                engineMetrics: cycleRes.engineMetrics,
                diagnostics: cycleRes.diagnostics,
                perSymbolReports: cycleRes.perSymbolReports,
              }
            : prev
        );

        let mutatedTrades = false;

        // 3. Apply deterministic Break-Even / Trailing Stop / Missing SL-TP protection when AUTONOMOUS + aiAutoSlTpEnabled
        if (
          cycleRes.control.autonomousMode === 'AUTONOMOUS' &&
          cycleRes.control.aiAutoSlTpEnabled &&
          cycleRes.deterministicPositionActions.length > 0
        ) {
          for (const act of cycleRes.deterministicPositionActions) {
            const mappedType =
              act.action === 'MOVE_BREAKEVEN'
                ? 'BREAK_EVEN'
                : act.action === 'TRAIL_PROFIT'
                  ? 'TRAILING_STOP'
                  : 'SL_TP_MODIFIED';
            const res = await modifyVerifiedTargets(act.positionId, act.newStopLoss, act.newTakeProfit, {
              type: mappedType,
              source: 'ENSEMBLE_ENGINE',
              reasonUz: act.reasonUz,
            });
            if (res.ok) mutatedTrades = true;
          }
        }

        // 4. Throttled AI LLM Deep Evaluator (combines Strategy Ensemble + AI own reasoning for entries & dynamic P/L SL/TP)
        const shouldCallLlm =
          forceLlm ||
          (cycleRes.control.autonomousMode === 'AUTONOMOUS' &&
            (cycleRes.highConvictionCandidates.length > 0 || openPositionsPayload.length > 0) &&
            Date.now() - lastLlmRunRef.current >= 28000);

        let llmEntryMap = new Map<
          string,
          {
            decision: 'EXECUTE_BUY' | 'EXECUTE_SELL' | 'WAIT' | 'REJECT';
            confidencePct: number;
            refinedEntry: number;
            refinedStopLoss: number;
            refinedTakeProfit: number;
            reasoningUz: string;
          }
        >();
        let llmPositionActions: {
          positionId: string;
          symbol: string;
          action: 'HOLD' | 'MOVE_BREAKEVEN' | 'MODIFY_SL_TP' | 'TRAIL_PROFIT' | 'CLOSE_PROFIT' | 'CLOSE_LOSS_CUT';
          newStopLoss: number | null;
          newTakeProfit: number | null;
          reasoningUz: string;
        }[] = [];

        if (shouldCallLlm) {
          const candidatesForLlm =
            cycleRes.highConvictionCandidates.length > 0
              ? cycleRes.highConvictionCandidates
              : forceLlm
                ? Object.values(cycleRes.perSymbolReports)
                    .sort((a, b) => b.analyticalScore - a.analyticalScore)
                    .slice(0, 3)
                : [];

          if (candidatesForLlm.length > 0 || openPositionsPayload.length > 0) {
            try {
              lastLlmRunRef.current = Date.now();
              const llmRes = await apiJson<{
                ok: boolean;
                llmUsed: boolean;
                provider: string;
                overallBriefUz: string;
                entryDecisions: {
                  symbol: string;
                  decision: 'EXECUTE_BUY' | 'EXECUTE_SELL' | 'WAIT' | 'REJECT';
                  confidencePct: number;
                  refinedEntry: number;
                  refinedStopLoss: number;
                  refinedTakeProfit: number;
                  reasoningUz: string;
                }[];
                positionActions: {
                  positionId: string;
                  symbol: string;
                  action:
                    | 'HOLD'
                    | 'MOVE_BREAKEVEN'
                    | 'MODIFY_SL_TP'
                    | 'TRAIL_PROFIT'
                    | 'CLOSE_PROFIT'
                    | 'CLOSE_LOSS_CUT';
                  newStopLoss: number | null;
                  newTakeProfit: number | null;
                  reasoningUz: string;
                }[];
              }>('/api/ai/autonomous-decide', {
                method: 'POST',
                body: JSON.stringify({
                  candidates: candidatesForLlm,
                  openPositions: openPositionsPayload,
                  account: accountPayload,
                  marketSummaries: reports.map((r) => ({
                    symbol: r.symbol,
                    price: r.price,
                    action: r.action,
                    score: r.analyticalScore,
                    regime: r.regime,
                    mtfAlignmentPct: r.mtfAlignmentPct,
                    smc: r.smcSummary,
                    candle: r.candlestickSummary,
                  })),
                }),
              });

              setLastAiBriefUz(llmRes.overallBriefUz);
              setLastAiProvider(llmRes.provider);
              setLastAiError(null);

              llmEntryMap = new Map(
                (llmRes.entryDecisions ?? []).map((ed) => [String(ed.symbol || '').toUpperCase(), ed])
              );
              llmPositionActions = llmRes.positionActions ?? [];
            } catch (err) {
              const errMsg = err instanceof Error ? err.message : 'AI LLM tahlilida xatolik yuz berdi.';
              setLastAiError(errMsg);
            }
          }
        }

        // 5. Execute Approved Parallel Multi-Orders when AUTONOMOUS gates pass
        if (cycleRes.canAutoExecute && cycleRes.approvedOrderCommands.length > 0) {
          for (const cmd of cycleRes.approvedOrderCommands) {
            const llmDecision = llmEntryMap.get(cmd.symbol.toUpperCase());
            if (llmDecision && (llmDecision.decision === 'REJECT' || llmDecision.decision === 'WAIT')) {
              await recordEngineExecution({
                type: 'ORDER_REJECTED',
                symbol: cmd.symbol,
                side: cmd.side,
                lotSize: cmd.lotSize,
                entryPrice: cmd.entryPrice,
                stopLoss: cmd.stopLoss,
                takeProfit: cmd.takeProfit,
                source: 'AI_LLM',
                reasonUz: `AI LLM chuqur tahlili kirishni rad etdi (${llmDecision.decision}): ${llmDecision.reasoningUz}`,
                brokerMessage: 'AI_LLM_VETO',
              });
              continue;
            }

            let finalSl = cmd.stopLoss;
            let finalTp = cmd.takeProfit;
            let execSource: 'AI_LLM' | 'ENSEMBLE_ENGINE' = 'ENSEMBLE_ENGINE';
            let execReason = cmd.reasonUz;

            if (
              llmDecision &&
              ((cmd.side === 'LONG' && llmDecision.decision === 'EXECUTE_BUY') ||
                (cmd.side === 'SHORT' && llmDecision.decision === 'EXECUTE_SELL'))
            ) {
              execSource = 'AI_LLM';
              execReason = `AI + Ensemble (${llmDecision.confidencePct}%): ${llmDecision.reasoningUz}`;
              if (
                cmd.side === 'LONG' &&
                llmDecision.refinedStopLoss > 0 &&
                llmDecision.refinedStopLoss < cmd.entryPrice &&
                llmDecision.refinedTakeProfit > cmd.entryPrice
              ) {
                finalSl = llmDecision.refinedStopLoss;
                finalTp = llmDecision.refinedTakeProfit;
              } else if (
                cmd.side === 'SHORT' &&
                llmDecision.refinedStopLoss > cmd.entryPrice &&
                llmDecision.refinedTakeProfit > 0 &&
                llmDecision.refinedTakeProfit < cmd.entryPrice
              ) {
                finalSl = llmDecision.refinedStopLoss;
                finalTp = llmDecision.refinedTakeProfit;
              }
            }

            const matchedPair = snap.pairs.find((p) => p.symbol === cmd.symbol);
            const execRes = await executeVerifiedOrder(
              {
                symbol: cmd.symbol,
                side: cmd.side,
                orderType: 'MARKET',
                entryPrice: matchedPair?.price ?? cmd.entryPrice,
                markPrice: matchedPair?.price ?? cmd.entryPrice,
                lotSize: cmd.lotSize,
                sizeUsdt: Math.max(100, Math.round(cmd.lotSize * 10000)),
                leverage: 100,
                stopLoss: finalSl,
                takeProfit: finalTp,
                status: 'OPEN',
                strategyName: `Avto-AI · ${cmd.strategySummary.slice(0, 42)}`,
              },
              {
                source: execSource,
                signalHash: cmd.signalHash,
                reasonUz: execReason,
              }
            );
            if (execRes.ok) mutatedTrades = true;
          }
        }

        // 6. Execute AI LLM Dynamic Profit/Loss Position Management (SL/TP, Break-Even, Trailing, Close)
        if (
          cycleRes.control.autonomousMode === 'AUTONOMOUS' &&
          cycleRes.control.aiAutoSlTpEnabled &&
          llmPositionActions.length > 0
        ) {
          for (const pa of llmPositionActions) {
            if (!pa || pa.action === 'HOLD') continue;
            const pos =
              openPosList.find((p) => p.id === pa.positionId) ??
              openPosList.find((p) => p.symbol.toUpperCase() === String(pa.symbol || '').toUpperCase());
            if (!pos) continue;

            if (pa.action === 'CLOSE_PROFIT' || pa.action === 'CLOSE_LOSS_CUT') {
              const closeRes = await closeVerifiedPosition(pos.id, {
                source: 'AI_LLM',
                reasonUz: `AI (${pa.action}): ${pa.reasoningUz}`,
              });
              if (closeRes.ok) mutatedTrades = true;
              continue;
            }

            // Strictly prevent widening Stop-Loss into deeper loss
            let nextSl = pa.newStopLoss !== null && pa.newStopLoss > 0 ? pa.newStopLoss : pos.stopLoss;
            const nextTp = pa.newTakeProfit !== null && pa.newTakeProfit > 0 ? pa.newTakeProfit : pos.takeProfit;

            if (pos.stopLoss !== null && nextSl !== null) {
              if (pos.side === 'LONG' && nextSl < pos.stopLoss) {
                nextSl = pos.stopLoss;
              } else if (pos.side === 'SHORT' && nextSl > pos.stopLoss) {
                nextSl = pos.stopLoss;
              }
            }

            const mappedType =
              pa.action === 'MOVE_BREAKEVEN'
                ? 'BREAK_EVEN'
                : pa.action === 'TRAIL_PROFIT'
                  ? 'TRAILING_STOP'
                  : 'SL_TP_MODIFIED';

            const modRes = await modifyVerifiedTargets(pos.id, nextSl, nextTp, {
              type: mappedType,
              source: 'AI_LLM',
              reasonUz: `AI (${pa.action}): ${pa.reasoningUz}`,
            });
            if (modRes.ok) mutatedTrades = true;
          }
        }

        if (mutatedTrades || forceLlm) {
          void refreshBackendState();
        }
      } catch (err) {
        if (forceLlm) {
          setLastAiError(err instanceof Error ? err.message : 'Avtonom siklda xatolik yuz berdi.');
        }
      } finally {
        engineRunningRef.current = false;
        if (forceLlm) setAiEngineBusy(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [authSession, refreshBackendState]
  );

  // Continuous 24/7 multi-instrument analysis & autonomous execution loop (runs every 12s when scanner RUNNING)
  const scannerRunning = (systemStatus?.control.scannerStatus ?? 'RUNNING') === 'RUNNING';
  useEffect(() => {
    if (!authSession || !scannerRunning) return;
    const initialTimer = window.setTimeout(() => {
      void runAutonomousCycle(false);
    }, 1200);
    const interval = window.setInterval(() => {
      void runAutonomousCycle(false);
    }, 12000);
    return () => {
      window.clearTimeout(initialTimer);
      window.clearInterval(interval);
    };
  }, [authSession, scannerRunning, runAutonomousCycle]);

  const handleKillAllPositions = () => {
    void pushSystemEvent(
      'CRITICAL',
      'POSITION',
      'Barcha ochiq pozitsiyalar yopildi',
      'Alohida tasdiq orqali barcha faol MT5 pozitsiyalari yopildi.'
    );

    if (mt5Connected) {
      const base = serverConfig.apiBaseUrl.replace(/\/$/, '');
      void fetch(`${base}/api/kill-all`, { method: 'POST' }).then(() => refreshMt5Now());
      setKillModalOpen(false);
      return;
    }

    const now = new Date().toLocaleTimeString('en-GB');
    let realizedDelta = 0;
    setPositions((prev) =>
      prev.map((pos) => {
        if (pos.status === 'CLOSED') return pos;
        if (pos.status === 'PENDING') {
          return { ...pos, status: 'CLOSED', closedAt: now, realizedPnl: 0 };
        }
        const diff =
          pos.side === 'LONG'
            ? (pos.markPrice - pos.entryPrice) / pos.entryPrice
            : (pos.entryPrice - pos.markPrice) / pos.entryPrice;
        const pnl = pos.sizeUsdt * diff;
        realizedDelta += pnl;
        return { ...pos, status: 'CLOSED', closedAt: now, realizedPnl: pnl };
      })
    );
    if (realizedDelta !== 0) {
      setBaseBalance((b) => b + realizedDelta);
    }
    setKillModalOpen(false);
  };

  const handleExecuteAiFunctionCall = ({
    name,
    args,
  }: {
    name: string;
    args: Record<string, unknown>;
  }): string => {
    if (name === 'open_mt5_order') {
      if (tradingBlocked) {
        return 'Bloklandi: STOP NEW TRADES faol.';
      }
      const symbol = String(args.symbol || selectedSymbol).toUpperCase();
      const rawSide = String(args.side || 'LONG').toUpperCase();
      const side = rawSide === 'SELL' || rawSide === 'SHORT' ? 'SHORT' : 'LONG';
      const lotSize = Math.max(0.01, Number(args.lotSize) || 0.1);
      const orderType = String(args.orderType || 'MARKET').toUpperCase() === 'LIMIT' ? 'LIMIT' : 'MARKET';
      const matchedPair = pairs.find((p) => p.symbol === symbol) ?? activePair;
      const entryPrice = Number(args.entryPrice) || matchedPair.price;
      const stopLoss = args.stopLoss ? Number(args.stopLoss) : null;
      const takeProfit = args.takeProfit ? Number(args.takeProfit) : null;

      handlePlaceOrder({
        symbol: matchedPair.symbol,
        side,
        orderType,
        entryPrice,
        markPrice: matchedPair.price,
        lotSize,
        sizeUsdt: Math.round(lotSize * 10000),
        leverage: 100,
        stopLoss,
        takeProfit,
        status: orderType === 'MARKET' ? 'OPEN' : 'PENDING',
        strategyName:
          String(args.style || '').toUpperCase() === 'LONG_TERM'
            ? 'AI Uzoq muddat'
            : 'AI Skalping',
      });
      return `${matchedPair.symbol} · ${lotSize} lot ${side === 'LONG' ? 'BUY' : 'SELL'} ochildi`;
    }

    if (name === 'close_mt5_position') {
      const targetId = String(args.positionId || '');
      if (targetId.toUpperCase() === 'ALL') {
        setKillModalOpen(true);
        return 'Barcha pozitsiyalarni yopish uchun tasdiq oynasi ochildi';
      }
      handleClosePosition(targetId);
      return `${targetId} pozitsiyasi yopildi`;
    }

    if (name === 'modify_mt5_sl_tp') {
      const targetId = String(args.positionId || '');
      const sl = args.stopLoss !== undefined ? Number(args.stopLoss) : null;
      const tp = args.takeProfit !== undefined ? Number(args.takeProfit) : null;
      handleUpdateTargets(targetId, sl, tp);
      return `${targetId} SL/TP yangilandi`;
    }

    if (name === 'run_mt5_backtest') {
      const symbol = String(args.symbol || selectedSymbol).toUpperCase();
      const style: TradingStyle =
        String(args.style || 'SCALPING').toUpperCase() === 'LONG_TERM'
          ? 'LONG_TERM'
          : 'SCALPING';
      const rawTf = String(args.timeframe || (style === 'SCALPING' ? 'M5' : 'H4')).toUpperCase();
      const allowedTfs: Timeframe[] = ['M1', 'M5', 'M15', 'M30', 'H1', 'H4', 'D1', 'W1'];
      const tf: Timeframe = allowedTfs.includes(rawTf as Timeframe)
        ? (rawTf as Timeframe)
        : style === 'SCALPING'
          ? 'M5'
          : 'H4';
      const validStrategies: BacktestStrategyId[] = [
        'all_12_mega_brain',
        'all_6_confluence',
        'leviathan_pa',
        'geraked_ut_zlsma',
        'alorse_supertrend_squeeze',
        'ichimoku_sweep',
        'smc_luxalgo',
        'scalp_pullback',
        'ema_ribbon_rsi',
        'vwap_bands',
      ];
      const requestedStrat = String(args.strategyId || 'all_12_mega_brain') as BacktestStrategyId;
      const strategyId: BacktestStrategyId = validStrategies.includes(requestedStrat)
        ? requestedStrat
        : 'all_12_mega_brain';
      setAiBacktestTrigger({
        symbol,
        style,
        timeframe: tf,
        strategyId,
        barsCount: Number(args.barsCount) || 300,
        stopLossPct: Number(args.stopLossPct) || (style === 'SCALPING' ? 0.6 : 1.8),
        takeProfitPct: Number(args.takeProfitPct) || (style === 'SCALPING' ? 1.4 : 4.2),
      });
      setActiveView('backtest');
      return `${symbol} (${tf} · ${strategyId}) backtest ishga tushirildi`;
    }

    if (name === 'scan_mt5_market') {
      if (args.focusSymbol) {
        setSelectedSymbol(String(args.focusSymbol).toUpperCase());
      }
      setActiveView('scanner');
      return '24/7 AI Bozor Skaneri ochildi';
    }

    if (name === 'toggle_ai_autotrader') {
      setActiveView('autotrading');
      return 'Avto-Savdo rejimi faqat Avto-Savdo bo‘limida Owner ruxsati bilan boshqariladi';
    }

    return `${name} bajarildi`;
  };

  const handleExecuteRecommendation = (rec: AiRecommendation) => {
    if (tradingBlocked) return;
    const matched = pairs.find((p) => p.symbol === rec.symbol.toUpperCase()) ?? activePair;
    const side = rec.action.toUpperCase() === 'SELL' ? 'SHORT' : 'LONG';
    const slNum = parseFloat(rec.stopLoss.replace(/[^0-9.]/g, ''));
    const tpNum = parseFloat(rec.takeProfit.replace(/[^0-9.]/g, ''));
    handlePlaceOrder({
      symbol: matched.symbol,
      side,
      orderType: 'MARKET',
      entryPrice: matched.price,
      markPrice: matched.price,
      lotSize: 0.15,
      sizeUsdt: 1500,
      leverage: 100,
      stopLoss: Number.isFinite(slNum) ? slNum : null,
      takeProfit: Number.isFinite(tpNum) ? tpNum : null,
      status: 'OPEN',
      strategyName: 'AI Xulosa Signali',
    });
    setActiveView('risk');
  };

  const handleExecuteScanSignal = (sig: AiScanSignal) => {
    if (tradingBlocked) return;
    const matched = pairs.find((p) => p.symbol === sig.symbol.toUpperCase()) ?? activePair;
    const side = sig.signal.toUpperCase() === 'SELL' ? 'SHORT' : 'LONG';
    const slNum = parseFloat(sig.stopLoss.replace(/[^0-9.]/g, ''));
    const tpNum = parseFloat(sig.takeProfit.replace(/[^0-9.]/g, ''));
    handlePlaceOrder({
      symbol: matched.symbol,
      side,
      orderType: 'MARKET',
      entryPrice: matched.price,
      markPrice: matched.price,
      lotSize: 0.2,
      sizeUsdt: 2000,
      leverage: 100,
      stopLoss: Number.isFinite(slNum) ? slNum : null,
      takeProfit: Number.isFinite(tpNum) ? tpNum : null,
      status: 'OPEN',
      strategyName: `AI Skaner · ${sig.style}`,
    });
    setActiveView('risk');
  };

  const handleToggleStrategy = (id: string) => {
    setStrategies((prev) =>
      prev.map((s) => (s.id === id ? { ...s, enabled: !s.enabled } : s))
    );
  };

  const handleUpdateStrategy = (updated: StrategyConfig) => {
    setStrategies((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
  };

  const handleExportStandaloneHtml = () => {
    const html = buildStandaloneIndexHtml({
      pairs,
      positions,
      strategies,
      riskGuard,
      serverConfig,
    });
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'index.html';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // STRICT GATE: Render standalone 4-Digit PIN Login Screen until authenticated
  if (!authSession) {
    return (
      <PinLoginScreen
        onAuthenticated={handleAuthenticated}
        lockMessage={lockMessage}
      />
    );
  }

  const currentTitle = NAV_ITEMS.find((n) => n.id === activeView)?.label ?? 'Dashboard';
  const unreadNotifs = notifications.filter((n) => !n.acknowledged).length;
  const totalPnlAll = metrics.realizedToday + metrics.openPnl;
  const strategiesCount = systemStatus?.strategiesCount;

  return (
    <div className="min-h-screen flex bg-slate-50 dark:bg-[#050811] tk-canvas-bg text-slate-900 dark:text-slate-100">
      {/* Desktop Compact Institutional Neon Sidebar */}
      <aside className="hidden lg:flex w-56 shrink-0 flex-col justify-between border-r border-slate-200 dark:border-violet-500/20 bg-white dark:bg-[#080D1B] sticky top-0 h-screen">
        <div className="flex flex-col min-h-0 flex-1">
          <div className="h-12 px-4 flex items-center justify-between border-b border-slate-200 dark:border-violet-500/20 shrink-0">
            <a
              href="#top"
              onClick={(e) => {
                e.preventDefault();
                setActiveView('dashboard');
              }}
              className="font-display text-sm font-bold tracking-tight text-slate-900 dark:bg-gradient-to-r dark:from-violet-400 dark:via-sky-400 dark:to-[#00E5A0] dark:bg-clip-text dark:text-transparent whitespace-nowrap shrink-0"
            >
              Trade Killer AI
            </a>
            <span className="text-[10px] font-mono font-semibold text-sky-500 dark:text-sky-400">
              AI
            </span>
          </div>

          <nav className="p-2 space-y-0.5 overflow-y-auto flex-1" aria-label="Asosiy menyu">
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const isActive = activeView === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActiveView(item.id)}
                  className={`w-full flex items-center justify-between gap-2 px-2.5 py-1.5 text-[11.5px] font-medium rounded-lg transition-all whitespace-nowrap shrink-0 cursor-pointer ${
                    isActive
                      ? 'bg-slate-900 text-white dark:bg-gradient-to-r dark:from-violet-600/25 dark:to-sky-600/20 dark:text-sky-300 dark:border dark:border-violet-400/40'
                      : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-violet-500/10 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  <span className="flex items-center gap-2 truncate">
                    <Icon
                      className={`w-3.5 h-3.5 shrink-0 ${
                        isActive ? 'text-sky-400' : 'text-slate-400 dark:text-slate-500'
                      }`}
                    />
                    <span className="truncate">{item.label}</span>
                  </span>
                  {item.id === 'notifications' && unreadNotifs > 0 && (
                    <span className="font-mono tabular-nums text-[10.5px] font-bold text-violet-500 dark:text-violet-400">
                      {unreadNotifs}
                    </span>
                  )}
                  {item.id === 'multiorder' && metrics.openCount > 0 && (
                    <span className="font-mono tabular-nums text-[10.5px] font-bold text-sky-500 dark:text-sky-400">
                      {metrics.openCount}
                    </span>
                  )}
                  {item.id === 'owner' && authSession.ownerVerified && (
                    <ShieldCheck className="w-3.5 h-3.5 text-[#00E5A0] shrink-0" />
                  )}
                </button>
              );
            })}
          </nav>
        </div>

        <div className="p-2.5 border-t border-slate-200 dark:border-violet-500/20 space-y-2 bg-slate-50/70 dark:bg-[#060A15]">
          <div className="flex items-center justify-between text-[10.5px] text-slate-500 dark:text-slate-400 px-1 font-mono tabular-nums">
            <span className={mt5Connected ? 'text-[#00E5A0]' : 'text-amber-400'}>
              {mt5Connected ? `MT5 #${serverConfig.mt5Login}` : 'MT5 Demo'}
            </span>
            <span>{authSession.autoLockMinutes}m qulf</span>
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            <button
              type="button"
              onClick={() => void handleLockSystem()}
              className="flex items-center justify-center gap-1 py-1.5 px-2 text-[11px] font-semibold rounded-md border border-violet-500/35 bg-violet-500/10 text-violet-700 dark:text-violet-300 hover:bg-violet-500/20 cursor-pointer whitespace-nowrap"
            >
              <Lock className="w-3 h-3" />
              <span>Qulflash</span>
            </button>
            <button
              type="button"
              onClick={() => void handleLogout()}
              className="flex items-center justify-center gap-1 py-1.5 px-2 text-[11px] font-semibold rounded-md border border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-sky-400/50 hover:text-white cursor-pointer whitespace-nowrap"
            >
              <LogOut className="w-3 h-3" />
              <span>Chiqish</span>
            </button>
          </div>
        </div>
      </aside>

      {/* Tablet & Mobile Collapsible Sidebar Drawer */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div className="fixed inset-0 bg-black/80 backdrop-blur-xs" onClick={() => setMobileMenuOpen(false)} />
          <aside className="relative z-10 w-64 max-w-[82vw] bg-white dark:bg-[#080D1B] border-r border-slate-200 dark:border-violet-500/25 flex flex-col justify-between p-3.5">
            <div className="flex flex-col min-h-0 flex-1">
              <div className="flex items-center justify-between pb-3 mb-2 border-b border-slate-200 dark:border-violet-500/20">
                <span className="font-display text-sm font-bold text-slate-900 dark:bg-gradient-to-r dark:from-violet-400 dark:via-sky-400 dark:to-[#00E5A0] dark:bg-clip-text dark:text-transparent">
                  Trade Killer AI
                </span>
                <button
                  type="button"
                  onClick={() => setMobileMenuOpen(false)}
                  className="p-1 text-slate-500 hover:text-slate-900 dark:hover:text-white cursor-pointer"
                  aria-label="Menyuni yopish"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <nav className="space-y-0.5 overflow-y-auto flex-1">
                {NAV_ITEMS.map((item) => {
                  const Icon = item.icon;
                  const isActive = activeView === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => {
                        setActiveView(item.id);
                        setMobileMenuOpen(false);
                      }}
                      className={`w-full flex items-center justify-between gap-2 px-3 py-2 text-xs font-medium rounded-lg whitespace-nowrap cursor-pointer ${
                        isActive
                          ? 'bg-slate-900 text-white dark:bg-violet-500/20 dark:text-sky-300 dark:border dark:border-violet-400/40'
                          : 'text-slate-600 dark:text-slate-400'
                      }`}
                    >
                      <span className="flex items-center gap-2.5">
                        <Icon className="w-3.5 h-3.5 shrink-0" />
                        <span>{item.label}</span>
                      </span>
                      {item.id === 'notifications' && unreadNotifs > 0 && (
                        <span className="font-mono text-[11px] text-violet-400">{unreadNotifs}</span>
                      )}
                    </button>
                  );
                })}
              </nav>
            </div>
            <div className="pt-3 border-t border-slate-200 dark:border-violet-500/20 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => {
                  setMobileMenuOpen(false);
                  void handleLockSystem();
                }}
                className="py-2 text-xs font-semibold rounded-lg border border-violet-500/40 text-violet-400"
              >
                Qulflash
              </button>
              <button
                type="button"
                onClick={() => {
                  setMobileMenuOpen(false);
                  void handleLogout();
                }}
                className="py-2 text-xs font-semibold rounded-lg border border-slate-700 text-slate-300"
              >
                Chiqish
              </button>
            </div>
          </aside>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Institutional Top Bar */}
        <TopTerminalBar
          currentTitle={currentTitle}
          status={systemStatus}
          mt5Connected={mt5Connected}
          mt5Login={serverConfig.mt5Login}
          unreadNotifs={unreadNotifs}
          darkMode={darkMode}
          onToggleDarkMode={() => setDarkMode((prev) => !prev)}
          onOpenMobileMenu={() => setMobileMenuOpen(true)}
          onNavigate={setActiveView}
          onLockSystem={() => void handleLockSystem()}
        />

        {/* Main Viewport */}
        <main className="p-3 sm:p-4 max-w-[1600px] w-full mx-auto space-y-3.5">
          {controlFeedback && (
            <div className="px-3.5 py-2 rounded-lg border border-amber-500/40 bg-amber-500/10 text-xs text-amber-700 dark:text-amber-300 flex items-center justify-between gap-3">
              <span>{controlFeedback}</span>
              <button
                type="button"
                onClick={() => setControlFeedback(null)}
                className="text-amber-500 hover:text-white cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* 1. MAIN INSTITUTIONAL DASHBOARD */}
          {activeView === 'dashboard' && (
            <>
              {!mt5Connected && showConnectionNotice && (
                <div className="rounded-xl border border-violet-500/35 bg-white dark:bg-[#0B1120] tk-glass-purple px-3.5 py-2.5 flex flex-wrap items-center justify-between gap-2 text-xs">
                  <div className="font-medium text-violet-700 dark:text-sky-300 max-w-3xl">
                    {mt5SyncStatus === 'https_blocked'
                      ? 'HTTPS sahifadan lokal MT5 Bridge (http://127.0.0.1:8000) bloklangan — Demo simulyatsiya faol'
                      : mt5SyncStatus === 'mt5_error'
                        ? `MT5 Bridge xatosi: ${mt5ErrorDetail}`
                        : 'MT5 ulanmagan (Demo simulyatsiya faol) — Sozlamalar bo‘limidan mt5_bridge.py ni ishga tushiring'}
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => setLiveTicks((prev) => !prev)}
                      className={`px-2.5 py-1 text-[11px] font-medium rounded border cursor-pointer transition-colors ${
                        liveTicks
                          ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-400'
                          : 'border-slate-300 dark:border-slate-700 text-slate-500 dark:text-slate-400'
                      }`}
                    >
                      Demo oqim: {liveTicks ? 'Faol' : 'Pauza'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setSyncTrigger((n) => n + 1)}
                      className="px-2.5 py-1 text-[11px] rounded border border-slate-200 dark:border-violet-500/30 text-slate-600 dark:text-slate-300 hover:border-sky-400 cursor-pointer"
                    >
                      Qayta tekshirish
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveView('settings')}
                      className="px-2.5 py-1 text-[11px] font-semibold rounded bg-gradient-to-r from-violet-600 to-sky-500 text-white cursor-pointer"
                    >
                      MT5 Sozlash
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowConnectionNotice(false)}
                      aria-label="Yopish"
                      className="p-1 text-slate-400 hover:text-white cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              )}

              {/* 8 Compact Top Institutional KPI Tiles */}
              <section className="grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-8 gap-2.5">
                <div className="rounded-xl border border-slate-200 dark:border-violet-500/25 bg-white dark:bg-[#0B1120] tk-glass p-3">
                  <div className="text-[10.5px] text-slate-500 dark:text-slate-400">Instrumentlar</div>
                  <div className="mt-0.5 text-base font-bold font-mono tabular-nums text-slate-900 dark:text-white">
                    {pairs.length}
                  </div>
                  <div className="text-[10px] font-mono text-sky-500 dark:text-sky-400 truncate">
                    {systemStatus?.control.instrumentsScanned ?? pairs.length} skaner
                  </div>
                </div>

                <div className="rounded-xl border border-slate-200 dark:border-violet-500/25 bg-white dark:bg-[#0B1120] tk-glass p-3">
                  <div className="text-[10.5px] text-slate-500 dark:text-slate-400">Strategiyalar</div>
                  <div className="mt-0.5 text-base font-bold font-mono tabular-nums text-slate-900 dark:text-white">
                    {strategiesCount?.total ?? strategyRegistry.length}
                  </div>
                  <div className="text-[10px] font-mono text-slate-500 truncate">Bazadagi jami</div>
                </div>

                <div className="rounded-xl border border-slate-200 dark:border-sky-500/25 bg-white dark:bg-[#0B1120] tk-glass-blue p-3">
                  <div className="text-[10.5px] text-slate-500 dark:text-slate-400">Tasdiqlangan</div>
                  <div className="mt-0.5 text-base font-bold font-mono tabular-nums text-sky-600 dark:text-sky-400">
                    {strategiesCount?.approved ?? 0}
                  </div>
                  <div className="text-[10px] font-mono text-slate-500 truncate">Owner ruxsati</div>
                </div>

                <div className="rounded-xl border border-slate-200 dark:border-violet-500/30 bg-white dark:bg-[#0B1120] tk-glass-purple p-3">
                  <div className="text-[10.5px] text-slate-500 dark:text-slate-400">Faol strategiya</div>
                  <div className="mt-0.5 text-base font-bold font-mono tabular-nums text-violet-600 dark:text-violet-400">
                    {strategiesCount?.active ?? 0}
                  </div>
                  <div className="text-[10px] font-mono text-slate-500 truncate">
                    Kutilmoqda: {strategiesCount?.pending ?? 0}
                  </div>
                </div>

                <div className="rounded-xl border border-slate-200 dark:border-violet-500/25 bg-white dark:bg-[#0B1120] tk-glass p-3">
                  <div className="text-[10.5px] text-slate-500 dark:text-slate-400">Ochiq orderlar</div>
                  <div className="mt-0.5 text-base font-bold font-mono tabular-nums text-slate-900 dark:text-white">
                    {metrics.openCount} / {systemStatus?.control.maxOpenOrders ?? riskGuard.maxOpenPositions}
                  </div>
                  <button
                    type="button"
                    onClick={() => setActiveView('multiorder')}
                    className="text-[10px] font-mono text-sky-500 hover:underline cursor-pointer"
                  >
                    Multi-Order →
                  </button>
                </div>

                <div className="rounded-xl border border-slate-200 dark:border-violet-500/25 bg-white dark:bg-[#0B1120] tk-glass p-3">
                  <div className="text-[10.5px] text-slate-500 dark:text-slate-400">Bugungi P/L</div>
                  <div
                    className={`mt-0.5 text-base font-bold font-mono tabular-nums ${
                      totalPnlAll >= 0 ? 'text-emerald-600 dark:text-[#00E5A0]' : 'text-rose-500'
                    }`}
                  >
                    {totalPnlAll >= 0 ? '+' : ''}
                    {formatCurrency(totalPnlAll)}
                  </div>
                  <div className="text-[10px] font-mono text-slate-500 truncate">
                    Ochiq: {metrics.openPnl >= 0 ? '+' : ''}{formatCurrency(metrics.openPnl)}
                  </div>
                </div>

                <div className="rounded-xl border border-slate-200 dark:border-violet-500/25 bg-white dark:bg-[#0B1120] tk-glass p-3">
                  <div className="text-[10.5px] text-slate-500 dark:text-slate-400">
                    {mt5Connected ? 'MT5 Equity' : 'Umumiy Kapital'}
                  </div>
                  <div className="mt-0.5 text-base font-bold font-mono tabular-nums text-slate-900 dark:text-white">
                    {formatCurrency(metrics.totalEquity)}
                  </div>
                  <div className="text-[10px] font-mono text-slate-500 truncate">
                    Erkin: {formatCurrency(metrics.availableBalance)}
                  </div>
                </div>

                <div className="rounded-xl border border-slate-200 dark:border-violet-500/25 bg-white dark:bg-[#0B1120] tk-glass p-3">
                  <div className="text-[10.5px] text-slate-500 dark:text-slate-400">Portfolio risk</div>
                  <div
                    className={`mt-0.5 text-base font-bold font-mono tabular-nums ${
                      decisionReport.riskEvaluation.overallAllowed && !tradingBlocked
                        ? 'text-emerald-600 dark:text-[#00E5A0]'
                        : 'text-rose-500'
                    }`}
                  >
                    {(systemStatus?.engineMetrics?.currentPortfolioRiskPct ?? decisionReport.riskEvaluation.riskPct).toFixed(2)}%
                  </div>
                  <div className="text-[10px] font-mono text-slate-500 truncate">
                    Limit: {systemStatus?.control.maxPortfolioRiskPct ?? 5}% · -${riskGuard.dailyMaxLossUsdt}
                  </div>
                </div>
              </section>

              {/* CENTER (Candlestick Chart + AI Brain Panel) & RIGHT (AI Capabilities + Live Signal Feed / OrderPanel) */}
              <div className="grid grid-cols-1 xl:grid-cols-12 gap-3.5 items-stretch">
                <div className="xl:col-span-8 flex flex-col gap-3.5 min-w-0">
                  <PriceChart
                    pairs={pairs}
                    selectedSymbol={selectedSymbol}
                    onSelectSymbol={setSelectedSymbol}
                    serverConfig={serverConfig}
                    tradingStyle={tradingStyle}
                    onChangeStyle={handleStyleChange}
                    timeframe={activeTimeframe}
                    onTimeframeChange={setActiveTimeframe}
                    onBrainUpdate={setChartBrainSnapshot}
                    onFullBrainUpdate={setChartBrainAnalysis}
                    onCandlesUpdate={setLiveCandles}
                    tradeLevels={{
                      entry: activePair.price,
                      stopLoss: decisionReport.riskEvaluation.dynamicStopLoss,
                      takeProfit: decisionReport.riskEvaluation.takeProfit,
                      action: decisionReport.finalAction,
                    }}
                  />

                  <AiBrainStrip
                    decisionReport={decisionReport}
                    currentPrice={activePair.price}
                    systemStatus={systemStatus}
                    registry={strategyRegistry}
                    learningRecordsCount={learningJournal.length}
                    dailyPnlUsd={totalPnlAll}
                    dailyMaxLossUsd={riskGuard.dailyMaxLossUsdt}
                    mt5Connected={mt5Connected}
                    onNavigate={setActiveView}
                  />
                </div>

                <div className="xl:col-span-4 min-w-0">
                  <LiveSignalRail
                    pairs={pairs}
                    selectedSymbol={selectedSymbol}
                    tradingStyle={tradingStyle}
                    onSelectSymbol={setSelectedSymbol}
                    allPairBrains={allPairBrains}
                    systemStatus={systemStatus}
                    availableBalance={metrics.availableBalance}
                    equity={metrics.totalEquity}
                    riskEvaluation={decisionReport.riskEvaluation}
                    tradingBlocked={tradingBlocked}
                    mt5Connected={mt5Connected}
                    onPlaceOrder={handlePlaceOrder}
                    onNavigate={setActiveView}
                  />
                </div>
              </div>

              {/* LIVE AI ANALYSIS, EXECUTION METRICS & DIAGNOSTICS STRIP */}
              <AutonomousDiagnosticsPanel
                status={systemStatus}
                aiBusy={aiEngineBusy}
                lastAiBriefUz={lastAiBriefUz}
                lastAiProvider={lastAiProvider}
                lastAiError={lastAiError}
                onRunFullAiCycle={() => void runAutonomousCycle(true)}
                onSelectSymbol={setSelectedSymbol}
                onNavigate={setActiveView}
                compact
              />

              {/* BOTTOM: 7 Institutional Command Modules */}
              <DashboardBottomGrid
                pairs={pairs}
                allPairBrains={allPairBrains}
                selectedSymbol={selectedSymbol}
                tradingStyle={tradingStyle}
                onSelectSymbol={setSelectedSymbol}
                decisionReport={decisionReport}
                positions={positions}
                riskGuard={riskGuard}
                systemStatus={systemStatus}
                mt5Connected={mt5Connected}
                busyAction={controlBusy}
                onClosePosition={handleClosePosition}
                onStopNewTrades={() => void runSystemControl('STOP_NEW_TRADES')}
                onResumeNewTrades={() => void runSystemControl('RESUME_NEW_TRADES')}
                onPauseScanner={() => void runSystemControl('PAUSE_SCANNER')}
                onResumeScanner={() => void runSystemControl('RESUME_SCANNER')}
                onDisableAutoTrading={() => void runSystemControl('DISABLE_AUTO_TRADING')}
                onRequestCloseAll={() => setKillModalOpen(true)}
                onNavigate={setActiveView}
              />
            </>
          )}

          {/* 2. AI ANALITIK */}
          {activeView === 'analyst' && (
            <div className="space-y-5">
              <AnalystHubView
                pair={activePair}
                pairs={pairs}
                timeframe={activeTimeframe}
                onChangeTimeframe={setActiveTimeframe}
                onSelectSymbol={setSelectedSymbol}
                brainSnapshot={activeBrain}
                decisionReport={decisionReport}
                onLogDecisionToJournal={handleLogCurrentDecision}
                initialTab="verdict"
              />
              <AiTradingPanel
                pairs={pairs}
                selectedSymbol={selectedSymbol}
                tradingStyle={tradingStyle}
                positions={positions}
                strategies={strategies}
                riskGuard={riskGuard}
                brainSnapshot={activeBrain}
                decisionReport={decisionReport}
                allPairBrains={allPairBrains}
                accountMetrics={{
                  balance: baseBalance,
                  equity: metrics.totalEquity,
                  openPnl: metrics.openPnl,
                  availableMargin: metrics.availableBalance,
                }}
                fullPermissions={fullAiPermissions && !tradingBlocked}
                onToggleFullPermissions={setFullAiPermissions}
                onExecuteAiFunctionCall={handleExecuteAiFunctionCall}
                onExecuteRecommendation={handleExecuteRecommendation}
                compact
              />
            </div>
          )}

          {/* 3. 24/7 SKANER */}
          {activeView === 'scanner' && (
            <ScannerView
              pairs={pairs}
              allPairBrains={allPairBrains}
              scannerStatus={systemStatus?.control.scannerStatus ?? 'RUNNING'}
              lastAnalysisTime={systemStatus?.control.lastAnalysisTime ?? null}
              onToggleScanner={(pause) =>
                void runSystemControl(pause ? 'PAUSE_SCANNER' : 'RESUME_SCANNER')
              }
              onTradePair={(sym) => {
                setSelectedSymbol(sym);
                setActiveView('dashboard');
              }}
              onExecuteSignal={handleExecuteScanSignal}
            />
          )}

          {/* 4. STRATEGIYA MARKAZI */}
          {activeView === 'strategies' && (
            <StrategyRegistryView
              registry={strategyRegistry}
              ownerVerified={authSession.ownerVerified}
              onRegistryUpdated={setStrategyRegistry}
              onGoToOwnerCenter={() => setActiveView('owner')}
              strategies={strategies}
              riskGuard={riskGuard}
              decisionReport={decisionReport}
              onToggleStrategy={handleToggleStrategy}
              onUpdateStrategy={handleUpdateStrategy}
              onUpdateRiskGuard={setRiskGuard}
            />
          )}

          {/* 4B. STRATEGY ENSEMBLE */}
          {activeView === 'ensemble' && (
            <StrategyEnsembleView
              pairs={pairs}
              selectedSymbol={selectedSymbol}
              onSelectSymbol={setSelectedSymbol}
              timeframe={activeTimeframe}
              onChangeTimeframe={setActiveTimeframe}
              brainSnapshot={activeBrain}
              decisionReport={decisionReport}
              strategies={strategies}
              registry={strategyRegistry}
            />
          )}

          {/* 5. SHAM INTELLEKTI */}
          {activeView === 'candlesticks' && (
            <AnalystHubView
              pair={activePair}
              pairs={pairs}
              timeframe={activeTimeframe}
              onChangeTimeframe={setActiveTimeframe}
              onSelectSymbol={setSelectedSymbol}
              brainSnapshot={activeBrain}
              decisionReport={decisionReport}
              onLogDecisionToJournal={handleLogCurrentDecision}
              initialTab="candlesticks"
            />
          )}

          {/* 6. SMART MONEY */}
          {activeView === 'smc' && (
            <AnalystHubView
              pair={activePair}
              pairs={pairs}
              timeframe={activeTimeframe}
              onChangeTimeframe={setActiveTimeframe}
              onSelectSymbol={setSelectedSymbol}
              brainSnapshot={activeBrain}
              decisionReport={decisionReport}
              onLogDecisionToJournal={handleLogCurrentDecision}
              initialTab="smc"
            />
          )}

          {/* 7. TARIXIY XOTIRA */}
          {activeView === 'memory' && (
            <HistoricalMemoryView
              ownerVerified={authSession.ownerVerified}
              onGoToOwnerCenter={() => setActiveView('owner')}
              learningRecords={learningJournal}
              learningReport={learningSummary}
              onResolveLearningRecord={handleResolveLearningRecord}
              onSyncPositions={() =>
                setLearningJournal((prev) => syncClosedPositionsToJournal(prev, positions))
              }
              onLogCurrentDecision={handleLogCurrentDecision}
              onClearJournal={handleClearLearningJournal}
            />
          )}

          {/* 8. BACKTEST LAB */}
          {activeView === 'backtest' && (
            <BacktestView
              pairs={pairs}
              serverConfig={serverConfig}
              initialParams={aiBacktestTrigger}
            />
          )}

          {/* 8B. AI RESEARCH LAB & KNOWLEDGE CENTER */}
          {activeView === 'research' && (
            <ResearchKnowledgeView
              registry={strategyRegistry}
              systemStatus={systemStatus}
              learningRecords={learningJournal}
              learningSummary={learningSummary}
              ownerVerified={authSession.ownerVerified}
              onNavigate={setActiveView}
            />
          )}

          {/* 9. AVTO-SAVDO */}
          {activeView === 'autotrading' && (
            <AutoTradingView
              control={systemStatus?.control ?? null}
              systemStatus={systemStatus}
              registry={strategyRegistry}
              ownerVerified={authSession.ownerVerified}
              mt5Connected={mt5Connected}
              mt5AccountMode={mt5Connected ? (mt5Account?.tradeMode ?? 'DEMO') : 'SIMULATED'}
              aiBusy={aiEngineBusy}
              lastAiBriefUz={lastAiBriefUz}
              lastAiProvider={lastAiProvider}
              lastAiError={lastAiError}
              onRunFullAiCycle={() => void runAutonomousCycle(true)}
              onSelectSymbol={(sym) => {
                setSelectedSymbol(sym);
                setActiveView('dashboard');
              }}
              onControlUpdated={() => void refreshBackendState()}
              onGoToOwnerCenter={() => setActiveView('owner')}
              onGoToStrategies={() => setActiveView('strategies')}
              onNavigate={setActiveView}
            />
          )}

          {/* 9B. MULTI-ORDER MANAGER */}
          {activeView === 'multiorder' && (
            <MultiOrderManagerView
              positions={positions}
              pairs={pairs}
              mt5Connected={mt5Connected}
              tradingBlocked={tradingBlocked}
              onClosePosition={handleClosePosition}
              onUpdateTargets={handleUpdateTargets}
              onPlaceOrder={handlePlaceOrder}
              onRequestCloseAll={() => setKillModalOpen(true)}
              onSelectPair={(sym) => {
                setSelectedSymbol(sym);
                setActiveView('dashboard');
              }}
            />
          )}

          {/* 10. RISK MENEJERI */}
          {activeView === 'risk' && (
            <div className="space-y-4">
              <section className="rounded-xl border border-slate-200 dark:border-violet-500/25 bg-white dark:bg-[#0B1120] tk-glass p-4 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-200 dark:border-violet-500/15">
                  <div>
                    <h1 className="text-lg font-semibold text-slate-900 dark:text-white">
                      Risk Menejeri & Pozitsiyalar Nazorati
                    </h1>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Dinamik ATR Stop-Loss, spred/volatillik filtrlari, kunlik zarar limiti va favqulodda himoya qoidalari.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setKillModalOpen(true)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-rose-500/45 bg-rose-500/10 text-rose-500 hover:bg-rose-600 hover:text-white cursor-pointer whitespace-nowrap"
                  >
                    <Power className="w-3.5 h-3.5" />
                    <span>Barcha ochiq pozitsiyalarni yopish</span>
                  </button>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
                  <div>
                    <label className="block text-slate-500 dark:text-slate-400 mb-1">
                      Kunlik max zarar ($)
                    </label>
                    <input
                      type="number"
                      min={50}
                      value={riskGuard.dailyMaxLossUsdt}
                      onChange={(e) =>
                        setRiskGuard({ ...riskGuard, dailyMaxLossUsdt: Number(e.target.value) || 500 })
                      }
                      className="w-full px-3 py-2 font-mono tabular-nums rounded-lg border border-slate-200 dark:border-violet-500/25 bg-slate-50 dark:bg-[#060A15] text-slate-900 dark:text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-500 dark:text-slate-400 mb-1">
                      Max ochiq pozitsiyalar
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={100}
                      value={riskGuard.maxOpenPositions}
                      onChange={(e) =>
                        setRiskGuard({ ...riskGuard, maxOpenPositions: Number(e.target.value) || 5 })
                      }
                      className="w-full px-3 py-2 font-mono tabular-nums rounded-lg border border-slate-200 dark:border-violet-500/25 bg-slate-50 dark:bg-[#060A15] text-slate-900 dark:text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-500 dark:text-slate-400 mb-1">
                      Max Drawdown (%)
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={50}
                      step={0.5}
                      value={riskGuard.drawdownLimitPct}
                      onChange={(e) =>
                        setRiskGuard({ ...riskGuard, drawdownLimitPct: Number(e.target.value) || 5 })
                      }
                      className="w-full px-3 py-2 font-mono tabular-nums rounded-lg border border-slate-200 dark:border-violet-500/25 bg-slate-50 dark:bg-[#060A15] text-slate-900 dark:text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-500 dark:text-slate-400 mb-1">
                      Savdo riski (%)
                    </label>
                    <input
                      type="number"
                      min={0.1}
                      max={10}
                      step={0.1}
                      value={riskGuard.defaultRiskPct ?? 1}
                      onChange={(e) =>
                        setRiskGuard({ ...riskGuard, defaultRiskPct: Number(e.target.value) || 1 })
                      }
                      className="w-full px-3 py-2 font-mono tabular-nums rounded-lg border border-slate-200 dark:border-violet-500/25 bg-slate-50 dark:bg-[#060A15] text-slate-900 dark:text-white"
                    />
                  </div>
                </div>

                <div className="pt-3 border-t border-slate-200 dark:border-violet-500/15 grid grid-cols-2 sm:grid-cols-5 gap-3 text-xs font-mono tabular-nums">
                  <div>
                    <span className="font-sans text-slate-500 block">Instrument</span>
                    <span className="font-semibold text-slate-900 dark:text-white">{activePair.symbol}</span>
                  </div>
                  <div>
                    <span className="font-sans text-slate-500 block">ATR(14) SL / TP</span>
                    <span className="text-slate-700 dark:text-slate-200">
                      {formatPrice(decisionReport.riskEvaluation.dynamicStopLoss)} /{' '}
                      {formatPrice(decisionReport.riskEvaluation.takeProfit)}
                    </span>
                  </div>
                  <div>
                    <span className="font-sans text-slate-500 block">Tavsiya Lot</span>
                    <span className="text-sky-600 dark:text-sky-400 font-semibold">
                      {decisionReport.riskEvaluation.recommendedLot.toFixed(2)} lot
                    </span>
                  </div>
                  <div>
                    <span className="font-sans text-slate-500 block">Spread / Volatillik</span>
                    <span
                      className={
                        decisionReport.riskEvaluation.spreadOk && decisionReport.riskEvaluation.volatilityOk
                          ? 'text-emerald-500 dark:text-[#00E5A0]'
                          : 'text-rose-500'
                      }
                    >
                      {decisionReport.riskEvaluation.spreadOk ? 'OK' : 'Keng'} ·{' '}
                      {decisionReport.riskEvaluation.volatilityOk ? 'Normal' : 'Yuqori'}
                    </span>
                  </div>
                  <div>
                    <span className="font-sans text-slate-500 block">Risk Filtr Holati</span>
                    <span
                      className={
                        decisionReport.riskEvaluation.overallAllowed && !tradingBlocked
                          ? 'text-emerald-500 dark:text-[#00E5A0] font-semibold'
                          : 'text-rose-500 font-semibold'
                      }
                    >
                      {tradingBlocked
                        ? 'EMERGENCY STOP'
                        : decisionReport.riskEvaluation.overallAllowed
                          ? 'RUXSAT ETILGAN'
                          : 'BLOKLANGAN'}
                    </span>
                  </div>
                </div>
              </section>

              <PositionsTable
                positions={positions}
                onClosePosition={handleClosePosition}
                onUpdateTargets={handleUpdateTargets}
                onSelectPair={(sym) => {
                  setSelectedSymbol(sym);
                  setActiveView('dashboard');
                }}
                title="Barcha MT5 faol va tarixiy pozitsiyalar"
              />
            </div>
          )}

          {/* 10B. ECONOMIC CALENDAR */}
          {activeView === 'calendar' && <EconomicCalendarView />}

          {/* 10C. TRADING JOURNAL */}
          {activeView === 'journal' && (
            <LearningHistoryView
              records={learningJournal}
              report={learningSummary}
              onResolveRecord={handleResolveLearningRecord}
              onSyncPositions={() =>
                setLearningJournal((prev) => syncClosedPositionsToJournal(prev, positions))
              }
              onLogCurrentDecision={handleLogCurrentDecision}
              onClearJournal={handleClearLearningJournal}
            />
          )}

          {/* 10D. SYSTEM MONITOR */}
          {activeView === 'monitor' && (
            <SystemMonitorView
              status={systemStatus}
              mt5Connected={mt5Connected}
              mt5Login={serverConfig.mt5Login}
              mt5Server={serverConfig.mt5Server}
              openPositionsCount={metrics.openCount}
              dailyPnlUsd={totalPnlAll}
              currentRiskPct={decisionReport.riskEvaluation.riskPct}
              currentRiskUsd={decisionReport.riskEvaluation.riskAmountUsd}
              busyAction={controlBusy}
              onRefresh={() => void refreshBackendState()}
              onStopNewTrades={() => void runSystemControl('STOP_NEW_TRADES')}
              onResumeNewTrades={() => void runSystemControl('RESUME_NEW_TRADES')}
              onPauseScanner={() => void runSystemControl('PAUSE_SCANNER')}
              onResumeScanner={() => void runSystemControl('RESUME_SCANNER')}
              onDisableAutoTrading={() => void runSystemControl('DISABLE_AUTO_TRADING')}
              onLockSystem={() => void handleLockSystem()}
              onLogout={() => void handleLogout()}
              onRequestClosePositions={() => setKillModalOpen(true)}
              onNavigate={setActiveView}
            />
          )}

          {/* 11. BILDIRISHNOMALAR */}
          {activeView === 'notifications' && (
            <NotificationsView
              notifications={notifications}
              onNotificationsUpdated={setNotifications}
            />
          )}

          {/* 12. OWNER MARKAZI */}
          {activeView === 'owner' && (
            <OwnerCenterView
              ownerVerified={authSession.ownerVerified}
              autoLockMinutes={authSession.autoLockMinutes}
              registry={strategyRegistry}
              onOwnerVerified={() => {
                const updated: AuthSessionState = { ...authSession, ownerVerified: true };
                setAuthSessionMemory(updated);
                setAuthSession(updated);
              }}
              onAutoLockUpdated={(mins) => {
                const updated: AuthSessionState = { ...authSession, autoLockMinutes: mins };
                setAuthSessionMemory(updated);
                setAuthSession(updated);
              }}
              onRegistryUpdated={setStrategyRegistry}
            />
          )}

          {/* 13. SOZLAMALAR */}
          {activeView === 'settings' && (
            <div className="space-y-4">
              <section className="rounded-xl border border-slate-200 dark:border-violet-500/25 bg-white dark:bg-[#0B1120] tk-glass p-4 flex flex-wrap items-center justify-between gap-4">
                <div>
                  <h1 className="text-base font-semibold text-slate-900 dark:text-white">
                    Terminal Sozlamalari va Eksport
                  </h1>
                  <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                    Avto-qulflash: {authSession.autoLockMinutes} daqiqa · Mavzu: {darkMode ? 'Tungi Neon' : 'Yorug‘'} · Lokal MT5 Bridge integratsiyasi
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setDarkMode((prev) => !prev)}
                    className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg border border-slate-200 dark:border-violet-500/30 text-slate-700 dark:text-slate-300 hover:border-sky-400 cursor-pointer"
                  >
                    {darkMode ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
                    <span>{darkMode ? 'Yorug‘ rejimga o‘tish' : 'Tungi rejimga o‘tish'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleExportStandaloneHtml}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg bg-gradient-to-r from-violet-600 via-sky-500 to-emerald-500 text-slate-950 hover:brightness-110 cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>index.html yuklab olish</span>
                  </button>
                </div>
              </section>

              <ServerBridgeView
                serverConfig={serverConfig}
                onUpdateConfig={setServerConfig}
                pairs={pairs}
                positions={positions}
                strategies={strategies}
                riskGuard={riskGuard}
                onSyncFromServer={(data) => {
                  setMt5Connected(true);
                  applyServerSnapshot(data as Parameters<typeof applyServerSnapshot>[0]);
                }}
              />
            </div>
          )}
        </main>
      </div>

      {/* Separate Confirmation Modal for Closing All Open Positions */}
      {killModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-md rounded-xl border border-rose-500/40 bg-white dark:bg-[#0D1320] p-6">
            <h2 className="text-base font-semibold text-slate-900 dark:text-white">
              Ochiq pozitsiyalarni yopish (Alohida Tasdiq)
            </h2>
            <p className="mt-2 text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              Ushbu amal barcha ochiq pozitsiyalarni joriy bozor narxida yopadi va kutilayotgan buyurtmalarni bekor qiladi. Yangi savdolarni bloklash (STOP NEW TRADES) dan alohida bajariladi. Davom etasizmi?
            </p>
            <div className="mt-5 flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setKillModalOpen(false)}
                className="px-3.5 py-2 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              >
                Bekor qilish
              </button>
              <button
                type="button"
                onClick={handleKillAllPositions}
                className="px-3.5 py-2 text-xs font-semibold rounded-lg bg-rose-600 text-white hover:bg-rose-500 cursor-pointer"
              >
                Ha, barcha pozitsiyalarni yopish
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
