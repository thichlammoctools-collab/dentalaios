import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DateInput } from "@/components/ui/date-input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { apiGet, apiPost, ApiError } from "@/lib/api";
import { toast } from "@/lib/toast";
import { useAuth } from "@/lib/auth-context";
import { isAssistantRole, isDoctorRole, ROUTES } from "@shared/constants";
import { combineDateTime, ymd, isoToYmd, isoToTime } from "@/lib/utils";
import { getMinimumAppointmentTime, getNextAppointmentSlot, isAppointmentTimeInPast } from "@/lib/appointment-time";
import { AiChatInput, type ParsedAppointment } from "@/components/schedule/AiChatInput";
import type { Appointment, Patient, UserWithDetails } from "@shared/types";
import { PageContainer } from "@/components/PageContainer";

interface PatientsResponse { items: Patient[]; total: number }
interface UsersResponse { items: UserWithDetails[]; total: number }

export function ScheduleNewPage() {
  const { session } = useAuth();
  const navigate = useNavigate();
  const [patients, setPatients] = useState<Patient[]>([]);
  const [doctors, setDoctors] = useState<UserWithDetails[]>([]);
  const [allUsers, setAllUsers] = useState<UserWithDetails[]>([]);
  const [saving, setSaving] = useState(false);

  const [patientId, setPatientId] = useState("");
  const [clinicianId, setClinicianId] = useState("");
  const [assistantId, setAssistantId] = useState("");
  const [date, setDate] = useState(() => getNextAppointmentSlot().date);
  const [time, setTime] = useState(() => getNextAppointmentSlot().time);
  const [durationMin, setDurationMin] = useState(30);
  const [procedure, setProcedure] = useState("");
  const [notes, setNotes] = useState("");
  const [patientSearch, setPatientSearch] = useState("");
  const [aiTab, setAiTab] = useState<"manual" | "ai">("manual");
  const [aiAssisted, setAiAssisted] = useState(false);
  const [step, setStep] = useState<1 | 2>(1);

  useEffect(() => {
    if (!session?.branch?.id) return;
    apiGet<UsersResponse>(`/api/users/branch/${session.branch.id}`)
      .then((res) => {
        setAllUsers(res.items);
        setDoctors(res.items.filter((u) => isDoctorRole(u.role_key, u.role_id, u.role_name)));
      })
      .catch(() => {});
    apiGet<PatientsResponse>(`/api/patients?limit=200&search=${encodeURIComponent(patientSearch)}`)
      .then((res) => setPatients(res.items))
      .catch(() => {});
  }, [session, patientSearch]);

  useEffect(() => {
    if (clinicianId || !session?.user?.id) return;
    if (isDoctorRole(session.role.system_key, session.role.id, session.role.name)) {
      setClinicianId(session.user.id);
    }
  }, [session, clinicianId, setClinicianId]);

  function applyAiParse(parsed: ParsedAppointment) {
    setAiAssisted(true);
    if (parsed.scheduled_at) {
      const iso = new Date(parsed.scheduled_at);
      setDate(isoToYmd(iso.toISOString()));
      setTime(isoToTime(iso.toISOString()));
    }
    if (parsed.duration_min) setDurationMin(parsed.duration_min);
    if (parsed.procedure) setProcedure(parsed.procedure);
    if (parsed.notes) setNotes(parsed.notes);

    // Try to match patient
    if (parsed.patient_hint && patients.length > 0) {
      const match = patients.find((p) =>
        p.name.toLowerCase().includes(parsed.patient_hint!.toLowerCase()),
      );
      if (match) setPatientId(match.id);
    }

    // Try to match clinician
    if (parsed.clinician_hint && doctors.length > 0) {
      const match = doctors.find((d) =>
        d.name.toLowerCase().includes(parsed.clinician_hint!.toLowerCase()),
      );
      if (match) setClinicianId(match.id);
    }

    setAiTab("manual");
    toast.success("Đã điền form — kiểm tra và xác nhận");
  }

  async function onSubmit(e: React.FormEvent) {
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
      await apiPost<Appointment>("/api/appointments", {
        patient_id: patientId,
        clinician_id: clinicianId,
        assistant_id: assistantId || undefined,
        scheduled_at,
        duration_min: durationMin,
        procedure: procedure || undefined,
        notes: notes || undefined,
        source: aiAssisted ? "ai_chat" : "manual",
      });
      toast.success("Đã tạo lịch hẹn");
      navigate(ROUTES.SCHEDULE);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Lỗi tạo lịch hẹn");
    } finally {
      setSaving(false);
    }
  }

  function continueToScheduling() {
    if (!patientId) {
      toast.error("Vui lòng chọn bệnh nhân");
      return;
    }
    if (!clinicianId) {
      toast.error("Vui lòng chọn bác sĩ");
      return;
    }
    setStep(2);
  }

  return (
    <PageContainer size="compact">
      <Tabs value={aiTab} onValueChange={(v) => setAiTab(v as "manual" | "ai")}>
        <TabsList className="mb-4">
          <TabsTrigger value="manual">Thủ công</TabsTrigger>
          <TabsTrigger value="ai">✨ AI nhập lịch</TabsTrigger>
        </TabsList>

        <TabsContent value="ai">
          <AiChatInput onApply={applyAiParse} />
        </TabsContent>

        <TabsContent value="manual">
          <Card>
            <CardHeader>
              <CardTitle>Tạo lịch hẹn mới</CardTitle>
              <AppointmentSteps step={step} />
            </CardHeader>
            <CardContent>
              <form onSubmit={onSubmit} className="space-y-4">

                {step === 1 && <>
                {/* Patient search */}
                <div className="grid gap-1.5">
                  <Label>Tìm bệnh nhân</Label>
                  <Input
                    placeholder="Tên hoặc SĐT…"
                    value={patientSearch}
                    onChange={(e) => setPatientSearch(e.target.value)}
                  />
                </div>

                <div className="grid gap-1.5">
                  <Label>Bệnh nhân *</Label>
                  <Select value={patientId} onChange={(e) => setPatientId(e.target.value)} required>
                    <option value="">— Chọn bệnh nhân —</option>
                    {patients.map((p) => (
                      <option key={p.id} value={p.id}>{p.name} · {p.phone}</option>
                    ))}
                  </Select>
                </div>

                <div className="grid gap-1.5">
                  <Label>Bác sĩ *</Label>
                  <Select value={clinicianId} onChange={(e) => setClinicianId(e.target.value)} required>
                    <option value="">— Chọn bác sĩ —</option>
                    {doctors.map((d) => (
                      <option key={d.id} value={d.id}>{d.name}</option>
                    ))}
                  </Select>
                </div>

                {allUsers.some((u) => isAssistantRole(u.role_key, u.role_id, u.role_name)) && (
                  <div className="grid gap-1.5">
                    <Label>Phụ tá chính</Label>
                    <Select value={assistantId} onChange={(e) => setAssistantId(e.target.value)}>
                      <option value="">— Không chọn —</option>
                      {allUsers.filter((u) => isAssistantRole(u.role_key, u.role_id, u.role_name)).map((a) => (
                        <option key={a.id} value={a.id}>{a.name}</option>
                      ))}
                    </Select>
                  </div>
                )}
                </>}

                {step === 2 && <>
                <div className="grid grid-cols-2 gap-3">
                  <div className="grid gap-1.5">
                    <Label>Ngày *</Label>
                    <DateInput
                      value={date}
                      onChange={(nextDate) => {
                        setDate(nextDate);
                        const minimum = getMinimumAppointmentTime(nextDate);
                        if (minimum && time < minimum) setTime(minimum);
                      }}
                      min={ymd(new Date())}
                      required
                    />
                  </div>
                  <div className="grid gap-1.5">
                    <Label>Giờ *</Label>
                    <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} min={getMinimumAppointmentTime(date)} required />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
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
                    <Label>Thủ thuật (tuỳ chọn)</Label>
                    <Input
                      value={procedure}
                      onChange={(e) => setProcedure(e.target.value)}
                      placeholder="VD: scaling, filling…"
                    />
                  </div>
                </div>

                <div className="grid gap-1.5">
                  <Label>Ghi chú</Label>
                  <Textarea
                    rows={3}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Lưu ý thêm…"
                  />
                </div>
                </>}

                <div className="flex justify-end gap-2 pt-2">
                  <Button type="button" variant="outline" onClick={() => navigate(ROUTES.SCHEDULE)}>
                    Hủy
                  </Button>
                  {step === 1 ? (
                    <Button type="button" onClick={continueToScheduling}>Tiếp tục</Button>
                  ) : <>
                    <Button type="button" variant="ghost" onClick={() => setStep(1)}>Quay lại</Button>
                    <Button type="submit" disabled={saving}>
                      {saving ? "Đang tạo…" : "Tạo lịch hẹn"}
                    </Button>
                  </>}
                </div>
              </form>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </PageContainer>
  );
}

function AppointmentSteps({ step }: { step: 1 | 2 }) {
  return (
    <div className="mt-3 flex items-center gap-2 text-xs" aria-label={`Bước ${step} trên 2`}>
      <span className={`flex h-5 w-5 items-center justify-center rounded-full font-semibold ${step === 1 ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>1</span>
      <span className={step === 1 ? "font-medium text-foreground" : "text-muted-foreground"}>Bệnh nhân & nhân sự</span>
      <span className="h-px w-5 bg-border" />
      <span className={`flex h-5 w-5 items-center justify-center rounded-full font-semibold ${step === 2 ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>2</span>
      <span className={step === 2 ? "font-medium text-foreground" : "text-muted-foreground"}>Thời gian & nội dung</span>
    </div>
  );
}
