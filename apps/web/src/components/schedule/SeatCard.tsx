import type { DentalChair } from "@shared/types";
import { ChairTypeIndicator } from "@/components/ChairTypeIndicator";
import { cn } from "@/lib/utils";

type SeatUnavailableReason = "reserved" | "cleaning" | "maintenance" | "out_of_service";

const unavailableMeta: Record<SeatUnavailableReason, { label: string; className: string }> = {
  reserved: { label: "Trùng lịch", className: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200" },
  cleaning: { label: "Đang vệ sinh", className: "bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-200" },
  maintenance: { label: "Bảo trì", className: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200" },
  out_of_service: { label: "Ngưng hoạt động", className: "bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-200" },
};

export function SeatCard({ chair, selected, current, unavailableReason, onSelect }: {
  chair: DentalChair;
  selected: boolean;
  current: boolean;
  unavailableReason?: SeatUnavailableReason;
  onSelect: () => void;
}) {
  const disabled = current || Boolean(unavailableReason);
  const status = current
    ? { label: "Ghế hiện tại", className: "bg-muted text-muted-foreground" }
    : unavailableReason
      ? unavailableMeta[unavailableReason]
      : { label: "Khả dụng", className: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200" };

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onSelect}
      aria-pressed={selected}
      className={cn(
        "rounded-xl border p-3 text-left transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        disabled ? "cursor-not-allowed opacity-60" : "hover:border-primary/50 hover:bg-muted/50 active:scale-[0.98]",
        selected ? "border-primary bg-primary/5 ring-1 ring-primary dark:bg-primary/10" : "border-border bg-card",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate font-semibold">{chair.name}</p>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">{chair.room_name ?? "Chưa gán phòng"}</p>
        </div>
        {selected && <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground" aria-label="Đã chọn">
          <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" d="m5 12 4.5 4.5L19 7" /></svg>
        </span>}
      </div>
      <div className="mt-3 flex items-center justify-between gap-2">
        <ChairTypeIndicator type={chair.chair_type} className="min-w-0 text-xs text-muted-foreground" />
        <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${status.className}`}>{status.label}</span>
      </div>
    </button>
  );
}
