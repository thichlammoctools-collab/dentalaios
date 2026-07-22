import { useState, type FormEvent } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { ROUTES } from "@shared/constants";
import { Button } from "@/components/ui/button";
import { ReferrerPortalApiError, referrerPortalApi, setReferrerPortalSession, type ReferrerPortalSession } from "@/lib/referrer-portal-api";
import { PortalBackToLogin, PortalFrame, PortalHeading } from "./ReferrerPortalLoginPage";

export function ReferrerPortalActivatePage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [token, setToken] = useState(searchParams.get("token") ?? "");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (password.length < 8) { setError("Mật khẩu phải có ít nhất 8 ký tự"); return; }
    if (password !== confirmPassword) { setError("Xác nhận mật khẩu chưa khớp"); return; }
    setLoading(true); setError(null);
    try { const response = await referrerPortalApi.activate<{ session?: ReferrerPortalSession } & Partial<ReferrerPortalSession>>({ token, password }); const session = response.session ?? response; if (session.token && session.expires_at) setReferrerPortalSession({ token: session.token, expires_at: session.expires_at }); navigate(ROUTES.REFERRER_PORTAL, { replace: true }); }
    catch (cause) { setError(cause instanceof ReferrerPortalApiError || cause instanceof Error ? cause.message : "Không thể kích hoạt tài khoản"); }
    finally { setLoading(false); }
  }
  return <PortalFrame><form onSubmit={submit} className="space-y-4"><PortalHeading title="Kích hoạt tài khoản" description="Đặt mật khẩu để truy cập cổng Người giới thiệu." /><label className="grid gap-1.5 text-sm font-medium">Mã kích hoạt<input required value={token} onChange={(event) => setToken(event.target.value)} className="rounded-md border border-input bg-background px-3 py-2 font-mono text-xs" /></label><label className="grid gap-1.5 text-sm font-medium">Mật khẩu mới<input required minLength={8} type="password" autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} className="rounded-md border border-input bg-background px-3 py-2" /></label><label className="grid gap-1.5 text-sm font-medium">Xác nhận mật khẩu<input required minLength={8} type="password" autoComplete="new-password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} className="rounded-md border border-input bg-background px-3 py-2" /></label>{error && <p role="alert" className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}<Button type="submit" disabled={loading} className="w-full">{loading ? "Đang kích hoạt..." : "Kích hoạt tài khoản"}</Button><PortalBackToLogin /></form></PortalFrame>;
}
