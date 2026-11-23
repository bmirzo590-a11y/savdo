import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  BookOpenCheck,
  BrainCircuit,
  CheckCircle2,
  Clock,
  Cpu,
  Database,
  Play,
  RefreshCw,
  Send,
  ShieldAlert,
  Sparkles,
  Trash2,
  User,
  Wrench,
} from 'lucide-react';
import {
  AiChatId,
  AiChatMessageRecord,
  AiChatsStateSnapshot,
  MarketPair,
  Timeframe,
} from '../types/trading';
import { apiJson } from '../utils/apiClient';
import { formatPrice } from '../config/initialData';

interface AiChatCenterViewProps {
  pairs: MarketPair[];
  selectedSymbol: string;
  timeframe: Timeframe;
  onSelectSymbol: (sym: string) => void;
  onUnifiedRefresh?: () => void;
}

const CHAT_ICONS: Record<AiChatId, React.ComponentType<{ className?: string }>> = {
  chief_analyst: BrainCircuit,
  market_intelligence: Activity,
  strategy_analyst: Cpu,
  risk_intelligence: ShieldAlert,
  trade_manager: Wrench,
  self_evaluation: BookOpenCheck,
};

const TRIGGER_LABELS: Record<string, string> = {
  USER_QUERY: 'SAVOL',
  MANUAL_BRIEF: 'TAHLIL',
  NEW_CANDLE: 'YANGI SHAM',
  REGIME_CHANGE: 'REJIM O‘ZGARISHI',
  VALID_SETUP: 'AVTONOM SETUP',
  POSITION_UPDATE: 'POZITSIYA KUZATUVI',
  TRADE_CLOSED: 'YOPILGAN SAVDO',
};

function formatTimeShort(iso: string | null | undefined): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleTimeString('uz-UZ', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  } catch {
    return iso;
  }
}

export const AiChatCenterView: React.FC<AiChatCenterViewProps> = ({
  pairs,
  selectedSymbol,
  timeframe,
  onSelectSymbol,
  onUnifiedRefresh,
}) => {
  const [state, setState] = useState<AiChatsStateSnapshot | null>(null);
  const [activeChatId, setActiveChatId] = useState<AiChatId>('chief_analyst');
  const [loading, setLoading] = useState<boolean>(true);
  const [busyAction, setBusyAction] = useState<'ask' | 'brief' | 'exec' | null>(null);
  const [executingMsgId, setExecutingMsgId] = useState<string | null>(null);
  const [inputText, setInputText] = useState<string>('');
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const fetchChatState = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const res = await apiJson<{ ok: boolean } & AiChatsStateSnapshot>('/api/ai-chats/state');
      setState(res);
    } catch (err) {
      if (!silent) {
        setFeedback({
          ok: false,
          text: err instanceof Error ? err.message : 'AI chat holatini yuklab bo‘lmadi.',
        });
      }
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchChatState(false);
    const timer = window.setInterval(() => void fetchChatState(true), 10_000);
    return () => window.clearInterval(timer);
  }, [fetchChatState]);

  const activeMessages: AiChatMessageRecord[] = state?.messagesByChat[activeChatId] ?? [];
  const activeChatDef = state?.chats.find((c) => c.id === activeChatId) ?? null;

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [activeChatId, activeMessages.length]);

  const handleAsk = async (questionOverride?: string) => {
    const q = (questionOverride ?? inputText).trim();
    if (!q || busyAction) return;
    setBusyAction('ask');
    setFeedback(null);
    if (!questionOverride) setInputText('');
    try {
      const res = await apiJson<{
        ok: boolean;
        aiMessage?: AiChatMessageRecord;
        state?: AiChatsStateSnapshot;
      }>(`/api/ai-chats/${activeChatId}/ask`, {
        method: 'POST',
        body: JSON.stringify({
          question: q,
          symbol: selectedSymbol,
          timeframe,
          refreshIfStale: true,
        }),
      });
      if (res.state) setState(res.state);
      if (!res.ok && res.aiMessage?.errorDetail) {
        setFeedback({ ok: false, text: res.aiMessage.errorDetail });
      }
    } catch (err) {
      setFeedback({
        ok: false,
        text: err instanceof Error ? err.message : 'AI javobini olishda xatolik.',
      });
    } finally {
      setBusyAction(null);
    }
  };

  const handleGenerateBrief = async () => {
    if (busyAction) return;
    setBusyAction('brief');
    setFeedback(null);
    try {
      const res = await apiJson<{
        ok: boolean;
        aiMessage?: AiChatMessageRecord;
        state?: AiChatsStateSnapshot;
      }>(`/api/ai-chats/${activeChatId}/brief`, {
        method: 'POST',
        body: JSON.stringify({
          symbol: selectedSymbol,
          timeframe,
          refreshIfStale: true,
        }),
      });
      if (res.state) setState(res.state);
      if (!res.ok && res.aiMessage?.errorDetail) {
        setFeedback({ ok: false, text: res.aiMessage.errorDetail });
      }
    } catch (err) {
      setFeedback({
        ok: false,
        text: err instanceof Error ? err.message : 'AI tahlil yaratishda xatolik.',
      });
    } finally {
      setBusyAction(null);
    }
  };

  const handleExecuteTradeManager = async (messageId: string) => {
    if (busyAction) return;
    setBusyAction('exec');
    setExecutingMsgId(messageId);
    setFeedback(null);
    try {
      const res = await apiJson<{
        ok: boolean;
        error?: string;
        state?: AiChatsStateSnapshot;
      }>('/api/ai-chats/trade-manager/execute', {
        method: 'POST',
        body: JSON.stringify({ messageId }),
      });
      if (res.state) setState(res.state);
      setFeedback({ ok: true, text: 'Trade Manager amali Risk Engine tekshiruvidan o‘tib bajarildi.' });
      onUnifiedRefresh?.();
    } catch (err) {
      setFeedback({
        ok: false,
        text: err instanceof Error ? err.message : 'Trade Manager amali rad etildi.',
      });
      void fetchChatState(true);
    } finally {
      setBusyAction(null);
      setExecutingMsgId(null);
    }
  };

  const handleClearChat = async () => {
    if (busyAction) return;
    try {
      const res = await apiJson<{ ok: boolean; state?: AiChatsStateSnapshot }>(
        `/api/ai-chats/${activeChatId}/clear`,
        { method: 'POST', body: JSON.stringify({}) }
      );
      if (res.state) setState(res.state);
    } catch (err) {
      setFeedback({
        ok: false,
        text: err instanceof Error ? err.message : 'Chat tarixini tozalab bo‘lmadi.',
      });
    }
  };

  const provider = state?.provider;
  const providerOnline = Boolean(provider?.configured && provider.healthStatus !== 'ERROR');

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 items-stretch min-h-[calc(100vh-148px)]">
      {/* LEFT COMPACT 6-CHAT NAVIGATION RAIL */}
      <aside className="lg:col-span-3 xl:col-span-3 rounded-xl border border-slate-200 dark:border-violet-500/25 bg-white dark:bg-[#080E1E] flex flex-col justify-between overflow-hidden">
        <div className="p-2.5 border-b border-slate-200 dark:border-violet-500/20">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-violet-400" />
              <span>AI Chat Markazi (6)</span>
            </span>
            <button
              type="button"
              onClick={() => void fetchChatState(false)}
              className="p-1 rounded-md text-slate-400 hover:text-sky-400 hover:bg-violet-500/10 cursor-pointer"
              title="Yangilash"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
          <p className="mt-0.5 text-[10.5px] text-slate-500 dark:text-slate-400">
            Har bir chat faqat o‘z sohasidagi haqiqiy ma’lumotlar va real LLM orqali fikrlaydi.
          </p>
        </div>

        <nav className="p-2 space-y-1 flex-1 overflow-y-auto" aria-label="Maxsus AI chatlar">
          {(state?.chats ?? []).map((chat) => {
            const Icon = CHAT_ICONS[chat.id];
            const active = chat.id === activeChatId;
            return (
              <button
                key={chat.id}
                type="button"
                onClick={() => setActiveChatId(chat.id)}
                className={`w-full text-left p-2 rounded-lg border transition-all cursor-pointer ${
                  active
                    ? 'bg-slate-900 text-white border-slate-800 dark:bg-gradient-to-r dark:from-violet-600/25 dark:to-sky-500/15 dark:border-violet-400/50 shadow-[0_0_12px_rgba(139,92,246,0.16)]'
                    : 'border-transparent bg-slate-50/60 dark:bg-[#0C1427]/60 text-slate-700 dark:text-slate-300 hover:border-violet-500/25 hover:bg-slate-100 dark:hover:bg-violet-500/10'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-2 min-w-0">
                    <Icon
                      className={`w-4 h-4 shrink-0 ${
                        active ? 'text-sky-400' : 'text-violet-500 dark:text-violet-400/80'
                      }`}
                    />
                    <span className="text-[12px] font-semibold truncate">{chat.title}</span>
                  </span>
                  {chat.aiMessageCount > 0 && (
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-mono tabular-nums font-bold bg-violet-500/20 text-violet-300">
                      {chat.aiMessageCount}
                    </span>
                  )}
                </div>
                <div
                  className={`mt-1 text-[10.5px] line-clamp-1 ${
                    active ? 'text-slate-300 dark:text-sky-200/80' : 'text-slate-500 dark:text-slate-400'
                  }`}
                >
                  {chat.roleUz}
                </div>
              </button>
            );
          })}
        </nav>

        {/* Honest Provider & Queue Footer */}
        <div className="p-2.5 border-t border-slate-200 dark:border-violet-500/20 bg-slate-50/80 dark:bg-[#060A15] space-y-1.5 text-[10.5px]">
          <div className="flex items-center justify-between gap-2">
            <span className="text-slate-500">LLM Provider</span>
            <span
              className={`font-mono font-bold ${
                !provider?.configured
                  ? 'text-amber-500'
                  : provider.healthStatus === 'ERROR'
                    ? 'text-rose-500'
                    : 'text-emerald-500 dark:text-[#00E5A0]'
              }`}
            >
              {!provider?.configured
                ? 'AI UNAVAILABLE'
                : provider.healthStatus === 'ERROR'
                  ? 'LLM ERROR'
                  : 'REAL LLM ACTIVE'}
            </span>
          </div>
          <div className="font-mono text-[10px] text-slate-600 dark:text-slate-300 truncate">
            {provider?.configured
              ? `${provider.providerLabel} · ${provider.model}`
              : 'API kalit serverda sozlanmagan'}
          </div>
          {state?.queue && (
            <div className="flex items-center justify-between text-[10px] font-mono text-slate-500 pt-1 border-t border-slate-200 dark:border-violet-500/15">
              <span>Avtonom navbat: {state.queue.pendingCount}</span>
              <span>Dublikat blok: {state.queue.totalDuplicatesSkipped}</span>
            </div>
          )}
        </div>
      </aside>

      {/* CENTER CONVERSATION & REASONING WORKSPACE */}
      <section className="lg:col-span-9 xl:col-span-9 rounded-xl border border-slate-200 dark:border-violet-500/25 bg-white dark:bg-[#080E1E] flex flex-col min-h-[560px] max-h-[calc(100vh-140px)] overflow-hidden">
        {/* Top Chat Header */}
        <header className="px-3.5 py-2.5 border-b border-slate-200 dark:border-violet-500/20 flex flex-wrap items-center justify-between gap-2.5 bg-slate-50/70 dark:bg-[#0A1124]">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-sm font-bold text-slate-900 dark:text-white">
                {activeChatDef?.title ?? 'AI Chat'}
              </h1>
              <span
                className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold border ${
                  providerOnline
                    ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-[#00E5A0]'
                    : 'border-rose-500/40 bg-rose-500/10 text-rose-500'
                }`}
              >
                {provider?.configured ? provider.model || 'LLM' : 'AI UNAVAILABLE'}
              </span>
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
              {activeChatDef?.descriptionUz}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <select
              value={selectedSymbol}
              onChange={(e) => onSelectSymbol(e.target.value)}
              aria-label="Instrument tanlash"
              className="px-2 py-1.5 text-[11px] font-mono rounded-lg border border-slate-200 dark:border-violet-500/30 bg-white dark:bg-[#060A15] text-slate-900 dark:text-white"
            >
              {pairs.map((p) => (
                <option key={p.symbol} value={p.symbol}>
                  {p.symbol} ({timeframe})
                </option>
              ))}
            </select>

            <button
              type="button"
              disabled={busyAction !== null}
              onClick={() => void handleGenerateBrief()}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] font-semibold rounded-lg bg-gradient-to-r from-violet-600 to-sky-500 text-white hover:brightness-110 disabled:opacity-50 cursor-pointer whitespace-nowrap"
            >
              {busyAction === 'brief' ? (
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Sparkles className="w-3.5 h-3.5" />
              )}
              <span>AI Tahlil Yozish</span>
            </button>

            <button
              type="button"
              onClick={() => void handleClearChat()}
              disabled={busyAction !== null || activeMessages.length === 0}
              className="p-1.5 rounded-lg border border-slate-200 dark:border-violet-500/25 text-slate-500 hover:text-rose-400 hover:border-rose-500/40 disabled:opacity-40 cursor-pointer"
              title="Ushbu chat tarixini tozalash"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </header>

        {feedback && (
          <div
            className={`mx-3.5 mt-2.5 px-3 py-1.5 rounded-lg text-[11.5px] border flex items-center justify-between gap-2 ${
              feedback.ok
                ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-[#00E5A0]'
                : 'border-rose-500/40 bg-rose-500/10 text-rose-500'
            }`}
          >
            <span>{feedback.text}</span>
            <button
              type="button"
              onClick={() => setFeedback(null)}
              className="text-xs opacity-70 hover:opacity-100 cursor-pointer"
            >
              ✕
            </button>
          </div>
        )}

        {/* Strategy Self-Evaluation Memory Strip (only in Self-Evaluation chat) */}
        {activeChatId === 'self_evaluation' && (state?.strategySelfEvalMemory.length ?? 0) > 0 && (
          <div className="mx-3.5 mt-2.5 rounded-lg border border-violet-500/25 bg-violet-500/5 p-2.5 space-y-1.5">
            <div className="flex items-center justify-between text-[11px] font-semibold text-violet-600 dark:text-violet-300">
              <span className="flex items-center gap-1.5">
                <Database className="w-3.5 h-3.5" />
                <span>Strategy Memory ({state?.strategySelfEvalMemory.length} ta yopilgan savdo sabog‘i)</span>
              </span>
              <span className="text-[10px] font-mono text-slate-500">Live strategiya kodi o‘zgartirilmaydi</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-1.5 max-h-28 overflow-y-auto">
              {(state?.strategySelfEvalMemory ?? []).slice(0, 6).map((mem) => (
                <div
                  key={mem.id}
                  className="rounded-md border border-slate-200 dark:border-violet-500/20 bg-white/80 dark:bg-[#060A15] p-2 text-[10.5px]"
                >
                  <div className="flex items-center justify-between font-mono">
                    <span className="font-bold text-slate-900 dark:text-white">
                      {mem.symbol} {mem.side}
                    </span>
                    <span className={mem.realizedPnlUsd >= 0 ? 'text-[#00E5A0]' : 'text-rose-500'}>
                      {mem.realizedPnlUsd >= 0 ? '+' : ''}${mem.realizedPnlUsd.toFixed(2)}
                    </span>
                  </div>
                  <div className="text-slate-600 dark:text-slate-300 mt-0.5 line-clamp-2">
                    {mem.lessonSummaryUz}
                  </div>
                  <div className="text-[9.5px] font-mono text-slate-500 mt-0.5">
                    MFE: {mem.mfeUsd !== null ? `+$${mem.mfeUsd.toFixed(2)}` : '—'} · MAE:{' '}
                    {mem.maeUsd !== null ? `$${mem.maeUsd.toFixed(2)}` : '—'} · {mem.model}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Messages Stream */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto p-3.5 space-y-3">
          {activeMessages.length === 0 ? (
            <div className="h-full min-h-[260px] flex flex-col items-center justify-center text-center px-4">
              <div className="w-10 h-10 rounded-xl border border-violet-500/35 bg-violet-500/10 flex items-center justify-center mb-3">
                <BrainCircuit className="w-5 h-5 text-violet-400" />
              </div>
              <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
                {activeChatDef?.title} — Haqiqiy AI suhbatga tayyor
              </h2>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 max-w-md">
                Bu chatda soxta yoki oldindan yozilgan xabarlar yo‘q. Haqiqiy real OHLC ma’lumotlari asosida
                mustaqil LLM fikrini olish uchun yuqoridagi <strong>“AI Tahlil Yozish”</strong> tugmasini bosing
                yoki pastdan savol yozing.
              </p>
            </div>
          ) : (
            activeMessages.map((msg) => {
              // 1. User Message
              if (msg.role === 'user') {
                return (
                  <div key={msg.messageId} className="flex justify-end">
                    <div className="max-w-[82%] rounded-xl rounded-tr-sm border border-sky-500/35 bg-sky-500/10 dark:bg-sky-500/15 px-3.5 py-2.5 text-xs text-slate-900 dark:text-sky-100 space-y-1">
                      <div className="flex items-center justify-between gap-3 text-[10px] text-sky-600 dark:text-sky-300 font-mono">
                        <span className="inline-flex items-center gap-1 font-semibold">
                          <User className="w-3 h-3" />
                          <span>SIZNING SAVOLINGIZ</span>
                        </span>
                        <span>{formatTimeShort(msg.createdAt)}</span>
                      </div>
                      <div className="whitespace-pre-wrap leading-relaxed">{msg.contentUz}</div>
                    </div>
                  </div>
                );
              }

              // 2. System Notice / Provider Error (visually separated from AI messages!)
              if (msg.role === 'system_notice') {
                return (
                  <div
                    key={msg.messageId}
                    className="rounded-xl border border-amber-500/45 bg-amber-500/10 px-3.5 py-2.5 text-xs space-y-1"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2 text-[10.5px] font-mono">
                      <span className="inline-flex items-center gap-1.5 font-bold text-amber-600 dark:text-amber-300">
                        <AlertTriangle className="w-3.5 h-3.5" />
                        <span>TIZIM XABARI · {msg.generationStatus}</span>
                      </span>
                      <span className="text-slate-500">{formatTimeShort(msg.createdAt)}</span>
                    </div>
                    <p className="text-slate-800 dark:text-amber-100 leading-relaxed">{msg.contentUz}</p>
                    {msg.errorDetail && (
                      <div className="text-[10.5px] font-mono text-rose-500 dark:text-rose-300 break-words">
                        {msg.errorDetail}
                      </div>
                    )}
                  </div>
                );
              }

              // 3. Genuine LLM AI Reasoning Message
              const td = msg.tradeDecision;
              const tm = msg.tradeManagerAction;

              return (
                <article
                  key={msg.messageId}
                  className="rounded-xl border border-violet-500/30 bg-slate-50/90 dark:bg-[#0D1529] p-3.5 space-y-2.5 shadow-[0_0_16px_rgba(139,92,246,0.08)]"
                >
                  {/* Authenticity Header */}
                  <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-slate-200 dark:border-violet-500/15 text-[10.5px] font-mono">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-violet-600/20 text-violet-700 dark:text-violet-300 font-semibold">
                        <BrainCircuit className="w-3 h-3" />
                        <span>{msg.provider || 'LLM'}</span>
                        {msg.model && <span className="text-sky-500 dark:text-sky-300">· {msg.model}</span>}
                      </span>
                      <span className="px-1.5 py-0.5 rounded bg-slate-200/80 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                        {TRIGGER_LABELS[msg.triggerType] ?? msg.triggerType}
                      </span>
                      {msg.symbol && (
                        <span className="px-1.5 py-0.5 rounded bg-sky-500/15 text-sky-600 dark:text-sky-300 font-bold">
                          {msg.symbol}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 text-slate-500">
                      {msg.analysisId && <span title="Bog‘langan Analysis ID">ID: {msg.analysisId}</span>}
                      <span className="inline-flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {formatTimeShort(msg.createdAt)}
                      </span>
                    </div>
                  </div>

                  {/* Natural Uzbek AI Reasoning */}
                  <div className="text-[12.5px] text-slate-800 dark:text-slate-100 whitespace-pre-wrap leading-relaxed">
                    {msg.contentUz}
                  </div>

                  {/* Structured AI Trade Decision Card (with strict Order Separation!) */}
                  {td && (
                    <div className="rounded-lg border border-slate-200 dark:border-sky-500/25 bg-white dark:bg-[#070C19] p-3 space-y-2 text-xs">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2 font-mono">
                          <span className="font-bold text-slate-900 dark:text-white">{td.instrument}</span>
                          <span
                            className={`px-2 py-0.5 rounded text-[11px] font-bold ${
                              td.decision === 'BUY'
                                ? 'bg-emerald-500/20 text-emerald-500 dark:text-[#00E5A0]'
                                : td.decision === 'SELL'
                                  ? 'bg-rose-500/20 text-rose-500'
                                  : 'bg-amber-500/20 text-amber-500'
                            }`}
                          >
                            AI QAROR: {td.decision}
                          </span>
                          <span className="text-[11px] font-sans text-slate-500 dark:text-slate-400">
                            {td.marketCondition}
                          </span>
                        </div>
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-mono font-semibold border ${
                            td.executionStatus === 'EXECUTED_VIA_ENGINE'
                              ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-400'
                              : td.executionStatus === 'RISK_BLOCKED'
                                ? 'border-rose-500/40 bg-rose-500/10 text-rose-400'
                                : 'border-sky-500/35 bg-sky-500/10 text-sky-600 dark:text-sky-300'
                          }`}
                        >
                          {td.executionStatus === 'EXECUTED_VIA_ENGINE'
                            ? 'ENGINE ORQALI OCHILDI'
                            : td.executionStatus === 'RISK_BLOCKED'
                              ? 'FAKAT TAHLIL · RISK BLOKLAGAN'
                              : 'FAKAT AI TAHLILI · ORDER OCHILMAGAN'}
                        </span>
                      </div>

                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 font-mono tabular-nums text-[11px] pt-1">
                        <div>
                          <span className="font-sans text-slate-500 block text-[10px]">Entry</span>
                          <span className="text-slate-900 dark:text-white font-semibold">
                            {td.entry !== null ? formatPrice(td.entry) : '—'}
                          </span>
                        </div>
                        <div>
                          <span className="font-sans text-slate-500 block text-[10px]">Stop Loss</span>
                          <span className="text-rose-500 font-semibold">
                            {td.stopLoss !== null ? formatPrice(td.stopLoss) : '—'}
                          </span>
                        </div>
                        <div>
                          <span className="font-sans text-slate-500 block text-[10px]">Take Profit</span>
                          <span className="text-emerald-500 dark:text-[#00E5A0] font-semibold">
                            {td.takeProfit !== null ? formatPrice(td.takeProfit) : '—'}
                          </span>
                        </div>
                        <div>
                          <span className="font-sans text-slate-500 block text-[10px]">Risk / Reward</span>
                          <span className="text-sky-500 dark:text-sky-300 font-semibold">
                            {td.riskReward || '—'}
                          </span>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1.5 border-t border-slate-200 dark:border-violet-500/15 text-[11px]">
                        <div>
                          <span className="text-slate-500">Strategiyalar kelishuvi: </span>
                          <span className="text-slate-700 dark:text-slate-200">{td.strategyAgreement}</span>
                        </div>
                        <div>
                          <span className="text-slate-500">Ishonchlilik kalibratsiyasi: </span>
                          <span className="text-slate-700 dark:text-slate-200">{td.confidenceCalibration}</span>
                        </div>
                        <div className="sm:col-span-2">
                          <span className="text-rose-500 font-medium">Bekor bo‘lish sharti (Invalidation): </span>
                          <span className="text-slate-700 dark:text-slate-300">{td.invalidationConditions}</span>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Trade Manager Structured Proposal + Risk-Gated Execution */}
                  {tm && (
                    <div className="rounded-lg border border-violet-500/35 bg-white dark:bg-[#070C19] p-3 space-y-2 text-xs">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2 font-mono">
                          <span className="font-bold text-slate-900 dark:text-white">
                            {tm.symbol} ({tm.orderId})
                          </span>
                          <span className="px-2 py-0.5 rounded bg-violet-500/20 text-violet-400 font-bold text-[11px]">
                            TAVSIYA: {tm.proposedAction}
                          </span>
                        </div>
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold ${
                            tm.executionStatus === 'EXECUTED'
                              ? 'bg-emerald-500/20 text-emerald-400'
                              : tm.executionStatus === 'BLOCKED_BY_RISK_OR_PERMISSION'
                                ? 'bg-rose-500/20 text-rose-400'
                                : 'bg-amber-500/20 text-amber-400'
                          }`}
                        >
                          {tm.executionStatus === 'EXECUTED'
                            ? 'BAJARILDI'
                            : tm.executionStatus === 'BLOCKED_BY_RISK_OR_PERMISSION'
                              ? 'RISK / RUXSAT BLOKLAGAN'
                              : 'FAKAT TAVSIYA (BAJARILMAGAN)'}
                        </span>
                      </div>

                      <div className="flex flex-wrap items-center gap-4 text-[11px] font-mono">
                        <span>
                          Taklif SL:{' '}
                          <strong className="text-rose-400">
                            {tm.proposedStopLoss !== null ? formatPrice(tm.proposedStopLoss) : '—'}
                          </strong>
                        </span>
                        <span>
                          Taklif TP:{' '}
                          <strong className="text-[#00E5A0]">
                            {tm.proposedTakeProfit !== null ? formatPrice(tm.proposedTakeProfit) : '—'}
                          </strong>
                        </span>
                        <span className={tm.riskCheckAllowed ? 'text-[#00E5A0]' : 'text-rose-400'}>
                          Risk Engine: {tm.riskCheckAllowed ? 'RUXSAT BERDI' : 'RAD ETDI'}
                        </span>
                      </div>

                      {tm.rationaleUz && (
                        <p className="text-[11px] text-slate-600 dark:text-slate-300">{tm.rationaleUz}</p>
                      )}

                      {tm.riskBlockReasons.length > 0 && (
                        <div className="text-[11px] text-rose-400">
                          Blok sababi: {tm.riskBlockReasons.join(' · ')}
                        </div>
                      )}

                      {tm.executionStatus === 'PROPOSED_ONLY' &&
                        tm.proposedAction !== 'HOLD' &&
                        tm.riskCheckAllowed && (
                          <div className="pt-1">
                            <button
                              type="button"
                              disabled={busyAction !== null}
                              onClick={() => void handleExecuteTradeManager(msg.messageId)}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-semibold rounded-lg bg-emerald-600 text-white hover:bg-emerald-500 disabled:opacity-50 cursor-pointer"
                            >
                              {executingMsgId === msg.messageId ? (
                                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                              ) : (
                                <Play className="w-3.5 h-3.5" />
                              )}
                              <span>Risk Engine tekshiruvi bilan bajarish</span>
                            </button>
                          </div>
                        )}

                      {tm.executionStatus === 'EXECUTED' && tm.executedAt && (
                        <div className="inline-flex items-center gap-1 text-[10.5px] font-mono text-[#00E5A0]">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>Bajarildi: {formatTimeShort(tm.executedAt)}</span>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Data Provenance Footer */}
                  <div className="flex flex-wrap items-center justify-between gap-2 pt-1.5 border-t border-slate-200/70 dark:border-violet-500/10 text-[10px] font-mono text-slate-500">
                    <span className="truncate">Manbalar: {msg.sourceReferences.join(' · ')}</span>
                    <span className="shrink-0">
                      Yangilik: {msg.dataFreshnessSec !== null ? `${msg.dataFreshnessSec}s` : '—'} ·{' '}
                      {msg.dataSnapshotRef}
                    </span>
                  </div>
                </article>
              );
            })
          )}
        </div>

        {/* Bottom Prompt Chips + User Question Input */}
        <footer className="p-3 border-t border-slate-200 dark:border-violet-500/20 bg-slate-50/80 dark:bg-[#060A15] space-y-2">
          {activeChatDef && activeChatDef.quickPrompts.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {activeChatDef.quickPrompts.map((qp) => (
                <button
                  key={qp}
                  type="button"
                  disabled={busyAction !== null}
                  onClick={() => void handleAsk(qp)}
                  className="px-2 py-1 text-[10.5px] rounded-md border border-slate-200 dark:border-violet-500/25 bg-white dark:bg-[#0B1224] text-slate-600 dark:text-slate-300 hover:border-sky-400 hover:text-sky-400 transition-colors cursor-pointer disabled:opacity-40 text-left"
                >
                  {qp}
                </button>
              ))}
            </div>
          )}

          <form
            onSubmit={(e) => {
              e.preventDefault();
              void handleAsk();
            }}
            className="flex items-center gap-2"
          >
            <input
              type="text"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              disabled={busyAction !== null}
              placeholder={`${activeChatDef?.title ?? 'AI'} ga savol bering (${selectedSymbol} ${timeframe})...`}
              className="flex-1 px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-violet-500/30 bg-white dark:bg-[#0B1224] text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:border-sky-400"
            />
            <button
              type="submit"
              disabled={busyAction !== null || !inputText.trim()}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg bg-gradient-to-r from-violet-600 to-sky-500 text-white hover:brightness-110 disabled:opacity-40 cursor-pointer shrink-0"
            >
              {busyAction === 'ask' ? (
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Send className="w-3.5 h-3.5" />
              )}
              <span>Yuborish</span>
            </button>
          </form>
        </footer>
      </section>
    </div>
  );
};
