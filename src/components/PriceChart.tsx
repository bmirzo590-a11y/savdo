import React, { useEffect, useMemo, useState } from 'react';
import {
  CandlePoint,
  MarketPair,
  ServerConfig,
  StrategyBrainSnapshot,
  Timeframe,
  TradingStyle,
} from '../types/trading';
import { formatPrice } from '../data/initialData';
import { generateMt5Candles } from '../utils/backtestEngine';
import { analyzeStrategyBrain } from '../utils/strategyBrain';

interface PriceChartProps {
  pairs: MarketPair[];
  selectedSymbol: string;
  onSelectSymbol: (symbol: string) => void;
  serverConfig: ServerConfig;
  tradingStyle: TradingStyle;
  onChangeStyle: (style: TradingStyle) => void;
  onBrainUpdate?: (snapshot: StrategyBrainSnapshot) => void;
}

const TIMEFRAMES: Timeframe[] = ['M1', 'M5', 'M15', 'H1', 'H4', 'D1', 'W1'];

export const PriceChart: React.FC<PriceChartProps> = ({
  pairs,
  selectedSymbol,
  onSelectSymbol,
  serverConfig,
  tradingStyle,
  onChangeStyle,
  onBrainUpdate,
}) => {
  const [timeframe, setTimeframe] = useState<Timeframe>(
    tradingStyle === 'SCALPING' ? 'M5' : 'H4'
  );
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

  useEffect(() => {
    setTimeframe(tradingStyle === 'SCALPING' ? 'M5' : 'H4');
  }, [tradingStyle]);

  const activePair = useMemo(
    () => pairs.find((p) => p.symbol === selectedSymbol) ?? pairs[0],
    [pairs, selectedSymbol]
  );

  // Fetch & live-poll real MT5 candles from PC mt5_bridge.py so chart matches MT5 bar-by-bar
  useEffect(() => {
    let cancelled = false;
    async function loadMt5Candles() {
      try {
        const controller = new AbortController();
        const timeout = window.setTimeout(() => controller.abort(), 1400);
        const base = serverConfig.apiBaseUrl.replace(/\/$/, '');
        const res = await fetch(
          `${base}/api/candles?symbol=${encodeURIComponent(selectedSymbol)}&timeframe=${timeframe}&count=180`,
          { signal: controller.signal }
        );
        window.clearTimeout(timeout);
        if (!res.ok) throw new Error('MT5 offline');
        const data = await res.json();
        if (!cancelled && Array.isArray(data.candles) && data.candles.length > 20) {
          setMt5LiveCandles(data.candles);
          setCandleSource('MT5 Real Shamlar');
          return;
        }
      } catch {
        // Bridge not running in cloud preview; keep clean simulated MT5 bars
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
    if (onBrainUpdate) {
      onBrainUpdate(brain.snapshot);
    }
  }, [brain.snapshot, onBrainUpdate]);

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
      if (c.volume > mVol) mVol = c.volume;
    }
    const padding = (max - min) * 0.1 || activePair.price * 0.005;
    return { minPrice: min - padding, maxPrice: max + padding, maxVol: mVol };
  }, [candles, startOffset, brain.series, showEmaRibbon, showVwap, activePair.price]);

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
                  ? 'bg-white dark:bg-[#F25F8C]/15 text-slate-900 dark:text-[#FF7AA5]'
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
                  ? 'bg-white dark:bg-[#F25F8C]/15 text-slate-900 dark:text-[#FF7AA5]'
                  : 'text-slate-500 dark:text-slate-400'
              }`}
            >
              Uzoq muddatli
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-0.5 p-1 rounded-lg bg-slate-100 dark:bg-[#0D1320] border border-slate-200 dark:border-slate-800">
            {TIMEFRAMES.map((tf) => (
              <button
                key={tf}
                type="button"
                onClick={() => setTimeframe(tf)}
                className={`px-2 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  timeframe === tf
                    ? 'bg-white dark:bg-[#F25F8C]/15 text-slate-900 dark:text-[#FF7AA5]'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                {tf}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1 p-1 rounded-lg bg-slate-100 dark:bg-[#0D1320] border border-slate-200 dark:border-slate-800">
            <button
              type="button"
              onClick={() => setChartType('candles')}
              className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                chartType === 'candles'
                  ? 'bg-white dark:bg-[#F25F8C]/15 text-slate-900 dark:text-[#FF7AA5]'
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
                  ? 'bg-white dark:bg-[#F25F8C]/15 text-slate-900 dark:text-[#FF7AA5]'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              Chiziqli
            </button>
          </div>
        </div>
      </div>

      {/* Indicator Overlay Toggles + OHLC Row */}
      <div className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-xs font-mono tabular-nums text-slate-500 dark:text-slate-400 border-b border-slate-100 dark:border-slate-800/70">
        <div className="flex flex-wrap items-center gap-3">
          <span>Vaqt: {hoveredCandle.time}</span>
          <span>O: {formatPrice(hoveredCandle.open)}</span>
          <span>H: {formatPrice(hoveredCandle.high)}</span>
          <span>L: {formatPrice(hoveredCandle.low)}</span>
          <span className="text-[#C8285E] dark:text-[#FF7AA5] font-medium">
            C: {formatPrice(hoveredCandle.close)}
          </span>
          <span className={candleSource === 'MT5 Real Shamlar' ? 'text-emerald-400' : 'text-slate-400'}>
            · {candleSource}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-1.5 font-sans">
          {[
            { label: 'EMA 20/50/100/200', active: showEmaRibbon, toggle: () => setShowEmaRibbon((v) => !v) },
            { label: 'PAC 34', active: showPac, toggle: () => setShowPac((v) => !v) },
            { label: 'VWAP ±2σ', active: showVwap, toggle: () => setShowVwap((v) => !v) },
            { label: 'SMC OB/BOS', active: showSmc, toggle: () => setShowSmc((v) => !v) },
            { label: 'RSI Bars/Div', active: showRsiBars, toggle: () => setShowRsiBars((v) => !v) },
          ].map((btn) => (
            <button
              key={btn.label}
              type="button"
              onClick={btn.toggle}
              className={`px-2 py-0.5 text-[11px] font-medium rounded border transition-colors cursor-pointer whitespace-nowrap ${
                btn.active
                  ? 'border-[#F25F8C]/50 bg-[#F25F8C]/15 text-[#C8285E] dark:text-[#FF7AA5]'
                  : 'border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400'
              }`}
            >
              {btn.label}
            </button>
          ))}
        </div>
      </div>

      {/* Live 6-Strategy Brain Unboxed Strip */}
      <div className="flex flex-wrap items-center justify-between gap-2 py-2 text-[11px] font-mono tabular-nums text-slate-600 dark:text-slate-300">
        <div className="flex flex-wrap items-center gap-2">
          <span>
            EMA Fan:{' '}
            <strong className="text-[#C8285E] dark:text-[#FF7AA5]">{snap.emaRibbon.alignment}</strong>
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
            SMC: <strong className="text-[#C8285E] dark:text-[#FF7AA5]">{snap.smc.lastStructureTag}</strong> ({snap.smc.zone})
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
          <span>VWAP: {snap.vwapBands.zone}</span>
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
              <stop offset="0%" stopColor="#F25F8C" stopOpacity="0.28" />
              <stop offset="55%" stopColor="#EB6B7B" stopOpacity="0.10" />
              <stop offset="100%" stopColor="#E87769" stopOpacity="0" />
            </linearGradient>
            <linearGradient id="tkNeonStrokeGrad" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#F25F8C" />
              <stop offset="50%" stopColor="#EB6B7B" />
              <stop offset="100%" stopColor="#E87769" />
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

          <line
            x1={padLeft}
            y1={priceToY(activePair.price)}
            x2={width - padRight}
            y2={priceToY(activePair.price)}
            stroke="#F25F8C"
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
            fill="#0C111C"
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
                stroke="#F25F8C"
                strokeOpacity="0.55"
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
