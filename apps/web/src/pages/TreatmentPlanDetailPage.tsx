import { useParams } from "react-router-dom";
import { PlaceholderPage } from "@/components/PlaceholderPage";

export function TreatmentPlanDetailPage() {
  const { id } = useParams();
  return (
    <PlaceholderPage
      title="Kế hoạch điều trị"
      breadcrumb={`Kế hoạch / ${id}`}
      description="Danh sách thủ thuật theo răng, tổng chi phí, thanh toán, trạng thái duyệt, generate proposal PDF, tạo Lark handover task."
    >
      Workflow duyệt + PDF + Lark sẽ được triển khai ở Phase 4.
    </PlaceholderPage>
  );
}