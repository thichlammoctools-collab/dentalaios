import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogBody, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
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
                  <Badge variant="outline" color="blue">{a.type}</Badge>
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
          <DialogBody className="grid gap-3">

            <SectionDivider icon={<AlertIcon />}>Loại & Mức độ</SectionDivider>

            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor="type">Loại</Label>
                <Select
                  id="type"
                  value={type}
                  onChange={(e) => setType(e.target.value)}
                >
                  <option value="allergy">Dị ứng</option>
                  <option value="chronic">Bệnh mãn tính</option>
                  <option value="medication">Thuốc đang dùng</option>
                  <option value="other">Khác</option>
                </Select>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="sev">Mức độ</Label>
                <Select
                  id="sev"
                  value={severity}
                  onChange={(e) => setSeverity(e.target.value as typeof severity)}
                >
                  <option value="low">Thấp</option>
                  <option value="medium">Trung bình</option>
                  <option value="high">Cao</option>
                </Select>
              </div>
            </div>

            <SectionDivider icon={<DescIcon />}>Mô tả</SectionDivider>

            <div className="grid gap-1.5">
              <Label htmlFor="desc">
                Mô tả <span className="text-red-500">*</span>
              </Label>
              <Textarea
                id="desc"
                rows={2}
                required
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="VD: Dị ứng kháng sinh Amoxicillin, hen phế quản…"
              />
            </div>
          </DialogBody>
          <DialogFooter className="mt-4">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Hủy
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? "Đang lưu…" : "Thêm cảnh báo"}
            </Button>
          </DialogFooter>
        </form>
      </Dialog>
    </div>
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

function AlertIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
      <line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  );
}

function DescIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" x2="8" y1="13" y2="13" /><line x1="16" x2="8" y1="17" y2="17" />
    </svg>
  );
}