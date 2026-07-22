import { useState, type FormEvent } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { ROUTES } from "@shared/constants";
import { Button } from "@/components/ui/button";
import { ReferrerPortalApiError, getReferrerPortalSession, referrerPortalApi, setReferrerPortalSession, type ReferrerPortalSession } from "@/lib/referrer-portal-api";

function saveLogin(response: { session?: ReferrerPortalSession } & Partial<ReferrerPortalSession>) {
  const session = response.session ?? response;
  if (!session.token || !session.expires_at) throw new Error("Phản hồi đăng nhập portal không đầy đủ");
  setReferrerPortalSession({ token: session.token, expires_at: session.expires_at });
}

export function ReferrerPortalLoginPage() {
  const navigate = useNavigate();
  const [clinicSlug, setClinicSlug] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (getReferrerPortalSession()) return <Navigate to={ROUTES.REFERRER_PORTAL} replace />;
  async function submit(event: FormEvent) { event.preventDefault(); setLoading(true); setError(null); try { const response = await referrerPortalApi.login<{ session?: ReferrerPortalSession } & Partial<ReferrerPortalSession>>({ clinic_slug: clinicSlug.trim(), email: email.trim(), password }); saveLogin(response); navigate(ROUTES.REFERRER_PORTAL, { replace: true }); } catch (cause) { setError(cause instanceof ReferrerPortalApiError || cause instanceof Error ? cause.message : "Không thể đăng nhập"); } finally { setLoading(false); } }
  return <PortalFrame><form onSubmit={submit} className="space-y-4"><PortalHeading title="Cổng Người giới thiệu" description="Theo dõi mã giới thiệu, lượt và phần thưởng của bạn." /><label className="grid gap-1.5 text-sm font-medium">Mã phòng khám<input required autoComplete="organization" value={clinicSlug} onChange={(event) => setClinicSlug(event.target.value)} placeholder="vd: nha-khoa-abc" className="rounded-md border border-input bg-background px-3 py-2" /></label><label className="grid gap-1.5 text-sm font-medium">Email<input required type="email" autoComplete="username" value={email} onChange={(event) => setEmail(event.target.value)} className="rounded-md border border-input bg-background px-3 py-2" /></label><label className="grid gap-1.5 text-sm font-medium">Mật khẩu<input required type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} className="rounded-md border border-input bg-background px-3 py-2" /></label>{error && <p role="alert" className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}<Button type="submit" disabled={loading} className="w-full">{loading ? "Đang đăng nhập..." : "Đăng nhập"}</Button><p className="text-center text-xs text-muted-foreground">Bạn nhận được link kích hoạt hoặc đặt lại mật khẩu từ phòng khám.</p></form></PortalFrame>;
}

export function PortalFrame({ children }: { children: React.ReactNode }) { return <main className="grid min-h-svh place-items-center bg-[radial-gradient(circle_at_top,_var(--color-primary)_0%,_transparent_38%)] p-5"><div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-xl sm:p-8">{children}</div></main>; }
export function PortalHeading({ title, description }: { title: string; description: string }) { return <div className="mb-6"><div className="mb-4 grid h-10 w-10 place-items-center rounded-xl bg-primary font-bold text-primary-foreground">D</div><h1 className="text-2xl font-semibold tracking-tight">{title}</h1><p className="mt-1 text-sm text-muted-foreground">{description}</p></div>; }
export function PortalBackToLogin() { return <p className="mt-5 text-center text-sm text-muted-foreground"><Link to={ROUTES.REFERRER_LOGIN} className="font-medium text-primary hover:underline">Quay lại đăng nhập</Link></p>; }
