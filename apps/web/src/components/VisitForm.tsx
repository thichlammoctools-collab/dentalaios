import { useEffect, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
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
    if (!open || !session) return;
    apiGet<UserWithDetailsResponse>(`/api/users/branch/${session.branch.id}`)
      .then((res) => setUsers(res.items))
      .catch(() => setUsers([]));
  }, [open, session]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!session) return;
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
        <div className="grid gap-3">
          {/* Personnel */}
          <div className="border-t pt-3">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
              Nhân sự
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor="treatingClinician">Bác sĩ điều trị</Label>
                <select
                  id="treatingClinician"
                  value={treatingClinicianId}
                  onChange={(e) => setTreatingClinicianId(e.target.value)}
                  className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm"
                >
                  <option value="">— Chưa chọn —</option>
                  {doctors.map((u) => (
                    <option key={u.id} value={u.id}>{u.name}</option>
                  ))}
                </select>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="assistant">Phụ tá</Label>
                <select
                  id="assistant"
                  value={assistantId}
                  onChange={(e) => setAssistantId(e.target.value)}
                  className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm"
                >
                  <option value="">— Chưa chọn —</option>
                  {assistants.map((u) => (
                    <option key={u.id} value={u.id}>{u.name}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Vitals */}
          <div className="border-t pt-3">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
              Chỉ số khám
            </p>
            <div className="grid grid-cols-3 gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor="bpSystolic">Huyết áp (mmHg)</Label>
                <div className="flex items-center gap-1">
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
                  <span className="text-muted-foreground">/</span>
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
          </div>

          <div className="grid gap-1.5">
            <label className="text-sm font-medium">Ghi chú</label>
            <Textarea
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Triệu chứng, yêu cầu ban đầu…"
            />
          </div>
          <p className="text-xs text-muted-foreground">
            Bác sĩ phụ trách: <strong>{session?.user.name}</strong> · Chi nhánh:{" "}
            <strong>{session?.branch.name}</strong>
          </p>
        </div>
        <DialogFooter>
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
