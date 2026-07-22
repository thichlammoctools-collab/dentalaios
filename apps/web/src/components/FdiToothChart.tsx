import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { apiPost, ApiError } from "@/lib/api";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import {
  ANATOMICAL_SITE_OPTIONS,
  CLINICAL_FINDING_CATEGORIES,
  PERIODONTAL_POCKET_POINTS,
  PERIODONTAL_SURFACE_OPTIONS,
  getFindingCategory,
  getFindingConditionLabel,
} from "@shared/constants/clinical-findings";
import type { AnatomicalSite, ClinicalFinding, FindingCategory, FindingLocationDetails, FindingMeasurements, PeriodontalPocketDepths } from "@shared/types";

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
const TOOTH_SURFACES = [
  { value: "occlusal", label: "Nhai" }, { value: "mesial", label: "Gần" },
  { value: "distal", label: "Xa" }, { value: "buccal", label: "Ngoài (má)" }, { value: "lingual", label: "Trong (lưỡi/khẩu cái)" },
] as const;

const NON_TOOTH_CATEGORIES: FindingCategory[] = ["oral_soft_tissue", "tmj_function", "occlusion_orthodontics", "preventive_general"];

function selectableSites(category: FindingCategory) {
  if (category === "tmj_function") return ANATOMICAL_SITE_OPTIONS.filter((item) => item.value === "tmj");
  return ANATOMICAL_SITE_OPTIONS.filter((item) => item.value !== "gum");
}

function supportsLaterality(site: string) {
  return ["tongue", "buccal", "palate", "floor_mouth", "lip", "tmj", "parotid_gland", "submandibular_gland", "sublingual_gland"].includes(site);
}

function supportsVerticalAndOrientation(site: string) {
  return site === "buccal" || site === "lip";
}

export function FdiToothChart({ visitId, findings, onCreated }: FdiToothChartProps) {
  const [selectedTooth, setSelectedTooth] = useState<number | null>(null);
  const [toothTab, setToothTab] = useState<"tooth_hard_tissue" | "periodontal">("tooth_hard_tissue");
  const [toothCondition, setToothCondition] = useState("good");
  const [toothSurfaces, setToothSurfaces] = useState<string[]>([]);
  const [periodontalSurfaces, setPeriodontalSurfaces] = useState<string[]>([]);
  const [pocketDepths, setPocketDepths] = useState<PeriodontalPocketDepths>({});
  const [toothNotes, setToothNotes] = useState("");
  const [otherCategory, setOtherCategory] = useState<FindingCategory | null>(null);
  const [otherCondition, setOtherCondition] = useState("");
  const [anatomicalSite, setAnatomicalSite] = useState<AnatomicalSite | "">("");
  const [laterality, setLaterality] = useState<"right" | "left" | "bilateral" | "midline" | "">("");
  const [verticalPosition, setVerticalPosition] = useState<"upper" | "lower" | "">("");
  const [surfaceOrientation, setSurfaceOrientation] = useState<"internal" | "external" | "">("");
  const [otherNotes, setOtherNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const toothDefinition = getFindingCategory(toothTab);
  const otherDefinition = otherCategory ? getFindingCategory(otherCategory) : null;

  function resetToothForm(category: "tooth_hard_tissue" | "periodontal") {
    setToothTab(category);
    setToothCondition(getFindingCategory(category).conditions[0].value);
    setToothSurfaces([]);
    setPeriodontalSurfaces([]);
    setPocketDepths({});
    setToothNotes("");
  }

  function openTooth(tooth: number) {
    setSelectedTooth(tooth);
    resetToothForm("tooth_hard_tissue");
  }

  function openOther(category: FindingCategory) {
    const definition = getFindingCategory(category);
    setOtherCategory(category);
    setOtherCondition(definition.conditions[0].value);
    setAnatomicalSite(definition.defaultSite ?? "");
    setLaterality("");
    setVerticalPosition("");
    setSurfaceOrientation("");
    setOtherNotes("");
  }

  function toothStatus(tooth: number): string {
    const toothFindings = findings.filter((finding) => finding.tooth_number === tooth && (finding.category === "tooth_hard_tissue" || finding.category === "periodontal"));
    if (toothFindings.some((finding) => finding.condition === "missing")) return "border-red-500 bg-red-50 text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-300";
    if (toothFindings.length) return "border-amber-500 bg-amber-50 text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-300";
    return "border-border bg-background hover:border-primary hover:bg-accent";
  }

  function renderTooth(tooth: number) {
    return <button key={tooth} type="button" onClick={() => openTooth(tooth)} className={cn("flex h-9 w-9 items-center justify-center rounded border font-mono text-xs font-semibold transition-colors sm:h-10 sm:w-10", selectedTooth === tooth && "ring-2 ring-primary ring-offset-2 ring-offset-card", toothStatus(tooth))}>{tooth}</button>;
  }

  function renderJaw(right: number[], left: number[]) {
    return <div className="flex min-w-max justify-center gap-0.5">{right.map(renderTooth)}<div aria-hidden="true" className="mx-1 w-px self-stretch bg-border" />{left.map(renderTooth)}</div>;
  }

  function toggleValue(setter: (value: string[]) => void, current: string[], value: string) {
    setter(current.includes(value) ? current.filter((item) => item !== value) : [...current, value]);
  }

  async function saveToothFinding() {
    if (!selectedTooth) return;
    if (toothTab === "periodontal" && ["calculus", "gingivitis"].includes(toothCondition) && periodontalSurfaces.length === 0) {
      toast.error("Chọn ít nhất một mặt răng có tổn thương");
      return;
    }
    const populatedPockets = Object.entries(pocketDepths).filter(([, value]) => typeof value === "number" && Number.isFinite(value));
    if (toothTab === "periodontal" && toothCondition === "periodontitis" && populatedPockets.length === 0) {
      toast.error("Viêm nha chu cần ít nhất một độ sâu túi nha chu");
      return;
    }
    const locationDetails: FindingLocationDetails | undefined = toothTab === "tooth_hard_tissue"
      ? toothSurfaces.length ? { tooth_surfaces: toothSurfaces as FindingLocationDetails["tooth_surfaces"] } : undefined
      : periodontalSurfaces.length ? { periodontal_surfaces: periodontalSurfaces as FindingLocationDetails["periodontal_surfaces"] } : undefined;
    const measurements: FindingMeasurements | undefined = populatedPockets.length
      ? { periodontal_pocket_depth_mm: Object.fromEntries(populatedPockets) as PeriodontalPocketDepths }
      : undefined;
    setSaving(true);
    try {
      const created = await apiPost<ClinicalFinding>(`/api/visits/${visitId}/findings`, {
        category: toothTab,
        scope: "tooth",
        tooth_number: selectedTooth,
        anatomical_site: toothTab === "periodontal" ? "gum" : undefined,
        location_details: locationDetails,
        measurements,
        condition: toothCondition,
        notes: toothNotes || undefined,
      });
      onCreated(created);
      toast.success(`Đã lưu finding răng #${selectedTooth}`);
      resetToothForm(toothTab);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Không thể lưu finding");
    } finally {
      setSaving(false);
    }
  }

  async function saveOtherFinding() {
    if (!otherCategory || !otherDefinition) return;
    if (otherDefinition.scope === "region" && !anatomicalSite) {
      toast.error("Chọn vùng giải phẫu trước khi lưu");
      return;
    }
    const locationDetails: FindingLocationDetails | undefined = laterality || verticalPosition || surfaceOrientation ? {
      laterality: laterality || undefined,
      vertical_position: verticalPosition || undefined,
      surface_orientation: surfaceOrientation || undefined,
    } : undefined;
    setSaving(true);
    try {
      const created = await apiPost<ClinicalFinding>(`/api/visits/${visitId}/findings`, {
        category: otherCategory,
        scope: otherDefinition.scope,
        tooth_number: null,
        anatomical_site: otherDefinition.scope === "region" ? anatomicalSite : undefined,
        location_details: locationDetails,
        condition: otherCondition,
        notes: otherNotes || undefined,
      });
      onCreated(created);
      toast.success("Đã lưu finding lâm sàng");
      openOther(otherCategory);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Không thể lưu finding");
    } finally {
      setSaving(false);
    }
  }

  return <div className="space-y-4">
    <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
      {CLINICAL_FINDING_CATEGORIES.map((item) => {
        const count = findings.filter((finding) => finding.category === item.value).length;
        const isToothCategory = item.value === "tooth_hard_tissue" || item.value === "periodontal";
        return <div key={item.value} className="rounded-lg border border-border p-3"><div className="flex items-center justify-between gap-2"><span className="text-sm font-semibold">{item.label}</span><span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-bold text-primary">{count}</span></div><p className="mt-1 min-h-8 text-xs text-muted-foreground">{item.description}</p>{isToothCategory ? <p className="mt-2 text-xs font-medium text-primary">Chọn răng trên sơ đồ</p> : <Button size="sm" variant="outline" className="mt-2 h-8 text-xs" onClick={() => openOther(item.value)}>Thêm ghi nhận</Button>}</div>;
      })}
    </div>

    <div className="rounded-lg border border-border bg-card p-4">
      <p className="mb-2 text-center text-xs font-medium text-muted-foreground">Răng vĩnh viễn</p>
      <p className="mb-1 text-center text-[11px] text-muted-foreground">Hàm trên</p><div className="overflow-x-auto pb-1">{renderJaw(ADULT_UPPER_RIGHT, ADULT_UPPER_LEFT)}</div>
      <p className="mb-1 mt-3 text-center text-[11px] text-muted-foreground">Hàm dưới</p><div className="overflow-x-auto pb-1">{renderJaw(ADULT_LOWER_RIGHT, ADULT_LOWER_LEFT)}</div>
      <div className="my-4 border-t border-border" />
      <p className="mb-2 text-center text-xs font-medium text-muted-foreground">Răng sữa</p>
      <p className="mb-1 text-center text-[11px] text-muted-foreground">Hàm trên</p><div className="overflow-x-auto pb-1">{renderJaw(PRIMARY_UPPER_RIGHT, PRIMARY_UPPER_LEFT)}</div>
      <p className="mb-1 mt-3 text-center text-[11px] text-muted-foreground">Hàm dưới</p><div className="overflow-x-auto pb-1">{renderJaw(PRIMARY_LOWER_RIGHT, PRIMARY_LOWER_LEFT)}</div>
      <p className="mt-3 text-center text-xs text-muted-foreground">Nhấn một răng để ghi nhận mô cứng hoặc nha chu theo FDI/ISO 3950.</p>
    </div>

    <Dialog open={selectedTooth !== null} onOpenChange={(open) => !open && setSelectedTooth(null)}>
      <DialogHeader><DialogTitle>Ghi nhận răng #{selectedTooth}</DialogTitle><p className="mt-1 text-xs text-muted-foreground">Lưu xong có thể tiếp tục ghi nhận trên cùng răng.</p></DialogHeader>
      <DialogBody className="space-y-4">
        <div className="flex gap-2 border-b border-border"><button type="button" onClick={() => resetToothForm("tooth_hard_tissue")} className={cn("border-b-2 px-3 py-2 text-sm font-medium", toothTab === "tooth_hard_tissue" ? "border-primary text-primary" : "border-transparent text-muted-foreground")}>Răng &amp; mô cứng</button><button type="button" onClick={() => resetToothForm("periodontal")} className={cn("border-b-2 px-3 py-2 text-sm font-medium", toothTab === "periodontal" ? "border-primary text-primary" : "border-transparent text-muted-foreground")}>Nha chu</button></div>
        <div className="grid gap-4 md:grid-cols-2"><div className="grid gap-1.5"><Label htmlFor="tooth-condition">Tình trạng</Label><select id="tooth-condition" value={toothCondition} onChange={(event) => setToothCondition(event.target.value)} className="h-9 rounded-md border border-input bg-background px-3 text-sm">{toothDefinition.conditions.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></div>
          {toothTab === "tooth_hard_tissue" ? <SurfacePicker label="Mặt răng" options={TOOTH_SURFACES} values={toothSurfaces} onToggle={(value) => toggleValue(setToothSurfaces, toothSurfaces, value)} /> : <SurfacePicker label="Mặt nha chu" options={PERIODONTAL_SURFACE_OPTIONS} values={periodontalSurfaces} onToggle={(value) => toggleValue(setPeriodontalSurfaces, periodontalSurfaces, value)} />}
        </div>
        {toothTab === "periodontal" && <div className="rounded-lg border border-border bg-muted/20 p-3"><div className="mb-3 flex flex-wrap items-baseline justify-between gap-2"><div><p className="text-sm font-medium">Độ sâu túi nha chu</p><p className="text-xs text-muted-foreground">Nhập mm tại các điểm đã đo; Viêm nha chu cần tối thiểu một điểm.</p></div>{toothCondition === "periodontitis" && <span className="text-xs font-medium text-destructive">Bắt buộc</span>}</div><div className="grid grid-cols-2 gap-2 sm:grid-cols-3">{PERIODONTAL_POCKET_POINTS.map((point) => <div key={point.value} className="grid gap-1"><Label htmlFor={`pocket-${point.value}`} className="text-xs">{point.label}</Label><input id={`pocket-${point.value}`} inputMode="decimal" value={pocketDepths[point.value as keyof PeriodontalPocketDepths] ?? ""} onChange={(event) => { const value = event.target.value; setPocketDepths((current) => ({ ...current, [point.value]: value === "" ? undefined : Number(value) })); }} className="h-9 rounded-md border border-input bg-background px-2 text-sm" placeholder="mm" /></div>)}</div></div>}
        <div className="grid gap-1.5"><Label htmlFor="tooth-notes">Ghi chú</Label><Textarea id="tooth-notes" rows={3} value={toothNotes} onChange={(event) => setToothNotes(event.target.value)} placeholder="Mức độ, chỉ định theo dõi hoặc mô tả thêm…" /></div>
      </DialogBody>
      <DialogFooter><Button variant="outline" onClick={() => setSelectedTooth(null)}>Đóng</Button><Button onClick={saveToothFinding} disabled={saving}>{saving ? "Đang lưu…" : `Lưu ${getFindingConditionLabel(toothTab, toothCondition)}`}</Button></DialogFooter>
    </Dialog>

    <Dialog open={otherCategory !== null} onOpenChange={(open) => !open && setOtherCategory(null)}>
      <DialogHeader><DialogTitle>Thêm finding: {otherDefinition?.label}</DialogTitle><p className="mt-1 text-xs text-muted-foreground">{otherDefinition?.description}</p></DialogHeader>
      {otherDefinition && <><DialogBody className="space-y-4"><div className="grid gap-4 md:grid-cols-2"><div className="grid gap-1.5"><Label htmlFor="other-condition">Tình trạng</Label><select id="other-condition" value={otherCondition} onChange={(event) => setOtherCondition(event.target.value)} className="h-9 rounded-md border border-input bg-background px-3 text-sm">{otherDefinition.conditions.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></div>{otherDefinition.scope === "region" && <div className="grid gap-1.5"><Label htmlFor="anatomical-site">Vùng giải phẫu</Label><select id="anatomical-site" value={anatomicalSite} onChange={(event) => { setAnatomicalSite(event.target.value as AnatomicalSite); setLaterality(""); setVerticalPosition(""); setSurfaceOrientation(""); }} className="h-9 rounded-md border border-input bg-background px-3 text-sm">{selectableSites(otherCategory as FindingCategory).map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></div>}</div>
        {otherDefinition.scope === "region" && anatomicalSite && <div className="grid gap-3 rounded-lg border border-border bg-muted/20 p-3 sm:grid-cols-3">{supportsLaterality(anatomicalSite) && <div className="grid gap-1.5"><Label htmlFor="laterality">Bên</Label><select id="laterality" value={laterality} onChange={(event) => setLaterality(event.target.value as typeof laterality)} className="h-9 rounded-md border border-input bg-background px-3 text-sm"><option value="">Không chỉ định</option><option value="right">Phải</option><option value="left">Trái</option><option value="bilateral">Hai bên</option><option value="midline">Đường giữa</option></select></div>}{supportsVerticalAndOrientation(anatomicalSite) && <><div className="grid gap-1.5"><Label htmlFor="vertical-position">Trên/dưới</Label><select id="vertical-position" value={verticalPosition} onChange={(event) => setVerticalPosition(event.target.value as typeof verticalPosition)} className="h-9 rounded-md border border-input bg-background px-3 text-sm"><option value="">Không chỉ định</option><option value="upper">Trên</option><option value="lower">Dưới</option></select></div><div className="grid gap-1.5"><Label htmlFor="surface-orientation">Bề mặt</Label><select id="surface-orientation" value={surfaceOrientation} onChange={(event) => setSurfaceOrientation(event.target.value as typeof surfaceOrientation)} className="h-9 rounded-md border border-input bg-background px-3 text-sm"><option value="">Không chỉ định</option><option value="internal">Trong</option><option value="external">Ngoài</option></select></div></>}</div>}
        <div className="grid gap-1.5"><Label htmlFor="other-notes">Ghi chú</Label><Textarea id="other-notes" rows={3} value={otherNotes} onChange={(event) => setOtherNotes(event.target.value)} placeholder="Mô tả lâm sàng hoặc chỉ định theo dõi…" /></div></DialogBody><DialogFooter><Button variant="outline" onClick={() => setOtherCategory(null)}>Đóng</Button><Button onClick={saveOtherFinding} disabled={saving}>{saving ? "Đang lưu…" : "Lưu finding"}</Button></DialogFooter></>}
    </Dialog>
  </div>;
}

function SurfacePicker({ label, options, values, onToggle }: { label: string; options: ReadonlyArray<{ value: string; label: string }>; values: string[]; onToggle: (value: string) => void }) {
  return <div className="grid gap-1.5"><Label>{label}</Label><div className="flex flex-wrap gap-2">{options.map((surface) => <label key={surface.value} className="inline-flex cursor-pointer items-center gap-1.5 text-xs"><input type="checkbox" checked={values.includes(surface.value)} onChange={() => onToggle(surface.value)} />{surface.label}</label>)}</div></div>;
}
