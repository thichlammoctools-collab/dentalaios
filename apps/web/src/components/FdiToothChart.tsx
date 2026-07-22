import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { apiPost, ApiError } from "@/lib/api";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import {
  ANATOMICAL_SITE_OPTIONS,
  CLINICAL_FINDING_CATEGORIES,
  getFindingCategory,
  getFindingConditionLabel,
} from "@shared/constants/clinical-findings";
import type { ClinicalFinding, FindingCategory, FindingMeasurements } from "@shared/types";

interface FdiToothChartProps {
  visitId: string;
  findings: ClinicalFinding[];
  onCreated: (finding: ClinicalFinding) => void;
  onCreatedBatch?: (findings: ClinicalFinding[]) => void;
}

const ADULT_UPPER_RIGHT = [18, 17, 16, 15, 14, 13, 12, 11];
const ADULT_UPPER_LEFT = [21, 22, 23, 24, 25, 26, 27, 28];
const ADULT_LOWER_RIGHT = [48, 47, 46, 45, 44, 43, 42, 41];
const ADULT_LOWER_LEFT = [31, 32, 33, 34, 35, 36, 37, 38];
const PRIMARY_UPPER_RIGHT = [55, 54, 53, 52, 51];
const PRIMARY_UPPER_LEFT = [61, 62, 63, 64, 65];
const PRIMARY_LOWER_RIGHT = [85, 84, 83, 82, 81];
const PRIMARY_LOWER_LEFT = [71, 72, 73, 74, 75];
const SURFACES = [
  { value: "occlusal", label: "Nhai" }, { value: "mesial", label: "Gần" },
  { value: "distal", label: "Xa" }, { value: "buccal", label: "Má" }, { value: "lingual", label: "Lưỡi" },
] as const;

function isNumberCondition(condition: string): boolean {
  return ["overjet", "deep_bite", "open_bite", "crowding", "spacing", "limitation"].includes(condition);
}

export function FdiToothChart({ visitId, findings, onCreated }: FdiToothChartProps) {
  const [category, setCategory] = useState<FindingCategory>("tooth_hard_tissue");
  const [toothNumber, setToothNumber] = useState<number | null>(null);
  const [condition, setCondition] = useState("good");
  const [anatomicalSite, setAnatomicalSite] = useState<string>("");
  const [selectedSurfaces, setSelectedSurfaces] = useState<string[]>([]);
  const [measurement, setMeasurement] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const definition = getFindingCategory(category);
  const categoryFindings = findings.filter((finding) => finding.category === category);

  useEffect(() => {
    const next = getFindingCategory(category);
    setCondition(next.conditions[0].value);
    setAnatomicalSite(next.defaultSite ?? "");
    setSelectedSurfaces([]);
    setMeasurement("");
  }, [category]);

  function selectTooth(tooth: number) {
    setCategory("tooth_hard_tissue");
    setToothNumber(tooth);
  }

  function toothStatus(tooth: number): string {
    const toothFindings = findings.filter((finding) => finding.category === "tooth_hard_tissue" && finding.tooth_number === tooth);
    if (toothFindings.some((finding) => finding.condition === "missing")) return "border-red-500 bg-red-50 text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-300";
    if (toothFindings.some((finding) => finding.condition !== "good")) return "border-amber-500 bg-amber-50 text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-300";
    if (toothFindings.length) return "border-emerald-500 bg-emerald-50 text-emerald-900 dark:border-emerald-700 dark:bg-emerald-950 dark:text-emerald-300";
    return "border-border bg-background hover:border-primary hover:bg-accent";
  }

  function renderJaw(right: number[], left: number[]) {
    return (
      <div className="flex min-w-max justify-center gap-0.5">
        {right.map(renderTooth)}
        <div aria-hidden="true" className="mx-1 w-px self-stretch bg-border" />
        {left.map(renderTooth)}
      </div>
    );
  }

  function renderTooth(tooth: number) {
    return (
      <button
        key={tooth}
        type="button"
        onClick={() => selectTooth(tooth)}
        className={cn("flex h-9 w-9 items-center justify-center rounded border font-mono text-xs font-semibold transition-colors sm:h-10 sm:w-10", toothNumber === tooth && "ring-2 ring-primary ring-offset-2 ring-offset-card", toothStatus(tooth))}
      >
        {tooth}
      </button>
    );
  }

  async function submit() {
    if (definition.scope === "tooth" && toothNumber == null) {
      toast.error("Chọn răng FDI trước khi lưu finding");
      return;
    }
    const measurements: FindingMeasurements | undefined = measurement.trim()
      ? { [category === "tmj_function" ? "max_opening_mm" : condition === "overjet" ? "overjet_mm" : "measurement_mm"]: Number(measurement) || measurement }
      : undefined;
    setSaving(true);
    try {
      const created = await apiPost<ClinicalFinding>(`/api/visits/${visitId}/findings`, {
        category,
        scope: definition.scope,
        tooth_number: definition.scope === "tooth" ? toothNumber : null,
        anatomical_site: definition.scope === "region" ? anatomicalSite || undefined : undefined,
        location_details: selectedSurfaces.length ? { tooth_surfaces: selectedSurfaces } : undefined,
        measurements,
        condition,
        notes: notes || undefined,
      });
      onCreated(created);
      setNotes("");
      setMeasurement("");
      setSelectedSurfaces([]);
      toast.success("Đã lưu finding lâm sàng");
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Không thể lưu finding");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {CLINICAL_FINDING_CATEGORIES.map((item) => {
          const count = findings.filter((finding) => finding.category === item.value).length;
          return (
            <button
              key={item.value}
              type="button"
              onClick={() => setCategory(item.value)}
              className={cn("rounded-lg border p-3 text-left transition-colors", category === item.value ? "border-primary bg-primary/5 shadow-sm" : "border-border hover:bg-accent/50")}
            >
              <div className="flex items-center justify-between gap-2"><span className="text-sm font-semibold">{item.label}</span><span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-bold text-primary">{count}</span></div>
              <p className="mt-1 text-xs text-muted-foreground">{item.description}</p>
            </button>
          );
        })}
      </div>

        {category === "tooth_hard_tissue" && (
          <div className="rounded-lg border border-border bg-card p-4">
            <p className="mb-2 text-center text-xs font-medium text-muted-foreground">Răng vĩnh viễn</p>
            <p className="mb-1 text-center text-[11px] text-muted-foreground">Hàm trên</p>
            <div className="overflow-x-auto pb-1">{renderJaw(ADULT_UPPER_RIGHT, ADULT_UPPER_LEFT)}</div>
            <p className="mb-1 mt-3 text-center text-[11px] text-muted-foreground">Hàm dưới</p>
            <div className="overflow-x-auto pb-1">{renderJaw(ADULT_LOWER_RIGHT, ADULT_LOWER_LEFT)}</div>
            <div className="my-4 border-t border-border" />
            <p className="mb-2 text-center text-xs font-medium text-muted-foreground">Răng sữa</p>
            <p className="mb-1 text-center text-[11px] text-muted-foreground">Hàm trên</p>
            <div className="overflow-x-auto pb-1">{renderJaw(PRIMARY_UPPER_RIGHT, PRIMARY_UPPER_LEFT)}</div>
            <p className="mb-1 mt-3 text-center text-[11px] text-muted-foreground">Hàm dưới</p>
            <div className="overflow-x-auto pb-1">{renderJaw(PRIMARY_LOWER_RIGHT, PRIMARY_LOWER_LEFT)}</div>
            <p className="mt-3 text-center text-xs text-muted-foreground">Chọn răng để ghi nhận finding theo FDI/ISO 3950.</p>
          </div>
      )}

      <div className="rounded-lg border border-border bg-card p-4">
        <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
          <div><h3 className="font-semibold">Thêm finding: {definition.label}</h3><p className="text-xs text-muted-foreground">{definition.description}</p></div>
          {definition.scope === "tooth" && <span className="text-sm font-medium text-primary">{toothNumber ? `Răng #${toothNumber}` : "Chưa chọn răng"}</span>}
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <div className="grid gap-1.5"><Label htmlFor="clinical-condition">Tình trạng</Label><select id="clinical-condition" value={condition} onChange={(event) => setCondition(event.target.value)} className="h-9 rounded-md border border-input bg-background px-3 text-sm">{definition.conditions.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></div>
          {definition.scope === "region" && <div className="grid gap-1.5"><Label htmlFor="clinical-site">Vùng giải phẫu</Label><select id="clinical-site" value={anatomicalSite} onChange={(event) => setAnatomicalSite(event.target.value)} className="h-9 rounded-md border border-input bg-background px-3 text-sm" disabled={category === "tmj_function"}>{ANATOMICAL_SITE_OPTIONS.filter((item) => category !== "tmj_function" || item.value === "tmj").map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></div>}
          {category === "tooth_hard_tissue" && <div className="grid gap-1.5"><Label>Mặt răng</Label><div className="flex flex-wrap gap-2">{SURFACES.map((surface) => <label key={surface.value} className="inline-flex items-center gap-1.5 text-xs"><input type="checkbox" checked={selectedSurfaces.includes(surface.value)} onChange={() => setSelectedSurfaces((current) => current.includes(surface.value) ? current.filter((value) => value !== surface.value) : [...current, surface.value])} />{surface.label}</label>)}</div></div>}
          {(isNumberCondition(condition) || category === "tmj_function") && <div className="grid gap-1.5"><Label htmlFor="clinical-measurement">{category === "tmj_function" ? "Há miệng tối đa (mm)" : "Số đo (mm)"}</Label><input id="clinical-measurement" inputMode="decimal" value={measurement} onChange={(event) => setMeasurement(event.target.value)} className="h-9 rounded-md border border-input bg-background px-3 text-sm" placeholder="Ví dụ: 5" /></div>}
          <div className="grid gap-1.5 md:col-span-2"><Label htmlFor="clinical-notes">Ghi chú</Label><Textarea id="clinical-notes" rows={3} value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Mô tả lâm sàng, mức độ, vị trí hoặc chỉ định theo dõi…" /></div>
        </div>
        <div className="mt-4 flex justify-end"><Button onClick={submit} disabled={saving}>{saving ? "Đang lưu…" : "Lưu finding"}</Button></div>
      </div>

      {categoryFindings.length > 0 && <div className="rounded-lg border border-border p-3"><p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Đã ghi nhận trong lượt khám</p><div className="flex flex-wrap gap-2">{categoryFindings.map((finding) => <span key={finding.id} className="rounded-full bg-muted px-2.5 py-1 text-xs">{finding.scope === "tooth" && `#${finding.tooth_number} · `}{getFindingConditionLabel(finding.category, finding.condition)}{finding.notes ? ` — ${finding.notes}` : ""}</span>)}</div></div>}
    </div>
  );
}
