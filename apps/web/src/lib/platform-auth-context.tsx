import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { PlatformRole, PlatformSession, PlatformUser } from "@shared/types";
import {
  platformPost,
  platformGet,
  setPlatformToken,
  type PlatformLoginChallenge,
  type PlatformMfaResponse,
} from "./platform-api";

const REMEMBERED_SESSION_KEY = "dentalaios.platform-session";

type RememberedPlatformSession = Pick<PlatformSession, "token" | "expires_at">;

function readRememberedSession(): RememberedPlatformSession | null {
  try {
    const value = localStorage.getItem(REMEMBERED_SESSION_KEY);
    if (!value) return null;
    const parsed = JSON.parse(value) as Partial<RememberedPlatformSession>;
    if (typeof parsed.token !== "string" || typeof parsed.expires_at !== "string") return null;
    if (Date.parse(parsed.expires_at) <= Date.now()) return null;
    return { token: parsed.token, expires_at: parsed.expires_at };
  } catch {
    return null;
  }
}

function clearRememberedSession(): void {
  try {
    localStorage.removeItem(REMEMBERED_SESSION_KEY);
  } catch {
    // Storage may be disabled by browser policy.
  }
}

function persistSession(session: PlatformSession): void {
  try {
    localStorage.setItem(
      REMEMBERED_SESSION_KEY,
      JSON.stringify({ token: session.token, expires_at: session.expires_at }),
    );
  } catch {
    // The authenticated in-memory session remains available.
  }
}

interface PlatformAuthContextValue {
  session: PlatformSession | null;
  pendingChallenge: string | null;
  mfaEnrollment: { secret: string; otpauthUri: string } | null;
  isRestoring: boolean;
  login: (email: string, password: string, remember: boolean) => Promise<void>;
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
  const [mfaEnrollment, setMfaEnrollment] = useState<{ secret: string; otpauthUri: string } | null>(null);
  const [rememberLogin, setRememberLogin] = useState(false);
  const [isRestoring, setIsRestoring] = useState(true);

  useEffect(() => {
    let active = true;
    const remembered = readRememberedSession();
    if (!remembered) {
      clearRememberedSession();
      setIsRestoring(false);
      return () => { active = false; };
    }

    setPlatformToken(remembered.token);
    void platformGet<{ user: PlatformUser; role: PlatformRole }>("/api/platform/auth/me")
      .then(({ user, role }) => {
        if (!active) return;
        setSession({ ...remembered, user, role });
      })
      .catch(() => {
        if (!active) return;
        setPlatformToken(null);
        clearRememberedSession();
      })
      .finally(() => {
        if (active) setIsRestoring(false);
      });

    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!session) return;
    const delay = Date.parse(session.expires_at) - Date.now();
    if (delay <= 0) {
      setPlatformToken(null);
      clearRememberedSession();
      setSession(null);
      return;
    }
    const timeout = window.setTimeout(() => {
      setPlatformToken(null);
      clearRememberedSession();
      setSession(null);
    }, delay);
    return () => window.clearTimeout(timeout);
  }, [session]);

  async function login(email: string, password: string, remember: boolean) {
    const result = await platformPost<PlatformLoginChallenge>("/api/platform/auth/login", { email, password });
    setPendingChallenge(result.challenge_id);
    setRememberLogin(remember);
    setMfaEnrollment(
      result.mfa_enrollment_required && result.secret && result.otpauth_uri
        ? { secret: result.secret, otpauthUri: result.otpauth_uri }
        : null,
    );
  }

  async function verifyMfa(code: string) {
    if (!pendingChallenge) throw new Error("Phiên đăng nhập đã hết hạn");
    const result = await platformPost<PlatformMfaResponse>("/api/platform/auth/mfa/verify", {
      challenge_id: pendingChallenge,
      code,
    });
    setPlatformToken(result.session.token);
    setSession(result.session);
    if (rememberLogin) persistSession(result.session);
    else clearRememberedSession();
    setPendingChallenge(null);
    setMfaEnrollment(null);
    setRememberLogin(false);
  }

  async function logout() {
    try {
      await platformPost("/api/platform/auth/logout");
    } finally {
      setPlatformToken(null);
      clearRememberedSession();
      setSession(null);
      setPendingChallenge(null);
      setMfaEnrollment(null);
      setRememberLogin(false);
    }
  }

  const value = useMemo<PlatformAuthContextValue>(() => ({
    session,
    pendingChallenge,
    mfaEnrollment,
    isRestoring,
    login,
    verifyMfa,
    logout,
    hasPermission: (permission) => Boolean(session?.role.permissions.includes(permission as never)),
    currentUser: session?.user ?? null,
    currentRole: session?.role ?? null,
  }), [session, pendingChallenge, mfaEnrollment, isRestoring]);

  return <PlatformAuthContext.Provider value={value}>{children}</PlatformAuthContext.Provider>;
}

export function usePlatformAuth(): PlatformAuthContextValue {
  const context = useContext(PlatformAuthContext);
  if (!context) throw new Error("usePlatformAuth must be used inside PlatformAuthProvider");
  return context;
}
