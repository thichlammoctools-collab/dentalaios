import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { apiPost, ApiError } from "@/lib/api";
import { toast } from "@/lib/toast";
import { formatDateTime } from "@/lib/utils";
import type { PatientNote } from "@shared/types";

interface PatientNotesTimelineProps {
  patientId: string;
  notes: PatientNote[];
  onCreated: (note: PatientNote) => void;
}

export function PatientNotesTimeline({ patientId, notes, onCreated }: PatientNotesTimelineProps) {
  const [content, setContent] = useState("");
  const [saving, setSaving] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    const value = content.trim();
    if (!value) return;

    setSaving(true);
    try {
      const created = await apiPost<PatientNote>(`/api/patients/${patientId}/notes`, { content: value });
      onCreated(created);
      setContent("");
      toast.success("Đã thêm ghi chú");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Không thể thêm ghi chú");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <form onSubmit={onSubmit} className="space-y-2 rounded-lg border border-border bg-muted/20 p-3">
        <Textarea
          aria-label="Nội dung ghi chú"
          rows={3}
          maxLength={2000}
          value={content}
          onChange={(event) => setContent(event.target.value)}
          placeholder="Thêm ghi chú mới về bệnh nhân..."
        />
        <div className="flex items-center justify-between gap-3">
          <span className="text-xs text-muted-foreground">{content.length}/2000</span>
          <Button type="submit" size="sm" disabled={saving || !content.trim()}>
            {saving ? "Đang thêm..." : "Thêm ghi chú"}
          </Button>
        </div>
      </form>

      {notes.length === 0 ? (
        <p className="text-sm text-muted-foreground">Chưa có ghi chú nào.</p>
      ) : (
        <ol className="space-y-3" aria-label="Lịch sử ghi chú">
          {notes.map((note) => (
            <li key={note.id} className="rounded-lg border border-border bg-background p-3">
              <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                <span className="text-sm font-semibold">{note.user_name}</span>
                <time className="text-xs text-muted-foreground" dateTime={note.created_at}>
                  {formatDateTime(note.created_at)}
                </time>
              </div>
              <p className="whitespace-pre-wrap text-sm">{note.content}</p>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
