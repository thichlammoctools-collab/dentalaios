import { useEffect, useState, type ReactNode } from "react";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";
import { MobileBottomNav } from "./MobileBottomNav";
import { cn } from "@/lib/utils";

const SIDEBAR_COLLAPSED_STORAGE_KEY = "sidebar:collapsed";

function getInitialCollapsedState() {
  if (typeof window === "undefined") return false;

  try {
    return window.localStorage.getItem(SIDEBAR_COLLAPSED_STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

export function AppShell({ children }: { children: ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(getInitialCollapsedState);

  useEffect(() => {
    try {
      window.localStorage.setItem(SIDEBAR_COLLAPSED_STORAGE_KEY, String(sidebarCollapsed));
    } catch {
      // Persisting this preference is optional; the in-memory state still works.
    }
  }, [sidebarCollapsed]);

  return (
    <div className="flex h-svh overflow-hidden bg-background">
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 opacity-100 transition-opacity duration-300 ease-out lg:hidden"
          onClick={() => setMobileOpen(false)}
          aria-hidden="true"
        />
      )}

      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 w-60 -translate-x-full border-r border-border bg-card transition-[transform,width] duration-300 ease-in-out lg:relative lg:translate-x-0",
          sidebarCollapsed && "lg:w-[72px]",
          mobileOpen && "translate-x-0",
        )}
      >
        <Sidebar
          collapsed={sidebarCollapsed}
          onCollapsedChange={setSidebarCollapsed}
          onNavigate={() => setMobileOpen(false)}
        />
      </aside>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <Topbar onMenuClick={() => setMobileOpen(true)} />
        <main id="app-content" className="min-h-0 flex-1 overflow-y-auto pb-20 lg:pb-0">{children}</main>
      </div>
      <MobileBottomNav onMenuClick={() => setMobileOpen(true)} />
    </div>
  );
}
