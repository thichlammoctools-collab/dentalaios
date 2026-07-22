import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Dialog, DialogBody, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { VoiceInputButton } from "@/components/VoiceInputButton";
import { VoiceFindingsDialog } from "@/components/VoiceFindingsDialog";
import { apiPost, ApiError } from "@/lib/api";
import { toast } from "@/lib/toast";
import type { ClinicalFinding, SoftTissueArea } from "@shared/types";
import { cn } from "@/lib/utils";

interface FdiToothChartProps {
  visitId: string;
  findings: ClinicalFinding[];
  onCreated: (finding: ClinicalFinding) => void;
  onCreatedBatch?: (findings: ClinicalFinding[]) => void;
}

const UPPER_RIGHT = [18, 17, 16, 15, 14, 13, 12, 11];
const UPPER_LEFT = [21, 22, 23, 24, 25, 26, 27, 28];
const LOWER_RIGHT = [48, 47, 46, 45, 44, 43, 42, 41];
const LOWER_LEFT = [31, 32, 33, 34, 35, 36, 37, 38];
const PRIMARY_UPPER_RIGHT = [55, 54, 53, 52, 51];
const PRIMARY_UPPER_LEFT = [61, 62, 63, 64, 65];
const PRIMARY_LOWER_RIGHT = [85, 84, 83, 82, 81];
const PRIMARY_LOWER_LEFT = [71, 72, 73, 74, 75];

const ALL_TEETH = [
  ...UPPER_RIGHT,
  ...UPPER_LEFT,
  ...LOWER_RIGHT,
  ...LOWER_LEFT,
  ...PRIMARY_UPPER_RIGHT,
  ...PRIMARY_UPPER_LEFT,
  ...PRIMARY_LOWER_RIGHT,
  ...PRIMARY_LOWER_LEFT,
];

type Tab = "tooth" | "full_mouth" | "soft_tissue" | "occlusion";

const TOOTH_CONDITIONS = [
  { value: "good", label: "Tốt" },
  { value: "caries", label: "Sâu răng" },
  { value: "unerupted", label: "Chưa mọc" },
  { value: "impacted", label: "Mọc ngầm" },
  { value: "tilted", label: "Mọc nghiêng" },
  { value: "fracture", label: "Gãy/vỡ" },
  { value: "missing", label: "Mất răng" },
  { value: "periapical", label: "Viêm quanh chóp" },
  { value: "calculus", label: "Cao răng" },
  { value: "pulpitis", label: "Viêm tủy" },
  { value: "discoloration", label: "Đổi màu" },
  { value: "wear", label: "Mòn răng" },
  { value: "other", label: "Khác" },
];

const FULLMOUTH_CONDITIONS = [
  { value: "calculus", label: "Cao răng (cạo vôi toàn hàm)" },
  { value: "staining", label: "Nhuộm màu toàn hàm" },
  { value: "halitosis", label: "Hôi miệng" },
  { value: "dry_mouth", label: "Khô miệng" },
  { value: "bruxism", label: "Nghiến răng" },
  { value: "other", label: "Khác" },
];

const SOFT_TISSUE_AREAS: { value: SoftTissueArea; label: string }[] = [
  { value: "gum", label: "Nướu (lợi)" },
  { value: "tongue", label: "Lưỡi" },
  { value: "buccal", label: "Niêm mạc má" },
  { value: "palate", label: "Vòm miệng" },
  { value: "floor_mouth", label: "Đáy miệng" },
  { value: "lip", label: "Môi" },
  { value: "pharynx", label: "Họng" },
  { value: "jaw", label: "Xương hàm" },
  { value: "tmj", label: "Khớp thái dương hàm (TMJ)" },
  { value: "salivary_gland", label: "Tuyến nước bọt" },
];

const SOFT_TISSUE_CONDITIONS = [
  { value: "gingivitis", label: "Viêm lợi (Gingivitis)" },
  { value: "periodontitis", label: "Viêm quanh răng (Periodontitis)" },
  { value: "ulcer", label: "Loét miệng" },
  { value: "aphtha", label: "Aft miệng" },
  { value: "leukoplakia", label: "Bạch sản" },
  { value: "erythroplakia", label: "Hồng sản" },
  { value: "herpes", label: "Mụn rộp herpes" },
  { value: "candidiasis", label: "Nấm miệng (Candidiasis)" },
  { value: "fissure", label: "Nứt khóe miệng" },
  { value: "abscess", label: "Áp xe nướu" },
  { value: "fistula", label: "Rò quanh răng" },
  { value: "recession", label: "Tụt lợi (Recession)" },
  { value: "hypertrophy", label: "Phì đại nướu" },
  { value: "tongue_coating", label: "B tong lưỡi" },
  { value: "geographic_tongue", label: "Lưỡi địa lý" },
  { value: "fissured_tongue", label: "Lưỡi nứt" },
  { value: "macroglossia", label: "Lưỡi to" },
  { value: "torus", label: "Gai xương hàm" },
  { value: "tmd_pain", label: "Đau khớp TMJ" },
  { value: "clicking", label: "Khớp kêu click" },
  { value: "limitation", label: "Hạn chế há miệng" },
  { value: "sialolith", label: "Sialolith (đá tuyến nước bọt)" },
  { value: "swelling", label: "Sưng tuyến nước bọt" },
  { value: "other", label: "Khác" },
];

const OCCLUSION_CONDITIONS = [
  { value: "angle_class_i", label: "Angle loại I" },
  { value: "angle_class_ii_div_1", label: "Angle loại II, chia 1" },
  { value: "angle_class_ii_div_2", label: "Angle loại II, chia 2" },
  { value: "angle_class_iii", label: "Angle loại III" },
  { value: "deep_bite", label: "Cắn sâu" },
  { value: "open_bite", label: "Cắn hở" },
  { value: "crossbite", label: "Cắn chéo" },
  { value: "edge_to_edge", label: "Cắn đối đầu" },
  { value: "overjet", label: "Cắn chìa (overjet)" },
  { value: "crowding", label: "Chen chúc" },
  { value: "spacing", label: "Thưa răng" },
  { value: "other", label: "Khác" },
];

function toothLabel(n: number) {
  return `#${n}`;
}

type ToothVisualStatus = "empty" | "good" | "missing" | "unavailable" | "condition";

function getToothVisualStatus(findings: ClinicalFinding[]): ToothVisualStatus {
  const conditions = new Set(findings.map((finding) => finding.condition));
  if (conditions.has("missing")) return "missing";
  if (conditions.has("unerupted") || conditions.has("impacted")) return "unavailable";
  if (conditions.size > 0 && !(conditions.size === 1 && conditions.has("good"))) return "condition";
  if (conditions.has("good")) return "good";
  return "empty";
}

export function FdiToothChart({ visitId, findings, onCreated, onCreatedBatch }: FdiToothChartProps) {
  const [tab, setTab] = useState<Tab>("tooth");
  const [voiceOpen, setVoiceOpen] = useState(false);
  const [selected, setSelected] = useState<number | null>(null);
  const [condition, setCondition] = useState("good");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  // Full-mouth dialog state
  const [fmCondition, setFmCondition] = useState("calculus");
  const [fmNotes, setFmNotes] = useState("");
  const [fmOpen, setFmOpen] = useState(false);
  const [fmSaving, setFmSaving] = useState(false);

  // Soft-tissue dialog state
  const [stArea, setStArea] = useState<SoftTissueArea>("gum");
  const [stCondition, setStCondition] = useState("gingivitis");
  const [stNotes, setStNotes] = useState("");
  const [stOpen, setStOpen] = useState(false);
  const [stSaving, setStSaving] = useState(false);

  const [occlusionCondition, setOcclusionCondition] = useState("angle_class_i");
  const [occlusionNotes, setOcclusionNotes] = useState("");
  const [occlusionOpen, setOcclusionOpen] = useState(false);
  const [occlusionSaving, setOcclusionSaving] = useState(false);

  const toothFindings = findings.filter((f) => f.scope === "tooth");
  const fullMouthFindings = findings.filter((f) => f.scope === "full_mouth");
  const softTissueFindings = findings.filter((f) => f.scope === "soft_tissue");
  const occlusionFindings = findings.filter((f) => f.scope === "occlusion");

  const findingsByTooth = new Map<number, ClinicalFinding[]>();
  for (const f of toothFindings) {
    if (f.tooth_number == null) continue;
    const list = findingsByTooth.get(f.tooth_number) ?? [];
    list.push(f);
    findingsByTooth.set(f.tooth_number, list);
  }

  function renderTooth(n: number, side: "right" | "left") {
    const list = findingsByTooth.get(n) ?? [];
    const visualStatus = getToothVisualStatus(list);
    const tooltip = list.map((f) => f.condition).join(", ") || undefined;
    return (
      <button
        key={n}
        type="button"
        title={tooltip ?? `#${n}`}
        onClick={() => setSelected(n)}
        className={cn(
          "relative flex h-8 w-8 flex-col items-center justify-center rounded border text-xs transition-colors sm:h-10 sm:w-10",
          visualStatus === "good" && "border-emerald-400 bg-emerald-50 text-emerald-900 dark:border-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300",
          visualStatus === "missing" && "border-red-400 bg-red-50 text-red-900 dark:border-red-800 dark:bg-red-950/50 dark:text-red-300",
          visualStatus === "unavailable" && "border-slate-300 bg-slate-100 text-slate-500 opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400",
          visualStatus === "condition" && "border-amber-400 bg-amber-50 text-amber-900 dark:border-amber-700 dark:bg-amber-950/50 dark:text-amber-300",
          visualStatus === "empty" && "border-border bg-background dark:bg-zinc-900 hover:border-primary hover:bg-accent dark:hover:bg-zinc-800",
          side === "right" ? "border-r-2" : "border-l-2",
        )}
      >
        <span className="font-mono font-medium">{n}</span>
        {visualStatus === "missing" && (
          <svg aria-hidden="true" viewBox="0 0 100 100" className="pointer-events-none absolute inset-0 h-full w-full p-0.5 text-red-600 dark:text-red-400">
            <line x1="5" y1="5" x2="95" y2="95" stroke="currentColor" strokeWidth="9" strokeLinecap="round" />
            <line x1="95" y1="5" x2="5" y2="95" stroke="currentColor" strokeWidth="9" strokeLinecap="round" />
          </svg>
        )}
        {list.length > 0 && visualStatus !== "missing" && (
          <span className="text-[8px] opacity-80">{list.length}</span>
        )}
      </button>
    );
  }

  async function onToothSubmit() {
    if (selected == null) return;
    setSaving(true);
    try {
      const created = await apiPost<ClinicalFinding>(
        `/api/visits/${visitId}/findings`,
        {
          tooth_number: selected,
          scope: "tooth",
          condition,
          notes: notes || undefined,
        },
      );
      toast.success(`Đã thêm finding cho răng #${selected}`);
      onCreated(created);
      setSelected(null);
      setCondition("good");
      setNotes("");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Lỗi thêm finding");
    } finally {
      setSaving(false);
    }
  }

  async function onFullMouthSubmit() {
    setFmSaving(true);
    try {
      const created = await apiPost<ClinicalFinding>(
        `/api/visits/${visitId}/findings`,
        {
          tooth_number: null,
          scope: "full_mouth",
          condition: fmCondition,
          notes: fmNotes || undefined,
        },
      );
      toast.success("Đã thêm finding toàn hàm");
      onCreated(created);
      setFmOpen(false);
      setFmCondition("calculus");
      setFmNotes("");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Lỗi thêm finding");
    } finally {
      setFmSaving(false);
    }
  }

  async function onSoftTissueSubmit() {
    setStSaving(true);
    try {
      const created = await apiPost<ClinicalFinding>(
        `/api/visits/${visitId}/findings`,
        {
          tooth_number: null,
          scope: "soft_tissue",
          area: stArea,
          condition: stCondition,
          notes: stNotes || undefined,
        },
      );
      toast.success("Đã thêm finding mô mềm");
      onCreated(created);
      setStOpen(false);
      setStCondition("gingivitis");
      setStNotes("");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Lỗi thêm finding");
    } finally {
      setStSaving(false);
    }
  }

  async function onOcclusionSubmit() {
    setOcclusionSaving(true);
    try {
      const created = await apiPost<ClinicalFinding>(
        `/api/visits/${visitId}/findings`,
        {
          tooth_number: null,
          scope: "occlusion",
          condition: occlusionCondition,
          notes: occlusionNotes || undefined,
        },
      );
      toast.success("Đã thêm finding khớp cắn");
      onCreated(created);
      setOcclusionOpen(false);
      setOcclusionCondition("angle_class_i");
      setOcclusionNotes("");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Lỗi thêm finding");
    } finally {
      setOcclusionSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      {/* Tab navigation */}
      <div className="flex gap-1 rounded-xl border border-border bg-muted/20 p-1 shadow-sm">
        {([
          { key: "tooth" as Tab, label: "Theo răng", count: toothFindings.length },
          { key: "full_mouth" as Tab, label: "Toàn hàm", count: fullMouthFindings.length },
          { key: "soft_tissue" as Tab, label: "Mô mềm", count: softTissueFindings.length },
          { key: "occlusion" as Tab, label: "Khớp cắn", count: occlusionFindings.length },
        ]).map(({ key, label, count }) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={cn(
              "flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-all",
              tab === key
                ? "bg-background text-foreground shadow-sm ring-1 ring-border/50 font-semibold"
                : "text-muted-foreground hover:text-foreground hover:bg-accent/50",
            )}
          >
            {label}
            {count > 0 && (
              <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary/10 px-1.5 text-[11px] font-bold text-primary">
                {count}
              </span>
            )}
          </button>
        ))}
        <div className="px-1">
          <VoiceInputButton
            onTranscription={() => setVoiceOpen(true)}
            label="Ghi âm"
            size="sm"
            variant="ghost"
          />
        </div>
      </div>

      {/* Tab: Tooth */}
      {tab === "tooth" && (
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="mb-3 text-center text-xs text-muted-foreground">Răng vĩnh viễn</p>
          <p className="mb-2 text-center text-xs text-muted-foreground">↑ Hàm trên (Patient's right | left)</p>
          <div className="overflow-x-auto">
            <div className="flex min-w-max justify-center gap-0">
              <div className="flex">{UPPER_RIGHT.map((n) => renderTooth(n, "right"))}</div>
              <div className="mx-1 w-px flex-shrink-0 bg-border" />
              <div className="flex">{UPPER_LEFT.map((n) => renderTooth(n, "left"))}</div>
            </div>
            <div className="mt-3 flex min-w-max justify-center gap-0">
              <div className="flex">{LOWER_RIGHT.map((n) => renderTooth(n, "right"))}</div>
              <div className="mx-1 w-px flex-shrink-0 bg-border" />
              <div className="flex">{LOWER_LEFT.map((n) => renderTooth(n, "left"))}</div>
            </div>
          </div>
          <p className="mt-3 text-center text-xs text-muted-foreground">↓ Hàm dưới</p>
          <div className="my-4 border-t border-border" />
          <p className="mb-2 text-center text-xs text-muted-foreground">Răng trẻ em</p>
          <div className="overflow-x-auto">
            <div className="flex min-w-max justify-center gap-0">
              <div className="flex">{PRIMARY_UPPER_RIGHT.map((n) => renderTooth(n, "right"))}</div>
              <div className="mx-1 w-px flex-shrink-0 bg-border" />
              <div className="flex">{PRIMARY_UPPER_LEFT.map((n) => renderTooth(n, "left"))}</div>
            </div>
            <div className="mt-3 flex min-w-max justify-center gap-0">
              <div className="flex">{PRIMARY_LOWER_RIGHT.map((n) => renderTooth(n, "right"))}</div>
              <div className="mx-1 w-px flex-shrink-0 bg-border" />
              <div className="flex">{PRIMARY_LOWER_LEFT.map((n) => renderTooth(n, "left"))}</div>
            </div>
          </div>
          <p className="mt-3 text-center text-xs text-muted-foreground">↓ Hàm dưới</p>
          <div className="mt-4 flex flex-wrap justify-center gap-x-3 gap-y-1.5 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1.5"><i className="h-3 w-3 rounded border border-emerald-400 bg-emerald-50 dark:border-emerald-700 dark:bg-emerald-950" />Tốt</span>
            <span className="inline-flex items-center gap-1.5"><i className="flex h-3 w-3 items-center justify-center rounded border border-red-400 bg-red-50 text-[11px] font-bold leading-none text-red-600 dark:border-red-800 dark:bg-red-950 dark:text-red-400">×</i>Mất răng</span>
            <span className="inline-flex items-center gap-1.5"><i className="h-3 w-3 rounded border border-slate-300 bg-slate-100 opacity-50 dark:border-slate-700 dark:bg-slate-900" />Chưa mọc, mọc ngầm</span>
            <span className="inline-flex items-center gap-1.5"><i className="h-3 w-3 rounded border border-amber-400 bg-amber-50 dark:border-amber-700 dark:bg-amber-950" />Tình trạng khác</span>
          </div>
          <p className="mt-2 text-center text-xs text-muted-foreground">Nhấn răng để thêm tình trạng.</p>
        </div>
      )}

      {/* Tab: Full mouth */}
      {tab === "full_mouth" && (
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="mb-2 text-sm font-medium">Thêm finding cho toàn hàm</p>
          <p className="mb-4 text-xs text-muted-foreground">
            Dùng cho các thủ thuật áp dụng toàn bộ hàm như cạo vôi răng, tẩy trắng toàn hàm…
          </p>
          <Button variant="outline" size="sm" onClick={() => setFmOpen(true)}>
            + Thêm finding toàn hàm
          </Button>
          {fullMouthFindings.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {fullMouthFindings.map((f) => (
                <span key={f.id} className="inline-flex items-center rounded-full bg-orange-100 dark:bg-orange-950 px-2.5 py-0.5 text-xs font-medium text-orange-800 dark:text-orange-300">
                  {FULLMOUTH_CONDITIONS.find((c) => c.value === f.condition)?.label ?? f.condition}
                  {f.notes && <span className="ml-1 text-orange-600 dark:text-orange-400">— {f.notes}</span>}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Tab: Soft tissue */}
      {tab === "soft_tissue" && (
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="mb-2 text-sm font-medium">Thêm finding mô mềm miệng</p>
          <p className="mb-4 text-xs text-muted-foreground">
            Nướu, lưỡi, niêm mạc, xương hàm, khớp TMJ, tuyến nước bọt…
          </p>
          <Button variant="outline" size="sm" onClick={() => setStOpen(true)}>
            + Thêm finding mô mềm
          </Button>
          {softTissueFindings.length > 0 && (
            <div className="mt-3 flex flex-col gap-1.5">
              {softTissueFindings.map((f) => (
                <div key={f.id} className="flex items-center gap-2 text-xs">
                  <span className="inline-flex items-center rounded-full bg-blue-100 dark:bg-blue-950 px-2.5 py-0.5 text-xs font-medium text-blue-800 dark:text-blue-300">
                    {SOFT_TISSUE_AREAS.find((a) => a.value === f.area)?.label ?? f.area}
                  </span>
                  <span className="text-muted-foreground">
                    {SOFT_TISSUE_CONDITIONS.find((c) => c.value === f.condition)?.label ?? f.condition}
                  </span>
                  {f.notes && <span className="text-muted-foreground italic">— {f.notes}</span>}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === "occlusion" && (
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="mb-2 text-sm font-medium">Phân loại khớp cắn</p>
          <p className="mb-4 text-xs text-muted-foreground">
            Ghi nhận phân loại Angle và các bất thường khớp cắn như cắn sâu, cắn hở hoặc cắn chéo.
          </p>
          <Button variant="outline" size="sm" onClick={() => setOcclusionOpen(true)}>
            + Thêm finding khớp cắn
          </Button>
          {occlusionFindings.length > 0 && (
            <div className="mt-3 flex flex-col gap-1.5">
              {occlusionFindings.map((f) => (
                <div key={f.id} className="flex items-center gap-2 text-xs">
                  <span className="inline-flex items-center rounded-full bg-violet-100 px-2.5 py-0.5 text-xs font-medium text-violet-800 dark:bg-violet-950 dark:text-violet-300">
                    {OCCLUSION_CONDITIONS.find((c) => c.value === f.condition)?.label ?? f.condition}
                  </span>
                  {f.notes && <span className="text-muted-foreground italic">— {f.notes}</span>}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Dialog: Tooth condition */}
      <Dialog open={selected != null} onOpenChange={(o) => !o && setSelected(null)}>
        {selected != null && (
          <>
            <DialogHeader>
              <DialogTitle>
                Thêm finding — Răng #{selected}{" "}
                <span className="font-normal text-muted-foreground">
                  ({ALL_TEETH.includes(selected)
                    ? selected >= 30 ? "Hàm dưới" : "Hàm trên"
                    : "?"})
                </span>
              </DialogTitle>
            </DialogHeader>
            <DialogBody className="grid gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor="cond">Tình trạng</Label>
                <select
                  id="cond"
                  value={condition}
                  onChange={(e) => setCondition(e.target.value)}
                  className="flex h-9 w-full rounded-md border border-input bg-background dark:bg-zinc-900 dark:border-zinc-700 dark:text-zinc-100 px-3 py-1 text-sm"
                >
                  {TOOTH_CONDITIONS.map((c) => (
                    <option key={c.value} value={c.value}>{c.label}</option>
                  ))}
                </select>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="notes">Ghi chú</Label>
                <Textarea
                  id="notes"
                  rows={3}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Đã có {findingsByTooth.get(selected)?.length ?? 0} finding cho răng này.
              </p>
            </DialogBody>
            <DialogFooter>
              <Button variant="outline" onClick={() => setSelected(null)}>
                Hủy
              </Button>
              <Button onClick={onToothSubmit} disabled={saving}>
                {saving ? "Đang lưu…" : "Lưu"}
              </Button>
            </DialogFooter>
          </>
        )}
      </Dialog>

      {/* Dialog: Full-mouth finding */}
      <Dialog open={fmOpen} onOpenChange={setFmOpen}>
        <DialogHeader>
          <DialogTitle>Thêm finding toàn hàm</DialogTitle>
        </DialogHeader>
        <DialogBody className="grid gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="fm-cond">Tình trạng</Label>
            <select
              id="fm-cond"
              value={fmCondition}
              onChange={(e) => setFmCondition(e.target.value)}
              className="flex h-9 w-full rounded-md border border-input bg-background dark:bg-zinc-900 dark:border-zinc-700 dark:text-zinc-100 px-3 py-1 text-sm"
            >
              {FULLMOUTH_CONDITIONS.map((c) => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </select>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="fm-notes">Ghi chú</Label>
            <Textarea
              id="fm-notes"
              rows={3}
              value={fmNotes}
              onChange={(e) => setFmNotes(e.target.value)}
              placeholder="Ví dụ: cạo vôi 2 hàm, khuyên bệnh nhân tẩy trắng…"
            />
          </div>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={() => setFmOpen(false)}>
            Hủy
          </Button>
          <Button onClick={onFullMouthSubmit} disabled={fmSaving}>
            {fmSaving ? "Đang lưu…" : "Lưu"}
          </Button>
        </DialogFooter>
      </Dialog>

      {/* Dialog: Soft-tissue finding */}
      <Dialog open={stOpen} onOpenChange={setStOpen}>
        <DialogHeader>
          <DialogTitle>Thêm finding mô mềm</DialogTitle>
        </DialogHeader>
        <DialogBody className="grid gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="st-area">Vùng</Label>
            <select
              id="st-area"
              value={stArea}
              onChange={(e) => setStArea(e.target.value as SoftTissueArea)}
              className="flex h-9 w-full rounded-md border border-input bg-background dark:bg-zinc-900 dark:border-zinc-700 dark:text-zinc-100 px-3 py-1 text-sm"
            >
              {SOFT_TISSUE_AREAS.map((a) => (
                <option key={a.value} value={a.value}>{a.label}</option>
              ))}
            </select>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="st-cond">Tình trạng</Label>
            <select
              id="st-cond"
              value={stCondition}
              onChange={(e) => setStCondition(e.target.value)}
              className="flex h-9 w-full rounded-md border border-input bg-background dark:bg-zinc-900 dark:border-zinc-700 dark:text-zinc-100 px-3 py-1 text-sm"
            >
              {SOFT_TISSUE_CONDITIONS.map((c) => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </select>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="st-notes">Ghi chú</Label>
            <Textarea
              id="st-notes"
              rows={3}
              value={stNotes}
              onChange={(e) => setStNotes(e.target.value)}
              placeholder="Mô tả thêm về tình trạng…"
            />
          </div>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={() => setStOpen(false)}>
            Hủy
          </Button>
          <Button onClick={onSoftTissueSubmit} disabled={stSaving}>
            {stSaving ? "Đang lưu…" : "Lưu"}
          </Button>
        </DialogFooter>
      </Dialog>

      <Dialog open={occlusionOpen} onOpenChange={setOcclusionOpen}>
        <DialogHeader>
          <DialogTitle>Thêm finding khớp cắn</DialogTitle>
        </DialogHeader>
        <DialogBody className="grid gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="occlusion-cond">Phân loại</Label>
            <select
              id="occlusion-cond"
              value={occlusionCondition}
              onChange={(e) => setOcclusionCondition(e.target.value)}
              className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
            >
              {OCCLUSION_CONDITIONS.map((c) => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </select>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="occlusion-notes">Ghi chú</Label>
            <Textarea
              id="occlusion-notes"
              rows={3}
              value={occlusionNotes}
              onChange={(e) => setOcclusionNotes(e.target.value)}
              placeholder="Ví dụ: lệch đường giữa 2 mm sang trái, overjet 5 mm…"
            />
          </div>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOcclusionOpen(false)}>
            Hủy
          </Button>
          <Button onClick={onOcclusionSubmit} disabled={occlusionSaving}>
            {occlusionSaving ? "Đang lưu…" : "Lưu"}
          </Button>
        </DialogFooter>
      </Dialog>

      <VoiceFindingsDialog
        open={voiceOpen}
        onOpenChange={setVoiceOpen}
        visitId={visitId}
        onSaved={(saved) => {
          if (onCreatedBatch) {
            onCreatedBatch(saved);
          } else {
            saved.forEach(onCreated);
          }
          setVoiceOpen(false);
        }}
      />
    </div>
  );
}
