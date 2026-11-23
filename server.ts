import 'dotenv/config';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { FunctionDeclaration, GoogleGenAI, Type } from '@google/genai';
import {
  AuthedRequest,
  OWNER_PROFILE,
  appendSecurityAudit,
  checkOwnerRateLimit,
  checkPinRateLimit,
  clearOwnerRateLimit,
  clearPinRateLimit,
  completeInitialSetup,
  createSession,
  getActiveSessionCount,
  getClientIp,
  getValidSession,
  hashSecret,
  isInitialSetupRequired,
  loadAuthConfig,
  recordOwnerFailure,
  recordPinFailure,
  requireAuth,
  requireCsrf,
  requireOwner,
  revokeSession,
  saveAuthConfig,
  verifyOwnerPasswordInput,
  verifyPinInput,
} from './server/security';
import {
  AutonomousMode,
  NotificationCategory,
  NotificationPriority,
  createBackup,
  getDiskAndSystemMetrics,
  listBackups,
  loadMemoryDb,
  pushNotification,
  restoreBackup,
  saveMemoryDb,
} from './server/localMemory';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 3000;

function getAiClient() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY muhit o‘zgaruvchisi topilmadi. Settings > Secrets bo‘limini tekshiring.');
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

const mt5TradingTools: FunctionDeclaration[] = [
  {
    name: 'open_mt5_order',
    description:
      'MetaTrader 5 (MT5) terminalida yangi skalping yoki uzoq muddatli savdo buyurtmasi (BUY/SELL) ochish.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        symbol: {
          type: Type.STRING,
          description: 'MT5 instrument nomi: XAUUSD, EURUSD, BTCUSD, GBPUSD, US100, USDJPY',
        },
        side: {
          type: Type.STRING,
          description: 'LONG (BUY) yoki SHORT (SELL)',
        },
        lotSize: {
          type: Type.NUMBER,
          description: 'Lot hajmi, masalan 0.1, 0.25, 1.0',
        },
        orderType: {
          type: Type.STRING,
          description: 'MARKET yoki LIMIT',
        },
        entryPrice: {
          type: Type.NUMBER,
          description: 'LIMIT bo‘lsa kirish narxi',
        },
        stopLoss: {
          type: Type.NUMBER,
          description: 'Stop-Loss narxi',
        },
        takeProfit: {
          type: Type.NUMBER,
          description: 'Take-Profit narxi',
        },
        style: {
          type: Type.STRING,
          description: 'SCALPING yoki LONG_TERM',
        },
        reason: {
          type: Type.STRING,
          description: 'Savdo ochish sababi (o‘zbek tilida)',
        },
      },
      required: ['symbol', 'side', 'lotSize', 'reason'],
    },
  },
  {
    name: 'close_mt5_position',
    description: 'MT5 terminalidagi ochiq pozitsiyani ID/Ticket yoki "ALL" bo‘yicha yopish.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        positionId: {
          type: Type.STRING,
          description: 'Pozitsiya ID si (masalan MT5-508491) yoki "ALL"',
        },
        reason: {
          type: Type.STRING,
          description: 'Yopish sababi',
        },
      },
      required: ['positionId', 'reason'],
    },
  },
  {
    name: 'modify_mt5_sl_tp',
    description: 'MT5 ochiq pozitsiyasining Stop-Loss va Take-Profit narxlarini o‘zgartirish.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        positionId: {
          type: Type.STRING,
          description: 'Pozitsiya ID si',
        },
        stopLoss: {
          type: Type.NUMBER,
          description: 'Yangi Stop-Loss narxi',
        },
        takeProfit: {
          type: Type.NUMBER,
          description: 'Yangi Take-Profit narxi',
        },
      },
      required: ['positionId'],
    },
  },
  {
    name: 'run_mt5_backtest',
    description:
      'MT5 tarixiy shamlari asosida skalping yoki uzoq muddatli strategiya bo‘yicha backtest o‘tkazish.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        symbol: {
          type: Type.STRING,
          description: 'MT5 instrument nomi (XAUUSD, EURUSD, BTCUSD va h.k.)',
        },
        style: {
          type: Type.STRING,
          description: 'SCALPING yoki LONG_TERM',
        },
        timeframe: {
          type: Type.STRING,
          description: 'M1, M5, M15, M30, H1, H4, D1, W1',
        },
        barsCount: {
          type: Type.NUMBER,
          description: 'Tarixiy shamlar soni (100 dan 1000 gacha)',
        },
        strategyId: {
          type: Type.STRING,
          description:
            'all_12_mega_brain, all_6_confluence, leviathan_pa, geraked_ut_zlsma, alorse_supertrend_squeeze, ichimoku_sweep, smc_luxalgo, scalp_pullback, ema_ribbon_rsi, yoki vwap_bands',
        },
        stopLossPct: {
          type: Type.NUMBER,
          description: 'Stop-Loss foizi (masalan 0.6 skalping uchun, 1.8 uzoq muddatli uchun)',
        },
        takeProfitPct: {
          type: Type.NUMBER,
          description: 'Take-Profit foizi (masalan 1.4 skalping uchun, 4.2 uzoq muddatli uchun)',
        },
      },
      required: ['symbol', 'style', 'timeframe'],
    },
  },
  {
    name: 'scan_mt5_market',
    description: 'Barcha MT5 instrumentlari bo‘yicha to‘liq bozor skaneri oynasini ishga tushirish.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        focusSymbol: {
          type: Type.STRING,
          description: 'Asosiy e’tibor beriladigan instrument (ixtiyoriy)',
        },
      },
    },
  },
  {
    name: 'toggle_ai_autotrader',
    description: 'AI avto-savdo huquqini yoqish yoki o‘chirish.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        enabled: {
          type: Type.BOOLEAN,
          description: 'true — yoqish, false — o‘chirish',
        },
      },
      required: ['enabled'],
    },
  },
];

const STRATEGY_BRAIN_PROMPT = `Sizning tahlil "miyangiz" quyidagi 12 ta aniq strategiya (6 ta asosiy PineScript + 6 ta GitHub repository) asosida ishlaydi:
1. EMA 20 / 50 / 100 / 200 Ribbon: To'liq trend yo'nalishi (Buqa Fan 20>50>100>200 yoki Ayiq Fan 20<50<100<200).
2. Glaz RSI Chart Bars (14): RSI > 70 Overbought (yuqori zona), RSI < 30 Oversold (pastki zona).
3. Libertus RSI Divergences v3.3 (90-bar): Narx va RSI o'rtasidagi BULL va BEAR divergensiyalar hamda pivotlar.
4. Smart Money Concepts [LuxAlgo]: Internal va Swing BOS / CHoCH tuzilmasi, Order Blocks (Bullish/Bearish OB), Fair Value Gaps (FVG), EQH/EQL va Premium (>52.5%) / Equilibrium / Discount (<47.5%) zonalari.
5. Scalping PullBack Tool R1.1 (JustUncleL): Heikin Ashi PAC EMA(34) High/Low kanali + EMA 89 / 200 / 600 + Williams Fraktallar (HH/LH/HL/LL) + PAC dan qaytish (Pullback BUY/SELL).
6. VWAP Stdev Bands v2 Mod: Sessiya VWAP va ±1.28σ, ±2.01σ, ±2.51σ zonalari (Overbought/Oversold mean-reversion).
7. Leviathan Price Action (santiquiroz/leviathan): Yopilgan barlarda EMA(9/21/200) trend + 20-bar Swing BOS + Engulfing/Pinbar (60%+ quyruq) tasdig'i.
8. Geraked MT5 Pack (geraked/metatrader5): UT Bot ATR(10, 2.0) trailing stop signali + Heikin Ashi Zero-Lag LSMA(14) + Chandelier Exit(22, 3.0).
9. Alorse Suite (Alorse/pinescript-strategies): Double Supertrend (ATR 10 × 3.0 & 5.0) + TTM Squeeze (BB 20,2 vs KC 20,1.5 siqilish va Linreg momentum).
10. Pandas-TA Classic (xgboosted/pandas-ta-classic): ADX(14), +DI/-DI, MACD(12,26,9) histogrammasi, Stochastic(14) va Doji/3-Line Strike sham patternlari.
11. Azadone Trading Tools (azadone/trading-tools): Ichimoku Cloud (Tenkan 9, Kijun 26, Senkou Span A/B 52 Kumo bias) + 15-bar Liquidity Sweep & Heikin Ashi Flip.
12. PyneCore Strategies (theonetrade/pynecore-strategies): Hull Moving Average HMA(21) qiyaligi + MACD Trend Flow konfluensiyasi.

Qoida: Skalping (M1/M5/M15) uchun PAC34 Pullback, Geraked UT Bot + ZLSMA(14), Azadone Liquidity Sweep, TTM Squeeze, VWAP ±2.01σ va Internal SMC BOS/OB ga tayaning. Uzoq muddatli (M30/H1/H4/D1/W1) uchun EMA 20/50/100/200, Leviathan Swing BOS, Alorse Double Supertrend (3.0 & 5.0), Ichimoku Kumo, ADX(14) >= 20 va Swing SMC + RSI Divergensiyalariga tayaning.
Qat'iy Tahlil Intizomi:
- Sizga yuborilgan context JSON ichidagi oldindan hisoblangan Candlestick patternlari, Chart patternlari, Market Regime, Multi-Timeframe (M1..W1), SMC (BOS/CHoCH/MSS/BSL/SSL), Risk Manager (ATR SL, Lot, Spread/Volatillik filtri) va 10 strategiya qarorlaridan aynan foydalaning — hech qachon indikator raqamlarini o'zingizdan o'ylab topmang.
- Qaror qarama-qarshi signallarni yashirmasin: qo'llab-quvvatlovchi va qarshi dalillarni ochiq ko'rsating. Agar MTF ziddiyatli bo'lsa yoki risk filtri taqiqlasa, WAIT yoki NO TRADE tavsiya qiling.
- Analytical Score (tahliliy ball) ni hech qachon haqiqiy statistik yutuq ehtimoli deb atamang (kalibratsiya kamida 30 ta tarixiy yopilgan savdoda tasdiqlanmasa).`;

function getLocalProxyConfig() {
  const baseUrl = (process.env.LOCAL_LLM_BASE_URL || 'http://localhost:3001/v1').replace(/\/$/, '');
  const apiKey = (process.env.LOCAL_LLM_API_KEY || '').trim();
  const enabled = Boolean(apiKey) && apiKey !== 'MY_LOCAL_LLM_API_KEY';
  return { enabled, baseUrl, apiKey, model: 'auto' };
}

async function callOpenAiCompatibleProxy(
  systemInstruction: string,
  messages: { role: 'user' | 'model'; text: string }[],
  tools?: FunctionDeclaration[]
) {
  const cfg = getLocalProxyConfig();
  const openAiMessages = [
    { role: 'system', content: systemInstruction },
    ...messages.map((m) => ({
      role: m.role === 'model' ? 'assistant' : 'user',
      content: m.text,
    })),
  ];

  const payload: Record<string, unknown> = {
    model: cfg.model,
    messages: openAiMessages,
  };

  if (tools && tools.length > 0) {
    payload.tools = tools.map((t) => ({
      type: 'function',
      function: {
        name: t.name,
        description: t.description,
        parameters: {
          type: 'object',
          properties: Object.fromEntries(
            Object.entries(t.parameters?.properties ?? {}).map(([k, v]) => [
              k,
              { type: String(v.type).toLowerCase(), description: v.description },
            ])
          ),
          required: t.parameters?.required ?? [],
        },
      },
    }));
  }

  const resp = await fetch(`${cfg.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${cfg.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`Lokal AI proksi xatosi (${resp.status}): ${errText}`);
  }

  const data = (await resp.json()) as {
    choices?: {
      message?: {
        content?: string;
        tool_calls?: { id?: string; function?: { name?: string; arguments?: string } }[];
      };
    }[];
  };
  const msg = data.choices?.[0]?.message ?? {};
  const toolCalls = (msg.tool_calls ?? []).map((tc, idx) => ({
    id: tc.id || `tc-${idx}`,
    name: tc.function?.name || '',
    args: JSON.parse(tc.function?.arguments || '{}') as Record<string, unknown>,
  }));
  return {
    reply: msg.content || '',
    functionCalls: toolCalls,
  };
}

async function callOpenAiCompatibleJson(systemInstruction: string, userPrompt: string) {
  const cfg = getLocalProxyConfig();
  const resp = await fetch(`${cfg.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${cfg.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: cfg.model,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: `${systemInstruction}\nFaqat sof JSON qaytaring.` },
        { role: 'user', content: userPrompt },
      ],
    }),
  });

  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`Lokal AI proksi xatosi (${resp.status}): ${errText}`);
  }

  const data = (await resp.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const raw = (data.choices?.[0]?.message?.content ?? '{}').trim();
  const cleaned = raw.replace(/^```json\s*/i, '').replace(/```$/i, '').trim();
  return JSON.parse(cleaned);
}

async function startServer() {
  const app = express();
  app.set('trust proxy', 1);
  app.use(express.json({ limit: '4mb' }));

  // Baseline security headers (avoid X-Frame-Options to remain compatible with preview iframe)
  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    next();
  });

  /* ==================== AUTH & PIN SECURITY ROUTES ==================== */
  app.get('/api/auth/status', (req, res) => {
    const ip = getClientIp(req);
    const rl = checkPinRateLimit(ip);
    const sess = getValidSession(req);
    const cfg = loadAuthConfig();
    return res.json({
      authenticated: Boolean(sess),
      needsInitialSetup: isInitialSetupRequired(),
      ownerVerified: Boolean(sess && Date.now() <= sess.ownerVerifiedUntil),
      ownerVerifiedUntil: sess?.ownerVerifiedUntil ?? 0,
      autoLockMinutes: cfg.autoLockMinutes,
      lockedOut: !rl.allowed,
      retryAfterSec: rl.retryAfterSec,
      httpsDetected: req.secure || req.headers['x-forwarded-proto'] === 'https',
    });
  });

  app.post('/api/auth/setup', (req, res) => {
    const ip = getClientIp(req);
    const { pin, confirmPin, ownerPassword, confirmOwnerPassword } = req.body as {
      pin?: string;
      confirmPin?: string;
      ownerPassword?: string;
      confirmOwnerPassword?: string;
    };

    if (!pin || pin !== confirmPin) {
      return res.status(400).json({ error: 'PIN kodlari mos kelmadi. Ikkala maydonga bir xil 4-xonali PIN kiriting.' });
    }
    if (!ownerPassword || ownerPassword !== confirmOwnerPassword) {
      return res.status(400).json({ error: 'Owner parollari mos kelmadi.' });
    }
    const result = completeInitialSetup(String(pin), String(ownerPassword));
    if (!result.ok) {
      return res.status(403).json({ error: result.error });
    }

    const session = createSession(ip);
    session.ownerVerifiedUntil = Date.now() + 15 * 60 * 1000;
    const cfg = loadAuthConfig();
    return res.json({
      token: session.token,
      csrfToken: session.csrfToken,
      ownerVerified: true,
      autoLockMinutes: cfg.autoLockMinutes,
    });
  });

  app.post('/api/auth/login', (req, res) => {
    const ip = getClientIp(req);
    if (isInitialSetupRequired()) {
      return res.status(409).json({
        error: 'Avval birinchi sozlash orqali 4-xonali PIN va Owner parolini o‘rnating.',
        needsInitialSetup: true,
      });
    }

    const rl = checkPinRateLimit(ip);
    if (!rl.allowed) {
      return res.status(429).json({
        error: `Ko‘p noto‘g‘ri urinish! ${rl.retryAfterSec} soniyadan so‘ng qayta urinib ko‘ring.`,
        retryAfterSec: rl.retryAfterSec,
      });
    }

    const pin = String((req.body as { pin?: string })?.pin ?? '');
    if (!verifyPinInput(pin)) {
      const fail = recordPinFailure(ip);
      appendSecurityAudit('PIN_FAILED', `Noto‘g‘ri PIN urinishi (${ip})`);
      if (fail.locked) {
        return res.status(429).json({
          error: `Kirish vaqtincha bloklandi (${fail.retryAfterSec} soniya).`,
          retryAfterSec: fail.retryAfterSec,
          remainingAttempts: 0,
        });
      }
      return res.status(401).json({
        error: `Noto‘g‘ri PIN kod. Qolgan urinishlar: ${fail.remainingAttempts}`,
        remainingAttempts: fail.remainingAttempts,
      });
    }

    clearPinRateLimit(ip);
    const session = createSession(ip);
    appendSecurityAudit('PIN_LOGIN', `Muvaffaqiyatli PIN kirish (${ip})`);
    const cfg = loadAuthConfig();
    return res.json({
      token: session.token,
      csrfToken: session.csrfToken,
      ownerVerified: false,
      autoLockMinutes: cfg.autoLockMinutes,
    });
  });

  app.post('/api/auth/logout', requireAuth, requireCsrf, (req, res) => {
    revokeSession(req);
    appendSecurityAudit('LOGOUT', 'Foydalanuvchi tizimdan chiqdi');
    return res.json({ ok: true });
  });

  app.post('/api/auth/lock', requireAuth, requireCsrf, (req, res) => {
    revokeSession(req);
    appendSecurityAudit('LOCK_SYSTEM', 'Tizim qo‘lda qulflandi');
    return res.json({ ok: true });
  });

  app.post('/api/auth/owner-verify', requireAuth, requireCsrf, (req: AuthedRequest, res) => {
    const ip = getClientIp(req);
    const rl = checkOwnerRateLimit(ip);
    if (!rl.allowed) {
      return res.status(429).json({
        error: `Owner kirishi vaqtincha bloklandi (${rl.retryAfterSec} soniya).`,
        retryAfterSec: rl.retryAfterSec,
      });
    }

    const password = String((req.body as { password?: string })?.password ?? '');
    if (!verifyOwnerPasswordInput(password)) {
      const fail = recordOwnerFailure(ip);
      appendSecurityAudit('OWNER_AUTH_FAILED', `Noto‘g‘ri Owner paroli (${ip})`);
      if (fail.locked) {
        return res.status(429).json({
          error: `Ko‘p noto‘g‘ri urinish. ${fail.retryAfterSec} soniya kuting.`,
          retryAfterSec: fail.retryAfterSec,
        });
      }
      return res.status(401).json({
        error: `Owner paroli noto‘g‘ri. Qolgan urinishlar: ${fail.remainingAttempts}`,
      });
    }

    clearOwnerRateLimit(ip);
    if (req.session) {
      req.session.ownerVerifiedUntil = Date.now() + 15 * 60 * 1000;
    }
    appendSecurityAudit('OWNER_VERIFIED', 'Owner vakolati tasdiqlandi');
    return res.json({
      ownerVerified: true,
      ownerVerifiedUntil: req.session?.ownerVerifiedUntil ?? 0,
      ownerProfile: OWNER_PROFILE,
    });
  });

  app.get('/api/owner/profile', requireAuth, requireOwner, (_req, res) => {
    const cfg = loadAuthConfig();
    return res.json({
      profile: OWNER_PROFILE,
      autoLockMinutes: cfg.autoLockMinutes,
      pinUpdatedAt: cfg.pin?.updatedAt ?? null,
      ownerPasswordUpdatedAt: cfg.ownerPassword?.updatedAt ?? null,
      auditLog: cfg.auditLog.slice(0, 30),
    });
  });

  app.post('/api/owner/change-pin', requireAuth, requireCsrf, requireOwner, (req, res) => {
    const { newPin, confirmPin } = req.body as { newPin?: string; confirmPin?: string };
    if (!newPin || !/^\d{4}$/.test(String(newPin))) {
      return res.status(400).json({ error: 'Yangi PIN aniq 4 ta raqamdan iborat bo‘lishi kerak.' });
    }
    if (newPin !== confirmPin) {
      return res.status(400).json({ error: 'Yangi PIN ikkala maydonda ham bir xil kiritilishi shart.' });
    }
    const cfg = loadAuthConfig();
    cfg.pin = hashSecret(String(newPin));
    saveAuthConfig(cfg);
    appendSecurityAudit('PIN_CHANGED', 'Owner tomonidan 4-xonali PIN muvaffaqiyatli almashtirildi');
    pushNotification({
      priority: 'HIGH',
      category: 'SERVER',
      title: '4-xonali kirish PIN kodi yangilandi',
      message: 'Owner Markazi orqali tizim kirish PIN kodi yangi hash bilan saqlandi.',
    });
    return res.json({ ok: true, updatedAt: cfg.pin.updatedAt });
  });

  app.post('/api/owner/change-password', requireAuth, requireCsrf, requireOwner, (req, res) => {
    const { newPassword, confirmPassword } = req.body as { newPassword?: string; confirmPassword?: string };
    if (!newPassword || String(newPassword).trim().length < 6) {
      return res.status(400).json({ error: 'Yangi Owner paroli kamida 6 ta belgidan iborat bo‘lishi kerak.' });
    }
    if (newPassword !== confirmPassword) {
      return res.status(400).json({ error: 'Yangi parol ikki marta bir xil tasdiqlanishi kerak.' });
    }
    const cfg = loadAuthConfig();
    cfg.ownerPassword = hashSecret(String(newPassword).trim());
    saveAuthConfig(cfg);
    appendSecurityAudit('OWNER_PASSWORD_CHANGED', 'Owner bosh paroli yangilandi');
    return res.json({ ok: true, updatedAt: cfg.ownerPassword.updatedAt });
  });

  app.post('/api/owner/auto-lock', requireAuth, requireCsrf, requireOwner, (req, res) => {
    const mins = Number((req.body as { autoLockMinutes?: number })?.autoLockMinutes);
    if (!Number.isFinite(mins) || mins < 1 || mins > 240) {
      return res.status(400).json({ error: 'Avto-qulflash vaqti 1 dan 240 daqiqagacha bo‘lishi kerak.' });
    }
    const cfg = loadAuthConfig();
    cfg.autoLockMinutes = Math.round(mins);
    saveAuthConfig(cfg);
    appendSecurityAudit('AUTO_LOCK_UPDATED', `Sessiya avto-qulflash: ${cfg.autoLockMinutes} daqiqa`);
    return res.json({ ok: true, autoLockMinutes: cfg.autoLockMinutes });
  });

  /* ==================== LIVE SYSTEM STATUS & EMERGENCY CONTROL ==================== */
  app.get('/api/system/status', requireAuth, (_req, res) => {
    const db = loadMemoryDb();
    const sys = getDiskAndSystemMetrics();
    const localCfg = getLocalProxyConfig();
    const hasGemini = Boolean(process.env.GEMINI_API_KEY);
    const aiReady = localCfg.enabled || hasGemini;

    const totalStrategies = db.strategies.length;
    const approvedStrategies = db.strategies.filter((s) => s.ownerApproved).length;
    const activeStrategies = db.strategies.filter((s) => s.ownerApproved && s.active).length;
    const pendingStrategies = db.strategies.filter((s) => !s.ownerApproved).length;

    return res.json({
      serverOnline: true,
      serverUptimeSec: sys.uptimeSec,
      platform: sys.platform,
      aiStatus: aiReady ? (localCfg.enabled ? 'LOCAL_PROXY_READY' : 'GEMINI_READY') : 'UNCONFIGURED',
      databaseStatus: sys.dbHealthy ? 'HEALTHY' : 'RECOVERED',
      dbSizeKb: sys.dbSizeKb,
      control: db.control,
      strategiesCount: {
        total: totalStrategies,
        approved: approvedStrategies,
        active: activeStrategies,
        pending: pendingStrategies,
      },
      memory: {
        usedMb: sys.usedMemMb,
        totalMb: sys.totalMemMb,
        usedPct: sys.memUsedPct,
        processRssMb: sys.processRssMb,
      },
      disk: {
        freeGb: sys.diskFreeGb,
        totalGb: sys.diskTotalGb,
        usedPct: sys.diskUsedPct,
      },
      activeSessions: getActiveSessionCount(),
      unreadNotifications: db.notifications.filter((n) => !n.acknowledged).length,
      timestamp: new Date().toISOString(),
    });
  });

  app.post('/api/system/control', requireAuth, requireCsrf, (req: AuthedRequest, res) => {
    const body = req.body as {
      action?:
        | 'STOP_NEW_TRADES'
        | 'RESUME_NEW_TRADES'
        | 'PAUSE_SCANNER'
        | 'RESUME_SCANNER'
        | 'DISABLE_AUTO_TRADING'
        | 'SET_MODE'
        | 'TOGGLE_AUTO_BACKUP'
        | 'HEARTBEAT_SCAN';
      mode?: AutonomousMode;
      enabled?: boolean;
      instrumentsScanned?: number;
    };

    const db = loadMemoryDb();
    const action = body.action;

    if (action === 'STOP_NEW_TRADES') {
      db.control.stopNewTrades = true;
      db.control.autonomousMode = 'OBSERVATION';
      saveMemoryDb(db);
      pushNotification({
        priority: 'CRITICAL',
        category: 'RISK',
        title: 'FAVQULODDA: Yangi savdolar to‘xtatildi',
        message: 'STOP NEW TRADES faollashtirildi. Barcha yangi buyurtmalar va avto-savdo bloklandi.',
      });
      return res.json({ ok: true, control: db.control });
    }

    if (action === 'RESUME_NEW_TRADES') {
      if (!req.session || Date.now() > req.session.ownerVerifiedUntil) {
        return res.status(403).json({
          error: 'Yangi savdolarni qayta ochish uchun Owner tasdig‘i talab qilinadi.',
          code: 'OWNER_AUTH_REQUIRED',
        });
      }
      db.control.stopNewTrades = false;
      saveMemoryDb(db);
      pushNotification({
        priority: 'HIGH',
        category: 'RISK',
        title: 'Yangi savdo blokirovkasi yechildi',
        message: 'Owner ruxsati bilan yangi buyurtmalar qayta ruxsat etildi.',
      });
      return res.json({ ok: true, control: db.control });
    }

    if (action === 'PAUSE_SCANNER') {
      db.control.scannerStatus = 'PAUSED';
      saveMemoryDb(db);
      pushNotification({
        priority: 'HIGH',
        category: 'SCANNER',
        title: '24/7 Skaner pauzaga qo‘yildi',
        message: 'Bozorni avtomatik skanerlash vaqtincha to‘xtatildi.',
      });
      return res.json({ ok: true, control: db.control });
    }

    if (action === 'RESUME_SCANNER') {
      db.control.scannerStatus = 'RUNNING';
      saveMemoryDb(db);
      pushNotification({
        priority: 'NORMAL',
        category: 'SCANNER',
        title: '24/7 Skaner qayta ishga tushirildi',
        message: 'Bozor instrumentlari tahlili davom etmoqda.',
      });
      return res.json({ ok: true, control: db.control });
    }

    if (action === 'DISABLE_AUTO_TRADING') {
      db.control.autonomousMode = 'OBSERVATION';
      saveMemoryDb(db);
      pushNotification({
        priority: 'CRITICAL',
        category: 'RISK',
        title: 'Avto-Savdo darhol o‘chirildi',
        message: 'Tizim xavfsiz Kuzatuv (Observation) rejimiga o‘tkazildi.',
      });
      return res.json({ ok: true, control: db.control });
    }

    if (action === 'SET_MODE') {
      const requested = body.mode;
      if (requested !== 'OBSERVATION' && requested !== 'SIGNAL' && requested !== 'AUTONOMOUS') {
        return res.status(400).json({ error: 'Noto‘g‘ri rejim tanlandi.' });
      }
      if (requested === 'AUTONOMOUS') {
        if (!req.session || Date.now() > req.session.ownerVerifiedUntil) {
          return res.status(403).json({
            error: 'Avtonom savdoni yoqish uchun Owner autentifikatsiyasi shart.',
            code: 'OWNER_AUTH_REQUIRED',
          });
        }
        if (db.control.stopNewTrades) {
          return res.status(400).json({
            error: 'STOP NEW TRADES faol bo‘lganda Avtonom savdoni yoqib bo‘lmaydi.',
          });
        }
        const activeApproved = db.strategies.filter((s) => s.ownerApproved && s.active).length;
        if (activeApproved === 0) {
          return res.status(400).json({
            error: 'Avtonom savdo uchun kamida 1 ta Owner tasdiqlagan va faol strategiya bo‘lishi kerak.',
          });
        }
      }
      db.control.autonomousMode = requested;
      saveMemoryDb(db);
      pushNotification({
        priority: requested === 'AUTONOMOUS' ? 'HIGH' : 'NORMAL',
        category: 'STRATEGY',
        title: `Savdo rejimi o‘zgartirildi: ${requested}`,
        message:
          requested === 'AUTONOMOUS'
            ? 'Owner ruxsati bilan Avtonom Savdo rejimi yoqildi.'
            : requested === 'SIGNAL'
              ? 'Signal rejimi faol — AI faqat tasdiqlangan signallarni chiqaradi.'
              : 'Kuzatuv (Observation) rejimi faol — buyurtmalar ochilmaydi.',
      });
      return res.json({ ok: true, control: db.control });
    }

    if (action === 'TOGGLE_AUTO_BACKUP') {
      db.control.autoBackupEnabled = Boolean(body.enabled);
      saveMemoryDb(db);
      return res.json({ ok: true, control: db.control });
    }

    if (action === 'HEARTBEAT_SCAN') {
      if (db.control.scannerStatus === 'RUNNING') {
        db.control.lastAnalysisTime = new Date().toISOString();
        if (typeof body.instrumentsScanned === 'number' && body.instrumentsScanned >= 0) {
          db.control.instrumentsScanned = Math.round(body.instrumentsScanned);
        }
        saveMemoryDb(db);
      }
      return res.json({ ok: true, control: db.control });
    }

    return res.status(400).json({ error: 'Noma’lum boshqaruv buyrug‘i.' });
  });

  /* ==================== STRATEGY APPROVAL REGISTRY ==================== */
  app.get('/api/registry/strategies', requireAuth, (_req, res) => {
    const db = loadMemoryDb();
    return res.json({ strategies: db.strategies });
  });

  app.post('/api/registry/strategies/:id/stage', requireAuth, requireCsrf, (req: AuthedRequest, res) => {
    const id = String(req.params.id || '');
    const body = req.body as {
      codeReviewStatus?: 'PASSED' | 'PENDING' | 'REJECTED';
      backtestStatus?: 'PASSED' | 'PENDING' | 'FAILED';
      demoTestStatus?: 'PASSED' | 'PENDING' | 'FAILED';
      ownerApproved?: boolean;
      active?: boolean;
      notesUz?: string;
    };

    const db = loadMemoryDb();
    const target = db.strategies.find((s) => s.id === id);
    if (!target) {
      return res.status(404).json({ error: 'Strategiya registry bazasida topilmadi.' });
    }

    const isOwner = Boolean(req.session && Date.now() <= req.session.ownerVerifiedUntil);
    if ((body.ownerApproved !== undefined || body.active === true) && !isOwner) {
      return res.status(403).json({
        error: 'Strategiyani tasdiqlash yoki faollashtirish uchun Owner autentifikatsiyasi shart.',
        code: 'OWNER_AUTH_REQUIRED',
      });
    }

    if (body.codeReviewStatus) target.codeReviewStatus = body.codeReviewStatus;
    if (body.backtestStatus) target.backtestStatus = body.backtestStatus;
    if (body.demoTestStatus) target.demoTestStatus = body.demoTestStatus;
    if (typeof body.notesUz === 'string') target.notesUz = body.notesUz.slice(0, 300);

    if (body.ownerApproved !== undefined) {
      if (body.ownerApproved) {
        if (target.codeReviewStatus !== 'PASSED' || target.backtestStatus !== 'PASSED' || target.demoTestStatus !== 'PASSED') {
          return res.status(400).json({
            error: 'Owner tasdig‘idan oldin Code Review, Backtest va Demo Test bosqichlari PASSED bo‘lishi shart.',
          });
        }
        target.ownerApproved = true;
        target.ownerApprovedAt = new Date().toISOString();
      } else {
        target.ownerApproved = false;
        target.ownerApprovedAt = null;
        target.active = false;
      }
    }

    if (body.active !== undefined) {
      if (body.active && !target.ownerApproved) {
        return res.status(400).json({
          error: 'Owner tasdiqlamagan strategiyani faollashtirib bo‘lmaydi.',
        });
      }
      target.active = Boolean(body.active);
    }

    saveMemoryDb(db);
    pushNotification({
      priority: body.ownerApproved !== undefined ? 'HIGH' : 'NORMAL',
      category: 'STRATEGY',
      title: `Strategiya yangilandi: ${target.name}`,
      message: `Owner tasdig‘i: ${target.ownerApproved ? 'Tasdiqlangan' : 'Kutilmoqda'} · Holat: ${target.active ? 'Faol' : 'Nofaol'}.`,
    });
    return res.json({ ok: true, strategy: target, strategies: db.strategies });
  });

  /* ==================== LOCAL DISK MEMORY & BACKUP/RECOVERY ==================== */
  app.get('/api/memory/overview', requireAuth, (_req, res) => {
    const db = loadMemoryDb();
    const sys = getDiskAndSystemMetrics();
    return res.json({
      dbHealthy: sys.dbHealthy,
      dbSizeKb: sys.dbSizeKb,
      disk: {
        freeGb: sys.diskFreeGb,
        totalGb: sys.diskTotalGb,
        usedPct: sys.diskUsedPct,
      },
      autoBackupEnabled: db.control.autoBackupEnabled,
      lastBackupAt: db.control.lastBackupAt,
      counts: {
        strategies: db.strategies.length,
        analyses: db.analyses.length,
        signals: db.signals.length,
        notifications: db.notifications.length,
      },
      backups: listBackups(),
      recentAnalyses: db.analyses.slice(0, 40),
      recentSignals: db.signals.slice(0, 60),
    });
  });

  app.post('/api/memory/backup', requireAuth, requireCsrf, (_req, res) => {
    try {
      const backup = createBackup('manual');
      pushNotification({
        priority: 'NORMAL',
        category: 'SERVER',
        title: 'Lokal disk zaxira nusxasi yaratildi',
        message: `Backup fayli: ${backup.filename} (${(backup.sizeBytes / 1024).toFixed(1)} KB)`,
      });
      return res.json({ ok: true, backup, backups: listBackups() });
    } catch (err) {
      return res.status(500).json({ error: err instanceof Error ? err.message : 'Backup yaratishda xatolik.' });
    }
  });

  app.post('/api/memory/restore', requireAuth, requireCsrf, requireOwner, (req, res) => {
    const filename = String((req.body as { filename?: string })?.filename ?? '');
    const result = restoreBackup(filename);
    if (!result.ok) {
      return res.status(400).json({ error: result.error });
    }
    return res.json({ ok: true });
  });

  app.post('/api/memory/log-analysis', requireAuth, requireCsrf, (req, res) => {
    const body = req.body as {
      symbol?: string;
      timeframe?: string;
      action?: string;
      analyticalScore?: number;
      regime?: string;
      summaryUz?: string;
    };
    const db = loadMemoryDb();
    const rec = {
      id: `an-${Date.now()}`,
      timestamp: new Date().toISOString(),
      symbol: String(body.symbol || 'XAUUSD').slice(0, 20),
      timeframe: String(body.timeframe || 'M5').slice(0, 10),
      action: String(body.action || 'WAIT').slice(0, 20),
      analyticalScore: Number(body.analyticalScore) || 0,
      regime: String(body.regime || 'Uncertain Market').slice(0, 40),
      summaryUz: String(body.summaryUz || '').slice(0, 500),
    };
    db.analyses.unshift(rec);
    db.analyses = db.analyses.slice(0, 300);
    db.control.lastAnalysisTime = rec.timestamp;
    saveMemoryDb(db);
    return res.json({ ok: true, record: rec });
  });

  app.post('/api/memory/log-signal', requireAuth, requireCsrf, (req, res) => {
    const body = req.body as {
      symbol?: string;
      timeframe?: string;
      direction?: string;
      strategyName?: string;
      entryPrice?: number;
      stopLoss?: number;
      takeProfit?: number;
      outcome?: 'PENDING' | 'WIN' | 'LOSS' | 'BREAKEVEN';
      pnlUsd?: number;
    };
    const db = loadMemoryDb();
    const rec = {
      id: `sig-${Date.now()}`,
      timestamp: new Date().toISOString(),
      symbol: String(body.symbol || 'XAUUSD').slice(0, 20),
      timeframe: String(body.timeframe || 'M5').slice(0, 10),
      direction: String(body.direction || 'WAIT').slice(0, 20),
      strategyName: String(body.strategyName || 'Trade Killer AI').slice(0, 80),
      entryPrice: Number(body.entryPrice) || 0,
      stopLoss: Number(body.stopLoss) || 0,
      takeProfit: Number(body.takeProfit) || 0,
      outcome: body.outcome ?? 'PENDING',
      pnlUsd: Number(body.pnlUsd) || 0,
    };
    db.signals.unshift(rec);
    db.signals = db.signals.slice(0, 500);
    saveMemoryDb(db);
    return res.json({ ok: true, record: rec });
  });

  /* ==================== PERMANENT MONITORING NOTIFICATIONS ==================== */
  app.get('/api/notifications', requireAuth, (_req, res) => {
    const db = loadMemoryDb();
    return res.json({ notifications: db.notifications });
  });

  app.post('/api/notifications', requireAuth, requireCsrf, (req, res) => {
    const body = req.body as {
      priority?: NotificationPriority;
      category?: NotificationCategory;
      title?: string;
      message?: string;
      symbol?: string;
    };
    const priority: NotificationPriority =
      body.priority === 'CRITICAL' || body.priority === 'HIGH' ? body.priority : 'NORMAL';
    const validCategories: NotificationCategory[] = [
      'SIGNAL',
      'SETUP',
      'BREAKOUT',
      'SWEEP',
      'POSITION',
      'RISK',
      'MT5',
      'SERVER',
      'SCANNER',
      'STRATEGY',
    ];
    const category: NotificationCategory = validCategories.includes(body.category as NotificationCategory)
      ? (body.category as NotificationCategory)
      : 'SIGNAL';
    const item = pushNotification({
      priority,
      category,
      title: String(body.title || 'Tizim xabari').slice(0, 140),
      message: String(body.message || '').slice(0, 400),
      symbol: body.symbol ? String(body.symbol).slice(0, 20) : undefined,
    });
    return res.json({ ok: true, notification: item });
  });

  app.post('/api/notifications/ack', requireAuth, requireCsrf, (req, res) => {
    const id = String((req.body as { id?: string })?.id ?? '');
    const db = loadMemoryDb();
    if (id === 'ALL') {
      db.notifications.forEach((n) => {
        n.acknowledged = true;
      });
    } else {
      const target = db.notifications.find((n) => n.id === id);
      if (target) target.acknowledged = true;
    }
    saveMemoryDb(db);
    return res.json({ ok: true, notifications: db.notifications });
  });

  app.get('/api/ai/provider-info', requireAuth, (_req, res) => {
    const localCfg = getLocalProxyConfig();
    return res.json({
      activeProvider: localCfg.enabled ? 'local-proxy' : 'gemini-cloud',
      localProxyBaseUrl: localCfg.baseUrl,
      hasGeminiKey: Boolean(process.env.GEMINI_API_KEY),
      hasLocalProxyKey: Boolean(localCfg.apiKey),
    });
  });

  // AI Chat + Full-Permission MT5 Function Calling
  app.post('/api/ai/chat', requireAuth, requireCsrf, async (req, res) => {
    try {
      const { messages, context, fullPermissions } = req.body as {
        messages: { role: 'user' | 'model'; text: string }[];
        context?: Record<string, unknown>;
        fullPermissions?: boolean;
      };

      if (!Array.isArray(messages) || messages.length === 0) {
        return res.status(400).json({ error: 'Xabarlar ro‘yxati bo‘sh.' });
      }

      const systemInstruction = `Siz "Trade Killer AI" — MetaTrader 5 (MT5) terminali uchun to‘liq huquqli skalping va uzoq muddatli savdo tahlilchisi hamda avtonom ijrochisiz.
Foydalanuvchi bilan faqat aniq, ravon o‘zbek tilida muloqot qiling.

${STRATEGY_BRAIN_PROMPT}

Hozirgi MT5 terminal holati, shamlar va 12-strategiya miya hisob-kitoblari:
${JSON.stringify(context ?? {}, null, 2)}

Qoidalar:
1. Javoblaringizda context JSON da berilgan bozor rejimi, sham patternlari, chart patternlari, EMA 20/50/100/200, RSI + Divergensiya, SMC (BOS/CHoCH/MSS/BSL/SSL), MTF holati, PAC34, VWAP hamda GitHub strategiyalarining aniq hisoblangan raqamlarini keltiring (raqam to'qimang).
2. ${
        fullPermissions
          ? 'Sizda TO‘LIQ HUQUQ YOQILGAN: foydalanuvchi savdo ochish, yopish, SL/TP o‘zgartirish, bozorni skaner qilish yoki tarixiy ma’lumotlarda backtest o‘tkazishni so‘rasa, darhol tegishli MT5 funksiyasini (open_mt5_order, close_mt5_position, modify_mt5_sl_tp, run_mt5_backtest, scan_mt5_market, toggle_ai_autotrader) chaqiring. Risk filtri NO TRADE desa ogohlantiring.'
          : 'Hozir faqat maslahat rejimi yoqilgan. Buyruqlarni bajarish uchun To‘liq AI huquqini yoqishni taklif qiling.'
      }
3. Har bir tavsiyada qaror (BUY/SELL/WAIT/NO TRADE), qarshi signallar, kirish sharti, Stop-Loss, Take-Profit, R:R va invalidation darajasini ko‘rsating.`;

      const localCfg = getLocalProxyConfig();
      if (localCfg.enabled) {
        const proxyResult = await callOpenAiCompatibleProxy(
          systemInstruction,
          messages,
          fullPermissions ? mt5TradingTools : undefined
        );
        return res.json(proxyResult);
      }

      const ai = getAiClient();
      const contents = messages.map((m) => ({
        role: m.role === 'model' ? 'model' : 'user',
        parts: [{ text: m.text }],
      }));

      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents,
        config: {
          systemInstruction,
          ...(fullPermissions ? { tools: [{ functionDeclarations: mt5TradingTools }] } : {}),
        },
      });

      const functionCalls = response.functionCalls ?? [];
      let replyText = response.text ?? '';

      if (!replyText && functionCalls.length > 0) {
        replyText = functionCalls
          .map((fc) => `MT5 amali bajarildi: ${fc.name}`)
          .join('\n');
      }

      return res.json({
        reply: replyText,
        functionCalls: functionCalls.map((fc) => ({
          id: fc.id,
          name: fc.name,
          args: fc.args,
        })),
      });
    } catch (error) {
      console.error('AI Chat Error:', error);
      const message = error instanceof Error ? error.message : 'AI serverida xatolik yuz berdi.';
      return res.status(500).json({ error: message });
    }
  });

  // AI Market Summary ("AI Hulosalar")
  app.post('/api/ai/summary', requireAuth, requireCsrf, async (req, res) => {
    try {
      const { context } = req.body as { context?: Record<string, unknown> };
      const sysInst = `Siz MT5 treyderining shaxsiy AI tahlilchisisiz. O‘zbek tilida qisqa, aniq JSON formatida xulosa bering.\n${STRATEGY_BRAIN_PROMPT}`;
      const prompt = `Quyidagi MetaTrader 5 bozor, shamlar va 12-strategiya miya ko'rsatkichlari asosida skalping va uzoq muddatli xulosa tuzing:\n${JSON.stringify(
        context ?? {},
        null,
        2
      )}`;

      const localCfg = getLocalProxyConfig();
      if (localCfg.enabled) {
        const parsed = await callOpenAiCompatibleJson(
          `${sysInst}\nJSON maydonlari: marketBias, confidencePct, headline, riskNote, recommendations: [{symbol, action, style, entry, stopLoss, takeProfit, rationale}]`,
          prompt
        );
        return res.json(parsed);
      }

      const ai = getAiClient();

      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: prompt,
        config: {
          systemInstruction: sysInst,
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              marketBias: { type: Type.STRING },
              confidencePct: { type: Type.NUMBER },
              headline: { type: Type.STRING },
              riskNote: { type: Type.STRING },
              recommendations: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    symbol: { type: Type.STRING },
                    action: { type: Type.STRING },
                    style: { type: Type.STRING },
                    entry: { type: Type.STRING },
                    stopLoss: { type: Type.STRING },
                    takeProfit: { type: Type.STRING },
                    rationale: { type: Type.STRING },
                  },
                },
              },
            },
          },
        },
      });

      const raw = (response.text ?? '{}').trim();
      return res.json(JSON.parse(raw));
    } catch (error) {
      console.error('AI Summary Error:', error);
      const message = error instanceof Error ? error.message : 'AI xulosa olishda xatolik.';
      return res.status(500).json({ error: message });
    }
  });

  // Full Multi-Pair AI Scanner (Scalping + Long-Term)
  app.post('/api/ai/scan', requireAuth, requireCsrf, async (req, res) => {
    try {
      const { pairs, styleFilter } = req.body as {
        pairs: unknown[];
        styleFilter?: string;
      };
      const sysInst = `Siz MT5 to‘liq bozor skaneri AI sisiz. Har bir instrument bo‘yicha Skalping (M5/M15) va Uzoq muddatli (H4/D1) signalini o‘zbek tilida JSON massivida qaytaring.\n${STRATEGY_BRAIN_PROMPT}`;
      const prompt = `Quyidagi MT5 instrumentlari va ularning 12-strategiya miya signallarini to‘liq skaner qiling (uslub: ${
        styleFilter || 'Skalping va Uzoq muddatli'
      }):\n${JSON.stringify(pairs ?? [], null, 2)}`;

      const localCfg = getLocalProxyConfig();
      if (localCfg.enabled) {
        const parsed = await callOpenAiCompatibleJson(
          `${sysInst}\nJSON maydonlari: overallSummary, signals: [{symbol, style, timeframe, signal, confidencePct, entry, stopLoss, takeProfit, summary}]`,
          prompt
        );
        return res.json(parsed);
      }

      const ai = getAiClient();

      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: prompt,
        config: {
          systemInstruction: sysInst,
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              overallSummary: { type: Type.STRING },
              signals: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    symbol: { type: Type.STRING },
                    style: { type: Type.STRING, description: 'Skalping yoki Uzoq muddatli' },
                    timeframe: { type: Type.STRING },
                    signal: { type: Type.STRING, description: 'BUY, SELL yoki NEUTRAL' },
                    confidencePct: { type: Type.NUMBER },
                    entry: { type: Type.STRING },
                    stopLoss: { type: Type.STRING },
                    takeProfit: { type: Type.STRING },
                    summary: { type: Type.STRING },
                  },
                },
              },
            },
          },
        },
      });

      const raw = (response.text ?? '{}').trim();
      return res.json(JSON.parse(raw));
    } catch (error) {
      console.error('AI Scan Error:', error);
      const message = error instanceof Error ? error.message : 'AI skaner xatosi.';
      return res.status(500).json({ error: message });
    }
  });

  // AI Backtest Analysis & Optimization Endpoint
  app.post('/api/ai/backtest-analyze', requireAuth, requireCsrf, async (req, res) => {
    try {
      const { result } = req.body as { result: Record<string, unknown> };
      const sysInst = `Siz MT5 miqdoriy (quant) backtest tahlilchisi AI sisiz. O‘zbek tilida JSON formatida aniq xulosa bering.\n${STRATEGY_BRAIN_PROMPT}`;
      const prompt = `Quyidagi MT5 tarixiy backtest natijasini chuqur tahlil qiling va yaxshilash bo‘yicha aniq xulosa bering:\n${JSON.stringify(
        result ?? {},
        null,
        2
      )}`;

      const localCfg = getLocalProxyConfig();
      if (localCfg.enabled) {
        const parsed = await callOpenAiCompatibleJson(
          `${sysInst}\nJSON maydonlari: verdict, summary, strengths, weaknesses, recommendedTimeframe, suggestedSlPct, suggestedTpPct`,
          prompt
        );
        return res.json(parsed);
      }

      const ai = getAiClient();

      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: prompt,
        config: {
          systemInstruction: sysInst,
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              verdict: { type: Type.STRING, description: 'Strategiya holati: Yaroqli, Optimallashtirish kerak yoki Xavfli' },
              summary: { type: Type.STRING },
              strengths: { type: Type.ARRAY, items: { type: Type.STRING } },
              weaknesses: { type: Type.ARRAY, items: { type: Type.STRING } },
              recommendedTimeframe: { type: Type.STRING },
              suggestedSlPct: { type: Type.NUMBER },
              suggestedTpPct: { type: Type.NUMBER },
            },
          },
        },
      });

      const raw = (response.text ?? '{}').trim();
      return res.json(JSON.parse(raw));
    } catch (error) {
      console.error('AI Backtest Analyze Error:', error);
      const message = error instanceof Error ? error.message : 'AI backtest tahlilida xatolik.';
      return res.status(500).json({ error: message });
    }
  });

  if (process.env.NODE_ENV === 'production') {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('/{*splat}', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  } else {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Trade Killer server http://localhost:${PORT} da ishlamoqda`);
  });
}

startServer().catch((err) => {
  console.error('Server start error:', err);
  process.exit(1);
});
