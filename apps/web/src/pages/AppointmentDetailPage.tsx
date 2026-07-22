import { useEffect, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogBody,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { DateInput } from "@/components/ui/date-input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { apiGet, apiPatch, apiPost, apiDelete, ApiError } from "@/lib/api";
import { toast } from "@/lib/toast";
import { useAuth } from "@/lib/auth-context";
import { APPOINTMENT_STATUS_LABELS, isAssistantRole, isDoctorRole } from "@shared/constants";
import type { Appointment, DentalChair, Patient, UserWithDetails, Visit } from "@shared/types";
import { formatDateTime, formatTime, ymd, combineDateTime, isoToYmd, isoToTime } from "@/lib/utils";
import { getMinimumAppointmentTime, isAppointmentTimeInPast } from "@/lib/appointment-time";
import { patientReturnPath, withPatientReturnContext } from "@/lib/patient-navigation";
import { ProfileAvatar } from "@/components/ProfileAvatar";
import { PageContainer } from "@/components/PageContainer";

interface PatientsResponse { items: Patient[]; total: number }
interface UsersResponse { items: UserWithDetails[]; total: number }
interface ChairsResponse { items: DentalChair[]; total: number }

const STATUS_VARIANT: Record<string, "default" | "success" | "warning" | "destructive" | "secondary" | "outline"> = {
  booked: "outline",
  confirmed: "default",
  arrived: "warning",
  completed: "success",
  cancelled: "destructive",
  no_show: "secondary",
};

const SOURCE_LABEL: Record<string, string> = {
  manual: "Thủ công",
  ai_chat: "✨ AI chat",
  ai_next_visit: "🤖 AI gợi ý",
  reschedule: "Đổi lịch",
};

export function AppointmentDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { session } = useAuth();
  const [appt, setAppt] = useState<Appointment | null>(null);
  const [patient, setPatient] = useState<Patient | null>(null);
  const [users, setUsers] = useState<UserWithDetails[]>([]);
  const [chairs, setChairs] = useState<DentalChair[]>([]);
  const [loading, setLoading] = useState(true);
  const [editOpen, setEditOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [startingVisit, setStartingVisit] = useState(false);
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!id) return;
    let mounted = true;
    setLoading(true);
    (async () => {
      try {
        const a = await apiGet<Appointment>(`/api/appointments/${id}`);
        if (!mounted) return;
        setAppt(a);
        const [p, u, chairsResponse] = await Promise.all([
          apiGet<Patient>(`/api/patients/${a.patient_id}`).catch(() => null),
          session?.branch?.id
            ? apiGet<UsersResponse>(`/api/users/branch/${session.branch.id}`).catch(() => ({ items: [] as UserWithDetails[] }))
            : Promise.resolve({ items: [] as UserWithDetails[] }),
          session?.branch?.id
            ? apiGet<ChairsResponse>(`/api/chairs?branch_id=${session.branch.id}`).catch(() => ({ items: [] as DentalChair[], total: 0 }))
            : Promise.resolve({ items: [] as DentalChair[], total: 0 }),
        ]);
        if (!mounted) return;
        setPatient(p);
        setUsers(u.items);
        setChairs(chairsResponse.items);
      } catch (err) {
        toast.error(err instanceof ApiError ? err.message : "Lỗi tải lịch hẹn");
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, [id, session?.branch?.id]);

  useEffect(() => {
    if (searchParams.get("edit") === "1") setEditOpen(true);
  }, [searchParams]);

  if (loading || !appt) {
    return <p className="px-6 py-6 text-sm text-muted-foreground">Đang tải…</p>;
  }

  const doctor = users.find((u) => u.id === appt.clinician_id);
  const assistant = appt.assistant_id ? users.find((u) => u.id === appt.assistant_id) : null;
  const chair = appt.chair_id ? chairs.find((item) => item.id === appt.chair_id) : null;
  const endTime = new Date(new Date(appt.scheduled_at).getTime() + appt.duration_min * 60 * 1000);
  const canStartVisit = appt.status === "arrived" && Boolean(appt.chair_id)
    && new Date(appt.scheduled_at) <= now && now < endTime;
  const requestedReturnPath = searchParams.get("return_to");
  const returnPath = requestedReturnPath === "/calendar"
    ? requestedReturnPath
    : patientReturnPath(requestedReturnPath, appt.patient_id, "appointments");

  function closeEdit() {
    setEditOpen(false);
    if (searchParams.has("edit")) {
      searchParams.delete("edit");
      setSearchParams(searchParams, { replace: true });
    }
  }

  async function handleCancel(reason: string) {
    try {
      await apiDelete(`/api/appointments/${appt!.id}`, { reason });
      toast.success("Đã hủy lịch hẹn");
      setCancelOpen(false);
      setAppt((prev) => prev ? { ...prev, status: "cancelled", cancelled_reason: reason } : prev);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Lỗi hủy lịch");
    }
  }

  async function startVisit() {
    if (!session?.user?.id || !appt) return;
    setStartingVisit(true);
    try {
      const visit = await apiPost<Visit>("/api/visits", {
        patient_id: appt.patient_id,
        branch_id: appt.branch_id,
        clinician_id: session.user.id,
        source_appointment_id: appt.id,
      });
      toast.success("Đã bắt đầu lượt khám");
      navigate(withPatientReturnContext(`/visits/${visit.id}`, appt.patient_id, "visits"));
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Không thể bắt đầu lượt khám");
    } finally {
      setStartingVisit(false);
    }
  }

  return (
    <PageContainer size="reading">
      <Breadcrumbs
        items={[
          { label: "Bệnh nhân", href: "/patients" },
          ...(patient ? [{ label: patient.name, href: returnPath }] : []),
          { label: "Lịch hẹn" },
        ]}
      />

      <div className="flex items-start justify-between">
        <div>
          <Button variant="ghost" size="sm" className="-ml-3 mb-2" onClick={() => navigate(returnPath)}>
            ← Quay lại lịch hẹn
          </Button>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">Lịch hẹn</h1>
          <p className="text-sm text-muted-foreground">
            {formatDateTime(appt.scheduled_at)} → {formatTime(endTime.toISOString())} · {appt.duration_min} phút
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={STATUS_VARIANT[appt.status] ?? "outline"}>
            {APPOINTMENT_STATUS_LABELS[appt.status]}
          </Badge>
           <Button variant="outline" onClick={() => setEditOpen(true)}>Sửa</Button>
            {canStartVisit && (
              <Button onClick={() => void startVisit()} disabled={startingVisit}>{startingVisit ? "Đang bắt đầu…" : "Bắt đầu khám"}</Button>
            )}
          {appt.status !== "cancelled" && appt.status !== "completed" && (
            <Button variant="destructive" onClick={() => setCancelOpen(true)}>Hủy lịch</Button>
          )}
        </div>
      </div>

      {/* Thông tin */}
      <Card>
        <CardHeader><CardTitle>Thông tin</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
          <Field label="Bệnh nhân" value={patient ? (
             <Link to={`/patients/${patient.id}`} className="flex items-center gap-2 font-medium text-blue-600 hover:underline"><ProfileAvatar subject="patients" entityId={patient.id} name={patient.name} avatarFileId={patient.avatar_file_id} size="sm" />{patient.name}</Link>
           ) : <span className="font-mono text-xs">{appt.patient_id.slice(0, 8)}…</span>} />
           <Field label="Bác sĩ" value={doctor ? <div className="flex items-center gap-2"><ProfileAvatar subject="users" entityId={doctor.id} name={doctor.name} avatarFileId={doctor.avatar_file_id} size="sm" />{doctor.name}</div> : "—"} />
           <Field label="Phụ tá chính" value={assistant ? <div className="flex items-center gap-2"><ProfileAvatar subject="users" entityId={assistant.id} name={assistant.name} avatarFileId={assistant.avatar_file_id} size="sm" />{assistant.name}</div> : "—"} />
          <Field label="Ghế nha" value={chair ? `${chair.name}${chair.room_name ? ` · ${chair.room_name}` : ""}` : "—"} />
          <Field label="Thời lượng" value={`${appt.duration_min} phút`} />
          <Field label="Thủ thuật" value={appt.procedure ?? "—"} />
          <Field label="Nguồn" value={SOURCE_LABEL[appt.source] ?? appt.source} />
          <Field label="Ngày tạo" value={formatDateTime(appt.created_at)} />
          <Field label="Cập nhật" value={formatDateTime(appt.updated_at)} />
        </CardContent>
      </Card>

      {/* Ghi chú */}
      {(appt.notes || appt.cancelled_reason) && (
        <Card>
          <CardHeader><CardTitle>Ghi chú</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            {appt.notes && (
              <p className="whitespace-pre-wrap rounded bg-muted/30 p-3">{appt.notes}</p>
            )}
            {appt.cancelled_reason && (
              <p className="rounded bg-red-50 p-3 text-red-700 dark:bg-red-900/20 dark:text-red-300">
                <strong>Lý do hủy:</strong> {appt.cancelled_reason}
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Edit dialog */}
      {editOpen && (
        <EditAppointmentDialog
          appointment={appt}
          doctors={users}
          chairs={chairs}
          onClose={closeEdit}
          onSaved={(updated) => {
            setAppt(updated);
            closeEdit();
          }}
        />
      )}

      {/* Cancel dialog */}
      {cancelOpen && (
        <Dialog open onOpenChange={(o) => !o && setCancelOpen(false)}>
          <DialogHeader>
            <DialogTitle>Hủy lịch hẹn</DialogTitle>
          </DialogHeader>
          <CancelForm onCancel={handleCancel} onClose={() => setCancelOpen(false)} />
        </Dialog>
      )}
    </PageContainer>
  );
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="font-medium">{value}</p>
    </div>
  );
}

function CancelForm({
  onCancel,
  onClose,
}: {
  onCancel: (reason: string) => Promise<void>;
  onClose: () => void;
}) {
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!reason.trim()) return;
    setSubmitting(true);
    await onCancel(reason.trim());
    setSubmitting(false);
  }
  return (
    <form onSubmit={submit}>
      <DialogBody className="grid gap-2">
        <Label htmlFor="cancel-reason">Lý do hủy</Label>
        <Textarea
          id="cancel-reason"
          rows={3}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="VD: bệnh nhân đổi lịch, bác sĩ bận việc đột xuất…"
          required
        />
      </DialogBody>
      <DialogFooter className="mt-4">
        <Button type="button" variant="outline" onClick={onClose}>Đóng</Button>
        <Button type="submit" variant="destructive" disabled={submitting || !reason.trim()}>
          {submitting ? "Đang hủy…" : "Xác nhận hủy"}
        </Button>
      </DialogFooter>
    </form>
  );
}

function EditAppointmentDialog({
  appointment,
  doctors,
  chairs,
  onClose,
  onSaved,
}: {
  appointment: Appointment;
  doctors: UserWithDetails[];
  chairs: DentalChair[];
  onClose: () => void;
  onSaved: (a: Appointment) => void;
}) {
  const apptDate = new Date(appointment.scheduled_at);
  const [date, setDate] = useState(ymd(apptDate));
  const [time, setTime] = useState(isoToTime(appointment.scheduled_at).slice(0, 5));
  const [durationMin, setDurationMin] = useState(appointment.duration_min);
  const [procedure, setProcedure] = useState(appointment.procedure ?? "");
  const [notes, setNotes] = useState(appointment.notes ?? "");
  const [status, setStatus] = useState(appointment.status);
  const [clinicianId, setClinicianId] = useState(appointment.clinician_id);
  const [assistantId, setAssistantId] = useState(appointment.assistant_id ?? "");
  const [chairId, setChairId] = useState(appointment.chair_id ?? "");
  const [saving, setSaving] = useState(false);
  const [step, setStep] = useState<1 | 2>(1);

  const doctorsOnly = doctors.filter((u) => isDoctorRole(u.role_key, u.role_id, u.role_name));
  const assistantsOnly = doctors.filter((u) => isAssistantRole(u.role_key, u.role_id, u.role_name));

  function continueToSchedule() {
    if (!clinicianId) {
      toast.error("Vui lòng chọn bác sĩ");
      return;
    }
    setStep(2);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!clinicianId) {
      toast.error("Vui lòng chọn bác sĩ");
      return;
    }
    const isRescheduling = date !== ymd(apptDate) || time !== isoToTime(appointment.scheduled_at).slice(0, 5);
    if (isRescheduling && isAppointmentTimeInPast(date, time)) {
      toast.error("Thời gian lịch hẹn phải sau thời điểm hiện tại ít nhất 5 phút");
      return;
    }
    setSaving(true);
    try {
      const updated = await apiPatch<Appointment>(`/api/appointments/${appointment.id}`, {
        ...(isRescheduling ? { scheduled_at: combineDateTime(date, time) } : {}),
        ...(durationMin !== appointment.duration_min ? { duration_min: durationMin } : {}),
        status,
        ...(clinicianId !== appointment.clinician_id ? { clinician_id: clinicianId } : {}),
        ...(assistantId !== (appointment.assistant_id ?? "") ? { assistant_id: assistantId || null } : {}),
        ...(chairId !== (appointment.chair_id ?? "") ? { chair_id: chairId || null } : {}),
        ...(procedure !== (appointment.procedure ?? "") ? { procedure: procedure || undefined } : {}),
        ...(notes !== (appointment.notes ?? "") ? { notes: notes || undefined } : {}),
      });
      onSaved(updated);
      toast.success("Đã cập nhật lịch hẹn");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Lỗi cập nhật");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
        <DialogHeader>
          <DialogTitle>Sửa lịch hẹn</DialogTitle>
          <AppointmentSteps step={step} />
        </DialogHeader>
        <form onSubmit={handleSave}>
          <DialogBody className="grid gap-3">
            {step === 1 && <>
            <div className="grid gap-1.5">
            <Label>Bác sĩ</Label>
            <Select
              value={clinicianId}
              onChange={(e) => setClinicianId(e.target.value)}
              disabled={doctorsOnly.length === 0}
            >
              {doctorsOnly.length === 0 && <option value="">Không có bác sĩ khả dụng</option>}
              {doctorsOnly.map((d) => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </Select>
          </div>

          {assistantsOnly.length > 0 && (
            <div className="grid gap-1.5">
              <Label>Phụ tá chính</Label>
              <Select value={assistantId} onChange={(e) => setAssistantId(e.target.value)}>
                <option value="">— Không chọn —</option>
                {assistantsOnly.map((a) => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </Select>
            </div>
          )}

          {chairs.length > 0 && (
            <div className="grid gap-1.5">
              <Label>Ghế nha</Label>
              <Select value={chairId} onChange={(e) => setChairId(e.target.value)}>
                <option value="">— Chưa gán ghế —</option>
                {chairs.filter((chair) => chair.is_active || chair.id === appointment.chair_id).map((chair) => (
                  <option key={chair.id} value={chair.id}>
                    {chair.name}{chair.room_name ? ` · ${chair.room_name}` : ""}
                  </option>
                ))}
              </Select>
            </div>
          )}

          <div className="grid gap-1.5">
            <Label>Trạng thái</Label>
            <Select value={status} onChange={(e) => setStatus(e.target.value as Appointment["status"])}>
              <option value="booked">Mới book</option>
              <option value="confirmed">Đã xác nhận</option>
              <option value="arrived">Đã đến</option>
              <option value="completed">Hoàn thành</option>
              <option value="cancelled">Hủy lịch</option>
              <option value="no_show">Không đến</option>
              </Select>
            </div>
            </>}

            {step === 2 && <>
            <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label>Ngày</Label>
              <DateInput
                value={date}
                onChange={(nextDate) => {
                  setDate(nextDate);
                  const minimum = getMinimumAppointmentTime(nextDate);
                  if (minimum && time < minimum) setTime(minimum);
                }}
                min={apptDate >= new Date() ? ymd(new Date()) : undefined}
              />
            </div>
            <div className="grid gap-1.5">
              <Label>Giờ</Label>
              <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} min={apptDate >= new Date() ? getMinimumAppointmentTime(date) : undefined} />
            </div>
          </div>

          <div className="grid gap-1.5">
            <Label>Thời lượng (phút)</Label>
            <Select value={String(durationMin)} onChange={(e) => setDurationMin(Number(e.target.value))}>
              <option value="15">15 phút</option>
              <option value="30">30 phút</option>
              <option value="45">45 phút</option>
              <option value="60">60 phút</option>
              <option value="90">90 phút</option>
              <option value="120">120 phút</option>
            </Select>
          </div>

          <div className="grid gap-1.5">
            <Label>Hạng mục</Label>
            <Input value={procedure} onChange={(e) => setProcedure(e.target.value)} placeholder="VD: scaling, filling…" />
          </div>

          <div className="grid gap-1.5">
            <Label>Ghi chú</Label>
              <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>
            </>}
          </DialogBody>
          <DialogFooter className="mt-4">
            <Button type="button" variant="outline" onClick={onClose}>Đóng</Button>
            {step === 1 ? (
              <Button type="button" onClick={continueToSchedule}>Tiếp tục</Button>
            ) : <>
              <Button type="button" variant="ghost" onClick={() => setStep(1)}>Quay lại</Button>
              <Button type="submit" disabled={saving}>
                {saving ? "Đang lưu…" : "Lưu thay đổi"}
              </Button>
            </>}
          </DialogFooter>
      </form>
    </Dialog>
  );
}

function AppointmentSteps({ step }: { step: 1 | 2 }) {
  return (
    <div className="mt-3 flex items-center gap-2 text-xs" aria-label={`Bước ${step} trên 2`}>
      <span className={`flex h-5 w-5 items-center justify-center rounded-full font-semibold ${step === 1 ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>1</span>
      <span className={step === 1 ? "font-medium text-foreground" : "text-muted-foreground"}>Nhân sự & trạng thái</span>
      <span className="h-px w-5 bg-border" />
      <span className={`flex h-5 w-5 items-center justify-center rounded-full font-semibold ${step === 2 ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>2</span>
      <span className={step === 2 ? "font-medium text-foreground" : "text-muted-foreground"}>Thời gian & nội dung</span>
    </div>
  );
}
