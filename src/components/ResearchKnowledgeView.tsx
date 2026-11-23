import React, { useMemo, useState } from 'react';
import {
  BookOpen,
  CheckCircle2,
  FilePlus2,
  FlaskConical,
  Search,
  ShieldCheck,
  Trash2,
} from 'lucide-react';
import {
  LearningRecord,
  LearningSystemReport,
  LiveSystemStatusSnapshot,
  StrategyRegistryRecord,
  ViewId,
} from '../types/trading';

interface KnowledgeItem {
  id: string;
  title: string;
  domain: string;
  sourceType: 'FILE' | 'REPO' | 'NOTE';
  license: string;
  sha256: string;
  verified: boolean;
  addedAt: string;
  excerpt: string;
}

interface ResearchKnowledgeViewProps {
  registry: StrategyRegistryRecord[];
  systemStatus: LiveSystemStatusSnapshot | null;
  learningRecords: LearningRecord[];
  learningSummary: LearningSystemReport;
  ownerVerified: boolean;
  onNavigate: (view: ViewId) => void;
}

const STORAGE_KEY = 'tk_ai_knowledge_sources_v1';

const KNOWLEDGE_DOMAINS = [
  'ICT / Smart Money Concepts',
  'Japanese Candlestick Patterns',
  'Risk & Portfolio Management',
  'Quantitative Backtesting',
  'Market Microstructure & Liquidity',
  'Macroeconomics & Central Banks',
  'Price Action & Market Structure',
  'Statistical Arbitrage & Mean Reversion',
];

async function computeSha256Hex(text: string): Promise<string> {
  try {
    const encoded = new TextEncoder().encode(text);
    const buf = await crypto.subtle.digest('SHA-256', encoded);
    return Array.from(new Uint8Array(buf))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  } catch {
    return 'unavailable';
  }
}

export const ResearchKnowledgeView: React.FC<ResearchKnowledgeViewProps> = ({
  registry,
  systemStatus,
  learningRecords,
  learningSummary,
  ownerVerified,
  onNavigate,
}) => {
  const [knowledgeItems, setKnowledgeItems] = useState<KnowledgeItem[]>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed as KnowledgeItem[];
      }
    } catch {
      // Ignore storage errors
    }
    return [];
  });

  const [searchQuery, setSearchQuery] = useState('');
  const [titleInput, setTitleInput] = useState('');
  const [domainInput, setDomainInput] = useState(KNOWLEDGE_DOMAINS[0]);
  const [licenseInput, setLicenseInput] = useState('MIT / Ichki hujjat');
  const [contentInput, setContentInput] = useState('');
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  const persistKnowledge = (next: KnowledgeItem[]) => {
    setKnowledgeItems(next);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Ignore quota errors
    }
  };

  const handleAddNoteSource = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!titleInput.trim() || !contentInput.trim()) return;
    const hash = await computeSha256Hex(contentInput.trim());
    const item: KnowledgeItem = {
      id: `ks-${Date.now()}`,
      title: titleInput.trim(),
      domain: domainInput,
      sourceType: 'NOTE',
      license: licenseInput.trim() || 'Ko‘rsatilmagan',
      sha256: hash,
      verified: ownerVerified,
      addedAt: new Date().toLocaleDateString('en-CA'),
      excerpt: contentInput.trim().slice(0, 220),
    };
    persistKnowledge([item, ...knowledgeItems]);
    setTitleInput('');
    setContentInput('');
    setStatusMsg(`Bilim manbasi SHA-256 (${hash.slice(0, 12)}...) bilan saqlandi.`);
    window.setTimeout(() => setStatusMsg(null), 3500);
  };

  const handleFileImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    const hash = await computeSha256Hex(text);
    const item: KnowledgeItem = {
      id: `ks-${Date.now()}`,
      title: file.name,
      domain: domainInput,
      sourceType: 'FILE',
      license: licenseInput.trim() || 'Foydalanuvchi fayli',
      sha256: hash,
      verified: ownerVerified,
      addedAt: new Date().toLocaleDateString('en-CA'),
      excerpt: text.replace(/\s+/g, ' ').trim().slice(0, 220),
    };
    persistKnowledge([item, ...knowledgeItems]);
    setStatusMsg(`"${file.name}" import qilindi · SHA-256: ${hash.slice(0, 14)}...`);
    e.target.value = '';
    window.setTimeout(() => setStatusMsg(null), 3500);
  };

  const handleDeleteKnowledge = (id: string) => {
    persistKnowledge(knowledgeItems.filter((item) => item.id !== id));
  };

  const handleToggleVerify = (id: string) => {
    persistKnowledge(
      knowledgeItems.map((item) =>
        item.id === id ? { ...item, verified: !item.verified } : item
      )
    );
  };

  // Real counts from backend Strategy Registry + imported knowledge
  const registrySourcesCount = registry.length;
  const verifiedRegistryCount = registry.filter(
    (s) => s.license && s.license !== 'UNKNOWN' && s.source
  ).length;
  const backtestedCount = registry.filter(
    (s) => s.backtestStatus === 'PASSED' && s.winRatePct > 0
  ).length;
  const approvalQueue = registry.filter(
    (s) => !s.ownerApproved && (s.backtestStatus === 'PASSED' || s.demoTestStatus === 'PASSED' || s.codeReviewStatus === 'PENDING')
  );
  const researchProgressPct =
    registrySourcesCount > 0
      ? Math.round(
          (registry.filter((s) => s.ownerApproved || s.active).length / registrySourcesCount) * 100
        )
      : 0;

  const filteredKnowledge = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return knowledgeItems;
    return knowledgeItems.filter(
      (k) =>
        k.title.toLowerCase().includes(q) ||
        k.domain.toLowerCase().includes(q) ||
        k.excerpt.toLowerCase().includes(q)
    );
  }, [knowledgeItems, searchQuery]);

  return (
    <div className="space-y-4">
      {/* Header */}
      <section className="rounded-xl border border-slate-200 dark:border-violet-500/30 bg-white dark:bg-[#0B1120] tk-glass-purple p-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <FlaskConical className="w-4 h-4 text-violet-500 dark:text-violet-400" />
            <span>AI Bilim Markazi va Tadqiqot Laboratoriyasi</span>
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Manbalar provenansi (SHA-256), tasdiqlangan strategiyalar tadqiqoti, backtest natijalari va Owner tasdiq navbati.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => onNavigate('backtest')}
            className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-sky-500/40 bg-sky-500/10 text-sky-600 dark:text-sky-300 hover:bg-sky-500/20 cursor-pointer whitespace-nowrap"
          >
            Backtest Lab →
          </button>
          <button
            type="button"
            onClick={() => onNavigate('strategies')}
            className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-violet-500/40 bg-violet-500/15 text-violet-700 dark:text-violet-300 hover:bg-violet-500/25 cursor-pointer whitespace-nowrap"
          >
            Strategiya Markazi →
          </button>
        </div>
      </section>

      {/* 6 Honest KPI Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3 text-xs font-mono tabular-nums">
        <div className="p-3.5 rounded-xl border border-slate-200 dark:border-violet-500/25 bg-white dark:bg-[#0B1120] tk-glass">
          <div className="font-sans text-[11px] text-slate-500">Bilim manbalari</div>
          <div className="mt-1 text-lg font-bold text-slate-900 dark:text-white">
            {registrySourcesCount + knowledgeItems.length}
          </div>
          <div className="font-sans text-[10px] text-slate-500">
            {registrySourcesCount} strategiya · {knowledgeItems.length} lokal hujjat
          </div>
        </div>

        <div className="p-3.5 rounded-xl border border-slate-200 dark:border-violet-500/25 bg-white dark:bg-[#0B1120] tk-glass">
          <div className="font-sans text-[11px] text-slate-500">Tasdiqlangan manba</div>
          <div className="mt-1 text-lg font-bold text-emerald-600 dark:text-[#00E5A0]">
            {verifiedRegistryCount + knowledgeItems.filter((k) => k.verified).length}
          </div>
          <div className="font-sans text-[10px] text-slate-500">Litsenziya & hash tekshirilgan</div>
        </div>

        <div className="p-3.5 rounded-xl border border-slate-200 dark:border-violet-500/25 bg-white dark:bg-[#0B1120] tk-glass">
          <div className="font-sans text-[11px] text-slate-500">Topilgan strategiya</div>
          <div className="mt-1 text-lg font-bold text-sky-600 dark:text-sky-400">
            {registrySourcesCount}
          </div>
          <div className="font-sans text-[10px] text-slate-500">Haqiqiy backend reyestri</div>
        </div>

        <div className="p-3.5 rounded-xl border border-slate-200 dark:border-violet-500/25 bg-white dark:bg-[#0B1120] tk-glass">
          <div className="font-sans text-[11px] text-slate-500">Backtest bajarilgan</div>
          <div className="mt-1 text-lg font-bold text-violet-600 dark:text-violet-400">
            {backtestedCount}
          </div>
          <div className="font-sans text-[10px] text-slate-500">Statistik natija mavjud</div>
        </div>

        <div className="p-3.5 rounded-xl border border-slate-200 dark:border-violet-500/25 bg-white dark:bg-[#0B1120] tk-glass">
          <div className="font-sans text-[11px] text-slate-500">Tadqiqot progressi</div>
          <div className="mt-1 text-lg font-bold text-slate-900 dark:text-white">
            {researchProgressPct}%
          </div>
          <div className="mt-1 h-1.5 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-violet-500 to-sky-400"
              style={{ width: `${Math.max(4, researchProgressPct)}%` }}
            />
          </div>
        </div>

        <div className="p-3.5 rounded-xl border border-slate-200 dark:border-violet-500/25 bg-white dark:bg-[#0B1120] tk-glass">
          <div className="font-sans text-[11px] text-slate-500">O‘rganish jurnali</div>
          <div className="mt-1 text-lg font-bold text-slate-900 dark:text-white">
            {learningRecords.length} yozuv
          </div>
          <div className="font-sans text-[10px] text-slate-500">
            WR: {learningSummary.overallWinRatePct !== null ? `${learningSummary.overallWinRatePct.toFixed(1)}%` : 'Hali yo‘q'}
          </div>
        </div>
      </div>

      {statusMsg && (
        <div className="px-4 py-2 rounded-lg border border-emerald-500/35 bg-emerald-500/10 text-xs text-emerald-700 dark:text-[#00E5A0]">
          {statusMsg}
        </div>
      )}

      {/* Main Split: Knowledge Import & Local Search + Approval Queue */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
        {/* Left: Knowledge Source Importer & Repository */}
        <section className="xl:col-span-7 rounded-xl border border-slate-200 dark:border-sky-500/25 bg-white dark:bg-[#0B1120] tk-glass-blue p-4 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-slate-200 dark:border-violet-500/15">
            <div className="flex items-center gap-2">
              <BookOpen className="w-4 h-4 text-sky-500 dark:text-sky-400" />
              <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
                Bilim Manbalari Ombori (Lokal Sessiya · SHA-256)
              </h2>
            </div>
            <label className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-lg border border-sky-500/40 bg-sky-500/10 text-sky-600 dark:text-sky-300 hover:bg-sky-500/20 cursor-pointer">
              <FilePlus2 className="w-3.5 h-3.5" />
              <span>Fayl import (MD/TXT/CSV/TS/PY)</span>
              <input
                type="file"
                accept=".txt,.md,.csv,.json,.ts,.py,.html"
                onChange={(e) => void handleFileImport(e)}
                className="sr-only"
              />
            </label>
          </div>

          <form onSubmit={(e) => void handleAddNoteSource(e)} className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
            <input
              type="text"
              value={titleInput}
              onChange={(e) => setTitleInput(e.target.value)}
              placeholder="Manba nomi (masalan: ICT Silver Bullet Qoidalari)"
              className="px-3 py-2 rounded-lg border border-slate-200 dark:border-violet-500/25 bg-slate-50 dark:bg-[#060A15] text-slate-900 dark:text-white"
            />
            <select
              value={domainInput}
              onChange={(e) => setDomainInput(e.target.value)}
              className="px-3 py-2 rounded-lg border border-slate-200 dark:border-violet-500/25 bg-slate-50 dark:bg-[#060A15] text-slate-900 dark:text-white"
            >
              {KNOWLEDGE_DOMAINS.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
            <input
              type="text"
              value={licenseInput}
              onChange={(e) => setLicenseInput(e.target.value)}
              placeholder="Litsenziya / Manba URL"
              className="px-3 py-2 rounded-lg border border-slate-200 dark:border-violet-500/25 bg-slate-50 dark:bg-[#060A15] text-slate-900 dark:text-white"
            />
            <button
              type="submit"
              className="px-3 py-2 font-semibold rounded-lg bg-gradient-to-r from-violet-600 to-sky-600 text-white hover:brightness-110 cursor-pointer"
            >
              Manbani qo‘shish & SHA-256 hisoblash
            </button>
            <textarea
              rows={2}
              value={contentInput}
              onChange={(e) => setContentInput(e.target.value)}
              placeholder="Strategiya qoidasi, maqola konspekti yoki risk formulasi matni..."
              className="sm:col-span-2 px-3 py-2 rounded-lg border border-slate-200 dark:border-violet-500/25 bg-slate-50 dark:bg-[#060A15] text-slate-900 dark:text-white"
            />
          </form>

          {/* Local Search */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Bilim bazasidan qidirish..."
              className="w-full pl-9 pr-3 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-violet-500/25 bg-slate-50 dark:bg-[#060A15] text-slate-900 dark:text-white"
            />
          </div>

          {/* Knowledge List */}
          <div className="space-y-2 max-h-[300px] overflow-y-auto">
            {filteredKnowledge.length === 0 ? (
              <div className="p-5 rounded-lg border border-dashed border-slate-300 dark:border-violet-500/25 text-center text-xs text-slate-500">
                Hali foydalanuvchi hujjati yuklanmagan. Yuqoridagi forma yoki fayl importi orqali real hujjat qo‘shing (barcha import qilingan manbalar SHA-256 bilan indekslanadi).
              </div>
            ) : (
              filteredKnowledge.map((item) => (
                <div
                  key={item.id}
                  className="p-3 rounded-lg border border-slate-200 dark:border-violet-500/20 bg-slate-50/70 dark:bg-[#070C18] space-y-1 text-xs"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-slate-900 dark:text-white truncate">
                      {item.title}
                    </span>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => handleToggleVerify(item.id)}
                        className={`inline-flex items-center gap-1 text-[11px] font-mono cursor-pointer ${
                          item.verified ? 'text-emerald-600 dark:text-[#00E5A0]' : 'text-amber-500'
                        }`}
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>{item.verified ? 'Tasdiqlangan' : 'Tekshirilmoqda'}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteKnowledge(item.id)}
                        aria-label="O‘chirish"
                        className="text-slate-400 hover:text-rose-500 cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                  <div className="text-[11px] font-mono text-slate-500">
                    {item.domain} · {item.license} · SHA256:{item.sha256.slice(0, 12)} · {item.addedAt}
                  </div>
                  <p className="text-slate-600 dark:text-slate-300 line-clamp-2">{item.excerpt}</p>
                </div>
              ))
            )}
          </div>
        </section>

        {/* Right: Strategy Approval Queue & Learning Summary */}
        <section className="xl:col-span-5 rounded-xl border border-slate-200 dark:border-violet-500/25 bg-white dark:bg-[#0B1120] tk-glass p-4 flex flex-col justify-between gap-4">
          <div className="space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-slate-200 dark:border-violet-500/15">
              <h2 className="text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-violet-500 dark:text-violet-400" />
                <span>Strategiya Tasdiq Navbati</span>
              </h2>
              <span className="font-mono text-xs text-violet-600 dark:text-violet-400">
                {approvalQueue.length} ta kutilmoqda
              </span>
            </div>

            {approvalQueue.length === 0 ? (
              <div className="p-4 rounded-lg border border-dashed border-slate-300 dark:border-violet-500/20 text-xs text-slate-500 text-center">
                Navbatda kutilayotgan strategiya yo‘q. Barcha tekshirilgan strategiyalar Strategiya Markazida boshqariladi.
              </div>
            ) : (
              <div className="space-y-2 max-h-[250px] overflow-y-auto">
                {approvalQueue.map((strat) => (
                  <div
                    key={strat.id}
                    className="p-2.5 rounded-lg border border-slate-200 dark:border-violet-500/20 bg-slate-50 dark:bg-[#070C18] text-xs space-y-1"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-slate-900 dark:text-white truncate">
                        {strat.name}
                      </span>
                      <span className="font-mono text-[10.5px] text-amber-500 shrink-0">
                        {strat.demoTestStatus === 'PASSED'
                          ? 'DEMO PASSED'
                          : strat.backtestStatus === 'PASSED'
                            ? 'BACKTESTED'
                            : 'PENDING REVIEW'}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-[11px] font-mono text-slate-500">
                      <span>Manba: {strat.source}</span>
                      <span>
                        WR: {strat.winRatePct > 0 ? `${strat.winRatePct}%` : '—'}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <button
              type="button"
              onClick={() => onNavigate(ownerVerified ? 'strategies' : 'owner')}
              className="w-full py-2 text-xs font-semibold rounded-lg border border-violet-500/40 bg-violet-500/10 text-violet-700 dark:text-violet-300 hover:bg-violet-500/20 cursor-pointer"
            >
              {ownerVerified
                ? 'Strategiya Markazida tasdiqlash →'
                : 'Owner Markazida kirish va tasdiqlash →'}
            </button>
          </div>

          {/* Learning & Memory Box */}
          <div className="p-3 rounded-lg border border-slate-200 dark:border-sky-500/20 bg-slate-50 dark:bg-[#070C18] text-xs space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-slate-800 dark:text-sky-300">
                AI O‘rganish & Xotira Holati
              </span>
              <span className="font-mono text-[11px] text-slate-500">
                DB: {systemStatus?.dbSizeKb ?? 0} KB
              </span>
            </div>
            <div className="grid grid-cols-3 gap-2 font-mono tabular-nums text-[11px]">
              <div>
                <div className="font-sans text-slate-500">Jami yozuv</div>
                <div className="font-bold text-slate-900 dark:text-white">{learningRecords.length}</div>
              </div>
              <div>
                <div className="font-sans text-slate-500">Yakunlangan</div>
                <div className="font-bold text-sky-500">{learningSummary.resolvedCount}</div>
              </div>
              <div>
                <div className="font-sans text-slate-500">Sof natija</div>
                {(() => {
                  const totalPnl = learningRecords.reduce((s, r) => s + r.pnlUsd, 0);
                  return (
                    <div
                      className={`font-bold ${
                        totalPnl >= 0
                          ? 'text-emerald-600 dark:text-[#00E5A0]'
                          : 'text-rose-500'
                      }`}
                    >
                      ${totalPnl.toFixed(0)}
                    </div>
                  );
                })()}
              </div>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('journal')}
              className="text-sky-600 dark:text-sky-400 hover:underline font-medium cursor-pointer"
            >
              Savdo Jurnalini ochish →
            </button>
          </div>
        </section>
      </div>
    </div>
  );
};
