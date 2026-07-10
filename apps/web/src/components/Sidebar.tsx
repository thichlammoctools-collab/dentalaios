import { Link, useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";
import { ROUTES } from "@shared/constants";

interface NavItem {
  label: string;
  href: string;
  match: (path: string) => boolean;
  icon: "calendar" | "patients" | "settings" | "users" | "members" | "clinic" | "roles" | "audit" | "schedule";
}

const ICONS: Record<NavItem["icon"], React.ReactNode> = {
  calendar: (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <path d="M16 2v4M8 2v4M3 10h18" />
    </svg>
  ),
  patients: (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
      <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" />
    </svg>
  ),
  settings: (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" />
    </svg>
  ),
  users: (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
      <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" />
    </svg>
  ),
  members: (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
      <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" />
    </svg>
  ),
  clinic: (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
      <path d="M3 21h18M9 21V10H3v11M9 3H3v7h6V3zM21 21V10h-6v11M21 3h-6v7h6V3z" />
    </svg>
  ),
  roles: (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  ),
  audit: (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
      <path d="M14 2v6h6M16 13H8M16 17H8M10 9H8" />
    </svg>
  ),
  schedule: (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <path d="M16 2v4M8 2v4M3 10h18" />
      <path d="M8 14h2v2H8zM14 14h2v2h-2z" />
    </svg>
  ),
};

const NAV: NavItem[] = [
  { label: "Hôm nay", href: ROUTES.TODAY, match: (p) => p === ROUTES.TODAY, icon: "calendar" },
  { label: "Lịch hẹn", href: ROUTES.SCHEDULE, match: (p) => p.startsWith("/schedule"), icon: "schedule" },
  { label: "Bệnh nhân", href: ROUTES.PATIENTS, match: (p) => p.startsWith("/patients"), icon: "patients" },
  {
    label: "Cài đặt",
    href: ROUTES.SETTINGS_USERS,
    match: (p) => p.startsWith("/settings"),
    icon: "settings",
  },
];

const SUB_NAV: NavItem[] = [
  { label: "Người dùng", href: ROUTES.SETTINGS_USERS, match: (p) => p === ROUTES.SETTINGS_USERS, icon: "users" },
  { label: "Thành viên", href: ROUTES.SETTINGS_MEMBERS, match: (p) => p === ROUTES.SETTINGS_MEMBERS, icon: "members" },
  { label: "Phòng khám", href: ROUTES.SETTINGS_CLINIC, match: (p) => p === ROUTES.SETTINGS_CLINIC, icon: "clinic" },
  { label: "Vai trò", href: ROUTES.SETTINGS_ROLES, match: (p) => p === ROUTES.SETTINGS_ROLES, icon: "roles" },
  { label: "Audit logs", href: ROUTES.SETTINGS_AUDIT_LOGS, match: (p) => p === ROUTES.SETTINGS_AUDIT_LOGS, icon: "audit" },
];

interface SidebarProps {
  onNavigate?: () => void;
}

export function Sidebar({ onNavigate }: SidebarProps) {
  const { pathname } = useLocation();

  return (
    <div className="flex h-full w-60 flex-col">
      <div className="flex h-16 items-center gap-2 border-b border-border px-5">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-blue-600 to-indigo-700 text-lg font-bold text-white shadow-sm">
          D
        </div>
        <div>
          <p className="text-sm font-semibold leading-tight text-foreground">Dental Empire</p>
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">OS Clinic</p>
        </div>
      </div>

      <nav className="flex-1 space-y-0.5 overflow-y-auto p-3">
        {NAV.map((item) => {
          const active = item.match(pathname);
          return (
            <Link
              key={item.href}
              to={item.href}
              onClick={onNavigate}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                active
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
              )}
            >
              <span className={cn("shrink-0", !active && "text-muted-foreground")}>{ICONS[item.icon]}</span>
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
                  onClick={onNavigate}
                  className={cn(
                    "flex items-center gap-3 rounded-md px-3 py-2 pl-10 text-sm transition-colors",
                    active
                      ? "bg-accent font-medium text-accent-foreground"
                      : "text-muted-foreground hover:bg-accent/50 hover:text-accent-foreground",
                  )}
                >
                  <span className={cn("shrink-0", !active && "text-muted-foreground")}>{ICONS[item.icon]}</span>
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
    </div>
  );
}