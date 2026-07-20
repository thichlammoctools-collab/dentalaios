import { useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "@/lib/auth-context";
import { useTheme } from "@/lib/theme";
import { Button } from "@/components/ui/button";
import { getRoleLabel, ROUTES } from "@shared/constants";
import { cn } from "@/lib/utils";

interface TopbarProps {
  onMenuClick?: () => void;
}

export function Topbar({ onMenuClick }: TopbarProps) {
  const { session, logout } = useAuth();
  const { theme, toggle } = useTheme();
  const navigate = useNavigate();
  const location = useLocation();

  function onLogout() {
    logout();
    navigate(ROUTES.LOGIN, { replace: true });
  }

  if (!session) return null;

  const dashboardRoute = ROUTES.MANAGEMENT_DASHBOARD;
  const isManagementDashboard = location.pathname === dashboardRoute;
  const dashboardContext = new URLSearchParams(location.search).get("branch_id")
    ? "Chi nhánh đã chọn"
    : "Tất cả chi nhánh";

  const getTitle = () => {
    if (isManagementDashboard) return "Quản trị tổng quan";
    if (location.pathname === ROUTES.TODAY) return "Today";
    if (location.pathname === ROUTES.PATIENTS) return "Bệnh nhân";
    if (location.pathname.startsWith("/patients/")) return "Hồ sơ bệnh nhân";
    if (location.pathname.startsWith("/visits/")) return "Lượt khám";
    if (location.pathname.startsWith("/treatment-plans/")) return "Kế hoạch điều trị";
    if (location.pathname === ROUTES.SETTINGS_USERS) return "Người dùng";
    if (location.pathname === ROUTES.SETTINGS_ROLES) return "Vai trò";
    if (location.pathname === ROUTES.SETTINGS_AUDIT_LOGS) return "Audit logs";
    return "";
  };

  return (
    <header className="flex h-16 items-center justify-between border-b border-border bg-card px-4 shadow-sm sm:px-6">
      <div className="flex items-center gap-3">
        {/* Mobile menu button */}
        {onMenuClick && (
          <button
            type="button"
            onClick={onMenuClick}
            className="rounded-md p-2 text-muted-foreground hover:bg-accent hover:text-accent-foreground md:hidden"
            aria-label="Open menu"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
        )}
        <div>
          <h1 className="text-base font-semibold tracking-tight text-foreground sm:text-lg">
            {getTitle()}
          </h1>
          <p className="hidden text-xs text-muted-foreground sm:block">
            {session.tenant.name} · {isManagementDashboard ? dashboardContext : session.branch.name}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2 sm:gap-3">
        {/* Theme toggle */}
        <button
          type="button"
          onClick={toggle}
          className="rounded-md p-2 text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
          aria-label="Toggle theme"
          title={theme === "light" ? "Chuyển sang tối" : "Chuyển sang sáng"}
        >
          {theme === "light" ? (
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
            </svg>
          ) : (
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
            </svg>
          )}
        </button>

        <div className="hidden text-right sm:block">
          <p className="text-sm font-medium text-foreground">{session.user.name}</p>
          <p className="text-xs text-muted-foreground">{getRoleLabel(session.role.name)}</p>
        </div>
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-sm font-medium text-primary-foreground">
          {session.user.name.charAt(0).toUpperCase()}
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={onLogout}
          className={cn("ml-2 hidden sm:inline-flex")}
        >
          Đăng xuất
        </Button>
      </div>
    </header>
  );
}
