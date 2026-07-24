import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { PageContainer } from "@/components/PageContainer";
import { AiTreatmentPlanSuggest, type TreatmentPlanItemDraft } from "@/components/AiTreatmentPlanSuggest";
import { apiGet, apiPost, ApiError } from "@/lib/api";
import { toast } from "@/lib/toast";
import type { TreatmentPlan } from "@shared/types";
import { isValidFdiTooth } from "@shared/constants";

export function TreatmentPlanAiPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [plan, setPlan] = useState<TreatmentPlan | null>(null);
  const [loading, setLoading] = useState(true);
  const [applying, setApplying] = useState(false);

  async function load() {
    if (!id) return;
    setLoading(true);
    try {
      const p = await apiGet<TreatmentPlan>(`/api/treatment-plans/${id}`);
      setPlan(p);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Lỗi tải plan");
      if (err instanceof ApiError && err.status === 404) {
        navigate("/");
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function onApply(items: TreatmentPlanItemDraft[]) {
    if (!plan) return;
    const invalidItem = items.find((item) =>
      (item.tooth != null && !isValidFdiTooth(item.tooth))
      || !item.procedure.trim()
       || !item.description.trim()
       || !Number.isFinite(item.cost)
       || item.cost < 0
       || !Number.isInteger(item.estimated_duration_min)
       || (item.estimated_duration_min ?? 0) < 1
       || (item.estimated_duration_min ?? 0) > 480,
    );
    if (invalidItem) {
      toast.error("Một gợi ý AI có dữ liệu không hợp lệ. Vui lòng tạo lại gợi ý.");
      return;
    }
    setApplying(true);
    try {
      await apiPost(`/api/treatment-plans/${plan.id}/items/batch`, {
        items: items.map((item) => ({
          tooth_number: item.tooth,
          service_code: item.service_code,
          procedure: item.procedure,
          description: item.description,
          unit_cost: item.cost,
          estimated_duration_min: item.estimated_duration_min,
        })),
      });
      // Redirect back to plan detail
      navigate(`/treatment-plans/${plan.id}`);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Lỗi thêm hạng mục");
    } finally {
      setApplying(false);
    }
  }

  if (loading || !plan) {
    return (
      <PageContainer size="workspace">
        <p className="text-sm text-muted-foreground">Đang tải…</p>
      </PageContainer>
    );
  }

  if (!plan.visit_id) {
    return (
      <PageContainer size="workspace">
        <Breadcrumbs
          items={[
            { label: "Bệnh nhân", href: `/patients/${plan.patient_id}` },
            { label: "Kế hoạch", href: `/treatment-plans/${plan.id}` },
            { label: "AI Gợi ý" },
          ]}
        />
        <Card>
          <CardContent className="p-6">
            <p className="text-sm text-muted-foreground">
              Kế hoạch này không có visit liên kết. AI cần clinical findings từ visit để tạo gợi ý.
            </p>
            <Button
              variant="outline"
              className="mt-4"
              onClick={() => navigate(`/treatment-plans/${plan.id}`)}
            >
              ← Quay lại kế hoạch
            </Button>
          </CardContent>
        </Card>
      </PageContainer>
    );
  }

  return (
    <PageContainer size="workspace">
      <Breadcrumbs
        items={[
          { label: "Bệnh nhân", href: `/patients/${plan.patient_id}` },
          { label: "Kế hoạch", href: `/treatment-plans/${plan.id}` },
          { label: "AI Gợi ý" },
        ]}
      />

      <div>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              AI Gợi ý Kế hoạch điều trị
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              AI phân tích clinical findings và đề xuất hạng mục điều trị chi tiết
            </p>
          </div>
          <Button
            variant="outline"
            onClick={() => navigate(`/treatment-plans/${plan.id}`)}
          >
            ← Quay lại
          </Button>
        </div>
      </div>

      {applying && (
        <Card className="border-blue-200 bg-blue-50 dark:border-blue-900 dark:bg-blue-950/40">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
            <span className="text-sm font-medium text-blue-900 dark:text-blue-300">
              Đang thêm hạng mục vào kế hoạch...
            </span>
          </CardContent>
        </Card>
      )}

      <AiTreatmentPlanSuggest visitId={plan.visit_id} onApply={onApply} />

      <Card>
        <CardContent className="p-4">
          <div className="text-sm text-muted-foreground space-y-2">
            <p className="font-medium">💡 Lưu ý:</p>
            <ul className="list-disc list-inside space-y-1 ml-2">
              <li>AI phân tích dựa trên clinical findings từ lượt khám</li>
              <li>Gợi ý ưu tiên danh mục dịch vụ điều trị đang hoạt động và dùng đúng đơn giá của phòng khám</li>
              <li>Bạn có thể bỏ chọn các hạng mục không phù hợp trước khi áp dụng</li>
              <li>Sau khi áp dụng, bạn có thể xem và chỉnh sửa trong trang chi tiết kế hoạch</li>
            </ul>
          </div>
        </CardContent>
      </Card>
    </PageContainer>
  );
}
