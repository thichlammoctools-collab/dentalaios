# Thumbnail Bằng Chứng Ảnh Trong Chẩn Đoán

## Mục tiêu

- Thay dropdown chọn ảnh trong form chẩn đoán bằng lưới thumbnail có thể nhấp.
- Bác sĩ chọn một ảnh và một annotation đã tồn tại, để evidence trỏ chính xác vào vùng đánh dấu tương ứng.
- Hiển thị thumbnail có overlay annotation của đúng version đã được liên kết trong card chẩn đoán và khi mở nội dung evidence nội bộ.

## Quyết định đã chốt

- Phạm vi hiển thị chỉ là hồ sơ nội bộ: lượt khám/card chẩn đoán/thư viện ảnh. Không đưa diagnosis, ICD-10 hay thumbnail evidence vào PDF hoặc Lark.
- Mỗi lần tạo hoặc cập nhật chẩn đoán chỉ thêm một evidence mới; có thể mở lại chẩn đoán để thêm evidence tiếp theo.
- Form chẩn đoán chỉ chọn annotation đã tạo sẵn. Tạo/sửa annotation tiếp tục thực hiện tại `PatientImageGallery`.
- Ảnh JPEG/PNG/WebP có thumbnail và annotation; DICOM/CBCT/tệp không render được vẫn cho liên kết cấp tệp, bằng tile loại tệp và nhãn `Không có đánh dấu`.
- Giữ nguyên evidence/schema/API hiện có, gồm `annotation_version_id` immutable; không chuyển evidence sang annotation version mới.

## Bối cảnh hiện tại

- `ClinicalDiagnosesCard.tsx` tải ảnh bệnh nhân, nhưng dùng `<Select>` cho ảnh và annotation.
- `PatientImageGallery.tsx` đã có `ImageThumbnail`, `AnnotationOverlay`, tải blob qua endpoint đã xác thực, và UI tạo/chọn annotation.
- Evidence đã lưu `patient_image_id`, `annotation_version_id?`, relation/note và repository đã join `image` + `annotation_version` khi liệt kê evidence.
- API hiện hữu đủ cho V1: `GET /api/patient-images/:id/annotations`, `GET/POST /api/visits/:visitId/diagnoses/:diagnosisId/image-evidence`.

## Kế hoạch thực hiện

1. Tách phần xem thumbnail an toàn từ `apps/web/src/components/PatientImageGallery.tsx` thành component dùng chung, ví dụ `apps/web/src/components/image-annotations/EvidenceImageThumbnail.tsx`.
- Dùng `apiBlob(/api/patient-images/:id/file)` và quản lý `URL.createObjectURL`/revoke tương tự `ImageThumbnail` hiện có.
- Nhận `PatientImage`, annotation version tùy chọn, trạng thái selected, metadata lịch sử và callback click.
- Với ảnh render được, vẽ `AnnotationOverlay` theo geometry chuẩn hóa của `annotation_version`; đảm bảo overlay scale cùng ảnh và có aria label/outline khi chọn.
- Với tệp không render được hoặc tải thumbnail lỗi, hiển thị tile loại ảnh/tệp, không cố tạo thumbnail giả.
- Chuyển `AnnotationOverlay` sang export/shared module hoặc tách riêng để gallery và evidence thumbnail dùng cùng renderer. Không sao chép logic geometry.

2. Chỉnh `apps/web/src/components/ClinicalDiagnosesCard.tsx` thành luồng chọn evidence theo ảnh rồi annotation.
- Thay select ảnh bằng lưới thumbnail responsive: ưu tiên ảnh thuộc `visitId`, sau đó ảnh lịch sử; mỗi tile có tên ảnh/ngày, nhãn `Ảnh lượt khám này` hoặc `Ảnh lịch sử`, và trạng thái được chọn.
- Click tile đặt `evidenceForm.imageId`, reset annotation đã chọn, gọi endpoint annotations cho ảnh đó, và hiển thị danh sách annotation sẵn có của ảnh dưới dạng nút/tile mô tả `Ghim`/`Khung`, ghi chú, răng/vị trí nếu có.
- Ảnh render được có annotation: yêu cầu chọn một annotation trước khi thêm evidence; hiển thị thumbnail preview với overlay annotation được chọn.
- Ảnh render được chưa có annotation: không cho thêm evidence vùng ảnh, hiển thị chỉ dẫn rõ `Tạo đánh dấu trong thư viện ảnh trước khi liên kết` và một action điều hướng/mở thư viện ảnh nếu điểm tích hợp hiện có hỗ trợ. Không thêm editor annotation vào modal chẩn đoán.
- DICOM/CBCT/non-renderable cho chọn liên kết cấp tệp: bỏ qua picker annotation, hiển thị `Không có đánh dấu`, vẫn áp dụng relation/note và validation contradict.
- Duy trì một evidence nháp, relation và note như contract hiện tại; khi save, tiếp tục POST evidence sau khi diagnosis được tạo/cập nhật.

3. Hiển thị evidence đã liên kết trong card chẩn đoán.
- Khi mở edit, dùng `diagnosisEvidence` hiện có để hiển thị một dải thumbnail compact, không chỉ chuỗi `Đã có N bằng chứng...`.
- Mỗi thumbnail render ảnh/tile + overlay theo `evidence.annotation_version`, relation badge và note nếu có; bấm thumbnail mở preview nội bộ lớn hơn (dialog/lightbox) với annotation/note, không sửa annotation.
- Trên card danh sách diagnosis, giữ summary số lượng nhưng thêm disclosure để tải/hiển thị dải thumbnail evidence. Tránh eager-load blob của tất cả diagnoses: chỉ tải evidence detail/blob khi disclosure hoặc edit mở.
- Evidences cấp tệp hiển thị tile nhận diện loại tệp, relation và `Không có đánh dấu`.

4. Cập nhật `PatientImageGallery.tsx` để dùng component thumbnail/overlay chung mới, giữ nguyên luồng tạo annotation và liên kết từ gallery.
- Xác minh thumbnail gallery vẫn render annotation hiện tại, còn evidence từ diagnosis render annotation version bất biến từ response evidence.
- Không thay đổi các endpoint, payload create evidence, rules tenant/patient, audit, hoặc chặn xóa ảnh đang có evidence.

5. Rà soát các output nội bộ và output chia sẻ.
- Bảo đảm card chẩn đoán/visit detail là nơi duy nhất thêm thumbnail evidence.
- Không thay đổi PDF, báo giá, Lark, AI prompt hoặc các payload export; giữ ranh giới lâm sàng và quyền riêng tư hiện tại.

## Trạng thái và lỗi

- Đang tải thumbnail/annotation: skeleton trong tile/panel, không khóa các trường chẩn đoán không liên quan.
- Không có ảnh: hiển thị empty state trong khối evidence.
- Không có annotation cho ảnh renderable: hướng dẫn tạo annotation ở thư viện ảnh, không gửi evidence với `annotation_version_id = null` cho trường hợp này.
- Annotation tải lỗi/blob lỗi: toast lỗi hiện có, tile fallback không làm mất dữ liệu form đã chọn.
- `contradicts` tiếp tục bắt buộc note; `supports`/`incidental` cho phép note tùy chọn.
- Sau khi lưu evidence, refresh count và detail evidence để thumbnail mới xuất hiện; không tạo duplicate khi server trả lỗi unique constraint.

## Kiểm thử và xác nhận

1. Web unit/component tests nếu hạ tầng hiện có hỗ trợ:
- Render thumbnail ảnh có overlay pin/rectangle/freehand theo normalized geometry.
- Render fallback DICOM/CBCT và trường hợp blob lỗi.
- Chọn thumbnail reset annotation cũ; annotation mới được gửi đúng `annotation_version_id`.
- Ảnh renderable chưa có annotation không thể submit evidence; DICOM vẫn submit cấp tệp.
- Evidence đã lưu hiển thị đúng annotation version trả về, không phải current annotation version.

2. API regression:
- Chạy test route annotation/evidence hiện có, đặc biệt patient/tenant isolation và version thuộc ảnh khác bị từ chối.
- Bảo đảm không đổi payload/endpoint và evidence cấp tệp vẫn hợp lệ.

3. Manual desktop/mobile:
- Chọn ảnh lượt khám, chọn pin/khung có sẵn, lưu diagnosis, mở lại và kiểm tra overlay đúng vị trí.
- Chọn ảnh lịch sử, kiểm tra badge/lịch sử và evidence không bị lẫn bệnh nhân.
- Chọn DICOM/CBCT, lưu evidence cấp tệp, kiểm tra tile fallback.
- Cập nhật annotation sau khi đã liên kết, xác nhận card diagnosis vẫn render version cũ.
- Kiểm tra PDF/Lark không nhận field diagnosis/evidence/thumbnail.

4. Lệnh xác nhận:
```powershell
npm run test --workspace apps/api
npm run typecheck
npm run build
git diff --check
```

## Rủi ro và giới hạn

- Tải blob cho nhiều thumbnail có thể tốn băng thông; lazy-load qua `IntersectionObserver` hoặc chỉ hydrate preview ở tile đang thấy nếu lưới ảnh lớn.
- Cần giữ `URL.revokeObjectURL` khi tile unmount/đổi ảnh để tránh rò rỉ bộ nhớ.
- V1 không tạo annotation từ modal chẩn đoán và không hỗ trợ thao tác DICOM slice/CBCT; các yêu cầu đó thuộc luồng thư viện ảnh/trình xem chuyên dụng.
