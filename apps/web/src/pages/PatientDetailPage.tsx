import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { PatientForm } from "@/components/PatientForm";
import { VisitForm } from "@/components/VisitForm";
import { MedicalAlertsList } from "@/components/MedicalAlertsList";
import { PaymentForm } from "@/components/PaymentForm";
import { apiGet, ApiError } from "@/lib/api";
import { toast } from "@/lib/toast";
import { formatCurrency, formatDate, formatDateTime } from "@/lib/utils";
import type {
  Patient,
  MedicalAlert,
  Visit,
  TreatmentPlan,
  Payment,
} from "@shared/types";

interface ListResponse<T> {
  items: T[];
  total: number;
}

export function PatientDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [patient, setPatient] = useState<Patient | null>(null);
  const [alerts, setAlerts] = useState<MedicalAlert[]>([]);
  const [visits, setVisits] = useState<Visit[]>([]);
  const [plans, setPlans] = useState<TreatmentPlan[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [openEdit, setOpenEdit] = useState(false);
  const [openVisit, setOpenVisit] = useState(false);
  const [openPayment, setOpenPayment] = useState(false);

  async function load() {
    if (!id) return;
    setLoading(true);
    try {
      const p = await apiGet<Patient>(`/api/patients/${id}`);
      const [a, v, tp, pay] = await Promise.all([
        apiGet<ListResponse<MedicalAlert>>(`/api/patients/${id}/alerts`),
        apiGet<ListResponse<Visit>>(`/api/visits?patient_id=${id}`),
        apiGet<ListResponse<TreatmentPlan>>(`/api/treatment-plans?patient_id=${id}`),
        apiGet<ListResponse<Payment>>(`/api/payments?patient_id=${id}`),
      ]);
      setPatient(p);
      setAlerts(a.items);
      setVisits(v.items);
      setPlans(tp.items);
      setPayments(pay.items);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Lỗi tải");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  if (loading || !patient) {
    return <p className="px-6 py-6 text-sm text-muted-foreground">Đang tải…</p>;
  }

  const totalPaid = payments
    .filter((p) => p.status === "confirmed")
    .reduce((sum, p) => sum + p.amount, 0);

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-6 py-6">
      <div>
        <p className="text-sm text-muted-foreground">
          <a href="/patients" className="hover:underline">
            ← Danh sách bệnh nhân
          </a>
        </p>
        <div className="mt-1 flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">{patient.name}</h1>
            <p className="text-sm text-muted-foreground">
              {formatDate(patient.date_of_birth)} ·{" "}
              {patient.gender === "M" ? "Nam" : patient.gender === "F" ? "Nữ" : "Khác"} ·{" "}
              {patient.phone}
              {patient.email && ` · ${patient.email}`}
            </p>
          </div>
          <Button variant="outline" onClick={() => setOpenEdit(true)}>
            Sửa
          </Button>
        </div>
      </div>

      <Tabs defaultValue="info">
        <TabsList>
          <TabsTrigger value="info">Thông tin</TabsTrigger>
          <TabsTrigger value="alerts">Cảnh báo ({alerts.length})</TabsTrigger>
          <TabsTrigger value="visits">Lượt khám ({visits.length})</TabsTrigger>
          <TabsTrigger value="plans">Kế hoạch ({plans.length})</TabsTrigger>
          <TabsTrigger value="payments">Thanh toán ({payments.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="info">
          <Card>
            <CardHeader>
              <CardTitle>Thông tin chi tiết</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-muted-foreground">Họ tên</p>
                <p className="font-medium">{patient.name}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Ngày sinh</p>
                <p className="font-medium">{formatDate(patient.date_of_birth)}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Số điện thoại</p>
                <p className="font-medium">{patient.phone}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Email</p>
                <p className="font-medium">{patient.email ?? "—"}</p>
              </div>
              <div className="col-span-2">
                <p className="text-muted-foreground">Ghi chú</p>
                <p className="font-medium">{patient.notes ?? "—"}</p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="alerts">
          <Card>
            <CardContent className="pt-6">
              <MedicalAlertsList
                patientId={patient.id}
                alerts={alerts}
                onCreated={(a) => setAlerts((prev) => [a, ...prev])}
                onDeleted={(aid) => setAlerts((prev) => prev.filter((x) => x.id !== aid))}
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="visits">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Lượt khám</CardTitle>
                <Button size="sm" onClick={() => setOpenVisit(true)}>
                  + Tạo lượt khám
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {visits.length === 0 ? (
                <p className="text-sm text-muted-foreground">Chưa có lượt khám nào.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Ngày</TableHead>
                      <TableHead>Trạng thái</TableHead>
                      <TableHead>Ghi chú</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {visits.map((v) => (
                      <TableRow
                        key={v.id}
                        className="cursor-pointer"
                        onClick={() => navigate(`/visits/${v.id}`)}
                      >
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
        </TabsContent>

        <TabsContent value="plans">
          <Card>
            <CardContent className="pt-6">
              {plans.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Chưa có kế hoạch nào. Tạo từ một lượt khám.
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Ngày tạo</TableHead>
                      <TableHead>Trạng thái</TableHead>
                      <TableHead className="text-right">Tổng</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {plans.map((p) => (
                      <TableRow
                        key={p.id}
                        className="cursor-pointer"
                        onClick={() => navigate(`/treatment-plans/${p.id}`)}
                      >
                        <TableCell>{formatDateTime(p.created_at)}</TableCell>
                        <TableCell>
                          <Badge
                            variant={
                              p.status === "approved" || p.status === "completed"
                                ? "success"
                                : p.status === "cancelled"
                                  ? "destructive"
                                  : "warning"
                            }
                          >
                            {p.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          {formatCurrency(p.total_cost, p.currency)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="payments">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Thanh toán</CardTitle>
                  <p className="text-sm text-muted-foreground">
                    Tổng đã thanh toán:{" "}
                    <strong>{formatCurrency(totalPaid, "VND")}</strong>
                  </p>
                </div>
                <Button size="sm" onClick={() => setOpenPayment(true)}>
                  + Ghi nhận thanh toán
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {payments.length === 0 ? (
                <p className="text-sm text-muted-foreground">Chưa có thanh toán.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Ngày</TableHead>
                      <TableHead>Số tiền</TableHead>
                      <TableHead>Phương thức</TableHead>
                      <TableHead>Trạng thái</TableHead>
                      <TableHead>Mã tham chiếu</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {payments.map((p) => (
                      <TableRow key={p.id}>
                        <TableCell>{formatDateTime(p.created_at)}</TableCell>
                        <TableCell>{formatCurrency(p.amount, p.currency)}</TableCell>
                        <TableCell>{p.method}</TableCell>
                        <TableCell>
                          <Badge
                            variant={
                              p.status === "confirmed"
                                ? "success"
                                : p.status === "failed"
                                  ? "destructive"
                                  : "warning"
                            }
                          >
                            {p.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {p.reference ?? "—"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <PatientForm
        open={openEdit}
        onOpenChange={setOpenEdit}
        patient={patient}
        onSaved={() => load()}
      />
      <VisitForm
        open={openVisit}
        onOpenChange={setOpenVisit}
        patientId={patient.id}
        onCreated={(v) => {
          setVisits((prev) => [v, ...prev]);
          navigate(`/visits/${v.id}`);
        }}
      />
      <PaymentForm
        open={openPayment}
        onOpenChange={setOpenPayment}
        patientId={patient.id}
        plans={plans.filter((p) => p.status === "approved" || p.status === "completed")}
        onCreated={(pay) => setPayments((prev) => [pay, ...prev])}
      />
    </div>
  );
}