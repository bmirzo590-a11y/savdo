import React, { useEffect, useMemo, useState } from 'react';
import { Calculator } from 'lucide-react';
import { MarketPair, OrderSide, OrderType, Position, RiskEvaluationResult } from '../types/trading';
import { formatPrice } from '../config/initialData';

interface OrderPanelProps {
  pair: MarketPair;
  availableBalance: number;
  equity: number;
  riskEvaluation?: RiskEvaluationResult | null;
  tradingBlocked?: boolean;
  onPlaceOrder: (order: Omit<Position, 'id' | 'openedAt'>) => void;
}

const RISK_PRESETS = ['0.5', '1', '2', '3'];

export const OrderPanel: React.FC<OrderPanelProps> = ({
  pair,
  availableBalance,
  equity,
  riskEvaluation,
  tradingBlocked = false,
  onPlaceOrder,
}) => {
  const [side, setSide] = useState<OrderSide>('LONG');
  const [orderType, setOrderType] = useState<OrderType>('MARKET');
  const [limitPrice, setLimitPrice] = useState<string>(pair.price.toString());
  const [lotSize, setLotSize] = useState<string>('0.20');
  const [leverage, setLeverage] = useState<number>(100);
  const [stopLoss, setStopLoss] = useState<string>('');
  const [takeProfit, setTakeProfit] = useState<string>('');
  const [riskPercent, setRiskPercent] = useState<string>('1');
  const [feedback, setFeedback] = useState<string | null>(null);

  useEffect(() => {
    setLimitPrice(pair.price.toString());
    const slDefault = side === 'LONG' ? pair.price * 0.992 : pair.price * 1.008;
    const tpDefault = side === 'LONG' ? pair.price * 1.018 : pair.price * 0.982;
    setStopLoss(slDefault.toFixed(pair.price >= 100 ? 2 : 4));
    setTakeProfit(tpDefault.toFixed(pair.price >= 100 ? 2 : 4));
  }, [pair.symbol, side]);

  const entryPrice = orderType === 'MARKET' ? pair.price : Number(limitPrice) || pair.price;
  const parsedLot = Math.max(0.01, Number(lotSize) || 0);
  const parsedSl = stopLoss ? Number(stopLoss) : null;
  const parsedTp = takeProfit ? Number(takeProfit) : null;

  const notionalUsd =
    pair.base === 'USD' && pair.quote !== 'USD'
      ? parsedLot * pair.contractSize
      : parsedLot * pair.contractSize * entryPrice;

  const estimatedMargin = notionalUsd / Math.max(1, leverage);

  const riskMetrics = useMemo(() => {
    const rawRiskPct = Number(riskPercent);
    const validRiskPct =
      Number.isFinite(rawRiskPct) && rawRiskPct > 0 ? Math.min(25, rawRiskPct) : 0;
    const safeEquity = Math.max(0, equity);
    const riskAmountUsd = safeEquity * (validRiskPct / 100);

    const hasValidSl =
      parsedSl !== null &&
      Number.isFinite(parsedSl) &&
      parsedSl > 0 &&
      entryPrice > 0 &&
      (side === 'LONG' ? parsedSl < entryPrice : parsedSl > entryPrice);

    const slDistance = hasValidSl && parsedSl !== null ? Math.abs(entryPrice - parsedSl) : 0;
    const slDistancePct = entryPrice > 0 && slDistance > 0 ? (slDistance / entryPrice) * 100 : 0;

    const lossPerLotUsd =
      hasValidSl && slDistance > 0
        ? pair.base === 'USD' && pair.quote !== 'USD'
          ? (slDistance * pair.contractSize) / Math.max(1e-9, entryPrice)
          : slDistance * pair.contractSize
        : 0;

    const rawSuggestedLot =
      hasValidSl && lossPerLotUsd > 0 && riskAmountUsd > 0 ? riskAmountUsd / lossPerLotUsd : null;

    const suggestedLot =
      rawSuggestedLot !== null
        ? Math.max(0.01, Math.min(100, Math.floor(rawSuggestedLot * 100) / 100))
        : null;

    const actualRiskUsd = hasValidSl && lossPerLotUsd > 0 ? parsedLot * lossPerLotUsd : null;
    const actualRiskPct =
      actualRiskUsd !== null && safeEquity > 0 ? (actualRiskUsd / safeEquity) * 100 : null;
    const isOverRisk =
      actualRiskPct !== null && validRiskPct > 0 && actualRiskPct > validRiskPct * 1.05;

    const hasValidTp =
      parsedTp !== null &&
      Number.isFinite(parsedTp) &&
      parsedTp > 0 &&
      entryPrice > 0 &&
      (side === 'LONG' ? parsedTp > entryPrice : parsedTp < entryPrice);

    const tpDistance = hasValidTp && parsedTp !== null ? Math.abs(parsedTp - entryPrice) : 0;
    const gainPerLotUsd =
      hasValidTp && tpDistance > 0
        ? pair.base === 'USD' && pair.quote !== 'USD'
          ? (tpDistance * pair.contractSize) / Math.max(1e-9, entryPrice)
          : tpDistance * pair.contractSize
        : 0;

    const actualRewardUsd = hasValidTp && gainPerLotUsd > 0 ? parsedLot * gainPerLotUsd : null;
    const riskReward =
      actualRiskUsd && actualRiskUsd > 0 && actualRewardUsd && actualRewardUsd > 0
        ? actualRewardUsd / actualRiskUsd
        : null;

    return {
      validRiskPct,
      riskAmountUsd,
      hasValidSl,
      slDistance,
      slDistancePct,
      suggestedLot,
      actualRiskUsd,
      actualRiskPct,
      isOverRisk,
      hasValidTp,
      actualRewardUsd,
      riskReward,
    };
  }, [
    entryPrice,
    equity,
    pair.base,
    pair.contractSize,
    pair.quote,
    parsedLot,
    parsedSl,
    parsedTp,
    riskPercent,
    side,
  ]);

  const handleApplySuggestedLot = () => {
    if (riskMetrics.suggestedLot !== null) {
      setLotSize(riskMetrics.suggestedLot.toFixed(2));
    }
  };

  const handleApplyAiRiskTargets = () => {
    if (!riskEvaluation) return;
    const dec = pair.price >= 100 ? 2 : 4;
    setStopLoss(riskEvaluation.dynamicStopLoss.toFixed(dec));
    setTakeProfit(riskEvaluation.takeProfit.toFixed(dec));
    setLotSize(riskEvaluation.recommendedLot.toFixed(2));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (tradingBlocked) {
      setFeedback('STOP NEW TRADES faol — yangi buyurtmalar vaqtincha bloklangan.');
      return;
    }
    if (parsedLot <= 0) {
      setFeedback('Lot hajmini 0.01 dan katta kiriting.');
      return;
    }

    onPlaceOrder({
      symbol: pair.symbol,
      side,
      orderType,
      entryPrice,
      markPrice: pair.price,
      lotSize: parsedLot,
      sizeUsdt: Math.round(parsedLot * 10000),
      leverage,
      stopLoss: parsedSl,
      takeProfit: parsedTp,
      status: orderType === 'MARKET' ? 'OPEN' : 'PENDING',
      strategyName: 'Qo‘lda MT5 buyurtma',
    });

    setFeedback(
      `${pair.symbol} · ${parsedLot} lot ${side === 'LONG' ? 'BUY' : 'SELL'} ${
        orderType === 'MARKET' ? 'MT5 da ochildi' : 'navbatga qo‘yildi'
      }.`
    );
    window.setTimeout(() => setFeedback(null), 3500);
  };

  return (
    <section className="rounded-xl border border-slate-200 dark:border-violet-500/25 bg-white dark:bg-[#0B1120] tk-glass p-4 flex flex-col justify-between h-full">
      <div>
        <div className="flex items-center justify-between pb-2.5 border-b border-slate-200 dark:border-violet-500/20">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
            MT5 Tezkor Order
          </h2>
          <span className="text-[11px] font-mono tabular-nums text-sky-600 dark:text-sky-400">
            Erkin: ${availableBalance.toLocaleString('en-US', { minimumFractionDigits: 2 })}
          </span>
        </div>

        <form onSubmit={handleSubmit} className="mt-3 space-y-3">
          <div className="grid grid-cols-2 gap-1 p-1 rounded-lg bg-slate-100 dark:bg-[#080D1B] border border-slate-200 dark:border-violet-500/20">
            <button
              type="button"
              onClick={() => setSide('LONG')}
              className={`py-2 text-sm font-semibold rounded-md transition-all cursor-pointer whitespace-nowrap ${
                side === 'LONG'
                  ? 'bg-emerald-600 text-white dark:bg-emerald-500 dark:text-slate-950 neon-glow-emerald'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              BUY · Long
            </button>
            <button
              type="button"
              onClick={() => setSide('SHORT')}
              className={`py-2 text-sm font-semibold rounded-md transition-all cursor-pointer whitespace-nowrap ${
                side === 'SHORT'
                  ? 'bg-red-600 text-white dark:bg-rose-500 dark:text-white neon-glow-crimson'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              SELL · Short
            </button>
          </div>

          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1 p-1 rounded-lg bg-slate-100 dark:bg-[#080D1B] border border-slate-200 dark:border-violet-500/20">
              <button
                type="button"
                onClick={() => setOrderType('MARKET')}
                className={`px-3 py-1 text-xs font-medium rounded-md cursor-pointer transition-colors ${
                  orderType === 'MARKET'
                    ? 'bg-white dark:bg-violet-500/20 text-slate-900 dark:text-sky-300'
                    : 'text-slate-500 dark:text-slate-400'
                }`}
              >
                Bozor ijrosi
              </button>
              <button
                type="button"
                onClick={() => setOrderType('LIMIT')}
                className={`px-3 py-1 text-xs font-medium rounded-md cursor-pointer transition-colors ${
                  orderType === 'LIMIT'
                    ? 'bg-white dark:bg-violet-500/20 text-slate-900 dark:text-sky-300'
                    : 'text-slate-500 dark:text-slate-400'
                }`}
              >
                Limit
              </button>
            </div>
            <span className="text-xs font-mono tabular-nums text-slate-500 dark:text-slate-400">
              Spred: {pair.spreadPoints} pt
            </span>
          </div>

          {orderType === 'LIMIT' && (
            <div>
              <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">
                Kirish narxi
              </label>
              <input
                type="number"
                step="any"
                value={limitPrice}
                onChange={(e) => setLimitPrice(e.target.value)}
                className="w-full px-3 py-2 text-sm font-mono tabular-nums rounded-lg border border-slate-200 dark:border-violet-500/25 bg-slate-50 dark:bg-[#080D1B] text-slate-900 dark:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
              />
            </div>
          )}

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs text-slate-500 dark:text-slate-400">
                Hajm (MT5 Lot)
              </label>
              <span className="text-xs font-mono tabular-nums text-slate-500 dark:text-slate-400">
                1 lot = {pair.contractSize.toLocaleString('en-US')} birlik
              </span>
            </div>
            <input
              type="number"
              min="0.01"
              step="0.01"
              value={lotSize}
              onChange={(e) => setLotSize(e.target.value)}
              className="w-full px-3 py-2 text-sm font-mono tabular-nums rounded-lg border border-slate-200 dark:border-violet-500/25 bg-slate-50 dark:bg-[#080D1B] text-slate-900 dark:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
            />
            <div className="grid grid-cols-4 gap-1.5 mt-2">
              {['0.05', '0.10', '0.25', '0.50'].map((lot) => (
                <button
                  key={lot}
                  type="button"
                  onClick={() => setLotSize(lot)}
                  className="py-1 text-xs font-mono tabular-nums rounded border border-slate-200 dark:border-violet-500/20 text-slate-600 dark:text-slate-400 hover:border-sky-400/60 hover:text-sky-600 dark:hover:text-sky-300 transition-colors cursor-pointer"
                >
                  {lot}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">
                Stop-Loss
              </label>
              <input
                type="number"
                step="any"
                value={stopLoss}
                onChange={(e) => setStopLoss(e.target.value)}
                className="w-full px-3 py-2 text-xs font-mono tabular-nums rounded-lg border border-slate-200 dark:border-violet-500/25 bg-slate-50 dark:bg-[#080D1B] text-slate-900 dark:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">
                Take-Profit
              </label>
              <input
                type="number"
                step="any"
                value={takeProfit}
                onChange={(e) => setTakeProfit(e.target.value)}
                className="w-full px-3 py-2 text-xs font-mono tabular-nums rounded-lg border border-slate-200 dark:border-violet-500/25 bg-slate-50 dark:bg-[#080D1B] text-slate-900 dark:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
              />
            </div>
          </div>

          {/* Real-time Risk Calculator */}
          <div className="rounded-lg border border-slate-200 dark:border-violet-500/30 bg-slate-50 dark:bg-[#080D1B] p-3 space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-violet-600 dark:text-sky-300">
                <Calculator className="w-3.5 h-3.5 shrink-0" />
                <span>Risk kalkulyatori</span>
              </div>
              <span className="text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400">
                Equity: ${equity.toLocaleString('en-US', { maximumFractionDigits: 0 })}
              </span>
            </div>

            <div className="flex items-center gap-2">
              <div className="relative w-24 shrink-0">
                <input
                  type="number"
                  min="0.1"
                  max="25"
                  step="0.1"
                  value={riskPercent}
                  onChange={(e) => setRiskPercent(e.target.value)}
                  aria-label="Savdo riski foizi"
                  className="w-full pl-2.5 pr-6 py-1.5 text-xs font-mono tabular-nums rounded-md border border-slate-200 dark:border-violet-500/25 bg-white dark:bg-[#0B1120] text-slate-900 dark:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
                />
                <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[11px] font-mono text-slate-400">
                  %
                </span>
              </div>
              <div className="grid grid-cols-4 gap-1 flex-1">
                {RISK_PRESETS.map((preset) => {
                  const active = riskPercent === preset;
                  return (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setRiskPercent(preset)}
                      className={`py-1.5 text-[11px] font-mono tabular-nums rounded-md border transition-colors cursor-pointer ${
                        active
                          ? 'border-violet-500/65 bg-violet-500/15 text-violet-700 dark:text-sky-300 font-semibold'
                          : 'border-slate-200 dark:border-violet-500/20 text-slate-600 dark:text-slate-400 hover:border-sky-400/50'
                      }`}
                    >
                      {preset}%
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex items-center justify-between gap-2 rounded-md border border-slate-200 dark:border-violet-500/20 bg-white dark:bg-[#0B1120] px-2.5 py-2">
              <div className="min-w-0">
                <div className="text-[11px] text-slate-500 dark:text-slate-400">
                  Tavsiya etilgan optimal lot
                </div>
                {riskMetrics.suggestedLot !== null ? (
                  <div className="flex items-baseline gap-2 mt-0.5">
                    <span className="text-sm font-bold font-mono tabular-nums text-violet-600 dark:text-sky-300">
                      {riskMetrics.suggestedLot.toFixed(2)} lot
                    </span>
                    <span className="text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400">
                      ≈ ${riskMetrics.riskAmountUsd.toFixed(2)} risk
                    </span>
                  </div>
                ) : (
                  <div className="text-[11px] text-amber-600 dark:text-amber-400 mt-0.5">
                    {!riskMetrics.hasValidSl
                      ? side === 'LONG'
                        ? 'Stop-Loss kirish narxidan past bo‘lishi kerak'
                        : 'Stop-Loss kirish narxidan yuqori bo‘lishi kerak'
                      : 'Risk foizini 0.1% dan katta kiriting'}
                  </div>
                )}
              </div>
              <button
                type="button"
                disabled={riskMetrics.suggestedLot === null}
                onClick={handleApplySuggestedLot}
                className="shrink-0 px-2.5 py-1.5 text-xs font-semibold rounded-md bg-gradient-to-r from-violet-600 to-sky-500 hover:brightness-110 disabled:opacity-40 disabled:cursor-not-allowed text-white neon-glow-purple transition-all cursor-pointer"
              >
                Qo‘llash
              </button>
            </div>

            <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
              <div className="flex items-center justify-between">
                <span className="text-slate-500 dark:text-slate-400">Joriy lot riski:</span>
                <span
                  className={`font-mono tabular-nums font-medium ${
                    riskMetrics.isOverRisk
                      ? 'text-red-600 dark:text-rose-400'
                      : 'text-slate-900 dark:text-slate-200'
                  }`}
                >
                  {riskMetrics.actualRiskUsd !== null && riskMetrics.actualRiskPct !== null
                    ? `-$${riskMetrics.actualRiskUsd.toFixed(2)} (${riskMetrics.actualRiskPct.toFixed(2)}%)`
                    : '—'}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500 dark:text-slate-400">Kutilgan foyda:</span>
                <span className="font-mono tabular-nums font-medium text-emerald-600 dark:text-emerald-400">
                  {riskMetrics.actualRewardUsd !== null
                    ? `+$${riskMetrics.actualRewardUsd.toFixed(2)}`
                    : '—'}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500 dark:text-slate-400">SL masofa:</span>
                <span className="font-mono tabular-nums text-slate-700 dark:text-slate-300">
                  {riskMetrics.hasValidSl
                    ? `${riskMetrics.slDistancePct.toFixed(2)}%`
                    : '—'}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500 dark:text-slate-400">Risk / Mukofot:</span>
                <span className="font-mono tabular-nums text-violet-600 dark:text-sky-300">
                  {riskMetrics.riskReward ? `1 : ${riskMetrics.riskReward.toFixed(2)}` : '—'}
                </span>
              </div>
            </div>

            {riskEvaluation && (
              <div className="pt-2 border-t border-slate-200 dark:border-violet-500/20 space-y-1.5 text-[11px]">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold text-slate-700 dark:text-slate-200">
                    AI Risk Manager (ATR SL / BE / Trailing)
                  </span>
                  <button
                    type="button"
                    onClick={handleApplyAiRiskTargets}
                    className="px-2 py-0.5 rounded border border-violet-500/45 text-violet-600 dark:text-sky-300 hover:bg-violet-500/15 cursor-pointer whitespace-nowrap"
                  >
                    AI SL/TP qo‘llash
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-x-3 gap-y-1 font-mono tabular-nums text-slate-600 dark:text-slate-300">
                  <div>ATR SL: {formatPrice(riskEvaluation.dynamicStopLoss)}</div>
                  <div>BE (1R): {formatPrice(riskEvaluation.breakEvenPrice)}</div>
                  <div>Trailing: {formatPrice(riskEvaluation.trailingStopDistance)}</div>
                  <div>
                    Filtr:{' '}
                    <span className={riskEvaluation.overallAllowed ? 'text-emerald-500' : 'text-rose-500'}>
                      {riskEvaluation.spreadOk && riskEvaluation.volatilityOk ? 'OK' : 'BLOK'}
                    </span>
                  </div>
                </div>
                <div className="font-mono tabular-nums text-[10.5px] text-slate-400">
                  Spec: Tick {pair.tickSize ?? 0.01} · Point {pair.point ?? 0.01} · Spread {riskEvaluation.spreadOk ? 'OK' : 'Keng'}
                </div>
              </div>
            )}
          </div>

          <div>
            <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 mb-1">
              <span>MT5 Yelka (Leverage)</span>
              <span className="font-mono tabular-nums text-violet-600 dark:text-sky-300 font-medium">
                1:{leverage}
              </span>
            </div>
            <input
              type="range"
              min={10}
              max={500}
              step={10}
              value={leverage}
              onChange={(e) => setLeverage(Number(e.target.value))}
              className="w-full accent-violet-500 cursor-pointer"
            />
          </div>

          <div className="pt-2.5 border-t border-slate-200 dark:border-slate-800 space-y-1 text-xs">
            <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
              <span>Taxminiy marja</span>
              <span className="font-mono tabular-nums text-slate-900 dark:text-slate-200">
                ${estimatedMargin.toFixed(2)}
              </span>
            </div>
            <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
              <span>Joriy kotirovka ({pair.symbol})</span>
              <span className="font-mono tabular-nums text-slate-900 dark:text-white">
                {formatPrice(pair.price)}
              </span>
            </div>
          </div>

          {feedback && (
            <p className="text-xs font-medium text-emerald-600 dark:text-emerald-400">
              {feedback}
            </p>
          )}

          {tradingBlocked && (
            <p className="text-xs font-medium text-rose-500">
              Favqulodda to‘xtatish (STOP NEW TRADES) faol — yangi savdolar bloklangan.
            </p>
          )}

          <button
            type="submit"
            disabled={tradingBlocked}
            className={`w-full py-2.5 px-4 text-sm font-semibold rounded-lg transition-all whitespace-nowrap ${
              tradingBlocked
                ? 'bg-slate-700 text-slate-400 cursor-not-allowed opacity-70'
                : side === 'LONG'
                  ? 'bg-emerald-600 hover:bg-emerald-500 text-white dark:bg-emerald-500 dark:text-slate-950 neon-glow-emerald cursor-pointer'
                  : 'bg-red-600 hover:bg-red-500 text-white dark:bg-rose-500 neon-glow-crimson cursor-pointer'
            }`}
          >
            {tradingBlocked
              ? 'Yangi savdolar bloklangan'
              : `${side === 'LONG' ? 'BUY' : 'SELL'} ${parsedLot} lot · ${pair.symbol}`}
          </button>
        </form>
      </div>
    </section>
  );
};

