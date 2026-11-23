import React, { useState } from 'react';
import { MarketPair, Position, RiskGuardSettings, ServerConfig, StrategyConfig } from '../types/trading';
import { buildStandaloneIndexHtml } from '../utils/standaloneHtmlExporter';
import { buildMt5BridgePython } from '../utils/mt5BridgeGenerator';
import { Check, CheckCircle2, Copy, Download, FileCode2, RefreshCw, Terminal, XCircle } from 'lucide-react';

interface ServerBridgeViewProps {
  serverConfig: ServerConfig;
  onUpdateConfig: (cfg: ServerConfig) => void;
  pairs: MarketPair[];
  positions: Position[];
  strategies: StrategyConfig[];
  riskGuard: RiskGuardSettings;
  onSyncFromServer: (data: { pairs?: MarketPair[]; positions?: Position[] }) => void;
}

interface DualTestResult {
  mt5Ok: boolean;
  mt5Detail: string;
  aiOk: boolean;
  aiDetail: string;
  proxyUrl?: string;
}

export const ServerBridgeView: React.FC<ServerBridgeViewProps> = ({
  serverConfig,
  onUpdateConfig,
  pairs,
  positions,
  strategies,
  riskGuard,
  onSyncFromServer,
}) => {
  const [draft, setDraft] = useState<ServerConfig>(serverConfig);
  const [testState, setTestState] = useState<'idle' | 'testing' | 'ok' | 'error'>('idle');
  const [testMessage, setTestMessage] = useState('');
  const [dualResult, setDualResult] = useState<DualTestResult | null>(null);
  const [copiedTarget, setCopiedTarget] = useState<'html' | 'py' | 'env' | null>(null);

  const downloadTextFile = (filename: string, content: string, mime: string) => {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const buildEnvTemplate = () => {
    const proxyBase = (draft.llmProxyUrl || 'http://localhost:3001/v1').trim();
    return `# Trade Killer AI — Lokal AI Proksi sozlamalari (.env)
# Quyidagi qatorga FreeLLMAPI proksidan olingan kalitingizni qo'ying:
LOCAL_LLM_BASE_URL="${proxyBase}"
LOCAL_LLM_API_KEY="SIZNING_PROKSI_KALITINGIZ"
`;
  };

  const handleDownloadHtml = () => {
    const html = buildStandaloneIndexHtml({
      pairs,
      positions,
      strategies,
      riskGuard,
      serverConfig: draft,
    });
    downloadTextFile('index.html', html, 'text/html;charset=utf-8');
  };

  const handleDownloadPython = () => {
    const py = buildMt5BridgePython();
    downloadTextFile('mt5_bridge.py', py, 'text/x-python;charset=utf-8');
  };

  const handleDownloadEnv = () => {
    downloadTextFile('.env', buildEnvTemplate(), 'text/plain;charset=utf-8');
  };

  const handleDownloadBat = () => {
    const bat = `@echo off
title Trade Killer AI - MT5 Bridge
cd /d "%~dp0"
echo [1/2] Python kutubxonalari tekshirilmoqda...
pip install -q MetaTrader5 fastapi uvicorn httpx pydantic
echo [2/2] MT5 Bridge ishga tushirilmoqda (http://127.0.0.1:8000)...
python mt5_bridge.py
pause
`;
    downloadTextFile('start_mt5_bridge.bat', bat, 'application/x-bat;charset=utf-8');
  };

  const handleCopy = async (target: 'html' | 'py' | 'env') => {
    const content =
      target === 'html'
        ? buildStandaloneIndexHtml({ pairs, positions, strategies, riskGuard, serverConfig: draft })
        : target === 'py'
          ? buildMt5BridgePython()
          : buildEnvTemplate();
    try {
      await navigator.clipboard.writeText(content);
      setCopiedTarget(target);
      window.setTimeout(() => setCopiedTarget(null), 2500);
    } catch {
      if (target === 'html') handleDownloadHtml();
      else if (target === 'py') handleDownloadPython();
      else handleDownloadEnv();
    }
  };

  const handleTestMt5AndProxy = async (e: React.FormEvent) => {
    e.preventDefault();
    onUpdateConfig(draft);
    setTestState('testing');
    setDualResult(null);
    setTestMessage('MT5 Bridge va localhost:3001/v1 AI Proksi tekshirilmoqda...');

    const base = draft.apiBaseUrl.replace(/\/$/, '');
    try {
      const [statusRes, aiTestRes] = await Promise.allSettled([
        fetch(`${base}/api/status`),
        fetch(`${base}/api/ai/test`),
      ]);

      if (statusRes.status === 'fulfilled' && statusRes.value.ok) {
        const statusJson = await statusRes.value.json();
        if (statusJson && (Array.isArray(statusJson.pairs) || Array.isArray(statusJson.positions))) {
          onSyncFromServer(statusJson);
        }
      }

      if (aiTestRes.status === 'fulfilled' && aiTestRes.value.ok) {
        const testJson = (await aiTestRes.value.json()) as DualTestResult;
        setDualResult(testJson);
        const bothOk = testJson.mt5Ok && testJson.aiOk;
        setTestState(bothOk ? 'ok' : 'error');
        setTestMessage(
          bothOk
            ? 'MetaTrader 5 va Lokal AI Proksi (localhost:3001/v1) to‘liq tayyor!'
            : 'Bridge ulandi, lekin MT5 yoki AI Proksi bo‘yicha quyidagi holatni tekshiring.'
        );
        return;
      }

      if (statusRes.status === 'fulfilled' && statusRes.value.ok) {
        setTestState('ok');
        setTestMessage('MetaTrader 5 ko‘prigi ulandi.');
        return;
      }

      throw new Error('Bridge javob bermadi');
    } catch (err) {
      setTestState('error');
      setTestMessage(
        `Lokal MT5 Bridge javob bermadi (${err instanceof Error ? err.message : 'offline'}). VS Code terminalida "python mt5_bridge.py" ni ishga tushiring.`
      );
    }
  };

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#131B2B] neon-surface p-6">
        <div className="flex flex-wrap items-start justify-between gap-4 pb-4 border-b border-slate-200 dark:border-slate-800">
          <div className="max-w-3xl">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
              MetaTrader 5 ni Haqiqiy Ulash (VS Code / Windows PC)
            </h2>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              Brauzerdagi ushbu bulut (<code className="font-mono text-xs">https://</code>) sahifasi xavfsizlik sababli kompyuteringizdagi MetaTrader 5 ga to‘g‘ridan-to‘g‘ri kira olmaydi. Haqiqiy shamlar, balans va savdo uchun bitta papkaga quyidagi fayllarni yuklab oling: <code className="font-mono text-xs px-1.5 py-0.5 rounded bg-slate-100 dark:bg-[#0D1320] text-[#C8285E] dark:text-[#FF7AA5]">mt5_bridge.py</code>, <code className="font-mono text-xs px-1.5 py-0.5 rounded bg-slate-100 dark:bg-[#0D1320] text-emerald-600 dark:text-emerald-400">index.html</code> (va xohlasangiz AI uchun <code className="font-mono text-xs px-1.5 py-0.5 rounded bg-slate-100 dark:bg-[#0D1320] text-amber-600 dark:text-amber-300">.env</code>). Keyin <code className="font-mono text-xs">http://127.0.0.1:8000</code> manzilini oching.
            </p>
          </div>
          <button
            type="button"
            onClick={handleDownloadBat}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg border border-[#F25F8C]/45 bg-[#F25F8C]/12 text-[#C8285E] dark:text-[#FF7AA5] hover:bg-[#F25F8C]/20 cursor-pointer whitespace-nowrap"
          >
            <Download className="w-3.5 h-3.5" />
            <span>start_mt5_bridge.bat (1-bosish)</span>
          </button>
        </div>

        <div className="mt-5 grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="p-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0D1320] flex flex-col justify-between gap-4">
            <div>
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono text-sm font-semibold text-[#C8285E] dark:text-[#FF7AA5]">
                  1. mt5_bridge.py
                </span>
                <span className="text-xs text-slate-500 dark:text-slate-400">
                  Python Server
                </span>
              </div>
              <p className="mt-2 text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                MT5 dan real shamlarni oladi, 12 ta strategiyani (Pine + GitHub) hisoblaydi, <code className="font-mono">.env</code> ni avtomatik o‘qiydi va <code className="font-mono">localhost:3001/v1</code> AI proksiga ulanadi.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleDownloadPython}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg bg-gradient-to-r from-[#F25F8C] via-[#EB6B7B] to-[#E87769] text-slate-950 hover:brightness-110 neon-glow-cyan cursor-pointer whitespace-nowrap"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Yuklab olish</span>
              </button>
              <button
                type="button"
                onClick={() => handleCopy('py')}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:border-[#F25F8C]/45 cursor-pointer whitespace-nowrap"
              >
                {copiedTarget === 'py' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedTarget === 'py' ? 'Nusxa olindi' : 'Nusxa olish'}</span>
              </button>
            </div>
          </div>

          <div className="p-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0D1320] flex flex-col justify-between gap-4">
            <div>
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono text-sm font-semibold text-emerald-600 dark:text-emerald-400">
                  2. index.html
                </span>
                <span className="text-xs text-slate-500 dark:text-slate-400">
                  Terminal UI
                </span>
              </div>
              <p className="mt-2 text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                Ko‘zga yoqimli dizayn, real MT5 shamlari, 12-strategiya AI suhbati, xulosalar, backtest va tezkor ulanish testi.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleDownloadHtml}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg bg-emerald-600 dark:bg-emerald-500 text-white dark:text-slate-950 hover:opacity-90 cursor-pointer whitespace-nowrap"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Yuklab olish</span>
              </button>
              <button
                type="button"
                onClick={() => handleCopy('html')}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:border-[#F25F8C]/45 cursor-pointer whitespace-nowrap"
              >
                {copiedTarget === 'html' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedTarget === 'html' ? 'Nusxa olindi' : 'Nusxa olish'}</span>
              </button>
            </div>
          </div>

          <div className="p-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0D1320] flex flex-col justify-between gap-4">
            <div>
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono text-sm font-semibold text-amber-600 dark:text-amber-300">
                  3. .env shablon
                </span>
                <span className="text-xs text-slate-500 dark:text-slate-400">
                  Proksi sozlamasi
                </span>
              </div>
              <p className="mt-2 text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                Har safar terminalga yozmaslik uchun <code className="font-mono">.env</code> faylini yuklab olib, ichiga o‘z <code className="font-mono">freellmapi-...</code> kalitingizni bir marta joylashtiring.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleDownloadEnv}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg border border-amber-500/45 bg-amber-500/15 text-amber-700 dark:text-amber-300 hover:bg-amber-500/25 cursor-pointer whitespace-nowrap"
              >
                <FileCode2 className="w-3.5 h-3.5" />
                <span>.env yuklab olish</span>
              </button>
              <button
                type="button"
                onClick={() => handleCopy('env')}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:border-[#F25F8C]/45 cursor-pointer whitespace-nowrap"
              >
                {copiedTarget === 'env' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedTarget === 'env' ? 'Nusxa olindi' : 'Nusxa olish'}</span>
              </button>
            </div>
          </div>
        </div>

        <div className="mt-5 p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-[#0D1320] text-slate-200 font-mono text-xs space-y-1.5">
          <div className="flex items-center gap-2 text-[#FF7AA5] mb-2">
            <Terminal className="w-4 h-4" />
            <span>Ishga tushirish (VS Code yoki start_mt5_bridge.bat):</span>
          </div>
          <div>1. MetaTrader 5 dasturini kompyuterda oching va hisobingizga kiring (Algo Trading tugmasini yashil qiling).</div>
          <div>2. Shu papkada: pip install MetaTrader5 fastapi uvicorn httpx pydantic</div>
          <div>3. python mt5_bridge.py (yoki start_mt5_bridge.bat ni 2 marta bosing)</div>
          <div className="text-emerald-400 pt-1">
            Tayyor: brauzer avtomatik ravishda http://127.0.0.1:8000 ni ochadi — o‘sha yerda MT5 ning haqiqiy shamlari va real balansingiz ishlaydi.
          </div>
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#131B2B] neon-surface p-6">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100 pb-4 border-b border-slate-200 dark:border-slate-800">
          MT5 va Lokal AI Proksi (localhost:3001/v1) ulanish testi
        </h2>

        <form onSubmit={handleTestMt5AndProxy} className="mt-5 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1.5">
                Lokal MT5 Bridge manzili
              </label>
              <input
                type="url"
                value={draft.apiBaseUrl}
                onChange={(e) => setDraft({ ...draft, apiBaseUrl: e.target.value })}
                className="w-full px-3 py-2 text-sm font-mono rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#0D1320] text-slate-900 dark:text-white"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1.5">
                Lokal AI Proksi Host URL
              </label>
              <input
                type="url"
                value={draft.llmProxyUrl}
                onChange={(e) => setDraft({ ...draft, llmProxyUrl: e.target.value })}
                className="w-full px-3 py-2 text-sm font-mono rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#0D1320] text-slate-900 dark:text-white"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1.5">
                MT5 Hisob (Login)
              </label>
              <input
                type="text"
                value={draft.mt5Login}
                onChange={(e) => setDraft({ ...draft, mt5Login: e.target.value })}
                className="w-full px-3 py-2 text-sm font-mono rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#0D1320] text-slate-900 dark:text-white"
              />
            </div>
          </div>

          {testState !== 'idle' && (
            <p
              className={`text-xs font-medium ${
                testState === 'ok'
                  ? 'text-emerald-600 dark:text-emerald-400'
                  : testState === 'error'
                    ? 'text-amber-600 dark:text-amber-400'
                    : 'text-slate-500'
              }`}
            >
              {testMessage}
            </p>
          )}

          {dualResult && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="p-3.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0D1320] flex items-start gap-2.5 text-xs">
                {dualResult.mt5Ok ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                ) : (
                  <XCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                )}
                <div>
                  <div className="font-semibold text-slate-900 dark:text-slate-100">MetaTrader 5 Terminali</div>
                  <div className="text-slate-500 dark:text-slate-400 mt-0.5">{dualResult.mt5Detail}</div>
                </div>
              </div>
              <div className="p-3.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0D1320] flex items-start gap-2.5 text-xs">
                {dualResult.aiOk ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                ) : (
                  <XCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                )}
                <div>
                  <div className="font-semibold text-slate-900 dark:text-slate-100">Lokal AI Proksi ({dualResult.proxyUrl})</div>
                  <div className="text-slate-500 dark:text-slate-400 mt-0.5">{dualResult.aiDetail}</div>
                </div>
              </div>
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3">
            <label className="inline-flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                checked={draft.autoSyncMt5}
                onChange={(e) => {
                  const updated = { ...draft, autoSyncMt5: e.target.checked };
                  setDraft(updated);
                  onUpdateConfig(updated);
                }}
                className="rounded border-slate-600 accent-[#F25F8C]"
              />
              <span>MT5 bilan har 2 soniyada avtomatik sinxronlash</span>
            </label>

            <button
              type="submit"
              className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg bg-gradient-to-r from-[#F25F8C] via-[#EB6B7B] to-[#E87769] text-slate-950 hover:brightness-110 neon-glow-cyan cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${testState === 'testing' ? 'animate-spin' : ''}`} />
              <span>MT5 + AI Proksini tekshirish</span>
            </button>
          </div>
        </form>
      </section>
    </div>
  );
};
