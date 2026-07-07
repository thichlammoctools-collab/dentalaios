import { useEffect, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogBody, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { apiGet, apiPost, ApiError } from "@/lib/api";
import { toast } from "@/lib/toast";
import { useAuth } from "@/lib/auth-context";
import type { Visit } from "@shared/types";
import type { UserWithDetails } from "@shared/types";

interface UserWithDetailsResponse {
  items: UserWithDetails[];
  total: number;
}

interface VisitFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  patientId: string;
  onCreated: (visit: Visit) => void;
}

export function VisitForm({ open, onOpenChange, patientId, onCreated }: VisitFormProps) {
  const { session } = useAuth();
  const [users, setUsers] = useState<UserWithDetails[]>([]);
  const [notes, setNotes] = useState("");
  const [bpSystolic, setBpSystolic] = useState("");
  const [bpDiastolic, setBpDiastolic] = useState("");
  const [bloodSugar, setBloodSugar] = useState("");
  const [treatingClinicianId, setTreatingClinicianId] = useState("");
  const [assistantId, setAssistantId] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open || !session?.branch?.id) return;
    apiGet<UserWithDetailsResponse>(`/api/users/branch/${session.branch.id}`)
      .then((res) => setUsers(res.items))
      .catch(() => setUsers([]));
  }, [open, session]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!session?.branch?.id) {
      toast.error("Không tìm thấy chi nhánh — vui lòng đăng nhập lại");
      return;
    }
    if (!session?.user?.id) {
      toast.error("Không tìm thấy người dùng — vui lòng đăng nhập lại");
      return;
    }
    setSaving(true);
    try {
      const created = await apiPost<Visit>("/api/visits", {
        patient_id: patientId,
        branch_id: session.branch.id,
        clinician_id: session.user.id,
        notes: notes || undefined,
        blood_pressure_systolic: bpSystolic ? Number(bpSystolic) : undefined,
        blood_pressure_diastolic: bpDiastolic ? Number(bpDiastolic) : undefined,
        blood_sugar_mgdl: bloodSugar ? Number(bloodSugar) : undefined,
        vitals_recorded_at: (bpSystolic || bpDiastolic || bloodSugar) ? new Date().toISOString() : undefined,
        treating_clinician_id: treatingClinicianId || null,
        assistant_id: assistantId || null,
      });
      toast.success("Đã tạo lượt khám");
      onCreated(created);
      onOpenChange(false);
      setNotes("");
      setBpSystolic("");
      setBpDiastolic("");
      setBloodSugar("");
      setTreatingClinicianId("");
      setAssistantId("");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Lỗi tạo lượt khám");
    } finally {
      setSaving(false);
    }
  }

  const doctors = users.filter((u) => u.role_name === "doctor");
  const assistants = users.filter((u) => u.role_name === "assistant");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <form onSubmit={onSubmit}>
        <DialogHeader>
          <DialogTitle>Tạo lượt khám mới</DialogTitle>
        </DialogHeader>
        <DialogBody className="grid gap-3">

          <SectionDivider icon={<TeamIcon />}>Nhân sự</SectionDivider>

          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="treatingClinician">Bác sĩ điều trị</Label>
              <Select
                id="treatingClinician"
                value={treatingClinicianId}
                onChange={(e) => setTreatingClinicianId(e.target.value)}
              >
                <option value="">— Chưa chọn —</option>
                {doctors.map((u) => (
                  <option key={u.id} value={u.id}>{u.name}</option>
                ))}
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="assistant">Phụ tá</Label>
              <Select
                id="assistant"
                value={assistantId}
                onChange={(e) => setAssistantId(e.target.value)}
              >
                <option value="">— Chưa chọn —</option>
                {assistants.map((u) => (
                  <option key={u.id} value={u.id}>{u.name}</option>
                ))}
              </Select>
            </div>
          </div>

          <SectionDivider icon={<VitalIcon />}>Chỉ số khám</SectionDivider>

          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="bpSystolic">Huyết áp (mmHg)</Label>
              <div className="flex items-center gap-2">
                <Input
                  id="bpSystolic"
                  type="number"
                  placeholder="Tâm thu"
                  min={50}
                  max={300}
                  value={bpSystolic}
                  onChange={(e) => setBpSystolic(e.target.value)}
                  className="w-full"
                />
                <span className="text-muted-foreground shrink-0">/</span>
                <Input
                  type="number"
                  placeholder="Tâm trương"
                  min={30}
                  max={200}
                  value={bpDiastolic}
                  onChange={(e) => setBpDiastolic(e.target.value)}
                  className="w-full"
                />
              </div>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="bloodSugar">Đường huyết (mg/dL)</Label>
              <Input
                id="bloodSugar"
                type="number"
                placeholder="VD: 95"
                min={20}
                max={600}
                value={bloodSugar}
                onChange={(e) => setBloodSugar(e.target.value)}
              />
            </div>
          </div>

          <SectionDivider icon={<NotesIcon />}>Ghi chú</SectionDivider>

          <div className="grid gap-1.5">
            <Textarea
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Triệu chứng, yêu cầu ban đầu…"
            />
          </div>

          <p className="text-xs text-muted-foreground px-1">
            Bác sĩ phụ trách: <strong className="text-foreground">{session?.user.name}</strong>
            {session?.branch.name && <> · Chi nhánh: <strong className="text-foreground">{session.branch.name}</strong></>}
          </p>
        </DialogBody>
        <DialogFooter className="mt-4">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Hủy
          </Button>
          <Button type="submit" disabled={saving}>
            {saving ? "Đang tạo…" : "Tạo lượt khám"}
          </Button>
        </DialogFooter>
      </form>
    </Dialog>
  );
}

function SectionDivider({ children, icon }: { children: React.ReactNode; icon?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 py-1">
      {icon && <span className="text-muted-foreground">{icon}</span>}
      <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{children}</span>
      <div className="flex-1 h-px bg-border" />
    </div>
  );
}

function TeamIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}

function VitalIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
    </svg>
  );
}

function NotesIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" /><line x1="16" x2="8" y1="13" y2="13" /><line x1="16" x2="8" y1="17" y2="17" />
    </svg>
  );
}
