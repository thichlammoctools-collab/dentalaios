# Chuẩn Hóa Thuật Ngữ Lâm Sàng Và ICD-10

## Mục Tiêu

- Chuẩn hóa bệnh lý Răng Hàm Mặt bằng danh mục thuật ngữ toàn cục có phiên bản, do Platform Admin quản trị.
- Ánh xạ các khái niệm là **chẩn đoán** sang ICD-10 Việt Nam; giữ FDI, bề mặt răng, vị trí giải phẫu và số đo ở `clinical_findings`.
- Tạo hồ sơ chẩn đoán độc lập tại lượt khám, có thể truy về finding nguồn nhưng cũng hỗ trợ chẩn đoán từ phim/chẩn khám toàn hàm.
- Bảo toàn finding lịch sử, không dùng AI để tự xác lập chẩn đoán, không đưa dữ liệu chẩn đoán vào PDF báo giá hoặc Lark.

## Quyết Định Đã Chốt

- Phạm vi P1 là **ICD-10 Việt Nam + danh mục thuật ngữ nha khoa nội bộ**, chưa triển khai SNOMED CT.
- Nguồn mã là bản ICD-10 do Bộ Y tế/cơ quan Việt Nam áp dụng. Không seed hoặc suy diễn danh mục ICD bằng AI.
- Platform Admin quản trị thuật ngữ, mapping và phiên bản; tenant không có override.
- Chỉ khái niệm có `kind = diagnosis` mới bắt buộc có ít nhất một chẩn đoán mã hóa. Quan sát, nguy cơ, triệu chứng, dự phòng và số đo không ép ICD-10.
- Diagnosis độc lập, thuộc `visit`, có `source_finding_id` tùy chọn. Một finding có thể tạo nhiều diagnosis; diagnosis không cần finding.
- Form finding đề xuất diagnosis/mapping từ catalog; bác sĩ phải kiểm tra, xác nhận hoặc chỉnh sửa trước khi lưu. Bác sĩ vẫn thêm diagnosis độc lập từ UI lượt khám.
- Vòng đời diagnosis: `suspected`, `confirmed`, `ruled_out`, `resolved`. Chỉ `confirmed` dùng cho báo cáo ICD-10 và đầu vào gợi ý điều trị.
- Hàng diagnosis không hard-delete. Sửa diagnosis, nhất là sau khi visit hoàn tất, tạo revision, bắt buộc lý do và ghi actor/thời điểm; finding gốc không bị thay đổi.
- Mỗi diagnosis lưu snapshot bất biến về concept, code system/version, ICD-10 code/display, mapping version, nguồn tạo và người xác nhận. Thay đổi catalog về sau không ghi đè hồ sơ cũ.
- Backfill chỉ tạo diagnosis cho mapping xác định chắc chắn từ condition legacy đã biết; những condition tự do/không chắc giữ nguyên finding và được đánh dấu để rà soát, không gán ICD đoán mò.
- Nạp ICD bằng importer có provenance bắt buộc và chỉ nạp subset Răng Hàm Mặt đã được Platform Owner duyệt. Artifact phải có tên văn bản, cơ quan ban hành, phiên bản/ngày, URL hoặc định danh tệp, SHA-256 và người duyệt.

## Phân Tách Nghiệp Vụ

| Thành phần | Vai trò sau chuẩn hóa | Không dùng cho |
|---|---|---|
| `clinical_findings` | Quan sát có cấu trúc tại răng/vùng/toàn miệng: FDI, bề mặt, túi nha chu, vị trí, dữ liệu khám. | Mã ICD hoặc kết luận bệnh lý chính thức. |
| Clinical concept | Thuật ngữ nội bộ ổn định, có nhãn tiếng Việt và phân loại `diagnosis`/`observation`/`symptom`/`risk`/`preventive`. | Dữ liệu bệnh nhân. |
| Concept mapping | Quan hệ có phiên bản từ concept sang ICD-10 Việt Nam; có thể có nhiều mapping được duyệt. | Thay đổi hồi tố diagnosis cũ. |
| Diagnosis | Khẳng định lâm sàng theo lượt khám, trạng thái và snapshot mapping; có thể gắn finding. | Thay thế data chart chi tiết. |
| Diagnosis revision | Audit cấp nghiệp vụ cho mọi thay đổi diagnosis. | Sửa trực tiếp history. |

`clinical_findings.condition` tiếp tục là **legacy stable key** trong giai đoạn chuyển đổi. Không thay bằng mã ICD vì hiện nó là khóa UI, validation nha chu, prompt AI, lịch sử răng và mapping điều trị. Sau khi catalog vận hành ổn định, tạo finding mới phải lưu thêm `concept_id`; các consumer chuyển dần sang concept thay vì diễn giải raw `condition`.

## Thiết Kế Dữ Liệu

1. Thêm migration mới trong thư mục đang được Wrangler sử dụng: `src/db/migrations/0050_clinical_terminology_and_diagnoses.sql` (đặt số kế tiếp thực tế nếu migration mới đã xuất hiện trước khi làm).

2. Tạo bảng toàn cục `clinical_terminology_versions`:
   - `id`, `system` (`LOCAL`, `ICD10_VN`), `version_key`, `title`, `publisher`, `published_at`, `source_url`, `source_file_name`, `source_sha256`, `status` (`draft`, `approved`, `retired`), `approved_by`, `approved_at`, timestamps.
   - Unique `(system, version_key)`; chỉ một version `approved` được phép là default cho từng system qua kiểm tra service, không suy diễn ở client.
   - `ICD10_VN` không được phép có dữ liệu active nếu thiếu provenance và Platform Owner approval.

3. Tạo bảng toàn cục `clinical_concepts`:
   - `id` UUID, `code` stable ASCII (`dental.caries`, `dental.pulpitis`, ...), `kind`, `category`, `default_scope`, `default_anatomical_site`, `display_vi`, `description_vi`, `is_active`, `sort_order`, `created_at`, `updated_at`.
   - `kind` giới hạn `diagnosis | observation | symptom | risk | preventive`.
   - `category`, scope và anatomical-site dùng các giá trị hiện tại của finding để UI/validation biết context hợp lệ.
   - Unique `code`; deactivate thay vì delete. Khái niệm dùng trong diagnosis cũ vẫn đọc được.

4. Tạo bảng toàn cục `clinical_concept_versions` để version hóa nội dung và quy tắc mapping ở cấp concept:
   - `id`, `concept_id`, `terminology_version_id` tham chiếu version `LOCAL`, `display_vi`, `description_vi`, `effective_from`, `effective_to`, `status`, `created_at`.
   - Mỗi publish tạo version mới; concept row chỉ giữ identity/trạng thái hiện hành. Không sửa display/mapping của version đã phát hành.

5. Tạo bảng toàn cục `icd10_codes`:
   - `id`, `terminology_version_id` tham chiếu version `ICD10_VN`, `code`, `display_vi`, `parent_code`, `is_billable`, `is_active`, `sort_order`.
   - Unique `(terminology_version_id, code)` và index theo `(terminology_version_id, code)`, `(terminology_version_id, display_vi)`.
   - Importer P1 chỉ chấp nhận tập RHM đã được duyệt: nhóm K00-K14 và các mã ngoài chương này được clinical governance phê duyệt (ví dụ TMJ/chấn thương), không hard-code danh sách vào source.

6. Tạo bảng toàn cục `clinical_concept_icd10_mappings`:
   - `id`, `concept_version_id`, `icd10_code_id`, `mapping_role` (`primary`, `alternative`), `is_active`, `created_at`.
   - Unique mapping concept-version/mã; chỉ một primary active cho một concept-version. Một concept có thể có alternative mapping, nhưng UI P1 chỉ preselect primary và yêu cầu bác sĩ chọn khi có ambiguity.

7. Mở rộng `clinical_findings` bằng `concept_id TEXT REFERENCES clinical_concepts(id)` và index `(tenant_id, visit_id, concept_id)`.
   - Giữ nguyên `category`, `scope`, `condition`, location/measurement JSON và rows lịch sử.
   - API chỉ cho concept active tương thích với category/scope/site; server tự điền `condition` legacy key của concept để tương thích consumer trong giai đoạn chuyển tiếp.
   - Với `other`, không có concept bắt buộc: vẫn tạo finding free-text có `condition = other` và notes; không tự tạo diagnosis.

8. Tạo bảng clinical có tenant scope `clinical_diagnoses`:
   - `id`, `tenant_id`, `visit_id`, `patient_id` snapshot từ visit, `source_finding_id` nullable, `concept_id`, `concept_version_id`, `status`, `icd10_code_id`, `icd10_version_id`, `icd10_code_snapshot`, `icd10_display_vi_snapshot`, `concept_code_snapshot`, `concept_display_vi_snapshot`, `mapping_id`, `mapping_role`, `source` (`manual`, `finding_confirmed`, `voice_suggestion`, `image_suggestion`, `backfill`), `source_text` nullable, `confirmed_by`, `confirmed_at`, `resolved_at`, `ruled_out_at`, `notes`, `created_by`, `created_at`, `updated_at`, `current_revision`.
   - `source_finding_id` cùng tenant và cùng visit phải được service xác nhận; `patient_id` được lấy từ visit, không tin payload client.
   - Diagnosis `suspected` có thể chưa có `confirmed_by`; diagnosis `confirmed` bắt buộc concept diagnosis, ICD snapshot, mapping snapshot và confirmer. `ruled_out`/`resolved` bắt buộc lifecycle timestamp; mọi status giữ row.
   - Index: `(tenant_id, visit_id)`, `(tenant_id, patient_id, status)`, `(tenant_id, icd10_code_snapshot, status)`, `(tenant_id, source_finding_id)`.

9. Tạo bảng `clinical_diagnosis_revisions`:
   - `id`, `tenant_id`, `diagnosis_id`, `revision_no`, `change_reason`, `before_json`, `after_json`, `changed_by`, `changed_at`.
   - Unique `(diagnosis_id, revision_no)`; snapshot JSON không chứa PII ngoài fields diagnosis; service transactionally tăng `current_revision`, ghi diagnosis và revision.

10. Không dùng FK từ diagnosis xuống mapping/code để đọc history. ID references phục vụ integrity hiện tại, còn các `*_snapshot` là nguồn hiển thị/báo cáo lịch sử nếu catalog bị retire hay mapping thay đổi.

## Catalog Và Nhập ICD-10

1. Tạo repository riêng theo pattern hiện có:
   - `clinical-terminology-versions.repo.ts`, `clinical-concepts.repo.ts`, `icd10-codes.repo.ts`, `clinical-concept-mappings.repo.ts`, `diagnoses.repo.ts`.
   - D1 SQL chỉ nằm trong repositories; services điều phối cross-table validation/transactions.

2. Thêm shared types và Zod schemas:
   - `ClinicalConcept`, `ClinicalConceptKind`, `Icd10Code`, `ClinicalConceptMapping`, `ClinicalDiagnosis`, `ClinicalDiagnosisStatus`, `ClinicalDiagnosisRevision`, `TerminologyVersion`.
   - Schema platform cho version, concept, mapping, publish/deactivate và ICD importer manifest.
   - Schema tenant cho create/update diagnosis, bắt buộc `change_reason` cho cập nhật diagnosis đã có revision hoặc visit `completed`; strict validation cho source finding, concept kind, status lifecycle, mapping/version và code system.

3. Cấp permissions Platform mới `platform_clinical_terminology.read`/`.write` trong `src/shared/constants/index.ts`, migrations role seed/platform role update và platform RBAC.
   - Read cho Owner/Operator/Auditor theo chức năng hiện có; write chỉ Owner/Operator và yêu cầu `requireRecentPlatformMfa()`.
   - Chỉ Platform API quản trị catalog/mapping/import; tenant API chỉ list concept/code active để khám, không có endpoints mutation catalog.

4. Mở rộng `/api/platform`:
   - CRUD soft lifecycle cho terminology versions, concepts, concept versions và mappings.
   - `POST /clinical-terminology/icd10/import` nhận manifest metadata và file/import rows đã validate; chỉ cho version draft, reject code trùng/sai format/thiếu provenance.
   - Preview counts/errors trước import; publish/approve chỉ sau validate đầy đủ, audit mọi import/publish/deactivate/map change bằng `platformAudit` với metadata, không log nội dung hồ sơ bệnh nhân.
   - Tạo UI Platform cạnh procedure catalog: danh sách version/provenance, search ICD, concept editor, mapping matrix, trạng thái publish. Không cho sửa trực tiếp row approved; tạo version/mapping version mới.

5. Seed chỉ có local terminology bootstrap để map condition hiện hữu và tạo `LOCAL` version draft/approved theo migration. Không seed mã ICD-10 tự viết tay. Chuẩn bị importer CLI/admin-only chạy từ artifact Bộ Y tế đã duyệt; file nguồn không đưa vào bundle Worker hoặc client.

6. Catalog ban đầu phải phân loại tất cả values của `CLINICAL_FINDING_CATEGORIES`:
   - `diagnosis`: tối thiểu caries, unerupted/impacted, fracture khi đủ tiêu chí, periapical, pulpitis, missing khi do bệnh lý, gingivitis, periodontitis, periodontal abscess/fistula, soft-tissue disease phù hợp, malocclusion, TMD.
   - `observation`: good, plaque, calculus, wear/discoloration, mobility/furcation/recession khi chưa kết luận bệnh, clicking/crepitus/deviation, swelling.
   - `symptom`: pain/limitation nếu được thêm concept.
   - `risk`/`preventive`: caries risk, fluoride, sealant, hygiene instruction.
   - Clinical governance phải rà soát final mapping và điều kiện chẩn đoán trước khi publish; đặc biệt không map tự động plaque/calculus, risk hay procedure sang ICD bệnh lý.

## API Lâm Sàng Và Luồng Ghi Nhận

1. Thêm terminology read API cho tenant có `read_patients`/`write_findings`:
   - `GET /api/clinical-terminology/concepts?category=&scope=&q=` trả active concepts, nhãn, kind và default mapping ICD active.
   - `GET /api/clinical-terminology/icd10?q=&concept_id=` trả subset active, chỉ để clinician search/chọn trong diagnosis dialog.
   - Không trả version draft/retired cho tenant.

2. Bổ sung diagnosis routes dưới visit:
   - `GET /api/visits/:id/diagnoses` trả diagnoses hiện hành cùng snapshot và source finding summary.
   - `POST /api/visits/:id/diagnoses` tạo diagnosis độc lập hoặc confirm suggestion; permission `write_findings`, audit `clinical_diagnosis`.
   - `PATCH /api/visits/:visitId/diagnoses/:diagnosisId` thực hiện transition/status hoặc thay concept/mapping, đòi `change_reason`, tạo revision atomically, audit action update.
   - `GET /api/visits/:visitId/diagnoses/:diagnosisId/revisions` chỉ cho người có quyền đọc hồ sơ.
   - Không tạo DELETE endpoint. Nếu nhập nhầm, dùng `ruled_out` và lý do.

3. Mở rộng finding API mà không thay contract cũ:
   - `POST/PATCH /findings` nhận `concept_id` tùy chọn trong P1; service resolve concept, validate compatibility và copy stable legacy condition. Không nhận ICD code trên payload finding.
   - POST optional `diagnoses` chỉ nhận proposal đã được bác sĩ xác nhận trong UI; service tạo finding và diagnoses trong một D1 batch/transaction. Nếu concept `kind=diagnosis`, reject tạo finding khi payload không chứa tối thiểu một diagnosis confirmed/suspected theo lựa chọn đã chốt, trừ những finding legacy/import có flag server-side.
   - PATCH finding không tự thay diagnosis. Khi concept/finding thay đổi, UI yêu cầu xử lý diagnoses liên kết tường minh để tránh âm thầm đổi kết luận.

4. Tạo `diagnosis.service.ts` để:
   - Xác thực tenant, visit/patient ownership, source finding ownership, concept status/kind, mapping/code/version approved.
   - Derive và persist snapshot server-side, không chấp nhận snapshot từ client.
   - Quản lifecycle, revision và actor; không log source text/notes trong application logs.
   - Chỉ xuất `confirmed` cho reporting và AI treatment context.

5. Patient history API/UI mở rộng để hiển thị diagnosis theo visit và theo răng khi `source_finding_id` là finding FDI. Không ép diagnosis không gắn răng vào tooth history.

## UI Bác Sĩ

1. Refactor catalog source hiện có tại `src/shared/constants/clinical-findings.ts` thành metadata trình bày/fallback trong thời gian migration; lựa chọn condition mới đọc từ terminology API/cache. Loại bỏ dần các label maps rải rác trong `PatientClinicalJourney.tsx`, `PatientToothHistory.tsx`, `ai.service.ts` để dùng display snapshot/concept label chung.

2. Trong `FdiToothChart.tsx`, form finding:
   - Chọn concept theo category/scope thay vì raw condition; giữ label/FDI/surface/nha chu popup hiện có.
   - Với concept `diagnosis`, hiển thị inline proposal: concept, ICD-10 preselected, trạng thái mặc định `confirmed` hoặc clinician chọn `suspected`, notes và nút đổi mã qua search. Nút lưu chỉ active khi clinician xác nhận proposal.
   - Với observation/risk/preventive, lưu finding không mở diagnosis flow.
   - `other` hiển thị text note, không gán ICD.

3. Thêm card `Chẩn đoán` trên `VisitDetailPage.tsx`:
   - Danh sách status chips, tên snapshot, mã/nội dung ICD-10, FDI/source finding nếu có, người/thời điểm xác nhận, notes.
   - `Thêm chẩn đoán` mở dialog cho diagnosis độc lập: search concept hoặc ICD; require explicit concept/mapping selection; source finding tùy chọn.
   - Edit/status dialog bắt buộc lý do và hiển thị revision history. Visit completed vẫn cho cập nhật theo permission đã chốt.

4. `FindingsList.tsx`, voice dialog và image analysis:
   - Hiển thị concept/display snapshot thay raw condition khi có; legacy rows vẫn dùng existing label fallback.
   - Voice/image chỉ trả **suggestions** (`concept_id` nếu resolver confidence cao, original text, candidate mappings); UI luôn yêu cầu bác sĩ xác nhận trước khi POST diagnosis.
   - Không dùng response AI raw để gọi create finding/diagnosis trực tiếp. Unknown/unmapped output phải hiển thị để chỉnh tay hoặc bỏ qua.

5. Patient detail/journey thêm summary chẩn đoán confirmed theo timeline và search/filter ICD-10, luôn dựa trên diagnosis snapshot. Không render ruled-out là bệnh hiện tại; resolved hiển thị lịch sử rõ trạng thái.

## AI Và Điều Trị

1. Cập nhật `voice-findings.service.ts`, `ai.service.ts`, `ai-appointment.service.ts`:
   - Prompt/schema tách `finding` khỏi `diagnosis_candidate`; yêu cầu model không đưa ICD-10 nếu không được resolver/catalog cung cấp.
   - Resolver server-side match concept only from active catalog, ghi confidence/source text; no match thì candidate unmapped.
   - AI có thể đề xuất, nhưng không có quyền persist `confirmed` diagnosis; user action mới xác nhận.

2. Thay `PROCEDURE_MAP[f.condition]` trong `ai.service.ts` bằng layer recommendation được governance:
   - `clinical_concept_procedure_recommendations` toàn cục, versioned, liên kết concept version với procedure catalog code và mức độ recommendation.
   - Treatment AI chỉ nhận confirmed diagnoses và structured observations cần thiết; resolve recommendations qua active tenant service, vẫn để bác sĩ duyệt plan, không tự tạo/chốt điều trị.
   - Không suy giá/dịch vụ từ ICD code trực tiếp và không đổi giá snapshot behavior hiện có.

3. Giữ PDF proposal và Lark handover hiện tại không có diagnosis/ICD. Test hồi quy để bảo đảm diagnosis không lọt vào các payload này.

## Backfill Và Rollout

1. Trước migration production, sao lưu D1 theo quy trình vận hành; chạy migration local trước và kiểm tra migration configured directory là `src/db/migrations`, không dùng bản migration copy cũ ở `apps/api/migrations`.

2. Giai đoạn schema:
   - Apply additive tables/columns/indexes trước.
   - Deploy API có thể đọc legacy finding khi `concept_id` null và UI fallback catalog source cũ.
   - Chưa bắt buộc diagnosis đến khi catalog `LOCAL` và ICD version đã approved/import xong.

3. Tạo job/admin endpoint backfill idempotent, theo batch và dry-run:
   - Match `(category, scope, condition)` chính xác với bảng mapping legacy-to-concept đã được Platform duyệt.
   - Với concept diagnosis có primary ICD mapping approved, tạo `clinical_diagnoses` source `backfill`, status `confirmed`, snapshot đầy đủ; `confirmed_by` dùng actor hệ thống rõ ràng và provenance `backfill`, không gán nhầm cho bác sĩ khám.
   - Chỉ update `clinical_findings.concept_id` khi match exact; không overwrite concept đã có.
   - Log aggregate counts/mã lỗi trong platform audit/job audit, không log patient fields. Rows unmapped xuất ra danh sách ID/count để clinical admin review, không AI auto-code.

4. Kiểm kê và giải quyết dữ liệu trước enforcement:
   - Báo cáo raw `condition` distinct theo category/scope, including values do image/voice AI sinh.
   - Bổ sung concept/mapping hoặc đánh dấu legacy-exempt sau review; không đưa raw value mới vào static list để né validation.
   - Sau khi tỷ lệ mapping đủ và doctors được hướng dẫn, feature-flag enforcement cho finding mới có concept diagnosis. Cờ tắt phải giữ create legacy compatibility trong rollback.

5. Không migrate/chỉnh sửa lịch sử condition, FDI, surface hoặc measurement JSON. Không thay `condition` raw trong data historical; diagnosis snapshot mới là lớp chuẩn hóa bổ sung.

## Báo Cáo Nội Bộ

1. Thêm diagnosis reporting API riêng, chỉ query `confirmed`:
   - Filter tenant, khoảng ngày visit, branch, clinician, ICD-10 prefix/exact code, concept, trạng thái; pagination và CSV export nếu hạ tầng report hiện có hỗ trợ.
   - Aggregate theo ICD snapshot (`icd10_code_snapshot`, `icd10_display_vi_snapshot`, `icd10_version_id`) để historical report reproducible.
   - Permission mới `view_clinical_reports` hoặc tái sử dụng `view_management_dashboard` chỉ sau khi rà soát role policy; khuyến nghị permission riêng, read-only.

2. Thêm page/section báo cáo nội bộ có filter và drilldown tối thiểu về visit/patient theo RBAC. Không public link, không gửi qua Lark và không nhúng vào treatment-plan PDF.

## Kiểm Thử Và Tiêu Chí Hoàn Thành

1. Migration/repository tests:
   - D1 local apply thành công từ schema mới và existing clinical finding rows vẫn đọc được.
   - Tenant isolation cho diagnoses/revisions; source finding khác tenant/visit bị từ chối.
   - ICD import reject thiếu provenance, hash/version trùng, mã trùng/sai format; approved catalog chỉ read được cho tenant.
   - Mapping version/history không biến đổi snapshot diagnosis cũ khi concept/code/mapping bị retire hoặc publish version mới.

2. API validation/service tests:
   - Finding concept phải tương thích category/scope/site; legacy condition payload vẫn hoạt động trong migration flag.
   - Concept `diagnosis` require diagnosis proposal đã xác nhận; observation/risk/preventive không require ICD.
   - Create diagnosis độc lập, linked finding, multiple diagnoses/finding; create confirmed thiếu approved mapping/ICD snapshot bị reject.
   - Status transitions, mandatory reason, completed-visit revision, no hard delete, revision ordering và audit middleware.
   - Report chỉ trả confirmed và filter đúng ICD prefix/version.

3. AI regression tests:
   - Voice/image unknown text không persist raw diagnosis; candidate cần clinician confirmation.
   - Treatment suggestion chỉ nhận confirmed diagnoses, resolve recommendation qua tenant active services, và không tự tạo plan item.
   - PDF/Lark assertions chứng minh payload không chứa diagnosis/ICD fields.

4. UI/manual checks desktop và mobile:
   - Răng #36 sâu răng: chọn concept, xác nhận ICD, lưu finding và diagnosis; patient/tooth history hiển thị nhất quán.
   - Vôi răng: lưu observation với surfaces nhưng không ép ICD.
   - Viêm nha chu: số đo sáu điểm vẫn validate; confirmation tạo diagnosis thích hợp khi bác sĩ xác nhận.
   - Diagnosis từ X-quang không có finding; đổi sang ruled-out/resolved với lý do; revision giữ snapshot cũ.
   - Legacy unmapped finding vẫn xem được, không giả nhãn/mã ICD.

5. Chạy tối thiểu:
   ```powershell
   npm run d1:migrations:local
   npm run test --workspace apps/api
   npm run typecheck
   npm run build
   git diff --check
   ```

## Rủi Ro Và Ngoài Phạm Vi

- ICD-10 không thay thế toàn bộ biểu diễn nha khoa. Không map mechanical observations, bề mặt, pocket depth, risk hoặc procedure thành diagnosis chỉ để tăng tỷ lệ mã hóa.
- Bản ICD-10 Việt Nam chính thức và subset RHM cần Platform Owner/clinical governance cung cấp và phê duyệt trước import production. Đây là dependency chặn go-live coding, không phải dữ liệu do AI tạo.
- SNOMED CT, claim/bảo hiểm, ICD-11, mapping bệnh lý tự động từ AI, tự động hóa điều trị/thanh toán, diagnosis trên PDF và Lark đều ngoài P1.
- Dữ liệu `condition` hiện tại có khả năng mixed free-text. Mọi backfill không exact-match phải được giữ nguyên và review, không mất thông tin.
