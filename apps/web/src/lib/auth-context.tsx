/**
 * Auth React Context.
 *
 * - Hydrates session from localStorage SYNCHRONOUSLY in initial useState
 *   (otherwise there's a race where the first render has session=null
 *    and RequireAuth redirects to /login before useEffect can hydrate)
 * - Provides login(email, password) / logout()
 * - Exposes session, loading, error via useAuth()
 */

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { AuthSession, LoginResponse } from "@shared/types";
import { api, ApiError } from "./api";
import { clearSession, getSession, setSession } from "./auth";

interface AuthContextValue {
  session: AuthSession | null;
  loading: boolean;
  error: string | null;
  login: (email: string, password: string) => Promise<void>;
  updateSession: (session: AuthSession) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  // Sync initial state from localStorage so the first render already has the session
  // and RequireAuth doesn't redirect to /login on a hard refresh.
  const [session, setSessionState] = useState<AuthSession | null>(() => getSession());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const login = useCallback(async (email: string, password: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await api<LoginResponse>("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
      setSession(res.session);
      setSessionState(res.session);
    } catch (err) {
      const message = err instanceof ApiError ? err.message : "Đăng nhập thất bại";
      setError(message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const logout = useCallback(() => {
    // Best-effort: tell server (stateless, but logs the intent)
    void api("/api/auth/logout", { method: "POST" }).catch(() => {});
    clearSession();
    setSessionState(null);
  }, []);

  const updateSession = useCallback((nextSession: AuthSession) => {
    setSession(nextSession);
    setSessionState(nextSession);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({ session, loading, error, login, updateSession, logout }),
    [session, loading, error, login, updateSession, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
