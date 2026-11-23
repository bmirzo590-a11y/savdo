import { GoogleGenAI, Schema, Type } from '@google/genai';

export type LlmGenerationStatus =
  | 'GENERATED'
  | 'AI_UNAVAILABLE'
  | 'LLM_ERROR'
  | 'RATE_LIMITED'
  | 'TIMEOUT';

export interface LlmProviderInfo {
  configured: boolean;
  providerKey: 'gemini' | 'local_proxy' | 'none';
  providerLabel: string | null;
  model: string | null;
  baseUrl?: string;
}

export interface LlmTextRequest {
  systemInstruction: string;
  messages: { role: 'user' | 'model'; text: string }[];
  timeoutMs?: number;
}

export interface LlmJsonRequest extends LlmTextRequest {
  responseSchema?: Schema;
  jsonHint?: string;
}

export interface LlmCallResult<T = string> {
  ok: boolean;
  generationStatus: LlmGenerationStatus;
  provider: string | null;
  model: string | null;
  text: string | null;
  parsed?: T | null;
  latencyMs: number;
  error: string | null;
}

export const DEFAULT_GEMINI_MODEL = 'gemini-4-hydrogen';

function isPlaceholderKey(val: string | undefined): boolean {
  if (!val) return true;
  const trimmed = val.trim();
  if (!trimmed) return true;
  return (
    trimmed === 'MY_GEMINI_API_KEY' ||
    trimmed === 'MY_LOCAL_LLM_API_KEY' ||
    trimmed === 'YOUR_API_KEY' ||
    trimmed.toLowerCase().includes('replace_me')
  );
}

export function resolveActiveLlmProvider(): LlmProviderInfo {
  const localKey = (process.env.LOCAL_LLM_API_KEY || '').trim();
  const localUrl = (process.env.LOCAL_LLM_BASE_URL || 'http://localhost:3001/v1').replace(/\/$/, '');
  const localModel = (process.env.LOCAL_LLM_MODEL || 'auto').trim() || 'auto';

  const geminiKey = (process.env.GEMINI_API_KEY || '').trim();
  const geminiModel = (process.env.GEMINI_MODEL || DEFAULT_GEMINI_MODEL).trim() || DEFAULT_GEMINI_MODEL;

  // Prefer Google Gemini when configured (standard server-side AI Studio integration)
  if (!isPlaceholderKey(geminiKey)) {
    return {
      configured: true,
      providerKey: 'gemini',
      providerLabel: 'Google Gemini API',
      model: geminiModel,
    };
  }

  // Fallback to configured OpenAI-compatible Local / FreeLLMAPI proxy if Gemini key is absent
  if (!isPlaceholderKey(localKey)) {
    return {
      configured: true,
      providerKey: 'local_proxy',
      providerLabel: 'OpenAI-Compatible Local/Proxy LLM',
      model: localModel,
      baseUrl: localUrl,
    };
  }

  return {
    configured: false,
    providerKey: 'none',
    providerLabel: null,
    model: null,
  };
}

function createGeminiClient(): GoogleGenAI {
  const apiKey = (process.env.GEMINI_API_KEY || '').trim();
  if (isPlaceholderKey(apiKey)) {
    throw new Error('GEMINI_API_KEY sozlanmagan.');
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

function classifyError(err: unknown): { status: LlmGenerationStatus; message: string } {
  const raw = err instanceof Error ? err.message : String(err || 'Noma’lum LLM xatosi');
  const lower = raw.toLowerCase();

  if (lower.includes('timeout') || lower.includes('aborted') || lower.includes('timed out')) {
    return {
      status: 'TIMEOUT',
      message: `LLM javob berish vaqti tugadi (timeout): ${raw.slice(0, 180)}`,
    };
  }
  if (lower.includes('429') || lower.includes('resource_exhausted') || lower.includes('rate limit') || lower.includes('quota')) {
    return {
      status: 'RATE_LIMITED',
      message: `LLM so‘rov limiti (rate limit / quota) oshib ketdi: ${raw.slice(0, 180)}`,
    };
  }
  if (lower.includes('sozlanmagan') || lower.includes('api_key_invalid') || lower.includes('permission_denied') || lower.includes('401') || lower.includes('403')) {
    return {
      status: 'AI_UNAVAILABLE',
      message: `AI provider autentifikatsiya yoki kalit xatosi: ${raw.slice(0, 200)}`,
    };
  }
  return {
    status: 'LLM_ERROR',
    message: `LLM provider xatosi: ${raw.slice(0, 220)}`,
  };
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const timeoutPromise = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      reject(new Error(`Request timeout after ${timeoutMs}ms`));
    }, timeoutMs);
  });
  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function stripJsonFences(raw: string): string {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) return fenced[1].trim();
  const firstBrace = trimmed.indexOf('{');
  const lastBrace = trimmed.lastIndexOf('}');
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    return trimmed.slice(firstBrace, lastBrace + 1);
  }
  return trimmed;
}

export async function generateRealLlmText(req: LlmTextRequest): Promise<LlmCallResult<string>> {
  const started = Date.now();
  const info = resolveActiveLlmProvider();
  const timeoutMs = Math.max(5000, Math.min(45000, req.timeoutMs ?? 28000));

  if (!info.configured || info.providerKey === 'none') {
    return {
      ok: false,
      generationStatus: 'AI_UNAVAILABLE',
      provider: null,
      model: null,
      text: null,
      latencyMs: Date.now() - started,
      error: 'AI UNAVAILABLE: Server muhitida GEMINI_API_KEY yoki LOCAL_LLM_API_KEY sozlanmagan.',
    };
  }

  try {
    if (info.providerKey === 'gemini') {
      const ai = createGeminiClient();
      const contents = req.messages.map((m) => ({
        role: m.role,
        parts: [{ text: m.text }],
      }));
      const response = await withTimeout(
        ai.models.generateContent({
          model: info.model || DEFAULT_GEMINI_MODEL,
          contents,
          config: {
            systemInstruction: req.systemInstruction,
          },
        }),
        timeoutMs
      );
      const text = (response.text ?? '').trim();
      if (!text) {
        return {
          ok: false,
          generationStatus: 'LLM_ERROR',
          provider: info.providerLabel,
          model: info.model,
          text: null,
          latencyMs: Date.now() - started,
          error: 'LLM bo‘sh javob qaytardi.',
        };
      }
      return {
        ok: true,
        generationStatus: 'GENERATED',
        provider: info.providerLabel,
        model: info.model,
        text,
        parsed: text,
        latencyMs: Date.now() - started,
        error: null,
      };
    }

    // OpenAI-compatible Local / FreeLLMAPI proxy
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const resp = await fetch(`${info.baseUrl}/chat/completions`, {
        method: 'POST',
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${(process.env.LOCAL_LLM_API_KEY || '').trim()}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: info.model || 'auto',
          messages: [
            { role: 'system', content: req.systemInstruction },
            ...req.messages.map((m) => ({
              role: m.role === 'model' ? 'assistant' : 'user',
              content: m.text,
            })),
          ],
        }),
      });
      if (!resp.ok) {
        const errText = await resp.text();
        throw new Error(`HTTP ${resp.status}: ${errText.slice(0, 200)}`);
      }
      const data = (await resp.json()) as {
        model?: string;
        choices?: { message?: { content?: string } }[];
      };
      const text = (data.choices?.[0]?.message?.content ?? '').trim();
      if (!text) throw new Error('Local/Proxy LLM bo‘sh javob qaytardi.');
      return {
        ok: true,
        generationStatus: 'GENERATED',
        provider: info.providerLabel,
        model: data.model || info.model,
        text,
        parsed: text,
        latencyMs: Date.now() - started,
        error: null,
      };
    } finally {
      clearTimeout(timer);
    }
  } catch (err) {
    const classified = classifyError(err);
    return {
      ok: false,
      generationStatus: classified.status,
      provider: info.providerLabel,
      model: info.model,
      text: null,
      latencyMs: Date.now() - started,
      error: classified.message,
    };
  }
}

export async function generateRealLlmJson<T>(req: LlmJsonRequest): Promise<LlmCallResult<T>> {
  const started = Date.now();
  const info = resolveActiveLlmProvider();
  const timeoutMs = Math.max(5000, Math.min(45000, req.timeoutMs ?? 30000));

  if (!info.configured || info.providerKey === 'none') {
    return {
      ok: false,
      generationStatus: 'AI_UNAVAILABLE',
      provider: null,
      model: null,
      text: null,
      parsed: null,
      latencyMs: Date.now() - started,
      error: 'AI UNAVAILABLE: Server muhitida GEMINI_API_KEY yoki LOCAL_LLM_API_KEY sozlanmagan.',
    };
  }

  try {
    if (info.providerKey === 'gemini') {
      const ai = createGeminiClient();
      const contents = req.messages.map((m) => ({
        role: m.role,
        parts: [{ text: m.text }],
      }));
      const response = await withTimeout(
        ai.models.generateContent({
          model: info.model || DEFAULT_GEMINI_MODEL,
          contents,
          config: {
            systemInstruction: req.systemInstruction,
            responseMimeType: 'application/json',
            ...(req.responseSchema ? { responseSchema: req.responseSchema } : {}),
          },
        }),
        timeoutMs
      );
      const raw = (response.text ?? '').trim();
      if (!raw) {
        return {
          ok: false,
          generationStatus: 'LLM_ERROR',
          provider: info.providerLabel,
          model: info.model,
          text: null,
          parsed: null,
          latencyMs: Date.now() - started,
          error: 'Gemini bo‘sh JSON javob qaytardi.',
        };
      }
      const parsed = JSON.parse(stripJsonFences(raw)) as T;
      return {
        ok: true,
        generationStatus: 'GENERATED',
        provider: info.providerLabel,
        model: info.model,
        text: raw,
        parsed,
        latencyMs: Date.now() - started,
        error: null,
      };
    }

    // OpenAI-compatible proxy JSON mode
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const sysWithJson = `${req.systemInstruction}\n${req.jsonHint || ''}\nMUHIM: Faqat haqiqiy, yaroqli JSON obyekt qaytaring. Markdown belgilari ishlatmang.`;
      const resp = await fetch(`${info.baseUrl}/chat/completions`, {
        method: 'POST',
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${(process.env.LOCAL_LLM_API_KEY || '').trim()}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: info.model || 'auto',
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: sysWithJson },
            ...req.messages.map((m) => ({
              role: m.role === 'model' ? 'assistant' : 'user',
              content: m.text,
            })),
          ],
        }),
      });
      if (!resp.ok) {
        const errText = await resp.text();
        throw new Error(`HTTP ${resp.status}: ${errText.slice(0, 200)}`);
      }
      const data = (await resp.json()) as {
        model?: string;
        choices?: { message?: { content?: string } }[];
      };
      const raw = (data.choices?.[0]?.message?.content ?? '').trim();
      if (!raw) throw new Error('Local/Proxy LLM bo‘sh JSON qaytardi.');
      const parsed = JSON.parse(stripJsonFences(raw)) as T;
      return {
        ok: true,
        generationStatus: 'GENERATED',
        provider: info.providerLabel,
        model: data.model || info.model,
        text: raw,
        parsed,
        latencyMs: Date.now() - started,
        error: null,
      };
    } finally {
      clearTimeout(timer);
    }
  } catch (err) {
    const classified = classifyError(err);
    return {
      ok: false,
      generationStatus: classified.status,
      provider: info.providerLabel,
      model: info.model,
      text: null,
      parsed: null,
      latencyMs: Date.now() - started,
      error: classified.message,
    };
  }
}

export { Type };
