import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { apiGet, apiPost, ApiError } from "@/lib/api";
import { toast } from "@/lib/toast";
import { useAuth } from "@/lib/auth-context";
import { ROUTES } from "@shared/constants";
import { combineDateTime, ymd, isoToYmd, isoToTime } from "@/lib/utils";
import { AiChatInput, type ParsedAppointment } from "@/components/schedule/AiChatInput";
import type { Appointment, Patient, UserWithDetails } from "@shared/types";

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
  const [date, setDate] = useState(() => ymd(new Date()));
  const [time, setTime] = useState("09:00");
  const [durationMin, setDurationMin] = useState(30);
  const [procedure, setProcedure] = useState("");
  const [notes, setNotes] = useState("");
  const [patientSearch, setPatientSearch] = useState("");
  const [aiTab, setAiTab] = useState<"manual" | "ai">("manual");

  useEffect(() => {
    if (!session?.branch?.id) return;
    apiGet<UsersResponse>(`/api/users/branch/${session.branch.id}`)
      .then((res) => {
        setAllUsers(res.items);
        setDoctors(res.items.filter((u) => u.role_name === "doctor"));
      })
      .catch(() => {});
    apiGet<PatientsResponse>(`/api/patients?limit=200&search=${encodeURIComponent(patientSearch)}`)
      .then((res) => setPatients(res.items))
      .catch(() => {});
  }, [session, patientSearch]);

  useEffect(() => {
    if (clinicianId || !session?.user?.id) return;
    if (session?.role.name === "doctor") {
      setClinicianId(session.user.id);
    }
  }, [session, clinicianId, setClinicianId]);

  function applyAiParse(parsed: ParsedAppointment) {
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
        source: aiTab === "ai" ? "ai_chat" : "manual",
      });
      toast.success("Đã tạo lịch hẹn");
      navigate(ROUTES.SCHEDULE);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Lỗi tạo lịch hẹn");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl p-4 sm:p-6">
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
            </CardHeader>
            <CardContent>
              <form onSubmit={onSubmit} className="space-y-4">

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

                {allUsers.filter((u) => u.role_name === "assistant").length > 0 && (
                  <div className="grid gap-1.5">
                    <Label>Phụ tá chính</Label>
                    <Select value={assistantId} onChange={(e) => setAssistantId(e.target.value)}>
                      <option value="">— Không chọn —</option>
                      {allUsers.filter((u) => u.role_name === "assistant").map((a) => (
                        <option key={a.id} value={a.id}>{a.name}</option>
                      ))}
                    </Select>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-3">
                  <div className="grid gap-1.5">
                    <Label>Ngày *</Label>
                    <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
                  </div>
                  <div className="grid gap-1.5">
                    <Label>Giờ *</Label>
                    <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} required />
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

                <div className="flex justify-end gap-2 pt-2">
                  <Button type="button" variant="outline" onClick={() => navigate(ROUTES.SCHEDULE)}>
                    Hủy
                  </Button>
                  <Button type="submit" disabled={saving}>
                    {saving ? "Đang tạo…" : "Tạo lịch hẹn"}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}