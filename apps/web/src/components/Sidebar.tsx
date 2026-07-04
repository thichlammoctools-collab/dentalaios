import { Link, useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";
import { ROUTES } from "@shared/constants";

interface NavItem {
  label: string;
  href: string;
  match: (path: string) => boolean;
}

const NAV: NavItem[] = [
  { label: "Today", href: ROUTES.TODAY, match: (p) => p === ROUTES.TODAY },
  { label: "Bệnh nhân", href: ROUTES.PATIENTS, match: (p) => p.startsWith("/patients") },
  {
    label: "Cài đặt",
    href: ROUTES.SETTINGS_USERS,
    match: (p) => p.startsWith("/settings"),
  },
];

export function Sidebar() {
  const { pathname } = useLocation();

  return (
    <aside className="hidden md:flex md:w-56 md:flex-col md:border-r md:border-border md:bg-card">
      <div className="flex h-14 items-center px-4 font-semibold tracking-tight">
        Dental Empire OS
      </div>
      <nav className="flex flex-col gap-1 p-2">
        {NAV.map((item) => {
          const active = item.match(pathname);
          return (
            <Link
              key={item.href}
              to={item.href}
              className={cn(
                "rounded-md px-3 py-2 text-sm transition-colors",
                active
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
              )}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>
      <div className="mt-auto p-4 text-xs text-muted-foreground">
        v0.1.0 · MVP
      </div>
    </aside>
  );
}