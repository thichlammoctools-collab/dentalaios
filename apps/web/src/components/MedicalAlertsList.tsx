import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { apiDelete, apiPost, ApiError } from "@/lib/api";
import { toast } from "@/lib/toast";
import type { MedicalAlert } from "@shared/types";

interface MedicalAlertsListProps {
  patientId: string;
  alerts: MedicalAlert[];
  onCreated: (a: MedicalAlert) => void;
  onDeleted: (id: string) => void;
}

export function MedicalAlertsList({
  patientId,
  alerts,
  onCreated,
  onDeleted,
}: MedicalAlertsListProps) {
  const [open, setOpen] = useState(false);
  const [type, setType] = useState("allergy");
  const [description, setDescription] = useState("");
  const [severity, setSeverity] = useState<"low" | "medium" | "high">("medium");
  const [saving, setSaving] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const created = await apiPost<MedicalAlert>(
        `/api/patients/${patientId}/alerts`,
        { type, description, severity },
      );
      toast.success("Đã thêm cảnh báo");
      onCreated(created);
      setOpen(false);
      setDescription("");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Lỗi");
    } finally {
      setSaving(false);
    }
  }

  async function onDelete(a: MedicalAlert) {
    if (!confirm(`Xóa cảnh báo "${a.description}"?`)) return;
    try {
      await apiDelete(`/api/patients/${patientId}/alerts/${a.id}`);
      onDeleted(a.id);
      toast.success("Đã xóa");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Lỗi xóa");
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Button size="sm" onClick={() => setOpen(true)}>+ Thêm cảnh báo</Button>
      </div>
      {alerts.length === 0 ? (
        <p className="text-sm text-muted-foreground">Chưa có cảnh báo y khoa.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Loại</TableHead>
              <TableHead>Mô tả</TableHead>
              <TableHead>Mức độ</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {alerts.map((a) => (
              <TableRow key={a.id}>
                <TableCell>
                  <Badge variant="outline">{a.type}</Badge>
                </TableCell>
                <TableCell>{a.description}</TableCell>
                <TableCell>
                  <Badge
                    variant={
                      a.severity === "high"
                        ? "destructive"
                        : a.severity === "medium"
                          ? "warning"
                          : "secondary"
                    }
                  >
                    {a.severity}
                  </Badge>
                </TableCell>
                <TableCell>
                  <Button size="sm" variant="ghost" onClick={() => onDelete(a)}>
                    Xóa
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      <Dialog open={open} onOpenChange={setOpen}>
        <form onSubmit={onSubmit}>
          <DialogHeader>
            <DialogTitle>Thêm cảnh báo y khoa</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor="type">Loại</Label>
                <select
                  id="type"
                  value={type}
                  onChange={(e) => setType(e.target.value)}
                  className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm"
                >
                  <option value="allergy">Dị ứng</option>
                  <option value="chronic">Bệnh mãn tính</option>
                  <option value="medication">Thuốc đang dùng</option>
                  <option value="other">Khác</option>
                </select>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="sev">Mức độ</Label>
                <select
                  id="sev"
                  value={severity}
                  onChange={(e) => setSeverity(e.target.value as typeof severity)}
                  className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm"
                >
                  <option value="low">Thấp</option>
                  <option value="medium">Trung bình</option>
                  <option value="high">Cao</option>
                </select>
              </div>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="desc">Mô tả *</Label>
              <Textarea
                id="desc"
                rows={2}
                required
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>
            {/* Placeholder so spacing matches */}
            <Input type="hidden" />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Hủy
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? "Đang lưu…" : "Thêm"}
            </Button>
          </DialogFooter>
        </form>
      </Dialog>
    </div>
  );
}