import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface PageContainerProps {
  children: ReactNode;
  className?: string;
  size?: "compact" | "reading" | "detail" | "standard" | "wide" | "workspace" | "data";
}

/** All authenticated workspaces share a consistent desktop content width. */
export function PageContainer({ children, className, size = "standard" }: PageContainerProps) {
  const widths = {
    compact: "max-w-[90rem]",
    reading: "max-w-[90rem]",
    detail: "max-w-[90rem]",
    standard: "max-w-[90rem]",
    wide: "max-w-[90rem]",
    workspace: "max-w-[90rem]",
    data: "max-w-[90rem]",
  };

  return (
    <div className={cn("mx-auto w-full space-y-6 p-4 sm:p-6 lg:px-8 lg:py-8 2xl:px-10", widths[size], className)}>
      {children}
    </div>
  );
}
