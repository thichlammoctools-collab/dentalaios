# Kế hoạch: Doanh thu ghế thời gian thực

## Mục tiêu và quyết định đã chốt
- Hiển thị KPI doanh thu theo từng ghế trên `ChairBoardPage` cho ngày đang chọn.
- Doanh thu là tổng `payments.amount` có trạng thái `confirmed`, hạch toán theo thời điểm payment được xác nhận (`payments.created_at`, múi giờ `Asia/Ho_Chi_Minh`).
- Gán ghế snapshot trên `visits.chair_id`; payment được quy về ghế của visit qua `payment -> treatment_plan -> visit`.
- Thêm `visits.source_appointment_id` để truy vết lịch hẹn đã tạo lượt khám. Không suy đoán “lịch gần nhất”.
- Bắt đầu lượt khám từ appointment sẽ copy `appointment.chair_id` vào visit. Tạo visit trực tiếp từ hồ sơ bệnh nhân bắt buộc chọn một ghế đang hoạt động cùng chi nhánh.
- Không cho đổi `visits.chair_id` sau khi plan của visit đã có payment `confirmed`; trước đó có thể sửa khi cần hiệu chỉnh vận hành.
- Lịch sử visit không có snapshot ghế không được backfill theo suy đoán. Payment liên quan được phản ánh ở KPI chi nhánh là `unallocated_revenue`, không phân bổ vào ghế nào.
- Chỉ người có `all` hoặc `view_management_dashboard` được nhận và xem số tiền; người chỉ có quyền vận hành Chair Board vẫn xem trạng thái/lịch ghế, không thấy doanh thu.
- Bản này không xử lý một payment phân bổ nhiều ghế. Một payment được tính 100% cho `visits.chair_id`; allocation nhiều ghế là phase sau.

## Data Model và Migration
1. Tạo migration tiếp theo sau `0021_dental_rooms.sql`.
2. Thêm vào `visits`:
   - `chair_id TEXT REFERENCES dental_chairs(id)` nullable để tương thích lịch sử.
   - `source_appointment_id TEXT REFERENCES appointments(id)` nullable.
3. Thêm index phục vụ aggregate và truy vết:
   - `idx_visits_tenant_chair_date (tenant_id, chair_id, date)`.
   - `idx_visits_tenant_source_appointment (tenant_id, source_appointment_id)`.
4. Không thay đổi `payments` trong phase này, vì chain payment -> treatment plan -> visit đã tồn tại.
5. Không backfill `visits.chair_id` từ appointment cũ. Dữ liệu đã tồn tại giữ `NULL` và được tính thành chưa phân bổ.

## Shared Contracts
1. Cập nhật `Visit` trong `src/shared/types/index.ts` với `chair_id?: string` và `source_appointment_id?: string`.
2. Cập nhật `visitCreateSchema`:
   - Nhận `chair_id` bắt buộc cho luồng tạo visit trực tiếp.
   - Nhận `source_appointment_id` tùy chọn.
   - Khi có `source_appointment_id`, service là nơi quyết định chair snapshot, không tin `chair_id` do client gửi.
3. Cập nhật `visitUpdateSchema` để cho phép `chair_id` nullable/optional theo quy tắc service, nhưng không cho sửa `source_appointment_id` sau tạo.
4. Thêm query schema cho chair revenue board:
   - Dùng lại `branch_id`, `date` của Chair Board hoặc mở rộng `chairBoardQuerySchema` nếu endpoint board trả chung payload.
5. Bổ sung shared interfaces:
   - `ChairRevenueMetrics`: `confirmed_revenue`, `payment_count`, `completed_minutes`, `revenue_per_completed_hour` nullable.
   - Mở rộng `ChairBoardItem`/response với `revenue?: ChairRevenueMetrics` chỉ khi caller được phép tài chính.
   - Response-level `unallocated_revenue?: number` cho người được phép tài chính.

## Visit Snapshot Flow
1. Cập nhật `apps/api/src/repositories/visits.repo.ts`:
   - Persist/map `chair_id`, `source_appointment_id`.
   - Join `dental_chairs` khi cần trả tên/mã ghế cho UI visit detail.
2. Cập nhật `apps/api/src/services/visit.service.ts`:
   - Khi tạo visit trực tiếp, xác thực `chair_id` thuộc tenant, branch khớp visit, `is_active = true`, và không ở trạng thái `maintenance`/`out_of_service`.
   - Khi tạo từ appointment, lấy appointment tenant-scoped; xác thực appointment thuộc cùng patient/branch, không `cancelled`/`no_show`, có `chair_id`; dùng chair đó làm snapshot.
   - Xác thực `source_appointment_id` chưa được gắn vào visit khác hoặc chọn quy tắc idempotent trả lại visit đã tạo. Khuyến nghị unique logical check trong service để tránh tạo trùng từ thao tác bấm lặp.
   - Khi update `chair_id`, kiểm tra chain `treatment_plans` của visit có `payments.status = 'confirmed'` hay không. Nếu có, trả `409 Conflict` với thông báo ghế đã khóa vì đã có doanh thu xác nhận.
3. Cập nhật `tenant-scope.ts` whitelist/labels nếu dùng helper cho `dental_chairs` hoặc `appointments` theo nhánh; vẫn thực hiện kiểm tra branch rõ ràng trong service.
4. Thêm service/repository helper kiểm tra payment confirmed theo visit thay vì tải payment về memory.

## API và UI tạo lượt khám
1. Mở rộng `POST /api/visits` sử dụng contract mới.
2. Bổ sung action `Bắt đầu khám` tại appointment detail/schedule nơi phù hợp với UX hiện có:
   - Gọi `POST /api/visits` với `patient_id`, `branch_id`, `source_appointment_id`.
   - API copy ghế snapshot, không cho frontend tự quyết định ghế trong luồng này.
   - Sau thành công, điều hướng tới `/visits/:id` và cập nhật appointment sang trạng thái `arrived` nếu luồng hiện có không tự làm việc đó; chỉ thực hiện nếu business rule hiện hành cho phép.
3. Cập nhật `apps/web/src/components/VisitForm.tsx` cho luồng tạo từ bệnh nhân:
   - Tải ghế active của `session.branch.id`.
   - Thêm select ghế bắt buộc, hiển thị tên ghế/phòng.
   - Không render/không cho submit nếu không có ghế khả dụng; hướng dẫn cấu hình ghế.
4. Hiển thị ghế snapshot trong visit detail để người dùng kiểm tra nguồn doanh thu; chỉ render nút đổi ghế trước khi payment confirmed theo API error-state.

## Revenue Query và Chair Board
1. Mở rộng `chairsService.board` hoặc thêm endpoint read-only chuyên biệt `GET /api/chairs/board` giữ nguyên URL và mở rộng response.
2. API cần phân quyền dữ liệu ngay tại server:
   - Mọi caller có `READ_PATIENTS` nhận board vận hành hiện tại.
   - Caller có `ALL` hoặc `VIEW_MANAGEMENT_DASHBOARD` mới nhận `revenue` per chair và `unallocated_revenue`.
   - Không chỉ ẩn UI; không gửi amounts cho caller không đủ quyền.
3. Aggregate theo ngày local HCM:
   - Lọc `payments.status = 'confirmed'` và `payments.created_at` thuộc `[local day start, next local day start)`.
   - Join `payments -> treatment_plans -> visits` theo cả `id` và `tenant_id`.
   - Group theo `visits.chair_id` trong tenant + selected branch.
   - `chair_id IS NULL` cộng vào `unallocated_revenue`.
   - Giới hạn currency của MVP là VND theo hệ thống hiện tại; nếu có multi-currency trong dữ liệu, không cộng lẫn currency. Trả error/partition theo currency trước khi mở rộng.
4. Tính `payment_count` bằng số payment confirmed, không phải số bệnh nhân.
5. Tính `completed_minutes` từ appointments có cùng `chair_id`, status `completed`, scheduled trong ngày được chọn. Đây là utilization vận hành; ghi rõ là không phải thời lượng thao tác thực tế nếu appointment kéo dài qua nửa đêm.
6. `revenue_per_completed_hour = confirmed_revenue / (completed_minutes / 60)`; trả `null` khi minutes = 0, không chia cho 0.
7. Cập nhật `ChairBoardPage`:
   - Với người có quyền, thêm thẻ tổng “Doanh thu ghế” và “Chưa phân bổ”.
   - Mỗi card ghế hiện doanh thu xác nhận, số payment, doanh thu/giờ; giá trị `0` là hợp lệ, không thay bằng `--`.
   - Với người không có quyền, không render KPI tài chính hoặc placeholder gây lộ dữ liệu.
   - Dùng date đang chọn và `formatCurrency` hiện có.

## Realtime
1. Tái sử dụng `TenantDashboardHub` và `auditLog` hiện có: payment create/confirm/fail đã chạy audit middleware, nên sau mutation hub đã phát `dashboard:invalidate` best-effort.
2. Tạo/điều chỉnh client stream hook để Chair Board chỉ mở stream khi user có quyền doanh thu; on invalidation reload board cho selected date/branch.
3. Giữ polling 60 giây hiện có để cập nhật trạng thái lịch ghế; realtime invalidation bổ sung cập nhật nhanh cho payment và mutation.
4. Không broadcast amount hoặc patient data qua WebSocket, chỉ dùng invalidation event hiện hữu.

## Permission và Security
1. Giữ quyền đọc Chair Board hiện hữu cho vận hành; tạo/sửa room/chair vẫn theo `MANAGE_USERS` hiện có.
2. Enforce financial authorization trong route/service response, không dựa vào `canViewRevenue` ở frontend.
3. Xác thực tenant và branch ở mọi lookup appointment/chair/visit.
4. Không log patient name, procedure, amount, hoặc raw query trong audit/stream logs.

## Tests
1. Migration/integration tests:
   - Visit mới có `chair_id`/`source_appointment_id` được persist/map đúng.
   - Lịch sử visit `chair_id NULL` không lỗi query aggregate.
2. Visit service/route tests:
   - Tạo từ appointment copy đúng chair snapshot và từ chối appointment khác patient/branch/tenant, inactive terminal appointment, hoặc appointment không có ghế.
   - Tạo trực tiếp thiếu chair bị validation error; chair sai branch/tenant hoặc maintenance bị từ chối.
   - Không tạo trùng visit từ cùng `source_appointment_id`.
   - Update chair bị `409` khi visit có confirmed payment; được phép trước khi confirmed payment.
3. Chair revenue endpoint tests:
   - Chỉ sum confirmed payment trong đúng khung ngày HCM và branch.
   - Pending/failed payment không được tính.
   - Payment cho visit không có chair cộng `unallocated_revenue`.
   - Payment của tenant/branch khác không lọt kết quả.
   - `revenue_per_completed_hour` đúng và null khi không có completed minutes.
   - Caller chỉ có `READ_PATIENTS` không nhận bất kỳ trường tiền nào; role management nhận fields này.
4. Realtime tests (nếu test harness hỗ trợ): payment confirm phát invalidation; fallback đảm bảo Chair Board vẫn polling khi hub không cấu hình.
5. Chạy:
   - `npm run test --workspace apps/api`
   - `npm run typecheck --workspace apps/api`
   - `npm run typecheck --workspace apps/web`
   - `git diff --check`

## Rollout và giới hạn
- Deploy migration trước application code.
- Trong giai đoạn dữ liệu cũ, báo cáo per-chair không cộng payments của visits không có chair; hiển thị `Chưa phân bổ` để tổng doanh thu vẫn đối soát được.
- Không làm báo cáo 7/30/90 ngày, export, phân bổ nhiều ghế, hoặc backfill suy đoán trong scope này.
- Sau khi dữ liệu mới ổn định, phase sau có thể thêm báo cáo dài hạn theo ghế, mục tiêu utilization, và bảng `payment_chair_allocations` cho treatment nhiều ghế.
