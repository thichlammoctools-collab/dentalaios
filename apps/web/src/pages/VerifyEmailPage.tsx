import { useEffect, useState } from "react";
import { useSearchParams, Link, useNavigate } from "react-router-dom";
import { apiPost, ApiError } from "@/lib/api";
import { ROUTES } from "@shared/constants";

export function VerifyEmailPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [message, setMessage] = useState("");

  useEffect(() => {
    const token = params.get("token");
    if (!token) {
      setStatus("error");
      setMessage("Link xác thực không hợp lệ — thiếu token.");
      return;
    }

    apiPost<{ message: string; session: unknown }>("/api/register/verify", { token })
      .then((res) => {
        setStatus("success");
        setMessage(res.message);
        setTimeout(() => {
          navigate(ROUTES.LOGIN, { replace: true });
        }, 2500);
      })
      .catch((err: unknown) => {
        setStatus("error");
        setMessage(err instanceof ApiError ? err.message : "Xác thực thất bại");
      });
  }, [params, navigate]);

  return (
    <main className="grid min-h-svh place-items-center px-6">
      <div className="mx-auto w-full max-w-sm space-y-4 rounded-lg border border-border bg-card p-8 shadow-sm text-center">
        {status === "loading" && (
          <>
            <div className="mx-auto h-12 w-12 animate-spin rounded-full border-4 border-muted border-t-primary" />
            <h1 className="text-xl font-semibold">Đang xác thực email...</h1>
          </>
        )}

        {status === "success" && (
          <>
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-green-100">
              <svg className="h-6 w-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h1 className="text-xl font-semibold">Xác thực thành công!</h1>
            <p className="text-sm text-muted-foreground">{message}</p>
            <Link
              to={ROUTES.LOGIN}
              className="block w-full rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              Đăng nhập ngay
            </Link>
          </>
        )}

        {status === "error" && (
          <>
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
              <svg className="h-6 w-6 text-destructive" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </div>
            <h1 className="text-xl font-semibold">Xác thực thất bại</h1>
            <p className="text-sm text-muted-foreground">{message}</p>
            <Link
              to={ROUTES.LOGIN}
              className="block w-full rounded-md border border-input px-3 py-2 text-sm font-medium hover:bg-muted"
            >
              Quay lại đăng nhập
            </Link>
          </>
        )}
      </div>
    </main>
  );
}
