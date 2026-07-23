import { useEffect, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CurrencyInput } from "@/components/ui/currency-input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
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
  const [discounts, setDiscounts] = useState<Record<string, { amount: number | ""; reason: string }>>({});
  const [method, setMethod] = useState<"cash" | "transfer" | "card" | "other">("cash");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const selectedItems = items.filter((item) => selectedItemIds.includes(item.id));
  const selectedOutstanding = selectedItems.reduce((total, item) => total + item.outstanding_amount, 0);
  const selectedDiscount = selectedItems.reduce((total, item) => {
    const discount = discounts[item.id]?.amount;
    return total + (typeof discount === "number" ? discount : 0);
  }, 0);
  const selectedNetOutstanding = selectedOutstanding - selectedDiscount;

  useEffect(() => {
    setAmount(selectedItems.length > 0 ? Math.max(0, selectedNetOutstanding) : "");
  }, [selectedItems.length, selectedNetOutstanding]);

  useEffect(() => {
    if (!open || !planId) {
      setItems([]);
      setSelectedItemIds([]);
      setDiscounts({});
      return;
    }
    let active = true;
    setItems([]);
    setSelectedItemIds([]);
    setDiscounts({});
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
    setDiscounts((current) => {
      if (!(id in current)) return current;
      const next = { ...current };
      delete next[id];
      return next;
    });
  }

  function updateDiscount(id: string, patch: Partial<{ amount: number | ""; reason: string }>) {
    setDiscounts((current) => ({
      ...current,
      [id]: { amount: current[id]?.amount ?? "", reason: current[id]?.reason ?? "", ...patch },
    }));
  }

  function allocationsForAmount(paymentAmount: number) {
    let remaining = paymentAmount;
    return selectedItems.map((item) => {
      const discount = discounts[item.id];
      const discountAmount = typeof discount?.amount === "number" ? discount.amount : 0;
      const allocation = Math.min(item.outstanding_amount - discountAmount, remaining);
      remaining -= allocation;
      return {
        treatment_plan_item_id: item.id,
        amount: allocation,
        discount_amount: discountAmount,
        discount_reason: discount?.reason.trim() || undefined,
      };
    }).filter((allocation) => allocation.amount > 0 || allocation.discount_amount > 0);
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
    for (const item of selectedItems) {
      const discount = discounts[item.id];
      const discountAmount = typeof discount?.amount === "number" ? discount.amount : 0;
      if (discountAmount > item.outstanding_amount) {
        toast.error("Giảm giá không được vượt số tiền chưa thanh toán của dịch vụ");
        return;
      }
      if (discountAmount > 0 && !discount?.reason.trim()) {
        toast.error("Cần ghi lý do giảm giá cho từng dịch vụ");
        return;
      }
    }
    if (amount > selectedNetOutstanding) {
      toast.error("Số tiền không được vượt số tiền còn lại sau giảm giá của các dịch vụ đã chọn");
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
        notes: notes.trim() || undefined,
      });
      toast.success("Đã ghi nhận thanh toán");
      onCreated(created);
      onOpenChange(false);
      setAmount("");
      setReference("");
      setNotes("");
      setSelectedItemIds([]);
      setDiscounts({});
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
                  <div key={item.id} className={`px-3 py-2.5 text-sm ${!selectable ? "opacity-60" : ""}`}>
                    <label className={`flex cursor-pointer items-start gap-3 ${!selectable ? "cursor-not-allowed" : ""}`}>
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
                          Giá dịch vụ {item.unit_cost.toLocaleString("vi-VN")} VND · Đã thanh toán {item.paid_amount.toLocaleString("vi-VN")} VND · Chờ xác nhận {item.pending_amount.toLocaleString("vi-VN")} VND · Còn lại {item.outstanding_amount.toLocaleString("vi-VN")} VND
                        </span>
                      </span>
                    </label>
                    {selectedItemIds.includes(item.id) && (
                      <div className="mt-2 grid gap-2 pl-7 sm:grid-cols-[180px_1fr]">
                        <div className="grid gap-1">
                          <Label htmlFor={`discount-${item.id}`} className="text-xs">Giảm giá (VND)</Label>
                          <CurrencyInput
                            id={`discount-${item.id}`}
                            value={discounts[item.id]?.amount ?? ""}
                            onChange={(value) => updateDiscount(item.id, { amount: value })}
                            placeholder="0"
                          />
                        </div>
                        <div className="grid gap-1">
                          <Label htmlFor={`discount-reason-${item.id}`} className="text-xs">Lý do giảm giá</Label>
                          <Input
                            id={`discount-reason-${item.id}`}
                            value={discounts[item.id]?.reason ?? ""}
                            onChange={(event) => updateDiscount(item.id, { reason: event.target.value })}
                            placeholder="Bắt buộc khi có giảm giá"
                          />
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            {selectedItems.length > 0 && (
              <p className="text-xs text-muted-foreground">Giá còn lại: {selectedOutstanding.toLocaleString("vi-VN")} VND · Giảm giá: {selectedDiscount.toLocaleString("vi-VN")} VND · Cần thu tối đa: {selectedNetOutstanding.toLocaleString("vi-VN")} VND</p>
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
          <div className="grid gap-1.5">
            <Label htmlFor="payment-notes">Ghi chú thanh toán</Label>
            <Textarea
              id="payment-notes"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder="VD: nội dung trao đổi, điều kiện áp dụng khuyến mãi..."
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
