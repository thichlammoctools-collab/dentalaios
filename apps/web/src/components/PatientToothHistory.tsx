import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogBody, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { apiGet, ApiError } from "@/lib/api";
import { toast } from "@/lib/toast";
import { formatDateTime } from "@/lib/utils";
import { cn } from "@/lib/utils";
import type { ToothHistoryEntry } from "@shared/types";

interface PatientToothHistoryProps {
  patientId: string;
}

interface ToothHistoryResponse {
  items: ToothHistoryEntry[];
  total: number;
}

const UPPER_RIGHT = [18, 17, 16, 15, 14, 13, 12, 11];
const UPPER_LEFT = [21, 22, 23, 24, 25, 26, 27, 28];
const LOWER_RIGHT = [48, 47, 46, 45, 44, 43, 42, 41];
const LOWER_LEFT = [31, 32, 33, 34, 35, 36, 37, 38];
const PRIMARY_UPPER_RIGHT = [55, 54, 53, 52, 51];
const PRIMARY_UPPER_LEFT = [61, 62, 63, 64, 65];
const PRIMARY_LOWER_RIGHT = [85, 84, 83, 82, 81];
const PRIMARY_LOWER_LEFT = [71, 72, 73, 74, 75];

// Same labels used when recording findings/treatments, mirrored here for display.
const CONDITION_LABELS: Record<string, string> = {
  good: "Tốt",
  caries: "Sâu răng",
  unerupted: "Chưa mọc",
  impacted: "Mọc ngầm",
  tilted: "Mọc nghiêng",
  fracture: "Gãy/vỡ",
  missing: "Mất răng",
  periapical: "Viêm quanh chóp",
  calculus: "Cao răng",
  pulpitis: "Viêm tủy",
  discoloration: "Đổi màu",
  wear: "Mòn răng",
  other: "Khác",
};

const TREATMENT_STATUS_LABELS: Record<string, string> = {
  planned: "Dự kiến",
  in_progress: "Đang làm",
  completed: "Hoàn tất",
};

function conditionLabel(condition: string) {
  return CONDITION_LABELS[condition] ?? condition;
}

export function PatientToothHistory({ patientId }: PatientToothHistoryProps) {
  const [selected, setSelected] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [entries, setEntries] = useState<ToothHistoryEntry[]>([]);

  async function openTooth(tooth: number) {
    setSelected(tooth);
    setLoading(true);
    setEntries([]);
    try {
      const res = await apiGet<ToothHistoryResponse>(
        `/api/patients/${patientId}/teeth/${tooth}/history`,
      );
      setEntries(res.items);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Lỗi tải lịch sử răng");
      setSelected(null);
    } finally {
      setLoading(false);
    }
  }

  function renderTooth(n: number, side: "right" | "left") {
    return (
      <button
        key={n}
        type="button"
        title={`#${n}`}
        onClick={() => openTooth(n)}
        className={cn(
          "flex h-8 w-8 items-center justify-center rounded border border-border bg-background text-xs transition-colors hover:border-primary hover:bg-accent sm:h-10 sm:w-10 dark:bg-zinc-900 dark:hover:bg-zinc-800",
          side === "right" ? "border-r-2" : "border-l-2",
        )}
      >
        <span className="font-mono font-medium">{n}</span>
      </button>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-border bg-card p-4">
        <p className="mb-3 text-center text-xs text-muted-foreground">Răng vĩnh viễn</p>
        <p className="mb-2 text-center text-xs text-muted-foreground">↑ Hàm trên</p>
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
        <p className="mt-4 text-center text-xs text-muted-foreground">
          Nhấn vào một răng để xem toàn bộ lịch sử qua các lần khám.
        </p>
      </div>

      <Dialog open={selected != null} onOpenChange={(o) => !o && setSelected(null)}>
        {selected != null && (
          <>
            <DialogHeader>
              <DialogTitle>Lịch sử răng #{selected}</DialogTitle>
            </DialogHeader>
            <DialogBody>
              {loading ? (
                <p className="text-sm text-muted-foreground">Đang tải…</p>
              ) : entries.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Chưa có ghi nhận nào cho răng này.
                </p>
              ) : (
                <ol className="relative space-y-4 border-l border-border pl-4">
                  {entries.map((entry) => (
                    <li key={`${entry.kind}-${entry.id}`} className="relative">
                      <span
                        className={cn(
                          "absolute -left-[1.4rem] top-1 h-2.5 w-2.5 rounded-full ring-2 ring-background",
                          entry.kind === "finding" ? "bg-amber-500" : "bg-blue-500",
                        )}
                      />
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant={entry.kind === "finding" ? "warning" : "secondary"}>
                          {entry.kind === "finding" ? "Chẩn đoán" : "Điều trị"}
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          {formatDateTime(entry.date)}
                        </span>
                        {entry.visit_code && (
                          <span className="font-mono text-xs text-muted-foreground">
                            {entry.visit_code}
                          </span>
                        )}
                      </div>
                      <div className="mt-1 text-sm">
                        {entry.kind === "finding" ? (
                          <span className="font-medium">{conditionLabel(entry.condition ?? "")}</span>
                        ) : (
                          <span className="font-medium">
                            {entry.service_name || entry.procedure}
                            {entry.status && (
                              <span className="ml-2 text-xs font-normal text-muted-foreground">
                                ({TREATMENT_STATUS_LABELS[entry.status] ?? entry.status})
                              </span>
                            )}
                          </span>
                        )}
                      </div>
                      {entry.description && (
                        <p className="mt-0.5 text-sm text-muted-foreground">{entry.description}</p>
                      )}
                      {entry.notes && (
                        <p className="mt-0.5 text-sm italic text-muted-foreground">— {entry.notes}</p>
                      )}
                      {entry.clinician_name && (
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          BS: {entry.clinician_name}
                        </p>
                      )}
                    </li>
                  ))}
                </ol>
              )}
            </DialogBody>
          </>
        )}
      </Dialog>
    </div>
  );
}
