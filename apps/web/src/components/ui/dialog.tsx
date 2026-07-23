import { useEffect, type ReactNode } from "react";
import { cn } from "@/lib/utils";

interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: ReactNode;
  className?: string;
  size?: "sm" | "md" | "lg" | "workspace";
}

const sizeClasses = {
  sm: "lg:max-w-xl",
  md: "lg:max-w-2xl",
  lg: "lg:max-w-4xl",
  workspace: "lg:max-w-5xl xl:max-w-6xl 2xl:max-w-[80rem]",
} as const;

export function Dialog({ open, onOpenChange, children, className, size = "lg" }: DialogProps) {
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
        "fixed inset-0 z-[9999] flex items-end lg:items-center justify-center bg-black/60 backdrop-blur-sm p-0 lg:p-6",
        "transition-all duration-200",
        open ? "opacity-100" : "pointer-events-none opacity-0",
      )}
      onClick={(event) => {
        // Only a direct click on the backdrop closes the dialog. Content can
        // re-render during its click handler without leaking that click here.
        if (event.target === event.currentTarget) onOpenChange(false);
      }}
    >
      <div
        className={cn(
          "relative z-[10000] flex w-full flex-col rounded-t-2xl border border-border bg-card shadow-2xl lg:max-h-[90dvh] lg:rounded-2xl",
          "max-h-[94dvh]",
          "transition-all duration-200",
          open
            ? "opacity-100 translate-y-0 lg:scale-100"
            : "opacity-0 translate-y-4 lg:scale-95",
          sizeClasses[size],
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
    <div className={cn("flex-shrink-0 border-b border-border px-5 pb-4 pt-5 lg:px-8 lg:pb-4 lg:pt-6", className)}>
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
    <div className={cn("flex-1 overflow-y-auto px-5 py-4 lg:px-8 lg:py-5", className)}>
      {children}
    </div>
  );
}

export function DialogFooter({ className, children }: DialogHeaderProps) {
  return (
    <div className={cn("flex-shrink-0 border-t border-border px-5 pb-5 pt-4 lg:px-8 lg:pb-6", className)}>
      <div className="flex flex-col-reverse gap-2 lg:flex-row lg:justify-end">
        {children}
      </div>
    </div>
  );
}
