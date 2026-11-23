import React, { useEffect, useMemo, useState } from 'react';
import {
  CandlePoint,
  MarketPair,
  ServerConfig,
  StrategyBrainSnapshot,
  Timeframe,
  TradingStyle,
} from '../types/trading';
import { formatPrice } from '../config/initialData';
import { generateMt5Candles } from '../utils/backtestEngine';
import { analyzeStrategyBrain, StrategyBrainAnalysis } from '../utils/strategyBrain';

interface PriceChartProps {
  pairs: MarketPair[];
  selectedSymbol: string;
  onSelectSymbol: (symbol: string) => void;
  serverConfig: ServerConfig;
  tradingStyle: TradingStyle;
  onChangeStyle: (style: TradingStyle) => void;
  timeframe?: Timeframe;
  onTimeframeChange?: (tf: Timeframe) => void;
  onBrainUpdate?: (snapshot: StrategyBrainSnapshot) => void;
  onFullBrainUpdate?: (analysis: StrategyBrainAnalysis) => void;
  onCandlesUpdate?: (candles: CandlePoint[]) => void;
  tradeLevels?: {
    entry: number;
    stopLoss: number;
    takeProfit: number;
    action: string;
  } | null;
}

const TIMEFRAMES: Timeframe[] = ['M1', 'M5', 'M15', 'M30', 'H1', 'H4', 'D1', 'W1'];

export const PriceChart: React.FC<PriceChartProps> = ({
  pairs,
  selectedSymbol,
  onSelectSymbol,
  serverConfig,
  tradingStyle,
  onChangeStyle,
  timeframe: controlledTimeframe,
  onTimeframeChange,
  onBrainUpdate,
  onFullBrainUpdate,
  onCandlesUpdate,
  tradeLevels,
}) => {
  const [internalTimeframe, setInternalTimeframe] = useState<Timeframe>(
    tradingStyle === 'SCALPING' ? 'M5' : 'H4'
  );
  const timeframe = controlledTimeframe ?? internalTimeframe;
  const setTimeframe = (tf: Timeframe) => {
    setInternalTimeframe(tf);
    if (onTimeframeChange) onTimeframeChange(tf);
  };

  const [chartType, setChartType] = useState<'candles' | 'area'>('candles');
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const [mt5LiveCandles, setMt5LiveCandles] = useState<CandlePoint[] | null>(null);
  const [candleSource, setCandleSource] = useState<'MT5 Real Shamlar' | 'Lokal Simulyatsiya'>(
    'Lokal Simulyatsiya'
  );

  const [showEmaRibbon, setShowEmaRibbon] = useState(true);
  const [showPac, setShowPac] = useState(false);
  const [showVwap, setShowVwap] = useState(false);
  const [showSmc, setShowSmc] = useState(true);
  const [showRsiBars, setShowRsiBars] = useState(true);
  const [showSupertrend, setShowSupertrend] = useState(false);
  const [showUtZlsma, setShowUtZlsma] = useState(false);
  const [showIchimoku, setShowIchimoku] = useState(false);
  const [showCandlePatterns, setShowCandlePatterns] = useState(true);
  const [showChartPatterns, setShowChartPatterns] = useState(true);
  const [showTradeLevels, setShowTradeLevels] = useState(true);

  useEffect(() => {
    if (!controlledTimeframe) {
      setInternalTimeframe(tradingStyle === 'SCALPING' ? 'M5' : 'H4');
    }
  }, [tradingStyle, controlledTimeframe]);

  const activePair = useMemo(
    () => pairs.find((p) => p.symbol === selectedSymbol) ?? pairs[0],
    [pairs, selectedSymbol]
  );

  // Fetch & live-poll real MT5 candles from PC mt5_bridge.py so chart matches MT5 bar-by-bar
  useEffect(() => {
    let cancelled = false;
    async function loadMt5Candles() {
      const primaryBase = serverConfig.apiBaseUrl.replace(/\/$/, '');
      const candidates =
        primaryBase === 'http://127.0.0.1:8000'
          ? [primaryBase, 'http://localhost:8000']
          : [primaryBase];

      for (const base of candidates) {
        try {
          const controller = new AbortController();
          const timeout = window.setTimeout(() => controller.abort(), 1600);
          const res = await fetch(
            `${base}/api/candles?symbol=${encodeURIComponent(selectedSymbol)}&timeframe=${timeframe}&count=180`,
            { signal: controller.signal }
          );
          window.clearTimeout(timeout);
          if (!res.ok) continue;
          const data = await res.json();
          if (!cancelled && Array.isArray(data.candles) && data.candles.length > 20) {
            setMt5LiveCandles(data.candles);
            setCandleSource('MT5 Real Shamlar');
            return;
          }
        } catch {
          // Try next candidate
        }
      }
      if (!cancelled) {
        setMt5LiveCandles(null);
        setCandleSource('Lokal Simulyatsiya');
      }
    }
    loadMt5Candles();
    if (!serverConfig.autoSyncMt5) {
      return () => {
        cancelled = true;
      };
    }
    const timer = window.setInterval(loadMt5Candles, Math.max(1500, serverConfig.pollingIntervalMs || 2000));
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [selectedSymbol, timeframe, serverConfig.apiBaseUrl, serverConfig.autoSyncMt5, serverConfig.pollingIntervalMs]);

  // Keep 180 bars so EMA 100/200, Swing SMC, PAC 34, and RSI Divergences warm up cleanly
  const fullCandles: CandlePoint[] = useMemo(() => {
    if (mt5LiveCandles && mt5LiveCandles.length > 20) {
      return mt5LiveCandles.slice(-180);
    }
    return generateMt5Candles(activePair.symbol, activePair.price, timeframe, 180).map(
      (c, idx, arr) => (idx === arr.length - 1 ? { ...c, close: activePair.price } : c)
    );
  }, [mt5LiveCandles, activePair.symbol, activePair.price, timeframe]);

  const brain = useMemo(
    () => analyzeStrategyBrain(fullCandles, activePair.symbol, timeframe),
    [fullCandles, activePair.symbol, timeframe]
  );

  useEffect(() => {
    if (onCandlesUpdate) {
      onCandlesUpdate(fullCandles);
    }
  }, [fullCandles, onCandlesUpdate]);

  useEffect(() => {
    if (onBrainUpdate) {
      onBrainUpdate(brain.snapshot);
    }
    if (onFullBrainUpdate) {
      onFullBrainUpdate(brain);
    }
  }, [brain, onBrainUpdate, onFullBrainUpdate]);

  const viewCount = 48;
  const startOffset = Math.max(0, fullCandles.length - viewCount);
  const candles = useMemo(() => fullCandles.slice(startOffset), [fullCandles, startOffset]);

  const width = 760;
  const height = 320;
  const padTop = 20;
  const padBottom = 28;
  const padLeft = 10;
  const padRight = 68;
  const plotW = width - padLeft - padRight;
  const plotH = height - padTop - padBottom;

  const { minPrice, maxPrice, maxVol } = useMemo(() => {
    let min = Infinity;
    let max = -Infinity;
    let mVol = 1;
    for (let i = 0; i < candles.length; i++) {
      const c = candles[i];
      const gi = startOffset + i;
      if (c.low < min) min = c.low;
      if (c.high > max) max = c.high;
      if (showEmaRibbon) {
        min = Math.min(min, brain.series.ema20[gi], brain.series.ema200[gi]);
        max = Math.max(max, brain.series.ema20[gi], brain.series.ema200[gi]);
      }
      if (showVwap) {
        min = Math.min(min, brain.series.vwapLower201[gi]);
        max = Math.max(max, brain.series.vwapUpper201[gi]);
      }
      if (showSupertrend) {
        min = Math.min(min, brain.series.supertrend1[gi]);
        max = Math.max(max, brain.series.supertrend1[gi]);
      }
      if (showUtZlsma) {
        min = Math.min(min, brain.series.utStop[gi], brain.series.zlsma14[gi]);
        max = Math.max(max, brain.series.utStop[gi], brain.series.zlsma14[gi]);
      }
      if (showIchimoku) {
        min = Math.min(min, brain.series.ichimokuSpanA[gi], brain.series.ichimokuSpanB[gi]);
        max = Math.max(max, brain.series.ichimokuSpanA[gi], brain.series.ichimokuSpanB[gi]);
      }
      if (c.volume > mVol) mVol = c.volume;
    }
    const padding = (max - min) * 0.1 || activePair.price * 0.005;
    return { minPrice: min - padding, maxPrice: max + padding, maxVol: mVol };
  }, [candles, startOffset, brain.series, showEmaRibbon, showVwap, showSupertrend, showUtZlsma, showIchimoku, activePair.price]);

  const priceToY = (price: number) => {
    const ratio = (price - minPrice) / (maxPrice - minPrice || 1);
    return padTop + plotH - ratio * plotH;
  };

  const stepX = plotW / Math.max(1, candles.length);

  const buildOverlayPath = (arr: number[]) =>
    candles
      .map((_, i) => {
        const x = padLeft + i * stepX + stepX / 2;
        const y = priceToY(arr[startOffset + i]);
        return `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`;
      })
      .join(' ');

  const areaPath = useMemo(() => {
    if (candles.length === 0) return '';
    const points = candles.map((c, i) => {
      const x = padLeft + i * stepX + stepX / 2;
      const y = priceToY(c.close);
      return `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`;
    });
    const lastX = padLeft + (candles.length - 1) * stepX + stepX / 2;
    const firstX = padLeft + stepX / 2;
    const bottomY = padTop + plotH;
    return `${points.join(' ')} L ${lastX.toFixed(1)} ${bottomY} L ${firstX.toFixed(1)} ${bottomY} Z`;
  }, [candles, stepX, minPrice, maxPrice]);

  const linePath = useMemo(() => {
    if (candles.length === 0) return '';
    return candles
      .map((c, i) => {
        const x = padLeft + i * stepX + stepX / 2;
        const y = priceToY(c.close);
        return `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`;
      })
      .join(' ');
  }, [candles, stepX, minPrice, maxPrice]);

  const hoveredCandle = hoverIndex !== null ? candles[hoverIndex] : candles[candles.length - 1];
  const isPositive = activePair.change24h >= 0;
  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((t) => minPrice + (maxPrice - minPrice) * t);

  const snap = brain.snapshot;

  return (
    <section className="rounded-xl border border-slate-200 dark:border-slate-800/90 bg-white dark:bg-[#131B2B] neon-surface p-5 h-full">
      <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-slate-200 dark:border-slate-800">
        <div className="flex flex-wrap items-center gap-3">
          <select
            aria-label="MT5 instrumentni tanlash"
            value={selectedSymbol}
            onChange={(e) => onSelectSymbol(e.target.value)}
            className="px-3 py-2 text-sm font-semibold rounded-lg border border-slate-200 dark:border-[#F25F8C]/35 bg-slate-50 dark:bg-[#0D1320] text-[#C8285E] dark:text-[#FF7AA5] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#F25F8C]"
          >
            {pairs.map((p) => (
              <option key={p.symbol} value={p.symbol}>
                {p.symbol}
              </option>
            ))}
          </select>

          <div className="flex items-baseline gap-2.5">
            <span className="text-2xl font-semibold font-mono tabular-nums text-slate-900 dark:text-white">
              {formatPrice(activePair.price)}
            </span>
            <span
              className={`text-sm font-mono tabular-nums font-medium ${
                isPositive ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-rose-400'
              }`}
            >
              {isPositive ? '+' : ''}
              {activePair.change24h.toFixed(2)}%
            </span>
          </div>

          <div className="flex items-center gap-1 p-1 rounded-lg bg-slate-100 dark:bg-[#0D1320] border border-slate-200 dark:border-slate-800">
            <button
              type="button"
              onClick={() => onChangeStyle('SCALPING')}
              className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                tradingStyle === 'SCALPING'
                  ? 'bg-white dark:bg-violet-500/20 text-slate-900 dark:text-violet-300'
                  : 'text-slate-500 dark:text-slate-400'
              }`}
            >
              Skalping
            </button>
            <button
              type="button"
              onClick={() => onChangeStyle('LONG_TERM')}
              className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                tradingStyle === 'LONG_TERM'
                  ? 'bg-white dark:bg-violet-500/20 text-slate-900 dark:text-violet-300'
                  : 'text-slate-500 dark:text-slate-400'
              }`}
            >
              Uzoq muddatli
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-0.5 p-1 rounded-lg bg-slate-100 dark:bg-[#070C18] border border-slate-200 dark:border-violet-500/20">
            {TIMEFRAMES.map((tf) => (
              <button
                key={tf}
                type="button"
                onClick={() => setTimeframe(tf)}
                className={`px-2 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  timeframe === tf
                    ? 'bg-white dark:bg-sky-500/20 text-slate-900 dark:text-sky-300'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                {tf}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1 p-1 rounded-lg bg-slate-100 dark:bg-[#070C18] border border-slate-200 dark:border-violet-500/20">
            <button
              type="button"
              onClick={() => setChartType('candles')}
              className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                chartType === 'candles'
                  ? 'bg-white dark:bg-violet-500/20 text-slate-900 dark:text-violet-300'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              Shamlar
            </button>
            <button
              type="button"
              onClick={() => setChartType('area')}
              className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                chartType === 'area'
                  ? 'bg-white dark:bg-violet-500/20 text-slate-900 dark:text-violet-300'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              Chiziqli
            </button>
          </div>
        </div>
      </div>

      {/* Indicator Overlay Toggles + OHLC Row */}
      <div className="flex flex-wrap items-center justify-between gap-2 py-2 text-xs font-mono tabular-nums text-slate-500 dark:text-slate-400 border-b border-slate-100 dark:border-violet-500/15">
        <div className="flex flex-wrap items-center gap-3">
          <span>Vaqt: {hoveredCandle.time}</span>
          <span>O: {formatPrice(hoveredCandle.open)}</span>
          <span>H: {formatPrice(hoveredCandle.high)}</span>
          <span>L: {formatPrice(hoveredCandle.low)}</span>
          <span className="text-sky-600 dark:text-sky-400 font-medium">
            C: {formatPrice(hoveredCandle.close)}
          </span>
          <span className={candleSource === 'MT5 Real Shamlar' ? 'text-[#00E5A0]' : 'text-slate-400'}>
            · {candleSource}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-1 font-sans">
          {[
            { label: 'Entry/SL/TP', active: showTradeLevels, toggle: () => setShowTradeLevels((v) => !v) },
            { label: 'EMA 20/50/100/200', active: showEmaRibbon, toggle: () => setShowEmaRibbon((v) => !v) },
            { label: 'PAC 34', active: showPac, toggle: () => setShowPac((v) => !v) },
            { label: 'VWAP ±2σ', active: showVwap, toggle: () => setShowVwap((v) => !v) },
            { label: 'SMC OB/BOS', active: showSmc, toggle: () => setShowSmc((v) => !v) },
            { label: 'RSI Bars/Div', active: showRsiBars, toggle: () => setShowRsiBars((v) => !v) },
            { label: 'Supertrend', active: showSupertrend, toggle: () => setShowSupertrend((v) => !v) },
            { label: 'UT + ZLSMA', active: showUtZlsma, toggle: () => setShowUtZlsma((v) => !v) },
            { label: 'Ichimoku', active: showIchimoku, toggle: () => setShowIchimoku((v) => !v) },
            { label: 'Shamlar', active: showCandlePatterns, toggle: () => setShowCandlePatterns((v) => !v) },
            { label: 'Pattern', active: showChartPatterns, toggle: () => setShowChartPatterns((v) => !v) },
          ].map((btn) => (
            <button
              key={btn.label}
              type="button"
              onClick={btn.toggle}
              className={`px-2 py-0.5 text-[10.5px] font-medium rounded border transition-colors cursor-pointer whitespace-nowrap ${
                btn.active
                  ? 'border-sky-400/50 bg-sky-500/15 text-sky-700 dark:text-sky-300'
                  : 'border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 hover:border-violet-500/40'
              }`}
            >
              {btn.label}
            </button>
          ))}
        </div>
      </div>

      {/* Live 12-Strategy Brain Unboxed Strip */}
      <div className="flex flex-wrap items-center justify-between gap-2 py-2 text-[11px] font-mono tabular-nums text-slate-600 dark:text-slate-300">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span>
            EMA Fan:{' '}
            <strong className="text-violet-600 dark:text-violet-400">{snap.emaRibbon.alignment}</strong>
          </span>
          <span aria-hidden="true" className="text-slate-400">·</span>
          <span>
            RSI(14):{' '}
            <strong
              className={
                snap.rsiBars.rsi14 > 70
                  ? 'text-emerald-500'
                  : snap.rsiBars.rsi14 < 30
                    ? 'text-rose-500'
                    : 'text-slate-900 dark:text-white'
              }
            >
              {snap.rsiBars.rsi14.toFixed(1)}
            </strong>{' '}
            ({snap.rsiDivergence.latestType !== 'YO‘Q' ? `Div ${snap.rsiDivergence.latestType}` : 'Div yo‘q'})
          </span>
          <span aria-hidden="true" className="text-slate-400">·</span>
          <span>
            SMC: <strong className="text-sky-600 dark:text-sky-400">{snap.smc.lastStructureTag}</strong> ({snap.smc.zone})
          </span>
          <span aria-hidden="true" className="text-slate-400">·</span>
          <span>
            PAC34:{' '}
            <strong
              className={
                snap.scalpingPullback.signal === 'BUY'
                  ? 'text-emerald-400'
                  : snap.scalpingPullback.signal === 'SELL'
                    ? 'text-rose-400'
                    : 'text-slate-400'
              }
            >
              {snap.scalpingPullback.signal}
            </strong>
          </span>
          <span aria-hidden="true" className="text-slate-400">·</span>
          <span>
            UT:{' '}
            <strong
              className={
                snap.gerakedMt5.utBotSignal === 'BUY'
                  ? 'text-emerald-400'
                  : snap.gerakedMt5.utBotSignal === 'SELL'
                    ? 'text-rose-400'
                    : 'text-slate-400'
              }
            >
              {snap.gerakedMt5.utBotSignal}
            </strong>
          </span>
          <span aria-hidden="true" className="text-slate-400">·</span>
          <span>
            ST:{' '}
            <strong
              className={
                snap.alorseSuite.doubleSupertrend === 'DOUBLE_BULL'
                  ? 'text-emerald-400'
                  : snap.alorseSuite.doubleSupertrend === 'DOUBLE_BEAR'
                    ? 'text-rose-400'
                    : 'text-amber-400'
              }
            >
              {snap.alorseSuite.doubleSupertrend === 'DOUBLE_BULL'
                ? 'BULL'
                : snap.alorseSuite.doubleSupertrend === 'DOUBLE_BEAR'
                  ? 'BEAR'
                  : 'MIX'}
            </strong>
          </span>
          <span aria-hidden="true" className="text-slate-400">·</span>
          <span>ADX:{snap.pandasTaClassic.adx14.toFixed(0)}</span>
          <span aria-hidden="true" className="text-slate-400">·</span>
          <span>
            Kumo:{' '}
            <strong className="text-slate-900 dark:text-white">
              {snap.azadoneTools.kumoBias === 'BULL_KUMO'
                ? 'Bull'
                : snap.azadoneTools.kumoBias === 'BEAR_KUMO'
                  ? 'Bear'
                  : 'Ichida'}
            </strong>
          </span>
          <span aria-hidden="true" className="text-slate-400">·</span>
          <span>Lev:{snap.leviathan.signal}</span>
          {snap.azadoneTools.sweepSignal !== 'YO‘Q' && (
            <>
              <span aria-hidden="true" className="text-slate-400">·</span>
              <span className="text-[#FF7AA5] font-semibold">{snap.azadoneTools.sweepSignal}</span>
            </>
          )}
          {snap.alorseSuite.ttmSqueezeOn && (
            <>
              <span aria-hidden="true" className="text-slate-400">·</span>
              <span className="text-amber-400">Squeeze ON</span>
            </>
          )}
        </div>

        <div className="font-semibold">
          Miya Hukmi:{' '}
          <span
            className={
              (tradingStyle === 'SCALPING' ? snap.verdict.scalpingAction : snap.verdict.longTermAction) === 'BUY'
                ? 'text-emerald-500'
                : (tradingStyle === 'SCALPING' ? snap.verdict.scalpingAction : snap.verdict.longTermAction) === 'SELL'
                  ? 'text-rose-500'
                  : 'text-amber-500'
            }
          >
            {tradingStyle === 'SCALPING'
              ? `${snap.verdict.scalpingAction} (${snap.verdict.scalpingScore}%)`
              : `${snap.verdict.longTermAction} (${snap.verdict.longTermScore}%)`}
          </span>
        </div>
      </div>

      <div className="relative w-full overflow-hidden">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="w-full h-[290px] sm:h-[325px] select-none"
          onMouseLeave={() => setHoverIndex(null)}
        >
          <defs>
            <linearGradient id="tkNeonAreaGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#A855F7" stopOpacity="0.30" />
              <stop offset="55%" stopColor="#38BDF8" stopOpacity="0.12" />
              <stop offset="100%" stopColor="#00E5A0" stopOpacity="0" />
            </linearGradient>
            <linearGradient id="tkNeonStrokeGrad" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#A855F7" />
              <stop offset="55%" stopColor="#38BDF8" />
              <stop offset="100%" stopColor="#00E5A0" />
            </linearGradient>
          </defs>

          {yTicks.map((tick, idx) => {
            const y = priceToY(tick);
            return (
              <g key={idx}>
                <line
                  x1={padLeft}
                  y1={y}
                  x2={width - padRight}
                  y2={y}
                  stroke="currentColor"
                  className="text-slate-200 dark:text-slate-800/80"
                  strokeWidth="1"
                  strokeDasharray="3 3"
                />
                <text
                  x={width - padRight + 8}
                  y={y + 3.5}
                  fontSize="10.5"
                  fontFamily="JetBrains Mono, monospace"
                  className="fill-slate-500 dark:fill-slate-400"
                >
                  {formatPrice(tick)}
                </text>
              </g>
            );
          })}

          {/* SMC Active Order Blocks & Equilibrium */}
          {showSmc && (
            <g>
              {brain.activeOrderBlocks.slice(0, 4).map((ob, idx) => {
                const yTop = priceToY(ob.top);
                const yBot = priceToY(ob.bottom);
                const boxH = Math.max(3, Math.abs(yBot - yTop));
                const boxY = Math.min(yTop, yBot);
                const localStart = Math.max(0, ob.index - startOffset);
                const xStart = padLeft + localStart * stepX;
                return (
                  <rect
                    key={`ob-${idx}`}
                    x={xStart}
                    y={boxY}
                    width={Math.max(24, width - padRight - xStart)}
                    height={boxH}
                    fill={ob.bias === 1 ? '#3179f5' : '#f77c80'}
                    fillOpacity="0.16"
                    stroke={ob.bias === 1 ? '#3179f5' : '#f77c80'}
                    strokeOpacity="0.45"
                    strokeWidth="0.7"
                  />
                );
              })}

              {brain.smcEvents
                .filter((ev) => ev.index >= startOffset)
                .slice(-5)
                .map((ev, idx) => {
                  const localI = ev.index - startOffset;
                  const x = padLeft + localI * stepX + stepX / 2;
                  const y = priceToY(ev.price);
                  return (
                    <text
                      key={`smc-ev-${idx}`}
                      x={x}
                      y={ev.bias === 1 ? y - 4 : y + 10}
                      textAnchor="middle"
                      fontSize="9"
                      fontWeight="700"
                      fontFamily="JetBrains Mono, monospace"
                      fill={ev.bias === 1 ? '#00FF9D' : '#FF3B6B'}
                    >
                      {ev.tag}
                    </text>
                  );
                })}
            </g>
          )}

          {/* VWAP & Stdev Bands */}
          {showVwap && (
            <g fill="none">
              <path d={buildOverlayPath(brain.series.vwapUpper201)} stroke="#F05A70" strokeWidth="1" strokeDasharray="3 2" opacity="0.7" />
              <path d={buildOverlayPath(brain.series.vwapLower201)} stroke="#22C58B" strokeWidth="1" strokeDasharray="3 2" opacity="0.7" />
              <path d={buildOverlayPath(brain.series.vwap)} stroke="#cbd5e1" strokeWidth="1.2" opacity="0.8" />
            </g>
          )}

          {/* PAC 34 Channel + EMA 89/200 */}
          {showPac && (
            <g fill="none">
              <path d={buildOverlayPath(brain.series.pacU)} stroke="#94a3b8" strokeWidth="1" opacity="0.65" />
              <path d={buildOverlayPath(brain.series.pacL)} stroke="#94a3b8" strokeWidth="1" opacity="0.65" />
              <path d={buildOverlayPath(brain.series.pacC)} stroke="#F05A70" strokeWidth="1.3" opacity="0.85" />
              <path d={buildOverlayPath(brain.series.fastEma89)} stroke="#22C58B" strokeWidth="1.3" opacity="0.85" />
            </g>
          )}

          {/* EMA 20/50/100/200 Ribbon */}
          {showEmaRibbon && (
            <g fill="none">
              <path d={buildOverlayPath(brain.series.ema20)} stroke="#FB7185" strokeWidth="1.25" opacity="0.85" />
              <path d={buildOverlayPath(brain.series.ema50)} stroke="#FBBF24" strokeWidth="1.25" opacity="0.8" />
              <path d={buildOverlayPath(brain.series.ema100)} stroke="#38BDF8" strokeWidth="1.25" opacity="0.8" />
              <path d={buildOverlayPath(brain.series.ema200)} stroke="#818CF8" strokeWidth="1.4" opacity="0.8" />
            </g>
          )}

          {/* Ichimoku Kumo Cloud (azadone/trading-tools) */}
          {showIchimoku && candles.length > 1 && (
            <g>
              <path
                d={
                  candles
                    .map((_, i) => {
                      const x = padLeft + i * stepX + stepX / 2;
                      const y = priceToY(brain.series.ichimokuSpanA[startOffset + i]);
                      return `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`;
                    })
                    .join(' ') +
                  ' ' +
                  candles
                    .slice()
                    .reverse()
                    .map((_, ri) => {
                      const i = candles.length - 1 - ri;
                      const x = padLeft + i * stepX + stepX / 2;
                      const y = priceToY(brain.series.ichimokuSpanB[startOffset + i]);
                      return `L ${x.toFixed(1)} ${y.toFixed(1)}`;
                    })
                    .join(' ') +
                  ' Z'
                }
                fill={snap.azadoneTools.kumoBias === 'BEAR_KUMO' ? '#F05A70' : '#22C58B'}
                fillOpacity="0.12"
              />
              <path d={buildOverlayPath(brain.series.ichimokuSpanA)} fill="none" stroke="#22C58B" strokeWidth="0.9" opacity="0.55" />
              <path d={buildOverlayPath(brain.series.ichimokuSpanB)} fill="none" stroke="#F05A70" strokeWidth="0.9" opacity="0.55" />
              <path d={buildOverlayPath(brain.series.ichimokuTenkan)} fill="none" stroke="#38BDF8" strokeWidth="1.15" opacity="0.8" />
              <path d={buildOverlayPath(brain.series.ichimokuKijun)} fill="none" stroke="#F59E0B" strokeWidth="1.15" opacity="0.8" />
            </g>
          )}

          {/* Double Supertrend (Alorse/pinescript-strategies) */}
          {showSupertrend &&
            candles.slice(1).map((_, idx) => {
              const i = idx + 1;
              const gi = startOffset + i;
              const x1 = padLeft + (i - 1) * stepX + stepX / 2;
              const x2 = padLeft + i * stepX + stepX / 2;
              const y1 = priceToY(brain.series.supertrend1[gi - 1]);
              const y2 = priceToY(brain.series.supertrend1[gi]);
              const bull = brain.series.supertrend1Dir[gi] === 1;
              return (
                <line
                  key={`st-${i}`}
                  x1={x1}
                  y1={y1}
                  x2={x2}
                  y2={y2}
                  stroke={bull ? '#10B981' : '#EF4444'}
                  strokeWidth="1.6"
                  opacity="0.9"
                />
              );
            })}

          {/* UT Bot ATR Stop + ZLSMA 14 (geraked/metatrader5) */}
          {showUtZlsma && (
            <g fill="none">
              <path d={buildOverlayPath(brain.series.utStop)} stroke="#F25F8C" strokeWidth="1.35" strokeDasharray="4 2" opacity="0.9" />
              <path d={buildOverlayPath(brain.series.zlsma14)} stroke="#22D3EE" strokeWidth="1.35" opacity="0.9" />
            </g>
          )}

          {candles.map((c, i) => {
            const x = padLeft + i * stepX + stepX * 0.25;
            const barW = Math.max(2, stepX * 0.5);
            const barH = (c.volume / maxVol) * 32;
            const up = c.close >= c.open;
            return (
              <rect
                key={`vol-${i}`}
                x={x}
                y={padTop + plotH - barH}
                width={barW}
                height={barH}
                rx="1"
                className={up ? 'fill-emerald-400/20' : 'fill-rose-500/20'}
              />
            );
          })}

          {chartType === 'candles' ? (
            candles.map((c, i) => {
              const gi = startOffset + i;
              const cx = padLeft + i * stepX + stepX / 2;
              const bodyW = Math.max(4, stepX * 0.56);
              const yOpen = priceToY(c.open);
              const yClose = priceToY(c.close);
              const yHigh = priceToY(c.high);
              const yLow = priceToY(c.low);
              const up = c.close >= c.open;
              const bodyTop = Math.min(yOpen, yClose);
              const bodyHeight = Math.max(2, Math.abs(yClose - yOpen));
              const rsiVal = brain.series.rsi14[gi] ?? 50;

              let fill = up ? '#22C58B' : '#F05A70';
              if (showRsiBars) {
                if (rsiVal > 70) fill = '#10B981';
                else if (rsiVal < 30) fill = '#EF4444';
              }

              return (
                <g key={i}>
                  <line x1={cx} y1={yHigh} x2={cx} y2={yLow} stroke={fill} strokeWidth="1.4" />
                  <rect
                    x={cx - bodyW / 2}
                    y={bodyTop}
                    width={bodyW}
                    height={bodyHeight}
                    fill={fill}
                    rx="1"
                  />
                </g>
              );
            })
          ) : (
            <g>
              <path d={areaPath} fill="url(#tkNeonAreaGrad)" />
              <path d={linePath} fill="none" stroke="url(#tkNeonStrokeGrad)" strokeWidth="2.2" />
            </g>
          )}

          {/* RSI Divergence BULL / BEAR Markers */}
          {showRsiBars &&
            brain.divergences
              .filter((d) => d.index >= startOffset)
              .slice(-4)
              .map((d, idx) => {
                const localI = d.index - startOffset;
                const x = padLeft + localI * stepX + stepX / 2;
                const y = priceToY(d.price);
                return (
                  <text
                    key={`div-${idx}`}
                    x={x}
                    y={d.type === 'BULL' ? y + 14 : y - 8}
                    textAnchor="middle"
                    fontSize="9"
                    fontWeight="700"
                    fontFamily="JetBrains Mono, monospace"
                    fill={d.type === 'BULL' ? '#22C58B' : '#F05A70'}
                  >
                    {d.type}
                  </text>
                );
              })}

          {/* Chart Pattern Overlay (Active Breakout / Target / Pivot Polyline) */}
          {showChartPatterns &&
            snap.chartPatternReport?.activePattern &&
            (() => {
              const ap = snap.chartPatternReport.activePattern;
              const visiblePts = ap.points
                .filter((pt) => pt.index >= startOffset && pt.index < fullCandles.length)
                .map((pt) => {
                  const localI = pt.index - startOffset;
                  const x = padLeft + localI * stepX + stepX / 2;
                  const y = priceToY(pt.price);
                  return `${x.toFixed(1)},${y.toFixed(1)}`;
                });
              const breakoutY = priceToY(ap.breakoutLevel);
              const targetY = priceToY(ap.targetPrice);
              return (
                <g pointerEvents="none">
                  {visiblePts.length >= 2 && (
                    <polyline
                      fill="none"
                      stroke="#F25F8C"
                      strokeWidth="1.5"
                      strokeDasharray="3 2"
                      opacity="0.9"
                      points={visiblePts.join(' ')}
                    />
                  )}
                  {breakoutY >= padTop && breakoutY <= padTop + plotH && (
                    <line
                      x1={padLeft}
                      y1={breakoutY}
                      x2={width - padRight}
                      y2={breakoutY}
                      stroke="#F59E0B"
                      strokeWidth="0.9"
                      strokeDasharray="4 3"
                      opacity="0.7"
                    />
                  )}
                  {targetY >= padTop && targetY <= padTop + plotH && (
                    <line
                      x1={padLeft}
                      y1={targetY}
                      x2={width - padRight}
                      y2={targetY}
                      stroke="#22C58B"
                      strokeWidth="0.9"
                      strokeDasharray="2 3"
                      opacity="0.7"
                    />
                  )}
                  <text
                    x={padLeft + 6}
                    y={padTop + 12}
                    fontSize="9.5"
                    fontWeight="700"
                    fontFamily="JetBrains Mono, monospace"
                    fill="#FF7AA5"
                  >
                    {ap.name} ({ap.status})
                  </text>
                </g>
              );
            })()}

          {/* Candlestick Pattern Markers */}
          {showCandlePatterns &&
            snap.candlestickReport?.patterns
              .filter((pat) => pat.index >= startOffset && pat.confirmationStatus !== 'RAD_ETILGAN')
              .slice(-6)
              .map((pat) => {
                const localI = pat.index - startOffset;
                const bar = candles[localI];
                if (!bar) return null;
                const x = padLeft + localI * stepX + stepX / 2;
                const isBear = pat.bias === 'BEARISH';
                const y = isBear ? Math.max(padTop + 12, priceToY(bar.high) - 10) : Math.min(padTop + plotH - 4, priceToY(bar.low) + 14);
                const color =
                  pat.confirmationStatus === 'KUTILMOQDA'
                    ? '#F59E0B'
                    : isBear
                      ? '#FB7185'
                      : '#34D399';
                const shortName = pat.patternName.length > 14 ? `${pat.patternName.slice(0, 12)}..` : pat.patternName;
                return (
                  <text
                    key={pat.id}
                    x={x}
                    y={y}
                    textAnchor="middle"
                    fontSize="8.5"
                    fontWeight="700"
                    fontFamily="JetBrains Mono, monospace"
                    fill={color}
                  >
                    {shortName}
                  </text>
                );
              })}

          {/* AI Entry / Stop-Loss / Take-Profit Horizontal Lines */}
          {showTradeLevels && tradeLevels && (
            <g pointerEvents="none">
              {[
                { label: 'TP', price: tradeLevels.takeProfit, color: '#00E5A0', dash: '5 3' },
                { label: 'ENTRY', price: tradeLevels.entry, color: '#38BDF8', dash: '3 2' },
                { label: 'SL', price: tradeLevels.stopLoss, color: '#F43F5E', dash: '5 3' },
              ].map((lvl) => {
                const y = priceToY(lvl.price);
                if (!Number.isFinite(y) || y < padTop || y > padTop + plotH) return null;
                return (
                  <g key={lvl.label}>
                    <line
                      x1={padLeft}
                      y1={y}
                      x2={width - padRight}
                      y2={y}
                      stroke={lvl.color}
                      strokeWidth="1.15"
                      strokeDasharray={lvl.dash}
                      opacity="0.88"
                    />
                    <rect
                      x={padLeft + 4}
                      y={y - 8}
                      width={lvl.label === 'ENTRY' ? 84 : 74}
                      height={14}
                      rx="2"
                      fill="#070B16"
                      fillOpacity="0.9"
                      stroke={lvl.color}
                      strokeWidth="0.6"
                    />
                    <text
                      x={padLeft + 8}
                      y={y + 2}
                      fontSize="8.5"
                      fontWeight="700"
                      fontFamily="JetBrains Mono, monospace"
                      fill={lvl.color}
                    >
                      {lvl.label} {formatPrice(lvl.price)}
                    </text>
                  </g>
                );
              })}
            </g>
          )}

          <line
            x1={padLeft}
            y1={priceToY(activePair.price)}
            x2={width - padRight}
            y2={priceToY(activePair.price)}
            stroke="#38BDF8"
            strokeWidth="1"
            strokeDasharray="4 2"
          />
          <rect
            x={width - padRight + 2}
            y={priceToY(activePair.price) - 9}
            width={64}
            height={18}
            rx="3"
            fill="url(#tkNeonStrokeGrad)"
          />
          <text
            x={width - padRight + 7}
            y={priceToY(activePair.price) + 3.5}
            fontSize="10"
            fontWeight="700"
            fontFamily="JetBrains Mono, monospace"
            fill="#050811"
          >
            {formatPrice(activePair.price)}
          </text>

          {candles.map((c, i) => {
            if (i % 8 !== 0 && i !== candles.length - 1) return null;
            const x = padLeft + i * stepX + stepX / 2;
            return (
              <text
                key={`t-${i}`}
                x={x}
                y={height - 6}
                textAnchor="middle"
                fontSize="10.5"
                fontFamily="JetBrains Mono, monospace"
                className="fill-slate-500 dark:fill-slate-400"
              >
                {c.time}
              </text>
            );
          })}

          {hoverIndex !== null && (
            <g pointerEvents="none">
              <line
                x1={padLeft + hoverIndex * stepX + stepX / 2}
                y1={padTop}
                x2={padLeft + hoverIndex * stepX + stepX / 2}
                y2={padTop + plotH}
                stroke="#A855F7"
                strokeOpacity="0.6"
                strokeWidth="1"
                strokeDasharray="3 3"
              />
            </g>
          )}

          {candles.map((_, i) => (
            <rect
              key={`hit-${i}`}
              x={padLeft + i * stepX}
              y={padTop}
              width={stepX}
              height={plotH}
              fill="transparent"
              onMouseEnter={() => setHoverIndex(i)}
            />
          ))}
        </svg>
      </div>
    </section>
  );
};
