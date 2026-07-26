import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { apiGet, apiPatch, apiPost, ApiError } from "@/lib/api";
import { toast } from "@/lib/toast";
import type { ClinicalPathwayAssessment, ClinicalPathwayAssessmentItem, EndodonticPainAssessmentPayload, PathwayPattern } from "@shared/types";
import { cn } from "@/lib/utils";

interface EndodonticPainPathwayCardProps {
  visitId: string;
  canWrite: boolean;
  canReview: boolean;
}

interface PathwayAssessmentResponse {
  assessment: ClinicalPathwayAssessment;
  items: ClinicalPathwayAssessmentItem[];
  patterns: PathwayPattern[];
}

interface VisitPathwayResponse {
  assessments: PathwayAssessmentResponse[];
  feature_enabled: boolean;
}

const teeth = [11, 12, 13, 14, 15, 16, 17, 18, 21, 22, 23, 24, 25, 26, 27, 28, 31, 32, 33, 34, 35, 36, 37, 38, 41, 42, 43, 44, 45, 46, 47, 48];
const symptomOptions = [{ value: "unknown", label: "Chưa ghi nhận" }, { value: "present", label: "Có" }, { value: "absent", label: "Không" }];
const testOptions = [{ value: "not_done", label: "Chưa thực hiện" }, { value: "positive", label: "Dương tính" }, { value: "negative", label: "Âm tính" }, { value: "inconclusive", label: "Không rõ" }];
const imagingOptions = [{ value: "not_assessed", label: "Chưa đánh giá" }, { value: "present", label: "Có" }, { value: "absent", label: "Không" }, { value: "unknown", label: "Không rõ" }];

const blankAssessment = (): EndodonticPainAssessmentPayload => ({
  symptoms: { spontaneous_pain: "unknown", pain_on_biting: "unknown", prolonged_pain_after_stimulus: "unknown" },
  tests: { cold_test: "not_done", percussion: "not_done", palpation: "not_done", bite_test: "not_done" },
  context: { large_caries: "unknown", deep_old_restoration: "unknown", periapical_signs_on_imaging: "not_assessed" },
  notes: "",
});

export function EndodonticPainPathwayCard({ visitId, canWrite, canReview }: EndodonticPainPathwayCardProps) {
  const [data, setData] = useState<VisitPathwayResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [toothNumber, setToothNumber] = useState("");
  const [creating, setCreating] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, EndodonticPainAssessmentPayload>>({});

  async function load() {
    setLoading(true);
    try {
      const result = await apiGet<VisitPathwayResponse>(`/api/visits/${visitId}/clinical-pathways/endodontic-pain`);
      setData(result);
      setDrafts(Object.fromEntries(result.assessments.map(({ assessment }) => [assessment.id, parsePayload(assessment.assessment_json)])));
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Không thể tải Clinical Copilot");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, [visitId]);

  async function createAssessment() {
    if (!toothNumber) { toast.error("Chọn răng cần đánh giá"); return; }
    setCreating(true);
    try {
      await apiPost(`/api/visits/${visitId}/clinical-pathways/endodontic-pain/assessments`, {
        tooth_number: Number(toothNumber),
        assessment: blankAssessment(),
      });
      setToothNumber("");
      await load();
      toast.success("Đã mở assessment nội nha");
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Không thể mở assessment");
    } finally {
      setCreating(false);
    }
  }

  async function saveAssessment(assessment: ClinicalPathwayAssessment) {
    const draft = drafts[assessment.id];
    if (!draft) return;
    setSavingId(assessment.id);
    try {
      await apiPatch(`/api/visits/${visitId}/clinical-pathways/endodontic-pain/assessments/${assessment.id}`, {
        assessment: draft,
        change_reason: "Cập nhật đánh giá đau răng/nội nha",
      });
      await load();
      toast.success("Đã lưu assessment");
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Không thể lưu assessment");
    } finally {
      setSavingId(null);
    }
  }

  async function updateItem(assessmentId: string, item: ClinicalPathwayAssessmentItem, status: "completed" | "skipped") {
    const skipReason = status === "skipped" ? window.prompt(`Lý do bỏ qua: ${item.item_key}`)?.trim() : undefined;
    if (status === "skipped" && !skipReason) return;
    setSavingId(assessmentId);
    try {
      await apiPatch(`/api/visits/${visitId}/clinical-pathways/endodontic-pain/assessments/${assessmentId}/items/${item.item_key}`, {
        status,
        ...(skipReason ? { skip_reason: skipReason } : {}),
      });
      await load();
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Không thể cập nhật checklist");
    } finally {
      setSavingId(null);
    }
  }

  async function closeAssessment(assessmentId: string) {
    setSavingId(assessmentId);
    try {
      await apiPost(`/api/visits/${visitId}/clinical-pathways/endodontic-pain/assessments/${assessmentId}/close`, {});
      await load();
      toast.success("Đã hoàn tất assessment nội nha");
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Cần xử lý các mục checklist trước khi hoàn tất");
    } finally {
      setSavingId(null);
    }
  }

  async function acceptAssessment(assessmentId: string) {
    setSavingId(assessmentId);
    try {
      await apiPost(`/api/visits/${visitId}/clinical-pathways/endodontic-pain/assessments/${assessmentId}/accept`, {});
      await load();
      toast.success("Đã duyệt assessment của phụ tá");
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Không thể duyệt assessment");
    } finally {
      setSavingId(null);
    }
  }

  if (loading) return <Card><CardContent className="p-5 text-sm text-muted-foreground">Đang tải Clinical Copilot...</CardContent></Card>;
  if (!data?.feature_enabled) return null;

  return <Card className="border-cyan-500/30 bg-cyan-500/[0.03]" id="clinical-copilot">
    <CardHeader className="flex-row flex-wrap items-center justify-between gap-3">
      <div><CardTitle className="text-base">Clinical Copilot: Đau răng / nội nha</CardTitle><p className="mt-1 text-xs text-muted-foreground">Checklist cố định theo AAE. Hệ thống chỉ nhắc dữ liệu cần xem xét, không tự chẩn đoán.</p></div>
      {canWrite && <div className="flex items-center gap-2"><Select aria-label="Răng cần đánh giá" className="h-9 w-32" value={toothNumber} onChange={(event) => setToothNumber(event.target.value)}><option value="">Chọn răng</option>{teeth.map((tooth) => <option key={tooth} value={tooth}>Răng {tooth}</option>)}</Select><Button size="sm" onClick={() => void createAssessment()} disabled={creating}>{creating ? "Đang mở..." : "Thêm assessment"}</Button></div>}
    </CardHeader>
    <CardContent className="space-y-4">
      {!data.assessments.length && <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">Bác sĩ chủ động chọn một răng để bắt đầu đánh giá. Mỗi assessment được theo dõi độc lập.</p>}
      {data.assessments.map((entry) => <AssessmentCard key={entry.assessment.id} entry={entry} draft={drafts[entry.assessment.id] ?? blankAssessment()} canWrite={canWrite} canReview={canReview} saving={savingId === entry.assessment.id} onDraftChange={(draft) => setDrafts((current) => ({ ...current, [entry.assessment.id]: draft }))} onSave={() => void saveAssessment(entry.assessment)} onUpdateItem={(item, status) => void updateItem(entry.assessment.id, item, status)} onClose={() => void closeAssessment(entry.assessment.id)} onAccept={() => void acceptAssessment(entry.assessment.id)} />)}
    </CardContent>
  </Card>;
}

function AssessmentCard({ entry, draft, canWrite, canReview, saving, onDraftChange, onSave, onUpdateItem, onClose, onAccept }: { entry: PathwayAssessmentResponse; draft: EndodonticPainAssessmentPayload; canWrite: boolean; canReview: boolean; saving: boolean; onDraftChange: (draft: EndodonticPainAssessmentPayload) => void; onSave: () => void; onUpdateItem: (item: ClinicalPathwayAssessmentItem, status: "completed" | "skipped") => void; onClose: () => void; onAccept: () => void }) {
  const { assessment, items, patterns } = entry;
  const pending = items.filter((item) => item.status === "pending");
  const isClosed = assessment.status !== "active";
  const field = (label: string, value: string, options: { value: string; label: string }[], change: (value: string) => void) => <label className="grid gap-1 text-xs font-medium"><span>{label}</span><Select className="h-9 text-sm" value={value} onChange={(event) => change(event.target.value)} disabled={!canWrite || isClosed}>{options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</Select></label>;
  return <div className="rounded-xl border border-border bg-card p-4">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><div className="flex items-center gap-2"><p className="font-semibold">Răng {assessment.tooth_number}</p><Badge variant={assessment.status === "completed" ? "success" : assessment.status === "closed_with_exceptions" ? "warning" : "secondary"}>{assessment.status === "active" ? "Đang đánh giá" : assessment.status === "completed" ? "Hoàn tất" : "Hoàn tất có ngoại lệ"}</Badge>{!assessment.clinical_effective_at && <Badge variant="warning">Chờ bác sĩ duyệt</Badge>}</div><p className="mt-1 text-xs text-muted-foreground">{items.length - pending.length}/{items.length} mục đã xử lý · phiên bản {assessment.pathway_version}</p></div>{assessment.status === "active" && <div className="flex gap-2">{!assessment.clinical_effective_at && canReview && <Button size="sm" onClick={onAccept} disabled={saving}>{saving ? "Đang duyệt..." : "Bác sĩ duyệt"}</Button>}{canWrite && <Button size="sm" variant="outline" onClick={onSave} disabled={saving}>{saving ? "Đang lưu..." : "Lưu assessment"}</Button>}{canWrite && <Button size="sm" onClick={onClose} disabled={saving || !assessment.clinical_effective_at}>Hoàn tất</Button>}</div>}</div>
    {!isClosed && <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {field("Đau tự phát", draft.symptoms.spontaneous_pain, symptomOptions, (value) => onDraftChange({ ...draft, symptoms: { ...draft.symptoms, spontaneous_pain: value as EndodonticPainAssessmentPayload["symptoms"]["spontaneous_pain"] } }))}
      {field("Đau khi nhai", draft.symptoms.pain_on_biting, symptomOptions, (value) => onDraftChange({ ...draft, symptoms: { ...draft.symptoms, pain_on_biting: value as EndodonticPainAssessmentPayload["symptoms"]["pain_on_biting"] } }))}
      {field("Đau kéo dài sau kích thích", draft.symptoms.prolonged_pain_after_stimulus, symptomOptions, (value) => onDraftChange({ ...draft, symptoms: { ...draft.symptoms, prolonged_pain_after_stimulus: value as EndodonticPainAssessmentPayload["symptoms"]["prolonged_pain_after_stimulus"] } }))}
      {field("Cold test", draft.tests.cold_test, testOptions, (value) => onDraftChange({ ...draft, tests: { ...draft.tests, cold_test: value as EndodonticPainAssessmentPayload["tests"]["cold_test"] } }))}
      {field("Percussion", draft.tests.percussion, testOptions, (value) => onDraftChange({ ...draft, tests: { ...draft.tests, percussion: value as EndodonticPainAssessmentPayload["tests"]["percussion"] } }))}
      {field("Palpation", draft.tests.palpation, testOptions, (value) => onDraftChange({ ...draft, tests: { ...draft.tests, palpation: value as EndodonticPainAssessmentPayload["tests"]["palpation"] } }))}
      {field("Bite test", draft.tests.bite_test, testOptions, (value) => onDraftChange({ ...draft, tests: { ...draft.tests, bite_test: value as EndodonticPainAssessmentPayload["tests"]["bite_test"] } }))}
      {field("Sâu lớn", draft.context.large_caries, symptomOptions, (value) => onDraftChange({ ...draft, context: { ...draft.context, large_caries: value as EndodonticPainAssessmentPayload["context"]["large_caries"] } }))}
      {field("Phục hồi sâu/cũ", draft.context.deep_old_restoration, symptomOptions, (value) => onDraftChange({ ...draft, context: { ...draft.context, deep_old_restoration: value as EndodonticPainAssessmentPayload["context"]["deep_old_restoration"] } }))}
      {field("Dấu hiệu quanh chóp trên ảnh", draft.context.periapical_signs_on_imaging, imagingOptions, (value) => onDraftChange({ ...draft, context: { ...draft.context, periapical_signs_on_imaging: value as EndodonticPainAssessmentPayload["context"]["periapical_signs_on_imaging"] } }))}
      <div className="sm:col-span-2 lg:col-span-3"><Label htmlFor={`pathway-notes-${assessment.id}`}>Ghi chú</Label><Textarea id={`pathway-notes-${assessment.id}`} className="mt-1 min-h-20" value={draft.notes ?? ""} onChange={(event) => onDraftChange({ ...draft, notes: event.target.value })} disabled={!canWrite || isClosed} placeholder="Ghi chú lâm sàng bổ sung (tùy chọn)" /></div>
    </div>}
    <div className="mt-4 grid gap-4 lg:grid-cols-2"><div><p className="mb-2 text-sm font-medium">Checklist</p><div className="space-y-2">{items.map((item) => <div className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2 text-sm" key={item.id}><div><p>{item.item_key.replaceAll("_", " ")}</p>{item.skip_reason && <p className="mt-0.5 text-xs text-muted-foreground">Bỏ qua: {item.skip_reason}</p>}</div><div className="flex shrink-0 items-center gap-2"><Badge variant={item.status === "completed" ? "success" : item.status === "skipped" ? "warning" : "secondary"}>{item.status === "completed" ? "Đã xong" : item.status === "skipped" ? "Bỏ qua" : "Cần xử lý"}</Badge>{canWrite && !isClosed && item.status === "pending" && <><Button size="sm" variant="ghost" onClick={() => onUpdateItem(item, "completed")}>Đánh dấu xong</Button><Button size="sm" variant="ghost" onClick={() => onUpdateItem(item, "skipped")}>Bỏ qua</Button></>}</div></div>)}</div></div>
      <div><p className="mb-2 text-sm font-medium">Pattern cần cân nhắc</p>{patterns.length ? <div className="space-y-2">{patterns.map((pattern) => <div key={pattern.pattern_key} className={cn("rounded-lg border p-3 text-sm", pattern.priority === 0 ? "border-amber-500/40 bg-amber-500/5" : "border-cyan-500/30 bg-cyan-500/[0.03]")}><p className="font-medium">{pattern.title}</p><p className="mt-1 text-muted-foreground">{pattern.explanation}</p>{pattern.missing_item_keys.length > 0 && <p className="mt-2 text-xs text-muted-foreground">Còn thiếu: {pattern.missing_item_keys.join(", ")}</p>}<p className="mt-2 text-[11px] text-muted-foreground">{pattern.source_reference}</p></div>)}</div> : <p className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground">Chưa có pattern cần ưu tiên. Cập nhật assessment để hệ thống kiểm tra dữ liệu thiếu hoặc mâu thuẫn.</p>}</div>
    </div>
  </div>;
}

function parsePayload(value: string): EndodonticPainAssessmentPayload {
  try { return JSON.parse(value) as EndodonticPainAssessmentPayload; }
  catch { return blankAssessment(); }
}
