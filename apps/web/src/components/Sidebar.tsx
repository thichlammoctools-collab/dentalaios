import { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import type { LucideIcon } from "lucide-react";
import {
  Armchair,
  BarChart3,
  Building2,
  CalendarCheck,
  CalendarClock,
  ChevronDown,
  ChevronsLeft,
  ChevronsRight,
  ClipboardList,
  FileText,
  Handshake,
  LayoutDashboard,
  Settings,
  Shield,
  Stethoscope,
  UserPlus,
  Users,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth-context";
import { PERMISSIONS, ROUTES } from "@shared/constants";

interface NavItem {
  label: string;
  href: string;
  match: (path: string) => boolean;
  icon: LucideIcon;
}

interface NavGroup {
  id: "operations" | "referrals" | "settings";
  label: string;
  icon: LucideIcon;
  items: NavItem[];
}

type GroupState = Record<NavGroup["id"], boolean>;

const GROUPS_STORAGE_KEY = "sidebar:groups";

const NAV_GROUPS: NavGroup[] = [
  {
    id: "operations",
    label: "Vận hành",
    icon: CalendarCheck,
    items: [
      { label: "Điều hành chi nhánh", href: ROUTES.TODAY, match: (path) => path === ROUTES.TODAY, icon: CalendarCheck },
      { label: "Lịch hẹn", href: ROUTES.SCHEDULE, match: (path) => path.startsWith(ROUTES.SCHEDULE), icon: CalendarClock },
      { label: "Ghế nha", href: ROUTES.CHAIRS, match: (path) => path.startsWith(ROUTES.CHAIRS), icon: Armchair },
      {
        label: "Bệnh nhân",
        href: ROUTES.PATIENTS,
        match: (path) => path.startsWith(ROUTES.PATIENTS) || path.startsWith("/visits/") || path.startsWith("/treatment-plans/"),
        icon: Users,
      },
    ],
  },
  {
    id: "referrals",
    label: "Giới thiệu",
    icon: UserPlus,
    items: [
      { label: "Tổng quan giới thiệu", href: ROUTES.REFERRALS, match: (path) => path === ROUTES.REFERRALS, icon: Handshake },
      { label: "Người giới thiệu", href: ROUTES.REFERRERS, match: (path) => path === ROUTES.REFERRERS, icon: UserPlus },
      {
        label: "Chương trình giới thiệu",
        href: ROUTES.SETTINGS_REFERRAL_PROGRAMS,
        match: (path) => path === ROUTES.SETTINGS_REFERRAL_PROGRAMS,
        icon: ClipboardList,
      },
      { label: "Báo cáo giới thiệu", href: ROUTES.REFERRAL_REPORTS, match: (path) => path === ROUTES.REFERRAL_REPORTS, icon: BarChart3 },
    ],
  },
  {
    id: "settings",
    label: "Cài đặt",
    icon: Settings,
    items: [
      { label: "Người dùng", href: ROUTES.SETTINGS_USERS, match: (path) => path === ROUTES.SETTINGS_USERS, icon: Users },
      { label: "Phòng khám", href: ROUTES.SETTINGS_CLINIC, match: (path) => path === ROUTES.SETTINGS_CLINIC, icon: Building2 },
      {
        label: "Dịch vụ điều trị",
        href: ROUTES.SETTINGS_TREATMENT_SERVICES,
        match: (path) => path === ROUTES.SETTINGS_TREATMENT_SERVICES,
        icon: Stethoscope,
      },
      { label: "Vai trò", href: ROUTES.SETTINGS_ROLES, match: (path) => path === ROUTES.SETTINGS_ROLES, icon: Shield },
      { label: "Audit logs", href: ROUTES.SETTINGS_AUDIT_LOGS, match: (path) => path === ROUTES.SETTINGS_AUDIT_LOGS, icon: FileText },
    ],
  },
];

function getInitialGroups(pathname: string): GroupState {
  const isMobile = typeof window !== "undefined" && window.matchMedia("(max-width: 767px)").matches;
  const activeGroups = NAV_GROUPS.reduce<GroupState>(
    (state, group) => ({ ...state, [group.id]: group.items.some((item) => item.match(pathname)) }),
    { operations: false, referrals: false, settings: false },
  );

  if (isMobile) {
    return { operations: true, referrals: true, settings: true };
  }

  try {
    const stored = window.localStorage.getItem(GROUPS_STORAGE_KEY);
    if (!stored) return activeGroups;

    const parsed = JSON.parse(stored) as Partial<GroupState>;
    return {
      operations: parsed.operations ?? activeGroups.operations,
      referrals: parsed.referrals ?? activeGroups.referrals,
      settings: parsed.settings ?? activeGroups.settings,
    };
  } catch {
    return activeGroups;
  }
}

interface SidebarProps {
  collapsed: boolean;
  onCollapsedChange: (collapsed: boolean) => void;
  onNavigate?: () => void;
}

export function Sidebar({ collapsed, onCollapsedChange, onNavigate }: SidebarProps) {
  const { pathname } = useLocation();
  const { session } = useAuth();
  const [openGroups, setOpenGroups] = useState<GroupState>(() => getInitialGroups(pathname));
  const dashboardRoute = ROUTES.MANAGEMENT_DASHBOARD;
  const canViewDashboard = Boolean(
    session?.role.permissions.includes(PERMISSIONS.ALL) || session?.role.permissions.includes(PERMISSIONS.VIEW_MANAGEMENT_DASHBOARD),
  );

  const activeGroupId = useMemo(
    () => NAV_GROUPS.find((group) => group.items.some((item) => item.match(pathname)))?.id,
    [pathname],
  );

  useEffect(() => {
    if (!activeGroupId) return;
    setOpenGroups((current) => (current[activeGroupId] ? current : { ...current, [activeGroupId]: true }));
  }, [activeGroupId]);

  useEffect(() => {
    try {
      window.localStorage.setItem(GROUPS_STORAGE_KEY, JSON.stringify(openGroups));
    } catch {
      // Persisting expanded groups is optional; the in-memory state still works.
    }
  }, [openGroups]);

  function toggleGroup(groupId: NavGroup["id"]) {
    setOpenGroups((current) => ({ ...current, [groupId]: !current[groupId] }));
  }

  return (
    <div className="flex h-full w-full flex-col">
      <div className={cn("flex h-16 shrink-0 items-center gap-2 border-b border-border px-5", collapsed && "md:justify-center md:px-0")}>
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-blue-600 to-indigo-700 text-lg font-bold text-white shadow-sm">
          D
        </div>
        <div className={cn("min-w-0", collapsed && "md:hidden")}>
          <p className="truncate text-sm font-semibold leading-tight text-foreground">Dental Empire</p>
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">OS Clinic</p>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto p-3" aria-label="Điều hướng chính">
        {canViewDashboard && (
          <NavLink
            item={{ label: "Quản trị tổng quan", href: dashboardRoute, match: (path) => path === dashboardRoute, icon: LayoutDashboard }}
            collapsed={collapsed}
            onNavigate={onNavigate}
          />
        )}

        {NAV_GROUPS.map((group, groupIndex) => {
          const isOpen = openGroups[group.id];
          const isActiveGroup = group.id === activeGroupId;
          const GroupIcon = group.icon;

          return (
            <section
              key={group.id}
              className={cn("pt-4", (groupIndex > 0 || canViewDashboard) && "mt-3 border-t border-border", collapsed && "md:pt-3")}
              aria-label={group.label}
            >
              <button
                type="button"
                onClick={() => toggleGroup(group.id)}
                aria-expanded={isOpen}
                className={cn(
                  "flex w-full items-center gap-2 rounded-md px-3 py-1.5 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground transition-colors duration-150 hover:bg-accent/50 hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  collapsed && "md:hidden",
                )}
              >
                <GroupIcon className="h-3.5 w-3.5" aria-hidden="true" />
                <span className="flex-1">{group.label}</span>
                <ChevronDown className={cn("h-3.5 w-3.5 transition-transform duration-200", isOpen && "rotate-180")} aria-hidden="true" />
              </button>

              <div
                className={cn(
                  "grid overflow-hidden transition-[grid-template-rows,opacity] duration-200 ease-out",
                  isOpen ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0",
                  collapsed && "md:grid-rows-[1fr] md:opacity-100",
                )}
              >
                <div className="min-h-0 space-y-0.5 pt-1">
                  {group.items.map((item, itemIndex) => (
                    <NavLink key={item.href} item={item} collapsed={collapsed} onNavigate={onNavigate} style={{ transitionDelay: isOpen ? `${itemIndex * 30}ms` : "0ms" }} />
                  ))}
                </div>
              </div>

              {collapsed && isActiveGroup && <span className="sr-only">Nhóm đang chọn: {group.label}</span>}
            </section>
          );
        })}
      </nav>

      <div className={cn("shrink-0 border-t border-border p-3", collapsed && "md:px-2")}>
        <button
          type="button"
          onClick={() => onCollapsedChange(!collapsed)}
          className="hidden w-full items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors duration-150 hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:flex"
          aria-label={collapsed ? "Mở rộng thanh điều hướng" : "Thu gọn thanh điều hướng"}
          title={collapsed ? "Mở rộng thanh điều hướng" : "Thu gọn thanh điều hướng"}
        >
          {collapsed ? <ChevronsRight className="h-4 w-4" aria-hidden="true" /> : <ChevronsLeft className="h-4 w-4" aria-hidden="true" />}
          <span className={cn(collapsed && "hidden")}>Thu gọn</span>
        </button>
        <p className={cn("mt-2 text-xs text-muted-foreground", collapsed && "md:mt-0 md:text-center md:text-[10px]")}>
          <span className={cn(collapsed && "md:hidden")}>v0.1.0 · MVP</span>
          {collapsed && <span className="hidden md:inline">v0.1</span>}
        </p>
      </div>
    </div>
  );
}

interface NavLinkProps {
  item: NavItem;
  collapsed: boolean;
  onNavigate?: () => void;
  style?: import("react").CSSProperties;
}

function NavLink({ item, collapsed, onNavigate, style }: NavLinkProps) {
  const { pathname } = useLocation();
  const active = item.match(pathname);
  const Icon = item.icon;

  return (
    <div className="group relative" style={style}>
      <Link
        to={item.href}
        onClick={onNavigate}
        aria-label={item.label}
        className={cn(
          "flex items-center gap-3 rounded-md border-l-2 border-transparent px-3 py-2 text-sm font-medium transition-colors duration-150 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          collapsed && "md:justify-center md:px-0",
          active
            ? "border-primary bg-accent text-primary"
            : "text-muted-foreground hover:bg-accent/50 hover:text-accent-foreground",
        )}
      >
        <Icon className="h-5 w-5 shrink-0" strokeWidth={2} aria-hidden="true" />
        <span className={cn("min-w-0 truncate", collapsed && "md:hidden")}>{item.label}</span>
      </Link>
      {collapsed && (
        <span
          role="tooltip"
          className="pointer-events-none absolute left-full top-1/2 z-50 ml-3 hidden -translate-x-1 -translate-y-1/2 whitespace-nowrap rounded-md border border-border bg-popover px-2 py-1 text-xs font-medium text-popover-foreground opacity-0 shadow-sm transition-all duration-150 group-hover:translate-x-0 group-hover:opacity-100 group-focus-within:translate-x-0 group-focus-within:opacity-100 md:block"
        >
          {item.label}
        </span>
      )}
    </div>
  );
}
