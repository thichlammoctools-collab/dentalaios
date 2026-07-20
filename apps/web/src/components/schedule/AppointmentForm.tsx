import { useEffect, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DateInput } from "@/components/ui/date-input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogBody, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { apiGet, apiPost, ApiError } from "@/lib/api";
import { toast } from "@/lib/toast";
import { useAuth } from "@/lib/auth-context";
import type { Appointment, UserWithDetails } from "@shared/types";
import { isAssistantRole, isDoctorRole } from "@shared/constants";
import { combineDateTime, ymd } from "@/lib/utils";
import { PatientCombobox } from "./PatientCombobox";

interface AppointmentFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialDate?: string;   // YYYY-MM-DD, defaults to today
  initialHour?: number;   // 0-23
  onCreated?: (appt: Appointment) => void;
}

interface UsersResponse { items: UserWithDetails[]; total: number }

export function AppointmentForm({
  open,
  onOpenChange,
  initialDate,
  initialHour,
  onCreated,
}: AppointmentFormProps) {
  const { session } = useAuth();
  const [users, setUsers] = useState<UserWithDetails[]>([]);
  const [patientId, setPatientId] = useState("");
  const [clinicianId, setClinicianId] = useState("");
  const [assistantId, setAssistantId] = useState("");
  const [date, setDate] = useState(initialDate ?? ymd(new Date()));
  const [time, setTime] = useState(
    initialHour != null ? `${String(initialHour).padStart(2, "0")}:00` : "09:00",
  );
  const [durationMin, setDurationMin] = useState(30);
  const [procedure, setProcedure] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open || !session?.branch?.id) return;
    apiGet<UsersResponse>(`/api/users/branch/${session.branch.id}`)
      .then((res) => setUsers(res.items))
      .catch(() => setUsers([]));
  }, [open, session]);

  // Default clinician = currently logged-in user if doctor, else first doctor in branch
  useEffect(() => {
    if (!open || clinicianId || users.length === 0) return;
    const isDoctor = session && isDoctorRole(session.role.system_key, session.role.id, session.role.name);
    if (isDoctor && session?.user.id) {
      setClinicianId(session.user.id);
    } else {
      const firstDoctor = users.find((u) => isDoctorRole(u.role_key, u.role_id, u.role_name));
      if (firstDoctor) setClinicianId(firstDoctor.id);
    }
  }, [open, users, clinicianId, session]);

  function resetForm() {
    setPatientId("");
    setAssistantId("");
    setProcedure("");
    setNotes("");
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!patientId || !clinicianId) {
      toast.error("Vui lòng chọn bệnh nhân và bác sĩ");
      return;
    }
    setSaving(true);
    try {
      const scheduled_at = combineDateTime(date, time);
      const created = await apiPost<Appointment>("/api/appointments", {
        patient_id: patientId,
        clinician_id: clinicianId,
        assistant_id: assistantId || undefined,
        scheduled_at,
        duration_min: durationMin,
        procedure: procedure || undefined,
        notes: notes || undefined,
        source: "manual",
      });
      toast.success("Đã tạo lịch hẹn");
      onCreated?.(created);
      onOpenChange(false);
      resetForm();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Lỗi tạo lịch hẹn");
    } finally {
      setSaving(false);
    }
  }

  const doctors = users.filter((u) => isDoctorRole(u.role_key, u.role_id, u.role_name));
  const assistants = users.filter((u) => isAssistantRole(u.role_key, u.role_id, u.role_name));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <form onSubmit={onSubmit}>
        <DialogHeader>
          <DialogTitle>Tạo lịch hẹn mới</DialogTitle>
        </DialogHeader>
        <DialogBody className="grid gap-3">

          {/* Bệnh nhân */}
          <div className="grid gap-1.5">
            <Label htmlFor="patient">Bệnh nhân</Label>
            <PatientCombobox
              value={patientId}
              onChange={setPatientId}
              required
            />
          </div>

          {/* Bác sĩ */}
          <div className="grid gap-1.5">
            <Label htmlFor="clinician">Bác sĩ</Label>
            <Select
              id="clinician"
              value={clinicianId}
              onChange={(e) => setClinicianId(e.target.value)}
              required
            >
              <option value="">— Chọn bác sĩ —</option>
              {doctors.map((d) => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </Select>
          </div>

          {/* Phụ tá chính (optional) */}
          {assistants.length > 0 && (
            <div className="grid gap-1.5">
              <Label htmlFor="assistant">Phụ tá chính</Label>
              <Select
                id="assistant"
                value={assistantId}
                onChange={(e) => setAssistantId(e.target.value)}
              >
                <option value="">— Không chọn —</option>
                {assistants.map((a) => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </Select>
            </div>
          )}

          {/* Date + Time */}
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="date">Ngày</Label>
              <DateInput
                id="date"
                value={date}
                onChange={setDate}
                required
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="time">Giờ</Label>
              <Input
                id="time"
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
                required
              />
            </div>
          </div>

          {/* Duration */}
          <div className="grid gap-1.5">
            <Label htmlFor="duration">Thời lượng (phút)</Label>
            <Select
              id="duration"
              value={String(durationMin)}
              onChange={(e) => setDurationMin(Number(e.target.value))}
            >
              <option value="15">15 phút</option>
              <option value="30">30 phút</option>
              <option value="45">45 phút</option>
              <option value="60">60 phút</option>
              <option value="90">90 phút</option>
              <option value="120">120 phút</option>
            </Select>
          </div>

          {/* Procedure */}
          <div className="grid gap-1.5">
            <Label htmlFor="procedure">Thủ thuật (tuỳ chọn)</Label>
            <Input
              id="procedure"
              value={procedure}
              onChange={(e) => setProcedure(e.target.value)}
              placeholder="VD: scaling, filling, root_canal…"
            />
          </div>

          {/* Notes */}
          <div className="grid gap-1.5">
            <Label htmlFor="notes">Ghi chú</Label>
            <Textarea
              id="notes"
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Yêu cầu đặc biệt, lưu ý…"
            />
          </div>
        </DialogBody>
        <DialogFooter className="mt-4">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Hủy
          </Button>
          <Button type="submit" disabled={saving}>
            {saving ? "Đang tạo…" : "Tạo lịch hẹn"}
          </Button>
        </DialogFooter>
      </form>
    </Dialog>
  );
}
