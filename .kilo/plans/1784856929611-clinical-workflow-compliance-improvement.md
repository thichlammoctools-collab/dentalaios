# Kế hoạch cải tiến DentalAIOS: An toàn lâm sàng, workflow lõi và hồ sơ có truy vết

## Mục tiêu và quyết định đã chốt

Triển khai bản phát hành đầu tiên theo phạm vi **an toàn + workflow lõi** cho phòng khám thực tế tại Việt Nam:

- Sửa các lỗi integrity và luồng AI trước khi mở rộng tính năng.
- Visit có loại: `initial_exam`, `follow_up`, `treatment`, `emergency`.
- Phụ tá được nhập dữ liệu dự thảo đầy đủ; bác sĩ là người duy nhất review/xác nhận hoặc bác bỏ dữ liệu có hiệu lực lâm sàng.
- Bác sĩ phê duyệt chuyên môn kế hoạch trước; bệnh nhân/đại diện hợp pháp phải đồng ý phiên bản kế hoạch đã chốt trước khi kích hoạt treatment case.
- Consent tại quầy dùng nét ký trên thiết bị + nhân viên chứng kiến. Lưu hình ký, bản tài liệu bất biến, hash, thời gian máy chủ, thiết bị/IP và danh tính người chứng kiến.
- Với trẻ em/người không đủ năng lực, chỉ đại diện hợp pháp được ký thay và phải được định danh/lưu quan hệ.
- Thủ thuật xâm lấn hoặc rủi ro cao cần consent chuyên biệt gắn theo milestone.
- DICOM/CBCT chỉ được lưu trữ; không xem, không phân tích AI và không tuyên bố hỗ trợ chẩn đoán CBCT.
- Bản ghi lịch sử giữ nguyên, gắn `legacy`; không hồi tố chữ ký/consent. Mọi thay đổi sau ngày hiệu lực đi qua amendment bất biến.
- Sau sign-off, không sửa trực tiếp bản gốc; tạo amendment với lý do, diff, tác giả và xác nhận bác sĩ.

> **Ràng buộc pháp lý:** chữ ký nét bút tại quầy có nhân viên chứng kiến chỉ là bằng chứng đồng ý có truy vết. Không được gắn nhãn là chữ ký số/chữ ký điện tử hợp lệ hoặc tuyên bố “tuân thủ pháp lý đầy đủ” trước khi pháp chế độc lập xác nhận biểu mẫu, quy trình, thời hạn lưu giữ và giá trị chứng cứ.

## Luồng mục tiêu

```text
Đặt hẹn → arrive → mở visit theo loại
→ phụ tá nhập pre-exam draft (sinh hiệu, bệnh sử, ảnh, đo nha chu, findings/diagnosis sơ khởi)
→ bác sĩ review: xác nhận / chỉnh sửa / bác bỏ từng dữ liệu dự thảo
→ bác sĩ hoàn thiện khám, chẩn đoán, kế hoạch
→ ký và khóa visit; sau đó chỉ amendment bất biến

Draft plan → bác sĩ phê duyệt chuyên môn và chốt version/snapshot PDF
→ bệnh nhân hoặc đại diện hợp pháp ký consent tại quầy vào plan version đó
→ kích hoạt treatment case → milestones
→ với milestone xâm lấn/rủi ro cao: xác minh consent chuyên biệt còn hiệu lực trước thực hiện

Mọi thay đổi plan đã consent → tạo version mới → bác sĩ phê duyệt → consent mới.
```

## P0 — Integrity, AI và phạm vi hình ảnh

### 1. Sửa AI treatment-plan save

- Mở rộng `EditableItem`/`TreatmentPlanItemDraft` để bắt buộc có `estimated_duration_min`; dùng duration từ service catalog khi có, hoặc yêu cầu bác sĩ chọn giá trị hợp lệ 1–480 phút trước save.
- Gửi `estimated_duration_min` ở cả hai luồng:
  - `apps/web/src/pages/VisitDetailPage.tsx:577-605`
  - `apps/web/src/pages/TreatmentPlanAiPage.tsx:41-73`
- Giữ server validation tại `src/shared/validation/index.ts:502-515` là source of truth; không nới lỏng field bắt buộc để che lỗi UI.
- Thay vòng lặp POST từng item bằng API batch tạo plan + items, transaction/batch D1 và rollback có bù trừ nếu item không hợp lệ; trả về toàn bộ plan/items hoặc không ghi gì.
- Với AI output không có duration: map bằng `service_code`; nếu không map được, trả item ở trạng thái cần người dùng nhập duration thay vì tự gán giá trị giả.

### 2. Đóng các lỗ hổng liên kết record

- Trong `visitService.updateFinding` tại `apps/api/src/services/visit.service.ts:158-176`, load finding theo `tenant_id + visit_id + finding_id`; trả 404 nếu không thuộc route visit, giống logic delete tại `:179-195`.
- Trong `patientImagesService.create` và `upload` tại `apps/api/src/services/patient-images.service.ts:72-146`, khi có `visit_id`, truy vấn `visits` và bắt buộc `visit.patient_id === data.patient_id` cùng tenant trước khi ghi metadata/R2 object.
- Bổ sung test tuyến API/service cho cross-visit finding update và ảnh patient A gắn visit patient B.

### 3. Ràng buộc AI/image theo năng lực thật

- Chỉ cho AI image analysis nhận `image/jpeg`, `image/png`, `image/webp`; chặn DICOM/CBCT và mọi binary không raster trước khi đọc R2.
- Không cắt byte nhị phân tùy ý ở `apps/api/src/services/ai.service.ts`; từ chối file vượt giới hạn AI với lỗi hướng dẫn rõ ràng, hoặc tạo raster preview do pipeline chuyên dụng trong tương lai.
- Thêm nhãn cố định ở UI `PatientImageGallery`: “AI chỉ hỗ trợ quan sát sơ bộ, cần bác sĩ xác nhận; không thay thế chẩn đoán hình ảnh.”
- Với DICOM/CBCT: cho upload/lưu trữ nếu chính sách file cho phép, hiển thị metadata/tải xuống và thông báo phải mở bằng PACS/viewer chuyên dụng ngoài DentalAIOS; ẩn action annotation/AI analysis.
- Validate toàn bộ proposed finding từ AI bằng schema shared trước khi render và trước batch-save. Không chuyển tooth malformed sang `0`.
- Thay save từng finding/`Promise.all` bằng endpoint batch có validate trước toàn bộ payload và atomic D1 batch; trả failed item details khi validation không đạt.

## P1 — Workflow pre-exam và trách nhiệm bác sĩ

### 4. Mô hình visit type, pre-exam và review

**Migration mới** (số tiếp theo trong `src/db/migrations/`):

- Thêm vào `visits`:
  - `visit_type` CHECK: `initial_exam | follow_up | treatment | emergency`.
  - `clinical_state` CHECK: `pre_exam | awaiting_doctor_review | in_progress | signed | amended | cancelled`.
  - `effective_at`, `signed_by`, `signed_at`, `locked_at`, `legacy_at`, `legacy_source`.
- Không ghi đè `status` cũ ngay; mapping có kiểm soát để tương thích API hiện có, sau đó chuyển status cũ thành derived/compatibility field hoặc thay thế có migration rõ ràng.
- Tạo `clinical_review_events`: `id`, `tenant_id`, `visit_id`, `entity_type`, `entity_id`, `review_status` (`pending|accepted|rejected|superseded`), `entered_by`, `reviewed_by`, `reviewed_at`, `review_note`, `created_at`.
- Thêm marker author/review state tối thiểu vào finding và diagnosis (hoặc dùng bảng event và query projection): `entered_by`, `entry_source`, `clinical_effective_at`.

**API/service/RBAC:**

- Cấp assistant permission riêng cho pre-exam draft (không tái sử dụng quyền final clinical write): tạo dữ liệu draft về sinh hiệu, bệnh sử, ảnh, periodontal measurements, findings/diagnosis đề xuất.
- Không cho assistant confirm diagnosis, approve plan, sign visit, tạo amendment đã ký, hay bypass consent gate.
- Bác sĩ có queue “chờ duyệt”: accept, reject, edit-and-accept theo từng mục hoặc nhóm; mọi action giữ nguyên author gốc và lưu reviewer/timestamp.
- Chỉ accepted/doctor-created records mới được tính vào diagnosis chính thức, AI plan input, báo cáo clinical, và sign-off validation.
- `initial_exam` buộc pre-exam và initial-exam template hoàn chỉnh trước sign-off; các type khác dùng template tối thiểu theo mục đích.

**Frontend:**

- Sửa `apps/web/src/components/VisitForm.tsx` để chọn visit type và hiển thị rule tương ứng.
- Tách Visit workspace tại `apps/web/src/pages/VisitDetailPage.tsx` thành các lane: `Pre-exam draft`, `Chờ bác sĩ duyệt`, `Hồ sơ lâm sàng đã hiệu lực`.
- Hiển thị badge “Phụ tá nhập”, “Bác sĩ xác nhận”, “Bác sĩ bác bỏ” cùng user/timestamp; không để draft trông giống chẩn đoán hiệu lực.
- Có action batch review có xác nhận để không làm chậm bác sĩ trong buổi khám.

### 5. Initial examination template và medical history có cấu trúc

- Tạo `visit_initial_assessments`, tách khỏi `visits.notes`:
  - chief complaint, history_of_present_illness, dental_history;
  - medical conditions, medication list (tên/liều/tần suất), allergy (tác nhân/phản ứng/mức độ), pregnancy/lactation, tobacco/alcohol;
  - ASA class, examination summary, preliminary risk notes;
  - author/reviewer timestamps và version/source marker.
- Tạo các bảng detail thay vì JSON không kiểm soát cho medication, allergy và medical condition nếu cần báo cáo/lọc; nếu dùng JSON ban đầu, validate Zod nghiêm ngặt và lập kế hoạch normalize trước khi dùng reporting/billing.
- Chuẩn hóa `medical_alerts` hiện tại theo hướng bổ sung structured fields, giữ `description` làm ghi chú tự do và backfill legacy an toàn.
- Đặt checklists bắt buộc theo visit type ở validation/service, không chỉ frontend. Ví dụ initial exam: complaint + medical/allergy review + vitals acknowledgement + clinical findings/assessment hoặc lý do không thực hiện.
- Kết quả clinical warning BP/glucose/BMI phải yêu cầu bác sĩ acknowledge hoặc ghi lý do tiếp tục nếu vượt ngưỡng; không tự cấm điều trị cấp cứu.

## P1 — Sign-off, amendment, plan version và consent

### 6. Khóa visit và amendment bất biến

- Tạo `clinical_record_versions` hoặc các snapshot tables theo phạm vi visit, gồm JSON canonical của visit, accepted findings, diagnoses, assessments, image-evidence links; `version_no`, `reason`, `created_by`, `created_at`, `sha256`, `supersedes_version_id`.
- Khi bác sĩ sign visit:
  1. validate state, dữ liệu bắt buộc theo visit type, và không còn clinical drafts cần quyết định;
  2. tạo snapshot canonical; tính hash SHA-256;
  3. lưu `signed_by`, `signed_at`, `locked_at`; chuyển `clinical_state=signed`;
  4. archive PDF clinical record trong R2/file metadata;
  5. ghi audit event có version/hash (không đưa PHI vào audit details chung).
- Chặn trực tiếp update/delete visit, finding, diagnosis, accepted assessment/image evidence sau `locked_at` ở **service layer**; UI chỉ là lớp hướng dẫn.
- Tạo `POST /api/visits/:id/amendments`:
  - bắt buộc reason;
  - tạo phụ lục với trước/sau, record version link và author;
  - không mutate snapshot/bản gốc;
  - yêu cầu bác sĩ xác nhận amendment trước khi trở thành effective;
  - tái xuất archive/document version liên kết rõ với bản đã ký.
- Xác định rõ cancellation: visit chưa signed có thể cancel; signed visit không cancel hoặc delete, chỉ thêm correction/amendment theo policy.

### 7. Version hóa kế hoạch và tách clinical approval khỏi patient consent

**Schema:**

- Bổ sung cho `treatment_plans`: `approved_by`, `approved_at`, `current_version_no`, `clinical_approved_version_id`, `legacy_at`.
- Tạo `treatment_plan_versions`: snapshot immutable của plan header/items/price/duration/personnel, `version_no`, `state` (`draft|clinically_approved|superseded|cancelled`), `created_by`, `approved_by`, `approved_at`, `sha256`, `archive_file_id`.
- Mọi chỉnh sửa item/header sau clinical approval tạo working version mới, không revert/mutate version đã approved.
- `planService.approve` tại `apps/api/src/services/plan.service.ts:154-166` nhận actor user ID, xác minh doctor/signatory authorization, snapshot version và lưu durable approver.
- Cập nhật `apps/api/src/routes/treatment-plans.ts` và repo để route approve chuyển clinical version thay vì chỉ set status.

**Document archive:**

- Thay GET PDF stream-only tại `apps/api/src/routes/treatment-plans-extras.ts:21-84` bằng service tạo PDF version-specific, lưu R2/private `file_objects`, hash, MIME, template version, generated_by/time.
- `apps/api/src/services/pdf.service.ts:1-333` phải dùng font hỗ trợ Unicode tiếng Việt thay vì `strip()` dấu; PDF archived phải phản ánh chính xác nội dung bệnh án/consent.
- Giữ download endpoint nhưng bắt buộc tải archive của version; draft preview phải watermark rõ ràng “BẢN NHÁP — CHƯA ĐƯỢC ĐỒNG Ý”.

### 8. Consent tại quầy và đại diện hợp pháp

**Schema:**

- `legal_representatives`: patient link, name, relationship, identity document type/number (mã hóa/che khi hiển thị), verification metadata, active/verified timestamps.
- `consent_templates`: tenant/clinic managed versioned template, scope (`treatment_plan|procedure`), language, effective dates, content hash, active status.
- `consent_records`: patient, optional legal representative, plan version, optional milestone/item, template version, status (`pending|signed|withdrawn|superseded`), signature file ID, rendered document archive ID, signer name/relationship, witnessed_by, signed_at, device metadata/IP/user agent, content hash, withdrawal reason/by/at.
- `high_risk_procedure_rules`: map service_code/procedure/category to consent template, requirement level, active period. Seed initial group: phẫu thuật/nhổ, implant, điều trị tủy, gây tê/gây mê, chỉnh nha, phục hình không hồi phục. Manager-authorized configuration only.

**Workflow/API/UI:**

- Bác sĩ clinical-approve plan version → generate immutable plan/consent document → staff mở kiosk consent.
- Kiosk is scoped to one consent session; no general staff navigation, auto-timeout, and only the chosen patient/representative data visible.
- Before signing: display full template and exact approved plan version; require read/acknowledgement checkboxes; capture canvas stroke as image; record witness user and server timestamp. Re-render final document embedding consent metadata, archive PDF and signature image; calculate/store hashes.
- Patient adult signs self. If patient is minor/needs representation, require an active verified `legal_representative`; reject free-form accompanying person.
- Provide view/download of historical signed/withdrawn/superseded consent documents read-only.
- Withdrawal never deletes prior consent; block future case activation/new risky milestone execution, show reason/timestamp, and require a new consent if appropriate.
- `treatmentCasesService.activate` at `apps/api/src/services/treatment-cases.service.ts:28-77` must require an active signed plan consent whose `plan_version_id` equals the current clinically-approved version.
- Milestone start/complete endpoints must require an active specialized consent for a mapped high-risk procedure; otherwise return a domain error with the required consent type.

## P1 — Audit, reporting, security and history migration

### 9. Audit and evidence controls

- Preserve current PHI-minimizing audit boundary in `apps/api/src/middleware/audit.ts`; do not store diagnosis, notes, signature bitmap, consent content, or clinical JSON in generic `audit_logs.details`.
- Add structured non-PHI details: record/version IDs, action, reason category, hash, event outcome, template/version IDs. Store clinical payload/diff only in tenant-protected clinical version/amendment tables.
- Make audit writes mandatory (not best effort) for sign, amendment, plan approval/version, consent sign/withdraw and case activation; fail the business transaction if evidence cannot be persisted.
- Add audit filters by date range and entity/version IDs; create export endpoint with permissions, date-range validation, logged export event and server-generated CSV.
- Implement retention, backup/restore, access-review and incident-response policies as go-live deliverables. Confirm these policies with legal/compliance; do not invent statutory retention durations in code.

### 10. Legacy data migration and rollout

- Migration tags all existing completed visits and approved/completed plans as `legacy` with effective policy date; do not populate `signed_by`, `consent`, `approved_by`, signature or hashes retrospectively.
- Existing active cases must be reviewed before the next invasive milestone; surface a work queue for staff to obtain consent against an explicitly created/approved current version. Do not block a completed historical case.
- Existing records remain readable. Any post-rollout correction uses amendment/version flow rather than mutating historical content.
- Migrate in a staging clone first; reconcile counts by tenant, visit state, plan status, active case and image link before/after.
- Provide a reversible deployment strategy at feature-flag/API-routing level (not data deletion): disable new creation flows if needed while retaining all newly captured evidence read-only.

## P2 — Explicitly deferred, but design for later

- Full periodontal chart: dedicated `periodontal_chart_records`/site-level table (not more ad-hoc fields in `clinical_findings`); include probing depth, BOP, recession, CAL, mobility, furcation, plaque and longitudinal summary/indexing.
- Odontogram per surface: normalized tooth-surface state/treatment history, then render restorations/caries/endo/missing/implant by surface. Do not build visual layer before data model is normalized.
- Assistant operational checklist: chair setup/turnover, sterilization, materials, lab case and handoff queues.
- Diagnosis-to-plan-item traceability: join table between accepted diagnosis/finding and treatment plan version item; enables clinical-to-operational reporting and insurance evidence.
- AI provenance/quality dashboard: immutable request record with model/version, input-reference hash, output, reviewer action, accepted/edited/rejected reasons; metrics include acceptance, validation failure, manual divergence, voice parse success and measured workflow time.

## Affected implementation boundaries

| Boundary | Primary locations |
|---|---|
| Shared domain/types/validation | `src/shared/types/index.ts`, `src/shared/validation/index.ts`, `src/shared/constants/index.ts` |
| Migrations/seeds | `src/db/migrations/`, `src/db/seeds/` |
| Visits/findings/diagnoses | `apps/api/src/routes/visits.ts`, `apps/api/src/services/visit.service.ts`, findings/diagnoses repositories, `apps/web/src/pages/VisitDetailPage.tsx`, `apps/web/src/components/VisitForm.tsx` |
| Treatment plans/cases | `apps/api/src/routes/treatment-plans.ts`, `apps/api/src/services/plan.service.ts`, `apps/api/src/services/treatment-cases.service.ts`, treatment repositories, `apps/web/src/pages/TreatmentPlanDetailPage.tsx`, `apps/web/src/pages/TreatmentPlanAiPage.tsx` |
| Documents/consent | `apps/api/src/routes/treatment-plans-extras.ts`, `apps/api/src/services/pdf.service.ts`, files/R2 services, new consent/archive routes/services/components |
| Images/AI | `apps/api/src/services/patient-images.service.ts`, `apps/api/src/services/ai.service.ts`, image routes, `apps/web/src/components/PatientImageGallery.tsx`, voice findings flow |
| Audit/security | `apps/api/src/middleware/audit.ts`, audit route/service/repository, RBAC constants/middleware, JWT-authenticated kiosk session |
| Tests | `apps/api/tests/**/*.test.ts`; add frontend component/integration tests for consent/review/sign-off flows |

## Validation and release gates

### Automated tests

- Schema unit tests: invalid FDI/duration, visit types, state transitions, initial-exam required fields, consent signer/representative rules, high-risk consent matching, amendment required reason.
- API/service tests:
  - AI plan items include valid duration; batch failure leaves no partial plan/items/findings.
  - Cross-visit finding update and cross-patient image/visit link return 404/validation error.
  - Assistant draft cannot become clinical-effective without doctor review; assistant cannot sign/approve/consent-gate bypass.
  - Signed visit cannot PATCH/DELETE clinical content; amendment preserves original snapshot/hash and creates next effective version.
  - Plan approval snapshots the exact items; edits create a new version; case activation rejects missing/superseded/withdrawn consent.
  - High-risk milestone rejects absent special consent.
  - Consent requires active template/version, correct plan version, patient or verified representative, witness and signature artifact; withdrawal remains auditable.
  - DICOM rejects AI analysis while allowed storage behavior matches configured policy.
  - Required evidence/audit failure makes sign/consent/approval transaction fail safely.
- Browser/E2E tests: assistant pre-exam → doctor review → sign-off; plan approval → kiosk consent → case activation; signed record amendment; DICOM UI restrictions; legacy banner and active-case consent queue.

### Clinical/UAT scenarios

- New adult initial exam with medication allergy, elevated vitals, assistant pre-charting and doctor acknowledgement.
- Child patient signed by verified parent/legal representative.
- Multi-item plan containing implant/root canal: plan consent plus procedure-specific consent before milestone.
- Patient withdraws consent before case activation and after partial treatment; verify no history loss and appropriate blocking.
- Wrong patient/visit/image and wrong route/finding combinations.
- Network failure during signing/archive/audit: no consent may be considered signed unless all evidence is durably stored.
- Legacy completed visit and active old case during rollout.

### Go-live gates

- Legal/compliance signs off the consent template text, kiosk witness protocol, use of signature strokes, representative verification, records retention and patient-copy process. Until then, label the feature accurately as witnessed consent evidence, not statutory digital signature.
- Clinical governance validates initial-exam required fields, high-risk service mapping, review responsibility, sign-off rules and emergency exceptions.
- Security validates tenant isolation, kiosk timeout/device behavior, private R2 access, encryption/secret rotation, backup/restore drill and audit export access.
- Reconcile staging migration counts and run UAT before enabling feature flags per tenant/branch.
