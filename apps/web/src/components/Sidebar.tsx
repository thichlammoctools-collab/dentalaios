import { Link, useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";
import { ROUTES } from "@shared/constants";

interface NavItem {
  label: string;
  href: string;
  match: (path: string) => boolean;
  icon: string;
}

const NAV: NavItem[] = [
  { label: "Today", href: ROUTES.TODAY, match: (p) => p === ROUTES.TODAY, icon: "📅" },
  { label: "Bệnh nhân", href: ROUTES.PATIENTS, match: (p) => p.startsWith("/patients"), icon: "🧑‍⚕️" },
  {
    label: "Cài đặt",
    href: ROUTES.SETTINGS_USERS,
    match: (p) => p.startsWith("/settings"),
    icon: "⚙️",
  },
];

const SUB_NAV: NavItem[] = [
  { label: "Người dùng", href: ROUTES.SETTINGS_USERS, match: (p) => p === ROUTES.SETTINGS_USERS, icon: "👥" },
  { label: "Vai trò", href: ROUTES.SETTINGS_ROLES, match: (p) => p === ROUTES.SETTINGS_ROLES, icon: "🔑" },
  { label: "Audit logs", href: ROUTES.SETTINGS_AUDIT_LOGS, match: (p) => p === ROUTES.SETTINGS_AUDIT_LOGS, icon: "📋" },
];

export function Sidebar() {
  const { pathname } = useLocation();

  return (
    <aside className="hidden w-60 flex-col border-r border-border bg-white md:flex">
      <div className="flex h-16 items-center gap-2 border-b border-border px-5">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-blue-600 to-indigo-700 text-lg font-bold text-white shadow-sm">
          D
        </div>
        <div>
          <p className="text-sm font-semibold text-foreground leading-tight">Dental Empire</p>
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider">OS Clinic</p>
        </div>
      </div>

      <nav className="flex-1 space-y-0.5 p-3">
        {NAV.map((item) => {
          const active = item.match(pathname);
          return (
            <Link
              key={item.href}
              to={item.href}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                active
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
              )}
            >
              <span className="text-base">{item.icon}</span>
              <span>{item.label}</span>
            </Link>
          );
        })}

        {pathname.startsWith("/settings") && (
          <div className="mt-3 space-y-0.5 border-t border-border pt-3">
            <p className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Quản trị
            </p>
            {SUB_NAV.map((item) => {
              const active = item.match(pathname);
              return (
                <Link
                  key={item.href}
                  to={item.href}
                  className={cn(
                    "flex items-center gap-3 rounded-md px-3 py-2 pl-10 text-sm transition-colors",
                    active
                      ? "bg-accent text-accent-foreground font-medium"
                      : "text-muted-foreground hover:bg-accent/50 hover:text-accent-foreground",
                  )}
                >
                  <span>{item.icon}</span>
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </div>
        )}
      </nav>

      <div className="border-t border-border p-3 text-xs text-muted-foreground">
        <p>v0.1.0 · MVP</p>
      </div>
    </aside>
  );
}