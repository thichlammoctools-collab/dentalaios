import { useEffect, useState } from "react";
import { Navigate, useNavigate, useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PatientImageGallery } from "@/components/PatientImageGallery";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { PatientForm } from "@/components/PatientForm";
import { ProfileAvatar } from "@/components/ProfileAvatar";
import { VisitForm } from "@/components/VisitForm";
import { MedicalAlertsList } from "@/components/MedicalAlertsList";
import { PatientNotesTimeline } from "@/components/PatientNotesTimeline";
import { PatientToothHistory } from "@/components/PatientToothHistory";
import { PatientClinicalJourney } from "@/components/PatientClinicalJourney";
import { PaymentForm } from "@/components/PaymentForm";
import { PaymentDetailDialog } from "@/components/PaymentDetailDialog";
import { AppointmentCard } from "@/components/schedule/AppointmentCard";
import {
  Dialog,
  DialogBody,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { apiGet, apiPost, apiDelete, ApiError } from "@/lib/api";
import { toast } from "@/lib/toast";
import { useAuth } from "@/lib/auth-context";
import { formatCurrency, formatDate, formatDateTime } from "@/lib/utils";
import {
  isPatientWorkspaceSection,
  patientWorkspacePath,
  withPatientReturnContext,
} from "@/lib/patient-navigation";
import { MARKETING_SOURCE_LABELS, type MarketingSource } from "@shared/constants";
import type {
  Patient,
  MedicalAlert,
  Visit,
  TreatmentPlan,
  Payment,
  Appointment,
  PatientImage,
  PatientNote,
} from "@shared/types";

interface ListResponse<T> {
  items: T[];
  total: number;
}

export function PatientDetailPage() {
  const { id, section } = useParams();
  const navigate = useNavigate();
  const { session } = useAuth();
  const [patient, setPatient] = useState<Patient | null>(null);
  const [alerts, setAlerts] = useState<MedicalAlert[]>([]);
  const [visits, setVisits] = useState<Visit[]>([]);
  const [plans, setPlans] = useState<TreatmentPlan[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [notes, setNotes] = useState<PatientNote[]>([]);
  const [imageCount, setImageCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [openEdit, setOpenEdit] = useState(false);
  const [openVisit, setOpenVisit] = useState(false);
  const [openPayment, setOpenPayment] = useState(false);
  const [viewingPaymentId, setViewingPaymentId] = useState<string | null>(null);
  const [planToDelete, setPlanToDelete] = useState<TreatmentPlan | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [showPastAppointments, setShowPastAppointments] = useState(false);
  const [startingAppointmentId, setStartingAppointmentId] = useState<string | null>(null);
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  async function load() {
    if (!id) return;
    setLoading(true);
    try {
      const p = await apiGet<Patient>(`/api/patients/${id}`);
      const [a, v, tp, pay, apt, pn, imageResponse] = await Promise.all([
        apiGet<ListResponse<MedicalAlert>>(`/api/patients/${id}/alerts`),
        apiGet<ListResponse<Visit>>(`/api/visits?patient_id=${id}`),
        apiGet<ListResponse<TreatmentPlan>>(`/api/treatment-plans?patient_id=${id}`),
        apiGet<ListResponse<Payment>>(`/api/payments?patient_id=${id}`),
        apiGet<ListResponse<Appointment>>(`/api/appointments?patient_id=${id}`),
        apiGet<ListResponse<PatientNote>>(`/api/patients/${id}/notes`),
        apiGet<ListResponse<PatientImage>>(`/api/patient-images?patient_id=${id}`),
      ]);
      setPatient(p);
      setAlerts(a.items);
      setVisits(v.items);
      setPlans(tp.items);
      setPayments(pay.items);
      setAppointments(apt.items);
      setNotes(pn.items);
      setImageCount(imageResponse.total);
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

  const activeSection = isPatientWorkspaceSection(section) ? section : "overview";

  useEffect(() => {
    if (!patient || !isPatientWorkspaceSection(section)) return;
    const scrollKey = `patient-workspace:${patient.id}:${activeSection}:scroll`;
    const savedPosition = Number(sessionStorage.getItem(scrollKey));

    const scrollContainer = document.getElementById("app-content");

    if (Number.isFinite(savedPosition) && scrollContainer) {
      window.requestAnimationFrame(() => {
        scrollContainer.scrollTop = savedPosition;
      });
    }

    return () => {
      sessionStorage.setItem(scrollKey, String(scrollContainer?.scrollTop ?? 0));
    };
  }, [activeSection, patient, section]);

  async function confirmDeletePlan() {
    if (!planToDelete) return;
    setDeleting(true);
    try {
      await apiDelete(`/api/treatment-plans/${planToDelete.id}`);
      setPlans((prev) => prev.filter((x) => x.id !== planToDelete.id));
      toast.success("Đã xóa kế hoạch");
      setPlanToDelete(null);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Lỗi xóa");
    } finally {
      setDeleting(false);
    }
  }

  async function startVisit(appointment: Appointment) {
    if (!session?.user?.id) return;
    setStartingAppointmentId(appointment.id);
    try {
      const visit = await apiPost<Visit>("/api/visits", {
        patient_id: appointment.patient_id,
        branch_id: appointment.branch_id,
        clinician_id: session.user.id,
        source_appointment_id: appointment.id,
      });
      toast.success("Đã bắt đầu lượt khám");
      navigate(withPatientReturnContext(`/visits/${visit.id}#findings`, patient.id, "appointments"));
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Không thể bắt đầu lượt khám");
    } finally {
      setStartingAppointmentId(null);
    }
  }

  if (loading || !patient) {
    return <p className="px-6 py-6 text-sm text-muted-foreground">Đang tải…</p>;
  }

  const totalPaid = payments
    .filter((p) => p.status === "confirmed")
    .reduce((sum, p) => sum + p.amount, 0);
  const sortedAppointments = [...appointments].sort(
    (left, right) => new Date(left.scheduled_at).getTime() - new Date(right.scheduled_at).getTime(),
  );
  const visibleAppointments = showPastAppointments
    ? sortedAppointments
    : sortedAppointments.filter((appointment) => new Date(appointment.scheduled_at) >= now);
  const pastAppointmentCount = sortedAppointments.length - visibleAppointments.length;
  const treatedBranches = [...new Map(
    visits.map((visit) => [visit.branch_id, {
      id: visit.branch_id,
      name: visit.branch_name ?? visit.branch_id,
      visitCount: 0,
      latestVisitAt: visit.date,
    }]),
  ).values()];
  for (const branch of treatedBranches) {
    const branchVisits = visits.filter((visit) => visit.branch_id === branch.id);
    branch.visitCount = branchVisits.length;
    branch.latestVisitAt = branchVisits.reduce(
      (latest, visit) => visit.date > latest ? visit.date : latest,
      branchVisits[0]?.date ?? "",
    );
  }

  if (!isPatientWorkspaceSection(section)) {
    return <Navigate to={patientWorkspacePath(patient.id)} replace />;
  }

  return (
    <div className="mx-auto w-full max-w-[90rem] px-4 py-4 sm:px-6 sm:py-6 lg:px-8 lg:py-8 2xl:px-10">
      <Tabs
        defaultValue="overview"
        value={activeSection}
        onValueChange={(nextSection) => {
          if (isPatientWorkspaceSection(nextSection)) {
            navigate(patientWorkspacePath(patient.id, nextSection));
          }
        }}
      >
        <div className="-mx-4 px-4 pb-4 pt-4 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8 lg:pt-6 2xl:-mx-10 2xl:px-10">
          <div className="mx-auto max-w-[90rem] space-y-6">
            <Breadcrumbs
              items={[
                { label: "Bệnh nhân", href: "/patients" },
                { label: patient.name },
              ]}
            />
            <div className="flex items-start justify-between gap-4">
              <div className="flex min-w-0 items-center gap-4">
                <ProfileAvatar
                  subject="patients"
                  entityId={patient.id}
                  name={patient.name}
                  avatarFileId={patient.avatar_file_id}
                  size="lg"
                  editable
                  onChanged={load}
                />
                <div className="min-w-0">
                  <h1 className="mt-1 truncate text-2xl font-semibold tracking-tight">{patient.name}</h1>
                  <p className="truncate text-sm text-muted-foreground">
                    {formatDate(patient.date_of_birth)} ·{" "}
                    {patient.gender === "M" ? "Nam" : patient.gender === "F" ? "Nữ" : "Khác"} ·{" "}
                    {patient.phone}
                    {patient.email && ` · ${patient.email}`}
                  </p>
                </div>
              </div>
              <Button className="shrink-0" variant="outline" onClick={() => setOpenEdit(true)}>
                Sửa
              </Button>
            </div>
          </div>
        </div>

        <div className="sticky top-0 z-10 -mx-4 border-y border-border bg-background px-4 py-3 shadow-sm sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8 2xl:-mx-10 2xl:px-10">
          <div className="mx-auto max-w-[90rem]">
            <TabsList className="grid h-auto w-full grid-cols-3 items-stretch gap-1 rounded-lg bg-muted/60 p-1 sm:grid-cols-5 xl:grid-cols-9">
              <TabsTrigger value="overview" className="h-full min-w-0 whitespace-normal px-2 py-2 text-center text-xs leading-4 sm:text-sm">Tổng quan</TabsTrigger>
              <TabsTrigger value="alerts" className="h-full min-w-0 whitespace-normal px-2 py-2 text-center text-xs leading-4 sm:text-sm">
                <span className="flex flex-wrap items-center justify-center gap-1">Cảnh báo <Count value={alerts.length} urgent /></span>
              </TabsTrigger>
              <TabsTrigger value="visits" className="h-full min-w-0 whitespace-normal px-2 py-2 text-center text-xs leading-4 sm:text-sm">
                <span className="flex flex-wrap items-center justify-center gap-1">Lượt khám <Count value={visits.length} /></span>
              </TabsTrigger>
              <TabsTrigger value="plans" className="h-full min-w-0 whitespace-normal px-2 py-2 text-center text-xs leading-4 sm:text-sm">
                <span className="flex flex-wrap items-center justify-center gap-1">Kế hoạch <Count value={plans.length} /></span>
              </TabsTrigger>
              <TabsTrigger value="appointments" className="h-full min-w-0 whitespace-normal px-2 py-2 text-center text-xs leading-4 sm:text-sm">
                <span className="flex flex-wrap items-center justify-center gap-1">Lịch hẹn <Count value={appointments.length} /></span>
              </TabsTrigger>
              <TabsTrigger value="journey" className="h-full min-w-0 whitespace-normal px-2 py-2 text-center text-xs leading-4 sm:text-sm">Hành trình</TabsTrigger>
              <TabsTrigger value="payments" className="h-full min-w-0 whitespace-normal px-2 py-2 text-center text-xs leading-4 sm:text-sm">
                <span className="flex flex-wrap items-center justify-center gap-1">Tài chính <Count value={payments.length} /></span>
              </TabsTrigger>
              <TabsTrigger value="teeth" className="h-full min-w-0 whitespace-normal px-2 py-2 text-center text-xs leading-4 sm:text-sm">Sơ đồ răng</TabsTrigger>
              <TabsTrigger value="images" className="h-full min-w-0 whitespace-normal px-2 py-2 text-center text-xs leading-4 sm:text-sm">
                <span className="flex flex-wrap items-center justify-center gap-1">Hình ảnh <Count value={imageCount} /></span>
              </TabsTrigger>
            </TabsList>
          </div>
        </div>

        <div className="mt-6">
          <main className="min-w-0">
        <TabsContent className="mt-0" value="overview">
          <Card>
            <CardHeader>
              <CardTitle>Thông tin chi tiết</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">

              {/* ─── 1. Thông tin cơ bản ─── */}
              <div>
                <p className="text-muted-foreground text-xs font-semibold uppercase tracking-wider mb-2">Thông tin cơ bản</p>
                <div className="rounded-lg border border-border bg-muted/20 p-4">
                  <div className="grid grid-cols-2 gap-x-6 gap-y-3">
                    <div>
                      <p className="text-muted-foreground text-xs">Họ tên</p>
                      <p className="font-medium">{patient.name}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground text-xs">Ngày sinh</p>
                      <p className="font-medium">{formatDate(patient.date_of_birth)}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground text-xs">Giới tính</p>
                      <p className="font-medium">{patient.gender === "M" ? "Nam" : patient.gender === "F" ? "Nữ" : "Khác"}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground text-xs">Số điện thoại</p>
                      <p className="font-medium">{patient.phone}</p>
                    </div>
                    <div className="col-span-2">
                      <p className="text-muted-foreground text-xs">Email</p>
                      <p className="font-medium">{patient.email || "—"}</p>
                    </div>
                    <div className="col-span-2">
                      <p className="text-muted-foreground text-xs">Địa chỉ</p>
                      <p className="font-medium">{formatPatientAddress(patient) || "—"}</p>
                    </div>
                    <div className="col-span-2">
                      <p className="text-muted-foreground text-xs">Số CCCD</p>
                      <p className="font-medium">{patient.cccd || "—"}</p>
                    </div>
                    <div className="col-span-2">
                      <p className="text-muted-foreground text-xs">Ngày tạo</p>
                      <p className="font-medium">{new Date(patient.created_at).toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric" })}</p>
                    </div>
                  </div>
                </div>
              </div>

              <div>
                <p className="text-muted-foreground text-xs font-semibold uppercase tracking-wider mb-2">Chi nhánh đã điều trị</p>
                {treatedBranches.length === 0 ? (
                  <p className="rounded-lg border border-dashed border-border px-4 py-3 text-sm text-muted-foreground">Chưa có lượt khám nào được ghi nhận.</p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {treatedBranches.map((branch) => (
                      <Badge key={branch.id} variant="outline" className="gap-1.5 px-2.5 py-1.5 font-normal">
                        <span className="font-medium">{branch.name}</span>
                        <span className="text-muted-foreground">{branch.visitCount} lượt · gần nhất {formatDate(branch.latestVisitAt)}</span>
                      </Badge>
                    ))}
                  </div>
                )}
              </div>

              {/* ─── 2. Người nhà ─── */}
              <div>
                <p className="text-muted-foreground text-xs font-semibold uppercase tracking-wider mb-2">Người nhà</p>
                <div className="rounded-lg border border-border bg-muted/20 p-4">
                  <div className="grid grid-cols-3 gap-x-6 gap-y-3">
                    <div>
                      <p className="text-muted-foreground text-xs">Họ tên</p>
                      <p className="font-medium">{patient.family_name || "—"}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground text-xs">Mối quan hệ</p>
                      <p className="font-medium">{patient.family_relation || "—"}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground text-xs">Số điện thoại</p>
                      <p className="font-medium">{patient.family_phone || "—"}</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* ─── 3. Chỉ số cơ thể ─── */}
              <div>
                <p className="text-muted-foreground text-xs font-semibold uppercase tracking-wider mb-2">Chỉ số cơ thể</p>
                <div className="rounded-lg border border-border bg-muted/20 p-4">
                  <div className="grid grid-cols-3 gap-x-6 gap-y-3">
                    <div>
                      <p className="text-muted-foreground text-xs">Chiều cao</p>
                      <p className="font-medium">{patient.height_cm ? `${patient.height_cm} cm` : "—"}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground text-xs">Cân nặng</p>
                      <p className="font-medium">{patient.weight_kg ? `${patient.weight_kg} kg` : "—"}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground text-xs">BMI</p>
                      {patient.height_cm && patient.weight_kg ? (
                        (() => {
                          const b = parseFloat((patient.weight_kg! / ((patient.height_cm! / 100) ** 2)).toFixed(1));
                          const label = b < 18.5 ? "Gầy" : b < 23 ? "Bình thường" : b < 25 ? "Thừa cân" : "Béo phì";
                          return <p className="font-medium">{b} — {label}</p>;
                        })()
                      ) : <p className="font-medium">—</p>}
                    </div>
                  </div>
                </div>
              </div>

              {/* ─── 4. Nguồn bệnh nhân & giới thiệu ─── */}
              <div>
                <p className="text-muted-foreground text-xs font-semibold uppercase tracking-wider mb-2">Nguồn & Giới thiệu</p>
                <div className="rounded-lg border border-border bg-muted/20 p-4">
                  <div className="grid grid-cols-2 gap-x-6 gap-y-3">
                    <div>
                      <p className="text-muted-foreground text-xs">Nguồn bệnh nhân</p>
                      <p className="font-medium">
                        {patient.marketing_source
                          ? MARKETING_SOURCE_LABELS[patient.marketing_source as MarketingSource] ?? patient.marketing_source
                          : "—"}
                      </p>
                    </div>
                    <div>
                      <p className="text-muted-foreground text-xs">Loại giới thiệu</p>
                      <p className="font-medium">
                        {patient.referral_type === "doctor" ? "Bác sĩ giới thiệu"
                          : patient.referral_type === "staff" ? "Nhân viên"
                          : patient.referral_type === "ad" ? "Quảng cáo"
                          : patient.referral_type === "other" ? "Khác"
                          : "—"}
                      </p>
                    </div>
                    <div>
                      <p className="text-muted-foreground text-xs">Người giới thiệu</p>
                      <p className="font-medium">{patient.referral_user_name || "—"}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground text-xs">Ghi chú giới thiệu</p>
                      <p className="font-medium">{patient.referral_notes || "—"}</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* ─── 5. Ghi chú ─── */}
              <div>
                <p className="text-muted-foreground text-xs font-semibold uppercase tracking-wider mb-2">Ghi chú</p>
                <div className="rounded-lg border border-border bg-muted/20 p-4">
                  <PatientNotesTimeline
                    patientId={patient.id}
                    notes={notes}
                    onCreated={(note) => setNotes((current) => [note, ...current])}
                  />
                </div>
              </div>

            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent className="mt-0" value="alerts">
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

        <TabsContent className="mt-0" value="visits">
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
                      <TableHead>Mã lượt khám</TableHead>
                      <TableHead>Ngày</TableHead>
                      <TableHead>Bác sĩ điều trị</TableHead>
                      <TableHead>Phụ tá</TableHead>
                      <TableHead>Kế hoạch điều trị</TableHead>
                      <TableHead>Trạng thái</TableHead>
                      <TableHead>Ghi chú</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {visits.map((v) => {
                      const visitPlans = plans.filter((plan) => plan.visit_id === v.id);
                      return <TableRow
                        key={v.id}
                        className="cursor-pointer"
                        onClick={() => navigate(withPatientReturnContext(`/visits/${v.id}`, patient.id, "visits"))}
                      >
                        <TableCell className="font-mono text-xs font-medium">{v.code ?? v.id.slice(0, 8)}</TableCell>
                        <TableCell>{formatDateTime(v.date)}</TableCell>
                        <TableCell>
                          {v.treating_clinician_name ? (
                            <div className="flex items-center gap-2">
                              <ProfileAvatar subject="users" entityId={v.treating_clinician_id} name={v.treating_clinician_name} avatarFileId={v.treating_clinician_avatar_file_id} size="sm" />
                              <span>{v.treating_clinician_name}</span>
                            </div>
                          ) : "—"}
                        </TableCell>
                        <TableCell>
                          {v.assistant_name ? (
                            <div className="flex items-center gap-2">
                              <ProfileAvatar subject="users" entityId={v.assistant_id} name={v.assistant_name} avatarFileId={v.assistant_avatar_file_id} size="sm" />
                              <span>{v.assistant_name}</span>
                            </div>
                          ) : "—"}
                        </TableCell>
                        <TableCell>
                          {visitPlans.length > 0 ? (
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span className="text-xs text-muted-foreground">{visitPlans.length} kế hoạch</span>
                              {visitPlans.map((plan, index) => (
                                <Button
                                  key={plan.id}
                                  variant="outline"
                                  size="sm"
                                  className="h-7 px-2 text-xs"
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    navigate(withPatientReturnContext(`/treatment-plans/${plan.id}`, patient.id, "plans"));
                                  }}
                                >
                                  {plan.code ?? `KH ${index + 1}`}
                                </Button>
                              ))}
                            </div>
                          ) : "—"}
                        </TableCell>
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
                      </TableRow>;
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent className="mt-0" value="plans">
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
                      <TableHead>Mã kế hoạch</TableHead>
                      <TableHead>Ngày tạo</TableHead>
                      <TableHead>Trạng thái</TableHead>
                      <TableHead className="text-right">Tổng</TableHead>
                      <TableHead className="text-right">Dịch vụ</TableHead>
                      <TableHead className="text-right">Doanh thu đã làm</TableHead>
                      <TableHead className="text-right">Doanh thu chưa làm</TableHead>
                      <TableHead className="w-24"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {plans.map((p) => (
                      <TableRow
                        key={p.id}
                        className="cursor-pointer"
                        onClick={() => navigate(withPatientReturnContext(`/treatment-plans/${p.id}`, patient.id, "plans"))}
                      >
                        <TableCell className="font-mono text-xs font-medium">{p.code ?? p.id.slice(0, 8)}</TableCell>
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
                        <TableCell className="text-right text-xs leading-5 whitespace-nowrap">
                          <div>Tổng: {p.service_summary?.total_count ?? 0}</div>
                          <div className="text-emerald-600 dark:text-emerald-400">Đã làm: {p.service_summary?.completed_count ?? 0}</div>
                          <div className="text-amber-600 dark:text-amber-400">Chưa làm: {p.service_summary?.remaining_count ?? 0}</div>
                          <div className="text-muted-foreground">Không làm: {p.service_summary?.skipped_count ?? 0}</div>
                        </TableCell>
                        <TableCell className="text-right whitespace-nowrap text-emerald-600 dark:text-emerald-400">
                          {formatCurrency(p.service_summary?.completed_revenue ?? 0, p.currency)}
                        </TableCell>
                        <TableCell className="text-right whitespace-nowrap text-amber-600 dark:text-amber-400">
                          {formatCurrency(p.service_summary?.remaining_revenue ?? 0, p.currency)}
                        </TableCell>
                        <TableCell onClick={(e) => e.stopPropagation()}>
                          {p.can_delete && (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => setPlanToDelete(p)}
                            >
                              Xóa
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent className="mt-0" value="payments">
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
                      <TableHead>Mã thanh toán</TableHead>
                      <TableHead>Ngày</TableHead>
                      <TableHead>Số tiền</TableHead>
                      <TableHead>Phương thức</TableHead>
                      <TableHead>Trạng thái</TableHead>
                      <TableHead>Mã tham chiếu</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {payments.map((p) => (
                      <TableRow
                        key={p.id}
                        className="cursor-pointer"
                        onClick={() => setViewingPaymentId(p.id)}
                      >
                        <TableCell className="font-mono">{p.code}</TableCell>
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

        <TabsContent className="mt-0" value="appointments">
          <Card>
            <CardHeader>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <CardTitle>Lịch hẹn</CardTitle>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => setShowPastAppointments((show) => !show)}
                >
                  {showPastAppointments ? "Ẩn lịch đã qua" : `Hiện lịch đã qua${pastAppointmentCount ? ` (${pastAppointmentCount})` : ""}`}
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {appointments.length === 0 ? (
                <p className="text-sm text-muted-foreground">Chưa có lịch hẹn nào.</p>
              ) : visibleAppointments.length === 0 ? (
                <p className="text-sm text-muted-foreground">Không có lịch hẹn sắp tới.</p>
              ) : (
                <div className="space-y-2">
                  {visibleAppointments.map((apt) => (
                    <div key={apt.id} className="space-y-2">
                      <AppointmentCard
                        appointment={apt}
                        patientName={patient.name}
                        onClick={() => navigate(withPatientReturnContext(`/appointments/${apt.id}`, patient.id, "appointments"))}
                      />
                      {canStartAppointmentVisit(apt, now) && (
                        <div className="flex justify-end">
                          <Button
                            size="sm"
                            onClick={() => void startVisit(apt)}
                            disabled={startingAppointmentId === apt.id}
                          >
                            {startingAppointmentId === apt.id ? "Đang bắt đầu…" : "Bắt đầu khám"}
                          </Button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent className="mt-0" value="journey">
          <Card>
            <CardHeader>
              <CardTitle>Hành trình lâm sàng</CardTitle>
            </CardHeader>
            <CardContent>
              <PatientClinicalJourney
                patientId={patient.id}
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent className="mt-0" value="teeth">
          <Card>
            <CardHeader>
              <CardTitle>Sơ đồ răng — lịch sử</CardTitle>
              <p className="text-sm text-muted-foreground">
                Nhấn một răng để xem toàn bộ chẩn đoán và điều trị của răng đó qua các lần khám.
              </p>
            </CardHeader>
            <CardContent>
              <PatientToothHistory patientId={patient.id} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent className="mt-0" value="images">
          <Card>
            <CardContent className="pt-4">
              <PatientImageGallery patientId={patient.id} onImagesChanged={load} />
            </CardContent>
          </Card>
        </TabsContent>
          </main>
        </div>
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
          navigate(withPatientReturnContext(`/visits/${v.id}`, patient.id, "visits"));
        }}
      />
      <PaymentForm
        open={openPayment}
        onOpenChange={setOpenPayment}
        patientId={patient.id}
        plans={plans.filter((p) => p.status === "approved" || p.status === "completed")}
        onCreated={(pay) => setPayments((prev) => [pay, ...prev])}
      />
      <PaymentDetailDialog
        paymentId={viewingPaymentId}
        onClose={() => setViewingPaymentId(null)}
        onSaved={(pay) =>
          setPayments((prev) => prev.map((x) => (x.id === pay.id ? pay : x)))
        }
      />
      <Dialog open={planToDelete !== null} onOpenChange={(o) => !o && setPlanToDelete(null)}>
        <DialogHeader>
          <DialogTitle>Xóa kế hoạch điều trị?</DialogTitle>
        </DialogHeader>
        <DialogBody>
          <p className="text-sm text-muted-foreground">
            Kế hoạch tạo ngày{" "}
            <strong className="text-foreground">
              {planToDelete ? formatDateTime(planToDelete.created_at) : ""}
            </strong>{" "}
            sẽ bị xóa vĩnh viễn cùng toàn bộ hạng mục bên trong. Hành động này không thể hoàn tác.
          </p>
          {planToDelete && planToDelete.total_cost > 0 && (
            <p className="mt-3 text-sm">
              Tổng giá trị kế hoạch:{" "}
              <strong>
                {formatCurrency(planToDelete.total_cost, planToDelete.currency)}
              </strong>
            </p>
          )}
        </DialogBody>
        <DialogFooter className="mt-4">
          <Button
            type="button"
            variant="outline"
            onClick={() => setPlanToDelete(null)}
            disabled={deleting}
          >
            Hủy
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={confirmDeletePlan}
            disabled={deleting}
          >
            {deleting ? "Đang xóa…" : "Xóa"}
          </Button>
        </DialogFooter>
      </Dialog>
    </div>
  );
}

function Count({ value, urgent = false }: { value: number; urgent?: boolean }) {
  const className = urgent && value > 0
    ? "rounded-full bg-destructive/15 px-2 py-0.5 text-xs font-semibold text-destructive"
    : "rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground";

  return (
    <span className={className}>{value}</span>
  );
}

function canStartAppointmentVisit(appointment: Appointment, now: Date): boolean {
  if (appointment.status !== "arrived" || !appointment.chair_id) return false;
  const startsAt = new Date(appointment.scheduled_at);
  const endsAt = new Date(startsAt.getTime() + appointment.duration_min * 60_000);
  return startsAt <= now && now < endsAt;
}

function formatPatientAddress(patient: Patient) {
  const structuredParts = [
    patient.address_line,
    patient.ward_name,
    patient.district_name,
    patient.province_name,
    patient.country_name !== "Việt Nam" ? patient.country_name : undefined,
  ].filter((part): part is string => Boolean(part));

  return structuredParts.length > 0 ? structuredParts.join(", ") : patient.address;
}
