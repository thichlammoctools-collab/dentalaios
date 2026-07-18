import { Navigate, useLocation } from "react-router-dom";
import type { ReactNode } from "react";
import { useAuth } from "@/lib/auth-context";
import { ROUTES } from "@shared/constants";
import { clearSession } from "@/lib/auth";

interface RequireAuthProps {
  children: ReactNode;
}

/**
 * Route guard. Wraps protected routes.
 * - If no session: redirect to /login
 * - If session expired: clear, redirect to /login
 */
export function RequireAuth({ children }: RequireAuthProps) {
  const { session } = useAuth();
  const location = useLocation();

  if (!session) {
    return <Navigate to={ROUTES.LOGIN} replace state={{ from: location.pathname }} />;
  }

  // Session storage validates expiry on initial hydration, but a user may keep
  // a tab open past expiry. Check again on render before exposing protected UI.
  if (new Date(session.expires_at).getTime() <= Date.now()) {
    clearSession();
    return <Navigate to={ROUTES.LOGIN} replace state={{ from: location.pathname }} />;
  }

  return <>{children}</>;
}
