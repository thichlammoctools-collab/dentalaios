import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

type Variant = "default" | "outline" | "secondary" | "destructive" | "success" | "warning";

const variants: Record<Variant, string> = {
  default: "bg-primary text-primary-foreground",
  outline: "border border-border text-foreground bg-transparent",
  secondary: "bg-secondary text-secondary-foreground",
  destructive: "bg-destructive text-destructive-foreground",
  success: "bg-emerald-600 text-white",
  warning: "bg-amber-500 text-white",
};

const outlineColors: Record<string, string> = {
  success: "border-emerald-500 text-emerald-700 bg-emerald-50",
  warning: "border-amber-500 text-amber-700 bg-amber-50",
  destructive: "border-destructive text-destructive bg-destructive/10",
  secondary: "border-secondary text-secondary-foreground bg-secondary/50",
};

interface BadgeProps extends HTMLAttributes<HTMLDivElement> {
  variant?: Variant;
}

export function Badge({ className, variant = "default", color, ...props }: BadgeProps & { color?: string }) {
  const base = variants[variant];
  const outline = variant === "outline" && color ? outlineColors[color] : undefined;
  return (
    <div
      className={cn(
        "inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium",
        outline ?? base,
        className,
      )}
      {...props}
    />
  );
}