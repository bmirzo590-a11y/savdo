import { AuthSessionState } from '../types/trading';

let activeAuthSession: AuthSessionState | null = null;
let unauthorizedHandler: (() => void) | null = null;

export function setAuthSessionMemory(session: AuthSessionState | null): void {
  activeAuthSession = session;
}

export function getAuthSessionMemory(): AuthSessionState | null {
  return activeAuthSession;
}

export function registerUnauthorizedHandler(handler: (() => void) | null): void {
  unauthorizedHandler = handler;
}

export async function apiFetch(input: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers ?? {});
  const method = (init.method ?? 'GET').toUpperCase();

  if (activeAuthSession?.token) {
    headers.set('Authorization', `Bearer ${activeAuthSession.token}`);
  }
  if (method !== 'GET' && method !== 'HEAD' && activeAuthSession?.csrfToken) {
    headers.set('X-CSRF-Token', activeAuthSession.csrfToken);
  }
  if (init.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const res = await fetch(input, {
    ...init,
    headers,
  });

  if (res.status === 401 && activeAuthSession && !input.startsWith('/api/auth/owner-verify')) {
    activeAuthSession = null;
    if (unauthorizedHandler) {
      unauthorizedHandler();
    }
  }

  return res;
}

export async function apiJson<T>(input: string, init: RequestInit = {}): Promise<T> {
  const res = await apiFetch(input, init);
  const data = (await res.json().catch(() => ({}))) as T & { error?: string; code?: string };
  if (!res.ok) {
    const err = new Error(data.error || `HTTP ${res.status}`) as Error & {
      status?: number;
      code?: string;
    };
    err.status = res.status;
    err.code = data.code;
    throw err;
  }
  return data;
}
