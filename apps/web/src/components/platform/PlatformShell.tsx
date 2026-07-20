import { Link, Outlet, useLocation, useNavigate } from "react-router-dom";
import { usePlatformAuth } from "@/lib/platform-auth-context";
import { cn } from "@/lib/utils";

const navigation = [
  { label: "Tổng quan", href: "/platform/dashboard", icon: "grid" },
  { label: "Phòng khám", href: "/platform/tenants", icon: "building" },
  { label: "Nội dung", href: "/platform/content", icon: "document" },
  { label: "Cấu hình", href: "/platform/configuration", icon: "sliders" },
  { label: "Super Admin", href: "/platform/admins", icon: "users" },
  { label: "Nhật ký", href: "/platform/audit-logs", icon: "log" },
] as const;

function Icon({ name }: { name: (typeof navigation)[number]["icon"] }) {
  const paths = {
    grid: <><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></>,
    building: <><path d="M3 21h18M6 21V5h12v16M9 9h1m4 0h1M9 13h1m4 0h1M10 21v-4h4v4" /></>,
    document: <><path d="M6 3h9l3 3v15H6z" /><path d="M14 3v4h4M9 12h6M9 16h6" /></>,
    sliders: <><path d="M4 7h16M4 17h16M9 4v6M15 14v6" /></>,
    users: <><circle cx="9" cy="8" r="3" /><path d="M3 21v-2a6 6 0 0112 0v2M16 4a3 3 0 010 6M21 21v-2a6 6 0 00-3-5.2" /></>,
    log: <><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" /><path d="M14 2v6h6M8 13h8M8 17h6" /></>,
  } as const;
  return <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">{paths[name]}</svg>;
}

export function PlatformShell() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { currentUser, currentRole, logout, hasPermission } = usePlatformAuth();
  const visible = navigation.filter((item) => {
    if (item.href.endsWith("/admins")) return hasPermission("platform_admins.read");
    if (item.href.endsWith("/audit-logs")) return hasPermission("platform_audit.read");
    if (item.href.endsWith("/content")) return hasPermission("platform_content.read");
    if (item.href.endsWith("/configuration")) return hasPermission("platform_config.read");
    if (item.href.endsWith("/tenants")) return hasPermission("platform_tenants.read");
    return hasPermission("platform_dashboard.read");
  });

  return (
    <div className="platform-control min-h-svh bg-background text-foreground lg:flex">
      <aside className="relative border-b border-[#263650] bg-[#070d1a] p-4 lg:min-h-svh lg:w-64 lg:shrink-0 lg:border-b-0 lg:border-r">
        <Link to="/platform/dashboard" className="flex items-center gap-3 rounded-lg px-2 py-2 outline-none focus-visible:ring-2 focus-visible:ring-[#22d3ee] focus-visible:ring-offset-2 focus-visible:ring-offset-[#070d1a]">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-[#16c7e5] font-bold text-[#06202a] shadow-[0_6px_16px_rgb(0_0_0_/_18%)]">D</span>
          <span><strong className="block text-sm text-[#f1f5f9]">Dental Empire</strong><small className="text-[10px] uppercase tracking-[0.16em] text-[#67e8f9]">Platform Control</small></span>
        </Link>
        <nav className="mt-6 grid grid-cols-2 gap-1 lg:block lg:space-y-1">
          {visible.map((item) => {
            const active = pathname === item.href || (item.href.endsWith("/tenants") && pathname.startsWith("/platform/tenants/"));
            return <Link key={item.href} to={item.href} className={cn("flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors outline-none focus-visible:ring-2 focus-visible:ring-[#22d3ee] focus-visible:ring-offset-2 focus-visible:ring-offset-[#070d1a]", active ? "bg-[#12364a] text-[#f1f5f9] shadow-[inset_3px_0_0_#16c7e5]" : "text-[#aabbd0] hover:bg-[#16233a] hover:text-[#f1f5f9]")}><Icon name={item.icon} />{item.label}</Link>;
          })}
        </nav>
        <div className="mt-6 border-t border-[#263650] pt-4 lg:absolute lg:bottom-4 lg:w-56">
          <p className="truncate px-2 text-sm font-medium text-[#f1f5f9]">{currentUser?.name}</p>
          <p className="px-2 text-xs text-[#aabbd0]">{currentRole?.name}</p>
          <button type="button" onClick={() => void logout().finally(() => navigate("/platform/login"))} className="mt-3 rounded px-2 py-1 text-xs text-[#aabbd0] outline-none hover:text-[#f1f5f9] focus-visible:ring-2 focus-visible:ring-[#22d3ee]">Đăng xuất</button>
        </div>
      </aside>
      <main className="min-w-0 flex-1 bg-background text-foreground"><Outlet /></main>
    </div>
  );
}
