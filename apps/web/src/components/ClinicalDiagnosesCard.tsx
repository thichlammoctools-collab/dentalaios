import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogBody, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EvidenceImageThumbnail } from "@/components/image-annotations/EvidenceImageThumbnail";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { apiGet, apiPatch, apiPost, ApiError } from "@/lib/api";
import { toast } from "@/lib/toast";
import { getFindingConditionLabel } from "@shared/constants/clinical-findings";
import type { ClinicalConcept, ClinicalDiagnosis, ClinicalDiagnosisImageEvidence, ClinicalDiagnosisStatus, ImageAnnotation, PatientImage, ClinicalFinding } from "@shared/types";

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

function diagnosisConceptLabel(concept: ClinicalConcept) {
  return concept.default_icd10 ? `${concept.default_icd10.code} - ${concept.display_vi}` : concept.display_vi;
}

function isFileOnlyEvidence(image: PatientImage) {
  return image.image_type === "dicom" || image.image_type === "cbct" || image.image_type === "scan_3d";
}

function imageDate(image: PatientImage) {
  return new Date(image.created_at).toLocaleDateString("vi-VN");
}

interface Props {
  visitId: string;
  patientId: string;
  findings: ClinicalFinding[];
  readOnly?: boolean;
}

export function ClinicalDiagnosesCard({ visitId, patientId, findings, readOnly = false }: Props) {
  const [items, setItems] = useState<ClinicalDiagnosis[]>([]);
  const [concepts, setConcepts] = useState<ClinicalConcept[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<ClinicalDiagnosis | null>(null);
  const [saving, setSaving] = useState(false);
  const [evidenceCounts, setEvidenceCounts] = useState<Record<string, number>>({});
  const [patientImages, setPatientImages] = useState<PatientImage[]>([]);
  const [imageAnnotations, setImageAnnotations] = useState<ImageAnnotation[]>([]);
  const [diagnosisEvidence, setDiagnosisEvidence] = useState<ClinicalDiagnosisImageEvidence[]>([]);
  const [expandedEvidenceId, setExpandedEvidenceId] = useState<string | null>(null);
  const [expandedEvidence, setExpandedEvidence] = useState<ClinicalDiagnosisImageEvidence[]>([]);
  const [evidenceForm, setEvidenceForm] = useState({ imageId: "", annotationVersionId: "", relation: "supports" as "supports" | "contradicts" | "incidental", note: "" });
  const [form, setForm] = useState({ concept_id: "", source_finding_id: "", status: "suspected" as ClinicalDiagnosisStatus, notes: "", change_reason: "" });

  async function load() {
    setLoading(true);
    try {
      const [diagnosisResponse, conceptResponse, imageResponse] = await Promise.all([
        apiGet<{ items: ClinicalDiagnosis[] }>(`/api/visits/${visitId}/diagnoses`),
        apiGet<{ items: ClinicalConcept[] }>("/api/clinical-terminology/concepts"),
        apiGet<{ items: PatientImage[] }>(`/api/patient-images?patient_id=${patientId}`),
      ]);
      setItems(diagnosisResponse.items);
      setConcepts(conceptResponse.items.filter((concept) => concept.kind === "diagnosis"));
      setPatientImages(imageResponse.items);
      const evidence = await Promise.all(diagnosisResponse.items.map(async (diagnosis) => {
        const response = await apiGet<{ items: ClinicalDiagnosisImageEvidence[] }>(`/api/visits/${visitId}/diagnoses/${diagnosis.id}/image-evidence`);
        return [diagnosis.id, response.items.length] as const;
      }));
      setEvidenceCounts(Object.fromEntries(evidence));
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Không thể tải chẩn đoán");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, [visitId, patientId]);

  async function selectEvidenceImage(imageId: string) {
    setEvidenceForm((current) => ({ ...current, imageId, annotationVersionId: "" }));
    setImageAnnotations([]);
    if (!imageId) return;
    try {
      const response = await apiGet<{ items: ImageAnnotation[] }>(`/api/patient-images/${imageId}/annotations`);
      setImageAnnotations(response.items);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Không thể tải ghi chú trên ảnh");
    }
  }

  async function loadDiagnosisEvidence(diagnosisId: string) {
    const response = await apiGet<{ items: ClinicalDiagnosisImageEvidence[] }>(`/api/visits/${visitId}/diagnoses/${diagnosisId}/image-evidence`);
    setDiagnosisEvidence(response.items);
  }

  async function toggleEvidence(diagnosisId: string) {
    if (expandedEvidenceId === diagnosisId) {
      setExpandedEvidenceId(null);
      setExpandedEvidence([]);
      return;
    }
    try {
      const response = await apiGet<{ items: ClinicalDiagnosisImageEvidence[] }>(`/api/visits/${visitId}/diagnoses/${diagnosisId}/image-evidence`);
      setExpandedEvidenceId(diagnosisId);
      setExpandedEvidence(response.items);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Không thể tải bằng chứng hình ảnh");
    }
  }

  function openCreate() {
    setEditing(null);
    setForm({ concept_id: "", source_finding_id: "", status: "suspected", notes: "", change_reason: "" });
    setEvidenceForm({ imageId: "", annotationVersionId: "", relation: "supports", note: "" });
    setImageAnnotations([]);
    setDiagnosisEvidence([]);
    setOpen(true);
  }

  function openEdit(diagnosis: ClinicalDiagnosis) {
    setEditing(diagnosis);
    setForm({ concept_id: diagnosis.concept_id, source_finding_id: diagnosis.source_finding_id ?? "", status: diagnosis.status, notes: diagnosis.notes ?? "", change_reason: "" });
    setEvidenceForm({ imageId: "", annotationVersionId: "", relation: "supports", note: "" });
    setImageAnnotations([]);
    void loadDiagnosisEvidence(diagnosis.id).catch((error) => toast.error(error instanceof ApiError ? error.message : "Không thể tải bằng chứng hình ảnh"));
    setOpen(true);
  }

  function selectConcept(conceptId: string) {
    const concept = concepts.find((item) => item.id === conceptId);
    setForm((current) => {
      const sourceFinding = findings.find((finding) => finding.id === current.source_finding_id);
      return {
        ...current,
        concept_id: conceptId,
        source_finding_id: sourceFinding && sourceFinding.category !== concept?.category ? "" : current.source_finding_id,
      };
    });
  }

  const selectedConcept = concepts.find((concept) => concept.id === form.concept_id);
  const selectedEvidenceImage = patientImages.find((image) => image.id === evidenceForm.imageId);
  const selectedAnnotation = imageAnnotations.find((annotation) => annotation.current_version.id === evidenceForm.annotationVersionId);
  const orderedPatientImages = [...patientImages].sort((left, right) => Number(right.visit_id === visitId) - Number(left.visit_id === visitId));
  const selectedConceptHasIcd10 = Boolean(selectedConcept?.default_icd10);
  const effectiveFindings = findings.filter((finding) => Boolean(finding.clinical_effective_at) || finding.entry_source === "doctor" || finding.entry_source === "legacy");
  const compatibleFindings = selectedConcept
    ? effectiveFindings.filter((finding) => finding.category === selectedConcept.category)
    : [];

  async function save() {
    if (!form.concept_id) { toast.error("Chọn chẩn đoán trước khi lưu"); return; }
    if (editing && !form.change_reason.trim()) { toast.error("Nêu lý do cập nhật chẩn đoán"); return; }
    if (selectedEvidenceImage && !isFileOnlyEvidence(selectedEvidenceImage) && !evidenceForm.annotationVersionId) { toast.error("Chọn vị trí đánh dấu trên ảnh trước khi liên kết"); return; }
    if (evidenceForm.imageId && evidenceForm.relation === "contradicts" && !evidenceForm.note.trim()) { toast.error("Bằng chứng mâu thuẫn cần ghi chú giải thích"); return; }
    setSaving(true);
    try {
      const diagnosis = editing
        ? await apiPatch<ClinicalDiagnosis>(`/api/visits/${visitId}/diagnoses/${editing.id}`, {
          concept_id: form.concept_id,
          status: form.status,
          notes: form.notes || undefined,
          change_reason: form.change_reason,
        })
        : await apiPost<ClinicalDiagnosis>(`/api/visits/${visitId}/diagnoses`, {
          concept_id: form.concept_id,
          source_finding_id: form.source_finding_id || null,
          status: form.status,
          source: form.source_finding_id ? "finding_confirmed" : "manual",
          notes: form.notes || undefined,
        });
      if (evidenceForm.imageId) {
        await apiPost(`/api/visits/${visitId}/diagnoses/${diagnosis.id}/image-evidence`, {
          patient_image_id: evidenceForm.imageId,
          annotation_version_id: evidenceForm.annotationVersionId || null,
          relation: evidenceForm.relation,
          note: evidenceForm.note || undefined,
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
      {!readOnly && <Button size="sm" onClick={openCreate}>Thêm chẩn đoán</Button>}
    </CardHeader>
    <CardContent>
      {loading ? <p className="text-sm text-muted-foreground">Đang tải chẩn đoán...</p> : items.length === 0 ? <p className="text-sm text-muted-foreground">Chưa có chẩn đoán mã hóa. Ghi nhận, nguy cơ và quan sát vẫn được lưu riêng.</p> : <div className="space-y-2">
        {items.map((diagnosis) => <div key={diagnosis.id} className="flex flex-wrap items-start gap-2 rounded-lg border border-border p-3">
          <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><p className="font-medium">{diagnosis.concept_display_vi_snapshot}</p><Badge variant={statusVariant(diagnosis.status)}>{statusLabel[diagnosis.status]}</Badge></div>
            {diagnosis.icd10_code_snapshot ? <p className="mt-1 text-sm text-muted-foreground"><span className="font-mono">{diagnosis.icd10_code_snapshot}</span> · {diagnosis.icd10_display_vi_snapshot}</p> : <p className="mt-1 text-sm text-muted-foreground">Chưa xác nhận mã ICD-10</p>}
            {diagnosis.source_finding_id && <p className="mt-1 text-xs text-muted-foreground">Từ ghi nhận lâm sàng #{findings.findIndex((finding) => finding.id === diagnosis.source_finding_id) + 1 || ""}</p>}
            <div className="mt-1 flex items-center gap-2"><p className="text-xs text-muted-foreground">Bằng chứng hình ảnh: {evidenceCounts[diagnosis.id] ?? 0}.</p>{(evidenceCounts[diagnosis.id] ?? 0) > 0 && <button type="button" className="text-xs font-medium text-primary hover:underline" onClick={() => void toggleEvidence(diagnosis.id)}>{expandedEvidenceId === diagnosis.id ? "Ẩn ảnh" : "Xem ảnh"}</button>}</div>
            {expandedEvidenceId === diagnosis.id && <div className="mt-2 grid grid-cols-4 gap-2 sm:grid-cols-6">{expandedEvidence.map((evidence) => evidence.image && <div key={evidence.id} className="min-w-0"><EvidenceImageThumbnail image={evidence.image} annotationVersion={evidence.annotation_version} /><p className="mt-1 truncate text-[11px] text-muted-foreground">{evidence.annotation_version ? evidence.annotation_version.note : "Không có đánh dấu"}</p></div>)}</div>}
            {diagnosis.notes && <p className="mt-1 whitespace-pre-wrap text-sm">{diagnosis.notes}</p>}</div>
          {!readOnly && <Button variant="outline" size="sm" onClick={() => openEdit(diagnosis)}>Cập nhật</Button>}
        </div>)}
      </div>}
    </CardContent>
    <Dialog open={open} onOpenChange={setOpen} size="lg">
      <DialogHeader><DialogTitle>{editing ? "Cập nhật chẩn đoán" : "Thêm chẩn đoán"}</DialogTitle></DialogHeader>
      <DialogBody className="grid gap-5 lg:grid-cols-2 lg:items-start lg:[&_select]:h-11 lg:[&_select]:text-base lg:[&_textarea]:text-base">
        <div className="grid gap-2 lg:col-span-2"><Label htmlFor="diagnosis-concept">Kết luận chẩn đoán</Label><Select id="diagnosis-concept" value={form.concept_id} onChange={(event) => selectConcept(event.target.value)}><option value="">Chọn chẩn đoán</option>{concepts.map((concept) => <option key={concept.id} value={concept.id}>{diagnosisConceptLabel(concept)}</option>)}</Select><p className="text-xs text-muted-foreground">Mã ICD-10 được hiển thị trước tên chẩn đoán và tự động lưu cùng hồ sơ.</p>{selectedConcept && <p className={`text-xs ${selectedConceptHasIcd10 ? "text-muted-foreground" : "text-destructive"}`}>{selectedConceptHasIcd10 ? `ICD-10 áp dụng: ${selectedConcept.default_icd10?.code} - ${selectedConcept.default_icd10?.display_vi}` : "Danh mục chưa gắn ICD-10. Bạn vẫn có thể lưu Nghi ngờ nhưng chưa thể xác nhận."}</p>}</div>
        <div className="grid gap-2"><Label htmlFor="diagnosis-status">Trạng thái chẩn đoán</Label><Select id="diagnosis-status" value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value as ClinicalDiagnosisStatus })}><option value="suspected">Nghi ngờ</option><option value="confirmed">Đã xác nhận</option><option value="ruled_out">Đã loại trừ</option><option value="resolved">Đã giải quyết</option></Select></div>
        {!editing && <div className="grid gap-2"><Label htmlFor="diagnosis-finding">Ghi nhận làm cơ sở <span className="font-normal text-muted-foreground">(tùy chọn)</span></Label><Select id="diagnosis-finding" value={form.source_finding_id} onChange={(event) => setForm({ ...form, source_finding_id: event.target.value })} disabled={!selectedConcept}><option value="">Không liên kết ghi nhận</option>{compatibleFindings.map((finding) => <option key={finding.id} value={finding.id}>{finding.code ?? finding.id} · {getFindingConditionLabel(finding.category, finding.condition)}{finding.tooth_number ? ` răng #${finding.tooth_number}` : ""}</option>)}</Select>{selectedConcept && compatibleFindings.length === 0 && <p className="text-xs text-muted-foreground">Chưa có ghi nhận phù hợp. Bạn vẫn có thể lưu chẩn đoán độc lập.</p>}</div>}
        <div className="rounded-lg border border-border bg-muted/20 p-4 lg:col-span-2"><p className="text-sm font-medium">Bằng chứng hình ảnh <span className="font-normal text-muted-foreground">(tùy chọn)</span></p><p className="mt-1 text-xs text-muted-foreground">Chọn thumbnail để liên kết ảnh. Với ảnh có thể xem trước, chọn vị trí đánh dấu đã tạo; ảnh DICOM/CBCT được liên kết ở cấp tệp.</p>{orderedPatientImages.length === 0 ? <p className="mt-3 text-sm text-muted-foreground">Chưa có ảnh của bệnh nhân.</p> : <div className="mt-3 grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-5">{orderedPatientImages.map((image) => <div key={image.id} className="min-w-0"><EvidenceImageThumbnail image={image} selected={evidenceForm.imageId === image.id} onClick={() => void selectEvidenceImage(image.id)} /><p className="mt-1 truncate text-xs font-medium">{image.original_name ?? image.image_type}</p><p className="text-[11px] text-muted-foreground">{image.visit_id === visitId ? "Ảnh lượt khám này" : `Ảnh lịch sử ${imageDate(image)}`}</p></div>)}</div>} {selectedEvidenceImage && <div className="mt-4 grid gap-3 border-t border-border pt-4"><div className="flex items-start gap-3"><div className="w-24 shrink-0"><EvidenceImageThumbnail image={selectedEvidenceImage} annotationVersion={selectedAnnotation?.current_version} /></div><div className="min-w-0"><p className="text-sm font-medium">{selectedEvidenceImage.original_name ?? selectedEvidenceImage.image_type}</p><p className="text-xs text-muted-foreground">{isFileOnlyEvidence(selectedEvidenceImage) ? "Liên kết ở cấp tệp, không có vị trí đánh dấu." : "Chọn vị trí đánh dấu tương ứng trên ảnh."}</p></div></div>{!isFileOnlyEvidence(selectedEvidenceImage) && (imageAnnotations.length === 0 ? <p className="rounded-md bg-amber-500/10 p-3 text-xs text-amber-700 dark:text-amber-300">Ảnh này chưa có vị trí đánh dấu. Tạo đánh dấu trong thư viện ảnh trước khi liên kết.</p> : <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">{imageAnnotations.map((annotation) => <button type="button" key={annotation.id} onClick={() => setEvidenceForm((current) => ({ ...current, annotationVersionId: annotation.current_version.id }))} className={`rounded-md border p-2 text-left text-xs ${evidenceForm.annotationVersionId === annotation.current_version.id ? "border-primary bg-primary/5" : "border-border hover:bg-muted/50"}`}><p className="font-medium">{annotation.current_version.shape_type === "pin" ? "Ghim" : annotation.current_version.shape_type === "rectangle" ? "Khung" : "Nét vẽ"} · V{annotation.current_version.version_no}</p><p className="mt-1 line-clamp-2 text-muted-foreground">{annotation.current_version.note}</p></button>)}</div>)}<Select value={evidenceForm.relation} onChange={(event) => setEvidenceForm({ ...evidenceForm, relation: event.target.value as "supports" | "contradicts" | "incidental" })}><option value="supports">Ủng hộ chẩn đoán</option><option value="contradicts">Mâu thuẫn với chẩn đoán</option><option value="incidental">Phát hiện kèm theo</option></Select><Textarea value={evidenceForm.note} onChange={(event) => setEvidenceForm({ ...evidenceForm, note: event.target.value })} rows={2} placeholder={evidenceForm.relation === "contradicts" ? "Giải thích bằng chứng mâu thuẫn" : "Ghi chú bằng chứng (tùy chọn)"} /></div>}{editing && diagnosisEvidence.length > 0 && <div className="mt-4 border-t border-border pt-3"><p className="text-xs font-medium text-muted-foreground">Bằng chứng đã liên kết</p><div className="mt-2 grid grid-cols-4 gap-2 sm:grid-cols-6">{diagnosisEvidence.map((evidence) => evidence.image && <div key={evidence.id} className="min-w-0"><EvidenceImageThumbnail image={evidence.image} annotationVersion={evidence.annotation_version} /><p className="mt-1 truncate text-[11px] text-muted-foreground">{evidence.relation === "supports" ? "Ủng hộ" : evidence.relation === "contradicts" ? "Mâu thuẫn" : "Kèm theo"}</p></div>)}</div></div>}</div>
        <div className="grid gap-2 lg:col-span-2"><Label htmlFor="diagnosis-notes">Ghi chú lâm sàng <span className="font-normal text-muted-foreground">(tùy chọn)</span></Label><Textarea className="min-h-28" id="diagnosis-notes" value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} rows={4} placeholder="Nhập diễn giải ngắn gọn cho chẩn đoán..." /></div>
        {editing && <div className="grid gap-1.5 lg:col-span-2"><Label htmlFor="diagnosis-reason">Lý do cập nhật</Label><Textarea id="diagnosis-reason" value={form.change_reason} onChange={(event) => setForm({ ...form, change_reason: event.target.value })} rows={2} required /></div>}
      </DialogBody>
      <DialogFooter><Button className="h-11 px-6" variant="outline" onClick={() => setOpen(false)}>Hủy</Button><Button className="h-11 px-6" onClick={() => void save()} disabled={saving}>{saving ? "Đang lưu..." : "Lưu chẩn đoán"}</Button></DialogFooter>
    </Dialog>
  </Card>;
}
