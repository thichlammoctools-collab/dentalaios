import { useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

interface TabsContextValue {
  value: string;
  setValue: (v: string) => void;
}

const TabsContext = (() => {
  // Simple module-scoped context via React's createContext
  // (avoiding extra import noise)
  return null;
})();

// Use plain React.createContext inline:
import { createContext, useContext } from "react";

const Ctx = createContext<TabsContextValue | undefined>(undefined);

export function Tabs({
  defaultValue,
  value: controlled,
  onValueChange,
  children,
  className,
}: {
  defaultValue: string;
  value?: string;
  onValueChange?: (v: string) => void;
  children: ReactNode;
  className?: string;
}) {
  const [internal, setInternal] = useState(defaultValue);
  const value = controlled ?? internal;
  const setValue = (v: string) => {
    if (controlled === undefined) setInternal(v);
    onValueChange?.(v);
  };
  return (
    <Ctx.Provider value={{ value, setValue }}>
      <div className={cn("w-full", className)}>{children}</div>
    </Ctx.Provider>
  );
}

export function TabsList({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "inline-flex h-9 items-center justify-center rounded-md bg-muted p-1 text-muted-foreground",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function TabsTrigger({
  value,
  children,
  className,
}: {
  value: string;
  children: ReactNode;
  className?: string;
}) {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("TabsTrigger must be inside <Tabs>");
  const active = ctx.value === value;
  return (
    <button
      type="button"
      onClick={() => ctx.setValue(value)}
      className={cn(
        "relative inline-flex items-center justify-center whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium transition-all",
        active
          ? "bg-background text-foreground shadow-sm ring-1 ring-border/50"
          : "text-muted-foreground hover:text-foreground hover:bg-accent/50",
        className,
      )}
    >
      {children}
      {active && (
        <span className="absolute bottom-0 left-1 right-1 h-0.5 rounded-full bg-primary" />
      )}
    </button>
  );
}

export function TabsContent({
  value,
  children,
  className,
}: {
  value: string;
  children: ReactNode;
  className?: string;
}) {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("TabsContent must be inside <Tabs>");
  if (ctx.value !== value) return null;
  return <div className={cn("mt-4", className)}>{children}</div>;
}