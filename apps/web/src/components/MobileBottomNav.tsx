import { CalendarDays, ClipboardList, Menu, Users } from "lucide-react";
import { Link, useLocation } from "react-router-dom";
import { ROUTES } from "@shared/constants";
import { cn } from "@/lib/utils";

interface MobileBottomNavProps {
  onMenuClick: () => void;
}

const items = [
  { label: "Hôm nay", href: ROUTES.TODAY, matches: (path: string) => path === ROUTES.TODAY, icon: CalendarDays },
  { label: "Lịch", href: ROUTES.SCHEDULE, matches: (path: string) => path.startsWith(ROUTES.SCHEDULE), icon: ClipboardList },
  { label: "Bệnh nhân", href: ROUTES.PATIENTS, matches: (path: string) => path.startsWith(ROUTES.PATIENTS), icon: Users },
] as const;

export function MobileBottomNav({ onMenuClick }: MobileBottomNavProps) {
  const { pathname } = useLocation();

  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-card/95 px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2 backdrop-blur lg:hidden" aria-label="Điều hướng nhanh">
      <div className="mx-auto grid max-w-lg grid-cols-4">
        {items.map((item) => {
          const Icon = item.icon;
          const active = item.matches(pathname);
          return (
            <Link
              key={item.href}
              to={item.href}
              className={cn(
                "flex min-h-14 flex-col items-center justify-center gap-1 rounded-md px-1 text-[11px] font-medium",
                active ? "text-primary" : "text-muted-foreground",
              )}
            >
              <Icon className="h-5 w-5" aria-hidden="true" />
              <span>{item.label}</span>
            </Link>
          );
        })}
        <button
          type="button"
          onClick={onMenuClick}
          className="flex min-h-14 flex-col items-center justify-center gap-1 rounded-md px-1 text-[11px] font-medium text-muted-foreground"
          aria-label="Mở thêm chức năng"
        >
          <Menu className="h-5 w-5" aria-hidden="true" />
          <span>Thêm</span>
        </button>
      </div>
    </nav>
  );
}
