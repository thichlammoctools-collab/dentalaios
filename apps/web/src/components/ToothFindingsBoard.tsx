import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { FindingsList } from "@/components/FindingsList";
import { getFindingCategory } from "@shared/constants/clinical-findings";
import type { ClinicalFinding, FindingCategory } from "@shared/types";

/**
 * FDI tooth number layout. Kept in-file to avoid coupling ToothFindingsBoard to
 * FdiToothChart internals; the two components render independent visuals.
 */
const ADULT_UPPER_RIGHT = [18, 17, 16, 15, 14, 13, 12, 11];
const ADULT_UPPER_LEFT = [21, 22, 23, 24, 25, 26, 27, 28];
const ADULT_LOWER_RIGHT = [48, 47, 46, 45, 44, 43, 42, 41];
const ADULT_LOWER_LEFT = [31, 32, 33, 34, 35, 36, 37, 38];
const PRIMARY_UPPER_RIGHT = [55, 54, 53, 52, 51];
const PRIMARY_UPPER_LEFT = [61, 62, 63, 64, 65];
const PRIMARY_LOWER_RIGHT = [85, 84, 83, 82, 81];
const PRIMARY_LOWER_LEFT = [71, 72, 73, 74, 75];

type CategoryFilter = "all" | "tooth_hard_tissue" | "periodontal";

interface ToothFindingsBoardProps {
  visitId: string;
  findings: ClinicalFinding[];
  readOnly?: boolean;
  onUpdate: (finding: ClinicalFinding) => void;
  onDeleted: (id: string) => void;
  onRequestOpenTooth: (tooth: number) => void;
}

export function ToothFindingsBoard({ visitId, findings, readOnly = false, onUpdate, onDeleted, onRequestOpenTooth }: ToothFindingsBoardProps) {
  const [selectedTooth, setSelectedTooth] = useState<number | null>(null);
  const [filter, setFilter] = useState<CategoryFilter>("all");

  // Findings scoped to a specific tooth (tooth_hard_tissue + periodontal recorded per tooth).
  const toothFindings = useMemo(
    () => findings.filter((finding) => finding.scope === "tooth" && typeof finding.tooth_number === "number"),
    [findings],
  );

  const filteredFindings = useMemo(
    () => (filter === "all" ? toothFindings : toothFindings.filter((finding) => finding.category === filter)),
    [toothFindings, filter],
  );

  const findingsByTooth = useMemo(() => {
    const map = new Map<number, ClinicalFinding[]>();
    for (const finding of filteredFindings) {
      const tooth = finding.tooth_number as number;
      const bucket = map.get(tooth) ?? [];
      bucket.push(finding);
      map.set(tooth, bucket);
    }
    return map;
  }, [filteredFindings]);

  const recordedTeeth = useMemo(
    () => [...findingsByTooth.keys()].sort((a, b) => a - b),
    [findingsByTooth],
  );

  const primaryHasData = useMemo(
    () => recordedTeeth.some((tooth) => tooth >= 51),
    [recordedTeeth],
  );

  const activeFindings = selectedTooth != null ? findingsByTooth.get(selectedTooth) ?? [] : [];
  const dominantCategory = selectedTooth != null ? dominantCategoryFor(findingsByTooth.get(selectedTooth) ?? []) : null;

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)]">
      <div className="space-y-3">
        <FilterToolbar filter={filter} onChange={setFilter} totalTeeth={recordedTeeth.length} totalFindings={filteredFindings.length} />
        <div className="rounded-lg border border-border bg-card p-3">
          <p className="text-center text-xs font-medium text-muted-foreground">Sơ đồ FDI</p>
          <ToothRail heading="Hàm trên" leftGroup={ADULT_UPPER_RIGHT} rightGroup={ADULT_UPPER_LEFT} findingsByTooth={findingsByTooth} selectedTooth={selectedTooth} onSelect={setSelectedTooth} />
          <ToothRail heading="Hàm dưới" leftGroup={ADULT_LOWER_RIGHT} rightGroup={ADULT_LOWER_LEFT} findingsByTooth={findingsByTooth} selectedTooth={selectedTooth} onSelect={setSelectedTooth} />
          <details className="mt-3 border-t border-border pt-3" open={primaryHasData}>
            <summary className="cursor-pointer text-center text-[11px] font-medium text-muted-foreground">Răng sữa{primaryHasData ? " (có ghi nhận)" : ""}</summary>
            <ToothRail heading="Hàm trên" leftGroup={PRIMARY_UPPER_RIGHT} rightGroup={PRIMARY_UPPER_LEFT} findingsByTooth={findingsByTooth} selectedTooth={selectedTooth} onSelect={setSelectedTooth} />
            <ToothRail heading="Hàm dưới" leftGroup={PRIMARY_LOWER_RIGHT} rightGroup={PRIMARY_LOWER_LEFT} findingsByTooth={findingsByTooth} selectedTooth={selectedTooth} onSelect={setSelectedTooth} />
          </details>
        </div>
        <QuickJumpRow teeth={recordedTeeth} findingsByTooth={findingsByTooth} selectedTooth={selectedTooth} onSelect={setSelectedTooth} />
      </div>

      <div className="rounded-lg border border-border bg-card">
        {selectedTooth == null ? (
          <EmptyPaneHint totalTeeth={recordedTeeth.length} />
        ) : (
          <div className="flex h-full flex-col gap-3 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Badge variant="outline">Răng #{selectedTooth}</Badge>
                {activeFindings.length > 0 && <Badge variant="secondary">{activeFindings.length} ghi nhận</Badge>}
                {dominantCategory && <Badge variant="secondary">{getFindingCategory(dominantCategory).label}</Badge>}
              </div>
              <Button variant="ghost" size="sm" onClick={() => setSelectedTooth(null)}>Bỏ chọn</Button>
            </div>
            {activeFindings.length > 0 ? (
              <FindingsList
                visitId={visitId}
                findings={activeFindings}
                readOnly={readOnly}
                onUpdate={onUpdate}
                onDeleted={onDeleted}
                flat
              />
            ) : (
              <div className="flex flex-1 flex-col items-center justify-center gap-3 rounded-md border border-dashed border-border p-6 text-center">
                <p className="text-sm font-medium">Chưa có ghi nhận cho răng #{selectedTooth}.</p>
                <p className="text-xs text-muted-foreground">Ghi nhận mới sẽ được tạo qua sơ đồ FDI ở trên để đảm bảo dữ liệu nhất quán.</p>
                {!readOnly && (
                  <Button size="sm" onClick={() => onRequestOpenTooth(selectedTooth)}>
                    Thêm ghi nhận cho răng #{selectedTooth}
                  </Button>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

interface ToothRailProps {
  heading: string;
  leftGroup: number[];
  rightGroup: number[];
  findingsByTooth: Map<number, ClinicalFinding[]>;
  selectedTooth: number | null;
  onSelect: (tooth: number) => void;
}

function ToothRail({ heading, leftGroup, rightGroup, findingsByTooth, selectedTooth, onSelect }: ToothRailProps) {
  return (
    <div className="mt-2">
      <p className="mb-1 text-center text-[11px] text-muted-foreground">{heading}</p>
      <div className="flex min-w-max justify-center gap-0.5">
        {leftGroup.map((tooth) => (
          <ToothButton key={tooth} tooth={tooth} findings={findingsByTooth.get(tooth) ?? []} selected={selectedTooth === tooth} onSelect={onSelect} />
        ))}
        <div aria-hidden="true" className="mx-1 w-px self-stretch bg-border" />
        {rightGroup.map((tooth) => (
          <ToothButton key={tooth} tooth={tooth} findings={findingsByTooth.get(tooth) ?? []} selected={selectedTooth === tooth} onSelect={onSelect} />
        ))}
      </div>
    </div>
  );
}

interface ToothButtonProps {
  tooth: number;
  findings: ClinicalFinding[];
  selected: boolean;
  onSelect: (tooth: number) => void;
}

function ToothButton({ tooth, findings, selected, onSelect }: ToothButtonProps) {
  const count = findings.length;
  const isMissing = findings.some((finding) => finding.condition === "missing");
  const label = count > 0
    ? `Răng ${tooth}, ${count} ghi nhận${isMissing ? " (đã mất)" : ""}`
    : `Răng ${tooth}, chưa có ghi nhận`;
  return (
    <button
      type="button"
      onClick={() => onSelect(tooth)}
      aria-label={label}
      aria-pressed={selected}
      className={cn(
        "relative flex h-9 w-9 items-center justify-center rounded border font-mono text-xs font-semibold transition-colors sm:h-10 sm:w-10",
        selected && "ring-2 ring-primary ring-offset-2 ring-offset-card",
        isMissing
          ? "border-red-500 bg-red-50 text-red-800 dark:border-red-800 dark:bg-red-950/60 dark:text-red-300"
          : count > 0
            ? "border-primary/60 bg-primary/10 text-foreground"
            : "border-dashed border-border bg-background text-muted-foreground hover:border-primary hover:text-foreground",
      )}
    >
      {tooth}
      {count > 1 && (
        <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground">
          {count}
        </span>
      )}
    </button>
  );
}

interface FilterToolbarProps {
  filter: CategoryFilter;
  onChange: (filter: CategoryFilter) => void;
  totalTeeth: number;
  totalFindings: number;
}

function FilterToolbar({ filter, onChange, totalTeeth, totalFindings }: FilterToolbarProps) {
  const options: { value: CategoryFilter; label: string }[] = [
    { value: "all", label: "Tất cả" },
    { value: "tooth_hard_tissue", label: "Răng & mô cứng" },
    { value: "periodontal", label: "Nha chu" },
  ];
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-muted/20 p-2 text-xs">
      <div className="flex flex-wrap gap-1">
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            aria-pressed={filter === option.value}
            className={cn(
              "rounded-md px-2 py-1 text-[11px] font-medium transition-colors",
              filter === option.value
                ? "bg-background text-foreground shadow-sm ring-1 ring-border"
                : "text-muted-foreground hover:bg-background/60",
            )}
          >
            {option.label}
          </button>
        ))}
      </div>
      <span className="text-[11px] text-muted-foreground">{totalTeeth} răng · {totalFindings} ghi nhận</span>
    </div>
  );
}

interface QuickJumpRowProps {
  teeth: number[];
  findingsByTooth: Map<number, ClinicalFinding[]>;
  selectedTooth: number | null;
  onSelect: (tooth: number) => void;
}

function QuickJumpRow({ teeth, findingsByTooth, selectedTooth, onSelect }: QuickJumpRowProps) {
  if (teeth.length === 0) return null;
  return (
    <div className="rounded-lg border border-border bg-muted/20 p-2">
      <p className="mb-1 text-[11px] font-medium text-muted-foreground">Nhảy nhanh tới răng đã ghi nhận</p>
      <div className="flex flex-wrap gap-1">
        {teeth.map((tooth) => {
          const count = findingsByTooth.get(tooth)?.length ?? 0;
          return (
            <button
              key={tooth}
              type="button"
              onClick={() => onSelect(tooth)}
              aria-pressed={selectedTooth === tooth}
              className={cn(
                "rounded-full border px-2 py-0.5 text-[11px] font-medium transition-colors",
                selectedTooth === tooth
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-background text-foreground hover:border-primary",
              )}
            >
              #{tooth}
              {count > 1 && <span className="ml-1 text-[10px] text-muted-foreground">×{count}</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function EmptyPaneHint({ totalTeeth }: { totalTeeth: number }) {
  return (
    <div className="flex h-full min-h-40 flex-col items-center justify-center gap-2 p-6 text-center">
      <p className="text-sm font-medium">Chọn một răng để xem chi tiết.</p>
      <p className="text-xs text-muted-foreground">
        {totalTeeth > 0
          ? `Đang có ghi nhận trên ${totalTeeth} răng. Bấm răng bất kỳ trên sơ đồ hoặc trong danh sách "Nhảy nhanh".`
          : "Chưa có răng nào được ghi nhận. Sử dụng sơ đồ FDI phía trên để thêm ghi nhận mới."}
      </p>
    </div>
  );
}

function dominantCategoryFor(findings: ClinicalFinding[]): FindingCategory | null {
  if (findings.length === 0) return null;
  const counts = new Map<FindingCategory, number>();
  for (const finding of findings) {
    counts.set(finding.category, (counts.get(finding.category) ?? 0) + 1);
  }
  let best: FindingCategory | null = null;
  let bestCount = 0;
  for (const [category, count] of counts) {
    if (count > bestCount) {
      best = category;
      bestCount = count;
    }
  }
  return best;
}
