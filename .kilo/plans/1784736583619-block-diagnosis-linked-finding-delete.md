# Chặn Xóa Finding Đã Có Chẩn Đoán

## Bối cảnh
`clinical_diagnoses.source_finding_id` tham chiếu `clinical_findings.id` mà không có quy tắc `ON DELETE`. Khi người dùng xóa finding đã là nguồn của một diagnosis, SQLite/D1 từ chối lệnh `DELETE` vì khóa ngoại. Lỗi D1 hiện không được bắt và ánh xạ thành lỗi ứng dụng nên API trả `500 Internal server error`.

## Quyết định
- Không cho xóa finding nếu có bất kỳ diagnosis nào trong cùng tenant đang tham chiếu nó, bất kể trạng thái diagnosis.
- Trả `409 Conflict` với thông điệp tiếng Việt rõ ràng, ví dụ: `Không thể xóa ghi nhận vì đã được dùng làm nguồn cho chẩn đoán. Hãy cập nhật hoặc xử lý chẩn đoán trước.`
- Giữ nguyên schema và quan hệ khóa ngoại hiện có để bảo toàn dấu vết bệnh án.
- Không cần thay đổi UI: `FindingsList` đã hiển thị nội dung lỗi từ `ApiError`, do đó sẽ tự hiển thị thông báo 409 mới thay cho thông báo fallback/500.

## Thực hiện
1. Trong `apps/api/src/repositories/diagnoses.repo.ts`, bổ sung hàm truy vấn phạm vi tenant để kiểm tra có diagnosis nào có `source_finding_id` tương ứng không.
   - Dùng `tenant_id` và `source_finding_id` làm điều kiện.
   - Chỉ lấy tín hiệu tồn tại (`SELECT 1 ... LIMIT 1`), không tải toàn bộ diagnosis.

2. Trong `apps/api/src/services/visit.service.ts`, cập nhật `deleteFinding`.
   - Sau khi xác nhận visit và finding thuộc visit, gọi repository diagnosis để kiểm tra dependency.
   - Nếu tồn tại, ném `ConflictError` với thông báo nghiệp vụ đã chốt; không gọi repository xóa finding.
   - Bọc lệnh xóa bằng `try/catch`; dùng `isForeignKeyError` từ `apps/api/src/lib/db-errors.ts` để đổi lỗi khóa ngoại phát sinh do cạnh tranh đồng thời thành cùng `ConflictError`.
   - Giữ nguyên việc trả `404` khi visit/finding không tồn tại hoặc finding không thuộc visit.

3. Trong `apps/api/tests/routes/visits.test.ts`, bổ sung các hồi quy cho `DELETE /api/visits/:visitId/findings/:findingId`.
   - Khi query diagnosis trả bản ghi tham chiếu, endpoint trả `409`, mã lỗi `conflict`, thông điệp nghiệp vụ, và không chạy câu lệnh `DELETE FROM clinical_findings`.
   - Khi không có diagnosis tham chiếu, xóa thành công như test hiện có (`204`).
   - Mô phỏng D1 ném `FOREIGN KEY constraint failed` ở câu lệnh xóa để xác nhận fallback cạnh tranh đồng thời cũng trả `409`, không trả `500`.

## Rủi ro và phạm vi
- Không xóa diagnosis tự động, không đặt `source_finding_id` thành `NULL`, không thay đổi migration/schema.
- Chặn cả diagnosis suspected/resolved/ruled_out vì chúng vẫn là một phần dữ liệu và lịch sử lâm sàng.
- Kiểm tra dependency và catch lỗi khóa ngoại cùng tồn tại: kiểm tra tạo lỗi thân thiện trong luồng thường, catch đảm bảo không có cửa sổ cạnh tranh tạo ra lỗi 500.

## Xác minh
1. Chạy test route visits, gồm các case delete mới.
2. Chạy toàn bộ test API hoặc ít nhất suite liên quan diagnosis/findings.
3. Chạy typecheck API nếu script dự án hỗ trợ.
4. Kiểm tra thủ công: xóa finding không có diagnosis thành công; xóa finding đã chọn làm nguồn chẩn đoán hiển thị thông báo conflict tiếng Việt và finding vẫn tồn tại.
