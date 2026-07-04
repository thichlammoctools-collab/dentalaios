import { useEffect, type ReactNode } from "react";
import { cn } from "@/lib/utils";

interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: ReactNode;
}

export function Dialog({ open, onOpenChange, children }: DialogProps) {
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onOpenChange(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onOpenChange]);

  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={() => onOpenChange(false)}
    >
      <div
        className="relative z-10 w-full max-w-lg rounded-lg border border-border bg-card p-6 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
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
  return <div className={cn("mb-4 flex flex-col gap-1.5", className)}>{children}</div>;
}

export function DialogTitle({ children }: { children: ReactNode }) {
  return <h2 className="text-lg font-semibold leading-none tracking-tight">{children}</h2>;
}

export function DialogDescription({ children }: { children: ReactNode }) {
  return <p className="text-sm text-muted-foreground">{children}</p>;
}

export function DialogFooter({ className, children }: DialogHeaderProps) {
  return (
    <div className={cn("mt-6 flex justify-end gap-2", className)}>{children}</div>
  );
}