# Clinical Copilot V1: Đau Răng / Nội Nha

## Mục tiêu

Xây vertical slice đầu tiên của Clinical Intelligence Workspace trên nền `VisitDetailPage`, tập trung vào mục tiêu **khám đủ, ít bỏ sót**.

Luồng V1:

```text
Bác sĩ chủ động bật pathway cho một răng
→ nhập assessment cấu trúc ngắn
→ hệ thống hiển thị checklist còn thiếu và pattern cần cân nhắc
→ hoàn tất hoặc bỏ qua từng mục kèm lý do
→ bác sĩ quyết định diagnosis/treatment riêng
→ đóng pathway
→ ký hồ sơ
```

V1 không tự tạo diagnosis, không tự tạo treatment plan và không đưa ra phần trăm xác suất.

## Quyết định đã chốt

- Pathway đầu tiên: đau răng / nội nha.
- KPI chính: tỷ lệ assessment đóng với toàn bộ checklist item ở trạng thái hoàn tất hoặc bỏ qua có lý do.
- Pathway chỉ kích hoạt khi bác sĩ chủ động bật, không tự bật theo từ khóa.
- Một lượt khám có thể có nhiều assessment; mỗi assessment gắn đúng một răng mục tiêu.
- Checklist là bộ cố định trong code, version `endodontic-pain-v1`; chưa xây màn hình quản trị checklist.
- Nội dung chuyên môn dựa trên AAE và được hội đồng lâm sàng duyệt thành pathway version nội bộ trước pilot.
- Assessment do bác sĩ nhập có hiệu lực ngay.
- Assessment do phụ tá nhập là draft, phải qua clinical review trước khi có hiệu lực, được tính KPI hoặc chặn ký.
- Checklist item được lưu thành bản ghi riêng để audit trạng thái, lý do bỏ qua, người thao tác và thời điểm.
- Assessment có revision riêng; sau khi visit bị khóa chỉ được sửa qua amendment hiện có.
- Khi pathway đã được bật, không cho ký visit nếu assessment còn active hoặc có item chưa xử lý.
- Nếu feature flag bị tắt sau rollout, không làm các visit đang có assessment trở nên không thể ký; lịch sử vẫn đọc được.
- Voice-to-draft, image AI, differential diagnosis tự động, treatment simulator, prognosis định lượng, knowledge assistant và recall thông minh nằm ngoài V1.

## Hiện trạng có thể tái sử dụng

- Đã có API route `clinical-pathways.ts`, service `clinical-pathway.service.ts` và content registry `clinical-pathway-content.ts`.
- Schema và D1 table migrations đã tồn tại (0065_clinical_pathway_assessments.sql).
- `VisitDetailPage` đã tải patient, alerts, findings, review queue, safety acknowledgements và treatment history.
- `clinical_findings` đã có location theo răng, `entry_source`, `clinical_effective_at` và review lifecycle.
- `clinical_diagnoses` đã dùng diagnosis catalog với ICD-10 primary mapping tự động và snapshot lịch sử.
- `clinical_review_events` đã hỗ trợ finding, diagnosis và initial assessment; cần mở rộng cho pathway assessment.
- `visitSignoffService` đang chặn pending review và tạo canonical signed record; cần thêm pathway assessment vào cả hai phần.
- Feature flag theo tenant đã có qua `platform_feature_flags` và `platform_tenant_feature_overrides`.
- `visit-safety.service` đã là mẫu cho service tenant-scoped có validation và acknowledgement.

## Những việc chưa thực hiện

Mặc dù DB schema, Service, Repo và Route đã được tạo, các hạng mục sau **vẫn còn thiếu và cần được implement**:

### 1. Visit workspace integration (Frontend)

- Cần xây dựng UI components cho Clinical Copilot trong `VisitDetailPage`.
- Tải data từ `/api/visits/:visitId/clinical-pathways/endodontic-pain`.
- Giao diện bật/tắt pathway, chọn răng mục tiêu.
- Hiển thị Checklist, pattern ưu tiên, và trạng thái review.
- Shortcut đến Diagnosis/Treatment plan hiện có (không tạo mutation).

### 2. Sign-off và amendment (Backend)

- Sửa `visitSignoffService.sign` để chặn ký khi pathway còn active, có item pending hoặc assessment draft pending review.
- Sửa canonical snapshot để đưa `clinical_pathway_assessments` và `clinical_pathway_assessment_items` vào signed record.
- Đưa dữ liệu trên vào `afterObj` khi amend.

### 3. Review event

- Sửa `clinical_review_events` (nếu cần ở các validation logic khác) để nhận `pathway_assessment` làm entity_type hợp lệ nếu trước đó chưa làm đủ các chỗ check typescript.

### 4. Tests

- Bổ sung unit/integration tests cho pathway routes và logic chặn sign-off.

## Phạm vi dữ liệu V1 (Đã hoàn tất Migration 0065)

Tạo migration additive cho các bảng sau. Không backfill dữ liệu cũ và không sửa snapshot diagnosis/treatment hiện có.

### `clinical_pathway_assessments`

- `id`, `tenant_id`, `visit_id`, `tooth_number`.
- `pathway_key` cố định `endodontic_pain`.
- `pathway_version` cố định từ content registry, ví dụ `endodontic-pain-v1`.
- `status`: `active`, `completed`, `closed_with_exceptions`.
- `assessment_json`: payload đã validate bằng schema pathway, không phải text tự do.
- `entry_source`: `doctor` hoặc `assistant`.
- `entered_by`, `clinical_effective_at`, `reviewed_by`, `reviewed_at`.
- `closed_by`, `closed_at`, `close_note`.
- `created_at`, `updated_at`, `current_revision`.
- Index tenant/visit/pathway/status và tenant/visit/tooth.
- Chặn nhiều assessment active cùng `tenant_id + visit_id + pathway_key + tooth_number` bằng unique strategy phù hợp SQLite; lịch sử cũ vẫn giữ qua status/revision.

### `clinical_pathway_assessment_items`

- `id`, `tenant_id`, `assessment_id`.
- `item_key`, `item_version`.
- `status`: `pending`, `completed`, `skipped`.
- `value_json` cho giá trị cấu trúc của test/item.
- `skip_reason` bắt buộc khi status là `skipped`.
- `completed_by`, `completed_at`, `updated_at`.
- Unique `assessment_id + item_key + item_version`.
- Không cho xóa item đã tồn tại; khi pathway version thay đổi, item mới phải có version mới.

### `clinical_pathway_assessment_revisions`

- `id`, `tenant_id`, `assessment_id`, `revision_no`.
- `before_json`, `after_json`, `change_reason`.
- `changed_by`, `changed_at`.
- Unique `assessment_id + revision_no`.
- Mỗi update assessment hoặc item làm thay đổi dữ liệu lâm sàng phải tạo revision trong cùng transaction.

### Review event

- Mở rộng constraint/entity handling của `clinical_review_events` để hỗ trợ `pathway_assessment`.
- Assessment của phụ tá tạo event `pending`.
- Bác sĩ dùng accept hoặc edit-and-accept; event cũ chuyển `accepted` hoặc `superseded` theo pattern hiện tại.
- Assessment draft của phụ tá không xuất hiện trong effective clinical facts và không tham gia sign-off blocking cho đến khi được accept.

## Assessment payload bắt buộc

Tạo schema dùng chung, pathway-specific, với giá trị enum rõ ràng; không suy luận từ notes.

- Răng mục tiêu: lấy từ `tooth_number`, validate là số FDI hợp lệ.
- Triệu chứng:
  - đau tự phát: `present | absent | unknown`;
  - đau khi nhai: `present | absent | unknown`;
  - đau kéo dài sau kích thích: `present | absent | unknown`, kèm thời lượng mô tả chuẩn nếu có.
- Test cốt lõi:
  - cold test: `positive | negative | inconclusive | not_done`;
  - percussion: cùng bộ giá trị;
  - palpation: cùng bộ giá trị;
  - bite test: cùng bộ giá trị.
- Bối cảnh tại răng:
  - sâu lớn: `present | absent | unknown`;
  - phục hồi sâu/cũ: `present | absent | unknown`;
  - dấu hiệu quanh chóp trên hình ảnh: `present | absent | unknown | not_assessed`.
- `notes` là ghi chú tùy chọn, có giới hạn độ dài; không được dùng để đánh dấu item đã hoàn tất.

## Checklist cố định V1

Định nghĩa content registry trong code, có `key`, `label`, `required`, `source_reference` và `pathway_version`.

- Xác định răng đau/nghi ngờ.
- Ghi pattern đau tự phát.
- Ghi đau khi nhai.
- Ghi đau kéo dài sau kích thích.
- Ghi cold test.
- Ghi percussion.
- Ghi palpation.
- Ghi bite test.
- Đánh giá sâu lớn hoặc phục hồi sâu/cũ.
- Đánh giá dấu hiệu quanh chóp trên hình ảnh.
- Ghi nhận thiếu dữ liệu hoặc lý do không thực hiện nếu bỏ qua.

Quy tắc đóng:

- `completed`: mọi item ở `completed`.
- `closed_with_exceptions`: mọi item ở `completed` hoặc `skipped`, và mọi `skipped` có `skip_reason`.
- Không cho đóng nếu còn `pending`.
- Mỗi mục guideline có thể bỏ qua có lý do; không ép bác sĩ tick kết quả giả.
- Item an toàn/pháp lý nếu được thêm về sau phải được đánh dấu `required` và có policy riêng; V1 không tự biến mọi item thành hard block.

## Pattern engine V1

Không gọi LLM và không tạo chẩn đoán tự động. Pattern engine là deterministic, versioned, có test và được hội đồng lâm sàng duyệt.

Output chỉ gồm:

- `pattern_key`, `title`, `priority`.
- `explanation` dựa trên các field đã nhập.
- `evidence_item_keys`.
- `missing_item_keys`.
- `source_reference` và `pathway_version`.
- `review_status`: `unreviewed`, `acknowledged`, `dismissed` nếu cần lưu hành vi review.

Output tối đa 1-2 pattern ưu tiên, ví dụ pattern đau phù hợp tình trạng tủy hoặc pattern cần đánh giá quanh chóp. Không dùng các output này để tự điền diagnosis, ICD-10, treatment plan hoặc prognosis.

Nếu dữ liệu mâu thuẫn hoặc chưa đủ, ưu tiên hiển thị `Dữ liệu chưa đủ / cần kiểm tra thêm`, không suy diễn.

## API và quyền

Đã tạo service tenant-scoped `clinical-pathway.service.ts`.

Các endpoint cần có:

- `GET /api/visits/:visitId/clinical-pathways/endodontic-pain`
  - trả assessment theo răng, checklist items, pattern hiện tại và pathway metadata;
  - trả 404/disabled khi tenant chưa bật feature flag để UI không hiện entry point.
- `POST /api/visits/:visitId/clinical-pathways/endodontic-pain/assessments`
  - bác sĩ tạo assessment hiệu lực ngay;
  - phụ tá tạo assessment draft và review event pending.
- `PATCH /api/visits/:visitId/clinical-pathways/endodontic-pain/assessments/:id`
  - kiểm tra visit tenant/locked state;
  - tạo revision;
  - chỉ bác sĩ được sửa assessment đã effective.
- `POST /api/visits/:visitId/clinical-pathways/endodontic-pain/assessments/:id/close`
  - validate toàn bộ checklist;
  - cập nhật status và close metadata trong transaction.
- `PATCH /api/visits/:visitId/clinical-pathways/endodontic-pain/assessments/:id/items/:itemKey`
  - cập nhật item, bắt buộc `skip_reason` cho skipped;
  - tạo revision.
- `GET /api/clinical-copilot/metrics/endodontic-pain`
  - chỉ trả aggregate tenant-scoped hoặc platform aggregate không PII;
  - gồm activated, completed, closed_with_exceptions, completion rate, skip rate theo item và adoption.

Quyền:

- Bác sĩ: tạo, sửa, đóng, review assessment; assessment có hiệu lực ngay.
- Phụ tá: tạo/sửa draft; không được làm assessment effective, đóng assessment effective hoặc dùng nó để ký hồ sơ.
- Backend kiểm tra role/permission, không tin `entry_source` từ client.
- Mọi endpoint đều kiểm tra `tenant_id`, `visit_id`, `patient` gián tiếp qua visit và `locked_at`.

## Visit workspace integration

Trong `VisitDetailPage`:

- Thêm nút rõ ràng `Đánh giá đau răng / nội nha` ở khu vực clinical workflow.
- Khi bật, cho thêm nhiều răng mục tiêu; mỗi răng hiển thị assessment card riêng.
- Card hiển thị progress checklist, mục pending, pattern ưu tiên và trạng thái review.
- Form assessment dùng control cấu trúc, cỡ đủ lớn cho desktop, có notes riêng.
- Cho phép shortcut đến Diagnosis và Treatment Plan với răng/context hiện tại; không tự tạo hoặc sửa dữ liệu ở hai module đó.
- Hiển thị rõ `AI/rule suggestion` nếu có pattern nhưng không gọi nó là chẩn đoán.
- Nếu feature flag tắt, ẩn entry point nhưng vẫn đọc lịch sử assessment trong visit đã có dữ liệu nếu người dùng có quyền đọc.

## Sign-off và amendment

Mở rộng `visitSignoffService.sign`:

- Nếu feature flag đang bật, tìm assessment pathway đã được bác sĩ bật cho visit.
- Chặn ký nếu assessment còn `active`, còn item `pending`, hoặc còn assessment draft pending review liên quan đến pathway.
- Cho ký khi assessment là `completed` hoặc `closed_with_exceptions` và mọi item đã terminal.
- Draft phụ tá pending phải được review trước khi ký.
- Nếu feature flag bị tắt để rollback, không tạo block mới cho visit; dữ liệu lịch sử vẫn được đưa vào canonical snapshot nếu assessment đã tồn tại.

Mở rộng canonical snapshot/amendment:

- Thêm `clinical_pathway_assessments` và checklist items effective vào `canonicalObj` khi sign.
- Thêm cùng dữ liệu vào `afterObj` khi amendment.
- Assessment sau khi visit khóa chỉ sửa qua amendment; revision assessment và record amendment phải cùng truy vết được.

## Feature flag và rollout

- Seed `platform_feature_flags` với key `clinical_copilot.endodontic_pain_v1`, mô tả rõ pathway và default `false`.
- Dùng `platform_tenant_feature_overrides` hiện có để bật pilot theo tenant; không tạo bảng flag mới.
- Platform operator/owner bật flag sau khi migration và content pathway đã được kiểm tra.
- Khi tắt flag:
  - ẩn entry point và thao tác tạo mới;
  - không xóa assessment/history;
  - không làm visit hiện tại không thể ký;
  - vẫn cho đọc dữ liệu trong signed/amended record.
- Không backfill assessment cho visit cũ.
- Trước pilot, hội đồng lâm sàng duyệt checklist, pattern rules, source reference và pathway version.

## KPI và observability

KPI chính:

```text
closed_assessments_with_all_items_terminal / activated_assessments
```

Metric phụ:

- số assessment được bật theo tenant, bác sĩ và thời gian;
- tỷ lệ bác sĩ sử dụng pathway;
- thời gian từ activate đến close;
- tỷ lệ `closed_with_exceptions`;
- tỷ lệ skipped theo item và skip reason;
- số assessment draft phụ tá chờ review;
- số visit bị chặn ký do pathway chưa đóng;
- tỷ lệ edit/revision sau khi tạo.

Không log PII vào metric hoặc platform aggregate. Log model/provider không cần trong V1 vì pattern engine deterministic; lưu pathway/rule version để audit.

## Migration và rollout sequence

1. [Xong] Thêm migration additive cho assessment, items, revisions và mở rộng review-event enum.
2. [Xong] Seed feature flag default off.
3. [Xong] Thêm shared validation/types, repository, service, routes và role checks.
4. [Chưa xong] Mở rộng sign-off/canonical snapshot/amendment.
5. [Chưa xong] Tích hợp VisitDetail UI với feature flag fallback.
6. [Chưa xong] Viết test cho API và UI integration.
7. [Chưa xong] Chạy migration local/remote theo quy trình hiện có.
8. [Chưa xong] Bật pilot cho tenant được chọn sau khi content clinical được duyệt.
9. [Chưa xong] Theo dõi completion rate, skip reasons, sign-off blocks và phản hồi bác sĩ; chỉ sau đó mới quyết định mở rộng.

## Kiểm thử bắt buộc

- Schema: enum, FDI tooth, test values, skip reason, payload size.
- Tenant isolation cho assessment, items, revisions, metrics.
- Một visit có nhiều răng; dữ liệu và checklist không trộn giữa các assessment.
- Bác sĩ tạo assessment effective ngay.
- Phụ tá tạo draft; draft tạo review event và không xuất hiện effective/sign-off.
- Accept và edit-and-accept draft phụ tá.
- Không cho close khi còn pending.
- Cho close completed và closed_with_exceptions đúng điều kiện.
- Không cho skipped thiếu lý do.
- Revision được tạo cho từng thay đổi và không mất revision cũ.
- Visit locked chặn update trực tiếp.
- Sign bị chặn khi pathway active chưa đóng hoặc review pending.
- Sign thành công khi tất cả assessment terminal.
- Tắt flag không chặn visit đang tồn tại và không xóa lịch sử.
- Canonical signed record/amendment chứa assessment và checklist effective.
- Deterministic pattern rules: positive, negative, unknown, conflicting và missing data.
- Web UI: feature flag off/on, nhiều assessment, progress, skip reason, pattern explanation và shortcut không tạo mutation.
- Chạy API full tests, web/API typecheck và diff check.

## Ngoài phạm vi V1

- Thu âm hoặc lưu audio; ambient scribe và speaker diarization.
- Dùng LLM để suy luận hoặc tự tạo diagnosis.
- AI đọc panorama/CBCT/IOS/intraoral và overlay bounding box.
- Differential diagnosis tự động.
- Treatment simulator, success probability và prognosis định lượng.
- Knowledge assistant mở Internet/PubMed tự do.
- Recall tự động theo guideline.
- Checklist admin-configurable hoặc tenant-configurable.
- Cross-tenant case similarity và training trên dữ liệu tenant.

## Rủi ro và biện pháp

- **Alert fatigue:** pathway chỉ bật chủ động; pattern tối đa 1-2; item có phân loại và lý do bỏ qua.
- **Tick đối phó:** cho phép skip có lý do, lưu revision và đo skip rate theo item.
- **Automation bias:** không hiển thị phần trăm; hiển thị evidence, missing data và pattern, không gọi là diagnosis.
- **Scope creep:** không đưa voice/image/LLM vào V1; không xây generic suggestion framework trước khi có pathway thực tế.
- **Content liability:** AAE + hội đồng lâm sàng duyệt và version hóa trước khi bật pilot.
- **Rollback làm kẹt hồ sơ:** flag off không tạo sign-off block mới; assessment/history vẫn bất biến và đọc được.
- **Dữ liệu draft bị xem là clinical fact:** phân biệt `entry_source`, review status và `clinical_effective_at` ở backend lẫn UI.
