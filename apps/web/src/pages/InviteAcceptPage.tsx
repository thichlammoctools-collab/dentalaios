import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { apiPost, ApiError } from "@/lib/api";
import { ROUTES } from "@shared/constants";
import { useAuth } from "@/lib/auth-context";
import { setSession } from "@/lib/auth";

export function InviteAcceptPage() {
  const { token } = useParams<{ token: string }>();
  const { login } = useAuth();
  const [step, setStep] = useState<"loading" | "form" | "success" | "error">("loading");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({ name: "", password: "", confirmPassword: "" });
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      setStep("error");
      setMessage("Link mời không hợp lệ — thiếu token.");
    } else {
      setStep("form");
    }
  }, [token]);

  function update(field: keyof typeof form, value: string) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);

    if (!token) return;

    if (form.password !== form.confirmPassword) {
      setFormError("Mật khẩu xác nhận không khớp");
      return;
    }

    setLoading(true);
    try {
      const res = await apiPost<{ message: string; session: unknown }>(
        "/api/invite/accept",
        { token, name: form.name.trim(), password: form.password },
      );
      setSession(res.session as never);
      setStep("success");
      setTimeout(() => {
        window.location.href = ROUTES.TODAY;
      }, 1500);
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "Chấp nhận lời mời thất bại");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="grid min-h-svh place-items-center px-4">
      <div className="w-full max-w-sm space-y-4 rounded-lg border border-border bg-card p-8 shadow-sm">
        {step === "loading" && (
          <div className="flex justify-center py-8">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-muted border-t-primary" />
          </div>
        )}

        {step === "error" && (
          <div className="text-center space-y-4">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
              <svg className="h-6 w-6 text-destructive" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </div>
            <h1 className="text-xl font-semibold">Link không hợp lệ</h1>
            <p className="text-sm text-muted-foreground">{message}</p>
            <Link to={ROUTES.LOGIN} className="block w-full rounded-md border border-input px-3 py-2 text-sm font-medium text-center hover:bg-muted">
              Đăng nhập
            </Link>
          </div>
        )}

        {step === "success" && (
          <div className="text-center space-y-4">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-green-100">
              <svg className="h-6 w-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h1 className="text-xl font-semibold">Chào mừng!</h1>
            <p className="text-sm text-muted-foreground">
              Tài khoản đã được tạo. Đang chuyển đến dashboard...
            </p>
          </div>
        )}

        {step === "form" && (
          <>
            <div className="text-center">
              <h1 className="text-xl font-semibold">Chấp nhận lời mời</h1>
              <p className="text-sm text-muted-foreground mt-1">
                Tạo tài khoản thành viên cho phòng khám
              </p>
            </div>

            <form onSubmit={onSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <label htmlFor="name" className="text-sm font-medium">Họ và tên</label>
                <input
                  id="name"
                  type="text"
                  required
                  value={form.name}
                  onChange={(e) => update("name", e.target.value)}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/40"
                  placeholder="Nguyễn Văn B"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label htmlFor="password" className="text-sm font-medium">Mật khẩu</label>
                  <input
                    id="password"
                    type="password"
                    required
                    value={form.password}
                    onChange={(e) => update("password", e.target.value)}
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/40"
                  />
                </div>
                <div className="space-y-1.5">
                  <label htmlFor="confirmPassword" className="text-sm font-medium">Xác nhận</label>
                  <input
                    id="confirmPassword"
                    type="password"
                    required
                    value={form.confirmPassword}
                    onChange={(e) => update("confirmPassword", e.target.value)}
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/40"
                  />
                </div>
              </div>

              {formError && (
                <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  {formError}
                </p>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                {loading ? "Đang tạo tài khoản..." : "Tạo tài khoản"}
              </button>
            </form>
          </>
        )}
      </div>
    </main>
  );
}
