import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

type Variant = "default" | "outline" | "ghost" | "destructive" | "secondary" | "link";
type Size = "default" | "sm" | "lg" | "icon";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
}

const variantClasses: Record<Variant, string> = {
  default: "bg-primary text-primary-foreground hover:bg-primary/90",
  outline: "border border-input bg-background hover:bg-accent hover:text-accent-foreground",
  ghost: "hover:bg-accent hover:text-accent-foreground",
  destructive: "bg-destructive text-destructive-foreground hover:bg-destructive/90",
  secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/80",
  link: "text-primary underline-offset-4 hover:underline",
};

const sizeClasses: Record<Size, string> = {
  default: "h-9 px-4 py-2",
  sm: "h-8 px-3 text-xs",
  lg: "h-10 px-6",
  icon: "h-9 w-9",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "default", size = "default", type = "button", ...props }, ref) => (
    <button
      ref={ref}
      type={type}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 disabled:pointer-events-none disabled:opacity-50 whitespace-nowrap",
        variantClasses[variant],
        sizeClasses[size],
        className,
      )}
      {...props}
    />
  ),
);
Button.displayName = "Button";