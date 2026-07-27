# Dịch vụ điều trị mẫu toàn hệ thống, có liên kết ICD-10

## Mục tiêu

Cung cấp một danh mục **dịch vụ điều trị mẫu chuẩn hóa toàn hệ thống** để phòng khám nhập nhanh vào danh mục dịch vụ nội bộ (`treatment_services`), thay vì mỗi tenant tự nhập lại từ đầu.

Luồng người dùng:

```text
Platform admin quản lý danh mục mẫu (mã, tên, thủ thuật, giá thị trường, ICD-10 liên quan)
→ Tenant admin mở "Nhập từ danh mục mẫu" trong Treatment Services
→ Duyệt danh sách mẫu, tìm kiếm/lọc theo thủ thuật hoặc ICD-10
→ Chọn nhiều mẫu và sửa (giá, tên, định mức thời gian) trước khi import
→ Hệ thống tạo/cập nhật `treatment_services` với mã chuẩn hệ thống
→ Mỗi dịch vụ giữ liên kết tới các mã ICD-10 chẩn đoán tương ứng để phục vụ gợi ý sau này
```

## Quyết định đã chốt

- **Mã dịch vụ**: mã nội bộ chuẩn hóa toàn hệ thống, không phải ICD-10. Ví dụ `RES-COMP-1S`, `END-RCT-MOL`, `SUR-EXT-SIMPLE`. Mỗi mã là duy nhất trong bảng mẫu toàn hệ thống và giữ nguyên khi import xuống tenant.
- **Liên kết ICD-10**: mỗi mẫu có 0 hoặc nhiều mã ICD-10 chẩn đoán phù hợp (bảng phụ), lấy từ bảng `icd10_codes` đã có ở migration `0051_clinical_terminology_and_diagnoses`. Không tự phát sinh mã ICD-10 mới.
- **Phạm vi tenant vs. platform**: danh mục mẫu ở **cấp platform** (không tenant_id); bảng import xuống là bảng `treatment_services` cấp **tenant**. Sau khi import, mỗi tenant có thể sửa/xóa/deactivate độc lập, không ảnh hưởng bản mẫu.
- **Sửa trước khi import**: cho phép sửa `name`, `price` (mặc định lấy `market_price_median`), `estimated_duration_min` và `procedure` trong bước preview trước khi commit.
- **Xử lý trùng mã**: nếu tenant đã có dịch vụ cùng `code`, hiển thị conflict; cho phép chọn *bỏ qua*, *ghi đè name/duration nhưng giữ price*, hoặc *ghi đè toàn bộ*. Mặc định là *bỏ qua*.
- **Giá thị trường**: là dữ liệu tham khảo, không phải giá bắt buộc; gồm `market_price_low`, `market_price_median`, `market_price_high`, `market_price_currency` (mặc định `VND`), `market_price_reference` (nguồn/ghi chú), `market_price_updated_at`.
- **Quản trị mẫu**: platform admin dùng Platform Control để CRUD danh mục mẫu (thêm/sửa/deactivate). Không cho xóa cứng bản ghi đã được ≥1 tenant import; chỉ được `deactivate` để bảo toàn liên kết lịch sử.
- **Snapshot khi import**: bản ghi tenant lưu snapshot `imported_from_template_code` và `imported_at`; sau đó độc lập, không auto-sync giá khi mẫu thay đổi.
- **Không thay đổi** cấu trúc `procedure_catalog` hiện có. Mẫu chỉ tham chiếu tới `procedure_catalog.code` như `treatment_services.procedure` đang làm.
- **Không thay đổi** bảng `treatment_services` ngoài việc thêm 2 cột optional (`imported_from_template_code`, `imported_at`) để audit nguồn.

## Hiện trạng có thể tái sử dụng

- `procedure_catalog` (platform-wide): `code`, `name`, `sort_order`, `is_active`.
- `treatment_services` (tenant): `id`, `tenant_id`, `code`, `name`, `procedure`, `price`, `estimated_duration_min`, `is_active`.
- `icd10_codes` và `terminology_versions` từ migration `0051`; đã có mapping cho concept lâm sàng.
- `PlatformProceduresPage` là mẫu cho một trang platform CRUD danh mục.
- `TreatmentServicesPage` là trang tenant sẽ được mở rộng thêm nút `Nhập từ danh mục mẫu`.
- `platformFlagSchema`, MFA middleware, audit log platform đã có sẵn cho endpoint quản trị.
- `apps/api/src/routes/clinic.ts` đã expose `/treatment-services` PUT/DELETE/GET; sẽ thêm `POST /treatment-services/import`.

## Data model

### Bảng mới `platform_treatment_service_templates`

- `code` `TEXT PRIMARY KEY` — mã chuẩn hệ thống, tối đa 40 ký tự, regex `^[A-Z][A-Z0-9-]{2,39}$`.
- `name` `TEXT NOT NULL` — tên dịch vụ mẫu (tiếng Việt).
- `procedure` `TEXT NOT NULL REFERENCES procedure_catalog(code)` — thủ thuật nhóm.
- `default_price` `REAL NOT NULL CHECK (default_price >= 0)` — giá gợi ý mặc định (đã gồm VAT).
- `market_price_low` `REAL NULL CHECK (market_price_low >= 0)`.
- `market_price_median` `REAL NULL CHECK (market_price_median >= 0)`.
- `market_price_high` `REAL NULL CHECK (market_price_high >= 0)`.
- `market_price_currency` `TEXT NOT NULL DEFAULT 'VND'`.
- `market_price_reference` `TEXT NULL` — nguồn tham khảo (URL, tên khảo sát, ghi chú).
- `market_price_updated_at` `TEXT NULL` — ngày cập nhật giá tham khảo.
- `default_duration_min` `INTEGER NOT NULL CHECK (default_duration_min BETWEEN 1 AND 480)`.
- `description` `TEXT NULL` — mô tả kỹ thuật ngắn.
- `is_active` `INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0,1))`.
- `sort_order` `INTEGER NOT NULL DEFAULT 100`.
- `created_by`, `updated_by` `TEXT NULL` — platform user id.
- `created_at`, `updated_at` `TEXT NOT NULL DEFAULT (datetime('now'))`.
- Index: `(procedure, is_active, sort_order, name)`.

### Bảng mới `platform_treatment_service_template_icd10`

- `template_code` `TEXT NOT NULL REFERENCES platform_treatment_service_templates(code) ON DELETE CASCADE`.
- `icd10_code_id` `TEXT NOT NULL REFERENCES icd10_codes(id)`.
- `relation` `TEXT NOT NULL DEFAULT 'primary' CHECK (relation IN ('primary','secondary'))` — `primary` là chỉ định chính, `secondary` là chỉ định phụ.
- `note` `TEXT NULL`.
- `created_at` `TEXT NOT NULL DEFAULT (datetime('now'))`.
- PRIMARY KEY `(template_code, icd10_code_id)`.
- Index: `(icd10_code_id, template_code)` để tra ngược từ chẩn đoán.

### ALTER `treatment_services` — additive

- `imported_from_template_code` `TEXT NULL`.
- `imported_at` `TEXT NULL`.
- Index: `(tenant_id, imported_from_template_code)`.
- Không có FK ràng buộc cứng để không kẹt tenant nếu mẫu bị deactivate.

### Types và validation (`src/shared`)

- `PlatformTreatmentServiceTemplate`, `PlatformTreatmentServiceTemplateIcd10Link`, `PlatformTreatmentServiceTemplateWithLinks`.
- Zod schema `platformTreatmentServiceTemplateSchema` cho POST/PUT.
- Zod schema `treatmentServiceImportSchema` cho tenant import (list các item đã override).

## API endpoint

### Platform (mounted trong `apps/api/src/routes/platform.ts`, cần MFA gần đây)

- `GET /api/platform/treatment-service-templates` — quyền `platform_config.read`. List có filter `procedure`, `q`, `is_active`, `icd10_code_id`.
- `GET /api/platform/treatment-service-templates/:code` — trả template + danh sách ICD-10 liên kết.
- `PUT /api/platform/treatment-service-templates` — quyền `platform_config.write`. Upsert theo `code`; chấp nhận field `icd10_links` để replace mapping trong transaction.
- `POST /api/platform/treatment-service-templates/:code/deactivate` — set `is_active=0`, giữ dữ liệu.
- `POST /api/platform/treatment-service-templates/:code/activate` — bật lại.
- Mọi mutation ghi `platform_audit_log` với action `treatment_service_template.*`.

### Tenant (mounted trong `apps/api/src/routes/clinic.ts`)

- `GET /api/clinic/treatment-service-templates` — quyền `MANAGE_USERS` (tương đương admin tenant, giống trang hiện có). Trả:
  - Toàn bộ template `is_active=1`, kèm ICD-10 tags và `already_imported` boolean (dựa trên `treatment_services.code` của tenant hiện tại).
  - Cho phép query `?procedure=`, `?q=`, `?icd10_code_id=`.
- `POST /api/clinic/treatment-services/import` — quyền `MANAGE_USERS`. Body:
  ```json
  {
    "items": [
      {
        "template_code": "RES-COMP-1S",
        "code": "RES-COMP-1S",
        "name": "Trám composite xoang 1",
        "procedure": "filling",
        "price": 500000,
        "estimated_duration_min": 30,
        "on_conflict": "skip" | "overwrite_metadata" | "overwrite_all"
      }
    ]
  }
  ```
  Trả kết quả từng dòng: `imported`, `updated`, `skipped_conflict`, `error`.

## UI

### Platform Control — `PlatformTreatmentServiceTemplatesPage` (mới)

- Thêm route `/platform/treatment-service-templates` và menu item trong Sidebar platform.
- Bảng: `code`, `name`, `procedure`, `default_price`, `market_price_low..high`, số ICD-10 liên kết, `is_active`, thao tác.
- Nút `Thêm mẫu` mở dialog có các trường:
  - `code` (khóa; disabled khi edit).
  - `name`, `procedure` (Select từ `procedure_catalog`).
  - `default_price`, `default_duration_min`, `description`.
  - Khối `Giá thị trường tham khảo`: `low`, `median`, `high`, `currency` (mặc định VND), `reference`, `updated_at`.
  - Khối `Liên kết ICD-10`: multi-select có tìm kiếm theo `code` hoặc `display_vi` từ `/api/platform/icd10-codes?q=`; mỗi dòng có `relation` (primary/secondary) và `note` tùy chọn.
- Thao tác `Deactivate` thay cho xóa; hiển thị số tenant đã import (thống kê aggregate, không PII).
- Tuân theo `requireRecentPlatformMfa` — báo lỗi rõ như trang Feature Flags nếu MFA hết hạn.

### Tenant — mở rộng `TreatmentServicesPage`

- Bên cạnh nút `Thêm dịch vụ` thêm nút `Nhập từ danh mục mẫu`.
- Dialog `Nhập từ danh mục mẫu`:
  - Ô tìm kiếm, filter theo `procedure` và ICD-10.
  - Bảng mẫu: checkbox chọn, `code`, `name`, `procedure`, `market_price_low..high` (hiển thị dạng range), `default_price`, `default_duration_min`, tag ICD-10, badge `Đã có trong danh mục` nếu `already_imported`.
  - Bước 2 (preview) — chỉ hiện các dòng đã chọn, cho sửa `name`, `price` (mặc định `default_price`), `estimated_duration_min`, `procedure`; nút `Reset về mặc định của mẫu` cho từng dòng.
  - Nếu code trùng, hiện chip cảnh báo và dropdown `Bỏ qua / Ghi đè metadata / Ghi đè toàn bộ`.
  - Nút `Nhập N dịch vụ` gọi API import; hiện toast tổng hợp `X đã nhập, Y đã cập nhật, Z bỏ qua`.
- Trong bảng dịch vụ hiện có, thêm cột `Nguồn` hiển thị `Mẫu hệ thống` nếu `imported_from_template_code` khớp, còn lại là `Tự tạo`.

## Danh mục mẫu ban đầu (seed migration)

Bộ mẫu tối thiểu để pilot. Mỗi dòng gồm code, tên, procedure, default_price (VND), duration (phút), ICD-10 primary gợi ý. Giá là ước tính thị trường VN 2024-2026, cần review lâm sàng và cập nhật trước khi bật platform-wide.

| Code | Tên | Procedure | default_price | Duration | ICD-10 primary |
|------|-----|-----------|---------------|----------|----------------|
| `EXA-INITIAL` | Khám và tư vấn ban đầu | `examination` | 100000 | 20 | `Z01.2` |
| `EXA-PERIODIC` | Khám định kỳ | `examination` | 50000 | 15 | `Z01.2` |
| `RES-COMP-1S` | Trám composite xoang 1 | `filling` | 500000 | 30 | `K02.1` |
| `RES-COMP-2S` | Trám composite xoang 2 | `filling` | 700000 | 40 | `K02.1` |
| `RES-COMP-3S` | Trám composite xoang 3 | `filling` | 900000 | 50 | `K02.1` |
| `RES-GIC` | Trám GIC răng sữa/cổ răng | `filling` | 300000 | 25 | `K02.1` |
| `END-RCT-ANT` | Điều trị tủy răng cửa | `root_canal` | 2000000 | 60 | `K04.0` |
| `END-RCT-PRE` | Điều trị tủy răng hàm nhỏ | `root_canal` | 2500000 | 75 | `K04.0` |
| `END-RCT-MOL` | Điều trị tủy răng hàm lớn | `root_canal` | 3500000 | 90 | `K04.0` |
| `END-RETREAT` | Điều trị tủy lại | `root_canal` | 4500000 | 120 | `K04.5` |
| `SUR-EXT-SIMPLE` | Nhổ răng đơn giản | `extraction` | 500000 | 30 | `K08.1` |
| `SUR-EXT-SURGICAL` | Nhổ răng phẫu thuật | `extraction` | 1500000 | 60 | `K08.1` |
| `SUR-EXT-3M` | Nhổ răng khôn (răng số 8) | `extraction` | 2500000 | 90 | `K01.1` |
| `PRO-CROWN-PFM` | Bọc mão sứ kim loại | `crown` | 2500000 | 60 | `K02.5` |
| `PRO-CROWN-ZIRCONIA` | Bọc mão sứ Zirconia | `crown` | 5000000 | 60 | `K02.5` |
| `PRO-VENEER` | Dán sứ veneer | `veneer` | 6000000 | 60 | `K03.7` |
| `PRO-BRIDGE-3U` | Cầu răng sứ 3 đơn vị | `bridge` | 7500000 | 90 | `K08.1` |
| `IMP-STAGE1` | Cấy ghép implant (giai đoạn 1) | `implant` | 20000000 | 90 | `K08.1` |
| `IMP-CROWN` | Phục hình trên implant | `implant` | 8000000 | 60 | `K08.1` |
| `PER-SCALING` | Cạo vôi và đánh bóng | `scaling` | 300000 | 30 | `K05.1` |
| `PER-SRP` | Cạo vôi dưới lợi (SRP) một cung | `scaling` | 800000 | 45 | `K05.3` |
| `PRV-FLUORIDE` | Bôi fluor phòng ngừa | `fluoride` | 200000 | 20 | `Z29.3` |
| `PRV-SEALANT` | Trám bít hố rãnh | `fluoride` | 200000 | 20 | `Z29.8` |
| `OTH-EMERGENCY` | Xử lý cấp cứu nha khoa | `other` | 500000 | 30 | `K04.7` |

Seed ghi vào migration `0067_treatment_service_templates_seed.sql`. Không seed ICD-10 link nếu bảng `icd10_codes` chưa có mã tương ứng ở tenant/version hiện tại — chỉ seed các link tồn tại, phần còn lại để platform admin bổ sung qua UI.

## Migration và rollout sequence

1. Migration `0067_treatment_service_templates.sql`:
   - Tạo `platform_treatment_service_templates`.
   - Tạo `platform_treatment_service_template_icd10`.
   - `ALTER TABLE treatment_services ADD COLUMN imported_from_template_code TEXT` và `imported_at TEXT`.
   - Thêm index nói trên.
2. Migration `0068_treatment_service_templates_seed.sql`:
   - Seed 24 mẫu ban đầu (`INSERT OR IGNORE`).
   - Seed ICD-10 link cho các mã ICD-10 đã tồn tại trong `icd10_codes` (`INSERT OR IGNORE` với subquery join theo `code`).
3. Shared types + Zod schema cho template + import.
4. Repositories, services, routes:
   - `apps/api/src/repositories/platform-treatment-service-templates.repo.ts`.
   - `apps/api/src/services/treatment-service-template.service.ts` (import + conflict handling).
   - Route platform + tenant như mô tả.
   - Audit log cho mọi mutation cấp platform và cho action `treatment_services.imported` cấp tenant.
5. UI:
   - `PlatformTreatmentServiceTemplatesPage` + route trong `apps/web/src/routes` và Sidebar platform.
   - Mở rộng `TreatmentServicesPage` với nút và dialog import 2 bước.
6. Tests (xem mục sau).
7. `npm run typecheck` cả web/api, `npm run test --workspace apps/api` và `npm run build --workspace apps/web`.
8. Chạy migration local → remote theo quy trình hiện có.
9. Platform admin xác nhận bộ mẫu ban đầu, cập nhật ICD-10 còn thiếu, rồi thông báo tenant sử dụng.

## Kiểm thử bắt buộc

- Migration: bảng và cột được tạo; unique/CHECK constraint đúng; index tồn tại.
- Platform routes:
  - CRUD template; upsert giữ nguyên `code` và cập nhật ICD-10 links atomic.
  - Không cho tạo `code` sai regex.
  - Không cho tham chiếu `procedure` không tồn tại trong `procedure_catalog`.
  - Không cho tham chiếu `icd10_code_id` không tồn tại.
  - Deactivate → hidden trong list mặc định, vẫn xuất hiện với `is_active=false` khi query rõ ràng.
  - Yêu cầu MFA gần đây (403 khi hết hạn).
  - Audit log ghi đầy đủ actor/entity.
- Tenant routes:
  - `GET treatment-service-templates` chỉ trả active, kèm `already_imported`.
  - Import: nhập N mẫu tạo N record trong `treatment_services` với `imported_from_template_code`, `imported_at`.
  - Conflict `skip`: không đổi record hiện có; response trả `skipped_conflict`.
  - Conflict `overwrite_metadata`: cập nhật `name`, `procedure`, `estimated_duration_min`, KHÔNG đổi `price`.
  - Conflict `overwrite_all`: cập nhật toàn bộ, ghi lại `imported_at`.
  - Tenant isolation: import ở tenant A không ảnh hưởng tenant B.
  - Quyền: user không có `MANAGE_USERS` bị 403.
  - Payload rỗng → 400.
  - `price < 0`, `duration_min` ngoài `[1,480]` → 400.
- UI:
  - Dialog hiển thị đúng dữ liệu, filter và tìm kiếm.
  - Bước preview cho sửa và reset về mặc định.
  - Toast tổng hợp phản ánh đúng số liệu backend trả về.
  - Sau import, bảng dịch vụ hiển thị cột `Nguồn` = `Mẫu hệ thống`.
- Regression:
  - CRUD `treatment_services` hiện có vẫn hoạt động.
  - `treatment_plan_items.service_code` vẫn hợp lệ với code đã import.

## Rủi ro và biện pháp

- **Nhầm mã dịch vụ với ICD-10**: đặt tên field rõ (`code` cho dịch vụ, `icd10_code_id` cho chẩn đoán) và UI luôn hiển thị hai vùng tách biệt.
- **Giá thị trường không phản ánh thực tế**: coi là dữ liệu tham khảo, tenant vẫn phải xác nhận `price` ở bước preview; hiển thị ngày `market_price_updated_at`.
- **Tenant kỳ vọng tự đồng bộ giá khi mẫu thay đổi**: rõ ràng trong UI là snapshot một lần; nếu về sau muốn có nút `Cập nhật từ mẫu`, sẽ làm ở phase 2.
- **Trùng mã giữa mẫu và dịch vụ tenant tự tạo**: mặc định `skip` để không phá dữ liệu; conflict resolution phải là quyết định chủ động của tenant admin.
- **Xóa cứng bản mẫu làm mất liên kết audit**: chỉ cho `deactivate`, không cho `DELETE`.
- **Migration seed chạy trên tenant chưa có ICD-10 version**: seed dùng `INSERT OR IGNORE` và join qua subquery; nếu không có `icd10_codes.code` khớp thì bỏ qua link, không fail migration.
- **MFA hết hạn khi quản trị mẫu**: UI hiển thị lỗi cụ thể như đã làm ở Feature Flags.

## Ngoài phạm vi

- Auto-sync giá từ mẫu xuống tenant sau khi đã import.
- Nhiều phiên bản giá theo thời gian (price history) trong bảng mẫu.
- Đa ngôn ngữ tên dịch vụ (chỉ tiếng Việt trong V1).
- Export danh mục dịch vụ của tenant ngược lên platform để đề xuất mẫu mới.
- Gợi ý dịch vụ dựa trên chẩn đoán trong `VisitDetailPage` (sẽ dùng bảng ICD-10 link này ở feature khác sau này).
- Bảng giá theo chi nhánh; hiện `treatment_services` vẫn là cấp tenant.
- Cross-tenant benchmarking giá.

## Tóm tắt task cho agent thực thi

1. Viết 2 migration `0067_*` và `0068_*` như mục Migration.
2. Thêm types/validation trong `src/shared/types/index.ts` và `src/shared/validation/index.ts`.
3. Thêm repo `platform-treatment-service-templates.repo.ts` (list/get/upsert/activate/deactivate + replace icd10 links trong transaction).
4. Thêm service `treatment-service-template.service.ts` cho luồng import và conflict resolution.
5. Route platform trong `apps/api/src/routes/platform.ts` (5 endpoint như trên, có MFA + audit).
6. Route tenant trong `apps/api/src/routes/clinic.ts` (`GET .../treatment-service-templates`, `POST .../treatment-services/import`).
7. UI Platform: `PlatformTreatmentServiceTemplatesPage` + entry trong sidebar `apps/web/src/pages/platform/PlatformPages.tsx` (hoặc file riêng) + route.
8. UI Tenant: mở rộng `TreatmentServicesPage` (nút + dialog 2 bước + cột `Nguồn`).
9. Tests: repository, service (conflict cases), route platform (permission + MFA + audit), route tenant (permission + conflict), tenant isolation trong `tests/repositories/tenant-isolation.test.ts`.
10. Chạy `npm run typecheck` cả hai workspace, `npm run test --workspace apps/api`, `npm run build --workspace apps/web`, `git diff --check`.
