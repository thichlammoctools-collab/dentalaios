import { FormEvent, useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PlatformApiError } from "@/lib/platform-api";
import { usePlatformAuth } from "@/lib/platform-auth-context";

export function PlatformLoginPage() {
  const { session, pendingChallenge, mfaEnrollment, isRestoring, login, verifyMfa } = usePlatformAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(false);
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const destination = (location.state as { from?: string } | null)?.from ?? "/platform/dashboard";
  if (isRestoring) return <div className="grid min-h-svh place-items-center bg-[#090f1d] text-sm text-slate-400">Đang kiểm tra phiên đăng nhập...</div>;
  if (session) return <Navigate to={destination} replace />;

  async function submitCredentials(event: FormEvent) {
    event.preventDefault(); setLoading(true); setError(null);
    try { await login(email, password, remember); } catch (cause) { setError(cause instanceof PlatformApiError ? cause.message : "Không thể đăng nhập"); } finally { setLoading(false); }
  }
  async function submitMfa(event: FormEvent) {
    event.preventDefault(); setLoading(true); setError(null);
    try { await verifyMfa(code); navigate(destination, { replace: true }); } catch (cause) { setError(cause instanceof PlatformApiError ? cause.message : "Mã xác thực không hợp lệ"); } finally { setLoading(false); }
  }

  return <div className="grid min-h-svh place-items-center bg-[radial-gradient(circle_at_top,_#164e63,_#020617_52%)] p-5"><Card className="w-full max-w-md border-white/10 bg-slate-950/80 text-slate-100 shadow-2xl backdrop-blur"><CardHeader><div className="mb-3 grid h-10 w-10 place-items-center rounded-xl bg-cyan-400 font-bold text-slate-950">D</div><CardTitle>Platform Control</CardTitle><CardDescription className="text-slate-400">Khu vực quản trị nền tảng. Tài khoản phòng khám không thể truy cập.</CardDescription></CardHeader><CardContent>{pendingChallenge ? <form onSubmit={submitMfa} className="space-y-4">{mfaEnrollment && <div className="rounded-lg border border-cyan-400/30 bg-cyan-400/10 p-3 text-sm"><p className="font-medium text-cyan-200">Thiết lập TOTP lần đầu</p><p className="mt-1 text-xs text-slate-300">Thêm khóa này vào ứng dụng xác thực. Khóa chỉ hiển thị trong bước đăng nhập này.</p><code className="mt-2 block break-all rounded bg-slate-950 p-2 text-xs text-cyan-100">{mfaEnrollment.secret}</code></div>}<div className="space-y-2"><Label htmlFor="mfa">Mã xác thực 6 số</Label><Input id="mfa" inputMode="numeric" autoComplete="one-time-code" value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))} required className="border-slate-700 bg-slate-900" /></div><p className="text-xs text-slate-400">Xác thực TOTP là bắt buộc để mở phiên quản trị.</p>{error && <p role="alert" className="text-sm text-red-300">{error}</p>}<Button type="submit" className="w-full bg-cyan-400 text-slate-950 hover:bg-cyan-300" disabled={loading}>{loading ? "Đang xác thực..." : "Xác thực"}</Button></form> : <form onSubmit={submitCredentials} className="space-y-4"><div className="space-y-2"><Label htmlFor="email">Email</Label><Input id="email" type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required className="border-slate-700 bg-slate-900" /></div><div className="space-y-2"><Label htmlFor="password">Mật khẩu</Label><Input id="password" type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required className="border-slate-700 bg-slate-900" /></div>{error && <p role="alert" className="text-sm text-red-300">{error}</p>}<Button type="submit" className="w-full bg-cyan-400 text-slate-950 hover:bg-cyan-300" disabled={loading}>{loading ? "Đang kiểm tra..." : "Tiếp tục"}</Button></form>}</CardContent></Card></div>;
}
