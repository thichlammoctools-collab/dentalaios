import { useAuth } from "@/lib/auth-context";

export function DemoBanner() {
  const { session } = useAuth();
  const isDemo = session?.user.email.endsWith("@demo.clinic");

  if (!isDemo) return null;

  return <div role="status" className="border-b border-amber-500/30 bg-amber-500/10 px-4 py-2 text-center text-xs font-medium text-amber-900 dark:text-amber-100">Demo chủ phòng khám: bạn có thể trải nghiệm toàn quyền trên dữ liệu mô phỏng. Các thay đổi được audit và có thể đặt lại; gửi email, đồng bộ LarkSuite và thao tác xóa dùng chung bị chặn.</div>;
}
