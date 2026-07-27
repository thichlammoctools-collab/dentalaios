# Plan: Hoàn thiện tối ưu UI/UX luồng khám và chẩn đoán

## Bối cảnh
`VisitDetailPage.tsx` và các component lâm sàng đã được tái cấu trúc:
- Workspace chuyển sang 4 tab: Khám, Chẩn đoán, Hình ảnh, Kế hoạch.
- Gom sinh hiệu, cảnh báo, bệnh nền vào một khối "An toàn trước điều trị".
- Thêm chế độ chỉ đọc (readOnly) và capability flags cho toàn bộ mutation.
- Đồng bộ findings phát sinh từ ảnh AI về trang.
- Sửa trình tự "Hoàn tất" -> "Ký hồ sơ".
- Lịch sử chuyển xuống cuối, thu gọn.
- FDI chart có legend, disclosure răng sữa và khám ngoài răng.

`npm run typecheck --workspace apps/web` đã pass. Còn lại là các điểm hoàn thiện nhỏ và kiểm thử.

## Hạng mục còn lại

### 1. Sửa lỗi copy tiếng Việt (VisitDetailPage.tsx)
- Dòng ~1049: "clinical findings & kế hoạch kế hoạch" -> "clinical findings và kế hoạch".
- Dòng ~1075: header bảng "Rang" -> "Răng".
- Dòng ~1125: nhãn "Tóm tắt cau truc" -> "Tóm tắt có cấu trúc".
- Dòng ~1176: "thu thuat" -> "thủ thuật".
- Dòng ~1212: "Luu kế hoạch điều trị" -> "Lưu kế hoạch điều trị".
- Rà thêm các chuỗi thiếu dấu khác trong dialog kế hoạch AI.

### 2. Nút xóa hạng mục trong bảng kế hoạch AI (dòng ~1138-1147)
- Nút hiện `opacity-0 group-hover:opacity-100`, ẩn trên touch/keyboard.
- Đổi sang luôn hiển thị mờ và rõ khi hover/focus, thêm `aria-label="Xóa hạng mục"` và `type="button"`.

### 3. Truyền nhãn cảnh báo vào SafetyAcknowledgementDialog (dòng ~1326)
- Prop `warningLabel` đã tồn tại trong component nhưng chưa được truyền.
- Truyền tiêu đề cảnh báo đang đánh giá dựa trên `safetyWarningType` để dialog có ngữ cảnh cụ thể.

### 4. Kiểm thử và build
- `npm run typecheck --workspace apps/web`
- `npm run build --workspace apps/web`
- Smoke test thủ công (chưa có frontend test runner):
  - Quyền chỉ đọc: hồ sơ đã ký ẩn mọi mutation, hiện banner read-only.
  - Doctor có WRITE_FINDINGS: nhập/sửa findings, chẩn đoán khi chưa khóa.
  - Reception có WRITE_APPOINTMENTS: chỉ thấy tạo lịch, không thấy thao tác lâm sàng.
  - Visit in_progress: có "Hoàn tất", chưa có "Ký"; completed: có "Ký".
  - Lưu finding từ ảnh AI: tab Khám cập nhật ngay.
  - Responsive 375/768/1280px: tab và khối an toàn không vỡ layout.

## Ngoài phạm vi (không đổi API)
- Không mở rộng Journey endpoint để trả diagnosis thật (chỉ đã đổi nhãn).
- Không thêm backend guard mới cho safety/evidence sau ký.
- Không đổi schema hay route.

## Phạm vi file
- `apps/web/src/pages/VisitDetailPage.tsx` (copy, nút xóa, truyền warningLabel).
- Không cần sửa thêm component khác; readOnly và capability đã nối xong.
