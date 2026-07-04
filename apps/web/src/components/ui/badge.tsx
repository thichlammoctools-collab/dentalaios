import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

type Variant = "default" | "outline" | "secondary" | "destructive" | "success" | "warning";

const variants: Record<Variant, string> = {
  default: "bg-primary text-primary-foreground",
  outline: "border border-border text-foreground",
  secondary: "bg-secondary text-secondary-foreground",
  destructive: "bg-destructive text-destructive-foreground",
  success: "bg-emerald-600 text-white",
  warning: "bg-amber-500 text-white",
};

interface BadgeProps extends HTMLAttributes<HTMLDivElement> {
  variant?: Variant;
}

export function Badge({ className, variant = "default", ...props }: BadgeProps) {
  return (
    <div
      className={cn(
        "inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium",
        variants[variant],
        className,
      )}
      {...props}
    />
  );
}