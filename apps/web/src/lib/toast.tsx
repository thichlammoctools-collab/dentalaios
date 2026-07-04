/**
 * Simple toast system. No external dep.
 *
 * Usage:
 *   import { toast } from "@/lib/toast";
 *   toast.success("Đã lưu");
 *   toast.error("Lỗi");
 *
 *   // or via hook (preferred in components):
 *   const { show } = useToast();
 *   show("Đã lưu");
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { cn } from "@/lib/utils";

type ToastKind = "success" | "error" | "info";

interface Toast {
  id: string;
  kind: ToastKind;
  message: string;
}

interface ToastContextValue {
  show: (message: string, kind?: ToastKind) => void;
}

const Ctx = createContext<ToastContextValue | undefined>(undefined);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);

  const show = useCallback((message: string, kind: ToastKind = "info") => {
    const id = crypto.randomUUID();
    setItems((prev) => [...prev, { id, message, kind }]);
    setTimeout(() => {
      setItems((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  }, []);

  // Listen for global toast events so utility code can fire toasts.
  useEffect(() => {
    function onToast(e: Event) {
      const detail = (e as CustomEvent<{ message: string; kind: ToastKind }>).detail;
      if (detail?.message) show(detail.message, detail.kind);
    }
    window.addEventListener("dentalaios:toast", onToast);
    return () => window.removeEventListener("dentalaios:toast", onToast);
  }, [show]);

  return (
    <Ctx.Provider value={{ show }}>
      {children}
      <div className="pointer-events-none fixed bottom-4 right-4 z-[100] flex w-full max-w-sm flex-col gap-2">
        {items.map((t) => (
          <div
            key={t.id}
            className={cn(
              "pointer-events-auto rounded-md border px-4 py-3 text-sm shadow-md",
              t.kind === "success" && "border-emerald-300 bg-emerald-50 text-emerald-900",
              t.kind === "error" && "border-red-300 bg-red-50 text-red-900",
              t.kind === "info" && "border-border bg-card text-foreground",
            )}
          >
            {t.message}
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useToast must be inside <ToastProvider>");
  return ctx;
}

export const toast = {
  success: (message: string) =>
    window.dispatchEvent(
      new CustomEvent("dentalaios:toast", { detail: { message, kind: "success" } }),
    ),
  error: (message: string) =>
    window.dispatchEvent(
      new CustomEvent("dentalaios:toast", { detail: { message, kind: "error" } }),
    ),
  info: (message: string) =>
    window.dispatchEvent(
      new CustomEvent("dentalaios:toast", { detail: { message, kind: "info" } }),
    ),
};