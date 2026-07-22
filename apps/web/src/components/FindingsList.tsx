import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { apiDelete, apiPatch, ApiError } from "@/lib/api";
import { toast } from "@/lib/toast";
import { PERIODONTAL_POCKET_POINTS, PERIODONTAL_SURFACE_OPTIONS, getAnatomicalSiteLabel, getFindingCategory, getFindingConditionLabel, getFindingLocationLabel } from "@shared/constants/clinical-findings";
import type { ClinicalFinding, FindingLocationDetails, FindingMeasurements, PeriodontalPocketDepths } from "@shared/types";

interface FindingsListProps { visitId: string; findings: ClinicalFinding[]; onUpdate: (updated: ClinicalFinding) => void; onDeleted: (id: string) => void; }

function displayLocation(finding: ClinicalFinding): string {
  const base = finding.scope === "tooth" ? `Răng #${finding.tooth_number}` : finding.scope === "region" ? getAnatomicalSiteLabel(finding.anatomical_site) : "Toàn miệng";
  const surfaces = finding.location_details?.tooth_surfaces ?? finding.location_details?.periodontal_surfaces;
  const surfaceText = surfaces?.map((surface) => [...PERIODONTAL_SURFACE_OPTIONS, { value: "occlusal", label: "Nhai" }].find((item) => item.value === surface)?.label ?? surface).join(", ");
  return [base, surfaceText, getFindingLocationLabel(finding.location_details)].filter(Boolean).join(" · ");
}

function locationKey(finding: ClinicalFinding): string {
  if (finding.scope === "tooth") return `tooth:${finding.tooth_number}`;
  if (finding.scope === "region") return `region:${finding.anatomical_site ?? "unknown"}`;
  return "full-mouth";
}

function locationLabel(finding: ClinicalFinding): string {
  if (finding.scope === "tooth") return `Răng #${finding.tooth_number}`;
  if (finding.scope === "region") return getAnatomicalSiteLabel(finding.anatomical_site);
  return "Toàn miệng";
}

function pocketText(measurements?: FindingMeasurements): string {
  const pockets = measurements?.periodontal_pocket_depth_mm;
  if (!pockets || typeof pockets !== "object") return "";
  return PERIODONTAL_POCKET_POINTS.map((point) => {
    const value = (pockets as PeriodontalPocketDepths)[point.value];
    return typeof value === "number" ? `${point.label}: ${value} mm` : "";
  }).filter(Boolean).join(" · ");
}

export function FindingsList({ visitId, findings, onUpdate, onDeleted }: FindingsListProps) {
  const [editing, setEditing] = useState<ClinicalFinding | null>(null);
  const [condition, setCondition] = useState("");
  const [notes, setNotes] = useState("");
  const [periodontalSurfaces, setPeriodontalSurfaces] = useState<string[]>([]);
  const [pocketDepths, setPocketDepths] = useState<PeriodontalPocketDepths>({});
  const [saving, setSaving] = useState(false);

  function startEdit(finding: ClinicalFinding) {
    setEditing(finding);
    setCondition(finding.condition);
    setNotes(finding.notes ?? "");
    setPeriodontalSurfaces(finding.location_details?.periodontal_surfaces ?? []);
    const pockets = finding.measurements?.periodontal_pocket_depth_mm;
    setPocketDepths(pockets && typeof pockets === "object" ? pockets as PeriodontalPocketDepths : {});
  }

  async function save() {
    if (!editing) return;
    const locationDetails: FindingLocationDetails | undefined = editing.category === "periodontal" && editing.scope === "tooth" && periodontalSurfaces.length
      ? { ...editing.location_details, periodontal_surfaces: periodontalSurfaces as FindingLocationDetails["periodontal_surfaces"] }
      : editing.location_details;
    const populated = Object.entries(pocketDepths).filter(([, value]) => typeof value === "number" && Number.isFinite(value));
    const measurements: FindingMeasurements | undefined = populated.length ? { ...editing.measurements, periodontal_pocket_depth_mm: Object.fromEntries(populated) as PeriodontalPocketDepths } : editing.measurements;
    if (editing.category === "periodontal" && editing.scope === "tooth" && condition === "periodontitis" && !populated.length) {
      toast.error("Viêm nha chu cần ít nhất một độ sâu túi nha chu");
      return;
    }
    setSaving(true);
    try {
      const updated = await apiPatch<ClinicalFinding>(`/api/visits/${visitId}/findings/${editing.id}`, { condition, notes: notes || undefined, location_details: locationDetails, measurements });
      onUpdate(updated); setEditing(null); toast.success("Đã cập nhật finding");
    } catch (error) { toast.error(error instanceof ApiError ? error.message : "Không thể cập nhật finding"); }
    finally { setSaving(false); }
  }

  async function remove(finding: ClinicalFinding) {
    const label = `${locationLabel(finding)} - ${getFindingConditionLabel(finding.category, finding.condition)}`;
    if (!confirm(`Xóa ghi nhận lâm sàng ${label}?`)) return;
    setSaving(true);
    try {
      await apiDelete(`/api/visits/${visitId}/findings/${finding.id}`);
      if (editing?.id === finding.id) setEditing(null);
      onDeleted(finding.id);
      toast.success("Đã xóa ghi nhận lâm sàng");
    } catch (error) { toast.error(error instanceof ApiError ? error.message : "Không thể xóa ghi nhận lâm sàng"); }
    finally { setSaving(false); }
  }

  function togglePeriodontalSurface(surface: string) {
    setPeriodontalSurfaces((current) => current.includes(surface) ? current.filter((item) => item !== surface) : [...current, surface]);
  }

  if (!findings.length) return <p className="text-sm text-muted-foreground">Chưa có finding nào.</p>;

  const grouped = new Map<string, ClinicalFinding[]>();
  for (const finding of findings) {
    const key = locationKey(finding);
    grouped.set(key, [...(grouped.get(key) ?? []), finding]);
  }

  return <div className="space-y-2">{[...grouped.values()].map((items) => {
    const location = locationLabel(items[0]);
    return <section key={locationKey(items[0])} className="rounded-lg border border-border p-3">
      <div className="mb-3 flex flex-wrap items-center gap-2"><Badge variant="outline">{location}</Badge><Badge variant="secondary">{items.length} finding</Badge></div>
      <div className="space-y-3">{items.map((finding) => {
        const isEditing = editing?.id === finding.id;
        const category = getFindingCategory(finding.category);
        const pockets = pocketText(finding.measurements);
        return <div key={finding.id} className="border-t border-border pt-3 first:border-t-0 first:pt-0">
          <div className="flex flex-wrap items-center gap-2"><Badge variant="secondary">{category.label}</Badge>{isEditing ? <select value={condition} onChange={(event) => setCondition(event.target.value)} className="h-8 rounded border border-input bg-background px-2 text-xs">{category.conditions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select> : <span className="text-sm font-medium">{getFindingConditionLabel(finding.category, finding.condition)}</span>}<div className="ml-auto flex items-center"><Button variant="ghost" size="sm" onClick={() => isEditing ? setEditing(null) : startEdit(finding)} disabled={saving}>{isEditing ? "Hủy" : "Sửa"}</Button><Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={() => remove(finding)} disabled={saving}>Xóa</Button></div></div>
          {isEditing ? <div className="mt-3 space-y-3">{finding.category === "periodontal" && finding.scope === "tooth" && <><div className="flex flex-wrap gap-2">{PERIODONTAL_SURFACE_OPTIONS.map((surface) => <label key={surface.value} className="inline-flex items-center gap-1.5 text-xs"><input type="checkbox" checked={periodontalSurfaces.includes(surface.value)} onChange={() => togglePeriodontalSurface(surface.value)} />{surface.label}</label>)}</div><div className="grid grid-cols-2 gap-2 sm:grid-cols-3">{PERIODONTAL_POCKET_POINTS.map((point) => <label key={point.value} className="grid gap-1 text-xs text-muted-foreground">{point.label}<input inputMode="decimal" value={pocketDepths[point.value] ?? ""} onChange={(event) => setPocketDepths((current) => ({ ...current, [point.value]: event.target.value === "" ? undefined : Number(event.target.value) }))} className="h-8 rounded border border-input bg-background px-2 text-sm text-foreground" placeholder="mm" /></label>)}</div></>}<Textarea rows={2} value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Ghi chú" /><Button size="sm" onClick={save} disabled={saving}>{saving ? "Đang lưu..." : "Lưu"}</Button></div> : <>{displayLocation(finding) !== location && <p className="mt-2 text-xs text-muted-foreground">{displayLocation(finding)}</p>}{finding.notes && <p className="mt-2 text-sm text-muted-foreground">{finding.notes}</p>}{pockets && <p className="mt-2 text-xs text-muted-foreground">Túi nha chu: {pockets}</p>}{finding.measurements && !pockets && <p className="mt-2 text-xs text-muted-foreground">{Object.entries(finding.measurements).map(([key, value]) => `${key}: ${typeof value === "object" ? JSON.stringify(value) : value}`).join(" · ")}</p>}</>}
        </div>;
      })}</div>
    </section>;
  })}</div>;
}
