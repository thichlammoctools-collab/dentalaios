import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { apiGet } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { formatDateTime, formatCurrency } from "@/lib/utils";
import type { Visit, Patient } from "@shared/types";

interface VisitsResponse {
  items: Visit[];
  total: number;
}

interface PatientsResponse {
  items: Patient[];
  total: number;
}

export function TodayPage() {
  const [visits, setVisits] = useState<Visit[]>([]);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const [v, p] = await Promise.all([
          apiGet<VisitsResponse>("/api/visits?limit=20"),
          apiGet<PatientsResponse>("/api/patients?limit=10"),
        ]);
        if (!mounted) return;
        setVisits(v.items);
        setPatients(p.items);
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

  // Stats
  const todayStr = new Date().toISOString().slice(0, 10);
  const todayVisits = visits.filter((v) => v.date?.slice(0, 10) === todayStr);
  const inProgress = visits.filter((v) => v.status === "in_progress");
  const totalPatients = patients.length;

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-6 py-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Today</h1>
        <p className="text-sm text-muted-foreground">
          Tổng quan lượt khám và bệnh nhân gần đây.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader>
            <CardDescription>Lượt khám hôm nay</CardDescription>
            <CardTitle className="text-3xl">{todayVisits.length}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Đang điều trị</CardDescription>
            <CardTitle className="text-3xl">{inProgress.length}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Tổng bệnh nhân</CardDescription>
            <CardTitle className="text-3xl">{totalPatients}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Lượt khám gần đây</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-muted-foreground">Đang tải…</p>
          ) : visits.length === 0 ? (
            <p className="text-sm text-muted-foreground">Chưa có lượt khám nào.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Ngày</TableHead>
                  <TableHead>Trạng thái</TableHead>
                  <TableHead>Bệnh nhân</TableHead>
                  <TableHead>Ghi chú</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visits.map((v) => (
                  <TableRow key={v.id}>
                    <TableCell>{formatDateTime(v.date)}</TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          v.status === "completed"
                            ? "success"
                            : v.status === "cancelled"
                              ? "destructive"
                              : "warning"
                        }
                      >
                        {v.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Link
                        to={`/patients/${v.patient_id}`}
                        className="text-primary hover:underline"
                      >
                        {v.patient_id.slice(0, 8)}
                      </Link>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {v.notes ?? "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}