import { useParams } from "react-router-dom";
import { PlaceholderPage } from "@/components/PlaceholderPage";

export function VisitDetailPage() {
  const { id } = useParams();
  return (
    <PlaceholderPage
      title="Chi tiết lượt khám"
      breadcrumb={`Lượt khám / ${id}`}
      description="Bảng răng FDI, ghi nhận clinical finding theo từng răng, tạo kế hoạch điều trị từ lượt khám này."
    >
      Sơ đồ FDI và form finding sẽ được triển khai ở Phase 4.
    </PlaceholderPage>
  );
}