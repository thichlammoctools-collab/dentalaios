import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { apiPost, ApiError } from "@/lib/api";
import { toast } from "@/lib/toast";
import { useAuth } from "@/lib/auth-context";
import type { Visit } from "@shared/types";

interface VisitFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  patientId: string;
  onCreated: (visit: Visit) => void;
}

export function VisitForm({ open, onOpenChange, patientId, onCreated }: VisitFormProps) {
  const { session } = useAuth();
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

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
      });
      toast.success("Đã tạo lượt khám");
      onCreated(created);
      onOpenChange(false);
      setNotes("");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Lỗi tạo lượt khám");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <form onSubmit={onSubmit}>
        <DialogHeader>
          <DialogTitle>Tạo lượt khám mới</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3">
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
            Bác sĩ phụ trách: <strong>{session?.user.name}</strong> · Branch:{" "}
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