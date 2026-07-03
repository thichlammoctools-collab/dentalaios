import { PlaceholderPage } from "@/components/PlaceholderPage";

export function UsersSettingsPage() {
  return (
    <PlaceholderPage
      title="Quản lý người dùng"
      breadcrumb="Cài đặt / Người dùng"
      description="Tạo user, gán role, gán branch. Admin only — RBAC middleware sẽ chặn nếu không phải admin."
    >
      CRUD user sẽ được triển khai ở Phase 5.
    </PlaceholderPage>
  );
}