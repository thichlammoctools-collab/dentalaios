import { useParams } from "react-router-dom";
import { PlaceholderPage } from "@/components/PlaceholderPage";

export function PatientDetailPage() {
  const { id } = useParams();
  return (
    <PlaceholderPage
      title="Hồ sơ bệnh nhân"
      breadcrumb={`Bệnh nhân / ${id}`}
      description="Thông tin cá nhân, lịch sử khám, cảnh báo y khoa, danh sách kế hoạch điều trị, thanh toán."
    >
      Tabs (info / visits / plans / payments) sẽ được triển khai ở Phase 3.
    </PlaceholderPage>
  );
}