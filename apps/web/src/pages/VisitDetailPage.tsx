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
  id: string;
  tooth: number;
  procedure: string;
  description: string;
  cost: number;
}

const PROCEDURE_OPTIONS = [
  { value: "examination", label: "Khám & chẩn đoán" },
  { value: "filling", label: "Trám răng" },
  { value: "root_canal", label: "Điều trị tủy" },
  { value: "extraction", label: "Nhổ răng" },
  { value: "crown", label: "Bọc mão răng" },
  { value: "scaling", label: "Cạo vôi răng" },
  { value: "implant", label: "Cấy ghép implant" },
  { value: "bridge", label: "Cầu răng sứ" },
  { value: "veneer", label: "Dán sứ veneer" },
  { value: "fluoride", label: "Tráng răng fluoride" },
  { value: "other", label: "Điều trị khác" },
];

const PROCEDURE_COLORS: Record<string, string> = {
  examination: "bg-slate-100 text-slate-700",
  filling: "bg-blue-100 text-blue-700",
  root_canal: "bg-purple-100 text-purple-700",
  extraction: "bg-red-100 text-red-700",
  crown: "bg-amber-100 text-amber-700",
  scaling: "bg-teal-100 text-teal-700",
  implant: "bg-green-100 text-green-700",
  bridge: "bg-orange-100 text-orange-700",
  veneer: "bg-pink-100 text-pink-700",
  fluoride: "bg-cyan-100 text-cyan-700",
  other: "bg-gray-100 text-gray-700",
};

function procedureLabel(v: string) {
  return PROCEDURE_OPTIONS.find((o) => o.value === v)?.label ?? v;
}

// ─── Summary parse & render ────────────────────────────────────

interface SummarySection {
  type: "patient" | "visit" | "findings" | "plan" | "notes" | "empty";
  label: string;
  items?: { label: string; value: string; accent?: boolean }[];
  text?: string;
}

function parseSummary(raw: string): SummarySection[] {
  const sections: SummarySection[] = [];
  const lines = raw.split("\n");
  let i = 0;

  while (i < lines.length) {
    const line = lines[i].trimEnd();
    if (!line.trim()) { i++; continue; }

    if (line.startsWith("## ") || line.startsWith("##")) {
      const label = line.replace(/^##\s*/, "").trim();
      const key = label.toLowerCase().normalize("NFC");

      if (key.includes("nhân") || key.includes("benh nhan") || key.includes("patient")) {
        // Patient block — collect next non-empty lines until blank or next ##
        const items: SummarySection["items"] = [];
        i++;
        while (i < lines.length && lines[i].trim() && !lines[i].startsWith("##")) {
          const part = lines[i].trim();
          const colonIdx = part.indexOf(":");
          if (colonIdx !== -1) {
            items.push({ label: part.slice(0, colonIdx).trim(), value: part.slice(colonIdx + 1).trim() });
          } else {
            items.push({ label: "", value: part });
          }
          i++;
        }
        sections.push({ type: "patient", label, items });
      } else if (key.includes("khám") || key.includes("luot kham") || key.includes("luợt khám") || key.includes("visit")) {
        const items: SummarySection["items"] = [];
        i++;
        while (i < lines.length && lines[i].trim() && !lines[i].startsWith("##")) {
          const part = lines[i].trim();
          const colonIdx = part.indexOf(":");
          if (colonIdx !== -1) {
            const lbl = part.slice(0, colonIdx).trim();
            const val = part.slice(colonIdx + 1).trim();
            const isStatus = lbl.toLowerCase().normalize("NFC").includes("trạng thái") || lbl.toLowerCase().includes("status");
            items.push({ label: lbl, value: val, accent: isStatus });
          } else {
            items.push({ label: "", value: part });
          }
          i++;
        }
        sections.push({ type: "visit", label, items });
      } else if (key.includes("finding") || key.includes("clinical") || key.includes("phát hiện") || key.includes("lâm sàng")) {
        const items: SummarySection["items"] = [];
        i++;
        while (i < lines.length && lines[i].trim() && !lines[i].startsWith("##")) {
          const part = lines[i].trim().replace(/^-\s*/, "").replace(/^•\s*/, "");
          const colonIdx = part.indexOf(":");
          if (colonIdx !== -1) {
            items.push({ label: part.slice(0, colonIdx).trim(), value: part.slice(colonIdx + 1).trim() });
          } else {
            items.push({ label: "", value: part });
          }
          i++;
        }
        sections.push({ type: "findings", label, items });
      } else if (key.includes("kế hoạch") || key.includes("plan") || key.includes("điều trị")) {
        const items: SummarySection["items"] = [];
        i++;
        while (i < lines.length && lines[i].trim() && !lines[i].startsWith("##")) {
          const part = lines[i].trim().replace(/^-\s*/, "").replace(/^•\s*/, "");
          items.push({ label: "", value: part });
          i++;
        }
        sections.push({ type: "plan", label, items });
      } else {
        // Generic notes block
        const items: SummarySection["items"] = [];
        i++;
        while (i < lines.length && lines[i].trim() && !lines[i].startsWith("##")) {
          items.push({ label: "", value: lines[i].trim() });
          i++;
        }
        sections.push({ type: "notes", label, items });
      }
    } else {
      i++;
    }
  }

  return sections;
}

// ─── Components ────────────────────────────────────────────────

function SummaryPatientCard({ items }: { items: SummarySection["items"] }) {
  return (
    <div className="overflow-hidden rounded-xl border border-blue-200 bg-gradient-to-br from-blue-50 to-white shadow-sm">
      <div className="bg-gradient-to-r from-blue-600 to-blue-500 px-4 py-2.5">
        <p className="text-xs font-semibold uppercase tracking-wider text-blue-100">Thông tin bệnh nhân</p>
      </div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-2 p-4">
        {items?.map((item, idx) => (
          <div key={idx} className="flex items-start gap-2">
            {item.label && <span className="text-xs text-blue-500 font-medium shrink-0">{item.label}:</span>}
            <span className="text-sm font-medium text-gray-800">{item.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function SummaryVisitCard({ items }: { items: SummarySection["items"] }) {
  return (
    <div className="overflow-hidden rounded-xl border border-violet-200 bg-white shadow-sm">
      <div className="bg-gradient-to-r from-violet-600 to-violet-500 px-4 py-2.5">
        <p className="text-xs font-semibold uppercase tracking-wider text-violet-100">Lượt khám</p>
      </div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-2 p-4">
        {items?.map((item, idx) => (
          <div key={idx} className="flex items-start gap-2">
            {item.label && <span className="text-xs text-violet-500 font-medium shrink-0">{item.label}:</span>}
            <span className={`text-sm ${item.accent ? "font-semibold text-amber-600" : "font-medium text-gray-800"}`}>{item.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function SummaryFindingsCard({ items, label }: { items: SummarySection["items"]; label: string }) {
  const count = items?.length ?? 0;
  return (
    <div className="overflow-hidden rounded-xl border border-teal-200 bg-white shadow-sm">
      <div className="bg-gradient-to-r from-teal-600 to-teal-500 px-4 py-2.5 flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wider text-teal-100">{label}</p>
        <span className="rounded-full bg-white/20 px-2.5 py-0.5 text-xs font-bold text-white">{count}</span>
      </div>
      <div className="divide-y divide-teal-100">
        {items?.map((item, idx) => {
          const colonIdx = item.value.indexOf(":");
          const hasColon = colonIdx !== -1;
          const tooth = hasColon ? item.value.slice(0, colonIdx).trim() : item.value.trim();
          const restStr = hasColon ? item.value.slice(colonIdx + 1).trim() : "";
          return (
            <div key={idx} className="flex items-center gap-3 px-4 py-3 hover:bg-teal-50 transition-colors">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-teal-100 text-sm font-bold text-teal-700">
                {tooth}
              </span>
              <div className="flex-1 min-w-0">
                {restStr ? (
                  <p className="text-sm font-medium text-gray-800 truncate">{restStr}</p>
                ) : (
                  <p className="text-sm font-medium text-gray-800 truncate">{tooth}</p>
                )}
              </div>
            </div>
          );
        })}
        {!items?.length && (
          <p className="px-4 py-3 text-sm text-gray-400 italic">Không có dữ liệu</p>
        )}
      </div>
    </div>
  );
}

function SummaryPlanCard({ items, label }: { items: SummarySection["items"]; label: string }) {
  return (
    <div className="overflow-hidden rounded-xl border border-amber-200 bg-white shadow-sm">
      <div className="bg-gradient-to-r from-amber-600 to-amber-500 px-4 py-2.5">
        <p className="text-xs font-semibold uppercase tracking-wider text-amber-100">{label}</p>
      </div>
      <div className="divide-y divide-amber-100">
        {items?.map((item, idx) => (
          <div key={idx} className="flex items-start gap-3 px-4 py-3">
            <span className="flex h-6 w-6 shrink-0 mt-0.5 items-center justify-center rounded-full bg-amber-100 text-xs font-bold text-amber-700">
              {idx + 1}
            </span>
            <p className="flex-1 text-sm text-gray-700 leading-relaxed">{item.value}</p>
          </div>
        ))}
        {!items?.length && (
          <p className="px-4 py-3 text-sm text-gray-400 italic">Không có kế hoạch</p>
        )}
      </div>
    </div>
  );
}

function SummaryNotesCard({ items }: { items: SummarySection["items"] }) {
  return (
    <div className="rounded-xl border border-indigo-200 bg-indigo-50 p-4 shadow-sm">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-indigo-500">Ghi chú</p>
      {items?.map((item, idx) => (
        <p key={idx} className="text-sm text-gray-700 leading-relaxed">{item.value}</p>
      ))}
    </div>
  );
}

// ─── Main Page ─────────────────────────────────────────────────

export function VisitDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [visit, setVisit] = useState<Visit | null>(null);
  const [findings, setFindings] = useState<ClinicalFinding[]>([]);
  const [loading, setLoading] = useState(true);

  const [summarizing, setSummarizing] = useState(false);
  const [summaryResult, setSummaryResult] = useState<SummarizeResult | null>(null);
  const [summaryDialogOpen, setSummaryDialogOpen] = useState(false);

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
      toast.error(err instanceof ApiError ? err.message : "Loi tao plan");
    }
  }

  async function onSummarize() {
    if (!visit) return;
    setSummarizing(true);
    setSummaryResult(null);
    setSummaryDialogOpen(true);
    try {
      const result = await apiPost<SummarizeResult>("/api/ai/summarize", { visit_id: visit.id });
      setSummaryResult(result);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Ọi tạo tóm tắt AI");
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
      const result = await apiPost<GeneratePlanResult>("/api/ai/generate-plan", { visit_id: visit.id });
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
      toast.error(err instanceof ApiError ? err.message : "Loi tao kế hoạch AI");
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
      toast.success("Da tao kế hoạch điều trị tu AI");
      setPlanDialogOpen(false);
      navigate(`/treatment-plans/${plan.id}`);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Loi luu kế hoạch");
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
  const sections = summaryResult ? parseSummary(summaryResult.summary) : [];

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
              visit.status === "completed" ? "success" : visit.status === "cancelled" ? "destructive" : "warning"
            }
          >
            {visit.status}
          </Badge>
        </div>
        {(visit.treating_clinician_name || visit.assistant_name) && (
          <div className="mt-2 flex flex-wrap gap-4 text-sm">
            {visit.treating_clinician_name && (
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-muted-foreground">Bs điều trị:</span>
                <span className="font-medium">{visit.treating_clinician_name}</span>
              </div>
            )}
            {visit.assistant_name && (
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-muted-foreground">Phụ tá:</span>
                <span className="font-medium">{visit.assistant_name}</span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Vitals */}
      {(visit.blood_pressure_systolic || visit.blood_pressure_diastolic || visit.blood_sugar_mgdl) && (
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
              Chỉ số khám
            </p>
            <div className="flex flex-wrap gap-6">
              {(visit.blood_pressure_systolic || visit.blood_pressure_diastolic) && (
                <div className="flex items-center gap-2">
                  <span className="text-xl">💉</span>
                  <div>
                    <p className="text-xs text-muted-foreground">Huyết áp</p>
                    <p className="font-semibold text-sm">
                      {visit.blood_pressure_systolic}/{visit.blood_pressure_diastolic} mmHg
                    </p>
                  </div>
                </div>
              )}
              {visit.blood_sugar_mgdl && (
                <div className="flex items-center gap-2">
                  <span className="text-xl">🩸</span>
                  <div>
                    <p className="text-xs text-muted-foreground">Đường huyết</p>
                    <p className="font-semibold text-sm">
                      {visit.blood_sugar_mgdl} mg/dL
                    </p>
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* FDI Chart */}
      <Card>
        <CardHeader>
          <CardTitle>So đồ răng FDI</CardTitle>
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
        <CardContent className="flex flex-wrap gap-3">
          <Button onClick={onCreatePlan}>
            <svg className="mr-1.5 h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            Tạo kế hoạch điều trị
          </Button>
          <Button variant="outline" onClick={onSummarize} disabled={summarizing}>
            <svg className="mr-1.5 h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
            </svg>
            {summarizing ? "Đang tóm tắt…" : "Tóm tắt AI"}
          </Button>
          <Button variant="secondary" onClick={onGeneratePlan} disabled={generatingPlan}>
            <svg className="mr-1.5 h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
            </svg>
            {generatingPlan ? "AI dang tao kế hoạch…" : "Tạo kế hoạch AI"}
          </Button>
        </CardContent>
      </Card>

      {/* ─── AI Summary Dialog ─────────────────────────────── */}
      <Dialog open={summaryDialogOpen} onOpenChange={setSummaryDialogOpen}>
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 shadow-lg">
              <svg className="h-5 w-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
              </svg>
            </div>
            <div>
              <DialogTitle>Tóm tắt bệnh án</DialogTitle>
              <p className="text-xs text-muted-foreground mt-0.5">Phân tích AI từ clinical findings</p>
            </div>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-5 pb-5 sm:px-6">
          {summarizing ? (
            <div className="flex flex-col items-center gap-4 py-14">
              <div className="relative">
                <div className="h-14 w-14 rounded-full border-4 border-violet-100"></div>
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="h-9 w-9 animate-spin rounded-full border-4 border-violet-500 border-t-transparent"></div>
                </div>
              </div>
              <div className="text-center">
                <p className="font-medium text-foreground">AI đang phân tích…</p>
                <p className="text-sm text-muted-foreground mt-1">Đang xử lý clinical findings</p>
              </div>
            </div>
          ) : summaryResult ? (
            <>
              {/* Model + time bar */}
              <div className="flex items-center justify-between rounded-xl border border-violet-200 bg-gradient-to-r from-violet-50 to-purple-50 px-4 py-3">
                <div className="flex items-center gap-2">
                  <div className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold ${summaryResult.ai_model === "llama-3.1-8b-instruct" ? "bg-violet-600 text-white" : "bg-violet-100 text-violet-700"}`}>
                    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                    </svg>
                    {summaryResult.ai_model === "llama-3.1-8b-instruct" ? "AI Cloudflare" : "Tóm tắt cau truc"}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-muted-foreground">
                    {new Date(summaryResult.generated_at).toLocaleTimeString("vi-VN")}
                  </span>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(summaryResult.summary);
                      toast.success("Đã copy vào bộ nhớ tạm");
                    }}
                    className="flex items-center gap-1.5 rounded-lg border border-violet-200 bg-white px-3 py-1.5 text-xs font-medium text-violet-700 shadow-sm transition-all hover:bg-violet-50 hover:shadow-md"
                  >
                    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                    </svg>
                    Copy
                  </button>
                </div>
              </div>

              {/* Parsed sections */}
              {sections.length > 0 ? <div className="mt-4 space-y-4">{sections.map((section, idx) => {
                if (section.type === "patient" && section.items) return <SummaryPatientCard key={idx} items={section.items} />;
                if (section.type === "visit" && section.items) return <SummaryVisitCard key={idx} items={section.items} />;
                if (section.type === "findings" && section.items) return <SummaryFindingsCard key={idx} items={section.items} label={section.label} />;
                if (section.type === "plan" && section.items) return <SummaryPlanCard key={idx} items={section.items} label={section.label} />;
                if (section.type === "notes" && section.items) return <SummaryNotesCard key={idx} items={section.items} />;
                return null;
              })}</div> : (
                <div className="mt-4 rounded-xl border border-border bg-muted/20 p-6">
                  <pre className="text-sm whitespace-pre-wrap text-foreground leading-relaxed font-mono">{summaryResult.summary}</pre>
                </div>
              )}
            </>
          ) : null}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setSummaryDialogOpen(false)}>Đóng</Button>
        </DialogFooter>
      </Dialog>

      {/* ─── AI Generate Plan Dialog ──────────────────────── */}
      <Dialog open={planDialogOpen} onOpenChange={setPlanDialogOpen}>
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-teal-500 to-emerald-600 shadow-lg">
              <svg className="h-5 w-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
              </svg>
            </div>
            <div>
              <DialogTitle>Tạo kế hoạch điều trị bằng AI</DialogTitle>
              <p className="text-xs text-muted-foreground mt-0.5">AI đề xuất dựa trên clinical findings</p>
            </div>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-5 pb-5 sm:px-6">
          {generatingPlan ? (
            <div className="flex flex-col items-center gap-4 py-14">
              <div className="relative">
                <div className="h-14 w-14 rounded-full border-4 border-teal-100"></div>
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="h-9 w-9 animate-spin rounded-full border-4 border-teal-500 border-t-transparent"></div>
                </div>
              </div>
              <div className="text-center">
                <p className="font-medium text-foreground">AI đang phân tích…</p>
                <p className="text-sm text-muted-foreground mt-1">Đang xử lý clinical findings & kế hoạch kế hoạch</p>
              </div>
            </div>
          ) : planResult ? (
            <>
              {/* Model + time bar */}
              <div className="flex items-center justify-between rounded-xl border border-teal-200 bg-gradient-to-r from-teal-50 to-emerald-50 px-4 py-3">
                <div className="flex items-center gap-2">
                  <div className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold ${planResult.ai_model === "llama-3.1-8b-instruct" ? "bg-teal-600 text-white" : "bg-teal-100 text-teal-700"}`}>
                    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                    </svg>
                    {planResult.ai_model === "llama-3.1-8b-instruct" ? "AI Cloudflare" : "Gợi ý cấu trúc"}
                  </div>
                </div>
                <span className="text-xs text-muted-foreground">
                  {new Date(planResult.generated_at).toLocaleTimeString("vi-VN")}
                </span>
              </div>

              {/* Items table */}
              {editableItems.length > 0 ? (
                <div className="overflow-x-auto rounded-xl border border-border shadow-sm">
                  <table className="w-full min-w-[500px] text-sm">
                    <thead>
                      <tr className="bg-gradient-to-r from-slate-700 to-slate-600">
                        <th className="px-3 py-2.5 text-left text-xs font-semibold text-white/80 w-14">Rang</th>
                        <th className="px-3 py-2.5 text-left text-xs font-semibold text-white/80 w-36">Thủ thuật</th>
                        <th className="px-3 py-2.5 text-left text-xs font-semibold text-white/80">Mô tả</th>
                        <th className="px-3 py-2.5 text-right text-xs font-semibold text-white/80 w-32">Chi phí</th>
                        <th className="w-10"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {editableItems.map((item, idx) => {
                        const procColor = PROCEDURE_COLORS[item.procedure] || "bg-gray-100 text-gray-700";
                        return (
                          <tr key={item.id} className={`border-t border-border ${idx % 2 === 0 ? "bg-white" : "bg-slate-50/50"} group`}>
                            <td className="px-3 py-2">
                              <Input
                                type="number"
                                value={item.tooth || ""}
                                onChange={(e) => updateItem(item.id, "tooth", Number(e.target.value))}
                                className="h-8 w-14 text-center border-slate-200 text-sm font-bold"
                                min={1} max={88}
                              />
                            </td>
                            <td className="px-3 py-2">
                              <select
                                value={item.procedure}
                                onChange={(e) => updateItem(item.id, "procedure", e.target.value)}
                                className={`h-8 w-full rounded-lg border-0 px-2 text-xs font-semibold ${procColor}`}
                              >
                                {PROCEDURE_OPTIONS.map((o) => (
                                  <option key={o.value} value={o.value} className="bg-white text-gray-800 font-normal">{o.label}</option>
                                ))}
                              </select>
                            </td>
                            <td className="px-3 py-2">
                              <Input
                                value={item.description}
                                onChange={(e) => updateItem(item.id, "description", e.target.value)}
                                className="h-8 text-xs border-slate-200 min-w-0"
                                placeholder="Mô tả điều trị"
                              />
                            </td>
                            <td className="px-3 py-2">
                              <Input
                                type="number"
                                value={item.cost || ""}
                                onChange={(e) => updateItem(item.id, "cost", Number(e.target.value))}
                                className="h-8 text-right text-xs border-slate-200 font-mono"
                                placeholder="0"
                              />
                            </td>
                            <td className="px-3 py-2 text-center">
                              <button
                                onClick={() => removeItem(item.id)}
                                className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-500 transition-all"
                              >
                                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                                </svg>
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 py-10 text-center text-sm text-gray-400">
                  Không có clinical findings để tạo kế hoạch
                </div>
              )}

              {/* Notes */}
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-gray-500 uppercase tracking-wider">Ghi chú</label>
                <textarea
                  value={planNotes}
                  onChange={(e) => setPlanNotes(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                  rows={2}
                  placeholder="Ghi chú cho kế hoạch điều trị"
                />
              </div>

              {/* Total */}
              <div className="flex items-center justify-between rounded-xl border-2 border-teal-300 bg-gradient-to-r from-teal-50 to-emerald-50 px-5 py-4 shadow-sm">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-teal-600">Tổng chi phí ước tính</p>
                  <p className="text-xs text-gray-400 mt-0.5">{editableItems.length} hạng mục | {new Set(editableItems.map((i) => i.procedure)).size} thu thuat</p>
                </div>
                <div className="text-right">
                  <p className="text-2xl font-bold text-teal-700">{totalCost.toLocaleString("vi-VN")}</p>
                  <p className="text-xs text-gray-400">VND</p>
                </div>
              </div>

              {/* Add item */}
              <button
                onClick={addItem}
                className="w-full rounded-xl border-2 border-dashed border-slate-300 py-2.5 text-sm font-medium text-slate-500 transition-all hover:border-teal-400 hover:text-teal-600 hover:bg-teal-50/30"
              >
                + Thêm thủ thuật
              </button>
            </>
          ) : null}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => setPlanDialogOpen(false)}>Hủy</Button>
          <Button
            onClick={onSavePlan}
            disabled={savingPlan || editableItems.length === 0}
            className="bg-gradient-to-r from-teal-600 to-emerald-600 hover:from-teal-700 hover:to-emerald-700 text-white shadow-md"
          >
            {savingPlan ? (
              <>
                <div className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white"></div>
                Đang lưu…
              </>
            ) : (
              <>
                <svg className="mr-1.5 h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
                Luu kế hoạch điều trị
              </>
            )}
          </Button>
        </DialogFooter>
      </Dialog>
    </div>
  );
}
