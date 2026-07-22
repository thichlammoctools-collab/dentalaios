import { useState } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { apiPatch, ApiError } from "@/lib/api";
import { toast } from "@/lib/toast";
import type { ClinicalFinding } from "@shared/types";

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

const SOFT_TISSUE_AREAS = [
  { value: "gum", label: "Nướu" },
  { value: "tongue", label: "Lưỡi" },
  { value: "buccal", label: "Niêm mạc má" },
  { value: "palate", label: "Vòm miệng" },
  { value: "floor_mouth", label: "Đáy miệng" },
  { value: "lip", label: "Môi" },
  { value: "pharynx", label: "Họng" },
  { value: "jaw", label: "Xương hàm" },
  { value: "tmj", label: "Khớp TMJ" },
  { value: "salivary_gland", label: "Tuyến nước bọt" },
];

const SOFT_TISSUE_CONDITIONS = [
  { value: "gingivitis", label: "Viêm lợi" },
  { value: "periodontitis", label: "Viêm quanh răng" },
  { value: "ulcer", label: "Loét miệng" },
  { value: "aphtha", label: "Aft miệng" },
  { value: "leukoplakia", label: "Bạch sản" },
  { value: "erythroplakia", label: "Hồng sản" },
  { value: "herpes", label: "Mụn rộp herpes" },
  { value: "candidiasis", label: "Nấm miệng" },
  { value: "fissure", label: "Nứt khóe miệng" },
  { value: "abscess", label: "Áp xe nướu" },
  { value: "fistula", label: "Rò quanh răng" },
  { value: "recession", label: "Tụt lợi" },
  { value: "hypertrophy", label: "Phì đại nướu" },
  { value: "tongue_coating", label: "B tong lưỡi" },
  { value: "geographic_tongue", label: "Lưỡi địa lý" },
  { value: "fissured_tongue", label: "Lưỡi nứt" },
  { value: "macroglossia", label: "Lưỡi to" },
  { value: "torus", label: "Gai xương hàm" },
  { value: "tmd_pain", label: "Đau khớp TMJ" },
  { value: "clicking", label: "Khớp kêu click" },
  { value: "limitation", label: "Hạn chế há miệng" },
  { value: "sialolith", label: "Sialolith" },
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

function conditionLabel(scope: string, condition: string): string {
  if (scope === "soft_tissue") {
    return SOFT_TISSUE_CONDITIONS.find((c) => c.value === condition)?.label ?? condition;
  }
  if (scope === "occlusion") {
    return OCCLUSION_CONDITIONS.find((c) => c.value === condition)?.label ?? condition;
  }
  if (scope === "full_mouth") {
    return FULLMOUTH_CONDITIONS.find((c) => c.value === condition)?.label ?? condition;
  }
  return TOOTH_CONDITIONS.find((c) => c.value === condition)?.label ?? condition;
}

function areaLabel(area?: string): string {
  if (!area) return "";
  return SOFT_TISSUE_AREAS.find((a) => a.value === area)?.label ?? area;
}

function scopeBadgeVariant(scope: string): "outline" | "secondary" | "default" {
  if (scope === "full_mouth") return "secondary";
  if (scope === "soft_tissue") return "default";
  return "outline";
}

interface FindingsListProps {
  visitId: string;
  findings: ClinicalFinding[];
  onUpdate: (updated: ClinicalFinding) => void;
}

interface EditState {
  finding: ClinicalFinding;
  condition: string;
  notes: string;
  saving: boolean;
}

export function FindingsList({ visitId, findings, onUpdate }: FindingsListProps) {
  const [editing, setEditing] = useState<EditState | null>(null);

  function startEdit(f: ClinicalFinding) {
    setEditing({ finding: f, condition: f.condition, notes: f.notes ?? "", saving: false });
  }

  function cancelEdit() {
    setEditing(null);
  }

  async function saveEdit() {
    if (!editing) return;
    const { finding, condition, notes } = editing;
    setEditing((prev) => (prev ? { ...prev, saving: true } : null));
    try {
      const updated = await apiPatch<ClinicalFinding>(
        `/api/visits/${visitId}/findings/${finding.id}`,
        { condition, notes: notes || undefined },
      );
      onUpdate(updated);
      setEditing(null);
      toast.success("Đã cập nhật finding");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Lỗi cập nhật finding");
      setEditing((prev) => (prev ? { ...prev, saving: false } : null));
    }
  }

  if (findings.length === 0) {
    return <p className="text-sm text-muted-foreground">Chưa có finding nào.</p>;
  }

  // Group: tooth, full_mouth, soft_tissue
  const toothFindings = findings.filter((f) => f.scope === "tooth");
  const fmFindings = findings.filter((f) => f.scope === "full_mouth");
  const stFindings = findings.filter((f) => f.scope === "soft_tissue");
  const occlusionFindings = findings.filter((f) => f.scope === "occlusion");

  function renderRow(f: ClinicalFinding) {
    const isEditing = editing?.finding.id === f.id;
    const scope = f.scope || "tooth";

    return (
      <TableRow key={f.id}>
        <TableCell className="w-32">
          {scope === "tooth" ? (
            <span className="font-mono font-medium">#{f.tooth_number}</span>
          ) : scope === "full_mouth" ? (
            <span className="text-xs font-medium text-orange-700 dark:text-orange-400">Toàn hàm</span>
          ) : scope === "occlusion" ? (
            <span className="text-xs font-medium text-violet-700 dark:text-violet-400">Khớp cắn</span>
          ) : (
            <span className="text-xs font-medium text-blue-700 dark:text-blue-400">{areaLabel(f.area)}</span>
          )}
        </TableCell>
        <TableCell>
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge variant={scopeBadgeVariant(scope)}>{scope === "tooth" ? "Răng" : scope === "full_mouth" ? "Toàn hàm" : scope === "occlusion" ? "Khớp cắn" : "Mô mềm"}</Badge>
            {isEditing ? (
              <Select
                value={editing.condition}
                onChange={(e) => setEditing((prev) => prev ? { ...prev, condition: e.target.value } : null)}
              >
                {(scope === "soft_tissue" ? SOFT_TISSUE_CONDITIONS : scope === "occlusion" ? OCCLUSION_CONDITIONS : scope === "full_mouth" ? FULLMOUTH_CONDITIONS : TOOTH_CONDITIONS).map((c) => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </Select>
            ) : (
              <Badge variant="outline">{conditionLabel(scope, f.condition)}</Badge>
            )}
          </div>
        </TableCell>
        <TableCell className="text-muted-foreground max-w-xs">
          {isEditing ? (
            <Textarea
              rows={2}
              value={editing.notes}
              onChange={(e) => setEditing((prev) => prev ? { ...prev, notes: e.target.value } : null)}
              placeholder="Ghi chú…"
            />
          ) : (
            f.notes ?? "—"
          )}
        </TableCell>
        <TableCell className="w-32 text-right">
          {isEditing ? (
            <>
              <Button variant="ghost" size="sm" onClick={saveEdit} disabled={editing.saving} className="text-xs">
                {editing.saving ? "…" : "Lưu"}
              </Button>
              <Button variant="ghost" size="sm" onClick={cancelEdit} disabled={editing.saving} className="text-xs">
                Hủy
              </Button>
            </>
          ) : (
            <Button variant="ghost" size="sm" onClick={() => startEdit(f)} className="text-xs">
              Sửa
            </Button>
          )}
        </TableCell>
      </TableRow>
    );
  }

  return (
    <div className="space-y-4">
      {toothFindings.length > 0 && (
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Theo răng</p>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Răng</TableHead>
                <TableHead>Tình trạng</TableHead>
                <TableHead>Ghi chú</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {toothFindings.map(renderRow)}
            </TableBody>
          </Table>
        </div>
      )}

      {fmFindings.length > 0 && (
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-orange-600 dark:text-orange-400">Toàn hàm</p>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Vùng</TableHead>
                <TableHead>Tình trạng</TableHead>
                <TableHead>Ghi chú</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {fmFindings.map(renderRow)}
            </TableBody>
          </Table>
        </div>
      )}

      {stFindings.length > 0 && (
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-blue-600 dark:text-blue-400">Mô mềm miệng</p>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Vùng</TableHead>
                <TableHead>Tình trạng</TableHead>
                <TableHead>Ghi chú</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {stFindings.map(renderRow)}
            </TableBody>
          </Table>
        </div>
      )}

      {occlusionFindings.length > 0 && (
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-violet-600 dark:text-violet-400">Khớp cắn</p>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Phân loại</TableHead>
                <TableHead>Tình trạng</TableHead>
                <TableHead>Ghi chú</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {occlusionFindings.map(renderRow)}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
