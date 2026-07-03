import { PlaceholderPage } from "@/components/PlaceholderPage";

export function LoginPage() {
  return (
    <PlaceholderPage
      title="Đăng nhập"
      description="Đăng nhập bằng email và mật khẩu. Sau khi xác thực, hệ thống sẽ cấp JWT kèm tenant_id và role để dùng cho mọi API call."
    >
      Form login sẽ được triển khai ở Phase 2.
    </PlaceholderPage>
  );
}