import 'dotenv/config';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { FunctionDeclaration, GoogleGenAI, Type } from '@google/genai';

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
          description: 'M1, M5, M15, H1, H4, D1',
        },
        barsCount: {
          type: Type.NUMBER,
          description: 'Tarixiy shamlar soni (100 dan 1000 gacha)',
        },
        strategyId: {
          type: Type.STRING,
          description:
            'all_6_confluence, smc_luxalgo, scalp_pullback, ema_ribbon_rsi, yoki vwap_bands',
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

const STRATEGY_BRAIN_PROMPT = `Sizning tahlil "miyangiz" quyidagi 6 ta aniq strategiya asosida ishlaydi:
1. EMA 20 / 50 / 100 / 200 Ribbon: To'liq trend yo'nalishi (Buqa Fan 20>50>100>200 yoki Ayiq Fan 20<50<100<200).
2. Glaz RSI Chart Bars (14): RSI > 70 Overbought (yuqori zona), RSI < 30 Oversold (pastki zona).
3. Libertus RSI Divergences v3.3 (90-bar): Narx va RSI o'rtasidagi BULL va BEAR divergensiyalar hamda pivotlar.
4. Smart Money Concepts [LuxAlgo]: Internal va Swing BOS / CHoCH tuzilmasi, Order Blocks (Bullish/Bearish OB), Fair Value Gaps (FVG), EQH/EQL va Premium (>52.5%) / Equilibrium / Discount (<47.5%) zonalari.
5. Scalping PullBack Tool R1.1 (JustUncleL): Heikin Ashi PAC EMA(34) High/Low kanali + EMA 89 / 200 / 600 + Williams Fraktallar (HH/LH/HL/LL) + PAC dan qaytish (Pullback BUY/SELL).
6. VWAP Stdev Bands v2 Mod: Sessiya VWAP va ±1.28σ, ±2.01σ, ±2.51σ zonalari (Overbought/Oversold mean-reversion).

Qoida: Skalping (M1/M5/M15) uchun asosan Scalping PullBack R1.1 (PAC34 + EMA 89/200), VWAP ±2.01σ zonalari, Internal SMC BOS/OB va Glaz RSI ga tayaning. Uzoq muddatli (H1/H4/D1/W1) uchun EMA 20/50/100/200, Swing SMC (BOS/CHoCH, Premium/Discount OB) va Libertus RSI Divergensiyalariga tayaning.`;

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
  app.use(express.json({ limit: '4mb' }));

  app.get('/api/ai/provider-info', (_req, res) => {
    const localCfg = getLocalProxyConfig();
    return res.json({
      activeProvider: localCfg.enabled ? 'local-proxy' : 'gemini-cloud',
      localProxyBaseUrl: localCfg.baseUrl,
      hasGeminiKey: Boolean(process.env.GEMINI_API_KEY),
      hasLocalProxyKey: Boolean(localCfg.apiKey),
    });
  });

  // AI Chat + Full-Permission MT5 Function Calling
  app.post('/api/ai/chat', async (req, res) => {
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

Hozirgi MT5 terminal holati, shamlar va 6-strategiya miya hisob-kitoblari:
${JSON.stringify(context ?? {}, null, 2)}

Qoidalar:
1. Javoblaringizda hisoblangan EMA 20/50/100/200, RSI + Divergensiya, SMC (BOS/CHoCH, OB, Premium/Discount), PAC 34 Pullback va VWAP Stdev ko'rsatkichlarini aniq raqamlar bilan tilga oling.
2. ${
        fullPermissions
          ? 'Sizda TO‘LIQ HUQUQ YOQILGAN: foydalanuvchi savdo ochish, yopish, SL/TP o‘zgartirish, bozorni skaner qilish yoki tarixiy ma’lumotlarda backtest o‘tkazishni so‘rasa, darhol tegishli MT5 funksiyasini (open_mt5_order, close_mt5_position, modify_mt5_sl_tp, run_mt5_backtest, scan_mt5_market, toggle_ai_autotrader) chaqiring.'
          : 'Hozir faqat maslahat rejimi yoqilgan. Buyruqlarni bajarish uchun To‘liq AI huquqini yoqishni taklif qiling.'
      }
3. Har bir tavsiyada kirish narxi, Stop-Loss, Take-Profit va Risk/Mukofot nisbatini ko‘rsating.`;

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
  app.post('/api/ai/summary', async (req, res) => {
    try {
      const { context } = req.body as { context?: Record<string, unknown> };
      const sysInst = `Siz MT5 treyderining shaxsiy AI tahlilchisisiz. O‘zbek tilida qisqa, aniq JSON formatida xulosa bering.\n${STRATEGY_BRAIN_PROMPT}`;
      const prompt = `Quyidagi MetaTrader 5 bozor, shamlar va 6-strategiya miya ko'rsatkichlari asosida skalping va uzoq muddatli xulosa tuzing:\n${JSON.stringify(
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
  app.post('/api/ai/scan', async (req, res) => {
    try {
      const { pairs, styleFilter } = req.body as {
        pairs: unknown[];
        styleFilter?: string;
      };
      const sysInst = `Siz MT5 to‘liq bozor skaneri AI sisiz. Har bir instrument bo‘yicha Skalping (M5/M15) va Uzoq muddatli (H4/D1) signalini o‘zbek tilida JSON massivida qaytaring.\n${STRATEGY_BRAIN_PROMPT}`;
      const prompt = `Quyidagi MT5 instrumentlari va ularning 6-strategiya miya signallarini to‘liq skaner qiling (uslub: ${
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
  app.post('/api/ai/backtest-analyze', async (req, res) => {
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
