import { useEffect, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogBody, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { apiPost, apiPatch, ApiError } from "@/lib/api";
import { toast } from "@/lib/toast";
import type { Branch } from "@shared/types";
import { branchCreateSchema, branchUpdateSchema } from "@shared/validation";

interface BranchFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  branch?: Branch | null;
  onSaved?: () => void;
}

export function BranchForm({ open, onOpenChange, branch, onSaved }: BranchFormProps) {
  const isEdit = !!branch;

  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [managerName, setManagerName] = useState("");
  const [openingDate, setOpeningDate] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setName(branch?.name ?? "");
      setAddress(branch?.address ?? "");
      setPhone(branch?.phone ?? "");
      setEmail(branch?.email ?? "");
      setManagerName(branch?.manager_name ?? "");
      setOpeningDate(branch?.opening_date ?? "");
    }
  }, [open, branch]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = {
        name,
        address: address || undefined,
        phone: phone || undefined,
        email: email || undefined,
        manager_name: managerName || undefined,
        opening_date: openingDate || undefined,
      };

      // Client-side validation (server also validates)
      const schema = isEdit ? branchUpdateSchema : branchCreateSchema;
      const parsed = schema.safeParse(payload);
      if (!parsed.success) {
        const first = parsed.error.issues[0];
        toast.error(first?.message ?? "Dữ liệu không hợp lệ");
        return;
      }

      if (isEdit && branch) {
        await apiPatch(`/api/clinic/branches/${branch.id}`, parsed.data);
        toast.success("Đã cập nhật chi nhánh");
      } else {
        await apiPost<Branch>("/api/clinic/branches", parsed.data);
        toast.success("Đã thêm chi nhánh");
      }

      onOpenChange(false);
      onSaved?.();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Lỗi lưu chi nhánh");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange} className="sm:max-w-lg">
      <form onSubmit={onSubmit}>
        <DialogHeader>
          <DialogTitle>{isEdit ? "Sửa chi nhánh" : "Thêm chi nhánh mới"}</DialogTitle>
        </DialogHeader>

        <DialogBody className="grid gap-3 max-h-[70vh] overflow-y-auto pr-1">

          {/* ─── 1. Thông tin cơ bản ─── */}
          <SectionDivider icon={<BuildingIcon />}>Thông tin cơ bản</SectionDivider>

          <div className="grid gap-1.5">
            <Label htmlFor="bf-name">
              Tên chi nhánh <span className="text-red-500">*</span>
            </Label>
            <Input
              id="bf-name"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="VD: Chi nhánh Quận 1"
              autoFocus
            />
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="bf-address">Địa chỉ</Label>
            <Textarea
              id="bf-address"
              rows={2}
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="VD: 123 Nguyễn Trãi, Quận 1, TP.HCM"
            />
          </div>

          {/* ─── 2. Liên hệ ─── */}
          <SectionDivider icon={<PhoneIcon />}>Liên hệ</SectionDivider>

          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="bf-phone">Số điện thoại</Label>
              <Input
                id="bf-phone"
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="VD: 0901234567"
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="bf-email">Email</Label>
              <Input
                id="bf-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="VD: cn1@phongkham.vn"
              />
            </div>
          </div>

          {/* ─── 3. Quản lý & Khai trương ─── */}
          <SectionDivider icon={<ManagerIcon />}>Quản lý & Khai trương</SectionDivider>

          <div className="grid gap-1.5">
            <Label htmlFor="bf-manager">Người phụ trách</Label>
            <Input
              id="bf-manager"
              value={managerName}
              onChange={(e) => setManagerName(e.target.value)}
              placeholder="VD: Nguyễn Văn A"
            />
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="bf-opening">Ngày khai trương</Label>
            <Input
              id="bf-opening"
              type="date"
              value={openingDate}
              onChange={(e) => setOpeningDate(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Nếu có, sẽ tạo thêm Lark Calendar event để đánh dấu ngày khai trương.
            </p>
          </div>

        </DialogBody>

        <DialogFooter className="mt-4">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Hủy
          </Button>
          <Button type="submit" disabled={saving || !name.trim()}>
            {saving ? "Đang lưu…" : isEdit ? "Cập nhật" : "Thêm mới"}
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
      <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
        {children}
      </span>
      <div className="flex-1 h-px bg-border" />
    </div>
  );
}

function BuildingIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="4" y="2" width="16" height="20" rx="2" ry="2" />
      <path d="M9 22v-4h6v4" /><path d="M8 6h.01" /><path d="M16 6h.01" /><path d="M12 6h.01" /><path d="M12 10h.01" /><path d="M12 14h.01" /><path d="M16 10h.01" /><path d="M16 14h.01" /><path d="M8 10h.01" /><path d="M8 14h.01" />
    </svg>
  );
}

function PhoneIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.37 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.33 1.85.57 2.81.7A2 2 0 0 1 22 16.92z" />
    </svg>
  );
}

function ManagerIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" />
    </svg>
  );
}