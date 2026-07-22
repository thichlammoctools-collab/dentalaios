import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogBody, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { VoiceInputButton } from "@/components/VoiceInputButton";
import { apiPost, ApiError } from "@/lib/api";
import { toast } from "@/lib/toast";
import type { ClinicalFinding, FindingCategory, FindingScope } from "@shared/types";
import { CLINICAL_FINDING_CATEGORIES, getFindingConditionLabel } from "@shared/constants/clinical-findings";
import { cn } from "@/lib/utils";

interface ParsedFinding {
  category: FindingCategory;
  scope: FindingScope;
  tooth_number: number | null;
  anatomical_site?: string;
  condition: string;
  notes: string;
}

interface VoiceFindingsResult {
  findings: ParsedFinding[];
  ai_model: string;
  generated_at: string;
}

interface VoiceFindingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  visitId: string;
  onSaved: (findings: ClinicalFinding[]) => void;
}

function conditionOptions(category: FindingCategory) { return CLINICAL_FINDING_CATEGORIES.find((item) => item.value === category)?.conditions ?? []; }

export function VoiceFindingsDialog({ open, onOpenChange, visitId, onSaved }: VoiceFindingsDialogProps) {
  const [transcript, setTranscript] = useState("");
  const [parsedFindings, setParsedFindings] = useState<ParsedFinding[]>([]);
  const [analyzing, setAnalyzing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [manualEntry, setManualEntry] = useState("");

  function handleTranscription(text: string) {
    setTranscript(text);
    analyzeText(text);
  }

  async function analyzeText(text: string) {
    setAnalyzing(true);
    setParsedFindings([]);
    try {
      const result = await apiPost<VoiceFindingsResult>("/api/ai/voice-findings", {
        visit_id: visitId,
        transcript: text,
      });
      setParsedFindings(result.findings);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Lỗi phân tích giọng nói");
      setParsedFindings([]);
    } finally {
      setAnalyzing(false);
    }
  }

  async function onSave() {
    if (parsedFindings.length === 0) return;
    setSaving(true);
    try {
      const saved: ClinicalFinding[] = [];
      for (const f of parsedFindings) {
        const created = await apiPost<ClinicalFinding>(`/api/visits/${visitId}/findings`, {
          category: f.category,
          tooth_number: f.tooth_number,
          scope: f.scope,
          anatomical_site: f.anatomical_site as ClinicalFinding["anatomical_site"],
          condition: f.condition,
          notes: f.notes || undefined,
        });
        saved.push(created);
      }
      toast.success(`Đã lưu ${saved.length} findings`);
      onSaved(saved);
      handleClose();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Lỗi lưu findings");
    } finally {
      setSaving(false);
    }
  }

  function handleClose() {
    setTranscript("");
    setParsedFindings([]);
    setAnalyzing(false);
    setEditingIdx(null);
    setManualEntry("");
    onOpenChange(false);
  }

  function removeFinding(idx: number) {
    setParsedFindings((prev) => prev.filter((_, i) => i !== idx));
  }

  function updateFinding(idx: number, field: keyof ParsedFinding, value: string | number | null) {
    setParsedFindings((prev) =>
      prev.map((f, i) => (i === idx ? { ...f, [field]: value } : f)),
    );
  }

  function addManualEntry() {
    if (!manualEntry.trim()) return;
    analyzeText(manualEntry.trim());
    setManualEntry("");
  }

  const scopeVariant = (scope: string) => {
    if (scope === "full_mouth") return "bg-orange-100 dark:bg-orange-950 text-orange-700 dark:text-orange-300 border-orange-200 dark:border-orange-800";
    if (scope === "region") return "bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800";
    return "bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700";
  };

  const scopeLabel = (scope: string) => {
    if (scope === "full_mouth") return "Toàn miệng";
    if (scope === "region") return "Vùng";
    return "Răng";
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogHeader>
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-500 to-blue-600 shadow-lg">
            <svg className="h-5 w-5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
            </svg>
          </div>
          <div>
            <DialogTitle>Nhập findings bằng giọng nói</DialogTitle>
            <p className="text-xs text-muted-foreground mt-0.5">AI phân tích &amp; tạo findings, bác sĩ duyệt lại</p>
          </div>
        </div>
      </DialogHeader>

      <DialogBody className="space-y-4">
        {/* Step 1: Voice input */}
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-medium">Bước 1 — Ghi âm hoặc nhập text</p>
            <VoiceInputButton
              onTranscription={handleTranscription}
              label="Ghi âm"
            />
          </div>
          {transcript ? (
            <div className="rounded-lg bg-blue-50 dark:bg-blue-950/50 border border-blue-200 dark:border-blue-800 p-3">
              <p className="text-xs font-medium text-blue-600 dark:text-blue-400 mb-1">Bản ghi:</p>
              <p className="text-sm text-zinc-800 dark:text-zinc-200 italic">"{transcript}"</p>
            </div>
          ) : (
            <div className="space-y-2">
              <Textarea
                rows={2}
                value={manualEntry}
                onChange={(e) => setManualEntry(e.target.value)}
                placeholder="Hoặc nhập text thủ công và nhấn Phân tích…"
                className="text-sm"
              />
              {manualEntry.trim() && (
                <Button size="sm" onClick={addManualEntry} variant="outline" className="text-xs">
                  Phân tích text
                </Button>
              )}
            </div>
          )}
        </div>

        {/* Step 2: Analyzing */}
        {analyzing && (
          <div className="rounded-xl border border-cyan-200 dark:border-cyan-800 bg-gradient-to-r from-cyan-50 to-blue-50 dark:from-cyan-950/50 dark:to-blue-950/50 p-6 flex flex-col items-center gap-3">
            <div className="relative">
              <div className="h-12 w-12 rounded-full border-4 border-cyan-100 dark:border-cyan-900" />
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="h-8 w-8 animate-spin rounded-full border-4 border-cyan-500 border-t-transparent" />
              </div>
            </div>
            <div className="text-center">
              <p className="font-medium text-sm text-cyan-800 dark:text-cyan-300">AI đang phân tích…</p>
              <p className="text-xs text-cyan-600 dark:text-cyan-500 mt-0.5">Chuyển đổi giọng nói thành clinical findings</p>
            </div>
          </div>
        )}

        {/* Step 2: Parsed findings */}
        {parsedFindings.length > 0 && !analyzing && (
          <div className="rounded-xl border border-border bg-card p-4">
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-medium">
                Bước 2 — Findings đã phân tích ({parsedFindings.length})
              </p>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => analyzeText(transcript)}
                className="text-xs text-muted-foreground"
              >
                Phân tích lại
              </Button>
            </div>
            <p className="text-xs text-muted-foreground mb-3">
              Kiểm tra &amp; chỉnh sửa findings trước khi lưu. Bác sĩ chịu trách nhiệm duyệt.
            </p>
            <div className="space-y-2 max-h-72 overflow-y-auto">
              {parsedFindings.map((f, idx) => {
                const isEditing = editingIdx === idx;
                return (
                  <div
                    key={idx}
                    className={cn(
                      "rounded-lg border p-3 transition-colors",
                      isEditing
                        ? "border-primary bg-primary/5"
                        : "border-border bg-background hover:border-primary/30",
                    )}
                  >
                    {/* Header row */}
                    <div className="flex items-center gap-2 mb-2">
                      <span className={cn("inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium", scopeVariant(f.scope))}>
                        {f.scope === "tooth" ? `Răng #${f.tooth_number}` : CLINICAL_FINDING_CATEGORIES.find((item) => item.value === f.category)?.label ?? scopeLabel(f.scope)}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {getFindingConditionLabel(f.category, f.condition)}
                      </span>
                      <div className="ml-auto flex gap-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-6 px-2 text-xs"
                          onClick={() => setEditingIdx(isEditing ? null : idx)}
                        >
                          {isEditing ? "Xong" : "Sửa"}
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-6 px-2 text-xs text-red-500 hover:text-red-600"
                          onClick={() => removeFinding(idx)}
                        >
                          Xóa
                        </Button>
                      </div>
                    </div>

                    {/* Editable fields */}
                    {isEditing && (
                      <div className="space-y-2 pt-2 border-t border-border/50">
                        {/* Scope */}
                        <div className="grid grid-cols-3 gap-2">
                          <div className="grid gap-1">
                            <label className="text-xs text-muted-foreground">Nhóm khám</label>
                            <select
                              value={f.category}
                              onChange={(e) => {
                                const next = CLINICAL_FINDING_CATEGORIES.find((item) => item.value === e.target.value);
                                if (!next) return;
                                setParsedFindings((prev) => prev.map((finding, findingIndex) => findingIndex === idx ? {
                                  ...finding,
                                  category: next.value,
                                  scope: next.scope,
                                  tooth_number: next.scope === "tooth" ? finding.tooth_number : null,
                                  anatomical_site: next.defaultSite,
                                  condition: next.conditions[0].value,
                                } : finding));
                              }}
                              className="h-8 rounded-md border border-input bg-background px-2 text-xs"
                            >
                              {CLINICAL_FINDING_CATEGORIES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                            </select>
                          </div>
                          {f.scope === "tooth" && (
                            <div className="grid gap-1">
                              <label className="text-xs text-muted-foreground">Số răng FDI</label>
                              <Input
                                type="number"
                                min={1}
                                max={88}
                                value={f.tooth_number ?? ""}
                                onChange={(e) => updateFinding(idx, "tooth_number", e.target.value ? Number(e.target.value) : null)}
                                className="h-8 text-xs"
                              />
                            </div>
                          )}
                        </div>
                        {/* Condition */}
                        <div className="grid gap-1">
                          <label className="text-xs text-muted-foreground">Tình trạng</label>
                          <select
                            value={f.condition}
                            onChange={(e) => updateFinding(idx, "condition", e.target.value)}
                            className="h-8 rounded-md border border-input bg-background px-2 text-xs"
                          >
                            {conditionOptions(f.category).map((c) => (
                              <option key={c.value} value={c.value}>{c.label}</option>
                            ))}
                          </select>
                        </div>
                        {/* Notes */}
                        <div className="grid gap-1">
                          <label className="text-xs text-muted-foreground">Ghi chú</label>
                          <Textarea
                            rows={2}
                            value={f.notes}
                            onChange={(e) => updateFinding(idx, "notes", e.target.value)}
                            placeholder="Mô tả thêm…"
                            className="text-xs"
                          />
                        </div>
                      </div>
                    )}
                    {/* Notes preview */}
                    {!isEditing && f.notes && (
                      <p className="text-xs text-muted-foreground italic mt-1">— {f.notes}</p>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Add manual finding */}
            <Button
              variant="outline"
              size="sm"
              className="mt-3 w-full text-xs border-dashed"
              onClick={() =>
                setParsedFindings((prev) => [
                  ...prev,
                  { category: "tooth_hard_tissue", scope: "tooth", tooth_number: null, condition: "caries", notes: "" },
                ])
              }
            >
              + Thêm findings thủ công
            </Button>
          </div>
        )}

        {/* Empty state */}
        {!transcript && !analyzing && parsedFindings.length === 0 && (
          <div className="rounded-xl border border-dashed border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900 py-8 flex flex-col items-center gap-2 text-center">
            <svg className="h-8 w-8 text-zinc-300 dark:text-zinc-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
            </svg>
            <p className="text-sm text-zinc-500 dark:text-zinc-400">Nhấn <strong>Ghi âm</strong> hoặc nhập text để bắt đầu</p>
            <p className="text-xs text-zinc-400 dark:text-zinc-600">AI sẽ phân tích và tạo clinical findings cho bạn duyệt</p>
          </div>
        )}
      </DialogBody>

      <DialogFooter>
        <Button variant="outline" onClick={handleClose}>Hủy</Button>
        <Button
          onClick={onSave}
          disabled={parsedFindings.length === 0 || saving}
          className="bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-700 hover:to-blue-700 text-white shadow-md"
        >
          {saving ? (
            <>
              <div className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
              Đang lưu…
            </>
          ) : (
            <>
              <svg className="mr-1.5 h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
              Lưu {parsedFindings.length > 0 ? `(${parsedFindings.length})` : ""} Findings
            </>
          )}
        </Button>
      </DialogFooter>
    </Dialog>
  );
}
