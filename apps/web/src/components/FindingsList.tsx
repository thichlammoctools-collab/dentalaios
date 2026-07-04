import { useState } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { apiPatch, ApiError } from "@/lib/api";
import { toast } from "@/lib/toast";
import type { ClinicalFinding } from "@shared/types";

const CONDITIONS = [
  { value: "caries", label: "Sâu răng" },
  { value: "fracture", label: "Gãy/vỡ" },
  { value: "missing", label: "Mất răng" },
  { value: "periapical", label: "Viêm quanh chóp" },
  { value: "calculus", label: "Cao răng" },
  { value: "pulpitis", label: "Viêm tủy" },
  { value: "other", label: "Khác" },
];

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

  return (
    <>
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
          {findings.map((f) => {
            const isEditing = editing?.finding.id === f.id;
            return (
              <TableRow key={f.id}>
                <TableCell className="font-mono font-medium">#{f.tooth_number}</TableCell>
                <TableCell>
                  {isEditing ? (
                    <Select
                      value={editing.condition}
                      onChange={(e) => setEditing((prev) => prev ? { ...prev, condition: e.target.value } : null)}
                    >
                      {CONDITIONS.map((c) => (
                        <option key={c.value} value={c.value}>{c.label}</option>
                      ))}
                    </Select>
                  ) : (
                    <Badge variant="outline">{f.condition}</Badge>
                  )}
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
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={saveEdit}
                        disabled={editing.saving}
                        className="text-xs"
                      >
                        {editing.saving ? "…" : "Lưu"}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={cancelEdit}
                        disabled={editing.saving}
                        className="text-xs"
                      >
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
          })}
        </TableBody>
      </Table>
    </>
  );
}
