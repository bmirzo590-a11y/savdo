import React, { useRef, useState } from 'react';
import {
  AiActionLog,
  AiChatMessage,
  AiRecommendation,
  AiSummaryReport,
  MarketPair,
  Position,
  RiskGuardSettings,
  StrategyBrainSnapshot,
  StrategyConfig,
  TradingStyle,
} from '../types/trading';
import { Bot, Send, ShieldCheck, Sparkles, RefreshCw, Play } from 'lucide-react';
import { formatPrice } from '../data/initialData';

interface AiTradingPanelProps {
  pairs: MarketPair[];
  selectedSymbol: string;
  tradingStyle: TradingStyle;
  positions: Position[];
  strategies: StrategyConfig[];
  riskGuard: RiskGuardSettings;
  brainSnapshot?: StrategyBrainSnapshot | null;
  allPairBrains?: StrategyBrainSnapshot[];
  accountMetrics: {
    balance: number;
    equity: number;
    openPnl: number;
    availableMargin: number;
  };
  fullPermissions: boolean;
  onToggleFullPermissions: (enabled: boolean) => void;
  onExecuteAiFunctionCall: (call: {
    name: string;
    args: Record<string, unknown>;
  }) => string;
  onExecuteRecommendation: (rec: AiRecommendation) => void;
  compact?: boolean;
}

const QUICK_PROMPTS = [
  '6 ta strategiya bo‘yicha joriy juftlikni chuqur tahlil qil',
  'XAUUSD M5 da Scalping PullBack R1.1 backtest o‘tkaz',
  'SMC LuxAlgo va RSI Divergensiya signallarini skaner qil',
  'Konfluensiya mos kelsa 0.15 lot BUY yoki SELL och',
];

export const AiTradingPanel: React.FC<AiTradingPanelProps> = ({
  pairs,
  selectedSymbol,
  tradingStyle,
  positions,
  strategies,
  riskGuard,
  brainSnapshot,
  allPairBrains,
  accountMetrics,
  fullPermissions,
  onToggleFullPermissions,
  onExecuteAiFunctionCall,
  onExecuteRecommendation,
  compact = false,
}) => {
  const [messages, setMessages] = useState<AiChatMessage[]>([
    {
      id: 'init-1',
      role: 'model',
      text: 'Assalomu alaykum! Men Trade Killer AI — sizning 6 ta strategiyangiz (EMA 20/50/100/200, Glaz RSI Bars, Libertus RSI Divergensiya, LuxAlgo SMC, Scalping PullBack R1.1 va VWAP Stdev) asosida ishlaydigan MT5 avtonom tahlilchiman.',
      timestamp: new Date().toLocaleTimeString('en-GB'),
    },
  ]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);

  const [summary, setSummary] = useState<AiSummaryReport | null>(null);
  const [loadingSummary, setLoadingSummary] = useState(false);
  const [summaryError, setSummaryError] = useState<string | null>(null);

  const listEndRef = useRef<HTMLDivElement | null>(null);

  const buildContextPayload = () => ({
    account: accountMetrics,
    selectedSymbol,
    activeTradingStyle: tradingStyle === 'SCALPING' ? 'Skalping (M1-M15)' : 'Uzoq muddatli (H4-W1)',
    activeStrategyBrain: brainSnapshot ?? null,
    allPairBrains: allPairBrains ?? [],
    pairs: pairs.map((p) => ({
      symbol: p.symbol,
      price: p.price,
      spreadPoints: p.spreadPoints,
      change24h: p.change24h,
      rsi14: p.rsi14,
      trend: p.trend,
    })),
    positions: positions.slice(0, 12).map((p) => ({
      id: p.id,
      symbol: p.symbol,
      side: p.side,
      lotSize: p.lotSize,
      entryPrice: p.entryPrice,
      markPrice: p.markPrice,
      stopLoss: p.stopLoss,
      takeProfit: p.takeProfit,
      status: p.status,
    })),
    strategies: strategies.map((s) => ({
      name: s.name,
      style: s.style,
      enabled: s.enabled,
      pairScope: s.pairScope,
    })),
    riskGuard,
  });

  const handleSend = async (promptText?: string) => {
    const text = (promptText ?? input).trim();
    if (!text || sending) return;

    const now = new Date().toLocaleTimeString('en-GB');
    const userMsg: AiChatMessage = {
      id: `u-${Date.now()}`,
      role: 'user',
      text,
      timestamp: now,
    };

    const nextHistory = [...messages, userMsg];
    setMessages(nextHistory);
    if (!promptText) setInput('');
    setSending(true);
    setChatError(null);

    try {
      const res = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: nextHistory.map((m) => ({ role: m.role, text: m.text })),
          context: buildContextPayload(),
          fullPermissions,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || `HTTP ${res.status}`);
      }

      const actionLogs: AiActionLog[] = [];
      if (Array.isArray(data.functionCalls)) {
        for (const fc of data.functionCalls) {
          const summaryResult = onExecuteAiFunctionCall({
            name: fc.name,
            args: fc.args || {},
          });
          actionLogs.push({
            id: fc.id || `act-${Date.now()}`,
            name: fc.name,
            summary: summaryResult,
            timestamp: new Date().toLocaleTimeString('en-GB'),
          });
        }
      }

      const modelMsg: AiChatMessage = {
        id: `m-${Date.now()}`,
        role: 'model',
        text: data.reply || 'Buyruq bajarildi.',
        timestamp: new Date().toLocaleTimeString('en-GB'),
        actions: actionLogs.length > 0 ? actionLogs : undefined,
      };

      setMessages((prev) => [...prev, modelMsg]);
      window.setTimeout(() => listEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 60);
    } catch (err) {
      setChatError(err instanceof Error ? err.message : 'AI bilan bog‘lanishda xatolik yuz berdi.');
    } finally {
      setSending(false);
    }
  };

  const handleGenerateSummary = async () => {
    if (loadingSummary) return;
    setLoadingSummary(true);
    setSummaryError(null);
    try {
      const res = await fetch('/api/ai/summary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ context: buildContextPayload() }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      setSummary({
        marketBias: data.marketBias || 'Neytral',
        confidencePct: Number(data.confidencePct) || 70,
        headline: data.headline || 'MT5 bozor tahlili tayyor.',
        riskNote: data.riskNote || 'Risk limitlari nazorat ostida.',
        recommendations: Array.isArray(data.recommendations) ? data.recommendations : [],
        generatedAt: new Date().toLocaleTimeString('en-GB'),
      });
    } catch (err) {
      setSummaryError(err instanceof Error ? err.message : 'Xulosa olishda xatolik.');
    } finally {
      setLoadingSummary(false);
    }
  };

  return (
    <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-stretch">
      <section className="xl:col-span-7 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#131B2B] neon-surface flex flex-col overflow-hidden">
        <div className="p-4 sm:p-5 border-b border-slate-200 dark:border-slate-800/90 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <Bot className="w-5 h-5 text-[#C8285E] dark:text-[#F25F8C] shrink-0" />
            <div>
              <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                AI Savdo Suhbatdoshi (Skalping · Uzoq muddat · Backtest)
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Real MT5 shamlari tahlili · To‘g‘ridan-to‘g‘ri order va backtest huquqi
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => onToggleFullPermissions(!fullPermissions)}
            className={`inline-flex items-center gap-2 px-3 py-1.5 text-xs font-semibold rounded-lg border transition-all whitespace-nowrap shrink-0 cursor-pointer ${
              fullPermissions
                ? 'border-[#F25F8C]/50 bg-[#F25F8C]/15 text-[#C8285E] dark:text-[#FF7AA5]'
                : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>
              {fullPermissions ? 'To‘liq AI huquqi: Yoqilgan' : 'To‘liq AI huquqi: O‘chirilgan'}
            </span>
          </button>
        </div>

        <div
          className={`flex-1 p-4 sm:p-5 space-y-4 overflow-y-auto ${
            compact ? 'max-h-[380px]' : 'min-h-[420px] max-h-[540px]'
          }`}
        >
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}
            >
              <div
                className={`max-w-[88%] rounded-xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap ${
                  msg.role === 'user'
                    ? 'bg-[#C8285E] text-white dark:bg-[#F25F8C]/15 dark:text-[#FFE4EE] dark:border dark:border-[#F25F8C]/35'
                    : 'bg-slate-100 dark:bg-[#172236] text-slate-800 dark:text-slate-200 border border-slate-200 dark:border-slate-800'
                }`}
              >
                {msg.text}

                {msg.actions && msg.actions.length > 0 && (
                  <div className="mt-3 pt-2.5 border-t border-slate-200/70 dark:border-[#F25F8C]/25 space-y-1.5">
                    {msg.actions.map((act) => (
                      <div
                        key={act.id}
                        className="text-xs font-mono text-emerald-700 dark:text-emerald-300 flex items-center justify-between gap-2"
                      >
                        <span>MT5 Ijro · {act.summary}</span>
                        <span className="text-slate-400 shrink-0">{act.timestamp}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <span className="mt-1 text-[11px] font-mono text-slate-400">{msg.timestamp}</span>
            </div>
          ))}

          {sending && (
            <div className="text-xs font-mono text-[#C8285E] dark:text-[#FF7AA5]">
              AI MT5 ma’lumotlarini tahlil qilmoqda...
            </div>
          )}

          {chatError && (
            <div className="p-3 rounded-lg border border-rose-300 dark:border-rose-500/40 bg-rose-50 dark:bg-rose-950/30 text-xs text-rose-700 dark:text-rose-300">
              {chatError}
            </div>
          )}
          <div ref={listEndRef} />
        </div>

        <div className="p-4 border-t border-slate-200 dark:border-slate-800/90 space-y-3 bg-slate-50/70 dark:bg-[#0F1624]">
          <div className="flex items-center gap-2 overflow-x-auto pb-1">
            {QUICK_PROMPTS.map((q) => (
              <button
                key={q}
                type="button"
                onClick={() => handleSend(q)}
                disabled={sending}
                className="px-3 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#131B2B] text-slate-700 dark:text-slate-300 hover:border-[#F25F8C]/55 hover:text-[#C8285E] dark:hover:text-[#FF7AA5] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                {q}
              </button>
            ))}
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSend();
            }}
            className="flex items-center gap-2"
          >
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="AI ga buyruq bering (skalping, backtest, skaner yoki BUY/SELL)..."
              className="flex-1 px-3.5 py-2.5 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0D1320] text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#F25F8C]"
            />
            <button
              type="submit"
              disabled={sending || !input.trim()}
              className="inline-flex items-center gap-1.5 px-4 py-2.5 text-sm font-semibold rounded-lg bg-gradient-to-r from-[#F25F8C] via-[#EB6B7B] to-[#E87769] hover:brightness-110 disabled:opacity-50 text-slate-950 neon-glow-cyan transition-all whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Send className="w-4 h-4" />
              <span>Yuborish</span>
            </button>
          </form>
        </div>
      </section>

      <section className="xl:col-span-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#131B2B] neon-surface p-5 flex flex-col justify-between">
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-3 pb-3 border-b border-slate-200 dark:border-slate-800">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-emerald-500 dark:text-emerald-400 shrink-0" />
              <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                AI Xulosalar va Signallar
              </h2>
            </div>

            <button
              type="button"
              onClick={handleGenerateSummary}
              disabled={loadingSummary}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-500/20 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loadingSummary ? 'animate-spin' : ''}`} />
              <span>{loadingSummary ? 'Tahlil...' : 'Xulosa yaratish'}</span>
            </button>
          </div>

          {summaryError && (
            <div className="p-3 rounded-lg border border-rose-300 dark:border-rose-500/40 bg-rose-50 dark:bg-rose-950/30 text-xs text-rose-700 dark:text-rose-300">
              {summaryError}
            </div>
          )}

          {brainSnapshot && (
            <div className="p-3.5 rounded-lg bg-slate-50 dark:bg-[#0D1320] border border-slate-200 dark:border-slate-800 space-y-2 text-xs">
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold text-[#C8285E] dark:text-[#FF7AA5]">
                  AI Miyasi: {brainSnapshot.symbol} ({brainSnapshot.timeframe})
                </span>
                <span className="font-mono tabular-nums text-slate-500 dark:text-slate-400">
                  Skalp: {brainSnapshot.verdict.scalpingAction} ({brainSnapshot.verdict.scalpingScore}%) · Uzoq: {brainSnapshot.verdict.longTermAction} ({brainSnapshot.verdict.longTermScore}%)
                </span>
              </div>
              <div className="grid grid-cols-2 gap-x-3 gap-y-1 font-mono tabular-nums text-[11px] text-slate-600 dark:text-slate-300">
                <div>EMA Fan: {brainSnapshot.emaRibbon.alignment}</div>
                <div>RSI(14): {brainSnapshot.rsiBars.rsi14.toFixed(1)} · Div: {brainSnapshot.rsiDivergence.latestType}</div>
                <div>SMC: {brainSnapshot.smc.lastStructureTag} ({brainSnapshot.smc.zone})</div>
                <div>PAC34: {brainSnapshot.scalpingPullback.signal} · {brainSnapshot.scalpingPullback.barLocation}</div>
                <div>VWAP: {formatPrice(brainSnapshot.vwapBands.vwap)}</div>
                <div>±2.01σ: {formatPrice(brainSnapshot.vwapBands.lower201)} / {formatPrice(brainSnapshot.vwapBands.upper201)}</div>
              </div>
            </div>
          )}

          {!summary ? (
            <div className="py-6 text-center space-y-2">
              <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                AI MT5 xulosasi hali yaratilmagan
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm mx-auto">
                6 ta strategiya ko‘rsatkichlari asosida tayyor kirish nuqtalarini olish uchun Xulosa yaratish tugmasini bosing.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-mono tabular-nums">
                <span className="text-slate-500 dark:text-slate-400">
                  Yo‘nalish: <strong className="text-[#C8285E] dark:text-[#FF7AA5]">{summary.marketBias}</strong>
                </span>
                <span className="text-slate-500 dark:text-slate-400">
                  Ishonch: <strong className="text-emerald-600 dark:text-emerald-400">{summary.confidencePct}%</strong> · {summary.generatedAt}
                </span>
              </div>

              <div className="p-3.5 rounded-lg bg-slate-50 dark:bg-[#0D1320] border border-slate-200 dark:border-slate-800 space-y-2">
                <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                  {summary.headline}
                </p>
                <p className="text-xs text-amber-600 dark:text-amber-400">
                  Risk eslatmasi: {summary.riskNote}
                </p>
              </div>

              <div className="space-y-2.5">
                <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
                  Tavsiya etilgan MT5 bitimlari
                </div>
                {summary.recommendations.length === 0 ? (
                  <p className="text-xs text-slate-500">Hozircha aniq signal berilmadi.</p>
                ) : (
                  summary.recommendations.map((rec, idx) => (
                    <div
                      key={`${rec.symbol}-${idx}`}
                      className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-[#0D1320] flex flex-col gap-2"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 text-sm font-semibold">
                          <span className="text-slate-900 dark:text-slate-100">{rec.symbol}</span>
                          {rec.style && (
                            <span className="text-xs font-normal text-slate-400">· {rec.style}</span>
                          )}
                          <span aria-hidden="true" className="text-slate-400">·</span>
                          <span
                            className={
                              rec.action === 'BUY'
                                ? 'text-emerald-600 dark:text-emerald-400'
                                : rec.action === 'SELL'
                                  ? 'text-rose-600 dark:text-rose-400'
                                  : 'text-amber-600 dark:text-amber-400'
                            }
                          >
                            {rec.action}
                          </span>
                        </div>
                        {(rec.action === 'BUY' || rec.action === 'SELL') && (
                          <button
                            type="button"
                            onClick={() => onExecuteRecommendation(rec)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded border border-[#F25F8C]/45 text-[#C8285E] dark:text-[#FF7AA5] hover:bg-[#F25F8C]/15 transition-colors cursor-pointer whitespace-nowrap"
                          >
                            <Play className="w-3 h-3" />
                            <span>MT5 da ochish</span>
                          </button>
                        )}
                      </div>
                      <div className="text-xs font-mono tabular-nums text-slate-500 dark:text-slate-400">
                        Kirish: {rec.entry} · SL: {rec.stopLoss} · TP: {rec.takeProfit}
                      </div>
                      <p className="text-xs text-slate-600 dark:text-slate-300">{rec.rationale}</p>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        <div className="mt-4 pt-3 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
          <span>Rejim: {tradingStyle === 'SCALPING' ? 'Skalping' : 'Uzoq muddatli'}</span>
          <span className="font-mono tabular-nums">
            {fullPermissions ? 'Huquq: To‘liq ijro' : 'Huquq: Faqat tahlil'}
          </span>
        </div>
      </section>
    </div>
  );
};
