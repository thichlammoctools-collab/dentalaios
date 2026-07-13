import { useEffect, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogBody, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { apiGet, apiPost, apiPatch, ApiError } from "@/lib/api";
import { toast } from "@/lib/toast";
import { formatCurrency, formatDateTime } from "@/lib/utils";
import type { Payment, PaymentMethod, PaymentStatus } from "@shared/types";

interface PaymentDetailDialogProps {
  paymentId: string | null;
  onClose: () => void;
  onSaved: (p: Payment) => void;
}

const methodLabels: Record<PaymentMethod, string> = {
  cash: "Tiền mặt",
  transfer: "Chuyển khoản",
  card: "Thẻ",
  other: "Khác",
};

const statusLabels: Record<PaymentStatus, string> = {
  pending: "Chờ xác nhận",
  confirmed: "Đã xác nhận",
  failed: "Thất bại",
};

function statusVariant(s: PaymentStatus): "success" | "destructive" | "warning" {
  if (s === "confirmed") return "success";
  if (s === "failed") return "destructive";
  return "warning";
}

export function PaymentDetailDialog({ paymentId, onClose, onSaved }: PaymentDetailDialogProps) {
  const [payment, setPayment] = useState<Payment | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [statusAction, setStatusAction] = useState<"confirm" | "fail" | null>(null);

  // Editable form state — reset when payment changes
  const [amount, setAmount] = useState<number | "">("");
  const [method, setMethod] = useState<PaymentMethod>("cash");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");

  const open = !!paymentId;

  // Load payment when paymentId changes
  useEffect(() => {
    if (!paymentId) {
      setPayment(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    apiGet<Payment>(`/api/payments/${paymentId}`)
      .then((p) => {
        if (cancelled) return;
        setPayment(p);
        setAmount(p.amount);
        setMethod(p.method);
        setReference(p.reference ?? "");
        setNotes(p.notes ?? "");
      })
      .catch((err) => {
        if (cancelled) return;
        toast.error(err instanceof ApiError ? err.message : "Lỗi tải thanh toán");
        onClose();
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [paymentId, onClose]);

  async function onSave(e: FormEvent) {
    e.preventDefault();
    if (!payment) return;
    if (typeof amount !== "number" || amount <= 0) {
      toast.error("Số tiền phải > 0");
      return;
    }
    setSaving(true);
    try {
      const patch: { amount: number; method: PaymentMethod; reference?: string; notes?: string } = {
        amount,
        method,
        reference: reference.trim() || undefined,
        notes: notes.trim() || undefined,
      };
      const updated = await apiPatch<Payment>(`/api/payments/${payment.id}`, patch);
      toast.success("Đã lưu thay đổi");
      onSaved(updated);
      onClose();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Lỗi lưu");
    } finally {
      setSaving(false);
    }
  }

  async function onChangeStatus(action: "confirm" | "fail") {
    if (!payment) return;
    setStatusAction(action);
    try {
      const updated = await apiPost<Payment>(`/api/payments/${payment.id}/${action}`);
      toast.success(action === "confirm" ? "Đã xác nhận thanh toán" : "Đã đánh dấu thất bại");
      onSaved(updated);
      onClose();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Lỗi cập nhật trạng thái");
    } finally {
      setStatusAction(null);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <form onSubmit={onSave}>
        <DialogHeader>
          <DialogTitle>Chi tiết thanh toán</DialogTitle>
        </DialogHeader>

        <DialogBody className="grid gap-4">
          {loading || !payment ? (
            <p className="text-sm text-muted-foreground">Đang tải…</p>
          ) : (
            <>
              {/* Read-only meta block */}
              <div className="rounded-lg border border-border bg-muted/20 p-3 grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-xs text-muted-foreground">Mã thanh toán</p>
                  <p className="font-mono font-medium mt-0.5 select-all">{payment.code}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Trạng thái</p>
                  <div className="mt-1">
                    <Badge variant={statusVariant(payment.status)}>
                      {statusLabels[payment.status]}
                    </Badge>
                  </div>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Ngày tạo</p>
                  <p className="font-medium mt-0.5">{formatDateTime(payment.created_at)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Số tiền hiện tại</p>
                  <p className="font-medium mt-0.5">
                    {formatCurrency(payment.amount, payment.currency)}
                  </p>
                </div>
              </div>

              {/* Editable fields */}
              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-1.5">
                  <Label htmlFor="amount">
                    Số tiền (VND) <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    id="amount"
                    type="number"
                    min="1"
                    required
                    value={amount}
                    onChange={(e) => setAmount(e.target.value ? Number(e.target.value) : "")}
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="method">
                    Phương thức <span className="text-red-500">*</span>
                  </Label>
                  <Select
                    id="method"
                    value={method}
                    onChange={(e) => setMethod(e.target.value as PaymentMethod)}
                  >
                    <option value="cash">Tiền mặt</option>
                    <option value="transfer">Chuyển khoản</option>
                    <option value="card">Thẻ</option>
                    <option value="other">Khác</option>
                  </Select>
                </div>
              </div>

              <div className="grid gap-1.5">
                <Label htmlFor="reference">Mã tham chiếu</Label>
                <Input
                  id="reference"
                  value={reference}
                  onChange={(e) => setReference(e.target.value)}
                  placeholder="VD: mã giao dịch, số biên nhận…"
                />
              </div>

              <div className="grid gap-1.5">
                <Label htmlFor="notes">Ghi chú</Label>
                <Textarea
                  id="notes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Ghi chú nội bộ…"
                  rows={3}
                />
              </div>
            </>
          )}
        </DialogBody>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          {/* Status actions — only available while pending */}
          {payment?.status === "pending" && !loading && (
            <div className="flex gap-2 sm:mr-auto">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={statusAction !== null}
                onClick={() => onChangeStatus("confirm")}
              >
                {statusAction === "confirm" ? "…" : "Xác nhận"}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={statusAction !== null}
                onClick={() => onChangeStatus("fail")}
                className="text-destructive"
              >
                {statusAction === "fail" ? "…" : "Đánh fail"}
              </Button>
            </div>
          )}
          <div className="flex gap-2 sm:ml-auto">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={saving || loading}
            >
              Hủy
            </Button>
            <Button
              type="submit"
              disabled={saving || loading || !payment}
            >
              {saving ? "Đang lưu…" : "Lưu"}
            </Button>
          </div>
        </DialogFooter>
      </form>
    </Dialog>
  );
}