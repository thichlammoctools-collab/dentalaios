import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { apiPost, apiPut, ApiError } from "@/lib/api";
import { toast } from "@/lib/toast";
import { useAuth } from "@/lib/auth-context";
import type { Patient } from "@shared/types";
import type { PatientCreateInput } from "@shared/validation";

interface PatientFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  patient?: Patient | null;
  onSaved?: () => void;
}

export function PatientForm({ open, onOpenChange, patient, onSaved }: PatientFormProps) {
  const { session } = useAuth();
  const navigate = useNavigate();
  const branchId = session?.branch.id ?? "";

  const [name, setName] = useState(patient?.name ?? "");
  const [dateOfBirth, setDateOfBirth] = useState(patient?.date_of_birth ?? "");
  const [gender, setGender] = useState<"M" | "F" | "O">(patient?.gender ?? "M");
  const [phone, setPhone] = useState(patient?.phone ?? "");
  const [email, setEmail] = useState(patient?.email ?? "");
  const [notes, setNotes] = useState(patient?.notes ?? "");
  const [saving, setSaving] = useState(false);

  const isEdit = !!patient;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!branchId) {
      toast.error("Không tìm thấy branch_id — vui lòng đăng nhập lại");
      return;
    }
    setSaving(true);
    try {
      const payload: PatientCreateInput = {
        branch_id: branchId,
        name,
        date_of_birth: dateOfBirth,
        gender,
        phone,
        email: email || undefined,
        notes: notes || undefined,
      };
      if (isEdit && patient) {
        const updated = await apiPut<Patient>(`/api/patients/${patient.id}`, payload);
        toast.success("Đã cập nhật bệnh nhân");
        onSaved?.();
        onOpenChange(false);
        navigate(`/patients/${updated.id}`);
      } else {
        const created = await apiPost<Patient>("/api/patients", payload);
        toast.success("Đã tạo bệnh nhân");
        onSaved?.();
        onOpenChange(false);
        navigate(`/patients/${created.id}`);
      }
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : "Lỗi không xác định";
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <form onSubmit={onSubmit}>
        <DialogHeader>
          <DialogTitle>{isEdit ? "Sửa bệnh nhân" : "Tạo bệnh nhân mới"}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="name">Họ tên *</Label>
            <Input
              id="name"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="dob">Ngày sinh *</Label>
              <Input
                id="dob"
                type="date"
                required
                value={dateOfBirth}
                onChange={(e) => setDateOfBirth(e.target.value)}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="gender">Giới tính *</Label>
              <Select
                id="gender"
                value={gender}
                onChange={(e) => setGender(e.target.value as "M" | "F" | "O")}
              >
                <option value="M">Nam</option>
                <option value="F">Nữ</option>
                <option value="O">Khác</option>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="phone">Số điện thoại *</Label>
              <Input
                id="phone"
                required
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="notes">Ghi chú</Label>
            <Textarea
              id="notes"
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Hủy
          </Button>
          <Button type="submit" disabled={saving}>
            {saving ? "Đang lưu…" : isEdit ? "Cập nhật" : "Tạo"}
          </Button>
        </DialogFooter>
      </form>
    </Dialog>
  );
}