# Plan: Hoàn thiện tối ưu UI/UX luồng khám và chẩn đoán

## PHẦN 0 (LÀM TRƯỚC): Giải quyết xung đột merge git

### Trạng thái hiện tại
- `git pull` đã chạy và dừng ở merge dở dang. Branch `main` ahead 1, behind 5 so với `origin/main`.
- Merge remote đưa vào tính năng mới "clinical pathway" (`EndodonticPainPathwayCard`, quyền `WRITE_PATHWAYS`/`REVIEW_PATHWAYS`, routes/services/migrations 0065-0066). Các file này đã auto-merge và được stage.
- Chỉ còn MỘT file xung đột thủ công: `apps/web/src/pages/VisitDetailPage.tsx` (trạng thái `UU`), có đúng 3 vùng conflict.
- Không có xung đột ở `src/shared/constants/index.ts` (đã có `WRITE_PATHWAYS`, `REVIEW_PATHWAYS`), types, validation, routes API.
- Lưu ý: cần agent có quyền chạy git + sửa source (Plan mode không làm được). Không dùng lệnh phá hủy; nếu cần hủy có thể `git merge --abort`.

### Nguyên tắc hợp nhất
Giữ bản tái cấu trúc UX theo tab của HEAD, đồng thời KHÔNG đánh mất tính năng pathway của remote. Cụ thể phải giữ lại: import `EndodonticPainPathwayCard` (dòng ~18), 2 biến quyền `canWritePathways`/`canReviewPathways`, và render `EndodonticPainPathwayCard` trong workspace.

### Vùng conflict 1 (~412-428): khối permissions
- Union cả hai nhánh. Kết quả cuối gồm đầy đủ:
  - HEAD: `canSign`, `canWriteVisits`, `canWriteFindings`, `canWritePlans`, `canWritePatients`, `canWriteAppointments`.
  - Remote: `canWritePathways`, `canReviewPathways`.
- Chuẩn hóa cách đọc quyền theo HEAD (dùng biến `permissions`/`hasAllPermissions` đã khai báo), ví dụ:
  `const canWritePathways = hasAllPermissions || permissions.includes(PERMISSIONS.WRITE_PATHWAYS);`
  `const canReviewPathways = hasAllPermissions || permissions.includes(PERMISSIONS.REVIEW_PATHWAYS);`
- Xóa toàn bộ marker `<<<<<<<`, `=======`, `>>>>>>>`.

### Vùng conflict 2 (~865-933): khối an toàn / vitals
- GIỮ HEAD: card "An toàn trước điều trị" (gộp sinh hiệu + cảnh báo + bệnh nền).
- BỎ toàn bộ khối remote: card "Chỉ số khám" (Vitals) cũ, card "Cảnh báo chỉ số khám" cũ, comment "Patient safety context". Các nội dung này đã được HEAD gộp lại.

### Vùng conflict 3 (~1010-1077): thân workspace
- GIỮ HEAD: card "Lịch sử khám và điều trị" (disclosure) cùng cấu trúc tab đã có.
- BỎ khối remote: layout grid cũ (FdiToothChart + findings + ClinicalDiagnosesCard + PatientImageGallery + action bar cũ) vì HEAD đã thay bằng workspace 4 tab.
- NHƯNG phải bảo tồn `EndodonticPainPathwayCard`: chèn vào tab "Khám" (`workspaceTab === "exam"`), đặt sau card FDI chart và trước card "Ghi nhận theo răng", truyền:
  `<EndodonticPainPathwayCard visitId={visit.id} canWrite={canWritePathways} canReview={canReviewPathways} />`
- Vì tab "Khám" hiện đang gói trong một biểu thức JSX trên một dòng, khi chèn cần bọc đúng trong `<div className="space-y-4">...</div>` đang có.

### Sau khi resolve
1. Đảm bảo không còn marker xung đột: tìm `<<<<<<<`, `=======`, `>>>>>>>` trong file.
2. Xác nhận import `EndodonticPainPathwayCard` được dùng (không lint unused), và 2 biến quyền được dùng.
3. `npm run typecheck --workspace apps/web` phải pass.
4. `git add apps/web/src/pages/VisitDetailPage.tsx` rồi `git commit` (không sửa message merge mặc định trừ khi user yêu cầu). KHÔNG push nếu user chưa yêu cầu.
5. Sau khi merge sạch mới tiếp tục các hạng mục hoàn thiện bên dưới.

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

### ✅ 1. Sửa lỗi copy tiếng Việt (VisitDetailPage.tsx) — HOÀN THÀNH
- "clinical findings & kế hoạch kế hoạch" → "clinical findings và kế hoạch"
- Header bảng "Rang" → "Răng"
- "Tóm tắt cau truc" → "Tóm tắt có cấu trúc"
- "thu thuat" → "thủ thuật"
- "Luu kế hoạch điều trị" → "Lưu kế hoạch điều trị"

### ✅ 2. Nút xóa hạng mục trong bảng kế hoạch AI — HOÀN THÀNH
- Đổi sang `opacity-60` luôn hiển thị mờ, rõ khi hover (`hover:opacity-100`).
- Thêm `aria-label="Xóa hạng mục"` và `type="button"`.

### ✅ 3. Truyền nhãn cảnh báo vào SafetyAcknowledgementDialog — HOÀN THÀNH
- Truyền `warningLabel` dựa trên `safetyWarningType` ("Huyết áp" / "Đường huyết" / "BMI").

### ✅ 4. Kiểm thử và build — HOÀN THÀNH
- `npm run typecheck --workspace apps/web` — pass
- `npm run build --workspace apps/web` — pass
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
