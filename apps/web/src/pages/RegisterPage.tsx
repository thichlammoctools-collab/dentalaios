import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { apiPost, ApiError } from "@/lib/api";
import { ROUTES } from "@shared/constants";
import { registerSchema } from "@shared/validation";

export function RegisterPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [verifyToken, setVerifyToken] = useState<string | null>(null);

  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    confirmPassword: "",
    clinic_name: "",
    branch_name: "",
  });

  function update(field: keyof typeof form, value: string) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    if (form.password !== form.confirmPassword) {
      setError("Mật khẩu xác nhận không khớp");
      return;
    }

    const data = {
      name: form.name.trim(),
      email: form.email.trim().toLowerCase(),
      password: form.password,
      clinic_name: form.clinic_name.trim(),
      branch_name: form.branch_name.trim() || undefined,
    };
    const validation = registerSchema.safeParse(data);
    if (!validation.success) {
      setError(validation.error.issues[0]?.message ?? "Thông tin đăng ký không hợp lệ");
      return;
    }

    setLoading(true);
    try {
      const res = await apiPost<{ verify_token: string; message: string }>(
        "/api/register",
        validation.data,
      );
      setVerifyToken(res.verify_token);
      setSuccess(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Đăng ký thất bại");
    } finally {
      setLoading(false);
    }
  }

  if (success && verifyToken) {
    return (
      <main className="grid min-h-svh place-items-center px-6">
        <div className="mx-auto w-full max-w-sm space-y-4 rounded-lg border border-border bg-card p-8 shadow-sm text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-green-100">
            <svg className="h-6 w-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h1 className="text-xl font-semibold">Đăng ký thành công!</h1>
          <p className="text-sm text-muted-foreground">
            Chúng tôi đã gửi một email xác thực đến <strong>{form.email}</strong>.
            Vui lòng kiểm tra hộp thư và nhấn link trong email để kích hoạt tài khoản.
          </p>
          <div className="rounded-md bg-muted p-3 text-left">
            <p className="text-xs text-muted-foreground mb-1">Link xác thực (dev mode):</p>
            <a
              href={`/verify-email?token=${verifyToken}`}
              className="text-xs text-blue-600 break-all"
            >
              {`${window.location.origin}/verify-email?token=${verifyToken}`}
            </a>
          </div>
          <Link
            to={ROUTES.LOGIN}
            className="block w-full rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground text-center hover:bg-primary/90"
          >
            Quay lại đăng nhập
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="grid min-h-svh place-items-center px-4">
      <div className="w-full max-w-md space-y-4 rounded-lg border border-border bg-card p-8 shadow-sm">
        <div className="text-center">
          <h1 className="text-2xl font-semibold tracking-tight">Tạo tài khoản</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Đăng ký phòng khám của bạn — miễn phí
          </p>
        </div>

        <form onSubmit={onSubmit} className="space-y-4">
          <fieldset className="space-y-3">
            <legend className="text-sm font-semibold">Thông tin cá nhân</legend>

            <div className="space-y-1.5">
              <label htmlFor="name" className="text-sm font-medium">Họ và tên</label>
              <input
                id="name"
                type="text"
                required
                value={form.name}
                onChange={(e) => update("name", e.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/40"
                placeholder="Nguyễn Văn A"
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="email" className="text-sm font-medium">Email</label>
              <input
                id="email"
                type="email"
                required
                value={form.email}
                onChange={(e) => update("email", e.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/40"
                placeholder="you@clinic.com"
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
                  placeholder="Ít nhất 8 ký tự"
                />
                <p className="text-xs text-muted-foreground">Gồm chữ hoa, chữ thường và số.</p>
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
                  placeholder="Nhập lại"
                />
              </div>
            </div>
          </fieldset>

          <fieldset className="space-y-3">
            <legend className="text-sm font-semibold">Thông tin phòng khám</legend>

            <div className="space-y-1.5">
              <label htmlFor="clinic_name" className="text-sm font-medium">
                Tên phòng khám <span className="text-destructive">*</span>
              </label>
              <input
                id="clinic_name"
                type="text"
                required
                value={form.clinic_name}
                onChange={(e) => update("clinic_name", e.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/40"
                placeholder="Nha Khoa ABC"
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="branch_name" className="text-sm font-medium">Chi nhánh đầu tiên</label>
              <input
                id="branch_name"
                type="text"
                value={form.branch_name}
                onChange={(e) => update("branch_name", e.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/40"
                placeholder="Chi nhánh chính (tùy chọn)"
              />
            </div>
          </fieldset>

          {error && (
            <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
          >
            {loading ? "Đang đăng ký..." : "Tạo tài khoản"}
          </button>
        </form>

        <p className="text-center text-sm text-muted-foreground">
          Đã có tài khoản?{" "}
          <Link to={ROUTES.LOGIN} className="text-primary hover:underline font-medium">
            Đăng nhập
          </Link>
        </p>
      </div>
    </main>
  );
}
