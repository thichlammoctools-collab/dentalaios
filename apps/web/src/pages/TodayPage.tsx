import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { apiGet, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { createDashboardStream, type DashboardStreamStatus } from "@/lib/dashboard-stream";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency } from "@/lib/utils";
import { ROUTES } from "@shared/constants";
import { PageContainer } from "@/components/PageContainer";
import type {
  BranchDashboardActionGroup,
  BranchDashboardActionItem,
  BranchDashboardActionKind,
  BranchDashboardSnapshot,
  ManagementDashboardDailyPoint,
} from "@shared/types";

const actionOrder: BranchDashboardActionKind[] = [
  "overdue_appointment",
  "unconfirmed_appointment",
  "appointment_outcome",
  "pending_plan",
];

function formatNumber(value: number | null | undefined) {
  return typeof value === "number" ? new Intl.NumberFormat("vi-VN").format(value) : "--";
}

function formatPercent(value: number | null | undefined) {
  return typeof value === "number"
    ? `${new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 1 }).format(value * 100)}%`
    : "--";
}

function percentChange(current: number, previous: number) {
  return previous === 0 ? undefined : ((current - previous) / Math.abs(previous)) * 100;
}

function hcmDate(value?: string) {
  return new Intl.DateTimeFormat("vi-VN", {
    timeZone: "Asia/Ho_Chi_Minh",
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(value ? new Date(value) : new Date());
}

function hcmTime(value: string) {
  return new Intl.DateTimeFormat("vi-VN", {
    timeZone: "Asia/Ho_Chi_Minh",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function actionLabel(kind: BranchDashboardActionKind) {
  const labels: Record<BranchDashboardActionKind, string> = {
    overdue_appointment: "Lịch quá giờ chưa kết thúc",
    unconfirmed_appointment: "Lịch hôm nay chưa xác nhận",
    appointment_outcome: "Lịch đã hủy hoặc khách không đến",
    pending_plan: "Kế hoạch điều trị bản nháp",
  };
  return labels[kind];
}

function actionDescription(kind: BranchDashboardActionKind) {
  const descriptions: Record<BranchDashboardActionKind, string> = {
    overdue_appointment: "Kiểm tra tình trạng ca khám và hoàn tất quy trình phù hợp.",
    unconfirmed_appointment: "Liên hệ khách trước giờ hẹn để giảm rủi ro vắng mặt.",
    appointment_outcome: "Theo dõi và sắp xếp gọi lại khách khi phù hợp.",
    pending_plan: "Rà soát kế hoạch còn chờ xử lý tại chi nhánh.",
  };
  return descriptions[kind];
}

function actionClass(kind: BranchDashboardActionKind) {
  const classes: Record<BranchDashboardActionKind, string> = {
    overdue_appointment: "border-red-200 bg-red-50/60 dark:border-red-900 dark:bg-red-950/25",
    unconfirmed_appointment: "border-amber-200 bg-amber-50/60 dark:border-amber-900 dark:bg-amber-950/25",
    appointment_outcome: "border-orange-200 bg-orange-50/60 dark:border-orange-900 dark:bg-orange-950/25",
    pending_plan: "border-violet-200 bg-violet-50/60 dark:border-violet-900 dark:bg-violet-950/25",
  };
  return classes[kind];
}

export function TodayPage() {
  const { session } = useAuth();
  const [snapshot, setSnapshot] = useState<BranchDashboardSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [streamStatus, setStreamStatus] = useState<DashboardStreamStatus>("reconnecting");
  const requestId = useRef(0);

  async function loadSnapshot(manual = false) {
    const currentRequest = ++requestId.current;
    manual ? setRefreshing(true) : setLoading(true);
    setError(null);
    try {
      const next = await apiGet<BranchDashboardSnapshot>("/api/dashboard/branch");
      if (currentRequest !== requestId.current) return;
      setSnapshot(next);
    } catch (cause) {
      if (currentRequest !== requestId.current) return;
      setError(cause instanceof ApiError ? cause.message : "Không thể tải dữ liệu điều hành chi nhánh.");
    } finally {
      if (currentRequest === requestId.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }

  useEffect(() => {
    void loadSnapshot();
    // Initial branch scope comes from the server-side JWT, not browser state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const stream = createDashboardStream({
      onInvalidate: () => void loadSnapshot(true),
      onStatusChange: setStreamStatus,
    });
    return () => stream.stop();
    // Stream refetches the same branch-scoped endpoint.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const actions = [...(snapshot?.actions ?? [])].sort(
    (left, right) => actionOrder.indexOf(left.kind) - actionOrder.indexOf(right.kind),
  );
  const hasActions = actions.some((group) => group.count > 0);

  return (
    <PageContainer size="wide" className="space-y-5 sm:space-y-6">
      <section className="overflow-hidden rounded-2xl bg-gradient-to-br from-blue-700 via-indigo-700 to-violet-800 p-5 text-white shadow-lg sm:p-7">
        <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-end">
          <div>
            <p className="text-sm font-medium text-blue-100">{snapshot?.branch.name ?? session?.branch.name}</p>
            <h2 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">Điều hành chi nhánh</h2>
            <p className="mt-2 text-sm text-blue-100">{hcmDate(snapshot?.today_start)} · Theo giờ Hồ Chí Minh</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button asChild className="bg-white text-blue-700 hover:bg-blue-50">
              <Link to={ROUTES.SCHEDULE_NEW}>+ Tạo lịch hẹn</Link>
            </Button>
            <Button asChild variant="outline" className="border-white/30 bg-white/10 text-white hover:bg-white/20 hover:text-white">
              <Link to={ROUTES.PATIENTS}>+ Tạo bệnh nhân</Link>
            </Button>
            <Button variant="outline" onClick={() => void loadSnapshot(true)} disabled={refreshing} className="border-white/30 bg-white/10 text-white hover:bg-white/20 hover:text-white">
              <RefreshIcon spinning={refreshing} /> Làm mới
            </Button>
          </div>
        </div>
        <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-blue-100">
          <LiveStatus status={streamStatus} />
          <span>{snapshot ? `Cập nhật ${hcmTime(snapshot.generated_at)}` : "Đang lấy dữ liệu"}</span>
        </div>
      </section>

      {error ? (
        <Card>
          <CardHeader><CardTitle>Không thể tải điều hành chi nhánh</CardTitle><CardDescription>{error}</CardDescription></CardHeader>
          <CardContent><Button onClick={() => void loadSnapshot(true)}>Thử lại</Button></CardContent>
        </Card>
      ) : loading ? (
        <DashboardSkeleton />
      ) : snapshot ? (
        <>
          <section>
            <div className="mb-3 flex items-baseline justify-between gap-3">
              <div><h3 className="text-lg font-semibold">Luồng khách hôm nay</h3><p className="text-sm text-muted-foreground">Theo dõi lịch, khách đến và tiến độ khám tại chi nhánh.</p></div>
              <span className="text-xs text-muted-foreground">Scope cố định theo chi nhánh đăng nhập</span>
            </div>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-8">
              <MetricCard label="Đã đặt lịch" value={formatNumber(snapshot.today.scheduled)} />
              <MetricCard label="Chưa xác nhận" value={formatNumber(snapshot.today.unconfirmed)} risk="warning" />
              <MetricCard label="Đã đến" value={formatNumber(snapshot.today.arrived)} />
              <MetricCard label="Đang khám" value={formatNumber(snapshot.today.in_progress_visits)} />
              <MetricCard label="Hoàn thành" value={formatNumber(snapshot.today.completed)} positive />
              <MetricCard label="Đã hủy" value={formatNumber(snapshot.today.cancellations)} risk="warning" />
              <MetricCard label="Không đến" value={formatNumber(snapshot.today.no_shows)} risk="danger" />
              <MetricCard label="Doanh thu xác nhận hôm nay" value={formatCurrency(snapshot.today.confirmed_revenue)} money positive />
            </div>
          </section>

          <section className="grid gap-5 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader><CardTitle>Hiệu quả 7 ngày đã hoàn tất</CardTitle><CardDescription>So sánh với 7 ngày ngay trước kỳ hiện tại.</CardDescription></CardHeader>
              <CardContent className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                <MetricCard label="Doanh thu xác nhận" value={formatCurrency(snapshot.kpis.confirmed_revenue)} delta={percentChange(snapshot.kpis.confirmed_revenue, snapshot.kpis.previous_revenue)} money />
                <MetricCard label="Lượt khám" value={formatNumber(snapshot.kpis.visits)} delta={percentChange(snapshot.kpis.visits, snapshot.kpis.previous_visits)} />
                <MetricCard label="Tỷ lệ hoàn thành" value={formatPercent(snapshot.kpis.completion_rate)} />
                <MetricCard label="Lịch hẹn" value={formatNumber(snapshot.kpis.appointments)} />
                <MetricCard label="Bệnh nhân mới" value={formatNumber(snapshot.kpis.new_patients)} />
                <MetricCard label="Plan bản nháp" value={formatNumber(snapshot.kpis.pending_plans)} risk={snapshot.kpis.pending_plans > 0 ? "warning" : undefined} />
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle>Chỉ số rủi ro 7 ngày</CardTitle><CardDescription>Hủy/vắng cần được xem cùng tổng số lịch hẹn.</CardDescription></CardHeader>
              <CardContent className="space-y-4">
                <RiskRow label="Hủy + không đến" value={snapshot.kpis.cancellations + snapshot.kpis.no_shows} denominator={snapshot.kpis.appointments} />
                <RiskRow label="Kế hoạch bản nháp" value={snapshot.kpis.pending_plans} />
                <Link to={ROUTES.SCHEDULE} className="inline-flex text-sm font-medium text-primary hover:underline">Mở lịch hẹn chi nhánh →</Link>
              </CardContent>
            </Card>
          </section>

          <section className="grid gap-5 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader><CardTitle>Xu hướng lượt khám và doanh thu</CardTitle><CardDescription>7 ngày hoàn tất gần nhất.</CardDescription></CardHeader>
              <CardContent><DailyChart data={snapshot.daily} /></CardContent>
            </Card>
            <ActionSummary groups={actions} hasActions={hasActions} />
          </section>

          {hasActions && <ActionCenter groups={actions} branchId={snapshot.branch.id} />}
        </>
      ) : null}
    </PageContainer>
  );
}

function MetricCard({ label, value, delta, money, positive, risk }: {
  label: string;
  value: string;
  delta?: number;
  money?: boolean;
  positive?: boolean;
  risk?: "warning" | "danger";
}) {
  const border = risk === "danger" ? "border-red-200 dark:border-red-900" : risk === "warning" ? "border-amber-200 dark:border-amber-900" : positive ? "border-emerald-200 dark:border-emerald-900" : "";
  return <Card className={border}><CardContent className="p-4"><p className="text-xs font-medium text-muted-foreground">{label}</p><p className={`mt-2 truncate font-semibold ${money ? "text-lg" : "text-2xl"}`}>{value}</p>{typeof delta === "number" && <p className={`mt-1 text-xs ${delta >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-destructive"}`}>{delta >= 0 ? "+" : ""}{new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 1 }).format(delta)}% so với kỳ trước</p>}</CardContent></Card>;
}

function RiskRow({ label, value, denominator }: { label: string; value: number; denominator?: number }) {
  const percentage = denominator ? (value / denominator) * 100 : undefined;
  return <div className="flex items-end justify-between gap-3"><div><p className="text-sm font-medium">{label}</p><p className="text-xs text-muted-foreground">{denominator ? `Trên ${formatNumber(denominator)} lịch hẹn` : "Cần rà soát theo tuổi chờ"}</p></div><div className="text-right"><p className="text-2xl font-semibold">{formatNumber(value)}</p>{percentage !== undefined && <p className="text-xs text-muted-foreground">{new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 1 }).format(percentage)}%</p>}</div></div>;
}

function ActionSummary({ groups, hasActions }: { groups: BranchDashboardActionGroup[]; hasActions: boolean }) {
  return <Card className={hasActions ? "border-amber-200 dark:border-amber-900" : "border-emerald-200 dark:border-emerald-900"}><CardHeader><CardTitle>Cần xử lý ngay</CardTitle><CardDescription>{hasActions ? "Các việc được ưu tiên theo mức độ ảnh hưởng vận hành." : "Không có việc vận hành cần xử lý ngay."}</CardDescription></CardHeader><CardContent>{hasActions ? <ul className="space-y-3">{groups.filter((group) => group.count > 0).map((group) => <li key={group.kind} className="flex items-start justify-between gap-3"><div><p className="text-sm font-medium">{actionLabel(group.kind)}</p><p className="text-xs text-muted-foreground">{actionDescription(group.kind)}</p></div><span className="rounded-full bg-amber-100 px-2 py-0.5 text-sm font-semibold text-amber-900 dark:bg-amber-950 dark:text-amber-100">{formatNumber(group.count)}</span></li>)}</ul> : <div className="rounded-lg bg-emerald-50 p-4 text-sm text-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-100">Luồng lịch hẹn và kế hoạch hiện không có ngoại lệ cần theo dõi.</div>}</CardContent></Card>;
}

function ActionCenter({ groups, branchId }: { groups: BranchDashboardActionGroup[]; branchId: string }) {
  return <section><div className="mb-3"><h3 className="text-lg font-semibold">Action Center</h3><p className="text-sm text-muted-foreground">Mở bản ghi phù hợp để tiếp tục xử lý, không hiển thị dữ liệu lâm sàng trên dashboard.</p></div><div className="grid gap-4 xl:grid-cols-2">{groups.filter((group) => group.count > 0).map((group) => <ActionGroupCard key={group.kind} group={group} branchId={branchId} />)}</div></section>;
}

function ActionGroupCard({ group, branchId }: { group: BranchDashboardActionGroup; branchId: string }) {
  const scheduleStatus = group.kind === "appointment_outcome"
    ? "cancelled,no_show"
    : group.kind === "unconfirmed_appointment"
      ? "booked"
      : group.kind === "overdue_appointment"
        ? "booked,confirmed,arrived,in_progress"
        : undefined;
  const moreHref = scheduleStatus
    ? `${ROUTES.SCHEDULE}?branch_id=${encodeURIComponent(branchId)}&status=${encodeURIComponent(scheduleStatus)}`
    : undefined;
  return <Card className={actionClass(group.kind)}><CardHeader className="pb-3"><div className="flex items-start justify-between gap-3"><div><CardTitle className="text-base">{actionLabel(group.kind)}</CardTitle><CardDescription>{actionDescription(group.kind)}</CardDescription></div><span className="rounded-full bg-card px-2.5 py-1 text-sm font-semibold shadow-sm">{formatNumber(group.count)}</span></div></CardHeader><CardContent>{group.items.length > 0 && <ul className="divide-y divide-border/70">{group.items.map((item) => <ActionItem key={item.id} item={item} kind={group.kind} />)}</ul>}{group.remaining_count > 0 && <div className="mt-3 flex items-center justify-between gap-3 text-xs text-muted-foreground"><span>Còn {formatNumber(group.remaining_count)} mục cùng loại.</span>{moreHref && <Link className="font-medium text-primary hover:underline" to={moreHref}>Xem thêm →</Link>}</div>}</CardContent></Card>;
}

function ActionItem({ item, kind }: { item: BranchDashboardActionItem; kind: BranchDashboardActionKind }) {
  const href = item.entity_type === "appointment"
    ? `/appointments/${encodeURIComponent(item.id)}`
    : `/treatment-plans/${encodeURIComponent(item.id)}`;
  const timestamp = item.scheduled_at ?? item.created_at;
  const meta = timestamp ? hcmTime(timestamp) : "";
  return <li className="flex items-center justify-between gap-3 py-2.5"><div className="min-w-0"><p className="truncate text-sm font-medium">{item.patient_name}</p><p className="text-xs text-muted-foreground">{item.entity_type === "appointment" ? `${meta} · ${item.status}` : `Tạo ${meta} · bản nháp`}{kind === "overdue_appointment" && item.due_at ? ` · quá giờ từ ${hcmTime(item.due_at)}` : ""}</p></div><Link className="shrink-0 text-xs font-medium text-primary hover:underline" to={href}>Mở →</Link></li>;
}

function DailyChart({ data }: { data: ManagementDashboardDailyPoint[] }) {
  if (!data.length || data.every((point) => !point.visits && !point.revenue)) return <p className="py-12 text-center text-sm text-muted-foreground">Chưa có hoạt động trong 7 ngày hoàn tất.</p>;
  const visitsMax = Math.max(...data.map((point) => point.visits), 1);
  const revenueMax = Math.max(...data.map((point) => point.revenue), 1);
  const width = Math.max(560, data.length * 72);
  return <div className="overflow-x-auto"><svg className="min-w-[560px] w-full" viewBox={`0 0 ${width} 220`} role="img" aria-label="Biểu đồ lượt khám và doanh thu theo ngày"><title>Biểu đồ lượt khám và doanh thu theo ngày</title><line x1="32" y1="180" x2={width - 8} y2="180" className="stroke-border" />{data.map((point, index) => { const x = 48 + index * ((width - 72) / Math.max(data.length - 1, 1)); const visitY = 180 - (point.visits / visitsMax) * 125; const revenueY = 180 - (point.revenue / revenueMax) * 125; return <g key={point.date}><title>{`${point.date}: ${formatNumber(point.visits)} lượt khám, ${formatCurrency(point.revenue)}`}</title><line x1={x} y1="180" x2={x} y2={visitY} stroke="#2563eb" strokeWidth="8" strokeLinecap="round" /><circle cx={x} cy={revenueY} r="4" fill="#7c3aed" /><text x={x} y="202" textAnchor="middle" fontSize="10" className="fill-muted-foreground">{point.date.slice(8, 10)}/{point.date.slice(5, 7)}</text></g>; })}<text x="32" y="18" fontSize="11" className="fill-blue-600 dark:fill-blue-400">Cột: lượt khám</text><text x="150" y="18" fontSize="11" className="fill-violet-600 dark:fill-violet-400">Điểm: doanh thu</text></svg></div>;
}

function DashboardSkeleton() {
  return <div className="space-y-6"><div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-8">{Array.from({ length: 8 }, (_, index) => <div key={index} className="h-28 animate-pulse rounded-xl bg-muted" />)}</div><div className="grid gap-5 lg:grid-cols-3"><div className="h-72 animate-pulse rounded-xl bg-muted lg:col-span-2" /><div className="h-72 animate-pulse rounded-xl bg-muted" /></div></div>;
}

function RefreshIcon({ spinning }: { spinning: boolean }) { return <svg className={`h-4 w-4 ${spinning ? "animate-spin" : ""}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 11a8 8 0 10.85 3.87M20 4v7h-7" /></svg>; }
function LiveStatus({ status }: { status: DashboardStreamStatus }) { const labels: Record<DashboardStreamStatus, string> = { live: "Cập nhật trực tiếp", reconnecting: "Đang kết nối lại", offline: "Tạm dừng khi tab ẩn" }; const colors: Record<DashboardStreamStatus, string> = { live: "bg-emerald-400", reconnecting: "bg-amber-400", offline: "bg-slate-400" }; return <span className="inline-flex items-center gap-1.5"><span className={`h-2 w-2 rounded-full ${colors[status]}`} aria-hidden="true" />{labels[status]}</span>; }
