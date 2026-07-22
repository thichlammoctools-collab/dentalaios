import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { apiPatch, ApiError } from "@/lib/api";
import { toast } from "@/lib/toast";
import { CLINICAL_FINDING_CATEGORIES, getAnatomicalSiteLabel, getFindingConditionLabel } from "@shared/constants/clinical-findings";
import type { ClinicalFinding } from "@shared/types";

interface FindingsListProps { visitId: string; findings: ClinicalFinding[]; onUpdate: (updated: ClinicalFinding) => void; }

export function FindingsList({ visitId, findings, onUpdate }: FindingsListProps) {
  const [editing, setEditing] = useState<ClinicalFinding | null>(null);
  const [condition, setCondition] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  function startEdit(finding: ClinicalFinding) { setEditing(finding); setCondition(finding.condition); setNotes(finding.notes ?? ""); }
  async function save() {
    if (!editing) return;
    setSaving(true);
    try {
      const updated = await apiPatch<ClinicalFinding>(`/api/visits/${visitId}/findings/${editing.id}`, { condition, notes: notes || undefined });
      onUpdate(updated); setEditing(null); toast.success("Đã cập nhật finding");
    } catch (error) { toast.error(error instanceof ApiError ? error.message : "Không thể cập nhật finding"); }
    finally { setSaving(false); }
  }

  if (!findings.length) return <p className="text-sm text-muted-foreground">Chưa có finding nào.</p>;
  return <div className="space-y-5">{CLINICAL_FINDING_CATEGORIES.map((category) => {
    const items = findings.filter((finding) => finding.category === category.value);
    if (!items.length) return null;
    return <section key={category.value}><div className="mb-2 flex items-center gap-2"><h3 className="text-sm font-semibold">{category.label}</h3><Badge variant="secondary">{items.length}</Badge></div><div className="space-y-2">{items.map((finding) => {
      const isEditing = editing?.id === finding.id;
      return <div key={finding.id} className="rounded-lg border border-border p-3"><div className="flex flex-wrap items-center gap-2"><Badge variant="outline">{finding.scope === "tooth" ? `Răng #${finding.tooth_number}` : finding.scope === "region" ? getAnatomicalSiteLabel(finding.anatomical_site) : "Toàn miệng"}</Badge>{isEditing ? <select value={condition} onChange={(event) => setCondition(event.target.value)} className="h-8 rounded border border-input bg-background px-2 text-xs">{category.conditions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select> : <span className="text-sm font-medium">{getFindingConditionLabel(finding.category, finding.condition)}</span>}<Button className="ml-auto" variant="ghost" size="sm" onClick={() => isEditing ? setEditing(null) : startEdit(finding)}>{isEditing ? "Hủy" : "Sửa"}</Button></div>{isEditing ? <div className="mt-2 space-y-2"><Textarea rows={2} value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Ghi chú" /><Button size="sm" onClick={save} disabled={saving}>{saving ? "Đang lưu…" : "Lưu"}</Button></div> : <>{finding.notes && <p className="mt-2 text-sm text-muted-foreground">{finding.notes}</p>}{finding.measurements && <p className="mt-1 text-xs text-muted-foreground">{Object.entries(finding.measurements).map(([key, value]) => `${key}: ${value}`).join(" · ")}</p>}</>}</div>;
    })}</div></section>;
  })}</div>;
}
