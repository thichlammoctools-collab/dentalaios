import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface PageContainerProps {
  children: ReactNode;
  className?: string;
}

/** Consistent desktop reading width and responsive page gutters. */
export function PageContainer({ children, className }: PageContainerProps) {
  return (
    <div className={cn("mx-auto w-full max-w-6xl space-y-6 p-4 sm:p-6 lg:py-8", className)}>
      {children}
    </div>
  );
}
