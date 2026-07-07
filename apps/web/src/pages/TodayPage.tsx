import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { apiGet } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDateTime, formatCurrency } from "@/lib/utils";
import type { Visit, Patient, TreatmentPlan } from "@shared/types";

interface DashboardStats {
  today: { visits: number; inProgress: number; completed: number };
  totals: { patients: number; visits: number; approvedPlans: number; revenue: number };
  monthlyVisits: { month: string; count: number }[];
  monthlyRevenue: { month: string; amount: number }[];
  recentActivity: { type: string; count: number }[];
}

interface VisitsResponse { items: Visit[]; total: number }
interface PatientsResponse { items: Patient[]; total: number }
interface PlansResponse { items: TreatmentPlan[]; total: number }

export function TodayPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [visits, setVisits] = useState<Visit[]>([]);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [plans, setPlans] = useState<TreatmentPlan[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const [st, v, p, pl] = await Promise.all([
          apiGet<DashboardStats>("/api/dashboard/stats"),
          apiGet<VisitsResponse>("/api/visits?limit=20"),
          apiGet<PatientsResponse>("/api/patients?limit=20"),
          apiGet<PlansResponse>("/api/treatment-plans?limit=20"),
        ]);
        if (!mounted) return;
        setStats(st);
        setVisits(v.items);
        setPatients(p.items);
        setPlans(pl.items);
      } catch (err) {
        console.error(err);
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, []);

  const todayStr = new Date().toISOString().slice(0, 10);
  const todayVisits = visits.filter((v) => v.date?.slice(0, 10) === todayStr);
  const pendingPlans = plans.filter((p) => p.status === "draft");

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 sm:space-y-6 sm:p-6">

      {/* Hero */}
      <div className="overflow-hidden rounded-2xl bg-gradient-to-br from-blue-600 via-indigo-600 to-purple-700 p-5 text-white shadow-lg sm:p-8">
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Dashboard</h1>
        <p className="mt-1 text-sm text-blue-100 sm:text-base">
          {new Date().toLocaleDateString("vi-VN", {
            weekday: "long", day: "2-digit", month: "long", year: "numeric",
          })}
        </p>
        <div className="mt-4 flex flex-wrap gap-2 sm:mt-6 sm:gap-3">
          <Button asChild className="bg-white text-blue-700 hover:bg-blue-50">
            <Link to="/patients">+ Bệnh nhân mới</Link>
          </Button>
          <Button asChild variant="outline" className="border-white/30 bg-white/10 text-white hover:bg-white/20">
            <Link to="/patients">Danh sách bệnh nhân</Link>
          </Button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <StatCard label="Lượt khám hôm nay" value={stats?.today.visits ?? 0} icon="calendar" color="blue" />
        <StatCard label="Đang điều trị" value={stats?.today.inProgress ?? 0} icon="progress" color="amber" />
        <StatCard label="Hoàn thành hôm nay" value={stats?.today.completed ?? 0} icon="check" color="emerald" />
        <StatCard label="Tổng bệnh nhân" value={stats?.totals.patients ?? 0} icon="patients" color="cyan" />
        <StatCard
          label="Doanh thu (VND)"
          value={stats ? formatCurrency(stats.totals.revenue, "VND") : "—"}
          icon="money"
          color="purple"
          small
        />
      </div>

      {/* Charts + Tables */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Monthly Visits Chart */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Lượt khám theo tháng (6 tháng gần nhất)</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="h-40 flex items-center justify-center">
                <div className="h-6 w-6 animate-spin rounded-full border-3 border-muted border-t-primary" />
              </div>
            ) : (
              <BarChart
                data={stats?.monthlyVisits ?? []}
                dataKey="count"
                labelKey="month"
                formatValue={(v) => `${v} lượt`}
                color="#3b82f6"
              />
            )}
          </CardContent>
        </Card>

        {/* KPIs */}
        <Card>
          <CardHeader>
            <CardTitle>Tổng quan</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <KpiRow label="Tổng lượt khám" value={stats?.totals.visits ?? 0} />
            <KpiRow label="Kế hoạch đã duyệt" value={stats?.totals.approvedPlans ?? 0} />
            <KpiRow label="Kế hoạch chờ duyệt" value={pendingPlans.length} accent="amber" />
            <KpiRow label="Bệnh nhân mới (all)" value={stats?.totals.patients ?? 0} />
            <div className="border-t border-border pt-3">
              <KpiRow
                label="Doanh thu"
                value={stats ? formatCurrency(stats.totals.revenue, "VND") : "—"}
                accent="green"
              />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Monthly Revenue Chart */}
      {stats && stats.monthlyRevenue.some((r) => r.amount > 0) && (
        <Card>
          <CardHeader>
            <CardTitle>Doanh thu theo tháng (VND)</CardTitle>
          </CardHeader>
          <CardContent>
            <BarChart
              data={stats.monthlyRevenue}
              dataKey="amount"
              labelKey="month"
              formatValue={(v) => formatCurrency(v, "VND")}
              color="#a855f7"
            />
          </CardContent>
        </Card>
      )}

      {/* Recent + Pending */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Recent visits */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span>Lượt khám gần đây</span>
              <Link to="/patients" className="text-sm font-normal text-primary hover:underline">
                Xem tất cả →
              </Link>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton />
            ) : visits.length === 0 ? (
              <EmptyList message="Chưa có lượt khám nào" />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Ngày</TableHead>
                    <TableHead>Trạng thái</TableHead>
                    <TableHead>Bệnh nhân</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visits.slice(0, 6).map((v) => (
                    <TableRow
                      key={v.id}
                      className="cursor-pointer"
                      onClick={() => { window.location.href = `/visits/${v.id}`; }}
                    >
                      <TableCell className="text-xs">{formatDateTime(v.date)}</TableCell>
                      <TableCell><StatusBadge status={v.status} /></TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">{v.patient_id.slice(0, 8)}…</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Pending plans */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span>Kế hoạch chờ duyệt</span>
              <span className="text-sm font-normal text-muted-foreground">{pendingPlans.length} tổng</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton />
            ) : pendingPlans.length === 0 ? (
              <EmptyList message="Không có kế hoạch nào chờ duyệt" />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Trạng thái</TableHead>
                    <TableHead>Bệnh nhân</TableHead>
                    <TableHead className="text-right">Tổng</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pendingPlans.slice(0, 6).map((p) => (
                    <TableRow
                      key={p.id}
                      className="cursor-pointer"
                      onClick={() => { window.location.href = `/treatment-plans/${p.id}`; }}
                    >
                      <TableCell><StatusBadge status={p.status} /></TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">{p.patient_id.slice(0, 8)}…</TableCell>
                      <TableCell className="text-right font-medium">{formatCurrency(p.total_cost, p.currency)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// ─── Components ────────────────────────────────────────────────────────────────

function StatCard({
  label, value, icon, color, small,
}: {
  label: string; value: number | string;
  icon: "calendar" | "progress" | "check" | "patients" | "money";
  color: "blue" | "amber" | "emerald" | "purple" | "cyan";
  small?: boolean;
}) {
  const colors: Record<string, string> = {
    blue: "from-blue-50 to-blue-100/50 text-blue-700",
    amber: "from-amber-50 to-amber-100/50 text-amber-700",
    emerald: "from-emerald-50 to-emerald-100/50 text-emerald-700",
    purple: "from-purple-50 to-purple-100/50 text-purple-700",
    cyan: "from-cyan-50 to-cyan-100/50 text-cyan-700",
  };
  const icons: Record<string, React.ReactNode> = {
    calendar: <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>,
    progress: <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>,
    check: <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>,
    patients: <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/></svg>,
    money: <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}><path d="M12 1v22M17 5H9.5a3.5 3.5 0 100 7h5a3.5 3.5 0 010 7H6"/></svg>,
  };
  return (
    <Card className={`border-0 bg-gradient-to-br ${colors[color]} shadow-sm`}>
      <CardContent className={`${small ? "p-3 sm:p-4" : "p-4 sm:p-5"}`}>
        <div className="flex items-start justify-between">
          <div>
            <p className="text-[10px] font-medium uppercase tracking-wider opacity-70 sm:text-xs">{label}</p>
            <p className={`font-bold mt-1 sm:mt-2 ${small ? "text-base sm:text-lg" : "text-2xl sm:text-3xl"} truncate`}>{value}</p>
          </div>
          <span className="opacity-60 shrink-0">{icons[icon]}</span>
        </div>
      </CardContent>
    </Card>
  );
}

function KpiRow({
  label, value, accent,
}: { label: string; value: string | number; accent?: string }) {
  const accentColors: Record<string, string> = {
    amber: "text-amber-600",
    green: "text-emerald-600",
  };
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className={`font-semibold ${accent ? accentColors[accent] : "text-foreground"}`}>{value}</span>
    </div>
  );
}

function BarChart({
  data, dataKey, labelKey, formatValue, color,
}: {
  data: { month: string; [key: string]: unknown }[];
  dataKey: string;
  labelKey: string;
  formatValue: (v: number) => string;
  color: string;
}) {
  if (data.length === 0) {
    return (
      <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">
        Chưa có dữ liệu
      </div>
    );
  }

  const maxValue = Math.max(...data.map((d) => Number(d[dataKey]) || 0), 1);
  const chartHeight = 120;
  const barWidth = Math.max(16, Math.min(60, (700 / data.length) - 16));
  const chartWidth = barWidth * data.length + 40;

  // Month labels in Vietnamese
  const monthLabels: Record<string, string> = {
    "01": "Thg 1", "02": "Thg 2", "03": "Thg 3", "04": "Thg 4",
    "05": "Thg 5", "06": "Thg 6", "07": "Thg 7", "08": "Thg 8",
    "09": "Thg 9", "10": "Thg 10", "11": "Thg 11", "12": "Thg 12",
  };

  function getLabel(monthStr: string) {
    const parts = monthStr.split("-");
    if (parts.length === 2) return `${monthLabels[parts[1]] || parts[1]}`;
    return monthStr;
  }

  return (
    <div className="overflow-x-auto">
      <svg
        width={Math.max(chartWidth, 300)}
        height={chartHeight + 50}
        viewBox={`0 0 ${chartWidth} ${chartHeight + 50}`}
        className="w-full"
      >
        {/* Y-axis grid lines */}
        {[0, 0.25, 0.5, 0.75, 1].map((pct) => {
          const y = chartHeight - pct * chartHeight;
          return (
            <g key={pct}>
              <line
                x1="40" y1={y} x2={chartWidth}
                stroke="currentColor"
                strokeWidth="0.5"
                className="text-border"
                strokeDasharray="4,4"
                opacity="0.5"
              />
            </g>
          );
        })}

        {/* Bars */}
        {data.map((d, i) => {
          const value = Number(d[dataKey]) || 0;
          const barHeight = maxValue > 0 ? (value / maxValue) * chartHeight : 0;
          const x = 40 + i * barWidth;
          const y = chartHeight - barHeight;
          const label = getLabel(String(d[labelKey] ?? ""));

          return (
            <g key={i}>
              {/* Bar */}
              <rect
                x={x + 4}
                y={y}
                width={Math.max(barWidth - 8, 4)}
                height={Math.max(barHeight, 2)}
                rx="3"
                fill={color}
                opacity="0.85"
              />
              {/* Value label */}
              {value > 0 && (
                <text
                  x={x + barWidth / 2}
                  y={y - 4}
                  textAnchor="middle"
                  fontSize="9"
                  fill="currentColor"
                  className="text-muted-foreground"
                >
                  {formatValue(value)}
                </text>
              )}
              {/* Month label */}
              <text
                x={x + barWidth / 2}
                y={chartHeight + 16}
                textAnchor="middle"
                fontSize="10"
                fill="currentColor"
                className="text-muted-foreground"
              >
                {label}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { variant: "default" | "success" | "warning" | "destructive" | "secondary" | "outline"; label: string }> = {
    in_progress: { variant: "warning", label: "Đang điều trị" },
    completed: { variant: "success", label: "Hoàn thành" },
    cancelled: { variant: "destructive", label: "Đã hủy" },
    draft: { variant: "outline", label: "Bản nháp" },
    approved: { variant: "success", label: "Đã duyệt" },
  };
  const m = map[status] ?? { variant: "secondary" as const, label: status };
  return <Badge variant={m.variant}>{m.label}</Badge>;
}

function Skeleton() {
  return (
    <div className="space-y-2 py-4">
      {[1, 2, 3].map((i) => (
        <div key={i} className="h-10 rounded-md bg-muted animate-pulse" />
      ))}
    </div>
  );
}

function EmptyList({ message }: { message: string }) {
  return (
    <div className="py-10 text-center">
      <p className="text-sm text-muted-foreground">{message}</p>
    </div>
  );
}
