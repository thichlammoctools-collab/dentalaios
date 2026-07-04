import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { apiPost, ApiError } from "@/lib/api";
import { toast } from "@/lib/toast";
import type { ClinicalFinding } from "@shared/types";
import { cn } from "@/lib/utils";

interface FdiToothChartProps {
  visitId: string;
  findings: ClinicalFinding[];
  onCreated: (finding: ClinicalFinding) => void;
}

/**
 * FDI tooth chart — 32 permanent teeth.
 * Layout: Upper (Q1+Q2) and Lower (Q3+Q4) rows, each split into right (patient's right) | left.
 *
 *   Q1: 18 17 16 15 14 13 12 11 | 21 22 23 24 25 26 27 28 :Q2
 *   Q4: 48 47 46 45 44 43 42 41 | 31 32 33 34 35 36 37 38 :Q3
 */
const UPPER_RIGHT = [18, 17, 16, 15, 14, 13, 12, 11];
const UPPER_LEFT = [21, 22, 23, 24, 25, 26, 27, 28];
const LOWER_RIGHT = [48, 47, 46, 45, 44, 43, 42, 41];
const LOWER_LEFT = [31, 32, 33, 34, 35, 36, 37, 38];

export function FdiToothChart({ visitId, findings, onCreated }: FdiToothChartProps) {
  const [selected, setSelected] = useState<number | null>(null);
  const [condition, setCondition] = useState("caries");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  // Map tooth number → set of findings
  const findingsByTooth = new Map<number, ClinicalFinding[]>();
  for (const f of findings) {
    const list = findingsByTooth.get(f.tooth_number) ?? [];
    list.push(f);
    findingsByTooth.set(f.tooth_number, list);
  }

  function renderTooth(n: number, side: "right" | "left") {
    const list = findingsByTooth.get(n) ?? [];
    const hasFinding = list.length > 0;
    const tooltip = list.map((f) => f.condition).join(", ") || undefined;
    return (
      <button
        key={n}
        type="button"
        title={tooltip ?? `#${n}`}
        onClick={() => setSelected(n)}
        className={cn(
          "flex h-10 w-10 flex-col items-center justify-center rounded border text-xs transition-colors",
          hasFinding
            ? "border-red-400 bg-red-50 text-red-900"
            : "border-border bg-background hover:border-primary hover:bg-accent",
          side === "right" ? "border-r-2" : "border-l-2",
        )}
      >
        <span className="font-mono font-medium">{n}</span>
        {hasFinding && <span className="text-[8px] text-red-700">{list.length}</span>}
      </button>
    );
  }

  async function onSubmit() {
    if (selected == null) return;
    setSaving(true);
    try {
      const created = await apiPost<ClinicalFinding>(
        `/api/visits/${visitId}/findings`,
        {
          tooth_number: selected,
          condition,
          notes: notes || undefined,
        },
      );
      toast.success(`Đã thêm finding cho răng #${selected}`);
      onCreated(created);
      setSelected(null);
      setNotes("");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Lỗi thêm finding");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-border bg-card p-4">
        <p className="mb-3 text-center text-xs text-muted-foreground">↑ Hàm trên (Patient's right | left)</p>
        <div className="mx-auto flex max-w-md justify-center gap-0">
          <div className="flex">{UPPER_RIGHT.map((n) => renderTooth(n, "right"))}</div>
          <div className="mx-1 w-px bg-border" />
          <div className="flex">{UPPER_LEFT.map((n) => renderTooth(n, "left"))}</div>
        </div>
        <div className="mx-auto mt-3 flex max-w-md justify-center gap-0">
          <div className="flex">{LOWER_RIGHT.map((n) => renderTooth(n, "right"))}</div>
          <div className="mx-1 w-px bg-border" />
          <div className="flex">{LOWER_LEFT.map((n) => renderTooth(n, "left"))}</div>
        </div>
        <p className="mt-3 text-center text-xs text-muted-foreground">↓ Hàm dưới</p>
      </div>

      <Dialog open={selected != null} onOpenChange={(o) => !o && setSelected(null)}>
        {selected != null && (
          <div>
            <DialogHeader>
              <DialogTitle>Thêm finding — Răng #{selected}</DialogTitle>
            </DialogHeader>
            <div className="grid gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor="cond">Tình trạng</Label>
                <select
                  id="cond"
                  value={condition}
                  onChange={(e) => setCondition(e.target.value)}
                  className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm"
                >
                  <option value="caries">Sâu răng</option>
                  <option value="fracture">Gãy/vỡ</option>
                  <option value="missing">Mất răng</option>
                  <option value="periapical">Viêm quanh chóp</option>
                  <option value="calculus">Cao răng</option>
                  <option value="pulpitis">Viêm tủy</option>
                  <option value="other">Khác</option>
                </select>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="notes">Ghi chú</Label>
                <Textarea
                  id="notes"
                  rows={3}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Đã có {findingsByTooth.get(selected)?.length ?? 0} finding cho răng này.
              </p>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setSelected(null)}>
                Hủy
              </Button>
              <Button onClick={onSubmit} disabled={saving}>
                {saving ? "Đang lưu…" : "Lưu"}
              </Button>
            </DialogFooter>
          </div>
        )}
      </Dialog>
    </div>
  );
}