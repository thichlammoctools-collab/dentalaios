import { useEffect, useState, type FormEvent } from "react";
import { apiPost, ApiError } from "@/lib/api";
import { toast } from "@/lib/toast";
import { Button } from "@/components/ui/button";
import { CurrencyInput } from "@/components/ui/currency-input";
import { DateInput } from "@/components/ui/date-input";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogBody, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { Expense, ExpenseCategory, FinanceBranch, PaymentMethod } from "@shared/types";

const categories: Array<{ value: ExpenseCategory; label: string }> = [
  { value: "rent", label: "Mặt bằng" },
  { value: "utilities", label: "Điện nước" },
  { value: "supplies", label: "Vật tư" },
  { value: "lab_fee", label: "Chi phí labo" },
  { value: "staff_cost", label: "Nhân sự" },
  { value: "marketing", label: "Marketing" },
  { value: "maintenance", label: "Bảo trì" },
  { value: "equipment", label: "Thiết bị" },
  { value: "administration", label: "Hành chính" },
  { value: "other", label: "Khác" },
];

function todayHcm() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const value = (type: "year" | "month" | "day") => parts.find((part) => part.type === type)?.value ?? "";
  return `${value("year")}-${value("month")}-${value("day")}`;
}

interface ExpenseFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  branches: FinanceBranch[];
  onCreated: (expense: Expense) => void;
}

export function ExpenseForm({ open, onOpenChange, branches, onCreated }: ExpenseFormProps) {
  const [occurredAt, setOccurredAt] = useState(todayHcm);
  const [branchId, setBranchId] = useState("");
  const [category, setCategory] = useState<ExpenseCategory>("supplies");
  const [amount, setAmount] = useState<number | "">("");
  const [method, setMethod] = useState<PaymentMethod>("transfer");
  const [vendorName, setVendorName] = useState("");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) setOccurredAt(todayHcm());
  }, [open]);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (typeof amount !== "number" || amount <= 0) {
      toast.error("Số tiền phải lớn hơn 0");
      return;
    }
    setSaving(true);
    try {
      const expense = await apiPost<Expense>("/api/finance/expenses", {
        branch_id: branchId || null,
        occurred_at: occurredAt,
        category,
        amount,
        currency: "VND",
        method,
        vendor_name: vendorName.trim() || undefined,
        reference: reference.trim() || undefined,
        notes: notes.trim() || undefined,
      });
      toast.success("Đã ghi nhận chi phí");
      onCreated(expense);
      onOpenChange(false);
      setAmount("");
      setVendorName("");
      setReference("");
      setNotes("");
      setBranchId("");
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Không thể ghi nhận chi phí");
    } finally {
      setSaving(false);
    }
  }

  return <Dialog open={open} onOpenChange={onOpenChange}>
    <form onSubmit={onSubmit}>
      <DialogHeader><DialogTitle>Ghi nhận chi phí</DialogTitle></DialogHeader>
      <DialogBody className="grid gap-4">
        <div className="grid gap-1.5 sm:grid-cols-2 sm:gap-3">
          <div className="grid gap-1.5"><Label>Ngày chi <span className="text-destructive">*</span></Label><DateInput value={occurredAt} onChange={setOccurredAt} required /></div>
          <div className="grid gap-1.5"><Label>Chi nhánh</Label><Select value={branchId} onChange={(event) => setBranchId(event.target.value)}><option value="">Chi phí chung phòng khám</option>{branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</Select></div>
        </div>
        <div className="grid gap-1.5 sm:grid-cols-2 sm:gap-3">
          <div className="grid gap-1.5"><Label>Nhóm chi phí <span className="text-destructive">*</span></Label><Select value={category} onChange={(event) => setCategory(event.target.value as ExpenseCategory)}>{categories.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</Select></div>
          <div className="grid gap-1.5"><Label>Số tiền (VND) <span className="text-destructive">*</span></Label><CurrencyInput value={amount} onChange={setAmount} required placeholder="VD: 2 500 000" /></div>
        </div>
        <div className="grid gap-1.5 sm:grid-cols-2 sm:gap-3">
          <div className="grid gap-1.5"><Label>Phương thức <span className="text-destructive">*</span></Label><Select value={method} onChange={(event) => setMethod(event.target.value as PaymentMethod)}><option value="cash">Tiền mặt</option><option value="transfer">Chuyển khoản</option><option value="card">Thẻ</option><option value="other">Khác</option></Select></div>
          <div className="grid gap-1.5"><Label>Nhà cung cấp</Label><Input value={vendorName} onChange={(event) => setVendorName(event.target.value)} maxLength={200} placeholder="VD: Công ty vật tư nha khoa" /></div>
        </div>
        <div className="grid gap-1.5"><Label>Mã tham chiếu</Label><Input value={reference} onChange={(event) => setReference(event.target.value)} maxLength={200} placeholder="Số hóa đơn, mã giao dịch..." /></div>
        <div className="grid gap-1.5"><Label>Ghi chú</Label><Textarea value={notes} onChange={(event) => setNotes(event.target.value)} maxLength={1000} placeholder="Thông tin đối chiếu nội bộ..." /></div>
      </DialogBody>
      <DialogFooter><Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Hủy</Button><Button type="submit" disabled={saving}>{saving ? "Đang lưu..." : "Ghi nhận"}</Button></DialogFooter>
    </form>
  </Dialog>;
}
