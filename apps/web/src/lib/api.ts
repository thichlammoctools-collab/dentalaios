/**
 * API client wrapper.
 *
 * In dev: Vite proxies /api → http://127.0.0.1:8787 (wrangler dev)
 * so the browser sees same-origin. In prod: VITE_API_URL points at deployed Worker.
 *
 * Architecture rule: frontend never talks to D1/R2 directly — only this client.
 * Auth: bearer token attached automatically when present in localStorage.
 *
 * 401 handling: any 401 response (except on login itself) clears the session and
 * redirects to /login. This prevents users from being stuck in a broken authenticated
 * state when their JWT expires mid-session.
 */

import { clearSession, getToken } from "./auth";

// Re-export so pages can grab token directly for non-JSON requests (PDF download, etc.)
export { getToken };

const BASE_URL =
  (import.meta.env.VITE_API_URL as string | undefined) ?? "";

export class ApiError extends Error {
  status: number;
  code?: string;
  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

export async function api<T = unknown>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const url = `${BASE_URL}${path}`;
  const token = getToken();

  const res = await fetch(url, {
    ...init,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init?.headers ?? {}),
    },
  });

  if (res.status === 401) {
    // Clear session but DON'T force-redirect — let the page handle the error
    // and let the user re-login manually. Forcing redirect on every 401
    // (including transient ones) is hostile UX.
    clearSession();
    let message = "Phiên đăng nhập đã hết hạn — vui lòng đăng nhập lại";
    try {
      const body = (await res.json()) as { error?: string };
      if (body?.error) message = body.error;
    } catch {
      // ignore
    }
    throw new ApiError(message, 401, "unauthorized");
  }

  if (!res.ok) {
    let message = `HTTP ${res.status} ${res.statusText}`;
    let code: string | undefined;
    try {
      const body = (await res.json()) as { error?: string; code?: string };
      if (body?.error) message = body.error;
      if (body?.code) code = body.code;
    } catch {
      // body wasn't JSON; keep default message
    }
    throw new ApiError(message, res.status, code);
  }

  // 204 No Content
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export const apiGet = <T = unknown>(path: string) => api<T>(path, { method: "GET" });
export const apiPost = <T = unknown>(path: string, body?: unknown) =>
  api<T>(path, { method: "POST", body: JSON.stringify(body ?? {}) });
export const apiPut = <T = unknown>(path: string, body?: unknown) =>
  api<T>(path, { method: "PUT", body: JSON.stringify(body ?? {}) });
export const apiPatch = <T = unknown>(path: string, body?: unknown) =>
  api<T>(path, { method: "PATCH", body: JSON.stringify(body ?? {}) });
export const apiDelete = <T = unknown>(path: string, body?: unknown) =>
  api<T>(path, { method: "DELETE", body: body != null ? JSON.stringify(body) : undefined });

/** Fetches an authenticated binary response (for private R2-backed assets). */
export async function apiBlob(path: string, init?: RequestInit): Promise<Blob> {
  const token = getToken();
  const res = await fetch(`${BASE_URL}${path}`, {
    ...init,
    credentials: "include",
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    let message = `HTTP ${res.status} ${res.statusText}`;
    try {
      const body = (await res.json()) as { error?: string };
      if (body.error) message = body.error;
    } catch {
      // Keep the HTTP status when the response is not JSON.
    }
    throw new ApiError(message, res.status);
  }
  return res.blob();
}
