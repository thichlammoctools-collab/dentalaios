import { Link } from "react-router-dom";
import { PlaceholderPage } from "@/components/PlaceholderPage";

export function NotFoundPage() {
  return (
    <PlaceholderPage
      title="404 — Không tìm thấy"
      description="Đường dẫn không tồn tại hoặc đã bị thay đổi."
    >
      <Link to="/today" className="text-primary underline">
        Về Today dashboard
      </Link>
    </PlaceholderPage>
  );
}