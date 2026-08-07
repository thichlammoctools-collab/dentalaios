# Kế hoạch: Phân quyền phòng khám có thể mở rộng

## Bối cảnh hiện tại

- RBAC là capability-based: `roles.permissions` là JSON và mọi route Worker dùng `requirePermission`/`requireAnyPermission`. `requireAuth` tái nạp role và permissions từ D1 trong production, nên thay đổi quyền có hiệu lực ngay, không chờ JWT hết hạn.
- `SYSTEM_ROLES` là catalog do nền tảng sở hữu. API role hiện chỉ cho phép tenant đổi tên/mô tả, không sửa permissions; đây là boundary đúng cần giữ.
- Platform đã có `platform_feature_flags` và `platform_tenant_feature_overrides`, được dùng cho Clinical Pathways. Đây là nền tảng entitlement/module enablement có thể tái sử dụng.
- Rủi ro hiện tại: cả `admin` và `manager` đều có `all`; do đó mọi capability phát hành trong tương lai tự mở cho Quản lý. Catalog/seed/migration cũng đang không đồng bộ hoàn toàn về permissions.

## Quyết định đã chốt

1. Tách rõ hai lớp:
   - **Entitlement module:** Platform Control quyết định tenant nào có module. Dùng feature flag có sẵn; module mới mặc định `default_enabled = false`, Platform bật theo tenant/gói/beta.
   - **Authorization:** Worker quyết định người dùng nào được đọc/thao tác. Capability catalog là platform-owned; clinic không tự tạo capability hay đổi capability cho role.
2. Áp dụng least privilege khi thêm tính năng:
   - Capability mới không tự thêm vào roles nghiệp vụ đang tồn tại.
   - Chỉ Admin có `all`; Admin được dùng module đã entitlement.
   - Các role còn lại chỉ nhận capability mới qua migration/catalog được review rõ ràng.
3. Quản lý không còn `all`. Bộ quyền mặc định chốt là:
   `read_patients`, `write_patients`, `write_appointments`, `manage_schedule`, `manage_users`, `manage_roles`, `view_management_dashboard`, `view_finance`.
   Không có `write_payments`, `manage_finance`, capability lâm sàng, ký duyệt, hay ký hồ sơ.
4. Thiết kế sẵn foundation cho data scope nhưng không thay đổi quyền truy cập bản ghi ở lần này. Policy chi tiết như “chỉ chi nhánh”, “ca điều trị được phân công”, hoặc “bản ghi của tôi” là giai đoạn kế tiếp.

## Kế hoạch thực hiện

1. Chuẩn hóa catalog authorization trong `src/shared/constants/index.ts`.
   - Giữ `PERMISSIONS` là danh mục typed duy nhất cho API/frontend.
   - Đổi `SYSTEM_ROLES.manager.permissions` sang bộ quyền đã chốt; chỉ `admin` giữ `all`.
   - Bổ sung metadata platform-owned cho capability (key, nhãn hiển thị, module/feature flag sở hữu, mức độ rủi ro, scope được hỗ trợ trong tương lai) thay vì để feature route/role scatter string literals. Không đưa metadata này vào JWT.
   - Quy định naming: `<domain>.<resource>.<action>` cho capability mới, hoặc giữ convention hiện hữu trong một migration chuyển đổi có chủ đích; không đồng thời dùng hai tên cho một thao tác.

2. Đồng bộ nguồn provision và dữ liệu đang tồn tại.
   - Thêm migration tuần tự mới để thay `all` bằng bộ permission tường minh của role có `system_key = 'manager'` ở mọi tenant.
   - Migration không thay đổi Admin, không ghi đè display name/description tùy biến, và idempotent trong quy trình deploy.
   - Cập nhật `src/db/seeds/0001_roles.sql`, `src/db/migrations/0018_system_roles.sql` (nếu migration baseline còn dùng trong reset/test), `register.service.ts`, và `platform-tenant-provision.service.ts` để role tạo mới luôn khớp catalog.
   - Rà lại các migration permission tích lũy (`0047`, `0056`, `0061`, `0066`, `0070`) để xác định capability nào là baseline cho từng role; gộp kết quả vào catalog/provision, không vô tình cấp quyền mới cho role cũ.

3. Chuẩn hóa entitlement module trên feature flag hiện có.
   - Giữ `platform_feature_flags` là registry module và `platform_tenant_feature_overrides` là quyết định enable/disable riêng tenant; không tạo bảng entitlement thứ hai.
   - Với mỗi module mới, migration tạo flag với mô tả, `default_enabled = false`; Platform Control mới có quyền bật/tắt override. Không expose API tenant-side cho việc này.
   - Thêm service/middleware `requireFeatureEnabled(flagKey)` dùng tenant từ auth context, đặt trước handler có dữ liệu hoặc mutation; trả 404 cho module chưa entitlement để không tiết lộ module chưa cấp.
   - Mỗi endpoint module được bảo vệ theo thứ tự: `requireAuth` -> `requireFeatureEnabled` -> `requirePermission` -> tenant/entity scope -> handler. UI chỉ dùng endpoint entitlement/read model để ẩn điều hướng, không là authority.
   - Gắn feature key với capability metadata để checklist phát hành bắt buộc chỉ ra cả entitlement và quyền thao tác.

4. Duy trì ranh giới roles và quản trị.
   - Tiếp tục chỉ liệt kê/sửa role `system_key IS NOT NULL`, và chỉ cho cập nhật name/description. Không thêm API tạo role custom hay sửa `permissions`.
   - `manage_roles` chỉ quản trị nhãn/mô tả role trong bản phát hành này; phải được audit như hiện tại. Nếu sau này cần role template tùy tenant, thiết kế riêng với capability allowlist, quyền không thể tự nâng cấp, thay đổi audit/review, và rollback.
   - Bổ sung audit platform cho thay đổi flag/override và audit tenant cho role metadata như đang có; audit chỉ ghi actor, tenant, action, flag/role ID và trạng thái trước/sau an toàn, không log dữ liệu lâm sàng hay permissions raw không cần thiết.

5. Đặt foundation cho data scope, chưa enforce policy mới.
   - Định nghĩa subject context tách từ permission: tenant bắt buộc, branch membership tương lai, và quan hệ clinical assignment/ownership tương lai.
   - Không dựa vào `branch_id` duy nhất trong JWT làm bằng chứng quyền đọc mọi dữ liệu; các repository/route mới phải tiếp tục tenant predicate và nhận scope context khi chính sách được triển khai.
   - Giai đoạn sau sẽ thêm membership nhiều chi nhánh và policy evaluator tập trung; capability vẫn là điều kiện cần, scope policy là điều kiện đủ. Không encode scope vào string permission như `read_patients_own`.

6. Áp dụng checklist bắt buộc cho mọi tính năng mới.
   - Xác định feature flag/module registry, default-disabled và tenant rollout cohort.
   - Khai báo capability tối thiểu trong catalog, mapping tường minh tới system role nếu có, và migration chỉ thêm mapping được phê duyệt.
   - Bảo vệ mọi API bằng entitlement + authorization; mọi query/mutation tiếp tục tenant-scoped; kiểm tra scope bản ghi nếu feature có policy đó.
   - UI gating chỉ theo API/session snapshot; audit mutation và thay đổi control plane; có rollback bằng tắt tenant override trước khi rollback code/migration.

## Tình huống biên và failure modes

- Tenant chưa bật module: API trả 404, menu/action không hiển thị; Admin có `all` vẫn không bypass entitlement.
- Tenant đã bật module nhưng bác sĩ/lễ tân chưa được map capability: API trả 403; không có auto-grant khi deploy.
- Quản lý sau migration: vẫn vận hành lịch, nhân sự, role metadata, dashboard và xem tài chính; bị 403 khi ghi thanh toán/quản trị tài chính hoặc thực hiện thao tác lâm sàng.
- Thay đổi quyền/role hoặc disable user: request kế tiếp thấy trạng thái D1 mới nhờ auth rehydration.
- Feature flag lookup/storage lỗi: fail closed cho module protected; ghi telemetry an toàn và không trả lỗi nội bộ cho client.
- Tenant override bị tắt trong rollout incident: API bị chặn tức thì; mutation đang chạy chỉ tuân thủ kiểm tra tại thời điểm bắt đầu request, không cố thu hồi transaction đã hoàn tất.

## Xác thực

1. Unit test catalog: chỉ Admin có `all`; Manager có đúng capability đã chốt; role/provision mới serialize đúng permissions.
2. Migration test trên dữ liệu có Manager display name tùy biến: permissions chuyển đúng, name/description/role ID giữ nguyên, chạy lại không làm sai dữ liệu.
3. Middleware integration tests: feature off trả 404 cho Admin lẫn role có capability; feature on + missing capability trả 403; feature on + capability/`all` hợp lệ đi qua.
4. Route contract tests cho một module mẫu: xác nhận thứ tự auth, entitlement, permission và tenant isolation; không để UI bypass endpoint.
5. Regression suite RBAC hiện hữu: `all` Admin bypass capability, Manager chỉ có đúng các action vận hành đã phê duyệt, và permission rehydration phản ánh D1 ngay request kế tiếp.
6. Manual acceptance Platform Control: tạo flag default tắt, enable một tenant, xác nhận tenant khác vẫn không thấy/không gọi được; disable lại làm module biến mất và API bị chặn.

## Ngoài phạm vi lần này

- Custom roles, tenant-managed permission mapping, role inheritance, permission delegation, và approval workflow cho thay đổi quyền.
- Multi-branch membership, ABAC/policy theo patient/visit assignment/creator, và UI quản lý các scope đó.
- Billing engine hay tự động tính entitlement từ gói dịch vụ; feature flag registry/override là interface hiện tại cho việc tích hợp sau này.
