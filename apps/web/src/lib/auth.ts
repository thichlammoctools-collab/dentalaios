/**
 * Auth token storage helpers.
 *
 * Architecture rule #1: frontend only talks to Worker via api client.
 * Token storage: localStorage (simple, OK for MVP). Production should consider
 * httpOnly cookies + CSRF tokens — defer to Phase 5.
 */

import type { AuthSession } from "@shared/types";

const TOKEN_KEY = "dentalaios.token";
const SESSION_KEY = "dentalaios.session";

export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setToken(token: string): void {
  try {
    localStorage.setItem(TOKEN_KEY, token);
  } catch {
    // ignore quota errors
  }
}

export function getSession(): AuthSession | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const session = JSON.parse(raw) as AuthSession;
    // Check expiry
    if (new Date(session.expires_at).getTime() < Date.now()) {
      clearSession();
      return null;
    }
    return session;
  } catch {
    return null;
  }
}

export function setSession(session: AuthSession): void {
  try {
    localStorage.setItem(TOKEN_KEY, session.token);
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  } catch {
    // ignore
  }
}

export function clearSession(): void {
  try {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(SESSION_KEY);
  } catch {
    // ignore
  }
}