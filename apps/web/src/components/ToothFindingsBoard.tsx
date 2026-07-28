import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { FindingsList } from "@/components/FindingsList";
import { getFindingCategory, getFindingConditionLabel } from "@shared/constants/clinical-findings";
import type { ClinicalFinding, FindingCategory } from "@shared/types";

type CategoryFilter = "all" | "tooth_hard_tissue" | "periodontal";
type ToothGroup = "upper" | "lower" | "primary";

interface ToothFindingsBoardProps {
  visitId: string;
  findings: ClinicalFinding[];
  readOnly?: boolean;
  onUpdate: (finding: ClinicalFinding) => void;
  onDeleted: (id: string) => void;
}

interface ToothSummary {
  tooth: number;
  findings: ClinicalFinding[];
  latest: ClinicalFinding;
  categories: FindingCategory[];
}

const TOOTH_GROUPS: Array<{ id: ToothGroup; label: string }> = [
  { id: "upper", label: "Hàm trên" },
  { id: "lower", label: "Hàm dưới" },
  { id: "primary", label: "Răng sữa" },
];

export function ToothFindingsBoard({ visitId, findings, readOnly = false, onUpdate, onDeleted }: ToothFindingsBoardProps) {
  const [selectedTooth, setSelectedTooth] = useState<number | null>(null);
  const [filter, setFilter] = useState<CategoryFilter>("all");

  const toothFindings = useMemo(
    () => findings.filter((finding) => finding.scope === "tooth" && typeof finding.tooth_number === "number"),
    [findings],
  );

  const filteredFindings = useMemo(
    () => filter === "all" ? toothFindings : toothFindings.filter((finding) => finding.category === filter),
    [toothFindings, filter],
  );

  const summaries = useMemo(() => {
    const byTooth = new Map<number, ClinicalFinding[]>();
    for (const finding of filteredFindings) {
      const tooth = finding.tooth_number as number;
      byTooth.set(tooth, [...(byTooth.get(tooth) ?? []), finding]);
    }

    return [...byTooth.entries()]
      .map(([tooth, items]) => {
        const sorted = [...items].sort((a, b) => findingTimestamp(b) - findingTimestamp(a));
        return {
          tooth,
          findings: sorted,
          latest: sorted[0],
          categories: [...new Set(sorted.map((finding) => finding.category))],
        };
      })
      .sort((a, b) => a.tooth - b.tooth);
  }, [filteredFindings]);

  const summariesByGroup = useMemo(() => {
    const groups = new Map<ToothGroup, ToothSummary[]>();
    for (const group of TOOTH_GROUPS) groups.set(group.id, []);
    for (const summary of summaries) groups.get(toothGroup(summary.tooth))?.push(summary);
    return groups;
  }, [summaries]);

  return (
    <div className="space-y-4">
      <FilterToolbar filter={filter} onChange={setFilter} totalTeeth={summaries.length} totalFindings={filteredFindings.length} />

      {summaries.length === 0 ? (
        <EmptyState hasFindings={toothFindings.length > 0} />
      ) : (
        <div className="overflow-hidden rounded-lg border border-border">
          {TOOTH_GROUPS.map((group) => {
            const items = summariesByGroup.get(group.id) ?? [];
            if (!items.length) return null;
            return (
              <ToothSummaryGroup
                key={group.id}
                label={group.label}
                items={items}
                selectedTooth={selectedTooth}
                onSelect={setSelectedTooth}
                visitId={visitId}
                readOnly={readOnly}
                onUpdate={onUpdate}
                onDeleted={onDeleted}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

interface ToothSummaryGroupProps {
  label: string;
  items: ToothSummary[];
  selectedTooth: number | null;
  onSelect: (tooth: number | null) => void;
  visitId: string;
  readOnly: boolean;
  onUpdate: (finding: ClinicalFinding) => void;
  onDeleted: (id: string) => void;
}

function ToothSummaryGroup({ label, items, selectedTooth, onSelect, visitId, readOnly, onUpdate, onDeleted }: ToothSummaryGroupProps) {
  return (
    <section className="border-b border-border last:border-b-0">
      <div className="flex items-center justify-between border-y border-border bg-muted/40 px-4 py-2.5 first:border-t-0">
        <div className="flex items-center gap-2.5"><span className="h-5 w-1 rounded-full bg-primary/80" aria-hidden="true" /><h3 className="text-sm font-semibold tracking-tight">{label}</h3></div>
        <span className="rounded-full border border-border bg-background/70 px-2 py-0.5 text-xs font-medium tabular-nums text-muted-foreground">{items.length} răng</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[38rem] text-left text-sm" style={{ tableLayout: "fixed" }}>
          <thead className="border-b border-border bg-muted/10 text-xs text-muted-foreground">
            <tr>
              <th scope="col" className="w-20 px-3 py-2 font-medium">Răng</th>
              <th scope="col" className="w-[10rem] px-3 py-2 font-medium">Loại ghi nhận</th>
              <th scope="col" className="px-3 py-2 font-medium">Ghi nhận mới nhất</th>
              <th scope="col" className="w-16 px-3 py-2 text-right font-medium">Số lượng</th>
            </tr>
          </thead>
          <tbody>
            {items.map((summary) => {
              const isSelected = selectedTooth === summary.tooth;
              return (
                <ToothSummaryRow
                  key={summary.tooth}
                  summary={summary}
                  isSelected={isSelected}
                  onToggle={() => onSelect(isSelected ? null : summary.tooth)}
                  onClose={() => onSelect(null)}
                  visitId={visitId}
                  readOnly={readOnly}
                  onUpdate={onUpdate}
                  onDeleted={onDeleted}
                />
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

interface ToothSummaryRowProps {
  summary: ToothSummary;
  isSelected: boolean;
  onToggle: () => void;
  onClose: () => void;
  visitId: string;
  readOnly: boolean;
  onUpdate: (finding: ClinicalFinding) => void;
  onDeleted: (id: string) => void;
}

function ToothSummaryRow({ summary, isSelected, onToggle, onClose, visitId, readOnly, onUpdate, onDeleted }: ToothSummaryRowProps) {
  return (
    <>
      <tr
        tabIndex={0}
        aria-selected={isSelected}
        onClick={onToggle}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            onToggle();
          }
        }}
        className={cn(
          "cursor-pointer border-b border-border/70 outline-none transition-colors last:border-b-0 hover:bg-muted/35 focus-visible:bg-muted/50 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary",
          isSelected && "bg-primary/10 shadow-[inset_3px_0_0_hsl(var(--primary))] hover:bg-primary/10",
        )}
      >
        <td className="px-3 py-3"><span className={cn("inline-flex min-w-11 items-center justify-center rounded-md border px-2 py-1 font-mono text-sm font-semibold tabular-nums", isSelected ? "border-primary/40 bg-primary/10 text-primary" : "border-border bg-muted/30")}>#{summary.tooth}</span></td>
        <td className="px-3 py-3"><div className="flex flex-wrap gap-1.5">{summary.categories.map((category) => <CategoryBadge key={category} category={category} />)}</div></td>
        <td className="px-3 py-3">
          <p className="font-medium leading-tight">{getFindingConditionLabel(summary.latest.category, summary.latest.condition)}</p>
          <p className="mt-1 text-xs text-muted-foreground">Cập nhật {formatFindingDate(summary.latest)}</p>
        </td>
        <td className="px-3 py-3 text-right"><span className={cn("inline-flex min-w-6 justify-center rounded-md border px-1.5 py-0.5 text-xs font-semibold tabular-nums", isSelected ? "border-primary bg-primary text-primary-foreground" : "border-border bg-muted/20 text-muted-foreground")}>{summary.findings.length}</span></td>
      </tr>
      {isSelected && (
        <tr>
          <td colSpan={4} className="bg-primary/[0.035] p-0">
            <div className="border-t border-primary/20 px-4 py-4">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline">Răng #{summary.tooth}</Badge>
                  <Badge variant="secondary">{summary.findings.length} ghi nhận</Badge>
                  {summary.categories.map((category) => <CategoryBadge key={category} category={category} />)}
                </div>
                <Button variant="ghost" size="sm" onClick={onClose}>Đóng chi tiết</Button>
              </div>
              <FindingsList
                visitId={visitId}
                findings={summary.findings}
                readOnly={readOnly}
                onUpdate={onUpdate}
                onDeleted={onDeleted}
                flat
              />
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

function CategoryBadge({ category }: { category: FindingCategory }) {
  const tones: Partial<Record<FindingCategory, string>> = {
    tooth_hard_tissue: "border-sky-500/25 bg-sky-500/10 text-sky-700 dark:text-sky-300",
    periodontal: "border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  };
  return <span className={cn("inline-flex rounded-md border px-1.5 py-0.5 text-[11px] font-medium", tones[category] ?? "border-border bg-muted text-muted-foreground")}>{getFindingCategory(category).label}</span>;
}

interface FilterToolbarProps {
  filter: CategoryFilter;
  onChange: (filter: CategoryFilter) => void;
  totalTeeth: number;
  totalFindings: number;
}

function FilterToolbar({ filter, onChange, totalTeeth, totalFindings }: FilterToolbarProps) {
  const options: Array<{ value: CategoryFilter; label: string }> = [
    { value: "all", label: "Tất cả" },
    { value: "tooth_hard_tissue", label: "Răng & mô cứng" },
    { value: "periodontal", label: "Nha chu" },
  ];
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-muted/20 px-3 py-2.5 text-xs">
      <div className="flex flex-wrap gap-1">
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            aria-pressed={filter === option.value}
            className={cn(
              "rounded-md px-2.5 py-1.5 text-[11px] font-medium transition-colors",
              filter === option.value ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:bg-background/60 hover:text-foreground",
            )}
          >
            {option.label}
          </button>
        ))}
      </div>
      <span className="rounded-full bg-background/70 px-2 py-1 text-[11px] font-medium tabular-nums text-muted-foreground">{totalTeeth} răng · {totalFindings} ghi nhận</span>
    </div>
  );
}

function EmptyState({ hasFindings }: { hasFindings: boolean }) {
  return (
    <div className="rounded-lg border border-dashed border-border px-6 py-10 text-center">
      <p className="text-sm font-medium">{hasFindings ? "Không có ghi nhận phù hợp với bộ lọc." : "Chưa có ghi nhận theo răng."}</p>
      <p className="mt-1 text-xs text-muted-foreground">Sử dụng sơ đồ FDI phía trên để tạo ghi nhận mới, sau đó xem tóm tắt và chi tiết tại đây.</p>
    </div>
  );
}

function toothGroup(tooth: number): ToothGroup {
  if (tooth >= 51) return "primary";
  return tooth >= 31 ? "lower" : "upper";
}

function findingTimestamp(finding: ClinicalFinding): number {
  return new Date(finding.clinical_effective_at ?? finding.created_at).getTime();
}

function formatFindingDate(finding: ClinicalFinding): string {
  const value = finding.clinical_effective_at ?? finding.created_at;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Chưa rõ thời điểm";
  return new Intl.DateTimeFormat("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric" }).format(date);
}
