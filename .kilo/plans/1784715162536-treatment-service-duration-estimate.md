# Định mức thời gian dịch vụ điều trị

## Quyết định đã chốt

- Thêm `estimated_duration_min` (phút nguyên, từ 1 đến 480) cho từng dịch vụ trong danh mục.
- Định mức áp dụng **một lần cho mỗi hạng mục** trong kế hoạch điều trị, không phải số phiên.
- Khi chọn dịch vụ, định mức được snapshot vào hạng mục kế hoạch. Việc quản trị viên sửa định mức dịch vụ sau đó không làm thay đổi dự toán của kế hoạch đã lập.
- Hạng mục dịch vụ tùy chỉnh bắt buộc nhập định mức riêng.
- Tổng thời gian kế hoạch là tổng định mức snapshot của các hạng mục. Khoảng dự đoán là `Math.round(tổng * 0.9)` đến `Math.round(tổng * 1.1)` phút.
- Không thay đổi, không tự điền, và không so sánh với `appointments.duration_min`; KPI thời gian thực tế nằm ngoài phạm vi này.
- Chỉ hiển thị dự toán trong chi tiết kế hoạch điều trị và PDF báo giá.
- Dữ liệu dịch vụ/hạng mục hiện hữu nhận giá trị mặc định 30 phút qua migration.

## Phạm vi dữ liệu và API

1. Tạo migration `src/db/migrations/0045_treatment_service_estimated_duration.sql`.
   - Thêm `estimated_duration_min INTEGER NOT NULL DEFAULT 30 CHECK (estimated_duration_min BETWEEN 1 AND 480)` vào `treatment_services`.
   - Thêm cột cùng tên, cùng ràng buộc vào `treatment_plan_items`.
   - `NOT NULL DEFAULT 30` bảo toàn dữ liệu hiện hữu: SQLite cung cấp giá trị 30 cho mọi hàng có trước migration; không tác động đến giá/thông tin khác.
   - Không thêm cột vào `treatment_plans`: tổng thời gian được tổng hợp từ snapshot hạng mục để không có nguy cơ lệch dữ liệu tổng.

2. Cập nhật hợp đồng chia sẻ trong `src/shared/types/index.ts`.
   - Bổ sung `estimated_duration_min` cho `TreatmentService` và `TreatmentPlanItem`.
   - Bổ sung `estimated_duration_min` cho `TreatmentPlan`, là tổng phút dự toán được API trả về khi lấy chi tiết kế hoạch.

3. Cập nhật validation trong `src/shared/validation/index.ts`.
   - `treatmentServiceUpsertSchema`: yêu cầu `estimated_duration_min` là số nguyên từ 1 đến 480.
   - `planItemCreateSchema` (và schema cập nhật dùng lại): yêu cầu cùng trường, cùng giới hạn.
   - Thông điệp lỗi nêu rõ định mức phải là số phút nguyên từ 1 đến 480.

4. Cập nhật repository danh mục trong `apps/api/src/repositories/treatment-service-prices.repo.ts`.
   - Đọc, map và ghi `estimated_duration_min` khi upsert dịch vụ.
   - Mở rộng kiểu input nội bộ của `upsert` tương ứng.

5. Cập nhật luồng hạng mục và tổng kế hoạch.
   - Trong `apps/api/src/services/plan.service.ts`, khi `service_code` hợp lệ được chọn, luôn dùng `service.estimated_duration_min`, không tin giá trị thời gian do client gửi.
   - Với dịch vụ tùy chỉnh, dùng `data.estimated_duration_min` đã validate.
   - Truyền snapshot này khi tạo/cập nhật hạng mục.
   - Trong `apps/api/src/repositories/treatment-items.repo.ts`, thêm cột vào lệnh `INSERT`, `UPDATE` và `mapItem` để thời gian bám vĩnh viễn theo hạng mục.
   - Trong `apps/api/src/repositories/treatment-plans.repo.ts`, mở rộng truy vấn `getById` bằng subquery tenant-scoped `COALESCE(SUM(estimated_duration_min), 0)` trên `treatment_plan_items`, rồi map về `TreatmentPlan.estimated_duration_min`.
   - Không cần đổi `recomputeTotal`: hàm này vẫn chỉ chịu trách nhiệm chi phí.

## Giao diện

1. Cập nhật `apps/web/src/pages/TreatmentServicesPage.tsx`.
   - Bổ sung cột `Định mức` hiển thị `N phút`.
   - Thêm input số `Định mức thời gian (phút)` vào hộp thêm/sửa dịch vụ, `min=1`, `max=480`, `step=1`.
   - Bổ sung trường vào state rỗng, luồng mở sửa và client-side validation; thông báo lỗi bao gồm định mức hợp lệ.
   - Cập nhật mô tả danh mục để nêu giá và định mức được áp dụng khi lập kế hoạch.

2. Cập nhật `apps/web/src/components/TreatmentPlanItemForm.tsx`.
   - Thêm state `estimatedDurationMin`, khởi tạo từ item khi sửa.
   - Khi chọn dịch vụ hoạt động, tự điền định mức từ catalog và khóa trường như đơn giá để tránh lệch snapshot.
   - Khi dùng `Dịch vụ tùy chỉnh`, cho phép và bắt buộc nhập số phút nguyên 1–480.
   - Gửi trường trong payload tạo/cập nhật; xác thực phía client trước khi gọi API.
   - Thêm giải thích ngắn rằng đây là dự toán phục vụ kế hoạch, không thay đổi thời lượng lịch hẹn.

3. Cập nhật `apps/web/src/pages/TreatmentPlanDetailPage.tsx`.
   - Tạo formatter cục bộ cho tổng và biên độ: `T phút (khoảng L-H phút)`, trong đó `L/H` được làm tròn phút gần nhất.
   - Hiển thị khối `Thời gian điều trị dự kiến` gần tổng chi phí, với nội dung rõ đây là dự toán và không tự động đặt lịch.
   - Thêm cột `Định mức` trong bảng hạng mục để xem snapshot theo từng dịch vụ/hạng mục.
   - Hiển thị tổng 0 phút cho kế hoạch nháp chưa có hạng mục; biên độ theo đó là 0-0 phút.

## PDF

1. Cập nhật input và bố cục của `apps/api/src/services/pdf.service.ts`.
   - Nhận `plan.estimated_duration_min`.
   - Trong khối tổng sau bảng dịch vụ, thêm dòng ASCII-safe: `THOI GIAN DIEU TRI DU KIEN: T phut (Khoang L-H phut)`.
   - Dùng đúng công thức làm tròn như giao diện. Không thêm/cập nhật bất kỳ dữ liệu lịch hẹn nào.

2. `apps/api/src/routes/treatment-plans-extras.ts` đã lấy plan qua `planService.get`; chỉ cần cập nhật kiểu input nếu TypeScript yêu cầu. Endpoint, phân quyền và tên file PDF giữ nguyên.

## Kiểm thử và xác nhận

1. Cập nhật fixture trong `apps/api/tests/routes/clinic-treatment-services.test.ts` với `estimated_duration_min`; thêm kiểm tra API danh mục trả đúng giá trị này và PUT từ chối 0, số lẻ, hoặc giá trị trên 480.

2. Cập nhật fixture và test trong `apps/api/tests/routes/treatment-plans.test.ts`.
   - Xác minh tạo hạng mục bằng `service_code` snapshot thời gian catalog dù client gửi giá trị khác.
   - Xác minh hạng mục tùy chỉnh nhận thời gian gửi lên và request thiếu/không hợp lệ bị từ chối.
   - Xác minh chi tiết kế hoạch trả tổng `estimated_duration_min` bằng tổng hạng mục, bao gồm kế hoạch không có hạng mục là 0.
   - Bổ sung trường mới cho fixture PDF route để kiểm tra endpoint vẫn tạo PDF hợp lệ.

3. Cập nhật `apps/api/tests/services/pdf.service.test.ts` để truyền tổng thời gian; duy trì kiểm tra header `%PDF` và khả năng mở PDF nhiều trang. Nếu test có helper đọc nội dung PDF phù hợp, xác minh dòng tổng thời gian và biên độ; nếu không, kiểm tra hợp đồng input và tính hợp lệ của file.

4. Chạy `npm run typecheck`, `npm run build`, và `npm run test --workspace apps/api`.

5. Xác nhận thủ công:
   - Tạo/sửa dịch vụ với định mức 30 phút, chọn dịch vụ vào hạng mục và xác nhận trường tự điền/khóa.
   - Tạo hạng mục tùy chỉnh với định mức 45 phút.
   - Xác nhận tổng 75 phút hiển thị khoảng 68-83 phút ở trang chi tiết và PDF.
   - Sửa định mức catalog sau khi đã tạo kế hoạch, tải lại kế hoạch cũ và xác nhận snapshot/tổng không đổi.
   - Tạo lịch hẹn từ milestone và xác nhận `duration_min` vẫn do nhân viên nhập, không bị thay đổi bởi định mức.

## Ngoài phạm vi

- Ghi nhận thời gian thực tế bắt đầu/kết thúc điều trị, KPI hiệu suất nhân sự, và báo cáo chênh lệch thực tế so với định mức.
- Thay đổi thời lượng hoặc cơ chế tự điền của lịch hẹn.
- Hiển thị tổng thời gian tại danh sách kế hoạch, danh sách bệnh nhân, dashboard hoặc Lark handover.
