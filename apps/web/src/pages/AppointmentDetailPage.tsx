import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
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
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { apiGet, apiPatch, apiDelete, ApiError } from "@/lib/api";
import { toast } from "@/lib/toast";
import { useAuth } from "@/lib/auth-context";
import { APPOINTMENT_STATUS_LABELS } from "@shared/constants";
import type { Appointment, Patient, UserWithDetails } from "@shared/types";
import { formatDateTime, formatTime, ymd, combineDateTime, isoToYmd, isoToTime } from "@/lib/utils";

interface PatientsResponse { items: Patient[]; total: number }
interface UsersResponse { items: UserWithDetails[]; total: number }

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
  const { session } = useAuth();
  const [appt, setAppt] = useState<Appointment | null>(null);
  const [patient, setPatient] = useState<Patient | null>(null);
  const [users, setUsers] = useState<UserWithDetails[]>([]);
  const [loading, setLoading] = useState(true);
  const [editOpen, setEditOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);

  useEffect(() => {
    if (!id) return;
    let mounted = true;
    setLoading(true);
    (async () => {
      try {
        const a = await apiGet<Appointment>(`/api/appointments/${id}`);
        if (!mounted) return;
        setAppt(a);
        const [p, u] = await Promise.all([
          apiGet<Patient>(`/api/patients/${a.patient_id}`).catch(() => null),
          session?.branch?.id
            ? apiGet<UsersResponse>(`/api/users/branch/${session.branch.id}`).catch(() => ({ items: [] as UserWithDetails[] }))
            : Promise.resolve({ items: [] as UserWithDetails[] }),
        ]);
        if (!mounted) return;
        setPatient(p);
        setUsers(u.items);
      } catch (err) {
        toast.error(err instanceof ApiError ? err.message : "Lỗi tải lịch hẹn");
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, [id, session]);

  if (loading || !appt) {
    return <p className="px-6 py-6 text-sm text-muted-foreground">Đang tải…</p>;
  }

  const doctor = users.find((u) => u.id === appt.clinician_id);
  const assistant = appt.assistant_id ? users.find((u) => u.id === appt.assistant_id) : null;
  const endTime = new Date(new Date(appt.scheduled_at).getTime() + appt.duration_min * 60 * 1000);

  async function handleCancel(reason: string) {
    try {
      await apiDelete(`/api/appointments/${appt!.id}`, { body: JSON.stringify({ reason }) });
      toast.success("Đã hủy lịch hẹn");
      setCancelOpen(false);
      setAppt((prev) => prev ? { ...prev, status: "cancelled", cancelled_reason: reason } : prev);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Lỗi hủy lịch");
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-6 py-6">
      <Breadcrumbs
        items={[
          { label: "Bệnh nhân", href: "/patients" },
          ...(patient ? [{ label: patient.name, href: `/patients/${patient.id}` }] : []),
          { label: "Lịch hẹn" },
        ]}
      />

      <div className="flex items-start justify-between">
        <div>
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
            <Link to={`/patients/${patient.id}`} className="font-medium text-blue-600 hover:underline">
              {patient.name}
            </Link>
          ) : <span className="font-mono text-xs">{appt.patient_id.slice(0, 8)}…</span>} />
          <Field label="Bác sĩ" value={doctor?.name ?? "—"} />
          <Field label="Phụ tá chính" value={assistant?.name ?? "—"} />
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
          onClose={() => setEditOpen(false)}
          onSaved={(updated) => {
            setAppt(updated);
            setEditOpen(false);
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
    </div>
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
  onClose,
  onSaved,
}: {
  appointment: Appointment;
  doctors: UserWithDetails[];
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
  const [saving, setSaving] = useState(false);

  const doctorsOnly = doctors.filter((u) => u.role_name === "doctor");
  const assistantsOnly = doctors.filter((u) => u.role_name === "assistant");

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const scheduled_at = combineDateTime(date, time);
      const updated = await apiPatch<Appointment>(`/api/appointments/${appointment.id}`, {
        scheduled_at,
        duration_min: durationMin,
        status,
        clinician_id: clinicianId,
        assistant_id: assistantId || null,
        procedure: procedure || undefined,
        notes: notes || undefined,
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
      </DialogHeader>
      <form onSubmit={handleSave}>
        <DialogBody className="grid gap-3">
          <div className="grid gap-1.5">
            <Label>Bác sĩ</Label>
            <Select value={clinicianId} onChange={(e) => setClinicianId(e.target.value)}>
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

          <div className="grid gap-1.5">
            <Label>Trạng thái</Label>
            <Select value={status} onChange={(e) => setStatus(e.target.value as Appointment["status"])}>
              <option value="booked">Đã đặt</option>
              <option value="confirmed">Xác nhận</option>
              <option value="arrived">Đã đến</option>
              <option value="completed">Hoàn thành</option>
              <option value="cancelled">Hủy</option>
              <option value="no_show">Không đến</option>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label>Ngày</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div className="grid gap-1.5">
              <Label>Giờ</Label>
              <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
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
        </DialogBody>
        <DialogFooter className="mt-4">
          <Button type="button" variant="outline" onClick={onClose}>Đóng</Button>
          <Button type="submit" disabled={saving}>
            {saving ? "Đang lưu…" : "Lưu thay đổi"}
          </Button>
        </DialogFooter>
      </form>
    </Dialog>
  );
}
