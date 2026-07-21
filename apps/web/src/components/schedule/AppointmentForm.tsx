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
import type { Appointment, DentalChair, Patient, PatientOpenTreatmentMilestone, TreatmentCaseMilestone, UserWithDetails } from "@shared/types";
import { isAssistantRole, isDoctorRole } from "@shared/constants";
import { combineDateTime, ymd } from "@/lib/utils";
import { getMinimumAppointmentTime, getNextAppointmentSlot, isAppointmentTimeInPast } from "@/lib/appointment-time";
import { PatientCombobox } from "./PatientCombobox";

interface AppointmentFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialDate?: string;   // YYYY-MM-DD, defaults to today
  initialHour?: number;   // 0-23
  onCreated?: () => void;
  milestone?: {
    planId: string;
    milestoneId: string;
    patientId: string;
    procedure: string;
    label: string;
    availableMilestones?: TreatmentCaseMilestone[];
  };
}

interface UsersResponse { items: UserWithDetails[]; total: number }
interface ChairAvailabilityResponse {
  items: Array<{ chair: DentalChair; available: boolean; reason?: string }>;
}
interface OpenMilestonesResponse { items: PatientOpenTreatmentMilestone[]; total: number }

export function AppointmentForm({
  open,
  onOpenChange,
  initialDate,
  initialHour,
  onCreated,
  milestone,
}: AppointmentFormProps) {
  const { session } = useAuth();
  const [users, setUsers] = useState<UserWithDetails[]>([]);
  const [patientId, setPatientId] = useState(milestone?.patientId ?? "");
  const [milestonePatient, setMilestonePatient] = useState<Patient | null>(null);
  const [clinicianId, setClinicianId] = useState("");
  const [assistantId, setAssistantId] = useState("");
  const [chairId, setChairId] = useState("");
  const [chairAvailability, setChairAvailability] = useState<ChairAvailabilityResponse["items"]>([]);
  const defaultSlot = getNextAppointmentSlot();
  const [date, setDate] = useState(initialDate ?? defaultSlot.date);
  const [time, setTime] = useState(initialHour != null ? `${String(initialHour).padStart(2, "0")}:00` : defaultSlot.time);
  const [durationMin, setDurationMin] = useState(30);
  const [procedure, setProcedure] = useState(milestone?.procedure ?? "");
  const [selectedMilestoneIds, setSelectedMilestoneIds] = useState<string[]>(
    milestone ? [milestone.milestoneId] : [],
  );
  const [patientMilestones, setPatientMilestones] = useState<PatientOpenTreatmentMilestone[]>([]);
  const [selectedCaseId, setSelectedCaseId] = useState("");
  const [loadingPatientMilestones, setLoadingPatientMilestones] = useState(false);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open || !session?.branch?.id) return;
    apiGet<UsersResponse>(`/api/users/branch/${session.branch.id}`)
      .then((res) => setUsers(res.items))
      .catch(() => setUsers([]));
  }, [open, session]);

  useEffect(() => {
    if (!open || !milestone) return;
    setPatientId(milestone.patientId);
    setProcedure(milestone.procedure);
    setSelectedMilestoneIds([milestone.milestoneId]);
    apiGet<Patient>(`/api/patients/${milestone.patientId}`)
      .then(setMilestonePatient)
      .catch(() => setMilestonePatient(null));
  }, [open, milestone]);

  useEffect(() => {
    if (!open || milestone || !patientId) {
      setPatientMilestones([]);
      setSelectedCaseId("");
      return;
    }

    let cancelled = false;
    setLoadingPatientMilestones(true);
    setSelectedMilestoneIds([]);
    setSelectedCaseId("");
    setProcedure("");
    apiGet<OpenMilestonesResponse>(`/api/patients/${patientId}/open-treatment-milestones`)
      .then((response) => {
        if (!cancelled) setPatientMilestones(response.items);
      })
      .catch(() => {
        if (!cancelled) setPatientMilestones([]);
      })
      .finally(() => {
        if (!cancelled) setLoadingPatientMilestones(false);
      });
    return () => { cancelled = true; };
  }, [open, milestone, patientId]);

  useEffect(() => {
    if (!open) return;
    const nextSlot = getNextAppointmentSlot();
    const nextDate = initialDate ?? nextSlot.date;
    const nextTime = initialHour != null
      ? `${String(initialHour).padStart(2, "0")}:00`
      : nextDate === nextSlot.date ? nextSlot.time : "09:00";
    setDate(nextDate);
    setTime(nextTime);
  }, [open, initialDate, initialHour]);

  useEffect(() => {
    if (!open || !session?.branch?.id) return;
    const startAt = combineDateTime(date, time);
    const params = new URLSearchParams({
      branch_id: session.branch.id,
      start_at: startAt,
      duration_min: String(durationMin),
    });
    apiGet<ChairAvailabilityResponse>(`/api/chairs/availability?${params}`)
      .then((response) => setChairAvailability(response.items))
      .catch(() => setChairAvailability([]));
  }, [open, session?.branch?.id, date, time, durationMin]);

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
    setPatientId(milestone?.patientId ?? "");
    setAssistantId("");
    setChairId("");
    setProcedure(milestone?.procedure ?? "");
    setSelectedMilestoneIds(milestone ? [milestone.milestoneId] : []);
    setPatientMilestones([]);
    setSelectedCaseId("");
    setNotes("");
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!patientId || !clinicianId) {
      toast.error("Vui lòng chọn bệnh nhân và bác sĩ");
      return;
    }
    if (isAppointmentTimeInPast(date, time)) {
      toast.error("Thời gian lịch hẹn phải sau thời điểm hiện tại ít nhất 5 phút");
      return;
    }
    setSaving(true);
    try {
      const scheduled_at = combineDateTime(date, time);
      const appointmentPayload = {
        clinician_id: clinicianId,
        assistant_id: assistantId || undefined,
        chair_id: chairId || undefined,
        scheduled_at,
        duration_min: durationMin,
        procedure: procedure || undefined,
        notes: notes || undefined,
        source: "manual",
      };
      const selectedPatientMilestones = patientMilestones.filter((item) => selectedMilestoneIds.includes(item.milestone_id));
      const milestoneContext = milestone
        ? { planId: milestone.planId, milestoneId: milestone.milestoneId }
        : selectedPatientMilestones[0]
          ? { planId: selectedPatientMilestones[0].treatment_plan_id, milestoneId: selectedPatientMilestones[0].milestone_id }
          : undefined;
      if (milestoneContext) {
        await apiPost(`/api/treatment-plans/${milestoneContext.planId}/case/milestones/${milestoneContext.milestoneId}/appointments`, {
          milestone_ids: selectedMilestoneIds,
          clinician_id: clinicianId,
          assistant_id: assistantId || undefined,
          chair_id: chairId || undefined,
          scheduled_at,
          duration_min: durationMin,
          notes: notes || undefined,
        });
      } else {
        await apiPost<Appointment>("/api/appointments", { patient_id: patientId, ...appointmentPayload });
      }
      toast.success("Đã tạo lịch hẹn");
      onCreated?.();
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
  const milestoneOptions = milestone?.availableMilestones ?? [];
  const availablePatientCases = [...new Map(patientMilestones.map((item) => [item.treatment_case_id, item])).values()];
  const selectedPatientMilestones = patientMilestones.filter((item) => item.treatment_case_id === selectedCaseId);
  const hasLinkedMilestones = Boolean(milestone) || selectedMilestoneIds.length > 0;
  const minimumTime = getMinimumAppointmentTime(date);

  function handleDateChange(nextDate: string) {
    setDate(nextDate);
    const minimum = getMinimumAppointmentTime(nextDate);
    if (minimum && time < minimum) setTime(minimum);
  }

  function toggleMilestone(option: TreatmentCaseMilestone) {
    if (!milestone) return;
    const isSelected = selectedMilestoneIds.includes(option.id);
    const next = isSelected
      ? selectedMilestoneIds.filter((id) => id !== option.id)
      : [...selectedMilestoneIds, option.id];
    if (next.length === 0) return;
    setSelectedMilestoneIds(next);
    const names = milestoneOptions
      .filter((candidate) => next.includes(candidate.id))
      .map((candidate) => candidate.item.service_name ?? candidate.item.procedure);
    setProcedure([...new Set(names)].join("; "));
  }

  function selectPatientCase(caseId: string) {
    setSelectedCaseId(caseId);
    setSelectedMilestoneIds([]);
    setProcedure("");
  }

  function togglePatientMilestone(option: PatientOpenTreatmentMilestone) {
    const isSelected = selectedMilestoneIds.includes(option.milestone_id);
    const next = isSelected
      ? selectedMilestoneIds.filter((id) => id !== option.milestone_id)
      : [...selectedMilestoneIds, option.milestone_id];
    setSelectedMilestoneIds(next);
    const choices = availablePatientCases.length === 1 ? patientMilestones : selectedPatientMilestones;
    const names = choices
      .filter((candidate) => next.includes(candidate.milestone_id))
      .map((candidate) => candidate.item.service_name ?? candidate.item.procedure);
    setProcedure([...new Set(names)].join("; "));
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <form onSubmit={onSubmit}>
        <DialogHeader>
           <DialogTitle>{milestone ? "Đặt lịch từ milestone" : "Tạo lịch hẹn mới"}</DialogTitle>
        </DialogHeader>
        <DialogBody className="grid gap-3">

          {/* Bệnh nhân */}
          <div className="grid gap-1.5">
            <Label htmlFor="patient">Bệnh nhân</Label>
            {milestone ? <Input id="patient" value={milestonePatient ? `${milestonePatient.name} · ${milestonePatient.phone}` : milestone.patientId} readOnly className="bg-muted" /> : <PatientCombobox value={patientId} onChange={setPatientId} required />}
          </div>

          {milestone && milestoneOptions.length > 1 && (
            <div className="grid gap-1.5">
              <Label>Milestone thực hiện trong buổi hẹn</Label>
              <div className="max-h-44 space-y-2 overflow-y-auto rounded-md border p-2">
                {milestoneOptions.map((option) => {
                  const checked = selectedMilestoneIds.includes(option.id);
                  const label = `${option.item.service_name ?? option.item.procedure}${option.item.tooth_number != null ? ` · Răng #${option.item.tooth_number}` : " · Toàn hàm"}`;
                  return <label key={option.id} className="flex cursor-pointer items-start gap-2 rounded px-1 py-1 text-sm hover:bg-muted/60"><input type="checkbox" checked={checked} onChange={() => toggleMilestone(option)} className="mt-0.5" /><span><span className="font-medium">{label}</span><span className="block text-xs text-muted-foreground">{option.item.description}</span></span></label>;
                })}
              </div>
              <p className="text-xs text-muted-foreground">Một lịch hẹn có thể liên kết với nhiều milestone của cùng ca.</p>
            </div>
          )}

          {!milestone && patientId && (
            <div className="grid gap-1.5">
              <Label>Thủ thuật từ kế hoạch điều trị</Label>
              {loadingPatientMilestones ? (
                <p className="text-sm text-muted-foreground">Đang tải thủ thuật đang thực hiện...</p>
              ) : availablePatientCases.length === 0 ? (
                <p className="text-sm text-muted-foreground">Bệnh nhân chưa có thủ thuật đang thực hiện trong ca điều trị.</p>
              ) : (
                <>
                  {availablePatientCases.length > 1 && (
                    <Select value={selectedCaseId} onChange={(event) => selectPatientCase(event.target.value)}>
                      <option value="">— Chọn ca điều trị —</option>
                      {availablePatientCases.map((item) => <option key={item.treatment_case_id} value={item.treatment_case_id}>{item.case_number} · {item.case_title}</option>)}
                    </Select>
                  )}
                  {(availablePatientCases.length === 1 || selectedCaseId) && (
                    <div className="max-h-44 space-y-2 overflow-y-auto rounded-md border p-2">
                      {(availablePatientCases.length === 1 ? patientMilestones : selectedPatientMilestones).map((option) => {
                        const checked = selectedMilestoneIds.includes(option.milestone_id);
                        const label = `${option.item.service_name ?? option.item.procedure}${option.item.tooth_number != null ? ` · Răng #${option.item.tooth_number}` : " · Toàn hàm"}`;
                        return <label key={option.milestone_id} className="flex cursor-pointer items-start gap-2 rounded px-1 py-1 text-sm hover:bg-muted/60"><input type="checkbox" checked={checked} onChange={() => togglePatientMilestone(option)} className="mt-0.5" /><span><span className="font-medium">{label}</span><span className="block text-xs text-muted-foreground">{option.case_number} · {option.status === "in_progress" ? "Đang thực hiện" : "Chưa bắt đầu"}</span></span></label>;
                      })}
                    </div>
                  )}
                  <p className="text-xs text-muted-foreground">Chọn một hoặc nhiều thủ thuật của cùng ca để liên kết vào lịch hẹn.</p>
                </>
              )}
            </div>
          )}

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
                onChange={handleDateChange}
                min={ymd(new Date())}
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
                min={minimumTime}
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

          {chairAvailability.length > 0 && (
            <div className="grid gap-1.5">
              <Label htmlFor="chair">Ghế nha</Label>
              <Select id="chair" value={chairId} onChange={(e) => setChairId(e.target.value)}>
                <option value="">— Chưa gán ghế —</option>
                {chairAvailability.map(({ chair, available, reason }) => (
                  <option key={chair.id} value={chair.id} disabled={!available}>
                    {chair.name}{chair.room_name ? ` · ${chair.room_name}` : ""}
                    {available ? " · Trống" : ` · ${chairReasonLabel(reason)}`}
                  </option>
                ))}
              </Select>
              <p className="text-xs text-muted-foreground">
                Ghế không khả dụng được hiển thị để tham khảo và không thể chọn.
              </p>
            </div>
          )}

          {/* Procedure */}
          <div className="grid gap-1.5">
            <Label htmlFor="procedure">Thủ thuật (tuỳ chọn)</Label>
            <Input
              id="procedure"
              value={procedure}
              onChange={(e) => setProcedure(e.target.value)}
              placeholder="VD: scaling, filling, root_canal…"
              readOnly={hasLinkedMilestones}
              className={hasLinkedMilestones ? "bg-muted" : undefined}
            />
            {milestone && <p className="text-xs text-muted-foreground">Được lấy từ hạng mục kế hoạch: {milestone.label}</p>}
            {!milestone && selectedMilestoneIds.length > 0 && <p className="text-xs text-muted-foreground">Được lấy từ các thủ thuật đã chọn trong kế hoạch điều trị.</p>}
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
          <Button type="submit" disabled={saving || Boolean(milestone && selectedMilestoneIds.length === 0)}>
            {saving ? "Đang tạo…" : "Tạo lịch hẹn"}
          </Button>
        </DialogFooter>
      </form>
    </Dialog>
  );
}

function chairReasonLabel(reason?: string): string {
  switch (reason) {
    case "reserved": return "Đã có lịch";
    case "cleaning": return "Đang vệ sinh";
    case "maintenance": return "Bảo trì";
    case "out_of_service": return "Ngưng hoạt động";
    default: return "Không khả dụng";
  }
}
