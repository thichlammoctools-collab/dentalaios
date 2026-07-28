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

  const selectedSummary = summaries.find((summary) => summary.tooth === selectedTooth) ?? null;

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
              />
            );
          })}
        </div>
      )}

      {selectedSummary && (
        <section aria-label={`Chi tiết ghi nhận răng ${selectedSummary.tooth}`} className="rounded-lg border border-border bg-card p-4">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline">Răng #{selectedSummary.tooth}</Badge>
              <Badge variant="secondary">{selectedSummary.findings.length} ghi nhận</Badge>
              {selectedSummary.categories.map((category) => <Badge key={category} variant="secondary">{getFindingCategory(category).label}</Badge>)}
            </div>
            <Button variant="ghost" size="sm" onClick={() => setSelectedTooth(null)}>Đóng chi tiết</Button>
          </div>
          <FindingsList
            visitId={visitId}
            findings={selectedSummary.findings}
            readOnly={readOnly}
            onUpdate={onUpdate}
            onDeleted={onDeleted}
            flat
          />
        </section>
      )}
    </div>
  );
}

interface ToothSummaryGroupProps {
  label: string;
  items: ToothSummary[];
  selectedTooth: number | null;
  onSelect: (tooth: number) => void;
}

function ToothSummaryGroup({ label, items, selectedTooth, onSelect }: ToothSummaryGroupProps) {
  return (
    <section className="border-b border-border last:border-b-0">
      <div className="flex items-center justify-between bg-muted/30 px-3 py-2">
        <h3 className="text-sm font-semibold">{label}</h3>
        <span className="text-xs text-muted-foreground">{items.length} răng</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[38rem] text-left text-sm" style={{ tableLayout: "fixed" }}>
          <thead className="border-b border-border text-xs text-muted-foreground">
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
                <tr
                  key={summary.tooth}
                  tabIndex={0}
                  aria-selected={isSelected}
                  onClick={() => onSelect(summary.tooth)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      onSelect(summary.tooth);
                    }
                  }}
                  className={cn(
                    "cursor-pointer border-b border-border/70 outline-none transition-colors last:border-b-0 hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary",
                    isSelected && "bg-primary/10 hover:bg-primary/10",
                  )}
                >
                  <td className="px-3 py-3"><span className="font-mono font-semibold">#{summary.tooth}</span></td>
                  <td className="px-3 py-3"><div className="flex flex-wrap gap-1">{summary.categories.map((category) => <Badge key={category} variant="secondary">{getFindingCategory(category).label}</Badge>)}</div></td>
                  <td className="px-3 py-3">
                    <p className="font-medium">{getFindingConditionLabel(summary.latest.category, summary.latest.condition)}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">{formatFindingDate(summary.latest)}</p>
                  </td>
                  <td className="px-3 py-3 text-right"><Badge variant={isSelected ? "default" : "outline"}>{summary.findings.length}</Badge></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
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
              filter === option.value ? "bg-background text-foreground shadow-sm ring-1 ring-border" : "text-muted-foreground hover:bg-background/60",
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
