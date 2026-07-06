import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Dialog, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { apiPost, ApiError } from "@/lib/api";
import { toast } from "@/lib/toast";
import type { Payment, TreatmentPlan } from "@shared/types";

function planStatusVi(s: string) {
  if (s === "draft") return "Bản nháp";
  if (s === "in_progress") return "Đang điều trị";
  if (s === "completed") return "Hoàn thành";
  if (s === "cancelled") return "Đã hủy";
  if (s === "approved") return "Đã duyệt";
  if (s === "planned") return "Đã lên kế hoạch";
  return s;
}

interface PaymentFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  patientId: string;
  plans: TreatmentPlan[];
  onCreated: (p: Payment) => void;
}

export function PaymentForm({ open, onOpenChange, patientId, plans, onCreated }: PaymentFormProps) {
  const [planId, setPlanId] = useState(plans[0]?.id ?? "");
  const [amount, setAmount] = useState<number | "">("");
  const [method, setMethod] = useState<"cash" | "transfer" | "card" | "other">("cash");
  const [reference, setReference] = useState("");
  const [saving, setSaving] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (typeof amount !== "number" || amount <= 0) {
      toast.error("Số tiền phải > 0");
      return;
    }
    if (!planId) {
      toast.error("Chọn kế hoạch");
      return;
    }
    setSaving(true);
    try {
      const created = await apiPost<Payment>("/api/payments", {
        treatment_plan_id: planId,
        patient_id: patientId,
        amount,
        currency: "VND",
        method,
        reference: reference || undefined,
      });
      toast.success("Đã ghi nhận thanh toán");
      onCreated(created);
      onOpenChange(false);
      setAmount("");
      setReference("");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Lỗi tạo payment");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <form onSubmit={onSubmit}>
        <DialogHeader>
          <DialogTitle>Ghi nhận thanh toán</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="plan">
              Kế hoạch điều trị <span className="text-red-500">*</span>
            </Label>
            <Select
              id="plan"
              required
              value={planId}
              onChange={(e) => setPlanId(e.target.value)}
            >
              {plans.length === 0 ? (
                <option value="">— Chưa có kế hoạch nào —</option>
              ) : (
                plans.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.id.slice(0, 8)} · {planStatusVi(p.status)} · {p.total_cost.toLocaleString("vi-VN")}{" "}
                    {p.currency}
                  </option>
                ))
              )}
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="amt">
                Số tiền (VND) <span className="text-red-500">*</span>
              </Label>
              <Input
                id="amt"
                type="number"
                min="1"
                required
                value={amount}
                onChange={(e) => setAmount(e.target.value ? Number(e.target.value) : "")}
                placeholder="VD: 1500000"
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="meth">
                Phương thức <span className="text-red-500">*</span>
              </Label>
              <Select
                id="meth"
                value={method}
                onChange={(e) => setMethod(e.target.value as typeof method)}
              >
                <option value="cash">Tiền mặt</option>
                <option value="transfer">Chuyển khoản</option>
                <option value="card">Thẻ</option>
                <option value="other">Khác</option>
              </Select>
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="ref">Mã tham chiếu</Label>
            <Input
              id="ref"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              placeholder="VD: mã giao dịch, số biên nhận…"
            />
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Hủy
          </Button>
          <Button type="submit" disabled={saving || plans.length === 0}>
            {saving ? "Đang lưu…" : "Ghi nhận"}
          </Button>
        </DialogFooter>
      </form>
    </Dialog>
  );
}