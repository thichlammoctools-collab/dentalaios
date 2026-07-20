import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { apiGet, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { formatCurrency } from "@/lib/utils";
import { toast } from "@/lib/toast";
import { PERMISSIONS, ROUTES } from "@shared/constants";
import type { DentalChair } from "@shared/types";

type Range = 7 | 30 | 90;

interface ChairRevenueRow {
  chair: DentalChair;
  confirmed_revenue: number;
  payment_count: number;
  completed_minutes: number;
  revenue_per_completed_hour: number | null;
}

interface ChairRevenueReport {
  range: Range;
  start: string;
  end: string;
  items: ChairRevenueRow[];
  unallocated_revenue: number;
}

export function ChairRevenueReportPage() {
  const { session } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const range = searchParams.get("range") === "7" ? 7 : searchParams.get("range") === "90" ? 90 : 30;
  const [report, setReport] = useState<ChairRevenueReport | null>(null);
  const [loading, setLoading] = useState(true);
  const canView = Boolean(session?.role.permissions.includes(PERMISSIONS.ALL) || session?.role.permissions.includes(PERMISSIONS.VIEW_MANAGEMENT_DASHBOARD));

  useEffect(() => {
    if (!canView || !session?.branch?.id) return;
    let mounted = true;
    setLoading(true);
    apiGet<ChairRevenueReport>(`/api/chairs/revenue-report?branch_id=${encodeURIComponent(session.branch.id)}&range=${range}`)
      .then((response) => { if (mounted) setReport(response); })
      .catch((error) => { if (mounted) toast.error(error instanceof ApiError ? error.message : "Không thể tải báo cáo ghế"); })
      .finally(() => { if (mounted) setLoading(false); });
    return () => { mounted = false; };
  }, [canView, range, session?.branch?.id]);

  if (!canView) return <div className="mx-auto max-w-3xl p-4 sm:p-6"><Card><CardHeader><CardTitle>Quyền truy cập cần thiết</CardTitle><CardDescription>Báo cáo doanh thu ghế chỉ dành cho quản trị viên hoặc quản lý.</CardDescription></CardHeader></Card></div>;

  const totalRevenue = report?.items.reduce((total, item) => total + item.confirmed_revenue, 0) ?? 0;
  const totalMinutes = report?.items.reduce((total, item) => total + item.completed_minutes, 0) ?? 0;
  return <div className="mx-auto max-w-6xl space-y-6 p-4 sm:p-6">
    <section className="overflow-hidden rounded-2xl bg-gradient-to-br from-emerald-700 via-teal-700 to-cyan-800 p-5 text-white shadow-lg sm:p-7">
      <div className="flex flex-wrap items-end justify-between gap-4"><div><h1 className="text-2xl font-semibold tracking-tight">Hiệu quả doanh thu ghế</h1><p className="mt-1 text-sm text-emerald-100">Doanh thu xác nhận theo thời điểm thanh toán, tại chi nhánh hiện tại.</p></div><Button variant="outline" className="border-white/30 bg-white/10 text-white hover:bg-white/20 hover:text-white" asChild><Link to={ROUTES.CHAIRS}>Điều hành ghế</Link></Button></div>
      <div className="mt-5 flex flex-wrap gap-2">{([7, 30, 90] as Range[]).map((value) => <Button key={value} size="sm" variant="outline" className={range === value ? "border-white bg-white text-emerald-800 hover:bg-emerald-50" : "border-white/30 bg-white/10 text-white hover:bg-white/20 hover:text-white"} onClick={() => setSearchParams(value === 30 ? {} : { range: String(value) })}>{value} ngày</Button>)}</div>
    </section>
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3"><Summary label="Doanh thu đã phân bổ" value={formatCurrency(totalRevenue)} /><Summary label="Thời lượng hoàn thành" value={`${Math.round(totalMinutes / 60 * 10) / 10} giờ`} /><Summary label="Chưa phân bổ" value={formatCurrency(report?.unallocated_revenue ?? 0)} /></div>
    <Card><CardHeader><CardTitle>So sánh ghế</CardTitle><CardDescription>{report ? `Từ ${new Date(report.start).toLocaleDateString("vi-VN")} đến ${new Date(report.end).toLocaleDateString("vi-VN")}.` : "Đang tải dữ liệu."}</CardDescription></CardHeader><CardContent>{loading ? <div className="flex h-40 items-center justify-center"><div className="h-7 w-7 animate-spin rounded-full border-4 border-muted border-t-primary" /></div> : !report?.items.length ? <p className="py-10 text-center text-sm text-muted-foreground">Chưa có ghế tại chi nhánh này.</p> : <div className="overflow-x-auto"><table className="w-full min-w-[720px] text-sm"><thead className="border-b text-left text-xs text-muted-foreground"><tr><th className="p-3">Ghế</th><th className="p-3 text-right">Doanh thu</th><th className="p-3 text-right">Payment</th><th className="p-3 text-right">Giờ hoàn thành</th><th className="p-3 text-right">Doanh thu/giờ</th></tr></thead><tbody className="divide-y">{report.items.map((item) => <tr key={item.chair.id}><td className="p-3"><p className="font-medium">{item.chair.name}</p><p className="text-xs text-muted-foreground">{item.chair.room_name ?? "Chưa gán phòng"} · {item.chair.code}</p></td><td className="p-3 text-right font-medium tabular-nums">{formatCurrency(item.confirmed_revenue)}</td><td className="p-3 text-right tabular-nums">{item.payment_count}</td><td className="p-3 text-right tabular-nums">{Math.round(item.completed_minutes / 6) / 10}</td><td className="p-3 text-right tabular-nums">{item.revenue_per_completed_hour === null ? "--" : formatCurrency(item.revenue_per_completed_hour)}</td></tr>)}</tbody></table></div>}</CardContent></Card>
  </div>;
}

function Summary({ label, value }: { label: string; value: string }) {
  return <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 text-xl font-semibold tabular-nums">{value}</p></CardContent></Card>;
}
