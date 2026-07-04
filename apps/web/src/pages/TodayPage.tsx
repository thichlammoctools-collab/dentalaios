import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { apiGet } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDateTime, formatCurrency } from "@/lib/utils";
import type { Visit, Patient, TreatmentPlan } from "@shared/types";

interface VisitsResponse {
  items: Visit[];
  total: number;
}
interface PatientsResponse {
  items: Patient[];
  total: number;
}
interface PlansResponse {
  items: TreatmentPlan[];
  total: number;
}

export function TodayPage() {
  const [visits, setVisits] = useState<Visit[]>([]);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [plans, setPlans] = useState<TreatmentPlan[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const [v, p, pl] = await Promise.all([
          apiGet<VisitsResponse>("/api/visits?limit=20"),
          apiGet<PatientsResponse>("/api/patients?limit=10"),
          apiGet<PlansResponse>("/api/treatment-plans?limit=20"),
        ]);
        if (!mounted) return;
        setVisits(v.items);
        setPatients(p.items);
        setPlans(pl.items);
      } catch (err) {
        console.error(err);
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const todayStr = new Date().toISOString().slice(0, 10);
  const todayVisits = visits.filter((v) => v.date?.slice(0, 10) === todayStr);
  const inProgress = visits.filter((v) => v.status === "in_progress");
  const totalPatients = patients.length;
  const approvedPlans = plans.filter((p) => p.status === "approved");
  const totalRevenue = approvedPlans.reduce((sum, p) => sum + p.total_cost, 0);

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-6">
      {/* Hero */}
      <div className="overflow-hidden rounded-2xl bg-gradient-to-br from-blue-600 via-indigo-600 to-purple-700 p-8 text-white shadow-lg">
        <h1 className="text-3xl font-bold tracking-tight">Dashboard hôm nay</h1>
        <p className="mt-1 text-blue-100">
          {new Date().toLocaleDateString("vi-VN", {
            weekday: "long",
            day: "2-digit",
            month: "long",
            year: "numeric",
          })}
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Button asChild className="bg-white text-blue-700 hover:bg-blue-50">
            <Link to="/patients">+ Bệnh nhân mới</Link>
          </Button>
          <Button asChild variant="outline" className="border-white/30 bg-white/10 text-white hover:bg-white/20">
            <Link to="/patients">Xem danh sách bệnh nhân</Link>
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard label="Lượt khám hôm nay" value={todayVisits.length} icon="📅" color="blue" />
        <StatCard label="Đang điều trị" value={inProgress.length} icon="⚡" color="amber" />
        <StatCard label="Tổng bệnh nhân" value={totalPatients} icon="🧑‍⚕️" color="emerald" />
        <StatCard
          label="Doanh thu (kế hoạch)"
          value={formatCurrency(totalRevenue, "VND")}
          icon="💰"
          color="purple"
        />
      </div>

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
              <p className="text-sm text-muted-foreground py-8 text-center">Đang tải…</p>
            ) : visits.length === 0 ? (
              <EmptyState
                icon="📅"
                title="Chưa có lượt khám nào"
                description="Tạo bệnh nhân trước, sau đó vào chi tiết bệnh nhân để tạo lượt khám."
                action={
                  <Button asChild size="sm">
                    <Link to="/patients">+ Bệnh nhân mới</Link>
                  </Button>
                }
              />
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
                  {visits.slice(0, 5).map((v) => (
                    <TableRow
                      key={v.id}
                      className="cursor-pointer"
                      onClick={() => (window.location.href = `/visits/${v.id}`)}
                    >
                      <TableCell className="text-xs">{formatDateTime(v.date)}</TableCell>
                      <TableCell>
                        <StatusBadge status={v.status} />
                      </TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">
                        {v.patient_id.slice(0, 8)}…
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Active plans */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span>Kế hoạch đang xử lý</span>
              <span className="text-sm font-normal text-muted-foreground">
                {plans.length} tổng
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <p className="text-sm text-muted-foreground py-8 text-center">Đang tải…</p>
            ) : plans.length === 0 ? (
              <EmptyState
                icon="📋"
                title="Chưa có kế hoạch nào"
                description="Kế hoạch được tạo từ lượt khám."
              />
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
                  {plans.slice(0, 5).map((p) => (
                    <TableRow
                      key={p.id}
                      className="cursor-pointer"
                      onClick={() => (window.location.href = `/treatment-plans/${p.id}`)}
                    >
                      <TableCell>
                        <StatusBadge status={p.status} />
                      </TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">
                        {p.patient_id.slice(0, 8)}…
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        {formatCurrency(p.total_cost, p.currency)}
                      </TableCell>
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

function StatCard({
  label,
  value,
  icon,
  color,
}: {
  label: string;
  value: number | string;
  icon: string;
  color: "blue" | "amber" | "emerald" | "purple";
}) {
  const colors = {
    blue: "from-blue-50 to-blue-100/50 text-blue-700",
    amber: "from-amber-50 to-amber-100/50 text-amber-700",
    emerald: "from-emerald-50 to-emerald-100/50 text-emerald-700",
    purple: "from-purple-50 to-purple-100/50 text-purple-700",
  };
  return (
    <Card className={`border-0 bg-gradient-to-br ${colors[color]} shadow-sm`}>
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs font-medium uppercase tracking-wider opacity-70">{label}</p>
            <p className="mt-2 text-3xl font-bold">{value}</p>
          </div>
          <span className="text-3xl opacity-50">{icon}</span>
        </div>
      </CardContent>
    </Card>
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

function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon: string;
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="py-10 text-center">
      <div className="mx-auto mb-3 text-4xl opacity-30">{icon}</div>
      <p className="text-sm font-medium text-foreground">{title}</p>
      <p className="mt-1 text-xs text-muted-foreground">{description}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}