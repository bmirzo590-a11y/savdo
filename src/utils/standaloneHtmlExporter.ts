import { MarketPair, Position, RiskGuardSettings, ServerConfig, StrategyConfig } from '../types/trading';

export interface ExportPayload {
  pairs: MarketPair[];
  positions: Position[];
  strategies: StrategyConfig[];
  riskGuard: RiskGuardSettings;
  serverConfig: ServerConfig;
}

export function buildStandaloneIndexHtml(payload: ExportPayload): string {
  const safeJson = JSON.stringify(payload).replace(/<\/script>/gi, '<\\/script>');

  return `<!doctype html>
<html lang="uz" class="dark">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Trade Killer AI · MT5 12-Strategiya Terminal</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600&family=Plus+Jakarta+Sans:wght@600;700&display=swap" rel="stylesheet" />
  <script src="https://cdn.tailwindcss.com"></script>
  <script>
    tailwind.config = {
      darkMode: 'class',
      theme: {
        extend: {
          fontFamily: {
            display: ['Plus Jakarta Sans', 'system-ui', 'sans-serif'],
            sans: ['DM Sans', 'system-ui', 'sans-serif'],
            mono: ['JetBrains Mono', 'monospace'],
          }
        }
      }
    };
  </script>
  <style>
    .tabular-nums { font-variant-numeric: tabular-nums; }
    .dark .neon-surface {
      background-color: #131B2B;
      border-color: rgba(242, 95, 140, 0.22);
      box-shadow: 0 12px 32px -18px rgba(2, 6, 23, 0.8), 0 0 24px -14px rgba(242, 95, 140, 0.26);
    }
    .neon-glow-accent {
      box-shadow: 0 6px 20px -6px rgba(242, 95, 140, 0.5), 0 0 14px -4px rgba(232, 119, 105, 0.34);
    }
  </style>
</head>
<body class="bg-[#F5F7FB] text-slate-900 dark:bg-[#0C111C] dark:text-slate-100 font-sans antialiased">
  <div class="min-h-screen flex flex-col lg:flex-row">
    <aside class="w-full lg:w-64 shrink-0 border-b lg:border-b-0 lg:border-r border-slate-200 dark:border-slate-800/80 bg-white dark:bg-[#101624] flex flex-col justify-between">
      <div>
        <div class="h-16 px-6 flex items-center border-b border-slate-200 dark:border-slate-800/80">
          <span class="font-display text-lg font-bold tracking-tight text-slate-900 dark:bg-gradient-to-r dark:from-[#F25F8C] dark:via-[#EB6B7B] dark:to-[#E87769] dark:bg-clip-text dark:text-transparent whitespace-nowrap">Trade Killer AI</span>
        </div>
        <nav class="p-4 flex lg:flex-col gap-1 overflow-x-auto">
          <button data-view="terminal" class="tk-nav-btn text-left px-3.5 py-2.5 text-sm font-medium rounded-lg whitespace-nowrap shrink-0">MT5 Terminal</button>
          <button data-view="ai" class="tk-nav-btn text-left px-3.5 py-2.5 text-sm font-medium rounded-lg whitespace-nowrap shrink-0">AI Savdo & Suhbat</button>
          <button data-view="backtest" class="tk-nav-btn text-left px-3.5 py-2.5 text-sm font-medium rounded-lg whitespace-nowrap shrink-0">Backtest & Tarix</button>
          <button data-view="positions" class="tk-nav-btn text-left px-3.5 py-2.5 text-sm font-medium rounded-lg whitespace-nowrap shrink-0">MT5 Pozitsiyalar</button>
        </nav>
      </div>
      <div class="p-4 border-t border-slate-200 dark:border-slate-800/80 hidden lg:block space-y-2">
        <div class="flex items-center justify-between text-xs text-slate-400 px-1">
          <span>MT5 Hisob</span>
          <span id="tk-side-login" class="font-mono text-[#FF7AA5]">#-</span>
        </div>
        <button id="tk-kill-all-btn" class="w-full py-2.5 px-4 text-xs font-semibold rounded-lg bg-rose-500/15 text-rose-400 border border-rose-500/30 hover:bg-rose-600 hover:text-white transition-colors">
          Barcha MT5 savdolarni yopish
        </button>
      </div>
    </aside>

    <div class="flex-1 flex flex-col min-w-0">
      <header class="h-16 px-6 border-b border-slate-200 dark:border-slate-800/80 bg-white dark:bg-[#101624] flex items-center justify-between gap-4">
        <div class="text-sm text-slate-500 dark:text-slate-400 truncate whitespace-nowrap">
          Trade Killer AI <span class="mx-2">/</span> <span id="tk-breadcrumb" class="text-[#C8285E] dark:text-[#FF7AA5] font-medium">MT5 Terminal</span>
        </div>
        <div class="flex items-center gap-2.5 shrink-0">
          <button id="tk-live-btn" class="px-3 py-1.5 text-xs font-semibold rounded-lg border border-emerald-500/40 bg-emerald-500/15 text-emerald-400 whitespace-nowrap">Jonli: 2s</button>
          <button id="tk-test-btn" class="px-3 py-1.5 text-xs font-semibold rounded-lg border border-[#F25F8C]/45 bg-[#F25F8C]/12 text-[#C8285E] dark:text-[#FF7AA5] hover:bg-[#F25F8C]/20 whitespace-nowrap">MT5 + AI Test</button>
          <button id="tk-theme-btn" class="px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 whitespace-nowrap">Tungi rejim</button>
          <button id="tk-sync-btn" class="px-4 py-2 text-xs font-semibold rounded-lg bg-gradient-to-r from-[#F25F8C] via-[#EB6B7B] to-[#E87769] text-slate-950 neon-glow-accent whitespace-nowrap">MT5 Yangilash</button>
        </div>
      </header>

      <div id="tk-test-banner" class="hidden px-6 py-2.5 text-xs border-b border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-[#131B2B]"></div>

      <main id="tk-main" class="p-6 max-w-[1380px] w-full mx-auto space-y-6"></main>
    </div>
  </div>

  <script>
    const INITIAL_STATE = ${safeJson};
    const API_BASE = (location.protocol.startsWith('http') && (location.hostname === '127.0.0.1' || location.hostname === 'localhost') && location.port === '8000')
      ? ''
      : ((INITIAL_STATE.serverConfig && INITIAL_STATE.serverConfig.apiBaseUrl) || 'http://127.0.0.1:8000').replace(/\\/$/, '');
    function apiUrl(p) { return API_BASE + p; }

    const state = {
      view: 'terminal',
      selectedSymbol: INITIAL_STATE.pairs[0].symbol,
      timeframe: 'M5',
      pairs: INITIAL_STATE.pairs,
      positions: INITIAL_STATE.positions,
      candles: [],
      brain: null,
      candleSource: 'MT5 kutilmoqda',
      balance: 24500,
      equity: 24500,
      marginFree: 24500,
      openProfit: 0,
      login: 0,
      serverName: '',
      autoSync: true,
      syncBusy: false,
      fullPermissions: true,
      mt5Status: 'Lokal MT5 tekshirilmoqda...',
      aiProxyStatus: 'Tekshirilmagan',
      orderMsg: '',
      orderSide: 'BUY',
      orderLot: '0.10',
      orderSl: '',
      orderTp: '',
      riskPct: '1',
      backtestResult: null,
      btStrategy: 'all_12_mega_brain',
      aiSummary: null,
      chat: [{ role: 'model', text: 'Assalomu alaykum! Men MT5 va 12-strategiya (EMA 20/50/100/200, Glaz RSI, Libertus Divergensiya, LuxAlgo SMC, PAC34, VWAP hamda GitHub paketlari: Leviathan, Geraked UT/ZLSMA, Alorse Double Supertrend, Pandas-TA ADX, Azadone Ichimoku Sweep, PyneCore HMA21) miyasiga ulangan Trade Killer AI man.' }]
    };

    function fmtMoney(n) {
      const abs = Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      return (n < 0 ? '-$' : '$') + abs;
    }

    function fmtPrice(n) {
      var dec = n >= 100 ? 2 : (n >= 10 ? 3 : 4);
      return Number(n).toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec });
    }

    function calcEma(arr, p) {
      if (!arr.length) return [];
      const k = 2 / (p + 1);
      const res = [arr[0]];
      for (let i = 1; i < arr.length; i++) res.push(arr[i] * k + res[i - 1] * (1 - k));
      return res;
    }

    function calcRsi(closes, p = 14) {
      const n = closes.length;
      const out = new Array(n).fill(50);
      if (n <= p) return out;
      let g = 0, l = 0;
      for (let i = 1; i <= p; i++) {
        const d = closes[i] - closes[i - 1];
        if (d > 0) g += d; else l += -d;
      }
      g /= p; l /= p;
      out[p] = l === 0 ? 100 : g === 0 ? 0 : 100 - 100 / (1 + g / l);
      for (let i = p + 1; i < n; i++) {
        const d = closes[i] - closes[i - 1];
        g = (g * (p - 1) + (d > 0 ? d : 0)) / p;
        l = (l * (p - 1) + (d < 0 ? -d : 0)) / p;
        out[i] = l === 0 ? 100 : g === 0 ? 0 : 100 - 100 / (1 + g / l);
      }
      return out;
    }

    function calcAtr(candles, p = 10) {
      const trs = candles.map((c, i) => i === 0 ? (c.high - c.low) : Math.max(c.high - c.low, Math.abs(c.high - candles[i - 1].close), Math.abs(c.low - candles[i - 1].close)));
      const atr = [trs[0] || 0];
      const a = 1 / Math.max(1, p);
      for (let i = 1; i < trs.length; i++) atr.push(a * trs[i] + (1 - a) * atr[i - 1]);
      return atr;
    }

    function calcSupertrend(candles, period = 10, mult = 3.0) {
      const atr = calcAtr(candles, period);
      const ub = [], lb = [], dir = [], val = [];
      for (let i = 0; i < candles.length; i++) {
        const hl2 = (candles[i].high + candles[i].low) / 2;
        const bu = hl2 + mult * atr[i], bl = hl2 - mult * atr[i];
        if (i === 0) { ub.push(bu); lb.push(bl); dir.push(1); val.push(bl); continue; }
        ub.push(bu < ub[i - 1] || candles[i - 1].close > ub[i - 1] ? bu : ub[i - 1]);
        lb.push(bl > lb[i - 1] || candles[i - 1].close < lb[i - 1] ? bl : lb[i - 1]);
        const pd = dir[i - 1];
        const d = (pd === -1 && candles[i].close > ub[i]) ? 1 : ((pd === 1 && candles[i].close < lb[i]) ? -1 : pd);
        dir.push(d);
        val.push(d === 1 ? lb[i] : ub[i]);
      }
      return { val, dir };
    }

    function calcUtBot(candles, p = 10, coef = 2.0) {
      const atr = calcAtr(candles, p);
      const stop = [candles[0] ? candles[0].close : 0];
      const sig = ['KUTISH'];
      for (let i = 1; i < candles.length; i++) {
        const s = candles[i].close, ps = candles[i - 1].close, st = stop[i - 1], nl = coef * atr[i];
        let nx = s > st ? s - nl : s + nl;
        if (s > st && ps > st) nx = Math.max(st, s - nl);
        else if (s < st && ps < st) nx = Math.min(st, s + nl);
        stop.push(nx);
        sig.push(ps <= st && s > nx ? 'BUY' : (ps >= st && s < nx ? 'SELL' : 'KUTISH'));
      }
      return { stop, sig };
    }

    function computeBrainLocal(candles) {
      if (!candles || candles.length < 25) return null;
      const closes = candles.map(c => c.close);
      const highs = candles.map(c => c.high);
      const lows = candles.map(c => c.low);
      const e20 = calcEma(closes, 20), e50 = calcEma(closes, 50), e100 = calcEma(closes, 100), e200 = calcEma(closes, 200);
      const rsi = calcRsi(closes, 14);
      const n = closes.length - 1;
      const align = e20[n] > e50[n] && e50[n] > e100[n] && e100[n] > e200[n] ? 'Buqa Fan' : (e20[n] < e50[n] && e50[n] < e100[n] && e100[n] < e200[n] ? 'Ayiq Fan' : 'Aralash');
      const pacC = calcEma(closes, 34);
      const f89 = calcEma(closes, 89);
      const st1 = calcSupertrend(candles, 10, 3.0);
      const st2 = calcSupertrend(candles, 10, 5.0);
      const ut = calcUtBot(candles, 10, 2.0);
      const doubleSt = st1.dir[n] === 1 && st2.dir[n] === 1 ? 'DOUBLE_BULL' : (st1.dir[n] === -1 && st2.dir[n] === -1 ? 'DOUBLE_BEAR' : 'ARALASH');
      const tenkan = (Math.max(...highs.slice(-9)) + Math.min(...lows.slice(-9))) / 2;
      const kijun = (Math.max(...highs.slice(-26)) + Math.min(...lows.slice(-26))) / 2;
      const spanA = (tenkan + kijun) / 2;
      const spanB = (Math.max(...highs.slice(-52)) + Math.min(...lows.slice(-52))) / 2;
      const kumoBias = closes[n] > Math.max(spanA, spanB) ? 'BULL_KUMO' : (closes[n] < Math.min(spanA, spanB) ? 'BEAR_KUMO' : 'KUMO_ICHIDA');
      let vSum = 0, volSum = 0;
      for (const c of candles) { const hl2 = (c.high + c.low) / 2; const v = Math.max(1, c.volume || 1); vSum += hl2 * v; volSum += v; }
      const vwap = vSum / volSum;
      const top = Math.max(...highs), bot = Math.min(...lows);
      const zPct = ((closes[n] - bot) / Math.max(1e-9, top - bot)) * 100;
      return {
        alignment: align,
        rsi14: rsi[n],
        pac34: pacC[n],
        ema89: f89[n],
        vwap,
        doubleSt,
        utSignal: ut.sig[n],
        kumoBias,
        smcZone: zPct > 52.5 ? 'Premium' : (zPct < 47.5 ? 'Discount' : 'Equilibrium'),
        series: { e20, e50, e200, st1: st1.val }
      };
    }

    function calcPnl(pos) {
      if (typeof pos.profit === 'number') return pos.profit;
      if (pos.status === 'CLOSED' && pos.realizedPnl !== undefined) return pos.realizedPnl;
      if (pos.status === 'PENDING') return 0;
      const diff = pos.side === 'LONG' ? (pos.markPrice - pos.entryPrice) / pos.entryPrice : (pos.entryPrice - pos.markPrice) / pos.entryPrice;
      return (pos.sizeUsdt || 5000) * diff;
    }

    async function fetchMt5Candles() {
      try {
        const res = await fetch(apiUrl('/api/candles?symbol=' + encodeURIComponent(state.selectedSymbol) + '&timeframe=' + state.timeframe + '&count=180'));
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const data = await res.json();
        if (Array.isArray(data.candles) && data.candles.length) {
          state.candles = data.candles;
          state.candleSource = 'MT5 Real Shamlar';
          state.brain = computeBrainLocal(data.candles);
          try {
            const br = await fetch(apiUrl('/api/brain?symbol=' + encodeURIComponent(state.selectedSymbol) + '&timeframe=' + state.timeframe));
            if (br.ok) {
              const bjson = await br.json();
              if (bjson && bjson.emaRibbon) state.brain = { ...state.brain, serverBrain: bjson };
            }
          } catch (_) {}
          return;
        }
      } catch (_) {}
      state.candleSource = 'Simulyatsiya (MT5 ulanmagan)';
    }

    async function syncMt5() {
      if (state.syncBusy) return;
      state.syncBusy = true;
      try {
        const res = await fetch(apiUrl('/api/status'));
        if (!res.ok) {
          let errMsg = 'HTTP ' + res.status;
          try { const ej = await res.json(); if (ej && ej.detail) errMsg = ej.detail; } catch (_) {}
          throw new Error(errMsg);
        }
        const data = await res.json();
        if (data.account) {
          state.balance = Number(data.account.balance || 0);
          state.equity = Number(data.account.equity || state.balance);
          state.marginFree = Number(data.account.margin_free || state.balance);
          state.openProfit = Number(data.account.profit || 0);
          state.login = Number(data.account.login || 0);
          state.serverName = String(data.account.server || '');
          const sideLogin = document.getElementById('tk-side-login');
          if (sideLogin && state.login) sideLogin.textContent = '#' + state.login;
        }
        if (Array.isArray(data.pairs) && data.pairs.length) {
          state.pairs = data.pairs;
          if (!state.pairs.some(p => p.symbol === state.selectedSymbol)) {
            const match = state.pairs.find(p => p.symbol.toUpperCase().startsWith(state.selectedSymbol.toUpperCase()));
            state.selectedSymbol = match ? match.symbol : state.pairs[0].symbol;
          }
        }
        if (Array.isArray(data.positions)) state.positions = data.positions;
        state.mt5Status = state.login ? ('MT5 Ulangan (#' + state.login + ')') : 'MT5 Ulangan';
      } catch (err) {
        state.mt5Status = err && err.message && err.message.indexOf('Failed to fetch') === -1
          ? err.message
          : 'Offline (python mt5_bridge.py ni yoqing)';
      }
      await fetchMt5Candles();
      state.syncBusy = false;
      const activeEl = document.activeElement;
      if (activeEl && (activeEl.id === 'tk-ai-input' || activeEl.id === 'tk-lot' || activeEl.id === 'tk-sl' || activeEl.id === 'tk-tp' || activeEl.id === 'tk-risk-pct')) {
        return;
      }
      render();
    }

    async function runConnectionTest() {
      const banner = document.getElementById('tk-test-banner');
      banner.classList.remove('hidden');
      banner.innerHTML = '<span class="text-[#FF7AA5] font-mono">MT5 va localhost:3001/v1 AI Proksi tekshirilmoqda...</span>';
      try {
        const res = await fetch(apiUrl('/api/ai/test'));
        const t = await res.json();
        state.mt5Status = t.mt5Ok ? 'MT5 Ulangan' : t.mt5Detail;
        state.aiProxyStatus = t.aiOk ? 'AI Proksi Tayyor' : t.aiDetail;
        banner.innerHTML =
          '<div class="flex flex-wrap gap-6 font-mono">' +
          '<span class="' + (t.mt5Ok ? 'text-emerald-400' : 'text-amber-400') + '">MT5: ' + t.mt5Detail + '</span>' +
          '<span class="' + (t.aiOk ? 'text-emerald-400' : 'text-amber-400') + '">AI Proksi: ' + t.aiDetail + '</span>' +
          '</div>';
      } catch (_) {
        banner.innerHTML = '<span class="text-rose-400 font-mono">Bridge offline. VS Code terminalida "python mt5_bridge.py" ni ishga tushiring.</span>';
      }
      render();
    }

    function renderCandlesSvg() {
      const total = state.candles.length;
      const viewCount = 52;
      const start = Math.max(0, total - viewCount);
      const candles = total ? state.candles.slice(start) : [];
      if (!candles.length) return '<div class="py-16 text-center text-xs text-slate-400">MT5 shamlari yuklanmoqda...</div>';
      const w = 740, h = 280, pad = 20, rightPad = 68;
      let min = Math.min(...candles.map(c => c.low));
      let max = Math.max(...candles.map(c => c.high));
      const padRange = (max - min) * 0.08 || 1;
      min -= padRange; max += padRange;
      const pY = (v) => pad + (1 - (v - min) / (max - min || 1)) * (h - pad * 2);
      const step = (w - pad - rightPad) / candles.length;

      const buildLine = (arr, color) => {
        if (!arr || arr.length < total) return '';
        const d = candles.map((_, i) => {
          const cx = pad + i * step + step / 2;
          const y = pY(arr[start + i]);
          return (i === 0 ? 'M' : 'L') + cx.toFixed(1) + ',' + y.toFixed(1);
        }).join(' ');
        return '<path d="' + d + '" fill="none" stroke="' + color + '" stroke-width="1.35" opacity="0.88" />';
      };

      const series = state.brain && state.brain.series ? state.brain.series : null;
      const emaLines = series
        ? buildLine(series.e20, '#FB7185') + buildLine(series.e50, '#FBBF24') + buildLine(series.e200, '#818CF8')
        : '';

      const lastClose = candles[candles.length - 1].close;
      const lastY = pY(lastClose);

      return '<svg viewBox="0 0 ' + w + ' ' + h + '" class="w-full h-68">' +
        emaLines +
        '<line x1="' + pad + '" y1="' + lastY + '" x2="' + (w - rightPad) + '" y2="' + lastY + '" stroke="#F25F8C" stroke-dasharray="3 3" stroke-width="1" />' +
        '<rect x="' + (w - rightPad + 4) + '" y="' + (lastY - 10) + '" width="60" height="20" rx="4" fill="#F25F8C" />' +
        '<text x="' + (w - rightPad + 34) + '" y="' + (lastY + 4) + '" text-anchor="middle" font-size="10" font-family="monospace" font-weight="600" fill="#0B1120">' + fmtPrice(lastClose) + '</text>' +
        candles.map((c, i) => {
          const cx = pad + i * step + step / 2;
          const up = c.close >= c.open;
          const col = up ? '#22C58B' : '#F05A70';
          const top = Math.min(pY(c.open), pY(c.close));
          const bh = Math.max(2, Math.abs(pY(c.close) - pY(c.open)));
          return '<line x1="' + cx + '" y1="' + pY(c.high) + '" x2="' + cx + '" y2="' + pY(c.low) + '" stroke="' + col + '" stroke-width="1.3" />' +
                 '<rect x="' + (cx - step * 0.28) + '" y="' + top + '" width="' + Math.max(3, step * 0.56) + '" height="' + bh + '" fill="' + col + '" rx="1" />';
        }).join('') + '</svg>';
    }

    function renderBacktestView() {
      return \`
        <div class="rounded-xl border neon-surface p-6 space-y-4">
          <div class="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 pb-4">
            <div>
              <h2 class="text-lg font-semibold">MT5 Tarixiy Backtest (12-Strategiya AI Miyasi)</h2>
              <p class="text-xs text-slate-400">Real MT5 tarixiy shamlari asosida tanlangan strategiyani sinash</p>
            </div>
            <div class="flex flex-wrap gap-2">
              <select id="tk-bt-strat" class="px-3 py-2 text-xs rounded-lg bg-[#0D1320] border border-slate-700 text-[#FF7AA5]">
                <option value="all_12_mega_brain" \${state.btStrategy === 'all_12_mega_brain' ? 'selected' : ''}>12-Strategiya Mega Miya (GitHub + Pine)</option>
                <option value="all_6_confluence" \${state.btStrategy === 'all_6_confluence' ? 'selected' : ''}>6-Strategiya Konfluensiya</option>
                <option value="leviathan_pa" \${state.btStrategy === 'leviathan_pa' ? 'selected' : ''}>Leviathan PA (EMA 9/21/200 + BOS)</option>
                <option value="geraked_ut_zlsma" \${state.btStrategy === 'geraked_ut_zlsma' ? 'selected' : ''}>Geraked MT5 (UT Bot + ZLSMA)</option>
                <option value="alorse_supertrend_squeeze" \${state.btStrategy === 'alorse_supertrend_squeeze' ? 'selected' : ''}>Alorse (Double Supertrend)</option>
                <option value="ichimoku_sweep" \${state.btStrategy === 'ichimoku_sweep' ? 'selected' : ''}>Azadone (Ichimoku Kumo + Sweep)</option>
                <option value="smc_luxalgo" \${state.btStrategy === 'smc_luxalgo' ? 'selected' : ''}>SMC LuxAlgo (BOS/CHoCH)</option>
                <option value="scalp_pullback" \${state.btStrategy === 'scalp_pullback' ? 'selected' : ''}>Scalping PullBack R1.1 (PAC34)</option>
                <option value="ema_ribbon_rsi" \${state.btStrategy === 'ema_ribbon_rsi' ? 'selected' : ''}>EMA 20/50/100/200 + RSI Div</option>
                <option value="vwap_bands" \${state.btStrategy === 'vwap_bands' ? 'selected' : ''}>VWAP Stdev Bands</option>
              </select>
              <button id="tk-bt-run" class="px-4 py-2 text-xs font-semibold rounded-lg bg-gradient-to-r from-[#F25F8C] via-[#EB6B7B] to-[#E87769] text-slate-950 neon-glow-accent">MT5 Tarixda Backtest Boshlash</button>
            </div>
          </div>
          <div id="tk-bt-output" class="text-sm text-slate-300">
            \${state.backtestResult ? state.backtestResult : 'Tugmani bosing: MT5 dan oxirgi 500 ta sham olinib, tanlangan strategiya sinovdan o‘tkaziladi.'}
          </div>
        </div>
      \`;
    }

    function renderPositionsView() {
      const openPos = state.positions.filter(p => p.status === 'OPEN');
      return \`
        <div class="rounded-xl border neon-surface p-6 space-y-4">
          <h2 class="text-lg font-semibold">MT5 Ochiq Pozitsiyalar (\${openPos.length})</h2>
          \${openPos.length === 0 ? '<p class="text-sm text-slate-400">Hozircha ochiq pozitsiya yo‘q.</p>' :
            '<div class="space-y-2">' + openPos.map(p => \`
              <div class="p-3 rounded-lg bg-[#0D1320] border border-slate-800 flex flex-wrap items-center justify-between gap-3 font-mono text-xs">
                <span>\${p.symbol} · #\${p.id} · \${p.side === 'LONG' ? 'BUY' : 'SELL'} · \${p.lotSize || ''} lot · Kirish \${fmtPrice(p.entryPrice)} → \${fmtPrice(p.markPrice)}</span>
                <div class="flex items-center gap-3">
                  <span class="\${calcPnl(p) >= 0 ? 'text-emerald-400' : 'text-rose-400'} font-semibold">\${calcPnl(p) >= 0 ? '+' : ''}\${fmtMoney(calcPnl(p))}</span>
                  <button data-close-id="\${p.id}" class="tk-close-pos px-2.5 py-1 rounded border border-rose-500/40 text-rose-400 hover:bg-rose-500 hover:text-white">Yopish</button>
                </div>
              </div>
            \`).join('') + '</div>'}
        </div>
      \`;
    }

    function renderAiBlock() {
      return \`
        <div class="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#131B2B] neon-surface p-5 space-y-4">
          <div class="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-200 dark:border-slate-800">
            <div>
              <h2 class="text-base font-semibold dark:text-[#FF7AA5]">AI Savdo Suhbatdoshi (6 Strategiya + MT5 To‘liq Huquq)</h2>
              <p class="text-xs text-slate-500 dark:text-slate-400">Lokal Proksi: http://localhost:3001/v1 · Holat: \${state.aiProxyStatus}</p>
            </div>
            <div class="flex items-center gap-2">
              <button id="tk-summary-btn" class="px-3 py-1.5 text-xs font-semibold rounded-lg border border-emerald-500/40 bg-emerald-500/10 text-emerald-400">AI Xulosa</button>
              <button id="tk-perm-btn" class="px-3 py-1.5 text-xs font-semibold rounded-lg border \${state.fullPermissions ? 'border-[#F25F8C]/50 bg-[#F25F8C]/15 text-[#FF7AA5]' : 'border-slate-700 text-slate-400'}">
                \${state.fullPermissions ? 'To‘liq AI huquqi: YOQILGAN' : 'Faqat maslahat'}
              </button>
            </div>
          </div>
          \${state.aiSummary ? '<div class="p-3.5 rounded-lg bg-[#0D1320] border border-slate-800 text-xs space-y-1"><div class="font-semibold text-[#FF7AA5]">' + (state.aiSummary.headline || '') + '</div><div class="text-slate-400">' + (state.aiSummary.riskNote || '') + '</div></div>' : ''}
          <div class="space-y-3 max-h-80 overflow-y-auto pr-1">
            \${state.chat.map(m => \`
              <div class="flex \${m.role === 'user' ? 'justify-end' : 'justify-start'}">
                <div class="max-w-[85%] rounded-xl px-4 py-2.5 text-sm whitespace-pre-wrap \${m.role === 'user' ? 'bg-[#F25F8C]/15 border border-[#F25F8C]/35 text-[#FFE4EE]' : 'bg-slate-100 dark:bg-[#172236] border border-slate-200 dark:border-slate-800'}">\${m.text}</div>
              </div>
            \`).join('')}
          </div>
          <form id="tk-ai-form" class="flex gap-2">
            <input id="tk-ai-input" type="text" placeholder="AI ga yozing (6 strategiya tahlili, backtest yoki 0.1 lot BUY)..." class="flex-1 px-3.5 py-2.5 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#0D1320]" />
            <button type="submit" class="px-4 py-2.5 text-sm font-semibold rounded-lg bg-gradient-to-r from-[#F25F8C] via-[#EB6B7B] to-[#E87769] text-slate-950 neon-glow-accent">Yuborish</button>
          </form>
        </div>
      \`;
    }

    function computeOrderRisk(pair) {
      const dec = pair.price >= 100 ? 2 : 4;
      const defaultSl = state.orderSide === 'BUY' ? (pair.price * 0.992).toFixed(dec) : (pair.price * 1.008).toFixed(dec);
      const defaultTp = state.orderSide === 'BUY' ? (pair.price * 1.018).toFixed(dec) : (pair.price * 0.982).toFixed(dec);
      const slNum = parseFloat(state.orderSl || defaultSl);
      const tpNum = parseFloat(state.orderTp || defaultTp);
      const lotNum = Math.max(0.01, parseFloat(state.orderLot) || 0.1);
      const rPct = Math.min(25, Math.max(0, parseFloat(state.riskPct) || 0));
      const eq = Math.max(0, state.equity || state.balance || 0);
      const riskBudget = eq * (rPct / 100);
      const cSize = pair.contractSize || 100;
      const isUsdBase = (pair.base === 'USD' || pair.symbol.startsWith('USD')) && pair.quote !== 'USD';
      const slValid = !isNaN(slNum) && slNum > 0 && (state.orderSide === 'BUY' ? slNum < pair.price : slNum > pair.price);
      const slDist = slValid ? Math.abs(pair.price - slNum) : 0;
      const lossPerLot = slValid && slDist > 0 ? (isUsdBase ? (slDist * cSize) / Math.max(1e-9, pair.price) : slDist * cSize) : 0;
      const suggestedLot = lossPerLot > 0 && riskBudget > 0 ? Math.max(0.01, Math.min(100, Math.floor((riskBudget / lossPerLot) * 100) / 100)) : null;
      const curRiskUsd = lossPerLot > 0 ? lotNum * lossPerLot : null;
      const tpValid = !isNaN(tpNum) && tpNum > 0 && (state.orderSide === 'BUY' ? tpNum > pair.price : tpNum < pair.price);
      const tpDist = tpValid ? Math.abs(tpNum - pair.price) : 0;
      const gainPerLot = tpValid && tpDist > 0 ? (isUsdBase ? (tpDist * cSize) / Math.max(1e-9, pair.price) : tpDist * cSize) : 0;
      const curRewardUsd = gainPerLot > 0 ? lotNum * gainPerLot : null;
      const rr = curRiskUsd && curRewardUsd ? (curRewardUsd / curRiskUsd).toFixed(2) : null;
      return { defaultSl, defaultTp, riskBudget, slValid, suggestedLot, curRiskUsd, curRewardUsd, rr };
    }

    function renderTerminal() {
      const openPos = state.positions.filter(p => p.status === 'OPEN');
      const openPnl = state.login ? state.openProfit : openPos.reduce((s, p) => s + calcPnl(p), 0);
      const pair = state.pairs.find(p => p.symbol === state.selectedSymbol) || state.pairs[0];
      const sb = state.brain && state.brain.serverBrain ? state.brain.serverBrain : null;
      const brainStrip = state.brain
        ? 'EMA: ' + (sb ? sb.emaRibbon.alignment : state.brain.alignment) +
          ' · RSI: ' + Number(sb ? sb.rsi14 : state.brain.rsi14).toFixed(1) +
          ' · UT: ' + (sb && sb.gerakedMt5 ? sb.gerakedMt5.utBotSignal : state.brain.utSignal) +
          ' · ST: ' + (sb && sb.alorseSuite ? sb.alorseSuite.doubleSupertrend : state.brain.doubleSt) +
          ' · Kumo: ' + (sb && sb.azadoneTools ? sb.azadoneTools.kumoBias : state.brain.kumoBias)
        : '12-strategiya hisoblanmoqda...';
      const rk = computeOrderRisk(pair);

      return \`
        <div class="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          <div class="rounded-xl border neon-surface p-5"><div class="text-xs text-slate-400">MT5 Balans / Kapital (Equity)</div><div class="mt-2 text-2xl font-semibold font-mono tabular-nums">\${fmtMoney(state.balance)} / \${fmtMoney(state.equity)}</div><div class="mt-1 text-xs font-mono text-slate-400">Erkin marja: \${fmtMoney(state.marginFree)}</div></div>
          <div class="rounded-xl border neon-surface p-5"><div class="text-xs text-slate-400">Ochiq MT5 PnL (\${openPos.length} bitim)</div><div class="mt-2 text-2xl font-semibold font-mono tabular-nums \${openPnl >= 0 ? 'text-emerald-400' : 'text-rose-400'}">\${openPnl >= 0 ? '+' : ''}\${fmtMoney(openPnl)}</div></div>
          <div class="rounded-xl border neon-surface p-5"><div class="text-xs text-slate-400">Faol MT5 Narxi</div><div class="mt-2 text-2xl font-semibold font-mono tabular-nums text-[#FF7AA5]">\${pair.symbol} · \${fmtPrice(pair.price)}</div><div class="mt-1 text-xs font-mono text-slate-400">Spred: \${pair.spreadPoints || 0} pt</div></div>
          <div class="rounded-xl border neon-surface p-5"><div class="text-xs text-slate-400">MT5 Ulanish Holati</div><div class="mt-2 text-sm font-semibold \${state.login ? 'text-emerald-400' : 'text-amber-400'}">\${state.mt5Status}</div><div class="mt-1 text-xs text-slate-400">\${state.serverName || 'MetaTrader 5'}</div></div>
        </div>
        <div class="grid grid-cols-1 xl:grid-cols-12 gap-6">
          <div class="xl:col-span-8 rounded-xl border neon-surface p-5">
            <div class="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-800">
              <div class="flex items-center gap-3">
                <select id="tk-pair-sel" class="px-3 py-1.5 text-sm font-semibold rounded-lg bg-[#0D1320] border border-slate-700 text-[#FF7AA5]">
                  \${state.pairs.map(p => '<option value="' + p.symbol + '" ' + (p.symbol === state.selectedSymbol ? 'selected' : '') + '>' + p.symbol + '</option>').join('')}
                </select>
                <span class="text-xs font-mono \${state.candleSource === 'MT5 Real Shamlar' ? 'text-emerald-400' : 'text-slate-400'}">Manba: \${state.candleSource}</span>
              </div>
              <div class="flex gap-1">
                \${['M1','M5','M15','M30','H1','H4','D1'].map(tf => '<button data-tf="' + tf + '" class="tk-tf-btn px-2.5 py-1 text-xs rounded ' + (state.timeframe === tf ? 'bg-[#F25F8C]/20 text-[#FF7AA5]' : 'text-slate-400') + '">' + tf + '</button>').join('')}
              </div>
            </div>
            <div class="py-2 text-xs font-mono text-[#FF7AA5]">\${brainStrip}</div>
            <div class="mt-2">\${renderCandlesSvg()}</div>
          </div>
          <div class="xl:col-span-4 rounded-xl border neon-surface p-5 space-y-4">
            <h3 class="text-base font-semibold pb-3 border-b border-slate-800">MT5 Tezkor Order (\${pair.symbol})</h3>
            <div class="grid grid-cols-2 gap-2">
              <button id="tk-side-buy" class="py-2 rounded-lg text-xs font-semibold \${state.orderSide === 'BUY' ? 'bg-emerald-500 text-slate-950' : 'bg-[#0D1320] text-slate-400 border border-slate-800'}">BUY · Long</button>
              <button id="tk-side-sell" class="py-2 rounded-lg text-xs font-semibold \${state.orderSide === 'SELL' ? 'bg-rose-500 text-white' : 'bg-[#0D1320] text-slate-400 border border-slate-800'}">SELL · Short</button>
            </div>
            <div class="space-y-3 text-xs">
              <div><label class="block text-slate-400 mb-1">Lot hajmi</label><input id="tk-lot" type="number" step="0.01" min="0.01" value="\${state.orderLot}" class="w-full px-3 py-2 rounded-lg bg-[#0D1320] border border-slate-700 font-mono" /></div>
              <div class="grid grid-cols-2 gap-2">
                <div><label class="block text-slate-400 mb-1">Stop-Loss</label><input id="tk-sl" type="number" step="any" value="\${state.orderSl || rk.defaultSl}" class="w-full px-3 py-2 rounded-lg bg-[#0D1320] border border-slate-700 font-mono" /></div>
                <div><label class="block text-slate-400 mb-1">Take-Profit</label><input id="tk-tp" type="number" step="any" value="\${state.orderTp || rk.defaultTp}" class="w-full px-3 py-2 rounded-lg bg-[#0D1320] border border-slate-700 font-mono" /></div>
              </div>
              <div class="rounded-lg border border-[#F25F8C]/30 bg-[#0D1320] p-3 space-y-2.5">
                <div class="flex items-center justify-between">
                  <span class="font-semibold text-[#FF7AA5]">Risk kalkulyatori</span>
                  <span class="font-mono text-slate-400">Equity: \${fmtMoney(state.equity)}</span>
                </div>
                <div class="flex items-center gap-1.5">
                  <input id="tk-risk-pct" type="number" step="0.1" min="0.1" max="25" value="\${state.riskPct}" class="w-16 px-2 py-1 rounded bg-[#131B2B] border border-slate-700 font-mono" />
                  <span class="text-slate-400 mr-1">%</span>
                  \${['0.5','1','2','3'].map(p => '<button data-risk="' + p + '" class="tk-risk-preset px-2 py-1 rounded border font-mono ' + (state.riskPct === p ? 'border-[#F25F8C]/50 bg-[#F25F8C]/15 text-[#FF7AA5]' : 'border-slate-800 text-slate-400') + '">' + p + '%</button>').join('')}
                </div>
                <div class="flex items-center justify-between pt-1 border-t border-slate-800">
                  <div>
                    <div class="text-[11px] text-slate-400">Optimal lot</div>
                    <div id="tk-opt-lot" class="font-mono font-semibold text-[#FF7AA5]">\${rk.suggestedLot !== null ? rk.suggestedLot.toFixed(2) + ' lot ≈ ' + fmtMoney(rk.riskBudget) : 'SL kiriting'}</div>
                  </div>
                  \${rk.suggestedLot !== null ? '<button id="tk-apply-lot" class="px-2.5 py-1 rounded bg-gradient-to-r from-[#F25F8C] to-[#E87769] text-slate-950 font-semibold">Qo‘llash</button>' : ''}
                </div>
                <div class="flex items-center justify-between text-[11px] font-mono text-slate-400">
                  <span>Joriy xavf: <strong class="text-rose-400">\${rk.curRiskUsd !== null ? '-' + fmtMoney(rk.curRiskUsd) : '—'}</strong></span>
                  <span>R:R <strong class="text-emerald-400">\${rk.rr ? '1 : ' + rk.rr : '—'}</strong></span>
                </div>
              </div>
              <button id="tk-send-order-btn" class="w-full py-2.5 rounded-lg font-semibold text-sm \${state.orderSide === 'BUY' ? 'bg-emerald-500 text-slate-950' : 'bg-rose-500 text-white'}">\${state.orderSide} (\${pair.symbol}) buyurtma yuborish</button>
              \${state.orderMsg ? '<p class="text-xs font-mono text-[#FF7AA5]">' + state.orderMsg + '</p>' : ''}
            </div>
          </div>
        </div>
        \${renderPositionsView()}
        \${renderAiBlock()}
      \`;
    }

    function render() {
      const titles = { terminal: 'MT5 Terminal', ai: 'AI Savdo & Suhbat', backtest: 'Backtest & Tarix', positions: 'MT5 Pozitsiyalar' };
      document.getElementById('tk-breadcrumb').textContent = titles[state.view];
      const liveBtn = document.getElementById('tk-live-btn');
      if (liveBtn) {
        liveBtn.textContent = state.autoSync ? 'Jonli: 2s' : 'Jonli: To‘xtatilgan';
        liveBtn.className = 'px-3 py-1.5 text-xs font-semibold rounded-lg border whitespace-nowrap ' +
          (state.autoSync ? 'border-emerald-500/40 bg-emerald-500/15 text-emerald-400' : 'border-slate-700 text-slate-400');
      }
      document.querySelectorAll('.tk-nav-btn').forEach(btn => {
        const active = btn.dataset.view === state.view;
        btn.className = 'tk-nav-btn text-left px-3.5 py-2.5 text-sm font-medium rounded-lg whitespace-nowrap shrink-0 transition-colors ' +
          (active ? 'bg-[#F25F8C]/15 text-[#C8285E] dark:text-[#FF7AA5] border border-[#F25F8C]/40' : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/50');
      });
      const main = document.getElementById('tk-main');
      if (state.view === 'ai') main.innerHTML = renderAiBlock();
      else if (state.view === 'backtest') main.innerHTML = renderBacktestView();
      else if (state.view === 'positions') main.innerHTML = renderPositionsView();
      else main.innerHTML = renderTerminal();
      bind();
    }

    async function sendOrder(side) {
      const lot = parseFloat(document.getElementById('tk-lot').value) || 0.1;
      const slVal = parseFloat(document.getElementById('tk-sl').value);
      const tpVal = parseFloat(document.getElementById('tk-tp').value);
      state.orderLot = String(lot);
      if (!isNaN(slVal)) state.orderSl = String(slVal);
      if (!isNaN(tpVal)) state.orderTp = String(tpVal);
      try {
        const res = await fetch(apiUrl('/api/orders'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            symbol: state.selectedSymbol,
            side,
            lotSize: lot,
            stopLoss: isNaN(slVal) ? null : slVal,
            takeProfit: isNaN(tpVal) ? null : tpVal
          })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.detail || 'Xato');
        state.orderMsg = 'Ticket #' + data.ticket + ' ochildi (' + side + ' ' + lot + ' lot)';
        await syncMt5();
      } catch (err) {
        state.orderMsg = 'Order xatosi: ' + (err.message || 'MT5 ulanmagan');
        render();
      }
    }

    function bind() {
      const pairSel = document.getElementById('tk-pair-sel');
      if (pairSel) pairSel.onchange = async (e) => { state.selectedSymbol = e.target.value; state.orderSl = ''; state.orderTp = ''; await fetchMt5Candles(); render(); };
      document.querySelectorAll('.tk-tf-btn').forEach(b => {
        b.onclick = async () => { state.timeframe = b.dataset.tf; await fetchMt5Candles(); render(); };
      });
      const sideBuy = document.getElementById('tk-side-buy');
      if (sideBuy) sideBuy.onclick = () => { state.orderSide = 'BUY'; state.orderSl = ''; state.orderTp = ''; render(); };
      const sideSell = document.getElementById('tk-side-sell');
      if (sideSell) sideSell.onclick = () => { state.orderSide = 'SELL'; state.orderSl = ''; state.orderTp = ''; render(); };
      const lotInp = document.getElementById('tk-lot');
      if (lotInp) lotInp.oninput = (e) => { state.orderLot = e.target.value; };
      const slInp = document.getElementById('tk-sl');
      if (slInp) slInp.oninput = (e) => { state.orderSl = e.target.value; };
      const tpInp = document.getElementById('tk-tp');
      if (tpInp) tpInp.oninput = (e) => { state.orderTp = e.target.value; };
      const riskInp = document.getElementById('tk-risk-pct');
      if (riskInp) riskInp.onchange = (e) => { state.riskPct = e.target.value; render(); };
      document.querySelectorAll('.tk-risk-preset').forEach(b => {
        b.onclick = () => { state.riskPct = b.dataset.risk; render(); };
      });
      const applyLotBtn = document.getElementById('tk-apply-lot');
      if (applyLotBtn) applyLotBtn.onclick = () => {
        const pair = state.pairs.find(p => p.symbol === state.selectedSymbol) || state.pairs[0];
        const rk = computeOrderRisk(pair);
        if (rk.suggestedLot !== null) { state.orderLot = rk.suggestedLot.toFixed(2); render(); }
      };
      const sendBtn = document.getElementById('tk-send-order-btn');
      if (sendBtn) sendBtn.onclick = () => sendOrder(state.orderSide);

      document.querySelectorAll('.tk-close-pos').forEach(btn => {
        btn.onclick = async () => {
          try {
            await fetch(apiUrl('/api/close'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ positionId: btn.dataset.closeId }) });
            await syncMt5();
          } catch (_) {}
        };
      });

      const permBtn = document.getElementById('tk-perm-btn');
      if (permBtn) permBtn.onclick = () => { state.fullPermissions = !state.fullPermissions; render(); };

      const sumBtn = document.getElementById('tk-summary-btn');
      if (sumBtn) {
        sumBtn.onclick = async () => {
          try {
            const res = await fetch(apiUrl('/api/ai/summary'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ context: { symbol: state.selectedSymbol } }) });
            state.aiSummary = await res.json();
          } catch (_) {
            state.aiSummary = { headline: 'Xulosa olib bo‘lmadi: python mt5_bridge.py va proksini tekshiring.' };
          }
          render();
        };
      }

      const btStrat = document.getElementById('tk-bt-strat');
      if (btStrat) btStrat.onchange = (e) => { state.btStrategy = e.target.value; };

      const btRun = document.getElementById('tk-bt-run');
      if (btRun) {
        btRun.onclick = async () => {
          try {
            const res = await fetch(apiUrl('/api/candles?symbol=' + encodeURIComponent(state.selectedSymbol) + '&timeframe=' + state.timeframe + '&count=500'));
            const data = await res.json();
            const bars = data.candles || [];
            const closes = bars.map(x => x.close);
            const e9 = calcEma(closes, 9), e20 = calcEma(closes, 20), e21 = calcEma(closes, 21), e50 = calcEma(closes, 50), e200 = calcEma(closes, 200), pac = calcEma(closes, 34);
            const rsi = calcRsi(closes, 14);
            const st1 = calcSupertrend(bars, 10, 3.0), st2 = calcSupertrend(bars, 10, 5.0);
            const ut = calcUtBot(bars, 10, 2.0);
            let wins = 0, losses = 0, pnl = 0;
            for (let i = 25; i < bars.length - 2; i++) {
              let dir = 0;
              if (state.btStrategy === 'ema_ribbon_rsi') {
                if (e20[i] > e50[i] && e20[i - 1] <= e50[i - 1]) dir = 1;
                else if (e20[i] < e50[i] && e20[i - 1] >= e50[i - 1]) dir = -1;
              } else if (state.btStrategy === 'scalp_pullback') {
                if (e20[i] > e200[i] && bars[i - 1].close < pac[i - 1] && bars[i].close > pac[i]) dir = 1;
                else if (e20[i] < e200[i] && bars[i - 1].close > pac[i - 1] && bars[i].close < pac[i]) dir = -1;
              } else if (state.btStrategy === 'geraked_ut_zlsma') {
                if (ut.sig[i] === 'BUY') dir = 1;
                else if (ut.sig[i] === 'SELL') dir = -1;
              } else if (state.btStrategy === 'alorse_supertrend_squeeze') {
                if (st1.dir[i] === 1 && st2.dir[i] === 1 && st1.dir[i - 1] === -1) dir = 1;
                else if (st1.dir[i] === -1 && st2.dir[i] === -1 && st1.dir[i - 1] === 1) dir = -1;
              } else if (state.btStrategy === 'leviathan_pa') {
                const swHi = Math.max(...bars.slice(i - 20, i).map(x => x.high));
                const swLo = Math.min(...bars.slice(i - 20, i).map(x => x.low));
                if (e9[i] > e21[i] && closes[i] > e200[i] && closes[i] > swHi) dir = 1;
                else if (e9[i] < e21[i] && closes[i] < e200[i] && closes[i] < swLo) dir = -1;
              } else if (state.btStrategy === 'ichimoku_sweep') {
                const pHi = Math.max(...bars.slice(i - 15, i).map(x => x.high));
                const pLo = Math.min(...bars.slice(i - 15, i).map(x => x.low));
                if (bars[i].low < pLo && closes[i] > pLo) dir = 1;
                else if (bars[i].high > pHi && closes[i] < pHi) dir = -1;
              } else if (state.btStrategy === 'all_12_mega_brain') {
                let bPts = 0, sPts = 0;
                if (e20[i] > e50[i]) bPts += 1; else sPts += 1;
                if (closes[i] > pac[i]) bPts += 1; else sPts += 1;
                if (st1.dir[i] === 1 && st2.dir[i] === 1) bPts += 2; else if (st1.dir[i] === -1 && st2.dir[i] === -1) sPts += 2;
                if (ut.sig[i] === 'BUY') bPts += 2; else if (ut.sig[i] === 'SELL') sPts += 2;
                if (e9[i] > e21[i] && closes[i] > e200[i]) bPts += 1; else if (e9[i] < e21[i] && closes[i] < e200[i]) sPts += 1;
                if (bPts >= 5) dir = 1; else if (sPts >= 5) dir = -1;
              } else {
                if (e20[i] > e50[i] && rsi[i] < 65 && bars[i].close > pac[i]) dir = 1;
                else if (e20[i] < e50[i] && rsi[i] > 35 && bars[i].close < pac[i]) dir = -1;
              }
              if (dir !== 0) {
                const diff = dir * ((bars[i + 2].close - bars[i].close) / bars[i].close) * 2000;
                pnl += diff;
                if (diff >= 0) wins++; else losses++;
              }
            }
            const total = wins + losses;
            const wr = total ? ((wins / total) * 100).toFixed(1) : '0.0';
            state.backtestResult = '<div class="grid grid-cols-3 gap-4 font-mono"><div>Shamlar: ' + bars.length + ' (' + state.btStrategy + ')</div><div>Bitimlar: ' + total + ' (Yutuq: ' + wr + '%)</div><div>Natija: ' + fmtMoney(pnl) + '</div></div>';
          } catch (_) {
            state.backtestResult = 'MT5 bridge ulanmagan: python mt5_bridge.py ni ishga tushiring.';
          }
          render();
        };
      }

      const aiForm = document.getElementById('tk-ai-form');
      if (aiForm) {
        aiForm.onsubmit = async (e) => {
          e.preventDefault();
          const inp = document.getElementById('tk-ai-input');
          const txt = inp.value.trim();
          if (!txt) return;
          state.chat.push({ role: 'user', text: txt });
          inp.value = '';
          render();
          try {
            const res = await fetch(apiUrl('/api/ai/chat'), {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ messages: state.chat, fullPermissions: state.fullPermissions })
            });
            const data = await res.json();
            state.chat.push({ role: 'model', text: data.reply || data.detail || data.error || 'Javob olindi.' });
            await syncMt5();
          } catch (_) {
            state.chat.push({ role: 'model', text: 'Server ulanmagan: python mt5_bridge.py ni ishga tushiring.' });
            render();
          }
        };
      }
    }

    document.querySelectorAll('.tk-nav-btn').forEach(b => { b.onclick = () => { state.view = b.dataset.view; render(); }; });
    document.getElementById('tk-theme-btn').onclick = () => document.documentElement.classList.toggle('dark');
    document.getElementById('tk-sync-btn').onclick = syncMt5;
    document.getElementById('tk-test-btn').onclick = runConnectionTest;
    document.getElementById('tk-live-btn').onclick = () => { state.autoSync = !state.autoSync; render(); };
    document.getElementById('tk-kill-all-btn').onclick = async () => {
      try { await fetch(apiUrl('/api/kill-all'), { method: 'POST' }); } catch (_) {}
      await syncMt5();
    };

    render();
    syncMt5();
    setInterval(() => { if (state.autoSync) syncMt5(); }, 2000);
  </script>
</body>
</html>`;
}
