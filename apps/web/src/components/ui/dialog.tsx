import { useEffect, type ReactNode } from "react";
import { cn } from "@/lib/utils";

interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: ReactNode;
  className?: string;
}

export function Dialog({ open, onOpenChange, children, className }: DialogProps) {
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onOpenChange(false);
    }
    window.addEventListener("keydown", onKey);
    const original = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = original;
    };
  }, [open, onOpenChange]);

  return (
    <div
      className={cn(
        "fixed inset-0 z-[9999] flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-0 sm:p-4",
        "transition-all duration-200",
        open ? "opacity-100" : "pointer-events-none opacity-0",
      )}
      onClick={() => onOpenChange(false)}
    >
      <div
        className={cn(
          "relative z-[10000] w-full sm:max-w-xl rounded-t-2xl sm:rounded-2xl border border-border bg-card shadow-2xl",
          "max-h-[92dvh] sm:max-h-[85dvh] flex flex-col",
          "transition-all duration-200",
          open
            ? "opacity-100 translate-y-0 sm:scale-100"
            : "opacity-0 translate-y-4 sm:scale-95",
          className,
        )}
        onClick={(e) => e.stopPropagation()}
      >
        {/* X close button */}
        <button
          type="button"
          onClick={() => onOpenChange(false)}
          className="absolute right-3 top-3 rounded-md p-1.5 text-zinc-400 dark:text-zinc-500 opacity-50 transition-all hover:opacity-100 hover:bg-accent dark:hover:bg-zinc-800 z-10"
          aria-label="Đóng"
        >
          <svg className="h-4 w-4 dark:text-zinc-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
        {children}
      </div>
    </div>
  );
}

interface DialogHeaderProps {
  className?: string;
  children: ReactNode;
}

export function DialogHeader({ className, children }: DialogHeaderProps) {
  return (
    <div className={cn("flex-shrink-0 border-b border-border px-6 pt-5 pb-4 sm:px-8 sm:pt-6 sm:pb-4", className)}>
      {children}
    </div>
  );
}

export function DialogTitle({ children }: { children: ReactNode }) {
  return <h2 className="text-base font-semibold leading-tight tracking-tight text-foreground sm:text-lg">{children}</h2>;
}

export function DialogDescription({ children }: { children: ReactNode }) {
  return <p className="text-xs text-muted-foreground mt-1">{children}</p>;
}

export function DialogBody({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div className={cn("flex-1 overflow-y-auto px-6 py-4 sm:px-8 sm:py-5", className)}>
      {children}
    </div>
  );
}

export function DialogFooter({ className, children }: DialogHeaderProps) {
  return (
    <div className={cn("flex-shrink-0 border-t border-border px-6 pb-5 pt-4 sm:px-8 sm:pb-6", className)}>
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        {children}
      </div>
    </div>
  );
}
