# Kế hoạch: Chuẩn hóa Hành trình lâm sàng

## Mục tiêu
Thay bảng Hành trình lâm sàng của hồ sơ bệnh nhân bằng bốn cột chính:

1. Ngày khám
2. Chẩn đoán
3. Kế hoạch điều trị
4. Thủ thuật đã làm

Các cột Thuốc kê đơn và Thanh toán bị loại khỏi bảng này. Chỉ hiển thị lượt khám và sự kiện thủ thuật đã hoàn thành; không hiển thị lịch hẹn độc lập/chưa thành lượt khám.

## Quyết định đã chốt

- Mỗi finding có mã nghiệp vụ bất biến: `FND-YYYYMMDD-0001`, cấp tuần tự theo tenant và ngày `created_at` tại múi giờ `Asia/Ho_Chi_Minh`.
- Backfill toàn bộ finding hiện hữu theo `created_at`; mã mới cấp nguyên tử qua counter chung.
- Cột Chẩn đoán chỉ hiện mã `FND-...` dạng link. Link mở `/visits/:visitId` kèm patient-return context tới tab journey. Bác sĩ và phụ tá hiển thị theo lượt khám ghi nhận finding.
- Cột Kế hoạch hiện một dòng trên mỗi mã `KHD-...`, gồm trạng thái kế hoạch, danh sách bác sĩ và phụ tá duy nhất của các hạng mục. Khi hạng mục không có người gán, fallback nhân sự của lượt khám tạo kế hoạch.
- Cột Thủ thuật chỉ hiện milestone `completed`, gắn vào ngày `completed_at` của milestone, thay vì ngày tạo kế hoạch hoặc ngày lịch hẹn.
- Click thủ thuật mở popup chỉ đọc: tên thủ thuật, mã KHD, trạng thái/hoàn thành lúc nào, ghi chú, bác sĩ và phụ tá. Nhân sự ưu tiên appointment `completed` liên kết gần nhất, sau đó hạng mục điều trị, cuối cùng lượt khám nguồn.
- Ghi chú popup ưu tiên `treatment_milestone_appointments.notes`; fallback `appointment.notes`; fallback `TreatmentPlanItem.description`; trống hiển thị `Chưa ghi nhận`.

## Thay đổi dữ liệu và shared types

1. Tạo migration kế tiếp trong `src/db/migrations/`.
   - `ALTER TABLE clinical_findings ADD COLUMN code TEXT`.
   - Backfill theo tenant/ngày tạo, thứ tự `created_at, id`, định dạng `FND-YYYYMMDD-0001`.
   - Tạo unique index `(tenant_id, code)`.
   - Mở rộng ràng buộc/counter `clinical_document_code_counters` để chấp nhận `finding`.
   - Seed/update counter `finding` bằng sequence cao nhất đã backfill cho mỗi tenant/ngày.
   - Theo chuẩn các migration hiện có, không sửa migration `0039_visit_and_treatment_plan_codes.sql` đã phát hành.
2. Thêm `code?: string` vào `ClinicalFinding` ở `src/shared/types/index.ts`.
3. Bổ sung các kiểu read-model dành riêng cho journey (hoặc interface cục bộ được API trả về) để biểu diễn:
   - Finding có code, ngày/lượt khám, bác sĩ và phụ tá.
   - Kế hoạch có code/status và tập nhân sự đã tổng hợp.
   - Thủ thuật hoàn thành với thời gian hoàn thành, thông tin item/plan, ghi chú, và nhân sự đã phân giải.

## API và repository

1. Cập nhật `apps/api/src/repositories/findings.repo.ts`.
   - `mapFinding` đọc `code`.
   - `create` cấp mã FND nguyên tử trước insert, dùng date key Ho Chi Minh tương tự `allocateCaseNumber`.
   - Bảo đảm các select/list hiện tại trả về code.
2. Tạo read-model endpoint theo bệnh nhân, ví dụ `GET /api/patients/:id/clinical-journey`, yêu cầu `READ_PATIENTS`.
   - Đặt route trước `/:id` trong `apps/api/src/routes/patients.ts`.
   - Đặt query/repository/service tách biệt, không ép `PatientClinicalJourney` thực hiện N+1 request cho từng visit/kế hoạch/milestone.
   - Kiểm tra bệnh nhân thuộc tenant trước khi trả dữ liệu; luôn lọc theo tenant.
   - Trả dữ liệu đã phân tách thành visit rows và completed-procedure events, để frontend ghép theo ngày thực tế mà không phải suy diễn từ plan item.
3. Read model cho Chẩn đoán.
   - Join `clinical_findings` với `visits` để lấy `code`, `visit_id`, `visit.date`, `treating_clinician_name`, `assistant_name`.
   - Giữ chỉ những finding thuộc patient đang truy vấn.
4. Read model cho Kế hoạch.
   - Join `treatment_plans` với visit nguồn và items.
   - Một record mỗi treatment plan, có `code`, `status`, `visit_id`.
   - Tổng hợp tên bác sĩ/phụ tá không rỗng, unique, từ plan items.
   - Nếu tập tên rỗng cho một vai trò, dùng tên ở visit nguồn.
5. Read model cho Thủ thuật hoàn thành.
   - Join `treatment_case_milestones` trạng thái `completed` với item, treatment plan, visit nguồn.
   - Dùng `milestone.completed_at` làm `completed_at` và ngày của event.
   - Left join `treatment_milestone_appointments` và `appointments`, chọn một appointment có `status = completed`; ưu tiên record có `execution_status = completed`, sau đó thời điểm lịch hẹn mới nhất.
   - Từ link đã chọn, lấy `link.notes` rồi `appointment.notes`; dùng `item.description` nếu cả hai rỗng.
   - Nhân sự dùng appointment đã chọn nếu có giá trị từng vai trò; fallback item; cuối cùng visit nguồn. Join users để trả tên, không cho client tự tra cứu bằng ID.
   - Milestone hoàn thành nhưng không có appointment liên kết vẫn phải hiện, với fallback ghi chú/nhân sự rõ ràng.
6. Không thay đổi luồng cập nhật milestone hay execution trong phạm vi này; journey chỉ đọc dữ liệu hiện có.

## Giao diện

1. Refactor `apps/web/src/components/PatientClinicalJourney.tsx`.
   - Bỏ props `plans`, `payments`, `appointments`, `onPaymentClick` nếu endpoint journey cung cấp đủ dữ liệu; giữ `patientId` và tải một request endpoint journey.
   - Bỏ các N+1 requests tới `/api/visits/:id/findings` và `/api/treatment-plans/:id/items`.
   - Xây dựng rows từ visits và completed-procedure events; sort giảm dần theo datetime. Một ngày có thể có nhiều lượt khám/sự kiện, không gộp sai các event khác thời điểm.
   - Thay header thành bốn cột: `Ngày khám`, `Chẩn đoán`, `Kế hoạch điều trị`, `Thủ thuật đã làm`. Điều chỉnh `min-width` để vẫn scroll ngang an toàn trên mobile.
2. Cột ngày.
   - Visit row: click mở visit như hành vi hiện tại, giữ patient-return context.
   - Procedure-only row: hiện `Hoàn thành thủ thuật` và thời gian `completed_at`; không giả là lượt khám nếu không có visit ở thời điểm đó.
3. Cột Chẩn đoán.
   - Mỗi item là link mã `FND-...` đến visit nguồn.
   - Bên dưới mã hiện `BS. <treating_clinician_name>` và `Phụ tá: <assistant_name>`; thiếu dữ liệu dùng dấu `—`.
   - Không hiển thị condition/chuỗi raw như `angle_class_iii`, `open_bite`, v.v. trong bảng journey.
4. Cột Kế hoạch điều trị.
   - Mỗi plan hiển thị link mã KHD tới `/treatment-plans/:id`, badge nhãn trạng thái tiếng Việt và hai dòng nhân sự tổng hợp.
   - Link giữ patient-return context.
   - Không lặp item procedure trong cột này.
5. Cột Thủ thuật đã làm.
   - Mỗi completed procedure là button có nhãn thân thiện (service name/procedure + răng/toàn hàm), mở popup.
   - Chỉ data completed xuất hiện; `planned`, `in_progress`, `skipped` không xuất hiện.
   - Dùng `Dialog`, `DialogHeader`, `DialogBody`, `DialogFooter` hiện có; hỗ trợ Escape, click backdrop, close button và dark mode qua token theme.
   - Popup không cho sửa dữ liệu: hiển thị ghi chú, bác sĩ, phụ tá, mã KHD, thời điểm hoàn thành và nguồn ghi chú nếu hữu ích.
6. Cập nhật nơi gọi trong `apps/web/src/pages/PatientDetailPage.tsx` để theo props mới, đồng thời gỡ state/handler payment không còn được journey dùng nếu không phục vụ thành phần khác.

## Kiểm thử và xác nhận

1. Migration test hoặc repository test:
   - Backfill FND ổn định theo tenant/ngày và không trùng khi created_at bằng nhau.
   - Counter finding tiếp tục từ số lớn nhất sau backfill.
   - Finding mới nhận code theo ngày Ho Chi Minh và tenant độc lập.
2. API test cho `GET /api/patients/:id/clinical-journey`:
   - Từ chối không có `read_patients`.
   - Không lộ dữ liệu tenant khác.
   - Trả finding code và nhân sự visit.
   - Tổng hợp personnel của plan, với fallback visit khi item chưa gán.
   - Chỉ trả completed milestone; ngày event bằng `completed_at`.
   - Đúng thứ tự fallback ghi chú và nhân sự appointment -> item -> visit.
   - Milestone completed không có appointment vẫn hiện.
3. Frontend test (nếu bộ test web đã có setup):
   - Header chính xác 4 cột và không có Thuốc kê đơn/Thanh toán.
   - Mã FND và KHD tạo link đúng return context.
   - Không render raw condition codes.
   - Click thủ thuật mở/đóng popup và hiển thị fallback `Chưa ghi nhận`.
4. Chạy `npm run typecheck --workspace apps/api`, `npm run typecheck --workspace apps/web`, các test API liên quan, và kiểm tra thủ công desktop/mobile/dark mode.

## Rủi ro và xử lý

- Dữ liệu lịch sử có milestone completed nhưng không có link appointment: vẫn có thủ thuật, nhân sự/ghi chú fallback như quyết định; không suy đoán người thực hiện.
- Hạng mục cũ thiếu nhân sự: fallback visit nguồn, sau đó hiển thị `—`; không dùng user tạo record vì không đồng nghĩa người điều trị.
- Một plan có nhiều người: danh sách unique, theo thứ tự ổn định từ items; không chọn tùy tiện một người.
- Một milestone có nhiều appointment completed: chọn execution completed trước, sau đó appointment mới nhất; API có thể trả source để popup minh bạch nếu cần.
- Migration SQLite không hỗ trợ sửa CHECK constraint trực tiếp: nếu counter CHECK hiện tại chặn `finding`, migration phải tái tạo table/copy dữ liệu an toàn hoặc chuyển counter document type sang TEXT trước khi insert finding counters.
