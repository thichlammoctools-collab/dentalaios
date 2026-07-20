import { Navigate, useLocation } from "react-router-dom";
import type { ReactNode } from "react";
import { usePlatformAuth } from "@/lib/platform-auth-context";

export function PlatformGuard({ children }: { children: ReactNode }) {
  const { session, isRestoring } = usePlatformAuth();
  const location = useLocation();
  if (isRestoring) return <div className="grid min-h-svh place-items-center bg-[#090f1d] text-sm text-[#aabbd0]">Đang khôi phục phiên đăng nhập...</div>;
  if (!session) return <Navigate to="/platform/login" replace state={{ from: location.pathname }} />;
  if (new Date(session.expires_at).getTime() <= Date.now()) return <Navigate to="/platform/login" replace />;
  return <>{children}</>;
}
