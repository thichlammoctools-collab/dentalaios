import { useState, useEffect } from "react";
import { Dialog, DialogHeader, DialogTitle, DialogBody, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

interface RejectReasonDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (reason: string) => void;
}

export function RejectReasonDialog({ open, onOpenChange, onSubmit }: RejectReasonDialogProps) {
  const [reason, setReason] = useState("");

  useEffect(() => {
    if (open) setReason("");
  }, [open]);

  function handleSubmit() {
    if (!reason.trim()) return;
    onSubmit(reason.trim());
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange} size="sm">
      <DialogHeader>
        <DialogTitle>Lý do bác bỏ</DialogTitle>
      </DialogHeader>

      <DialogBody>
        <div className="grid gap-1.5">
          <Label htmlFor="reject-reason">Lý do bác bỏ ghi nhận nháp này</Label>
          <Textarea
            id="reject-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            placeholder="Nhập lý do..."
          />
        </div>
      </DialogBody>

      <DialogFooter>
        <Button variant="outline" onClick={() => onOpenChange(false)}>Hủy</Button>
        <Button variant="destructive" onClick={handleSubmit} disabled={!reason.trim()}>
          Bác bỏ
        </Button>
      </DialogFooter>
    </Dialog>
  );
}
