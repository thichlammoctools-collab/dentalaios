import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { apiPost, ApiError } from "@/lib/api";
import { toast } from "@/lib/toast";
import { isValidFdiTooth } from "@shared/constants";
import type { TreatmentPlanItem } from "@shared/types";

interface TreatmentPlanItemFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  planId: string;
  onCreated: (item: TreatmentPlanItem) => void;
}

export function TreatmentPlanItemForm({
  open,
  onOpenChange,
  planId,
  onCreated,
}: TreatmentPlanItemFormProps) {
  const [toothNumber, setToothNumber] = useState<number | "">("");
  const [procedure, setProcedure] = useState("filling");
  const [description, setDescription] = useState("");
  const [unitCost, setUnitCost] = useState<number | "">("");
  const [saving, setSaving] = useState(false);

  const validTooth =
    typeof toothNumber === "number" ? isValidFdiTooth(toothNumber) : false;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!validTooth) {
      toast.error("Số răng FDI không hợp lệ (vd: 11, 16, 28, 31, 48…)");
      return;
    }
    if (typeof unitCost !== "number" || unitCost < 0) {
      toast.error("Đơn giá phải ≥ 0");
      return;
    }
    setSaving(true);
    try {
      const created = await apiPost<TreatmentPlanItem>(
        `/api/treatment-plans/${planId}/items`,
        {
          tooth_number: toothNumber,
          procedure,
          description,
          unit_cost: unitCost,
        },
      );
      toast.success("Đã thêm hạng mục");
      onCreated(created);
      onOpenChange(false);
      setToothNumber("");
      setDescription("");
      setUnitCost("");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Lỗi thêm item");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <form onSubmit={onSubmit}>
        <DialogHeader>
          <DialogTitle>Thêm hạng mục điều trị</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="tooth">Răng (FDI) *</Label>
              <Input
                id="tooth"
                type="number"
                min="11"
                max="85"
                required
                value={toothNumber}
                onChange={(e) => {
                  const v = e.target.value;
                  setToothNumber(v ? Number(v) : "");
                }}
                placeholder="VD: 11, 16, 28, 36…"
              />
              {toothNumber !== "" && !validTooth && (
                <p className="text-xs text-destructive">Không hợp lệ</p>
              )}
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="proc">Thủ thuật *</Label>
              <select
                id="proc"
                value={procedure}
                onChange={(e) => setProcedure(e.target.value)}
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm"
              >
                <option value="filling">Trám răng</option>
                <option value="root_canal">Điều trị tủy</option>
                <option value="crown">Bọc răng sứ</option>
                <option value="implant">Cấy ghép implant</option>
                <option value="extraction">Nhổ răng</option>
                <option value="cleaning">Lấy cao răng</option>
                <option value="other">Khác</option>
              </select>
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="desc">Mô tả *</Label>
            <Textarea
              id="desc"
              rows={2}
              required
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="cost">Đơn giá (VND) *</Label>
            <Input
              id="cost"
              type="number"
              min="0"
              required
              value={unitCost}
              onChange={(e) => {
                const v = e.target.value;
                setUnitCost(v ? Number(v) : "");
              }}
            />
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Hủy
          </Button>
          <Button type="submit" disabled={saving || !validTooth}>
            {saving ? "Đang thêm…" : "Thêm"}
          </Button>
        </DialogFooter>
      </form>
    </Dialog>
  );
}