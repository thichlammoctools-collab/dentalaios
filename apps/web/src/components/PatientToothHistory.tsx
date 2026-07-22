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
  calculus: "Vôi răng",
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

  function renderTooth(n: number) {
    const position = n % 10;
    const kind = position <= 2 ? "incisor" : position === 3 ? "canine" : position <= 5 ? "premolar" : "molar";
    const isPrimaryMolar = n >= 50 && position >= 4;

    return (
      <button
        key={n}
        type="button"
        title={`Xem lịch sử răng #${n}`}
        aria-label={`Xem lịch sử răng ${n}`}
        onClick={() => openTooth(n)}
        className={cn(
          "group relative flex h-12 shrink-0 items-center justify-center transition-transform duration-200 hover:-translate-y-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 sm:h-14",
          kind === "incisor" ? "w-7" : kind === "canine" ? "w-8" : kind === "premolar" ? "w-10" : "w-11",
        )}
      >
        <svg
          viewBox="0 0 64 72"
          aria-hidden="true"
          className="absolute inset-0 h-full w-full drop-shadow-sm transition-[filter] duration-200 group-hover:drop-shadow-md"
        >
          {kind === "incisor" && (
            <>
              <path
                d="M18 8Q32 3 46 8l-2 25q-1 9-5 18l-4 15q-1 4-3 4t-3-4l-4-15q-4-9-5-18Z"
                className="fill-card stroke-border stroke-[1.5] transition-colors duration-200 group-hover:fill-primary/10 group-hover:stroke-primary"
              />
              <path d="M20 13q12 3 24 0M22 28h20" className="fill-none stroke-muted-foreground/25 stroke-[1.25]" />
            </>
          )}
          {kind === "canine" && (
            <>
              <path
                d="m15 13 17-9 17 9-4 20q-2 10-6 19l-5 15q-1 4-3 0l-5-15q-4-9-6-19Z"
                className="fill-card stroke-border stroke-[1.5] transition-colors duration-200 group-hover:fill-primary/10 group-hover:stroke-primary"
              />
              <path d="M16 14h32M20 29l12-10 12 10" className="fill-none stroke-muted-foreground/25 stroke-[1.25]" />
            </>
          )}
          {kind === "premolar" && (
            <>
              <path
                d="m10 15 10-9 12 7 12-7 10 9-3 19q-2 8-7 15l-5 16q-1 4-4 0l-3-12-3 12q-3 4-4 0l-5-16q-5-7-7-15Z"
                className="fill-card stroke-border stroke-[1.5] transition-colors duration-200 group-hover:fill-primary/10 group-hover:stroke-primary"
              />
              <path d="m14 18 9 7 9-8 9 8 9-7M20 34l12-6 12 6" className="fill-none stroke-muted-foreground/25 stroke-[1.25]" />
            </>
          )}
          {kind === "molar" && (
            <>
              <path
                d={isPrimaryMolar ? "m8 17 8-10 10 6 6-8 6 8 10-6 8 10-3 19q-2 8-8 14l-4 14q-2 5-5 0l-4-12-4 12q-3 5-5 0l-4-14q-6-6-8-14Z" : "m6 17 8-11 11 7 7-9 7 9 11-7 8 11-3 19q-2 8-8 14l-4 14q-2 5-5 0l-4-12-5 12q-3 5-5 0l-4-14q-6-6-8-14Z"}
                className="fill-card stroke-border stroke-[1.5] transition-colors duration-200 group-hover:fill-primary/10 group-hover:stroke-primary"
              />
              <path d="m10 20 10 7 12-9 12 9 10-7M18 36l14-7 14 7M32 29v11" className="fill-none stroke-muted-foreground/25 stroke-[1.25]" />
            </>
          )}
        </svg>
        <span className="relative mt-0.5 font-mono text-[10px] font-semibold tracking-tight text-foreground sm:text-xs">
          {n}
        </span>
      </button>
    );
  }

  return (
    <div className="space-y-4">
      <div className="overflow-hidden rounded-xl border border-border bg-gradient-to-b from-muted/35 to-card shadow-sm">
        <div className="border-b border-border bg-card/80 px-4 py-3 text-center">
          <p className="text-sm font-semibold text-foreground">Sơ đồ răng</p>
          <p className="mt-0.5 text-xs text-muted-foreground">Chọn một răng để xem lịch sử điều trị</p>
        </div>

        <div className="space-y-5 p-4 sm:p-6">
          <section aria-label="Sơ đồ răng vĩnh viễn">
            <div className="mb-3 flex items-center gap-3">
              <div className="h-px flex-1 bg-border" />
              <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
                Răng vĩnh viễn
              </p>
              <div className="h-px flex-1 bg-border" />
            </div>
            <div className="overflow-x-auto pb-1 lg:overflow-x-visible">
              <div className="mx-auto grid w-max min-w-[35rem] grid-cols-[1fr_auto_1fr] items-center gap-x-2 lg:min-w-0 lg:w-full">
                <div className="flex justify-end gap-0">{UPPER_RIGHT.map(renderTooth)}</div>
                <div className="row-span-2 h-full min-h-24 w-px bg-border" />
                <div className="flex gap-0">{UPPER_LEFT.map(renderTooth)}</div>
                <div className="mt-1 flex justify-end gap-0">{LOWER_RIGHT.map(renderTooth)}</div>
                <div className="mt-1 flex gap-0">{LOWER_LEFT.map(renderTooth)}</div>
              </div>
            </div>
          </section>

          <section aria-label="Sơ đồ răng trẻ em" className="border-t border-border pt-5">
            <div className="mb-3 flex items-center gap-3">
              <div className="h-px flex-1 bg-border" />
              <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
                Răng trẻ em
              </p>
              <div className="h-px flex-1 bg-border" />
            </div>
            <div className="overflow-x-auto pb-1">
              <div className="mx-auto grid w-max min-w-[22rem] grid-cols-[1fr_auto_1fr] items-center gap-x-3 sm:min-w-[28rem]">
                <div className="flex justify-end gap-0.5">{PRIMARY_UPPER_RIGHT.map(renderTooth)}</div>
                <div className="row-span-2 h-full min-h-28 w-px bg-border" />
                <div className="flex gap-0.5">{PRIMARY_UPPER_LEFT.map(renderTooth)}</div>
                <div className="mt-1 flex justify-end gap-0.5">{PRIMARY_LOWER_RIGHT.map(renderTooth)}</div>
                <div className="mt-1 flex gap-0.5">{PRIMARY_LOWER_LEFT.map(renderTooth)}</div>
              </div>
            </div>
          </section>
        </div>

        <p className="border-t border-border bg-card/70 px-4 py-3 text-center text-xs text-muted-foreground">
          Di chuột qua răng để xem lựa chọn, hoặc nhấn để mở lịch sử.
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
