# Kế hoạch hoàn thiện luồng khám, chẩn đoán và điều trị

## Mục tiêu

Hoàn thiện luồng hiện tại:

```text
Khám -> finding -> chẩn đoán -> plan -> case -> milestone
```

thành luồng hồ sơ lâm sàng có trách nhiệm bác sĩ, consent có bằng chứng, và lịch sử bất biến sau sign-off:

```text
Đặt hẹn -> arrive -> pre-exam draft
-> bác sĩ review/xác nhận
-> chẩn đoán hiệu lực -> plan draft
-> bác sĩ phê duyệt version plan
-> bệnh nhân/đại diện ký consent cho đúng version
-> kích hoạt case -> thực hiện milestone
-> sign-off/amendment theo lịch sử bất biến
```

## Nguyên tắc

- Giữ `status` hiện tại của visit/plan cho tương thích; thêm `clinical_state` và versioning thay vì thay đổi đột ngột.
- Bác sĩ là chủ thể duy nhất tạo dữ liệu có hiệu lực lâm sàng, sign-off visit, duyệt plan và xác nhận amendment.
- AI và phụ tá chỉ tạo dữ liệu draft hoặc đề xuất; không trực tiếp tạo diagnosis/finding effective.
- Không sửa trực tiếp hồ sơ hoặc plan version đã ký/đồng ý.
- Consent luôn trỏ đến đúng snapshot/version plan đã được bác sĩ phê duyệt.
- DICOM/CBCT chỉ được lưu trữ; không AI analysis, annotation, hoặc tuyên bố hỗ trợ chẩn đoán.
- Mỗi thao tác clinical quan trọng phải có audit bắt buộc và không chứa PHI trong generic audit log.
- Chữ ký nét bút tại quầy là bằng chứng đồng ý có truy vết; không gắn nhãn chữ ký số hoặc tuyên bố tuân thủ pháp lý đầy đủ nếu chưa có xác nhận pháp chế độc lập.

## Giai đoạn 0: Hoàn tất P0 còn lại

### Mục tiêu

Khóa các lỗ hổng nguyên tử và nhất quán trước khi thêm domain mới.

### Việc thực hiện

1. Chuyển `apps/web/src/components/VoiceFindingsDialog.tsx` sang `POST /api/visits/:id/findings/batch`.
2. Hiển thị `details.item_index` tại đúng finding lỗi trong UI voice và AI image.
3. Bổ sung regression tests:
   - Voice batch không tạo partial finding.
   - AI image từ file sai MIME, lớn hơn 5 MB, DICOM/CBCT bị từ chối.
   - `visit_id` không khớp `patient_image.visit_id` bị từ chối.
   - Update/delete finding ở route visit khác trả `404`.
   - Batch audit có `entity_id`.
4. Rà migration `src/db/migrations/0060_clinical_workflow_evidence_and_consent.sql`:
   - Update legacy phải an toàn theo tenant/batch migration.
   - Không hồi tố `signed_by`, consent, hash hoặc approver cho dữ liệu lịch sử.

### Tiêu chí hoàn tất

- Mọi luồng AI/voice/image chỉ là input có validation.
- Không có ghi dữ liệu dang dở khi batch lỗi.
- Test API bao phủ các case cross-record, MIME/size và item index.

## Giai đoạn 1: Visit Type, Pre-exam và Doctor Review

### Mục tiêu

Phân biệt dữ liệu do phụ tá/AI nhập với dữ liệu bác sĩ đã xác nhận.

### Schema và migration

Thêm vào `visits`:

```text
visit_type:
  initial_exam | follow_up | treatment | emergency

clinical_state:
  pre_exam | awaiting_doctor_review | in_progress | signed | amended | cancelled

effective_at
signed_by
signed_at
locked_at
legacy_at
legacy_source
```

Tạo `clinical_review_events`:

```text
id
tenant_id
visit_id
entity_type
entity_id
review_status: pending | accepted | rejected | superseded
entered_by
reviewed_by
reviewed_at
review_note
created_at
```

Mở rộng finding và diagnosis, hoặc tạo projection từ review events, để thể hiện:

```text
entered_by
entry_source: manual | assistant | AI_voice | AI_image
clinical_effective_at
```

### API và service

Thêm các endpoint:

```text
POST /api/visits/:id/pre-exam/submit
GET  /api/visits/:id/review-queue
POST /api/visits/:id/reviews/:entityType/:entityId/accept
POST /api/visits/:id/reviews/:entityType/:entityId/reject
POST /api/visits/:id/reviews/:entityType/:entityId/edit-and-accept
POST /api/visits/:id/reviews/batch
```

Quy tắc:

- Assistant chỉ có quyền tạo/sửa pre-exam draft.
- Assistant không được xác nhận diagnosis, approve plan, sign visit, tạo amendment effective hoặc bypass consent.
- Chỉ record `accepted` hoặc do bác sĩ tạo mới được tính là clinical-effective.
- Chỉ clinical-effective finding/diagnosis được dùng cho AI generate plan, clinical summary/report và sign-off validation.
- AI voice/image finding mặc định `pending review`.
- Bác sĩ có thể accept, reject, hoặc edit-and-accept từng item và theo batch.

### Frontend

Tái cấu trúc `apps/web/src/pages/VisitDetailPage.tsx` thành ba lane:

1. `Pre-exam draft`: sinh hiệu, bệnh sử, ảnh, đo nha chu, finding/diagnosis đề xuất.
2. `Chờ bác sĩ duyệt`: review queue, accept, reject, edit-and-accept, batch review.
3. `Hồ sơ lâm sàng hiệu lực`: chỉ dữ liệu accepted/doctor-created, kèm badge tác giả, reviewer, nguồn và timestamp.

### Tiêu chí hoàn tất

- Draft không thể hiển thị như chẩn đoán/finding có hiệu lực.
- AI và phụ tá không thể trực tiếp đưa record vào plan input hay sign-off.
- Tất cả review actions có RBAC và audit.

## Giai đoạn 2: Initial Exam và Patient Safety

### Mục tiêu

Đưa dữ liệu khám ban đầu vào cấu trúc thay vì phụ thuộc `visits.notes`.

### Schema

Tạo `visit_initial_assessments`:

```text
visit_id
chief_complaint
history_of_present_illness
dental_history
medical_conditions
medications
allergies
pregnancy_lactation
tobacco_alcohol
asa_class
examination_summary
preliminary_risk_notes
entered_by
reviewed_by
created_at
reviewed_at
review_state
```

Khởi đầu có thể dùng JSON được validate nghiêm ngặt bằng Zod cho medication, allergy và condition; chuẩn bị migration normalize thành bảng riêng nếu cần reporting/lọc phức tạp.

### Validation theo visit type

- `initial_exam`: chief complaint, review medical/allergy, acknowledgement sinh hiệu, finding/assessment hoặc lý do không thực hiện.
- `follow_up`: diễn biến và đánh giá tiến triển.
- `treatment`: điều trị dự kiến/thực hiện và liên kết case/milestone.
- `emergency`: tình trạng khẩn, triage và quyết định xử trí.

### Safety acknowledgement

Warning huyết áp, đường huyết, BMI là decision support. Bác sĩ cần chọn một outcome:

```text
acknowledged
continue_with_reason
defer_treatment
refer_or_escalate
```

Không tự động chặn xử trí cấp cứu.

### Tiêu chí hoàn tất

- Initial exam có cấu trúc để audit và reporting.
- Required fields được enforce ở service/validation, không chỉ tại frontend.
- Các warning quan trọng có acknowledgement của bác sĩ.

## Giai đoạn 3: Visit Sign-off và Amendment Bất Biến

### Mục tiêu

Sau khi bác sĩ ký, bản gốc không thể bị sửa trực tiếp.

### Schema

Tạo `clinical_record_versions`:

```text
id
tenant_id
visit_id
version_no
canonical_payload_json
sha256
reason
created_by
created_at
supersedes_version_id
archive_file_id
```

Canonical payload gồm:

- Visit và initial assessment effective.
- Findings accepted.
- Diagnosis accepted/confirmed.
- Clinical warnings và acknowledgement.
- Liên kết image evidence.
- Người ký, timestamp và version metadata.

### API

```text
POST /api/visits/:id/sign
GET  /api/visits/:id/versions
GET  /api/visits/:id/versions/:versionId
POST /api/visits/:id/amendments
```

### Quy tắc sign-off

1. Kiểm tra `clinical_state` hợp lệ.
2. Kiểm tra dữ liệu bắt buộc theo `visit_type`.
3. Bảo đảm không còn draft/review pending cần bác sĩ quyết định.
4. Tạo canonical snapshot và SHA-256.
5. Tạo PDF archive trong private storage.
6. Lưu `signed_by`, `signed_at`, `locked_at`.
7. Chuyển `clinical_state = signed`.
8. Ghi audit bắt buộc; lỗi audit/archive phải làm sign-off thất bại.

### Quy tắc amendment

Sau `locked_at`, chặn PATCH/DELETE trực tiếp visit, assessment, effective finding, diagnosis và image evidence. Sửa sai chỉ qua amendment có:

```text
reason
before/after diff
new record version
supersedes_version_id
```

### Tiêu chí hoàn tất

- Signed visit có snapshot, hash, archive, audit.
- Direct mutation của record đã khóa bị từ chối từ service layer.
- Amendment giữ nguyên lịch sử bản gốc.

## Giai đoạn 4: Version Hóa Treatment Plan và Clinical Approval

### Mục tiêu

Tách plan draft, phê duyệt chuyên môn và plan version được consent.

### Schema

Thêm vào `treatment_plans`:

```text
approved_by
approved_at
current_version_no
clinical_approved_version_id
legacy_at
```

Tạo `treatment_plan_versions`:

```text
id
tenant_id
version_no
state: draft | clinically_approved | superseded | cancelled
canonical_payload_json
sha256
created_by
created_at
approved_by
approved_at
archive_file_id
```

Plan snapshot phải bao gồm header, items, giá/VAT snapshot, duration, service catalog snapshot, personnel và tổng chi phí.

### API

```text
POST /api/treatment-plans/:id/versions
POST /api/treatment-plans/:id/versions/:versionId/approve
GET  /api/treatment-plans/:id/versions
GET  /api/treatment-plans/:id/versions/:versionId/pdf
```

### Quy tắc

- Bác sĩ/signatory có quyền mới có thể clinical-approve.
- Approval tạo snapshot, hash, durable approver và archive PDF theo version.
- Không sửa trực tiếp version approved.
- Sửa plan sau approval tạo working version mới; version cũ chỉ được supersede, không mutate.
- PDF draft có watermark `BẢN NHÁP - CHƯA ĐƯỢC ĐỒNG Ý`.

### Tiêu chí hoàn tất

- Consent/case luôn tham chiếu một plan version cụ thể.
- Không thể thay đổi nội dung version đã clinical-approved.

## Giai đoạn 5: Consent tại quầy và Đại diện Hợp pháp

### Mục tiêu

Chỉ kích hoạt case và thực hiện thủ thuật rủi ro khi có bằng chứng đồng ý phù hợp.

### Schema

Tạo:

```text
legal_representatives
consent_templates
consent_records
high_risk_procedure_rules
```

`consent_records` tối thiểu gồm:

```text
patient_id
legal_representative_id
plan_version_id
milestone_id
treatment_plan_item_id
template_id
status: pending | signed | withdrawn | superseded
signature_file_id
document_archive_file_id
signer_name
signer_relationship
witnessed_by
signed_at
content_hash
withdrawal_reason
withdrawn_by
withdrawn_at
```

### Luồng kiosk

```text
Plan version clinically approved
-> render document bất biến
-> staff mở kiosk scoped theo consent session
-> xác định bệnh nhân hoặc legal representative
-> đọc/acknowledge nội dung
-> ký nét bút trên thiết bị
-> nhân viên witness xác nhận
-> lưu signature image, metadata và hash
-> render final consent PDF archive
-> consent signed
```

### Quy tắc

- Người lớn tự ký.
- Trẻ em/người không đủ năng lực phải dùng `legal_representative` active và verified.
- Không cho nhập tùy ý người đi cùng.
- Withdrawal không xóa lịch sử.
- Consent signed phải trỏ đúng `clinical_approved_version_id`.
- Chỉnh sửa plan sau consent yêu cầu version mới, approval mới và consent mới.

### Gate điều trị

Cập nhật `treatmentCasesService.activate()` để yêu cầu:

```text
plan approved
+ current clinically approved version
+ active signed plan consent cho đúng version
= activate allowed
```

Milestone start/complete cần consent chuyên biệt còn hiệu lực nếu service khớp `high_risk_procedure_rules`.

Nhóm high-risk khởi đầu:

- Phẫu thuật/nhổ răng.
- Implant.
- Điều trị tủy.
- Gây tê/gây mê.
- Chỉnh nha.
- Phục hình không hồi phục.

### Tiêu chí hoàn tất

- Không thể activate case nếu thiếu/sai/superseded/withdrawn consent.
- Không thể bắt đầu hoặc hoàn tất high-risk milestone khi thiếu procedure consent.
- Mọi consent artifact được lưu private, có hash và audit.

## Giai đoạn 6: Audit, Security và Reporting

### Mục tiêu

Các thao tác clinical quan trọng phải có evidence truy vết đáng tin cậy.

### Audit bắt buộc

Chuyển từ best-effort sang transactionally required cho:

- Visit sign-off.
- Amendment.
- Clinical plan approval/version.
- Consent sign/withdraw.
- Treatment case activation.
- High-risk milestone start/complete.
- Audit export.

Generic `audit_logs.details` chỉ lưu metadata không PHI:

```text
entity_id
version_id
reason_category
sha256
```

Clinical payload, consent content, signature bitmap, diagnosis detail và diff lưu trong tenant-protected clinical tables chuyên dụng.

### Reporting và export

Thêm filter theo tenant/branch, time range, entity type/entity ID, version ID, action và actor.

Export CSV phải kiểm tra quyền, bắt buộc date range, ghi audit event và không xuất raw clinical/consent content ngoài quyền cho phép.

### Tiêu chí hoàn tất

- Failure audit/archive/signature làm business action thất bại an toàn.
- Export và truy vết có RBAC, date range và audit.

## Giai đoạn 7: Migration, Feature Flag và Go-live

### Mục tiêu

Triển khai không làm hỏng hoặc ghi đè lịch sử.

### Việc thực hiện

1. Đánh dấu visit completed và plan approved cũ là `legacy`.
2. Không backfill giả `signed_by`, signature, consent, hash hoặc approver.
3. Legacy record vẫn đọc được; sửa sau rollout phải dùng amendment/version mới.
4. Active case legacy không bị chặn hồi tố; tạo work queue để bổ sung plan version/consent trước high-risk milestone tiếp theo.
5. Thêm feature flags theo tenant/branch:

```text
clinical_review_enabled
visit_signoff_enabled
plan_versioning_enabled
consent_enabled
high_risk_consent_gate_enabled
```

6. Chạy migration đầu tiên trên staging clone.
7. Reconcile theo tenant: visit, plan, active case, image links và trạng thái legacy.
8. Rollback bằng API routing/feature flag, không xóa evidence mới tạo.

### Tiêu chí hoàn tất

- Dữ liệu lịch sử vẫn truy cập được và không bị giả mạo compliance metadata.
- Có UAT và migration reconciliation trước khi bật flag production.

## Thứ tự triển khai đề xuất

1. Giai đoạn 0: P0 còn lại.
2. Giai đoạn 1: visit type, pre-exam, review queue, RBAC.
3. Giai đoạn 2: initial assessment và safety acknowledgement.
4. Giai đoạn 3: sign-off, record versions, hash, archive, amendment.
5. Giai đoạn 4: treatment plan versions và clinical approval.
6. Giai đoạn 5: legal representative, kiosk consent và consent gates.
7. Giai đoạn 6: required audit, export và security hardening.
8. Giai đoạn 7: legacy migration, feature flags, E2E/UAT và rollout.

## Bộ kiểm thử bắt buộc

### Unit/schema

- Invalid FDI/duration/clinical state transition.
- Required fields theo visit type.
- Initial assessment structured validation.
- Consent signer/representative rules.
- High-risk consent matching.
- Amendment reason bắt buộc.

### API/service

- Assistant tạo pre-exam nhưng không thể confirm diagnosis, approve plan, sign visit hoặc bypass consent.
- AI/voice/image finding chỉ thành effective sau doctor review.
- Signed visit chặn PATCH/DELETE clinical content; amendment tạo version mới và giữ hash bản cũ.
- Plan approval snapshot chính xác items; edit tạo working version mới.
- Case activation từ chối khi thiếu, sai version, superseded hoặc withdrawn consent.
- High-risk milestone từ chối nếu thiếu procedure consent hợp lệ.
- Consent yêu cầu active template/version, signer hợp lệ, representative verified khi cần, witness, signature artifact, archive và hash.
- Consent withdrawal vẫn có lịch sử nhưng chặn treatment tương lai phù hợp.
- DICOM/CBCT luôn bị chặn khỏi AI/annotation.
- Audit/archive/signature persistence failure làm sign/approval/consent fail safely.

### Browser/E2E

- Assistant pre-exam -> doctor review -> visit sign-off.
- Plan draft -> clinical approval -> kiosk consent -> activate case.
- Signed visit -> amendment.
- Child patient -> verified representative consent.
- DICOM UI restrictions.
- Legacy active case -> consent queue trước high-risk milestone.

## Go-live gates

- Pháp chế phê duyệt template consent, witness protocol, representative verification, retention và patient-copy process.
- Clinical governance xác nhận initial-exam fields, high-risk mapping, review responsibility, sign-off và emergency exception.
- Security xác nhận tenant isolation, kiosk timeout, private storage, encryption/secret rotation, backup/restore và audit export access.
- Reconcile staging migration counts và hoàn tất UAT trước khi bật feature flags theo tenant/branch.
