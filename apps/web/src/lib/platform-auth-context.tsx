import {
  createContext,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { PlatformRole, PlatformSession, PlatformUser } from "@shared/types";
import {
  platformPost,
  setPlatformToken,
  type PlatformLoginChallenge,
  type PlatformMfaResponse,
} from "./platform-api";

interface PlatformAuthContextValue {
  session: PlatformSession | null;
  pendingChallenge: string | null;
  login: (email: string, password: string) => Promise<void>;
  verifyMfa: (code: string) => Promise<void>;
  logout: () => Promise<void>;
  hasPermission: (permission: string) => boolean;
  currentUser: PlatformUser | null;
  currentRole: PlatformRole | null;
}

const PlatformAuthContext = createContext<PlatformAuthContextValue | undefined>(undefined);

export function PlatformAuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<PlatformSession | null>(null);
  const [pendingChallenge, setPendingChallenge] = useState<string | null>(null);

  async function login(email: string, password: string) {
    const result = await platformPost<PlatformLoginChallenge>("/api/platform/auth/login", { email, password });
    setPendingChallenge(result.challenge_id);
  }

  async function verifyMfa(code: string) {
    if (!pendingChallenge) throw new Error("Phiên đăng nhập đã hết hạn");
    const result = await platformPost<PlatformMfaResponse>("/api/platform/auth/mfa/verify", {
      challenge_id: pendingChallenge,
      code,
    });
    setPlatformToken(result.session.token);
    setSession(result.session);
    setPendingChallenge(null);
  }

  async function logout() {
    try {
      await platformPost("/api/platform/auth/logout");
    } finally {
      setPlatformToken(null);
      setSession(null);
      setPendingChallenge(null);
    }
  }

  const value = useMemo<PlatformAuthContextValue>(() => ({
    session,
    pendingChallenge,
    login,
    verifyMfa,
    logout,
    hasPermission: (permission) => Boolean(session?.role.permissions.includes(permission as never)),
    currentUser: session?.user ?? null,
    currentRole: session?.role ?? null,
  }), [session, pendingChallenge]);

  return <PlatformAuthContext.Provider value={value}>{children}</PlatformAuthContext.Provider>;
}

export function usePlatformAuth(): PlatformAuthContextValue {
  const context = useContext(PlatformAuthContext);
  if (!context) throw new Error("usePlatformAuth must be used inside PlatformAuthProvider");
  return context;
}
