import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { apiPost, ApiError } from "@/lib/api";
import { toast } from "@/lib/toast";
import { formatCurrency } from "@/lib/utils";

export interface TreatmentPlanItemDraft {
  tooth: number | null;
  service_code?: string;
  service_name?: string;
  procedure: string;
  description: string;
  cost: number;
}

export interface GeneratePlanResult {
  items: TreatmentPlanItemDraft[];
  notes: string;
  ai_model: string;
  generated_at: string;
}

interface AiTreatmentPlanSuggestProps {
  visitId: string;
  onApply: (items: TreatmentPlanItemDraft[]) => void;
}

export function AiTreatmentPlanSuggest({ visitId, onApply }: AiTreatmentPlanSuggestProps) {
  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState<GeneratePlanResult | null>(null);
  const [selectedItems, setSelectedItems] = useState<Set<number>>(new Set());

  async function generate() {
    setGenerating(true);
    setResult(null);
    setSelectedItems(new Set());
    try {
      const res = await apiPost<GeneratePlanResult>("/api/ai/generate-plan", {
        visit_id: visitId,
      });
      setResult(res);
      // Select all items by default
      setSelectedItems(new Set(res.items.map((_, idx) => idx)));
      toast.success("AI đã tạo gợi ý kế hoạch điều trị");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Lỗi tạo gợi ý");
    } finally {
      setGenerating(false);
    }
  }

  function toggleItem(index: number) {
    setSelectedItems((prev) => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  }

  function apply() {
    if (!result) return;
    const selected = result.items.filter((_, idx) => selectedItems.has(idx));
    if (selected.length === 0) {
      toast.error("Vui lòng chọn ít nhất 1 hạng mục");
      return;
    }
    onApply(selected);
  }

  function reset() {
    setResult(null);
    setSelectedItems(new Set());
  }

  const totalCost = result
    ? result.items
        .filter((_, idx) => selectedItems.has(idx))
        .reduce((sum, item) => sum + item.cost, 0)
    : 0;

  return (
    <Card className="border-purple-200 bg-gradient-to-br from-purple-50 to-blue-50 dark:border-purple-900 dark:from-purple-950/50 dark:to-blue-950/50">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-purple-600 to-blue-600 text-white text-sm">
            ✨
          </span>
          AI gợi ý kế hoạch điều trị
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          AI phân tích clinical findings và đề xuất các hạng mục điều trị phù hợp.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        {!result ? (
          <Button
            type="button"
            className="w-full bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700"
            disabled={generating}
            onClick={generate}
          >
            {generating ? (
              <>
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent mr-2" />
                Đang phân tích...
              </>
            ) : (
              "✨ Tạo gợi ý từ AI"
            )}
          </Button>
        ) : (
          <>
            {/* AI Notes */}
            {result.notes && (
              <div className="rounded-md border border-purple-200 bg-card p-3 text-sm dark:border-purple-900">
                <p className="font-medium text-purple-900 dark:text-purple-300 mb-1">Ghi chú từ AI:</p>
                <p className="text-muted-foreground">{result.notes}</p>
              </div>
            )}

            {/* Suggested Items Table */}
            <div className="rounded-md border border-purple-200 bg-card overflow-hidden dark:border-purple-900">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12"></TableHead>
                    <TableHead>Răng</TableHead>
                    <TableHead>Thủ thuật</TableHead>
                    <TableHead>Mô tả</TableHead>
                    <TableHead className="text-right">Chi phí</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {result.items.map((item, idx) => (
                    <TableRow
                      key={idx}
                      className={selectedItems.has(idx) ? "bg-purple-50 dark:bg-purple-950/40" : ""}
                    >
                      <TableCell>
                        <input
                          type="checkbox"
                          checked={selectedItems.has(idx)}
                          onChange={() => toggleItem(idx)}
                          className="h-4 w-4 accent-purple-600 cursor-pointer"
                        />
                      </TableCell>
                      <TableCell className="font-mono">
                        {item.tooth != null ? (
                          `#${item.tooth}`
                        ) : (
                          <span className="text-xs font-normal text-orange-700 dark:text-orange-300">
                            Toàn hàm
                          </span>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap items-center gap-1.5">
                          {item.service_code && <Badge variant="outline">{item.service_code}</Badge>}
                          <span>{item.service_name ?? item.procedure}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {item.description}
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        {formatCurrency(item.cost, "VND")}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {/* Summary */}
            <div className="flex items-center justify-between rounded-md border border-purple-200 bg-card p-3 dark:border-purple-900">
              <div className="text-sm">
                <span className="text-muted-foreground">Đã chọn: </span>
                <span className="font-medium">{selectedItems.size}/{result.items.length} hạng mục</span>
              </div>
              <div className="text-sm">
                <span className="text-muted-foreground">Tổng: </span>
                <span className="font-semibold text-lg">{formatCurrency(totalCost, "VND")}</span>
              </div>
            </div>

            {/* AI Model Info */}
            <div className="text-[10px] text-muted-foreground text-center">
              AI model: <span className="font-mono">{result.ai_model}</span> · Generated:{" "}
              {new Date(result.generated_at).toLocaleString("vi-VN")}
            </div>

            {/* Actions */}
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={reset}>
                Tạo lại
              </Button>
              <Button
                className="flex-1 bg-gradient-to-r from-purple-600 to-blue-600"
                onClick={apply}
                disabled={selectedItems.size === 0}
              >
                Áp dụng ({selectedItems.size})
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
