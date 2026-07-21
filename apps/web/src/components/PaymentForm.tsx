import { useEffect, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CurrencyInput } from "@/components/ui/currency-input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Dialog, DialogBody, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { apiGet, apiPost, ApiError } from "@/lib/api";
import { toast } from "@/lib/toast";
import type { Payment, PaymentableTreatmentPlanItem, TreatmentPlan } from "@shared/types";

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
  const [items, setItems] = useState<PaymentableTreatmentPlanItem[]>([]);
  const [selectedItemIds, setSelectedItemIds] = useState<string[]>([]);
  const [method, setMethod] = useState<"cash" | "transfer" | "card" | "other">("cash");
  const [reference, setReference] = useState("");
  const [saving, setSaving] = useState(false);

  const selectedItems = items.filter((item) => selectedItemIds.includes(item.id));
  const selectedOutstanding = selectedItems.reduce((total, item) => total + item.outstanding_amount, 0);

  useEffect(() => {
    if (!open || !planId) {
      setItems([]);
      setSelectedItemIds([]);
      return;
    }
    let active = true;
    setItems([]);
    setSelectedItemIds([]);
    void apiGet<{ items: PaymentableTreatmentPlanItem[] }>(`/api/payments/paymentable-items?treatment_plan_id=${planId}`)
      .then((response) => {
        if (!active) return;
        setItems(response.items);
      })
      .catch((err) => {
        if (!active) return;
        toast.error(err instanceof ApiError ? err.message : "Không thể tải dịch vụ cần thanh toán");
      });
    return () => { active = false; };
  }, [open, planId]);

  function toggleItem(id: string) {
    setSelectedItemIds((current) => current.includes(id)
      ? current.filter((itemId) => itemId !== id)
      : [...current, id]);
  }

  function allocationsForAmount(paymentAmount: number) {
    let remaining = paymentAmount;
    return selectedItems.map((item) => {
      const allocation = Math.min(item.outstanding_amount, remaining);
      remaining -= allocation;
      return { treatment_plan_item_id: item.id, amount: allocation };
    }).filter((allocation) => allocation.amount > 0);
  }

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
    if (selectedItems.length === 0) {
      toast.error("Chọn ít nhất một dịch vụ chưa thanh toán");
      return;
    }
    if (amount > selectedOutstanding) {
      toast.error("Số tiền không được vượt số tiền chưa thanh toán của các dịch vụ đã chọn");
      return;
    }
    setSaving(true);
    try {
      const created = await apiPost<Payment>("/api/payments", {
        treatment_plan_id: planId,
        patient_id: patientId,
        amount,
        allocations: allocationsForAmount(amount),
        currency: "VND",
        method,
        reference: reference || undefined,
      });
      toast.success("Đã ghi nhận thanh toán");
      onCreated(created);
      onOpenChange(false);
      setAmount("");
      setReference("");
      setSelectedItemIds([]);
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
        <DialogBody className="grid gap-3">
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
                plans.filter((p) => p.status !== "draft" && p.status !== "cancelled").map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.id.slice(0, 8)} · {planStatusVi(p.status)} · {p.total_cost.toLocaleString("vi-VN")}{" "}
                    {p.currency}
                  </option>
                ))
              )}
            </Select>
          </div>
          <div className="grid gap-1.5">
            <Label>
              Dịch vụ chưa thanh toán <span className="text-red-500">*</span>
            </Label>
            <div className="max-h-52 divide-y overflow-y-auto rounded-md border border-input">
              {items.length === 0 ? (
                <p className="px-3 py-3 text-sm text-muted-foreground">Không có dịch vụ chưa thanh toán.</p>
              ) : items.map((item) => {
                const selectable = item.outstanding_amount > 0;
                const itemLabel = item.service_name || item.description || item.procedure;
                return (
                  <label key={item.id} className={`flex cursor-pointer items-start gap-3 px-3 py-2.5 text-sm ${!selectable ? "cursor-not-allowed opacity-60" : ""}`}>
                    <input
                      type="checkbox"
                      className="mt-1 h-4 w-4 accent-primary"
                      checked={selectedItemIds.includes(item.id)}
                      disabled={!selectable}
                      onChange={() => toggleItem(item.id)}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block font-medium">{item.tooth_number ? `Răng ${item.tooth_number}: ` : ""}{itemLabel}</span>
                      <span className="block text-xs text-muted-foreground">
                        Giá {item.unit_cost.toLocaleString("vi-VN")} VND · Đã thanh toán {item.paid_amount.toLocaleString("vi-VN")} VND · Chờ xác nhận {item.pending_amount.toLocaleString("vi-VN")} VND · Có thể thanh toán {item.outstanding_amount.toLocaleString("vi-VN")} VND
                      </span>
                    </span>
                  </label>
                );
              })}
            </div>
            {selectedItems.length > 0 && (
              <p className="text-xs text-muted-foreground">Tổng chưa thanh toán của dịch vụ đã chọn: {selectedOutstanding.toLocaleString("vi-VN")} VND</p>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="amt">
                Số tiền (VND) <span className="text-red-500">*</span>
              </Label>
              <CurrencyInput
                id="amt"
                required
                value={amount}
                onChange={setAmount}
                placeholder="VD: 1 500 000"
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
        </DialogBody>
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
