import { useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { ROUTES } from "@shared/constants";
import { cn } from "@/lib/utils";

export function Topbar() {
  const { session, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  function onLogout() {
    logout();
    navigate(ROUTES.LOGIN, { replace: true });
  }

  if (!session) return null;

  // Detect page title from current path
  const getTitle = () => {
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
    <header className="flex h-16 items-center justify-between border-b border-border bg-white px-6 shadow-sm">
      <div>
        <h1 className="text-lg font-semibold tracking-tight text-foreground">
          {getTitle()}
        </h1>
        <p className="text-xs text-muted-foreground">
          {session.tenant.name} · {session.branch.name}
        </p>
      </div>
      <div className="flex items-center gap-3">
        <div className="hidden text-right sm:block">
          <p className="text-sm font-medium text-foreground">{session.user.name}</p>
          <p className="text-xs text-muted-foreground">{session.role.name}</p>
        </div>
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-sm font-medium text-primary-foreground">
          {session.user.name.charAt(0).toUpperCase()}
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={onLogout}
          className={cn("ml-2")}
        >
          Đăng xuất
        </Button>
      </div>
    </header>
  );
}