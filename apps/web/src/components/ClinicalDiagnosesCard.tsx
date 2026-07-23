import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogBody, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { apiGet, apiPatch, apiPost, ApiError } from "@/lib/api";
import { toast } from "@/lib/toast";
import { getFindingConditionLabel } from "@shared/constants/clinical-findings";
import type { ClinicalConcept, ClinicalDiagnosis, ClinicalDiagnosisStatus, Icd10Code, ClinicalFinding } from "@shared/types";

const statusLabel: Record<ClinicalDiagnosisStatus, string> = {
  suspected: "Nghi ngờ",
  confirmed: "Đã xác nhận",
  ruled_out: "Đã loại trừ",
  resolved: "Đã giải quyết",
};

function statusVariant(status: ClinicalDiagnosisStatus) {
  if (status === "confirmed") return "success" as const;
  if (status === "ruled_out") return "destructive" as const;
  return status === "resolved" ? "secondary" as const : "warning" as const;
}

interface Props {
  visitId: string;
  findings: ClinicalFinding[];
}

export function ClinicalDiagnosesCard({ visitId, findings }: Props) {
  const [items, setItems] = useState<ClinicalDiagnosis[]>([]);
  const [concepts, setConcepts] = useState<ClinicalConcept[]>([]);
  const [icd10, setIcd10] = useState<Icd10Code[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<ClinicalDiagnosis | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ concept_id: "", icd10_code_id: "", source_finding_id: "", status: "suspected" as ClinicalDiagnosisStatus, notes: "", change_reason: "" });

  async function load() {
    setLoading(true);
    try {
      const [diagnosisResponse, conceptResponse, icdResponse] = await Promise.all([
        apiGet<{ items: ClinicalDiagnosis[] }>(`/api/visits/${visitId}/diagnoses`),
        apiGet<{ items: ClinicalConcept[] }>("/api/clinical-terminology/concepts"),
        apiGet<{ items: Icd10Code[] }>("/api/clinical-terminology/icd10"),
      ]);
      setItems(diagnosisResponse.items);
      setConcepts(conceptResponse.items.filter((concept) => concept.kind === "diagnosis"));
      setIcd10(icdResponse.items);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Không thể tải chẩn đoán");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, [visitId]);

  function openCreate() {
    setEditing(null);
    setForm({ concept_id: "", icd10_code_id: "", source_finding_id: "", status: "suspected", notes: "", change_reason: "" });
    setOpen(true);
  }

  function openEdit(diagnosis: ClinicalDiagnosis) {
    setEditing(diagnosis);
    setForm({ concept_id: diagnosis.concept_id, icd10_code_id: diagnosis.icd10_code_id ?? "", source_finding_id: diagnosis.source_finding_id ?? "", status: diagnosis.status, notes: diagnosis.notes ?? "", change_reason: "" });
    setOpen(true);
  }

  function selectConcept(conceptId: string) {
    const concept = concepts.find((item) => item.id === conceptId);
    setForm((current) => {
      const sourceFinding = findings.find((finding) => finding.id === current.source_finding_id);
      return {
        ...current,
        concept_id: conceptId,
        icd10_code_id: concept?.default_icd10?.id ?? "",
        source_finding_id: sourceFinding && sourceFinding.category !== concept?.category ? "" : current.source_finding_id,
      };
    });
  }

  const selectedConcept = concepts.find((concept) => concept.id === form.concept_id);
  const compatibleFindings = selectedConcept
    ? findings.filter((finding) => finding.category === selectedConcept.category)
    : [];

  async function save() {
    if (!form.concept_id) { toast.error("Chọn chẩn đoán trước khi lưu"); return; }
    if (form.status === "confirmed" && !form.icd10_code_id) { toast.error("Chẩn đoán xác nhận cần mã ICD-10 được ánh xạ"); return; }
    if (editing && !form.change_reason.trim()) { toast.error("Nêu lý do cập nhật chẩn đoán"); return; }
    setSaving(true);
    try {
      if (editing) {
        await apiPatch<ClinicalDiagnosis>(`/api/visits/${visitId}/diagnoses/${editing.id}`, {
          concept_id: form.concept_id,
          icd10_code_id: form.icd10_code_id || null,
          status: form.status,
          notes: form.notes || undefined,
          change_reason: form.change_reason,
        });
      } else {
        await apiPost<ClinicalDiagnosis>(`/api/visits/${visitId}/diagnoses`, {
          concept_id: form.concept_id,
          icd10_code_id: form.icd10_code_id || null,
          source_finding_id: form.source_finding_id || null,
          status: form.status,
          source: form.source_finding_id ? "finding_confirmed" : "manual",
          notes: form.notes || undefined,
        });
      }
      setOpen(false);
      await load();
      toast.success(editing ? "Đã tạo revision chẩn đoán" : "Đã lưu chẩn đoán");
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Không thể lưu chẩn đoán");
    } finally {
      setSaving(false);
    }
  }

  return <Card id="diagnoses">
    <CardHeader className="flex-row items-center justify-between gap-4">
      <CardTitle>Chẩn đoán ({items.length})</CardTitle>
      <Button size="sm" onClick={openCreate}>Thêm chẩn đoán</Button>
    </CardHeader>
    <CardContent>
      {loading ? <p className="text-sm text-muted-foreground">Đang tải chẩn đoán...</p> : items.length === 0 ? <p className="text-sm text-muted-foreground">Chưa có chẩn đoán mã hóa. Finding, nguy cơ và quan sát vẫn được lưu riêng.</p> : <div className="space-y-2">
        {items.map((diagnosis) => <div key={diagnosis.id} className="flex flex-wrap items-start gap-2 rounded-lg border border-border p-3">
          <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><p className="font-medium">{diagnosis.concept_display_vi_snapshot}</p><Badge variant={statusVariant(diagnosis.status)}>{statusLabel[diagnosis.status]}</Badge></div>
            {diagnosis.icd10_code_snapshot ? <p className="mt-1 text-sm text-muted-foreground"><span className="font-mono">{diagnosis.icd10_code_snapshot}</span> · {diagnosis.icd10_display_vi_snapshot}</p> : <p className="mt-1 text-sm text-muted-foreground">Chưa xác nhận mã ICD-10</p>}
            {diagnosis.source_finding_id && <p className="mt-1 text-xs text-muted-foreground">Từ ghi nhận lâm sàng #{findings.findIndex((finding) => finding.id === diagnosis.source_finding_id) + 1 || ""}</p>}
            {diagnosis.notes && <p className="mt-1 whitespace-pre-wrap text-sm">{diagnosis.notes}</p>}</div>
          <Button variant="outline" size="sm" onClick={() => openEdit(diagnosis)}>Cập nhật</Button>
        </div>)}
      </div>}
    </CardContent>
    <Dialog open={open} onOpenChange={setOpen} className="sm:max-w-xl">
      <DialogHeader><DialogTitle>{editing ? "Cập nhật chẩn đoán" : "Thêm chẩn đoán"}</DialogTitle></DialogHeader>
      <DialogBody className="space-y-4">
        <div className="grid gap-1.5"><Label htmlFor="diagnosis-concept">Kết luận chẩn đoán</Label><p className="text-xs text-muted-foreground">Bệnh lý được bác sĩ đánh giá sau khi khám, có thể lập độc lập với ghi nhận.</p><Select id="diagnosis-concept" value={form.concept_id} onChange={(event) => selectConcept(event.target.value)}><option value="">Chọn chẩn đoán</option>{concepts.map((concept) => <option key={concept.id} value={concept.id}>{concept.display_vi}</option>)}</Select></div>
        <div className="grid gap-1.5"><Label htmlFor="diagnosis-icd10">Mã ICD-10 Việt Nam</Label><p className="text-xs text-muted-foreground">Bắt buộc khi chẩn đoán được xác nhận.</p><Select id="diagnosis-icd10" value={form.icd10_code_id} onChange={(event) => setForm({ ...form, icd10_code_id: event.target.value })}><option value="">Chưa chọn (chỉ dùng khi nghi ngờ)</option>{icd10.map((code) => <option key={code.id} value={code.id}>{code.code} · {code.display_vi}</option>)}</Select></div>
        {!editing && <div className="grid gap-1.5"><Label htmlFor="diagnosis-finding">Ghi nhận làm cơ sở (tùy chọn)</Label><p className="text-xs text-muted-foreground">Dấu hiệu hoặc quan sát hỗ trợ kết luận. Chỉ hiển thị ghi nhận cùng nhóm lâm sàng với chẩn đoán.</p><Select id="diagnosis-finding" value={form.source_finding_id} onChange={(event) => setForm({ ...form, source_finding_id: event.target.value })} disabled={!selectedConcept}><option value="">Không liên kết ghi nhận</option>{compatibleFindings.map((finding) => <option key={finding.id} value={finding.id}>{finding.code ?? finding.id} · {getFindingConditionLabel(finding.category, finding.condition)}{finding.tooth_number ? ` răng #${finding.tooth_number}` : ""}</option>)}</Select>{selectedConcept && compatibleFindings.length === 0 && <p className="text-xs text-muted-foreground">Chưa có ghi nhận phù hợp. Bạn vẫn có thể lưu chẩn đoán độc lập.</p>}</div>}
        <div className="grid gap-1.5"><Label htmlFor="diagnosis-status">Trạng thái chẩn đoán</Label><Select id="diagnosis-status" value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value as ClinicalDiagnosisStatus })}><option value="suspected">Nghi ngờ</option><option value="confirmed">Đã xác nhận</option><option value="ruled_out">Đã loại trừ</option><option value="resolved">Đã giải quyết</option></Select></div>
        <div className="grid gap-1.5"><Label htmlFor="diagnosis-notes">Ghi chú</Label><Textarea id="diagnosis-notes" value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} rows={3} /></div>
        {editing && <div className="grid gap-1.5"><Label htmlFor="diagnosis-reason">Lý do cập nhật</Label><Textarea id="diagnosis-reason" value={form.change_reason} onChange={(event) => setForm({ ...form, change_reason: event.target.value })} rows={2} required /></div>}
      </DialogBody>
      <DialogFooter><Button variant="outline" onClick={() => setOpen(false)}>Hủy</Button><Button onClick={() => void save()} disabled={saving}>{saving ? "Đang lưu..." : "Lưu chẩn đoán"}</Button></DialogFooter>
    </Dialog>
  </Card>;
}
