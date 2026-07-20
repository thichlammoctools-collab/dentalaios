import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { apiGet, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { createDashboardStream, type DashboardStreamStatus } from "@/lib/dashboard-stream";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import { formatCurrency } from "@/lib/utils";
import { PERMISSIONS, ROUTES } from "@shared/constants";
import type {
  ManagementDashboardBranch,
  ManagementDashboardBranchPerformance,
  ManagementDashboardDailyPoint,
  ManagementDashboardException,
  ManagementDashboardRange,
  ManagementDashboardSnapshot,
} from "@shared/types";

type DashboardRange = ManagementDashboardRange;
type BranchSummary = ManagementDashboardBranch;
type DailyPoint = ManagementDashboardDailyPoint;
type BranchPerformance = ManagementDashboardBranchPerformance;
type AttentionItem = ManagementDashboardException;
type DashboardSnapshot = ManagementDashboardSnapshot;

const dashboardRoute = ROUTES.MANAGEMENT_DASHBOARD;

function numberFrom(source: Record<string, number | null | undefined> | undefined, ...keys: string[]) {
  for (const key of keys) if (typeof source?.[key] === "number") return source[key];
  return undefined;
}
function getBranchId(branch: BranchSummary | BranchPerformance | AttentionItem) { return "branch_id" in branch ? branch.branch_id : branch.id; }
function getBranchName(branch: BranchSummary | BranchPerformance | AttentionItem) { return "branch_name" in branch ? branch.branch_name : branch.name; }
function formatNumber(value: number | null | undefined) { return typeof value === "number" ? new Intl.NumberFormat("vi-VN").format(value) : "--"; }
function formatPercent(value: number | null | undefined) { return typeof value === "number" ? `${new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 1 }).format(value <= 1 ? value * 100 : value)}%` : "--"; }
function hcmDate(value?: string) { return new Intl.DateTimeFormat("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", weekday: "long", day: "2-digit", month: "long", year: "numeric" }).format(value ? new Date(value) : new Date()); }
function hcmTime(value: string) { return new Intl.DateTimeFormat("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(new Date(value)); }
function chartDate(value: string) { const date = new Date(`${value.slice(0, 10)}T00:00:00`); return Number.isNaN(date.valueOf()) ? value : new Intl.DateTimeFormat("vi-VN", { day: "2-digit", month: "2-digit" }).format(date); }
function percentChange(current: number | null | undefined, previous: number | null | undefined) { return typeof current === "number" && typeof previous === "number" && previous !== 0 ? ((current - previous) / Math.abs(previous)) * 100 : undefined; }

export function ManagementDashboardPage() {
  const { session } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedRange = Number(searchParams.get("range"));
  const range: DashboardRange = requestedRange === 7 || requestedRange === 90 ? requestedRange : 30;
  const branchId = searchParams.get("branch_id") ?? "";
  const [snapshot, setSnapshot] = useState<DashboardSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [streamStatus, setStreamStatus] = useState<DashboardStreamStatus>("reconnecting");
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const requestId = useRef(0);
  const hasPermission = Boolean(session?.role.permissions.includes(PERMISSIONS.ALL) || session?.role.permissions.includes(PERMISSIONS.VIEW_MANAGEMENT_DASHBOARD));

  function setFilters(nextRange: DashboardRange, nextBranchId: string) {
    const next = new URLSearchParams();
    if (nextRange !== 30) next.set("range", String(nextRange));
    if (nextBranchId) next.set("branch_id", nextBranchId);
    setSearchParams(next);
  }

  async function loadSnapshot(manual = false) {
    const currentRequest = ++requestId.current;
    manual ? setRefreshing(true) : setLoading(true);
    setError(null);
    const query = new URLSearchParams({ range: String(range) });
    if (branchId) query.set("branch_id", branchId);
    try {
      const next = await apiGet<DashboardSnapshot>(`/api/dashboard/management?${query}`);
      if (currentRequest !== requestId.current) return;
      setSnapshot(next);
      setLastUpdated(next.generated_at ?? new Date().toISOString());
    } catch (cause) {
      if (currentRequest !== requestId.current) return;
      setError(cause instanceof ApiError ? cause.message : "Không thể tải dữ liệu quản trị.");
    } finally {
      if (currentRequest === requestId.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }

  useEffect(() => {
    if (!hasPermission) { setLoading(false); return; }
    void loadSnapshot();
    // URL filter changes deliberately drive snapshot reloads.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasPermission, range, branchId]);

  useEffect(() => {
    if (!hasPermission) return;
    const stream = createDashboardStream({ onInvalidate: () => void loadSnapshot(true), onStatusChange: setStreamStatus });
    return () => stream.stop();
    // Stream reloads use the current URL filter closure.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasPermission, range, branchId]);

  if (!hasPermission) return <div className="mx-auto max-w-3xl p-4 sm:p-6"><Card><CardHeader><CardTitle>Quyền truy cập cần thiết</CardTitle><CardDescription>Trang tổng quan quản trị chỉ dành cho vai trò được cấp quyền xem báo cáo vận hành.</CardDescription></CardHeader><CardContent><p className="text-sm text-muted-foreground">Liên hệ quản trị viên để được cấp quyền phù hợp. Máy chủ vẫn kiểm tra quyền truy cập cho mọi yêu cầu.</p></CardContent></Card></div>;

  const branches = snapshot?.branches ?? [];
  const daily = snapshot?.daily ?? [];
  const comparisons = snapshot?.branch_performance ?? [];
  const attention = snapshot?.exceptions ?? [];
  const noActivity = !loading && !error && !!snapshot && daily.every((point) => !point.visits && !(point.revenue ?? point.confirmed_revenue));

  return <div className="mx-auto max-w-7xl space-y-5 p-4 sm:space-y-6 sm:p-6">
    <section className="overflow-hidden rounded-2xl bg-gradient-to-br from-slate-950 via-blue-950 to-indigo-900 p-5 text-white shadow-lg sm:p-7">
      <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-end"><div><p className="text-sm font-medium text-blue-200">{session?.tenant.name}</p><h2 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">Quản trị tổng quan</h2><p className="mt-2 text-sm text-blue-100">Vận hành toàn hệ thống · {hcmDate(snapshot?.today_start)}</p></div>
        <div className="grid gap-2 sm:grid-cols-[140px_minmax(190px,1fr)_auto]"><label className="text-xs font-medium text-blue-100">Kỳ báo cáo<Select value={range} onChange={(event) => setFilters(Number(event.target.value) as DashboardRange, branchId)} className="mt-1 border-white/20 bg-white/10 text-white"><option className="text-foreground" value="7">7 ngày hoàn tất</option><option className="text-foreground" value="30">30 ngày hoàn tất</option><option className="text-foreground" value="90">90 ngày hoàn tất</option></Select></label>
          <label className="text-xs font-medium text-blue-100">Phạm vi chi nhánh<Select value={branchId} onChange={(event) => setFilters(range, event.target.value)} className="mt-1 border-white/20 bg-white/10 text-white"><option className="text-foreground" value="">Tất cả chi nhánh</option>{branches.map((branch) => <option className="text-foreground" key={getBranchId(branch)} value={getBranchId(branch)}>{getBranchName(branch)}</option>)}</Select></label>
          <Button variant="outline" onClick={() => void loadSnapshot(true)} disabled={refreshing} className="self-end border-white/30 bg-white/10 text-white hover:bg-white/20 hover:text-white"><RefreshIcon spinning={refreshing} /> Làm mới</Button></div></div>
      <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-blue-100"><LiveStatus status={streamStatus} /><span>{lastUpdated ? `Cập nhật ${hcmTime(lastUpdated)}` : "Đang lấy dữ liệu"}</span></div>
    </section>
    {error ? <Card><CardHeader><CardTitle>Không thể tải tổng quan</CardTitle><CardDescription>{error}</CardDescription></CardHeader><CardContent><Button onClick={() => void loadSnapshot(true)}>Thử lại</Button></CardContent></Card> : loading ? <DashboardSkeleton /> : noActivity ? <EmptyDashboard /> : <>
      <section><div className="mb-3 flex items-baseline justify-between"><h2 className="text-lg font-semibold">Vận hành hôm nay</h2><span className="text-xs text-muted-foreground">Theo giờ Hồ Chí Minh</span></div><div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7"><MetricCard label="Đã đặt lịch" value={formatNumber(numberFrom(snapshot?.today, "scheduled", "appointments"))} /><MetricCard label="Đã đến" value={formatNumber(numberFrom(snapshot?.today, "arrived"))} /><MetricCard label="Hoàn thành" value={formatNumber(numberFrom(snapshot?.today, "completed"))} /><MetricCard label="Đang khám" value={formatNumber(numberFrom(snapshot?.today, "in_progress_visits", "in_progress"))} /><MetricCard label="Doanh thu xác nhận" value={formatCurrency(numberFrom(snapshot?.today, "confirmed_revenue", "revenue") ?? 0)} money /><MetricCard label="Đã hủy" value={formatNumber(numberFrom(snapshot?.today, "cancellations", "cancellation_count"))} alert /><MetricCard label="Không đến" value={formatNumber(numberFrom(snapshot?.today, "no_shows", "no_show_count"))} alert /></div></section>
      <section><div className="mb-3"><h2 className="text-lg font-semibold">Hiệu quả {range} ngày đã hoàn tất</h2><p className="text-sm text-muted-foreground">So sánh cùng số ngày ngay trước kỳ được chọn.</p></div><div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-8"><MetricCard label="Doanh thu xác nhận" value={formatCurrency(numberFrom(snapshot?.kpis, "confirmed_revenue", "revenue") ?? 0)} delta={percentChange(numberFrom(snapshot?.kpis, "confirmed_revenue", "revenue"), numberFrom(snapshot?.kpis, "previous_revenue"))} money /><MetricCard label="Lượt khám" value={formatNumber(numberFrom(snapshot?.kpis, "visits"))} delta={percentChange(numberFrom(snapshot?.kpis, "visits"), numberFrom(snapshot?.kpis, "previous_visits"))} /><MetricCard label="Lịch hẹn" value={formatNumber(numberFrom(snapshot?.kpis, "appointments"))} /><MetricCard label="Tỷ lệ hoàn thành" value={formatPercent(numberFrom(snapshot?.kpis, "completion_rate"))} /><MetricCard label="Bệnh nhân mới" value={formatNumber(numberFrom(snapshot?.kpis, "new_patients"))} /><MetricCard label="Kế hoạch chờ duyệt" value={formatNumber(numberFrom(snapshot?.kpis, "pending_plans", "pending_plan_count"))} /><MetricCard label="Đã hủy" value={formatNumber(numberFrom(snapshot?.kpis, "cancellations"))} alert /><MetricCard label="Không đến" value={formatNumber(numberFrom(snapshot?.kpis, "no_shows"))} alert /></div></section>
      <section className="grid gap-5 lg:grid-cols-3"><Card className="lg:col-span-2"><CardHeader><CardTitle>Xu hướng lượt khám và doanh thu</CardTitle><CardDescription>Dữ liệu từng ngày trong kỳ đã chọn.</CardDescription></CardHeader><CardContent><DailyChart data={daily} /></CardContent></Card><AttentionList items={attention} range={range} onSelect={(id) => setFilters(range, id)} /></section>
      <BranchComparison rows={comparisons} onSelect={(id) => setFilters(range, id)} />
    </>}
  </div>;
}

function MetricCard({ label, value, delta, money, alert }: { label: string; value: string; delta?: number; money?: boolean; alert?: boolean }) { return <Card className={alert ? "border-amber-200 dark:border-amber-900" : ""}><CardContent className="p-4"><p className="text-xs font-medium text-muted-foreground">{label}</p><p className={`mt-2 truncate font-semibold ${money ? "text-lg" : "text-2xl"}`}>{value}</p>{typeof delta === "number" && <p className={`mt-1 text-xs ${delta >= 0 ? "text-emerald-600" : "text-destructive"}`}>{delta >= 0 ? "+" : ""}{new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 1 }).format(delta)}% so với kỳ trước</p>}</CardContent></Card>; }
function DailyChart({ data }: { data: DailyPoint[] }) { if (!data.length || data.every((point) => !point.visits && !(point.revenue ?? point.confirmed_revenue))) return <p className="py-12 text-center text-sm text-muted-foreground">Chưa có hoạt động trong kỳ này.</p>; const visitsMax = Math.max(...data.map((point) => point.visits ?? 0), 1); const revenueMax = Math.max(...data.map((point) => point.revenue ?? point.confirmed_revenue ?? 0), 1); const width = Math.max(560, data.length * 32); return <div className="overflow-x-auto"><svg className="min-w-[560px] w-full" viewBox={`0 0 ${width} 220`} role="img" aria-label="Biểu đồ lượt khám và doanh thu theo ngày"><title>Biểu đồ lượt khám và doanh thu theo ngày</title><line x1="32" y1="180" x2={width - 8} y2="180" className="stroke-border" />{data.map((point, index) => { const x = 40 + index * ((width - 56) / Math.max(data.length - 1, 1)); const visitY = 180 - ((point.visits ?? 0) / visitsMax) * 130; const revenueY = 180 - ((point.revenue ?? point.confirmed_revenue ?? 0) / revenueMax) * 130; return <g key={point.date}><title>{`${chartDate(point.date)}: ${formatNumber(point.visits)} lượt khám, ${formatCurrency(point.revenue ?? point.confirmed_revenue ?? 0)}`}</title><line x1={x} y1="180" x2={x} y2={visitY} stroke="#2563eb" strokeWidth="5" strokeLinecap="round" /><circle cx={x} cy={revenueY} r="3.5" fill="#7c3aed" />{(data.length <= 14 || index % Math.ceil(data.length / 8) === 0) && <text x={x} y="202" textAnchor="middle" fontSize="10" className="fill-muted-foreground">{chartDate(point.date)}</text>}</g>; })}<text x="32" y="18" fontSize="11" className="fill-blue-600">Cột: lượt khám</text><text x="150" y="18" fontSize="11" className="fill-violet-600">Chấm: doanh thu</text></svg><div className="sr-only"><table><caption>Dữ liệu xu hướng theo ngày</caption><tbody>{data.map((point) => <tr key={point.date}><th>{point.date}</th><td>{formatNumber(point.visits)} lượt khám</td><td>{formatCurrency(point.revenue ?? point.confirmed_revenue ?? 0)}</td></tr>)}</tbody></table></div></div>; }
function AttentionList({ items, range, onSelect }: { items: AttentionItem[]; range: DashboardRange; onSelect: (id: string) => void }) { return <Card><CardHeader><CardTitle>Cần chú ý</CardTitle><CardDescription>Chỉ hiển thị số lượng tổng hợp theo chi nhánh.</CardDescription></CardHeader><CardContent>{items.length === 0 ? <p className="py-6 text-center text-sm text-muted-foreground">Không có mục nào cần theo dõi.</p> : <ul className="space-y-3">{items.map((item, index) => { const id = getBranchId(item); const isSchedule = /overdue|appointment_outcome|cancel|no_show/.test(item.kind); return <li className="rounded-lg border border-border p-3" key={`${item.kind}-${id}-${index}`}><div className="flex items-start justify-between gap-3"><div><p className="text-sm font-medium">{attentionLabel(item.kind)}</p><p className="mt-0.5 text-xs text-muted-foreground">{getBranchName(item)}</p></div><span className="rounded-full bg-amber-100 px-2 py-0.5 text-sm font-semibold text-amber-900 dark:bg-amber-950 dark:text-amber-100">{formatNumber(item.count)}</span></div><div className="mt-2 flex gap-3 text-xs"><button type="button" onClick={() => onSelect(id)} className="text-primary hover:underline">Xem tổng quan</button>{isSchedule ? <Link className="text-primary hover:underline" to={`/schedule?branch_id=${encodeURIComponent(id)}`}>Xem lịch hẹn</Link> : <Link className="text-primary hover:underline" to={`${dashboardRoute}?range=${range}&branch_id=${encodeURIComponent(id)}`}>Giữ ngữ cảnh</Link>}</div></li>; })}</ul>}</CardContent></Card>; }
function BranchComparison({ rows, onSelect }: { rows: BranchPerformance[]; onSelect: (id: string) => void }) {
  const deltaClass = (value: number | undefined) => value === undefined ? "text-muted-foreground" : value >= 0 ? "text-emerald-600" : "text-destructive";
  const deltaLabel = (current: number, previous: number) => {
    const delta = percentChange(current, previous);
    return delta === undefined ? "--" : `${delta >= 0 ? "+" : ""}${new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 1 }).format(delta)}%`;
  };

  return <Card><CardHeader><CardTitle>So sánh chi nhánh</CardTitle><CardDescription>Chọn một chi nhánh để lọc toàn bộ tổng quan.</CardDescription></CardHeader><CardContent>{rows.length === 0 ? <p className="py-8 text-center text-sm text-muted-foreground">Chưa có chi nhánh hoặc dữ liệu so sánh.</p> : <><div className="space-y-3 md:hidden">{rows.map((row) => <button type="button" key={getBranchId(row)} onClick={() => onSelect(getBranchId(row))} className="w-full rounded-lg border border-border p-4 text-left hover:bg-accent"><div className="flex justify-between gap-4"><span className="font-medium">{getBranchName(row)}</span><span className="font-semibold">{formatCurrency(row.confirmed_revenue)}</span></div><div className="mt-1 flex gap-3 text-xs"><span className={deltaClass(percentChange(row.confirmed_revenue, row.previous_revenue))}>DT {deltaLabel(row.confirmed_revenue, row.previous_revenue)}</span><span className={deltaClass(percentChange(row.visits, row.previous_visits))}>Khám {deltaLabel(row.visits, row.previous_visits)}</span></div><div className="mt-3 grid grid-cols-3 gap-2 text-xs text-muted-foreground"><span>{formatNumber(row.visits)} khám</span><span>{formatNumber(row.appointments)} lịch</span><span>{formatPercent(row.completion_rate)} hoàn thành</span><span>{formatNumber(row.new_patients)} BN mới</span><span>{formatNumber(row.pending_plans)} chờ duyệt</span><span>{formatNumber(row.cancellations + row.no_shows)} hủy/vắng</span></div></button>)}</div><div className="hidden overflow-x-auto md:block"><table className="w-full min-w-[900px] text-sm"><thead className="border-b text-left text-xs text-muted-foreground"><tr><th className="p-3">Chi nhánh</th><th className="p-3 text-right">Doanh thu</th><th className="p-3 text-right">Lượt khám</th><th className="p-3 text-right">Lịch hẹn</th><th className="p-3 text-right">Hoàn thành</th><th className="p-3 text-right">BN mới</th><th className="p-3 text-right">Chờ duyệt</th><th className="p-3 text-right">Hủy/vắng</th></tr></thead><tbody>{rows.map((row) => <tr key={getBranchId(row)} className="border-b last:border-0 hover:bg-accent/50"><td className="p-3"><button type="button" onClick={() => onSelect(getBranchId(row))} className="font-medium text-primary hover:underline">{getBranchName(row)}</button></td><td className="p-3 text-right"><p>{formatCurrency(row.confirmed_revenue)}</p><p className={`text-xs ${deltaClass(percentChange(row.confirmed_revenue, row.previous_revenue))}`}>{deltaLabel(row.confirmed_revenue, row.previous_revenue)}</p></td><td className="p-3 text-right"><p>{formatNumber(row.visits)}</p><p className={`text-xs ${deltaClass(percentChange(row.visits, row.previous_visits))}`}>{deltaLabel(row.visits, row.previous_visits)}</p></td><td className="p-3 text-right">{formatNumber(row.appointments)}</td><td className="p-3 text-right">{formatPercent(row.completion_rate)}</td><td className="p-3 text-right">{formatNumber(row.new_patients)}</td><td className="p-3 text-right">{formatNumber(row.pending_plans)}</td><td className="p-3 text-right">{formatNumber(row.cancellations + row.no_shows)}</td></tr>)}</tbody></table></div></>}</CardContent></Card>;
}
function DashboardSkeleton() { return <div className="space-y-6"><div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7">{Array.from({ length: 7 }, (_, index) => <div key={index} className="h-28 animate-pulse rounded-xl bg-muted" />)}</div><div className="grid gap-5 lg:grid-cols-3"><div className="h-80 animate-pulse rounded-xl bg-muted lg:col-span-2" /><div className="h-80 animate-pulse rounded-xl bg-muted" /></div></div>; }
function EmptyDashboard() { return <Card><CardHeader><CardTitle>Chưa có hoạt động trong kỳ này</CardTitle><CardDescription>Các chi nhánh sẽ xuất hiện khi có lịch hẹn, lượt khám, bệnh nhân mới hoặc thanh toán xác nhận.</CardDescription></CardHeader></Card>; }
function RefreshIcon({ spinning }: { spinning: boolean }) { return <svg className={`h-4 w-4 ${spinning ? "animate-spin" : ""}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 11a8 8 0 10.85 3.87M20 4v7h-7" /></svg>; }
function LiveStatus({ status }: { status: DashboardStreamStatus }) { const labels: Record<DashboardStreamStatus, string> = { live: "Cập nhật trực tiếp", reconnecting: "Đang kết nối lại", offline: "Tạm dừng khi tab ẩn" }; const colors: Record<DashboardStreamStatus, string> = { live: "bg-emerald-400", reconnecting: "bg-amber-400", offline: "bg-slate-400" }; return <span className="inline-flex items-center gap-1.5"><span className={`h-2 w-2 rounded-full ${colors[status]}`} aria-hidden="true" />{labels[status]}</span>; }
function attentionLabel(kind: string) { const labels: Record<string, string> = { cancelled: "Lịch hẹn đã hủy hôm nay", cancellation: "Lịch hẹn đã hủy hôm nay", no_show: "Khách không đến hôm nay", overdue: "Lịch hẹn quá giờ chưa kết thúc", overdue_today: "Lịch hẹn quá giờ chưa kết thúc", overdue_appointment: "Lịch hẹn quá giờ chưa kết thúc", appointment_outcome: "Lịch hẹn đã hủy hoặc khách không đến", pending_plan: "Kế hoạch điều trị chờ duyệt", pending_plans: "Kế hoạch điều trị chờ duyệt" }; return labels[kind] ?? "Mục cần theo dõi"; }
