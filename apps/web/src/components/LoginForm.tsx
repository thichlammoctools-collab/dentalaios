import { useEffect, useRef, useState, type FormEvent } from "react";
import { useNavigate, Link, useSearchParams } from "react-router-dom";
import { useAuth } from "@/lib/auth-context";
import { ROUTES } from "@shared/constants";
import { ApiError } from "@/lib/api";

export function LoginForm() {
  const { login, loading, error } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const demoRequested = searchParams.get("demo") === "owner";
  const [email, setEmail] = useState(() => demoRequested ? "admin@demo.clinic" : "");
  const [password, setPassword] = useState(() => demoRequested ? "password123" : "");
  const [showPassword, setShowPassword] = useState(false);
  const [highlightDemo, setHighlightDemo] = useState(false);
  const emailRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!demoRequested) { setHighlightDemo(false); return; }
    setEmail("admin@demo.clinic");
    setPassword("password123");
    setHighlightDemo(true);
    const timeout = window.setTimeout(() => setHighlightDemo(false), 600);
    const focus = window.setTimeout(() => emailRef.current?.focus(), 0);
    return () => { window.clearTimeout(timeout); window.clearTimeout(focus); };
  }, [demoRequested]);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    try {
      await login(email.trim(), password);
      navigate(ROUTES.TODAY, { replace: true });
    } catch (err) {
      // Error is surfaced via auth context; nothing to do here.
      if (!(err instanceof ApiError)) throw err;
    }
  }

  return (
    <form
      onSubmit={onSubmit}
      className="mx-auto w-full max-w-sm space-y-4 rounded-lg border border-border bg-card p-8 shadow-sm"
    >
      <h1 className="text-2xl font-semibold tracking-tight">Đăng nhập</h1>
      <p className="text-sm text-muted-foreground">
        {demoRequested ? "Tài khoản chủ phòng khám demo đã được điền sẵn. Bạn có thể trải nghiệm toàn bộ luồng vận hành." : "Đăng nhập bằng email và mật khẩu được cấp."}
      </p>

      {demoRequested && <p className="motion-enter rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-800 dark:text-amber-200">Bạn đang truy cập môi trường demo với dữ liệu mô phỏng. Có toàn quyền vận hành, nhưng không thể gửi email, đồng bộ LarkSuite hoặc xóa dữ liệu dùng chung.</p>}

      <div className="space-y-1.5">
        <label htmlFor="email" className="text-sm font-medium">
          Email
        </label>
        <input
          id="email"
          ref={emailRef}
          type="email"
          autoComplete="username"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className={`w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/40${highlightDemo ? " motion-highlight" : ""}`}
          placeholder="admin@demo.clinic"
        />
      </div>

      <div className="space-y-1.5">
        <label htmlFor="password" className="text-sm font-medium">
          Mật khẩu
        </label>
        <div className="relative">
          <input
            id="password"
            type={showPassword ? "text" : "password"}
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={`w-full rounded-md border border-input bg-background px-3 py-2 pr-10 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/40${highlightDemo ? " motion-highlight" : ""}`}
          />
          <button
            type="button"
            tabIndex={-1}
            onClick={() => setShowPassword((v) => !v)}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            aria-label={showPassword ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
          >
            {showPassword ? (
              /* eye-off */
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" />
                <path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68" />
                <path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61" />
                <line x1="2" x2="22" y1="2" y2="22" />
              </svg>
            ) : (
              /* eye */
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
                <circle cx="12" cy="12" r="3" />
              </svg>
            )}
          </button>
        </div>
      </div>

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
        {loading ? "Đang đăng nhập..." : "Đăng nhập"}
      </button>

      {!demoRequested && <Link to="/login?demo=owner" className="block rounded-md border border-primary/30 px-3 py-2 text-center text-sm font-medium text-primary transition-colors hover:bg-primary/10">Trải nghiệm demo với vai trò Chủ phòng khám</Link>}

      <p className="text-center text-sm text-muted-foreground">
        Chưa có tài khoản?{" "}
        <Link to="/register" className="text-primary hover:underline font-medium">
          Đăng ký miễn phí
        </Link>
      </p>

    </form>
  );
}
