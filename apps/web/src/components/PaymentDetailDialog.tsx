import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CurrencyInput } from "@/components/ui/currency-input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogBody, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { apiGet, apiPost, apiPatch, ApiError } from "@/lib/api";
import { toast } from "@/lib/toast";
import { formatCurrency, formatDateTime } from "@/lib/utils";
import type { Payment, PaymentAttachment, PaymentAttachmentKind, PaymentMethod, PaymentStatus } from "@shared/types";

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
  const [attachments, setAttachments] = useState<PaymentAttachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const [adjusting, setAdjusting] = useState(false);
  const [adjustmentAmount, setAdjustmentAmount] = useState<number | "">("");
  const [adjustmentReason, setAdjustmentReason] = useState("");
  const [attachmentKind, setAttachmentKind] = useState<PaymentAttachmentKind>("transfer_receipt");
  const fileInputRef = useRef<HTMLInputElement>(null);

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
    Promise.all([
      apiGet<Payment>(`/api/payments/${paymentId}`),
      apiGet<{ items: PaymentAttachment[] }>(`/api/payments/${paymentId}/attachments`),
    ])
      .then(([p, attachmentResponse]) => {
        if (cancelled) return;
        setPayment(p);
        setAttachments(attachmentResponse.items);
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

  async function onAdjust(e: FormEvent) {
    e.preventDefault();
    if (!payment || typeof adjustmentAmount !== "number" || adjustmentAmount === 0 || !adjustmentReason.trim()) {
      toast.error("Nhập số tiền điều chỉnh và lý do");
      return;
    }
    setAdjusting(true);
    try {
      const adjusted = await apiPost<Payment>(`/api/payments/${payment.id}/adjust`, {
        amount: adjustmentAmount,
        reason: adjustmentReason.trim(),
      });
      toast.success(`Đã tạo điều chỉnh ${adjusted.code}`);
      onSaved(adjusted);
      onClose();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Lỗi tạo điều chỉnh");
    } finally {
      setAdjusting(false);
    }
  }

  async function onUploadProof(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!payment || !file) return;
    if (!(file.type.startsWith("image/") || file.type === "application/pdf")) {
      toast.error("Chỉ hỗ trợ ảnh hoặc PDF");
      return;
    }
    if (file.size > 20 * 1024 * 1024) {
      toast.error("Tệp minh chứng không được vượt quá 20 MB");
      return;
    }
    setUploading(true);
    try {
      const presigned = await apiPost<{ fileId: string; uploadUrl: string }>(`/api/payments/${payment.id}/attachments/presign`, {
        filename: file.name,
        content_type: file.type,
        size: file.size,
      });
      const upload = await fetch(presigned.uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": file.type },
        body: file,
      });
      if (!upload.ok) throw new Error("Không thể tải tệp lên");
      const attachment = await apiPost<PaymentAttachment>(`/api/payments/${payment.id}/attachments`, {
        file_id: presigned.fileId,
        kind: attachmentKind,
      });
      setAttachments((current) => [...current, attachment]);
      toast.success("Đã đính kèm minh chứng");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : err instanceof Error ? err.message : "Lỗi tải minh chứng");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
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
                  <CurrencyInput
                    id="amount"
                    required
                    value={amount}
                    onChange={setAmount}
                    disabled={payment.status === "confirmed"}
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
                    disabled={payment.status === "confirmed"}
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
                  disabled={payment.status === "confirmed"}
                  placeholder="VD: mã giao dịch, số biên nhận…"
                />
              </div>

              <div className="grid gap-1.5">
                <Label htmlFor="notes">Ghi chú</Label>
                <Textarea
                  id="notes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  disabled={payment.status === "confirmed"}
                  placeholder="Ghi chú nội bộ…"
                  rows={3}
                />
              </div>

              {payment.status === "confirmed" && (
                <p className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-700 dark:text-amber-300">
                  Giao dịch đã xác nhận là số liệu tài chính đã chốt. Dùng điều chỉnh để sửa sai lệch.
                </p>
              )}

              <div className="grid gap-2 rounded-lg border border-border p-3">
                <div className="flex items-center justify-between gap-3">
                  <Label>Minh chứng thanh toán</Label>
                  <div className="flex gap-2">
                    <Select value={attachmentKind} onChange={(e) => setAttachmentKind(e.target.value as PaymentAttachmentKind)} className="h-8 w-auto text-xs">
                      <option value="transfer_receipt">Biên lai chuyển khoản</option>
                      <option value="receipt">Phiếu thu</option>
                      <option value="invoice">Hóa đơn</option>
                      <option value="other">Khác</option>
                    </Select>
                    <Button type="button" variant="outline" size="sm" disabled={uploading} onClick={() => fileInputRef.current?.click()}>
                      {uploading ? "Đang tải…" : "Đính kèm"}
                    </Button>
                  </div>
                </div>
                <input ref={fileInputRef} type="file" accept="image/*,application/pdf" className="hidden" onChange={onUploadProof} />
                {attachments.length > 0 ? (
                  <ul className="space-y-1 text-sm text-muted-foreground">
                    {attachments.map((attachment) => <li key={attachment.id} className="truncate">{attachment.file.filename}</li>)}
                  </ul>
                ) : <p className="text-sm text-muted-foreground">Chưa có biên lai hoặc chứng từ.</p>}
              </div>

              {payment.status === "confirmed" && !payment.original_payment_id && (
                <div className="grid gap-2 rounded-lg border border-border p-3">
                  <Label>Điều chỉnh giao dịch</Label>
                  <p className="text-xs text-muted-foreground">Nhập số dương để tăng hoặc số âm để giảm doanh thu. Hệ thống tạo một bút toán mới, không thay đổi giao dịch này.</p>
                  <CurrencyInput value={adjustmentAmount} onChange={setAdjustmentAmount} />
                  <Textarea value={adjustmentReason} onChange={(e) => setAdjustmentReason(e.target.value)} placeholder="Lý do điều chỉnh" rows={2} />
                  <Button type="button" variant="outline" size="sm" className="justify-self-start" disabled={adjusting} onClick={onAdjust}>
                    {adjusting ? "Đang tạo…" : "Tạo điều chỉnh"}
                  </Button>
                </div>
              )}
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
              disabled={saving || loading || !payment || payment.status === "confirmed"}
            >
              {saving ? "Đang lưu…" : "Lưu"}
            </Button>
          </div>
        </DialogFooter>
      </form>
    </Dialog>
  );
}
