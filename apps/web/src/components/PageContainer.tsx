import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface PageContainerProps {
  children: ReactNode;
  className?: string;
  size?: "compact" | "reading" | "detail" | "standard" | "wide" | "workspace" | "data";
}

/** Consistent page gutters with widths matched to the information density. */
export function PageContainer({ children, className, size = "standard" }: PageContainerProps) {
  const widths = {
    compact: "max-w-2xl",
    reading: "max-w-3xl",
    detail: "max-w-5xl",
    standard: "max-w-6xl",
    wide: "max-w-7xl",
    workspace: "max-w-[90rem]",
    data: "max-w-none",
  };

  return (
    <div className={cn("mx-auto w-full space-y-6 p-4 sm:p-6 lg:px-8 lg:py-8 2xl:px-10", widths[size], className)}>
      {children}
    </div>
  );
}
