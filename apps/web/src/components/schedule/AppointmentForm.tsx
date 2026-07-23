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
import type { Appointment, DentalChair, Patient, PatientOpenTreatmentMilestone, TreatmentCaseMilestone, TreatmentService, UserWithDetails } from "@shared/types";
import { isAssistantRole, isDoctorRole } from "@shared/constants";
import { combineDateTime, isoToTime, ymd } from "@/lib/utils";
import { getMinimumAppointmentTime, getNextAppointmentSlot, isAppointmentTimeInPast } from "@/lib/appointment-time";
import { PatientCombobox } from "./PatientCombobox";

interface AppointmentFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialDate?: string;   // YYYY-MM-DD, defaults to today
  initialHour?: number;   // 0-23
  initialTime?: string;
  branchId?: string;
  initialClinicianId?: string;
  initialChairId?: string;
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
interface ChairUtilizationResponse {
  items: Array<{ chair: DentalChair; appointment_count: number; scheduled_minutes: number }>;
}
interface ChairUtilizationMetrics {
  today: { appointment_count: number; scheduled_minutes: number };
  week: { appointment_count: number; scheduled_minutes: number };
}
interface ChairScheduleResponse {
  items: Array<{ id: string; chair_id: string; scheduled_at: string; duration_min: number; patient_name: string; clinician_name: string }>;
}
interface OpenMilestonesResponse { items: PatientOpenTreatmentMilestone[]; total: number }

export function AppointmentForm({
  open,
  onOpenChange,
  initialDate,
  initialHour,
  initialTime,
  branchId,
  initialClinicianId,
  initialChairId,
  onCreated,
  milestone,
}: AppointmentFormProps) {
  const { session } = useAuth();
  const targetBranchId = branchId ?? session?.branch?.id;
  const [users, setUsers] = useState<UserWithDetails[]>([]);
  const [patientId, setPatientId] = useState(milestone?.patientId ?? "");
  const [milestonePatient, setMilestonePatient] = useState<Patient | null>(null);
  const [clinicianId, setClinicianId] = useState("");
  const [assistantId, setAssistantId] = useState("");
  const [chairId, setChairId] = useState("");
  const [chairAvailability, setChairAvailability] = useState<ChairAvailabilityResponse["items"]>([]);
  const [chairUtilization, setChairUtilization] = useState<ChairUtilizationMetrics | null>(null);
  const [chairSchedule, setChairSchedule] = useState<ChairScheduleResponse["items"]>([]);
  const [showChairSchedule, setShowChairSchedule] = useState(false);
  const defaultSlot = getNextAppointmentSlot();
  const [date, setDate] = useState(initialDate ?? defaultSlot.date);
  const [time, setTime] = useState(initialTime ?? (initialHour != null ? `${String(initialHour).padStart(2, "0")}:00` : defaultSlot.time));
  const [durationMin, setDurationMin] = useState(30);
  const [procedure, setProcedure] = useState(milestone?.procedure ?? "");
  const [selectedMilestoneIds, setSelectedMilestoneIds] = useState<string[]>(
    milestone ? [milestone.milestoneId] : [],
  );
  const [patientMilestones, setPatientMilestones] = useState<PatientOpenTreatmentMilestone[]>([]);
  const [treatmentServices, setTreatmentServices] = useState<TreatmentService[]>([]);
  const [selectedCaseId, setSelectedCaseId] = useState("");
  const [loadingPatientMilestones, setLoadingPatientMilestones] = useState(false);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [step, setStep] = useState<1 | 2>(1);

  useEffect(() => {
    if (!open || !targetBranchId) return;
    apiGet<UsersResponse>(`/api/users/branch/${targetBranchId}`)
      .then((res) => setUsers(res.items))
      .catch(() => setUsers([]));
  }, [open, targetBranchId]);

  useEffect(() => {
    if (!open) return;
    apiGet<{ items: TreatmentService[] }>("/api/clinic/treatment-services")
      .then((response) => setTreatmentServices(response.items.filter((service) => service.is_active)))
      .catch(() => setTreatmentServices([]));
  }, [open]);

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
        if (cancelled) return;
        setPatientMilestones(response.items);
        if (response.items.length === 0) setProcedure("Khám tư vấn / Tiếp tục điều trị");
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
    const selectedItems = milestone
      ? (milestone.availableMilestones ?? []).filter((item) => selectedMilestoneIds.includes(item.id))
      : patientMilestones.filter((item) => selectedMilestoneIds.includes(item.milestone_id));
    if (selectedItems.length === 0) {
      setDurationMin(30);
      return;
    }
    setDurationMin(Math.min(
      480,
      selectedItems.reduce((total, item) => {
        const serviceDuration = treatmentServices.find((service) => service.code === item.item.service_code)?.estimated_duration_min;
        return total + (serviceDuration ?? item.item.estimated_duration_min);
      }, 0),
    ));
  }, [milestone, milestone?.availableMilestones, patientMilestones, selectedMilestoneIds, treatmentServices]);

  useEffect(() => {
    if (!open) return;
    setStep(1);
    const nextSlot = getNextAppointmentSlot();
    const nextDate = initialDate ?? nextSlot.date;
    const nextTime = initialHour != null
      ? `${String(initialHour).padStart(2, "0")}:00`
      : initialTime ?? (nextDate === nextSlot.date ? nextSlot.time : "09:00");
    setDate(nextDate);
    setTime(nextTime);
    setClinicianId(initialClinicianId ?? "");
    setChairId(initialChairId ?? "");
  }, [open, initialDate, initialHour, initialTime, initialClinicianId, initialChairId]);

  useEffect(() => {
    if (!open || !targetBranchId) return;
    const startAt = combineDateTime(date, time);
    const params = new URLSearchParams({
      branch_id: targetBranchId,
      start_at: startAt,
      duration_min: String(durationMin),
    });
    apiGet<ChairAvailabilityResponse>(`/api/chairs/availability?${params}`)
      .then((response) => setChairAvailability(response.items))
      .catch(() => setChairAvailability([]));
  }, [open, targetBranchId, date, time, durationMin]);

  useEffect(() => {
    if (!open || !chairId || !targetBranchId) {
      setChairUtilization(null);
      return;
    }
    let cancelled = false;
    Promise.all(["today", "week"].map((period) =>
      apiGet<ChairUtilizationResponse>(`/api/chairs/utilization?branch_id=${targetBranchId}&period=${period}`),
    )).then(([today, week]) => {
      if (cancelled) return;
      const todayMetrics = today.items.find((item) => item.chair.id === chairId);
      const weekMetrics = week.items.find((item) => item.chair.id === chairId);
      setChairUtilization({
        today: { appointment_count: todayMetrics?.appointment_count ?? 0, scheduled_minutes: todayMetrics?.scheduled_minutes ?? 0 },
        week: { appointment_count: weekMetrics?.appointment_count ?? 0, scheduled_minutes: weekMetrics?.scheduled_minutes ?? 0 },
      });
    }).catch(() => {
      if (!cancelled) setChairUtilization(null);
    });
    return () => { cancelled = true; };
  }, [open, chairId, targetBranchId]);

  useEffect(() => {
    if (!open || !chairId || !targetBranchId) {
      setChairSchedule([]);
      return;
    }
    let cancelled = false;
    apiGet<ChairScheduleResponse>(`/api/chairs/schedule?branch_id=${targetBranchId}&date=${date}`)
      .then((response) => {
        if (!cancelled) setChairSchedule(response.items.filter((item) => item.chair_id === chairId));
      })
      .catch(() => {
        if (!cancelled) setChairSchedule([]);
      });
    return () => { cancelled = true; };
  }, [open, chairId, date, targetBranchId]);

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
    setClinicianId(initialClinicianId ?? "");
    setAssistantId("");
    setChairId(initialChairId ?? "");
    setProcedure(milestone?.procedure ?? "");
    setSelectedMilestoneIds(milestone ? [milestone.milestoneId] : []);
    setPatientMilestones([]);
    setSelectedCaseId("");
    setNotes("");
    setStep(1);
  }

  function continueToScheduling() {
    if (!patientId) {
      toast.error("Vui lòng chọn bệnh nhân");
      return;
    }
    if (milestone && selectedMilestoneIds.length === 0) {
      toast.error("Vui lòng chọn ít nhất một milestone");
      return;
    }
    setStep(2);
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
        branch_id: branchId,
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
      .map(formatMilestoneLabel);
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
      .map(formatMilestoneLabel);
    setProcedure([...new Set(names)].join("; "));
  }

  const selectedChairAvailability = chairAvailability.find((item) => item.chair.id === chairId);
  const chairHasConflict = chairId !== "" && selectedChairAvailability?.available === false && selectedChairAvailability.reason === "reserved";
  const suggestedTimes = getSuggestedChairTimes(date, time, durationMin, chairSchedule);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <form onSubmit={onSubmit} className="flex min-h-0 flex-1 flex-col">
        <DialogHeader>
           <DialogTitle>{milestone ? "Đặt lịch từ milestone" : "Tạo lịch hẹn mới"}</DialogTitle>
           <AppointmentSteps step={step} />
        </DialogHeader>
        <DialogBody className="grid gap-3">

          {step === 1 && <>
          {/* Bệnh nhân */}
          <div className="grid gap-1.5">
            <Label htmlFor="patient">Bệnh nhân</Label>
            {milestone ? <Input id="patient" value={milestonePatient ? `${milestonePatient.name} · ${milestonePatient.phone}` : milestone.patientId} readOnly className="bg-muted" /> : <PatientCombobox value={patientId} onChange={setPatientId} required dropdownPosition="static" />}
          </div>

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
          </>}

          {step === 2 && <>
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
              {![15, 30, 45, 60, 90, 120].includes(durationMin) && (
                <option value={String(durationMin)}>{durationMin} phút</option>
              )}
              <option value="15">15 phút</option>
              <option value="30">30 phút</option>
              <option value="45">45 phút</option>
              <option value="60">60 phút</option>
              <option value="90">90 phút</option>
              <option value="120">120 phút</option>
            </Select>
            {hasLinkedMilestones && (
              <p className="text-xs text-muted-foreground">Tự động tính theo định mức dịch vụ hiện hành. Có thể điều chỉnh khi cần.</p>
            )}
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
                Ghế không khả dụng được hiển thị để tham khảo và không thể chọn. Mỗi lịch hẹn cần tối thiểu 5 phút chuẩn bị trước và sau ca.
              </p>
              {chairUtilization && (
                <div className="grid grid-cols-2 gap-2 rounded-md border border-border bg-muted/30 p-3 text-sm">
                  <div><p className="text-xs text-muted-foreground">Công suất hôm nay</p><p className="mt-0.5 font-medium">{chairUtilization.today.appointment_count} lịch · {chairUtilization.today.scheduled_minutes} phút</p></div>
                  <div><p className="text-xs text-muted-foreground">Công suất tuần này</p><p className="mt-0.5 font-medium">{chairUtilization.week.appointment_count} lịch · {chairUtilization.week.scheduled_minutes} phút</p></div>
                </div>
              )}
              {chairId && (
                <>
                  <div className={`rounded-md border px-3 py-2 text-sm ${chairHasConflict ? "border-destructive/50 bg-destructive/10 text-destructive" : "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"}`}>
                    {chairHasConflict ? "Trùng lịch ghế với khung giờ đang chọn. Vui lòng chọn giờ hoặc ghế khác." : "Ghế trống cho khung giờ đang chọn, bao gồm khoảng đệm chuẩn bị 5 phút."}
                  </div>
                  {chairHasConflict && suggestedTimes.length > 0 && (
                    <div className="rounded-md border border-border p-3">
                      <p className="text-xs font-medium text-muted-foreground">Giờ phù hợp gần nhất</p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {suggestedTimes.map((suggestedTime) => <Button key={suggestedTime} type="button" size="sm" variant="outline" onClick={() => setTime(suggestedTime)}>{suggestedTime}</Button>)}
                      </div>
                    </div>
                  )}
                  <Button type="button" variant="ghost" size="sm" className="w-fit px-0" onClick={() => setShowChairSchedule((value) => !value)}>
                    {showChairSchedule ? "Ẩn lịch ghế" : `Xem lịch ghế ngày ${date}`}
                  </Button>
                  {showChairSchedule && (
                    <div className="max-h-44 space-y-2 overflow-y-auto rounded-md border border-border p-2">
                      {chairSchedule.length === 0 ? <p className="p-1 text-sm text-muted-foreground">Ghế chưa có lịch trong ngày này.</p> : chairSchedule.map((appointment) => (
                        <div key={appointment.id} className="rounded bg-muted/50 px-3 py-2 text-sm">
                          <p className="font-medium">{isoToTime(appointment.scheduled_at)} · {appointment.duration_min} phút</p>
                          <p className="text-xs text-muted-foreground">{appointment.patient_name} · BS. {appointment.clinician_name}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* Procedure is derived from linked milestones to avoid a duplicate editable field. */}
          {hasLinkedMilestones ? (
            <div className="rounded-md border border-dashed border-border bg-muted/40 px-3 py-2">
              <p className="text-xs font-medium text-muted-foreground">Thủ thuật trong lịch hẹn</p>
              <p className="mt-0.5 text-sm font-medium">{procedure || milestone?.label}</p>
            </div>
          ) : (
            <div className="grid gap-1.5">
              <Label htmlFor="procedure">Thủ thuật (tuỳ chọn)</Label>
              <Input
                id="procedure"
                value={procedure}
                onChange={(e) => setProcedure(e.target.value)}
                placeholder="VD: scaling, filling, root_canal…"
              />
            </div>
          )}

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
          </>}
        </DialogBody>
        <DialogFooter className="mt-4">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Hủy
          </Button>
          {step === 1 ? (
            <Button type="button" onClick={continueToScheduling}>Tiếp tục</Button>
          ) : <>
            <Button type="button" variant="ghost" onClick={() => setStep(1)}>Quay lại</Button>
            <Button type="submit" disabled={saving || Boolean(milestone && selectedMilestoneIds.length === 0)}>
              {saving ? "Đang tạo…" : "Tạo lịch hẹn"}
            </Button>
          </>}
        </DialogFooter>
      </form>
    </Dialog>
  );
}

function formatMilestoneLabel(milestone: { item: TreatmentCaseMilestone["item"] }): string {
  const service = milestone.item.service_name ?? milestone.item.procedure;
  const location = milestone.item.tooth_number != null
    ? `Răng #${milestone.item.tooth_number}`
    : "Toàn hàm";
  return `${service} · ${location}`;
}

function getSuggestedChairTimes(
  date: string,
  currentTime: string,
  durationMin: number,
  appointments: ChairScheduleResponse["items"],
): string[] {
  const current = new Date(`${date}T${currentTime}:00`).getTime();
  const candidates: string[] = [];
  for (let offset = 5; offset <= 180 && candidates.length < 3; offset += 5) {
    const candidate = new Date(current + offset * 60_000);
    const start = candidate.getTime();
    const end = start + durationMin * 60_000;
    const available = appointments.every((appointment) => {
      const appointmentStart = new Date(appointment.scheduled_at).getTime();
      const appointmentEnd = appointmentStart + appointment.duration_min * 60_000;
      return start >= appointmentEnd + 5 * 60_000 || end + 5 * 60_000 <= appointmentStart;
    });
    if (available) candidates.push(`${String(candidate.getHours()).padStart(2, "0")}:${String(candidate.getMinutes()).padStart(2, "0")}`);
  }
  return candidates;
}

function AppointmentSteps({ step }: { step: 1 | 2 }) {
  return (
    <div className="mt-3 flex items-center gap-2 text-xs" aria-label={`Bước ${step} trên 2`}>
      <span className={`flex h-5 w-5 items-center justify-center rounded-full font-semibold ${step === 1 ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>1</span>
      <span className={step === 1 ? "font-medium text-foreground" : "text-muted-foreground"}>Bệnh nhân & nội dung</span>
      <span className="h-px w-5 bg-border" />
      <span className={`flex h-5 w-5 items-center justify-center rounded-full font-semibold ${step === 2 ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>2</span>
      <span className={step === 2 ? "font-medium text-foreground" : "text-muted-foreground"}>Thời gian & xác nhận</span>
    </div>
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
