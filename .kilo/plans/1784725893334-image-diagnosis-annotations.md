# Ghi Chú Trên Ảnh Làm Bằng Chứng Chẩn Đoán

## Mục tiêu
Cho phép bác sĩ đặt ghim hoặc vẽ khung chữ nhật trên ảnh lâm sàng/X-quang xem được trong trình duyệt, ghi chú vùng đó, rồi liên kết annotation với một hoặc nhiều chẩn đoán như bằng chứng hình ảnh có thể truy vết.

## Quyết định đã chốt
- V1 hỗ trợ hai hình dạng: `pin` (ghim) và `rectangle` (khung chữ nhật).
- Annotation lưu theo tọa độ chuẩn hóa 0..1, không sửa pixel hay ghi đè ảnh gốc trong R2.
- V1 annotation trực tiếp chỉ áp dụng cho ảnh browser-renderable: JPEG, PNG, WebP và X-quang đã export thành ảnh. Tệp DICOM/CBCT `.dcm` vẫn được liên kết làm bằng chứng ở cấp tệp, không đặt ghim/khung trên lát cắt.
- Luồng hai chiều:
  - Trong form chẩn đoán: chọn ảnh, tạo/chọn annotation và liên kết ngay.
  - Trong thư viện ảnh: tạo annotation rồi liên kết với chẩn đoán hiện hữu.
- Từ thư viện ảnh ở hồ sơ bệnh nhân, bác sĩ chọn được chẩn đoán thuộc mọi lượt khám của cùng bệnh nhân; phải hiển thị ngày/lượt khám/trạng thái.
- Một annotation version cụ thể có thể liên kết nhiều chẩn đoán. Mỗi liên kết có quan hệ `supports`, `contradicts`, hoặc `incidental`.
- Annotation đã từng lưu không sửa đè: thao tác sửa tạo version mới. Các liên kết evidence đang có tiếp tục trỏ bản version cũ.
- Chặn xóa `patient_image` khi tồn tại annotation version đang được liên kết làm evidence. Người dùng phải tải ảnh mới và tạo liên kết mới nếu cần thay thế.
- Chỉ người có `read_patients` được đọc ảnh/annotation/evidence; tạo version, liên kết, hủy liên kết và xóa annotation chưa được tham chiếu dùng `write_findings`. Tất cả mutation audit theo entity riêng.

## Sơ đồ dữ liệu

1. Tạo migration mới sau `0053` trong `src/db/migrations/`.

2. Bảng identity `image_annotations`:
- `id TEXT PRIMARY KEY`
- `tenant_id TEXT NOT NULL REFERENCES tenants(id)`
- `patient_image_id TEXT NOT NULL REFERENCES patient_images(id)`
- `current_version_no INTEGER NOT NULL DEFAULT 1`
- `created_by TEXT NOT NULL REFERENCES users(id)`
- `created_at TEXT NOT NULL`
- `updated_at TEXT NOT NULL`
- Index `(tenant_id, patient_image_id, created_at DESC)`.

3. Bảng immutable `image_annotation_versions`:
- `id TEXT PRIMARY KEY`
- `tenant_id TEXT NOT NULL`
- `annotation_id TEXT NOT NULL REFERENCES image_annotations(id) ON DELETE CASCADE`
- `version_no INTEGER NOT NULL`
- `shape_type TEXT NOT NULL CHECK (shape_type IN ('pin', 'rectangle'))`
- `geometry_json TEXT NOT NULL`
- `note TEXT NOT NULL`
- `tooth_number INTEGER NULL`
- `anatomical_site TEXT NULL`
- `created_by TEXT NOT NULL REFERENCES users(id)`
- `created_at TEXT NOT NULL`
- `UNIQUE(annotation_id, version_no)`
- Index `(tenant_id, annotation_id, version_no DESC)`.

4. Geometry contract, validated server-side:
- Pin: `{ "x": number, "y": number }`.
- Rectangle: `{ "x": number, "y": number, "width": number, "height": number }`.
- Mọi số là finite và trong `[0, 1]`; rectangle phải có `width > 0`, `height > 0`, `x + width <= 1`, `y + height <= 1`.
- Không lưu pixel/canvas dimension; renderer scale overlay theo ảnh thật để annotation vẫn đúng khi responsive/zoom.

5. Bảng evidence nhiều-nhiều `clinical_diagnosis_image_evidence`:
- `id TEXT PRIMARY KEY`
- `tenant_id TEXT NOT NULL REFERENCES tenants(id)`
- `diagnosis_id TEXT NOT NULL REFERENCES clinical_diagnoses(id) ON DELETE CASCADE`
- `patient_image_id TEXT NOT NULL REFERENCES patient_images(id)`
- `annotation_version_id TEXT NULL REFERENCES image_annotation_versions(id)`
- `relation TEXT NOT NULL CHECK (relation IN ('supports', 'contradicts', 'incidental'))`
- `note TEXT NULL`
- `linked_by TEXT NOT NULL REFERENCES users(id)`
- `linked_at TEXT NOT NULL`
- `UNIQUE(diagnosis_id, patient_image_id, annotation_version_id)`.
- Permit `annotation_version_id = NULL` cho evidence ở cấp tệp, gồm DICOM/CBCT; với ảnh xem được, UI mặc định yêu cầu chọn/tạo annotation trước khi liên kết.
- Index `(tenant_id, diagnosis_id)` và `(tenant_id, patient_image_id)`.

6. Trigger hoặc service-level guard bắt buộc:
- `clinical_diagnoses.patient_id = patient_images.patient_id` cho mọi evidence.
- Tenant của diagnosis, image, annotation/version và evidence phải trùng nhau.
- `annotation_version_id` phải thuộc annotation có `patient_image_id` trùng evidence.
- Không cho delete `patient_images` nếu tồn tại evidence qua `patient_image_id`; service trả `409` với thông báo tiếng Việt.

## Shared types và validation

1. Mở rộng `src/shared/types/index.ts`:
- `ImageAnnotationShapeType`, `ImageEvidenceRelation`.
- `ImageAnnotationGeometry`, `ImageAnnotation`, `ImageAnnotationVersion`.
- `ClinicalDiagnosisImageEvidence`, kèm field hiển thị ảnh/annotation tối thiểu khi list.
- Bổ sung `annotation_count`/`evidence_count` tùy nhu cầu cho `PatientImage` hoặc response list chuyên dụng, không làm thay đổi contract upload hiện có.

2. Mở rộng `src/shared/validation/index.ts`:
- Schema geometry discriminated union cho pin/rectangle.
- Create annotation: `patient_image_id`, `shape_type`, `geometry`, `note`, `tooth_number?`, `anatomical_site?`.
- Create annotation version: nội dung shape/geometry/note và `change_reason` bắt buộc.
- Create evidence: `patient_image_id`, `annotation_version_id?`, `relation`, `note?`.
- Batch optional cho form tạo diagnosis: thêm `image_evidence[]` vào `diagnosisCreateSchema`; mỗi item không nhận tenant/patient/actor/snapshot từ client.
- Update diagnosis evidence không nhồi vào `diagnosisUpdateSchema`; dùng endpoint evidence riêng để không làm mơ hồ revision chẩn đoán.

## API và service

1. Thêm repository `apps/api/src/repositories/image-annotations.repo.ts`:
- List/get current annotation versions theo `patient_image_id` và tenant.
- Get annotation/version scoped tenant.
- Create annotation + version đầu tiên trong batch.
- Create version kế tiếp atomically, tăng `current_version_no`.
- List evidence theo diagnosis/image/patient; join `patient_images`, annotation version và visit metadata khi cần UI.
- Create/delete evidence scoped tenant.
- `hasEvidenceForImage` để chặn xóa ảnh.

2. Thêm service `apps/api/src/services/image-annotations.service.ts`:
- Resolve image theo tenant, kiểm tra ảnh thuộc patient được yêu cầu.
- Chỉ cho tạo ghim/khung nếu MIME/file renderable; dẫn rõ người dùng dùng evidence cấp tệp với DICOM.
- Validate geometry, tooth FDI nếu được nhập, anatomical site và note.
- Khi version annotation: không update row version cũ; tạo `image_annotation_versions` mới; không tự chuyển evidence cũ sang version mới.
- Khi tạo evidence: xác thực diagnosis và image cùng tenant/cùng patient; với `annotation_version_id`, xác thực liên hệ image-version chính xác.
- List patient diagnoses có metadata lượt khám để dùng từ thư viện ảnh.
- Record audit metadata không có nội dung ghi chú/ảnh; audit action chỉ gồm ID, relation, shape type, version number.

3. Bổ sung routes dưới `apps/api/src/routes/patient-images.ts`:
- `GET /api/patient-images/:id/annotations` (`read_patients`), trả annotation current versions.
- `POST /api/patient-images/:id/annotations` (`write_findings`, audit create), tạo annotation version 1.
- `POST /api/patient-images/:id/annotations/:annotationId/versions` (`write_findings`, audit update), tạo bản mới với lý do.
- `GET /api/patient-images/:id/diagnosis-options` (`read_patients`), trả chẩn đoán mọi lượt khám cùng patient, gồm visit date/code/status; list không bao gồm PII dư thừa.
- `GET /api/patient-images/:id/evidence` (`read_patients`) để hiển thị nơi ảnh đang được dùng.
- Cập nhật `DELETE /api/patient-images/:id`: gọi `hasEvidenceForImage` trước R2 deletion; nếu có evidence, ném `ConflictError("Không thể xóa ảnh đang được dùng làm bằng chứng chẩn đoán")`.

4. Bổ sung routes dưới `apps/api/src/routes/visits.ts`:
- `GET /api/visits/:visitId/diagnoses/:diagnosisId/image-evidence` (`read_patients`).
- `POST /api/visits/:visitId/diagnoses/:diagnosisId/image-evidence` (`write_findings`, audit create).
- `DELETE /api/visits/:visitId/diagnoses/:diagnosisId/image-evidence/:evidenceId` (`write_findings`, audit delete); chỉ gỡ liên kết, không xóa annotation hay ảnh.
- Mở rộng response `GET /:id/diagnoses` để trả `image_evidence_count`; UI tải chi tiết bằng endpoint evidence để tránh query payload lớn.
- Nếu thêm `image_evidence[]` lúc create diagnosis, service tạo diagnosis trước, sau đó insert evidence trong cùng D1 batch; lỗi validation evidence phải làm toàn bộ request thất bại.

5. Không thay đổi ý nghĩa của `source_finding_id`: trường này tiếp tục là một ghi nhận lâm sàng duy nhất trong lượt khám. Evidence hình ảnh là lớp riêng, đa nguồn và đa chẩn đoán.

## UI

1. Tách component tái sử dụng tại `apps/web/src/components/image-annotations/`:
- `ImageAnnotationCanvas`: render ảnh và SVG overlay; nhận annotation versions, zoom/pan tối thiểu, selection state.
- `ImageAnnotationEditor`: toolbar `Ghim`/`Khung`, thao tác click-drag, textarea ghi chú, optional tooth number/anatomical site, save/cancel.
- Dùng SVG overlay với `viewBox="0 0 1 1"` hoặc CSS `%`; không dùng canvas raster để giữ hình gốc không bị chỉnh sửa và overlay nét ở mọi độ phân giải.
- Hỗ trợ keyboard cơ bản: Escape bỏ thao tác, Delete chỉ bỏ annotation draft chưa lưu; buttons có aria labels.

2. Cập nhật `PatientImageGallery.tsx`:
- Trong dialog ảnh có nút `Đánh dấu trên ảnh` khi blob render được; không hiện cho DICOM/CBCT không xem trước.
- Hiển thị overlay annotation current version ở chế độ xem ảnh; click pin/khung mở panel ghi chú, răng/vị trí, người tạo/thời điểm và phiên bản.
- Nút `Liên kết chẩn đoán` mở picker các diagnosis của mọi lượt khám thuộc cùng bệnh nhân, hiển thị `ngày khám · kết luận · trạng thái`; cho chọn relation và note.
- Với DICOM/non-renderable, thay editor bằng nút `Liên kết làm bằng chứng hình ảnh`; tạo evidence cấp tệp và hiển thị thông báo không thể đánh dấu trực tiếp.
- Trong danh sách ảnh, hiển thị badge số annotation/evidence nếu API trả count; trước khi bấm xóa, nếu server trả 409 hiển thị lý do và không đóng dialog.
- Giữ AI image analysis là đề xuất finding riêng; không tự biến AI finding thành annotation/evidence hoặc diagnosis xác nhận.

3. Cập nhật `ClinicalDiagnosesCard.tsx`:
- Thêm khối `Bằng chứng hình ảnh (tùy chọn)` dưới ghi nhận lâm sàng.
- Hiển thị thumbnails của ảnh cùng bệnh nhân: ảnh lượt hiện tại trước, sau đó ảnh lịch sử có ngày chụp/tải và badge `Ảnh từ lượt khác`.
- Chọn ảnh mở `ImageAnnotationCanvas`; ảnh viewable phải tạo/chọn annotation, DICOM cho phép evidence cấp tệp.
- Cho chọn nhiều evidence trước khi lưu chẩn đoán và relation từng evidence; gửi batch theo create route hoặc tạo liên kết sau create.
- Khi sửa diagnosis, hiển thị danh sách evidence current cùng relation/note, cho thêm/gỡ liên kết. Gỡ chỉ xóa evidence link.
- Hiển thị summary trên card diagnosis: `Bằng chứng hình ảnh: N`, với disclosure mở danh sách ảnh/annotation; annotation cũ vẫn render đúng version mà evidence trỏ tới.

4. UX safeguard:
- Distinguish labels: `Ghi nhận làm cơ sở` dành cho finding lâm sàng; `Bằng chứng hình ảnh` dành cho annotation/image.
- Nếu relation là `contradicts`, display warning color and require evidence note explaining conflict.
- Annotation phải có note không rỗng; relation `incidental` không được dùng làm cơ sở mặc định để xác nhận diagnosis.

## Kiểm thử

1. Migration D1:
- Apply migrations mới trên database local có dữ liệu ảnh/chẩn đoán cũ.
- Verify schema/index/FK and no rewrite of original R2 objects or existing diagnoses.

2. Unit/repository tests:
- Tenant isolation cho annotation/version/evidence list/get/create/delete.
- Tạo version tăng đúng số, giữ geometry/note version trước không đổi.
- Geometry reject NaN/out-of-range/zero-area rectangle/overflow rectangle.
- Evidence reject image khác tenant, patient khác diagnosis, version thuộc ảnh khác.
- Một annotation version liên kết nhiều diagnosis và một diagnosis liên kết nhiều evidence.
- Delete image bị chặn khi evidence tồn tại; permitted only when no evidence.

3. API route/service tests:
- Permission `read_patients` vs `write_findings`.
- Patient-level diagnosis options không lộ diagnosis thuộc patient/tenant khác.
- DICOM permits file-level evidence but rejects geometry annotation endpoint with explanatory 422.
- Diagnosis create với batch evidence rolls back on invalid evidence.
- Gỡ evidence không xóa annotation/image; create annotation version does not move existing evidence.

4. Web tests/manual verification:
- Desktop/mobile: pin, drag rectangle, note, save, reopen, zoom/responsive render stays aligned.
- Create diagnosis from visit with clinical finding + X-ray annotation; inspect summary.
- From patient image gallery, annotate historic image then link it to diagnosis in another visit.
- Update annotation and verify diagnosis still displays original linked version.
- Verify blocked delete message for evidence image; verify removable image with no evidence.
- Check normal upload, AI analysis, existing gallery filtering and diagnosis form behavior stay intact.

5. Commands:
```powershell
npm run d1:migrations:local --workspace apps/api
npm run test --workspace apps/api
npm run typecheck
npm run build
git diff --check
```

## Rollout and constraints
- Deploy migration before routes/UI. Existing images and diagnoses are unaffected because feature is additive.
- Deploy API before frontend so route availability precedes UI actions.
- Do not seed annotations/evidence from AI or legacy notes automatically.
- Keep raw image access private through existing Worker authentication and R2 path; never expose annotation note content in audit logs.
- DICOM viewer with slice navigation, measurement tools, and direct annotation is explicitly out of V1; revisit as a dedicated imaging-viewer effort.
