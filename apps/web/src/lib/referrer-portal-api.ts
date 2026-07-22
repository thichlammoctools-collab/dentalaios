const BASE_URL = (import.meta.env.VITE_API_URL as string | undefined) ?? "";
const PORTAL_SESSION_KEY = "dentalaios.referrer-portal-session";

export interface ReferrerPortalSession { token: string; expires_at: string; }

export class ReferrerPortalApiError extends Error {
  constructor(message: string, public readonly status: number, public readonly code?: string) { super(message); this.name = "ReferrerPortalApiError"; }
}

export function getReferrerPortalSession(): ReferrerPortalSession | null {
  try {
    const raw = localStorage.getItem(PORTAL_SESSION_KEY);
    if (!raw) return null;
    const session = JSON.parse(raw) as Partial<ReferrerPortalSession>;
    if (typeof session.token !== "string" || typeof session.expires_at !== "string" || Date.parse(session.expires_at) <= Date.now()) { localStorage.removeItem(PORTAL_SESSION_KEY); return null; }
    return session as ReferrerPortalSession;
  } catch { return null; }
}

export function setReferrerPortalSession(session: ReferrerPortalSession): void {
  try { localStorage.setItem(PORTAL_SESSION_KEY, JSON.stringify(session)); } catch { /* Storage can be unavailable. */ }
}

export function clearReferrerPortalSession(): void {
  try { localStorage.removeItem(PORTAL_SESSION_KEY); } catch { /* Storage can be unavailable. */ }
}

async function portalApi<T = unknown>(path: string, init: RequestInit = {}, authenticated = false): Promise<T> {
  const token = authenticated ? getReferrerPortalSession()?.token : undefined;
  const response = await fetch(`${BASE_URL}${path}`, { ...init, credentials: "include", headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(init.headers ?? {}) } });
  if (!response.ok) {
    let message = `HTTP ${response.status}`;
    let code: string | undefined;
    try { const body = (await response.json()) as { error?: string; code?: string }; message = body.error ?? message; code = body.code; } catch { /* Retain HTTP status. */ }
    if (response.status === 401 && authenticated) clearReferrerPortalSession();
    throw new ReferrerPortalApiError(message, response.status, code);
  }
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export const referrerPortalApi = {
  login: <T>(body: unknown) => portalApi<T>("/api/referrer-auth/login", { method: "POST", body: JSON.stringify(body) }),
  activate: <T>(body: unknown) => portalApi<T>("/api/referrer-auth/activate", { method: "POST", body: JSON.stringify(body) }),
  resetPassword: <T>(body: unknown) => portalApi<T>("/api/referrer-auth/reset-password", { method: "POST", body: JSON.stringify(body) }),
  logout: <T>() => portalApi<T>("/api/referrer-auth/logout", { method: "POST" }, true),
  me: <T>() => portalApi<T>("/api/referrer-portal/me", { method: "GET" }, true),
  dashboard: <T>() => portalApi<T>("/api/referrer-portal/dashboard", { method: "GET" }, true),
  cases: <T>() => portalApi<T>("/api/referrer-portal/cases", { method: "GET" }, true),
  rewards: <T>() => portalApi<T>("/api/referrer-portal/rewards", { method: "GET" }, true),
  vouchers: <T>() => portalApi<T>("/api/referrer-portal/vouchers", { method: "GET" }, true),
};
