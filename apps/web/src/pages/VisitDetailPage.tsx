import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { VisitForm } from "@/components/VisitForm";
import { FdiToothChart } from "@/components/FdiToothChart";
import { FindingsList } from "@/components/FindingsList";
import { Dialog, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { apiGet, apiPost, ApiError } from "@/lib/api";
import { toast } from "@/lib/toast";
import { formatDateTime } from "@/lib/utils";
import type { Visit, ClinicalFinding, TreatmentPlan, GeneratePlanResult, GeneratePlanItemDraft } from "@shared/types";

interface SummarizeResult {
  summary: string;
  ai_model: string;
  generated_at: string;
}

interface EditableItem {
  id: string; // local temp id
  tooth: number | null; // null = full-mouth procedure
  procedure: string;
  description: string;
  cost: number;
}

function parseSummary(text: string): { type: "h2" | "p" | "li"; content: string }[] {
  const lines = text.split("\n");
  const blocks: { type: "h2" | "p" | "li"; content: string }[] = [];
  let listBuffer: string[] = [];

  function flushList() {
    if (listBuffer.length) {
      listBuffer.forEach((l) => blocks.push({ type: "li", content: l }));
      listBuffer = [];
    }
  }

  for (const raw of lines) {
    const line = raw.trimEnd();
    if (!line.trim()) { flushList(); continue; }
    if (line.startsWith("## ")) {
      flushList();
      blocks.push({ type: "h2", content: line.slice(3) });
    } else if (line.startsWith("- ") || line.startsWith("• ")) {
      listBuffer.push(line.slice(2).trim());
    } else {
      flushList();
      if (line) blocks.push({ type: "p", content: line });
    }
  }
  flushList();
  return blocks;
}

function SummaryBlock({ blocks }: { blocks: { type: "h2" | "p" | "li"; content: string }[] }) {
  return (
    <div className="space-y-1.5">
      {blocks.map((b, i) => {
        if (b.type === "h2") return (
          <p key={i} className="mt-3 mb-1 text-xs font-semibold uppercase tracking-wider text-primary first:mt-0">
            {b.content}
          </p>
        );
        if (b.type === "li") return (
          <p key={i} className="pl-3 text-sm leading-relaxed text-foreground before:mr-2 before:text-muted-foreground before:content-['–']">
            {b.content}
          </p>
        );
        return (
          <p key={i} className="text-sm leading-relaxed text-foreground/80">
            {b.content}
          </p>
        );
      })}
    </div>
  );
}

const PROCEDURE_OPTIONS = [
  { value: "examination", label: "Khám và chẩn đoán" },
  { value: "filling", label: "Trám răng" },
  { value: "root_canal", label: "Điều trị tủy" },
  { value: "extraction", label: "Nhổ răng" },
  { value: "crown", label: "Bọc mão răng" },
  { value: "scaling", label: "Cạo vôi răng" },
  { value: "implant", label: "Cấy ghép implant" },
  { value: "bridge", label: "Cầu răng sứ" },
  { value: "veneer", label: "Dán sứ veneer" },
  { value: "fluoride", label: "Tẩy trắng fluoride" },
  { value: "other", label: "Khác" },
];

function procedureLabel(v: string) {
  return PROCEDURE_OPTIONS.find((o) => o.value === v)?.label ?? v;
}

export function VisitDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [visit, setVisit] = useState<Visit | null>(null);
  const [findings, setFindings] = useState<ClinicalFinding[]>([]);
  const [loading, setLoading] = useState(true);

  // AI summarize
  const [summarizing, setSummarizing] = useState(false);
  const [summaryResult, setSummaryResult] = useState<SummarizeResult | null>(null);
  const [summaryDialogOpen, setSummaryDialogOpen] = useState(false);

  // AI generate plan
  const [generatingPlan, setGeneratingPlan] = useState(false);
  const [planResult, setPlanResult] = useState<GeneratePlanResult | null>(null);
  const [planDialogOpen, setPlanDialogOpen] = useState(false);
  const [editableItems, setEditableItems] = useState<EditableItem[]>([]);
  const [planNotes, setPlanNotes] = useState("");
  const [savingPlan, setSavingPlan] = useState(false);

  async function load() {
    if (!id) return;
    setLoading(true);
    try {
      const [v, f] = await Promise.all([
        apiGet<Visit>(`/api/visits/${id}`),
        apiGet<{ items: ClinicalFinding[] }>(`/api/visits/${id}/findings`),
      ]);
      setVisit(v);
      setFindings(f.items);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Lỗi tải visit");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [id]);

  async function onCreatePlan() {
    if (!visit) return;
    try {
      const created = await apiPost<TreatmentPlan>("/api/treatment-plans", {
        visit_id: visit.id,
        patient_id: visit.patient_id,
        currency: "VND",
      });
      toast.success("Đã tạo kế hoạch điều trị");
      navigate(`/treatment-plans/${created.id}`);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Lỗi tạo plan");
    }
  }

  async function onSummarize() {
    if (!visit) return;
    setSummarizing(true);
    setSummaryResult(null);
    setSummaryDialogOpen(true);
    try {
      const result = await apiPost<SummarizeResult>("/api/ai/summarize", {
        visit_id: visit.id,
      });
      setSummaryResult(result);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Lỗi tạo tóm tắt AI");
      setSummaryDialogOpen(false);
    } finally {
      setSummarizing(false);
    }
  }

  async function onGeneratePlan() {
    if (!visit) return;
    setGeneratingPlan(true);
    setPlanResult(null);
    setPlanDialogOpen(true);
    setEditableItems([]);
    setPlanNotes("");
    try {
      const result = await apiPost<GeneratePlanResult>("/api/ai/generate-plan", {
        visit_id: visit.id,
      });
      setPlanResult(result);
      setEditableItems(result.items.map((item, idx) => ({
        id: `temp-${idx}`,
        tooth: item.tooth,
        procedure: item.procedure,
        description: item.description,
        cost: item.cost,
      })));
      setPlanNotes(result.notes);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Lỗi tạo kế hoạch AI");
      setPlanDialogOpen(false);
    } finally {
      setGeneratingPlan(false);
    }
  }

  async function onSavePlan() {
    if (!visit) return;
    setSavingPlan(true);
    try {
      const plan = await apiPost<TreatmentPlan>("/api/treatment-plans", {
        visit_id: visit.id,
        patient_id: visit.patient_id,
        currency: "VND",
      });

      for (const item of editableItems) {
        await apiPost("/api/treatment-plans/items", {
          plan_id: plan.id,
          tooth_number: item.tooth,
          procedure: item.procedure,
          description: item.description,
          unit_cost: item.cost,
          currency: "VND",
          status: "proposed",
        });
      }

      toast.success("Đã tạo kế hoạch điều trị từ AI");
      setPlanDialogOpen(false);
      navigate(`/treatment-plans/${plan.id}`);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Lỗi lưu kế hoạch");
    } finally {
      setSavingPlan(false);
    }
  }

  function addItem() {
    setEditableItems((prev) => [
      ...prev,
      { id: `temp-${Date.now()}`, tooth: 0, procedure: "examination", description: "", cost: 0 },
    ]);
  }

  function removeItem(id: string) {
    setEditableItems((prev) => prev.filter((i) => i.id !== id));
  }

  function updateItem(id: string, field: keyof EditableItem, value: string | number) {
    setEditableItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, [field]: value } : item))
    );
  }

  const totalCost = editableItems.reduce((sum, item) => sum + (item.cost || 0), 0);

  if (loading || !visit) {
    return <p className="px-6 py-6 text-sm text-muted-foreground">Đang tải…</p>;
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-6 py-6">
      {/* Header */}
      <div>
        <p className="text-sm text-muted-foreground">
          <a href={`/patients/${visit.patient_id}`} className="hover:underline">
            ← Quay lại bệnh nhân
          </a>
        </p>
        <div className="mt-1 flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Lượt khám</h1>
            <p className="text-sm text-muted-foreground">{formatDateTime(visit.date)}</p>
          </div>
          <Badge
            variant={
              visit.status === "completed"
                ? "success"
                : visit.status === "cancelled"
                  ? "destructive"
                  : "warning"
            }
          >
            {visit.status}
          </Badge>
        </div>
      </div>

      {/* FDI Chart */}
      <Card>
        <CardHeader>
          <CardTitle>Sơ đồ răng FDI</CardTitle>
        </CardHeader>
        <CardContent>
          <FdiToothChart
            visitId={visit.id}
            findings={findings}
            onCreated={(f) => setFindings((prev) => [...prev, f])}
          />
        </CardContent>
      </Card>

      {/* Findings */}
      <Card>
        <CardHeader>
          <CardTitle>Clinical Findings ({findings.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <FindingsList
            visitId={visit.id}
            findings={findings}
            onUpdate={(updated) =>
              setFindings((prev) => prev.map((f) => (f.id === updated.id ? updated : f)))
            }
          />
        </CardContent>
      </Card>

      {/* Actions */}
      <Card>
        <CardHeader>
          <CardTitle>Thao tác</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button onClick={onCreatePlan}>+ Tạo kế hoạch điều trị</Button>
          <Button variant="outline" onClick={onSummarize} disabled={summarizing}>
            {summarizing ? "Đang tạo tóm tắt…" : "🤖 Tóm tắt AI"}
          </Button>
          <Button variant="secondary" onClick={onGeneratePlan} disabled={generatingPlan}>
            {generatingPlan ? "AI đang tạo kế hoạch…" : "🤖 Tạo kế hoạch AI"}
          </Button>
        </CardContent>
      </Card>

      {/* AI Summary Dialog */}
      <Dialog open={summaryDialogOpen} onOpenChange={setSummaryDialogOpen}>
        <DialogHeader>
          <DialogTitle>Tóm tắt bệnh án</DialogTitle>
        </DialogHeader>

        <div className="mt-4">
          {summarizing ? (
            <div className="flex items-center gap-3 py-10 justify-center">
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-muted border-t-primary" />
              <span className="text-sm text-muted-foreground">AI đang tạo tóm tắt…</span>
            </div>
          ) : summaryResult ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between rounded-lg border border-border bg-muted/40 px-3 py-2">
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary">
                    <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                    </svg>
                    {summaryResult.ai_model === "llama-3.1-8b-instruct" ? "AI Cloudflare" : "Tóm tắt cấu trúc"}
                  </span>
                </div>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(summaryResult.summary);
                    toast.success("Đã copy vào bộ nhớ tạm");
                  }}
                  className="inline-flex items-center gap-1.5 rounded-md border border-input bg-background px-2.5 py-1 text-xs font-medium text-muted-foreground shadow-sm transition-colors hover:bg-muted hover:text-foreground"
                >
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                  Copy
                </button>
              </div>
              <div className="rounded-xl border border-border bg-white p-5 shadow-sm">
                <SummaryBlock blocks={parseSummary(summaryResult.summary)} />
              </div>
            </div>
          ) : null}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setSummaryDialogOpen(false)}>
            Đóng
          </Button>
        </DialogFooter>
      </Dialog>

      {/* AI Generate Plan Dialog */}
      <Dialog open={planDialogOpen} onOpenChange={setPlanDialogOpen}>
        <DialogHeader>
          <DialogTitle>Tạo kế hoạch điều trị bằng AI</DialogTitle>
        </DialogHeader>

        <div className="mt-4">
          {generatingPlan ? (
            <div className="flex items-center gap-3 py-10 justify-center">
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-muted border-t-primary" />
              <span className="text-sm text-muted-foreground">AI đang phân tích clinical findings…</span>
            </div>
          ) : planResult ? (
            <div className="space-y-4">
              {/* Model badge */}
              <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2">
                <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary">
                  <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                  </svg>
                  {planResult.ai_model === "llama-3.1-8b-instruct" ? "AI Cloudflare" : "Gợi ý cấu trúc"}
                </span>
                <span className="text-xs text-muted-foreground">
                  {new Date(planResult.generated_at).toLocaleTimeString("vi-VN")}
                </span>
              </div>

              {/* Items table */}
              {editableItems.length > 0 ? (
                <div className="rounded-xl border border-border overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border bg-muted/30">
                        <th className="px-3 py-2 text-left font-medium text-muted-foreground w-16">Răng</th>
                        <th className="px-3 py-2 text-left font-medium text-muted-foreground">Thủ thuật</th>
                        <th className="px-3 py-2 text-left font-medium text-muted-foreground">Mô tả</th>
                        <th className="px-3 py-2 text-right font-medium text-muted-foreground w-32">Chi phí (VND)</th>
                        <th className="w-10"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {editableItems.map((item) => (
                        <tr key={item.id} className="border-b border-border last:border-0">
                          <td className="px-3 py-2">
                            <Input
                              type="number"
                              value={item.tooth ?? ""}
                              onChange={(e) => updateItem(item.id, "tooth", e.target.value === "" ? null : Number(e.target.value))}
                              className="h-8 w-16 text-center"
                              min={1} max={88}
                              placeholder="*"
                              title="Để trống = toàn hàm"
                            />
                          </td>
                          <td className="px-3 py-2">
                            <select
                              value={item.procedure}
                              onChange={(e) => updateItem(item.id, "procedure", e.target.value)}
                              className="h-8 w-full rounded-md border border-input bg-background px-2 text-xs"
                            >
                              {PROCEDURE_OPTIONS.map((o) => (
                                <option key={o.value} value={o.value}>{o.label}</option>
                              ))}
                            </select>
                          </td>
                          <td className="px-3 py-2">
                            <Input
                              value={item.description}
                              onChange={(e) => updateItem(item.id, "description", e.target.value)}
                              className="h-8 text-xs"
                              placeholder="Mô tả điều trị"
                            />
                          </td>
                          <td className="px-3 py-2">
                            <Input
                              type="number"
                              value={item.cost || ""}
                              onChange={(e) => updateItem(item.id, "cost", Number(e.target.value))}
                              className="h-8 text-right text-xs"
                              placeholder="0"
                            />
                          </td>
                          <td className="px-3 py-2 text-center">
                            <button
                              onClick={() => removeItem(item.id)}
                              className="text-muted-foreground hover:text-destructive"
                            >
                              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                              </svg>
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="rounded-xl border border-border bg-muted/20 p-6 text-center text-sm text-muted-foreground">
                  Không có clinical findings để tạo kế hoạch
                </div>
              )}

              {/* Notes */}
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">Ghi chú</label>
                <textarea
                  value={planNotes}
                  onChange={(e) => setPlanNotes(e.target.value)}
                  className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm resize-none"
                  rows={2}
                  placeholder="Ghi chú cho kế hoạch điều trị"
                />
              </div>

              {/* Total */}
              <div className="flex items-center justify-between rounded-lg border border-border bg-muted/30 px-4 py-3">
                <span className="text-sm font-medium text-muted-foreground">Tổng chi phí ước tính</span>
                <span className="text-base font-semibold text-foreground">
                  {totalCost.toLocaleString("vi-VN")} VND
                </span>
              </div>

              {/* Add item */}
              <button
                onClick={addItem}
                className="w-full rounded-lg border-2 border-dashed border-border py-2 text-sm text-muted-foreground hover:border-primary hover:text-primary transition-colors"
              >
                + Thêm thủ thuật
              </button>
            </div>
          ) : null}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setPlanDialogOpen(false)}>
            Hủy
          </Button>
          <Button
            onClick={onSavePlan}
            disabled={savingPlan || editableItems.length === 0}
          >
            {savingPlan ? "Đang lưu…" : "Lưu kế hoạch điều trị"}
          </Button>
        </DialogFooter>
      </Dialog>
    </div>
  );
}
