import { useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { ROUTES } from "@shared/constants";

export function Topbar() {
  const { session, logout } = useAuth();
  const navigate = useNavigate();

  function onLogout() {
    logout();
    navigate(ROUTES.LOGIN, { replace: true });
  }

  if (!session) return null;

  return (
    <header className="flex h-14 items-center justify-between border-b border-border bg-card px-4">
      <div className="text-sm">
        <div className="font-medium">{session.tenant.name}</div>
        <div className="text-xs text-muted-foreground">{session.branch.name}</div>
      </div>
      <div className="flex items-center gap-3">
        <div className="text-right text-sm">
          <div className="font-medium">{session.user.name}</div>
          <div className="text-xs text-muted-foreground">{session.role.name}</div>
        </div>
        <Button variant="outline" size="sm" onClick={onLogout}>
          Đăng xuất
        </Button>
      </div>
    </header>
  );
}