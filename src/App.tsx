import React, { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  BarChart3,
  Bot,
  Cpu,
  Download,
  History,
  Layers,
  Menu,
  Moon,
  Power,
  Server,
  Sun,
  X,
} from 'lucide-react';
import {
  INITIAL_PAIRS,
  INITIAL_POSITIONS,
  INITIAL_RISK_GUARD,
  INITIAL_SERVER_CONFIG,
  INITIAL_STRATEGIES,
  formatCurrency,
} from './data/initialData';
import {
  AiRecommendation,
  AiScanSignal,
  BacktestParams,
  BacktestStrategyId,
  MarketPair,
  Position,
  RiskGuardSettings,
  ServerConfig,
  StrategyBrainSnapshot,
  StrategyConfig,
  Timeframe,
  TradingStyle,
  ViewId,
} from './types/trading';
import { PriceChart } from './components/PriceChart';
import { OrderPanel } from './components/OrderPanel';
import { PositionsTable } from './components/PositionsTable';
import { StrategiesView } from './components/StrategiesView';
import { ScannerView } from './components/ScannerView';
import { ServerBridgeView } from './components/ServerBridgeView';
import { AiTradingPanel } from './components/AiTradingPanel';
import { BacktestView } from './components/BacktestView';
import { buildStandaloneIndexHtml } from './utils/standaloneHtmlExporter';
import { generateMt5Candles } from './utils/backtestEngine';
import { analyzeStrategyBrain } from './utils/strategyBrain';

const NAV_ITEMS: { id: ViewId; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: 'terminal', label: 'MT5 Terminal', icon: BarChart3 },
  { id: 'ai', label: 'AI Savdo & Suhbat', icon: Bot },
  { id: 'backtest', label: 'Backtest & Tarix', icon: History },
  { id: 'scanner', label: 'AI Bozor Skaneri', icon: Activity },
  { id: 'positions', label: 'MT5 Pozitsiyalar', icon: Layers },
  { id: 'strategies', label: 'Strategiyalar', icon: Cpu },
  { id: 'server', label: 'VS Code · MT5', icon: Server },
];

export default function App() {
  const [darkMode, setDarkMode] = useState(true);
  const [activeView, setActiveView] = useState<ViewId>('terminal');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

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
  } | null>(null);
  const [mt5Connected, setMt5Connected] = useState<boolean>(false);
  const [mt5SyncStatus, setMt5SyncStatus] = useState<
    'connecting' | 'connected' | 'https_blocked' | 'offline' | 'mt5_error'
  >('connecting');
  const [mt5ErrorDetail, setMt5ErrorDetail] = useState<string>('');
  const [showConnectionNotice, setShowConnectionNotice] = useState<boolean>(true);
  const [syncTrigger, setSyncTrigger] = useState<number>(0);
  const [liveTicks, setLiveTicks] = useState<boolean>(true);
  const [fullAiPermissions, setFullAiPermissions] = useState<boolean>(true);
  const [killModalOpen, setKillModalOpen] = useState<boolean>(false);
  const [aiBacktestTrigger, setAiBacktestTrigger] = useState<Partial<BacktestParams> | null>(null);
  const [chartBrainSnapshot, setChartBrainSnapshot] = useState<StrategyBrainSnapshot | null>(null);

  useEffect(() => {
    const root = document.documentElement;
    if (darkMode) {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
  }, [darkMode]);

  const applyServerSnapshot = (data: {
    account?: {
      login?: number;
      server?: string;
      balance?: number;
      equity?: number;
      margin_free?: number;
      profit?: number;
      realizedToday?: number;
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
      setMt5Account({
        login: Number(data.account.login ?? 0),
        server: String(data.account.server ?? ''),
        balance: bal,
        equity: eq,
        marginFree: mf,
        profit: prof,
        realizedToday: realToday,
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
    syncOnce();
    const timer = window.setInterval(syncOnce, Math.max(1500, serverConfig.pollingIntervalMs || 2000));
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [serverConfig.apiBaseUrl, serverConfig.autoSyncMt5, serverConfig.pollingIntervalMs, syncTrigger]);

  useEffect(() => {
    if (!liveTicks || mt5Connected) return;
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
  }, [liveTicks, mt5Connected]);

  const activePair = useMemo(
    () => pairs.find((p) => p.symbol === selectedSymbol) ?? pairs[0],
    [pairs, selectedSymbol]
  );

  const allPairBrains = useMemo(() => {
    const tf: Timeframe = tradingStyle === 'SCALPING' ? 'M5' : 'H4';
    return pairs.map((pair) => {
      if (chartBrainSnapshot && chartBrainSnapshot.symbol === pair.symbol) {
        return chartBrainSnapshot;
      }
      const candles = generateMt5Candles(pair.symbol, pair.price, tf, 140);
      return analyzeStrategyBrain(candles, pair.symbol, tf).snapshot;
    });
  }, [pairs, tradingStyle, chartBrainSnapshot]);

  const activeBrain = useMemo(
    () =>
      chartBrainSnapshot && chartBrainSnapshot.symbol === selectedSymbol
        ? chartBrainSnapshot
        : allPairBrains.find((b) => b.symbol === selectedSymbol) ?? allPairBrains[0] ?? null,
    [chartBrainSnapshot, allPairBrains, selectedSymbol]
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

  const handlePlaceOrder = (order: Omit<Position, 'id' | 'openedAt'>) => {
    if (mt5Connected) {
      const base = serverConfig.apiBaseUrl.replace(/\/$/, '');
      void fetch(`${base}/api/orders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symbol: order.symbol,
          side: order.side,
          lotSize: order.lotSize,
          stopLoss: order.stopLoss,
          takeProfit: order.takeProfit,
        }),
      }).then(() => refreshMt5Now());
      return;
    }

    const now = new Date().toLocaleTimeString('en-GB');
    const newPos: Position = {
      ...order,
      id: `MT5-${Math.floor(508500 + Math.random() * 4000)}`,
      openedAt: now,
    };
    setPositions((prev) => [newPos, ...prev]);
  };

  const handleClosePosition = (id: string) => {
    if (mt5Connected) {
      const base = serverConfig.apiBaseUrl.replace(/\/$/, '');
      void fetch(`${base}/api/close`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ positionId: id }),
      }).then(() => refreshMt5Now());
      return;
    }

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
  };

  const handleUpdateTargets = (id: string, stopLoss: number | null, takeProfit: number | null) => {
    if (mt5Connected) {
      const base = serverConfig.apiBaseUrl.replace(/\/$/, '');
      void fetch(`${base}/api/modify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ positionId: id, stopLoss, takeProfit }),
      }).then(() => refreshMt5Now());
    }
    setPositions((prev) =>
      prev.map((pos) => (pos.id === id ? { ...pos, stopLoss, takeProfit } : pos))
    );
  };

  const handleKillAllPositions = () => {
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
        handleKillAllPositions();
        return 'Barcha MT5 pozitsiyalar yopildi';
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
      const tf = (String(args.timeframe || (style === 'SCALPING' ? 'M5' : 'H4')).toUpperCase()) as Timeframe;
      const validStrategies: BacktestStrategyId[] = [
        'all_6_confluence',
        'smc_luxalgo',
        'scalp_pullback',
        'ema_ribbon_rsi',
        'vwap_bands',
      ];
      const requestedStrat = String(args.strategyId || 'all_6_confluence') as BacktestStrategyId;
      const strategyId: BacktestStrategyId = validStrategies.includes(requestedStrat)
        ? requestedStrat
        : 'all_6_confluence';
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
      return 'AI To‘liq Bozor Skaneri ochildi';
    }

    if (name === 'toggle_ai_autotrader') {
      const enabled = Boolean(args.enabled);
      setFullAiPermissions(enabled);
      return `AI avto-savdo huquqi ${enabled ? 'yoqildi' : 'o‘chirildi'}`;
    }

    return `${name} bajarildi`;
  };

  const handleExecuteRecommendation = (rec: AiRecommendation) => {
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
    setActiveView('positions');
  };

  const handleExecuteScanSignal = (sig: AiScanSignal) => {
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
    setActiveView('positions');
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

  const currentTitle = NAV_ITEMS.find((n) => n.id === activeView)?.label ?? 'MT5 Terminal';

  return (
    <div className="min-h-screen flex bg-slate-50 dark:bg-[#0C111C] text-slate-900 dark:text-slate-100">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex w-64 shrink-0 flex-col justify-between border-r border-slate-200 dark:border-slate-800/90 bg-white dark:bg-[#101624]">
        <div>
          <div className="h-16 px-6 flex items-center border-b border-slate-200 dark:border-slate-800">
            <a
              href="#top"
              onClick={(e) => {
                e.preventDefault();
                setActiveView('terminal');
              }}
              className="font-display text-lg font-bold tracking-tight text-slate-900 dark:bg-gradient-to-r dark:from-[#F25F8C] dark:via-[#EB6B7B] dark:to-[#E87769] dark:bg-clip-text dark:text-transparent whitespace-nowrap shrink-0"
            >
              Trade Killer AI
            </a>
          </div>

          <nav className="p-4 space-y-1" aria-label="Asosiy menyu">
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const isActive = activeView === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActiveView(item.id)}
                  className={`w-full flex items-center gap-3 px-3.5 py-2.5 text-sm font-medium rounded-lg transition-all whitespace-nowrap shrink-0 cursor-pointer ${
                    isActive
                      ? 'bg-slate-900 text-white dark:bg-[#F25F8C]/15 dark:text-[#FF7AA5] dark:border dark:border-[#F25F8C]/40 dark:neon-glow-cyan'
                      : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/60 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  <Icon className="w-4 h-4 shrink-0" />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </nav>
        </div>

        <div className="p-4 border-t border-slate-200 dark:border-slate-800 space-y-3">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 px-1">
            <span>MT5 Hisob</span>
            <span className="font-mono tabular-nums text-slate-900 dark:text-[#FF7AA5]">
              #{serverConfig.mt5Login}
            </span>
          </div>
          <button
            type="button"
            onClick={() => setKillModalOpen(true)}
            className="w-full flex items-center justify-center gap-2 py-2.5 px-4 text-xs font-semibold rounded-lg bg-red-600/10 text-red-600 dark:text-rose-400 dark:border dark:border-rose-500/30 hover:bg-red-600 hover:text-white transition-colors cursor-pointer whitespace-nowrap"
          >
            <Power className="w-3.5 h-3.5" />
            <span>Barcha savdolarni yopish</span>
          </button>
        </div>
      </aside>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div className="fixed inset-0 bg-black/70" onClick={() => setMobileMenuOpen(false)} />
          <aside className="relative z-10 w-64 max-w-[80vw] bg-white dark:bg-[#101624] border-r border-slate-200 dark:border-slate-800/90 flex flex-col justify-between p-4">
            <div>
              <div className="flex items-center justify-between pb-4 mb-4 border-b border-slate-200 dark:border-slate-800">
                <span className="font-display text-lg font-bold text-slate-900 dark:bg-gradient-to-r dark:from-[#F25F8C] dark:to-[#E87769] dark:bg-clip-text dark:text-transparent">
                  Trade Killer AI
                </span>
                <button
                  type="button"
                  onClick={() => setMobileMenuOpen(false)}
                  className="p-1.5 text-slate-500 hover:text-slate-900 dark:hover:text-white cursor-pointer"
                  aria-label="Menyuni yopish"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <nav className="space-y-1">
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
                      className={`w-full flex items-center gap-3 px-3.5 py-2.5 text-sm font-medium rounded-lg whitespace-nowrap cursor-pointer ${
                        isActive
                          ? 'bg-slate-900 text-white dark:bg-[#F25F8C]/15 dark:text-[#FF7AA5] dark:border dark:border-[#F25F8C]/40'
                          : 'text-slate-600 dark:text-slate-400'
                      }`}
                    >
                      <Icon className="w-4 h-4 shrink-0" />
                      <span>{item.label}</span>
                    </button>
                  );
                })}
              </nav>
            </div>
            <button
              type="button"
              onClick={() => {
                setMobileMenuOpen(false);
                setKillModalOpen(true);
              }}
              className="w-full flex items-center justify-center gap-2 py-2.5 px-4 text-xs font-semibold rounded-lg bg-red-600/10 text-red-600 dark:text-rose-400"
            >
              <Power className="w-3.5 h-3.5" />
              <span>Barcha savdolarni yopish</span>
            </button>
          </aside>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Bar Contract */}
        <header className="h-16 px-4 sm:px-6 border-b border-slate-200 dark:border-slate-800/90 bg-white dark:bg-[#101624] flex items-center justify-between gap-4 sm:gap-8">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              className="lg:hidden p-2 -ml-2 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white cursor-pointer"
              aria-label="Menyuni ochish"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="text-sm text-slate-500 dark:text-slate-400 truncate whitespace-nowrap">
              <span>Trade Killer AI</span>
              <span className="mx-2" aria-hidden="true">
                /
              </span>
              <span className="font-medium text-[#C8285E] dark:text-[#FF7AA5]">{currentTitle}</span>
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <button
              type="button"
              onClick={() => setDarkMode((prev) => !prev)}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:border-[#F25F8C]/50 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              aria-label="Mavzuni almashtirish"
            >
              {darkMode ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
              <span className="hidden sm:inline">{darkMode ? 'Yorug‘ rejim' : 'Tungi rejim'}</span>
            </button>

            <button
              type="button"
              onClick={handleExportStandaloneHtml}
              className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg bg-gradient-to-r from-[#F25F8C] via-[#EB6B7B] to-[#E87769] text-slate-950 hover:brightness-110 neon-glow-cyan transition-all whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span>index.html yuklab olish</span>
            </button>
          </div>
        </header>

        {/* Main Viewport */}
        <main className="p-4 sm:p-6 max-w-[1400px] w-full mx-auto space-y-6">
          {activeView === 'terminal' && (
            <>
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-50">
                    MetaTrader 5 AI Terminali
                  </h1>
                  <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
                    Real MT5 shamlari, 6-strategiya AI miyasi, skalping / uzoq muddatli savdo va tarixiy backtest.
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      if (!mt5Connected) {
                        setShowConnectionNotice(true);
                        setSyncTrigger((n) => n + 1);
                      }
                      setLiveTicks((prev) => !prev);
                    }}
                    className={`px-3.5 py-2 text-xs font-medium rounded-lg border transition-colors whitespace-nowrap cursor-pointer ${
                      mt5Connected
                        ? 'border-emerald-500/40 bg-emerald-500/15 text-emerald-600 dark:text-emerald-300'
                        : liveTicks
                          ? 'border-[#F25F8C]/45 bg-[#F25F8C]/12 text-[#C8285E] dark:text-[#FF7AA5]'
                          : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    {mt5Connected
                      ? `MT5 Real Ulangan (#${serverConfig.mt5Login})`
                      : liveTicks
                        ? 'Simulyatsiya oqimi: Faol'
                        : 'Oqim: To‘xtatilgan'}
                  </button>
                </div>
              </div>

              {!mt5Connected && showConnectionNotice && (
                <div className="rounded-xl border border-[#F25F8C]/40 bg-white dark:bg-[#131B2B] p-4 flex flex-wrap items-center justify-between gap-4">
                  <div className="space-y-1 max-w-3xl">
                    <div className="text-xs font-semibold text-[#C8285E] dark:text-[#FF7AA5]">
                      {mt5SyncStatus === 'https_blocked'
                        ? 'Bulut (HTTPS) brauzeridan kompyuteringizdagi MT5 ga to‘g‘ridan-to‘g‘ri ulanish bloklangan'
                        : mt5SyncStatus === 'mt5_error'
                          ? 'MT5 Bridge ishlayapti, lekin MetaTrader 5 terminali ulanmadi'
                          : 'Lokal MT5 Bridge (127.0.0.1:8000) topilmadi — hozir demo simulyatsiya ko‘rsatilmoqda'}
                    </div>
                    <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                      {mt5SyncStatus === 'https_blocked'
                        ? 'Brauzer xavfsizlik qoidasi sababli HTTPS sayt ichidan kompyuterdagi http://127.0.0.1:8000 ga murojaatni bloklaydi. Real MT5 shamlari va haqiqiy balansingizni ko‘rish uchun "VS Code · MT5" bo‘limidan fayllarni yuklab olib, kompyuterda "python mt5_bridge.py" ni yoqing va brauzerda to‘g‘ridan-to‘g‘ri http://127.0.0.1:8000 manzilini oching.'
                        : mt5SyncStatus === 'mt5_error'
                          ? mt5ErrorDetail
                          : 'MetaTrader 5 kompyuteringizda ochiq bo‘lsa ham, veb-interfeys bilan bog‘lash uchun "VS Code · MT5" bo‘limidan mt5_bridge.py va index.html ni yuklab olib "python mt5_bridge.py" ni ishga tushiring.'}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => setSyncTrigger((n) => n + 1)}
                      className="px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:border-[#F25F8C]/50 cursor-pointer whitespace-nowrap"
                    >
                      Qayta tekshirish
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveView('server')}
                      className="px-3.5 py-1.5 text-xs font-semibold rounded-lg bg-gradient-to-r from-[#F25F8C] via-[#EB6B7B] to-[#E87769] text-slate-950 hover:brightness-110 cursor-pointer whitespace-nowrap"
                    >
                      MT5 ga ulash yo‘riqnomasi
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowConnectionNotice(false)}
                      aria-label="Xabarni yopish"
                      className="p-1.5 text-slate-400 hover:text-slate-200 cursor-pointer"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
                <div className="rounded-xl border border-slate-200 dark:border-slate-800/90 bg-white dark:bg-[#131B2B] neon-surface p-5">
                  <div className="text-xs text-slate-500 dark:text-slate-400">MT5 Kapital (Equity)</div>
                  <div className="mt-2 text-2xl font-semibold font-mono tabular-nums text-slate-900 dark:text-white">
                    {formatCurrency(metrics.totalEquity)}
                  </div>
                  <div className="mt-1.5 text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums">
                    Erkin marja: {formatCurrency(metrics.availableBalance)}
                  </div>
                </div>

                <div className="rounded-xl border border-slate-200 dark:border-slate-800/90 bg-white dark:bg-[#131B2B] neon-surface p-5">
                  <div className="text-xs text-slate-500 dark:text-slate-400">Ochiq pozitsiyalar PnL</div>
                  <div
                    className={`mt-2 text-2xl font-semibold font-mono tabular-nums ${
                      metrics.openPnl >= 0
                        ? 'text-emerald-600 dark:text-emerald-400'
                        : 'text-red-600 dark:text-rose-400'
                    }`}
                  >
                    {metrics.openPnl >= 0 ? '+' : ''}
                    {formatCurrency(metrics.openPnl)}
                  </div>
                  <div className="mt-1.5 text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums">
                    Ochiq ticketlar: {metrics.openCount} / {riskGuard.maxOpenPositions}
                  </div>
                </div>

                <div className="rounded-xl border border-slate-200 dark:border-slate-800/90 bg-white dark:bg-[#131B2B] neon-surface p-5">
                  <div className="text-xs text-slate-500 dark:text-slate-400">Bugungi yopilgan natija</div>
                  <div
                    className={`mt-2 text-2xl font-semibold font-mono tabular-nums ${
                      metrics.realizedToday >= 0
                        ? 'text-emerald-600 dark:text-emerald-400'
                        : 'text-red-600 dark:text-rose-400'
                    }`}
                  >
                    {metrics.realizedToday >= 0 ? '+' : ''}
                    {formatCurrency(metrics.realizedToday)}
                  </div>
                  <div className="mt-1.5 text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums">
                    Kunlik limit: -${riskGuard.dailyMaxLossUsdt}
                  </div>
                </div>

                <div className="rounded-xl border border-slate-200 dark:border-slate-800/90 bg-white dark:bg-[#131B2B] neon-surface p-5">
                  <div className="text-xs text-slate-500 dark:text-slate-400">Savdo Uslubi & AI</div>
                  <div className="mt-2 text-xl font-semibold text-[#C8285E] dark:text-[#FF7AA5]">
                    {tradingStyle === 'SCALPING' ? 'Skalping' : 'Uzoq muddatli'}
                  </div>
                  <div className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">
                    AI Huquqi: {fullAiPermissions ? 'To‘liq avtonom' : 'Faqat tahlil'}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-stretch">
                <div className="xl:col-span-8">
                  <PriceChart
                    pairs={pairs}
                    selectedSymbol={selectedSymbol}
                    onSelectSymbol={setSelectedSymbol}
                    serverConfig={serverConfig}
                    tradingStyle={tradingStyle}
                    onChangeStyle={setTradingStyle}
                    onBrainUpdate={setChartBrainSnapshot}
                  />
                </div>
                <div className="xl:col-span-4">
                  <OrderPanel
                    pair={activePair}
                    availableBalance={metrics.availableBalance}
                    equity={metrics.totalEquity}
                    onPlaceOrder={handlePlaceOrder}
                  />
                </div>
              </div>

              <AiTradingPanel
                pairs={pairs}
                selectedSymbol={selectedSymbol}
                tradingStyle={tradingStyle}
                positions={positions}
                strategies={strategies}
                riskGuard={riskGuard}
                brainSnapshot={activeBrain}
                allPairBrains={allPairBrains}
                accountMetrics={{
                  balance: baseBalance,
                  equity: metrics.totalEquity,
                  openPnl: metrics.openPnl,
                  availableMargin: metrics.availableBalance,
                }}
                fullPermissions={fullAiPermissions}
                onToggleFullPermissions={setFullAiPermissions}
                onExecuteAiFunctionCall={handleExecuteAiFunctionCall}
                onExecuteRecommendation={handleExecuteRecommendation}
                compact
              />

              <PositionsTable
                positions={positions}
                onClosePosition={handleClosePosition}
                onUpdateTargets={handleUpdateTargets}
                onSelectPair={setSelectedSymbol}
              />
            </>
          )}

          {activeView === 'ai' && (
            <AiTradingPanel
              pairs={pairs}
              selectedSymbol={selectedSymbol}
              tradingStyle={tradingStyle}
              positions={positions}
              strategies={strategies}
              riskGuard={riskGuard}
              brainSnapshot={activeBrain}
              allPairBrains={allPairBrains}
              accountMetrics={{
                balance: baseBalance,
                equity: metrics.totalEquity,
                openPnl: metrics.openPnl,
                availableMargin: metrics.availableBalance,
              }}
              fullPermissions={fullAiPermissions}
              onToggleFullPermissions={setFullAiPermissions}
              onExecuteAiFunctionCall={handleExecuteAiFunctionCall}
              onExecuteRecommendation={handleExecuteRecommendation}
            />
          )}

          {activeView === 'backtest' && (
            <BacktestView
              pairs={pairs}
              serverConfig={serverConfig}
              initialParams={aiBacktestTrigger}
            />
          )}

          {activeView === 'positions' && (
            <PositionsTable
              positions={positions}
              onClosePosition={handleClosePosition}
              onUpdateTargets={handleUpdateTargets}
              onSelectPair={(sym) => {
                setSelectedSymbol(sym);
                setActiveView('terminal');
              }}
              title="Barcha MT5 faol va tarixiy savdolar"
            />
          )}

          {activeView === 'strategies' && (
            <StrategiesView
              strategies={strategies}
              riskGuard={riskGuard}
              onToggleStrategy={handleToggleStrategy}
              onUpdateStrategy={handleUpdateStrategy}
              onUpdateRiskGuard={setRiskGuard}
            />
          )}

          {activeView === 'scanner' && (
            <ScannerView
              pairs={pairs}
              allPairBrains={allPairBrains}
              onTradePair={(sym) => {
                setSelectedSymbol(sym);
                setActiveView('terminal');
              }}
              onExecuteSignal={handleExecuteScanSignal}
            />
          )}

          {activeView === 'server' && (
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
          )}
        </main>
      </div>

      {killModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-md rounded-xl border border-slate-200 dark:border-rose-500/35 bg-white dark:bg-[#090F1C] p-6">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
              Barcha MT5 pozitsiyalarini yopish
            </h2>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
              Ushbu amal MetaTrader 5 dagi barcha ochiq pozitsiyalarni joriy bozor narxida yopadi va kutilayotgan buyurtmalarni bekor qiladi. Davom etasizmi?
            </p>
            <div className="mt-6 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setKillModalOpen(false)}
                className="px-4 py-2 text-sm font-medium rounded-lg border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              >
                Bekor qilish
              </button>
              <button
                type="button"
                onClick={handleKillAllPositions}
                className="px-4 py-2 text-sm font-semibold rounded-lg bg-rose-600 text-white hover:bg-rose-500 cursor-pointer"
              >
                Ha, barchasini yopish
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
