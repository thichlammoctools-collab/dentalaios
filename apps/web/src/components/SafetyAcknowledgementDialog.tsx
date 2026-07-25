import { useState, useEffect } from "react";
import { Dialog, DialogHeader, DialogTitle, DialogBody, DialogFooter } from "@/components/ui/dialog";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import type { VisitSafetyAcknowledgementOutcome } from "@shared/types";

const OUTCOME_OPTIONS: { value: VisitSafetyAcknowledgementOutcome; label: string }[] = [
  { value: "acknowledged", label: "Xác nhận" },
  { value: "continue_with_reason", label: "Tiếp tục với lý do" },
  { value: "defer_treatment", label: "Hoãn điều trị" },
  { value: "refer_or_escalate", label: "Chuyển hoặc escalate" },
];

interface SafetyAcknowledgementDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (outcome: VisitSafetyAcknowledgementOutcome, reason?: string) => void;
}

export function SafetyAcknowledgementDialog({ open, onOpenChange, onSubmit }: SafetyAcknowledgementDialogProps) {
  const [outcome, setOutcome] = useState<VisitSafetyAcknowledgementOutcome>("acknowledged");
  const [reason, setReason] = useState("");

  useEffect(() => {
    if (open) {
      setOutcome("acknowledged");
      setReason("");
    }
  }, [open]);

  const requiresReason = outcome !== "acknowledged";

  function handleSubmit() {
    if (requiresReason && !reason.trim()) return;
    onSubmit(outcome, requiresReason ? reason.trim() : undefined);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange} size="sm">
      <DialogHeader>
        <DialogTitle>Đánh giá cảnh báo an toàn</DialogTitle>
      </DialogHeader>

      <DialogBody className="space-y-4">
        <div className="grid gap-1.5">
          <Label htmlFor="safety-outcome">Outcome</Label>
          <Select
            id="safety-outcome"
            value={outcome}
            onChange={(e) => setOutcome(e.target.value as VisitSafetyAcknowledgementOutcome)}
          >
            {OUTCOME_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </Select>
        </div>

        {requiresReason && (
          <div className="grid gap-1.5">
            <Label htmlFor="safety-reason">Lý do hoặc hướng xử trí</Label>
            <Textarea
              id="safety-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              placeholder="Nhập lý do..."
            />
          </div>
        )}
      </DialogBody>

      <DialogFooter>
        <Button variant="outline" onClick={() => onOpenChange(false)}>Hủy</Button>
        <Button onClick={handleSubmit} disabled={requiresReason && !reason.trim()}>
          Xác nhận
        </Button>
      </DialogFooter>
    </Dialog>
  );
}
