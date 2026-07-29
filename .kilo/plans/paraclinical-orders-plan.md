# Kế Hoạch Thêm Tính Năng Chỉ Định Cận Lâm Sàng

## Mục Tiêu

Cho phép bác sĩ tạo chỉ định cận lâm sàng (X-quang, xét nghiệm máu, CBCT, sinh thiết…)
tại lượt khám, theo dõi trạng thái và lưu kết quả gắn với chẩn đoán.

## Phạm Vi P1

### Loại chỉ định (paraclinical_order_type)

| Giá trị | Nhóm | Mô tả |
|---|---|---|
| `panoramic_xray` | imaging | Phim全景 hàm (OPG) |
| `periapical_xray` | imaging | X-quang chóp |
| `bitewing_xray` | imaging | X-quang kẽ răng |
| `cbct` | imaging | Chụp cắt lớp vi tính hàm mặt |
| `cephalometric_xray` | imaging | X-quang sọ nghiêng (chỉnh nha) |
| `blood_test` | lab | Xét nghiệm máu tổng quát |
| `coagulation_test` | lab | Xét nghiệm đông máu |
| `blood_glucose` | lab | Đường huyết |
| `hba1c` | lab | HbA1c |
| `allergy_test` | lab | Test dị ứng |
| `biopsy` | procedure | Sinh thiết |
| `culture_sensitivity` | lab | Cấy và nhạy kháng sinh |
| `other` | other | Khác (tự nhập mô tả) |

### Trạng thái chỉ định

```
pending → in_progress → completed | cancelled
```

- `pending`: Đã tạo, chờ thực hiện
- `in_progress`: Đang thực hiện / chờ kết quả
- `completed`: Có kết quả
- `cancelled`: Hủy chỉ định

---

## 1. Schema (Migration `0071_paraclinical_orders.sql`)

```sql
CREATE TABLE IF NOT EXISTS paraclinical_orders (
  id               TEXT PRIMARY KEY,
  tenant_id        TEXT NOT NULL REFERENCES tenants(id),
  visit_id         TEXT NOT NULL REFERENCES visits(id),
  patient_id       TEXT NOT NULL REFERENCES patients(id),
  diagnosis_id     TEXT REFERENCES clinical_diagnoses(id),

  -- Loại chỉ định
  order_type       TEXT NOT NULL CHECK (order_type IN (
    'panoramic_xray', 'periapical_xray', 'bitewing_xray',
    'cbct', 'cephalometric_xray',
    'blood_test', 'coagulation_test', 'blood_glucose',
    'hba1c', 'allergy_test',
    'biopsy', 'culture_sensitivity', 'other'
  )),
  custom_type_name TEXT,          --仅 khi order_type = 'other'
  body_site        TEXT,          -- Ví dụ: "răng #36", "hàm trên", "toàn thân"

  -- Trạng thái
  status           TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'in_progress', 'completed', 'cancelled')),

  -- Clinical reason (bắt buộc)
  clinical_reason  TEXT NOT NULL,  -- Lý do chỉ định, liên kết chẩn đoán

  -- Kết quả (cập nhật khi completed)
  result_summary   TEXT,           -- Tóm tắt kết quả
  result_file_id   TEXT REFERENCES file_objects(id),  -- File kết quả PDF/Hình
  abnormal_flag    TEXT CHECK (abnormal_flag IN ('normal', 'abnormal', 'critical')),

  -- Audit
  ordered_by       TEXT NOT NULL REFERENCES users(id),
  ordered_at       TEXT NOT NULL DEFAULT (datetime('now')),
  completed_at     TEXT,
  cancelled_at     TEXT,
  cancel_reason    TEXT,
  notes            TEXT,

  created_at       TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at       TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_para_orders_tenant_visit
  ON paraclinical_orders(tenant_id, visit_id);
CREATE INDEX IF NOT EXISTS idx_para_orders_tenant_patient
  ON paraclinical_orders(tenant_id, patient_id, status);
CREATE INDEX IF NOT EXISTS idx_para_orders_diagnosis
  ON paraclinical_orders(diagnosis_id);
```

---

## 2. Shared Types (`src/shared/types/index.ts`)

```typescript
export type ParaclinicalOrderType =
  | "panoramic_xray" | "periapical_xray" | "bitewing_xray"
  | "cbct" | "cephalometric_xray"
  | "blood_test" | "coagulation_test" | "blood_glucose"
  | "hba1c" | "allergy_test"
  | "biopsy" | "culture_sensitivity" | "other";

export type ParaclinicalOrderStatus =
  | "pending" | "in_progress" | "completed" | "cancelled";

export type ParaclinicalAbnormalFlag = "normal" | "abnormal" | "critical";

export interface ParaclinicalOrder {
  id: string;
  tenant_id: string;
  visit_id: string;
  patient_id: string;
  diagnosis_id?: string;
  order_type: ParaclinicalOrderType;
  custom_type_name?: string;
  body_site?: string;
  status: ParaclinicalOrderStatus;
  clinical_reason: string;
  result_summary?: string;
  result_file_id?: string;
  abnormal_flag?: ParaclinicalAbnormalFlag;
  ordered_by: string;
  ordered_at: string;
  completed_at?: string;
  cancelled_at?: string;
  cancel_reason?: string;
  notes?: string;
  created_at: string;
  updated_at: string;
}
```

---

## 3. Constants (`src/shared/constants/paraclinical-orders.ts`)

```typescript
export const PARACLINICAL_ORDER_TYPES: Record<ParaclinicalOrderType, {
  label: string;
  group: "imaging" | "lab" | "procedure" | "other";
  default_body_site?: string;
}> = {
  panoramic_xray:    { label: "Phim toàn hàm (OPG)", group: "imaging" },
  periapical_xray:   { label: "X-quang chóp", group: "imaging" },
  bitewing_xray:     { label: "X-quang kẽ răng", group: "imaging" },
  cbct:              { label: "CBCT hàm mặt", group: "imaging" },
  cephalometric_xray:{ label: "X-quang sọ nghiêng", group: "imaging" },
  blood_test:        { label: "Xét nghiệm máu tổng quát", group: "lab" },
  coagulation_test:  { label: "Xét nghiệm đông máu", group: "lab" },
  blood_glucose:     { label: "Đường huyết", group: "lab" },
  hba1c:             { label: "HbA1c", group: "lab" },
  allergy_test:      { label: "Test dị ứng", group: "lab" },
  biopsy:            { label: "Sinh thiết", group: "procedure" },
  culture_sensitivity:{ label: "Cấy và nhạy kháng sinh", group: "lab" },
  other:             { label: "Khác", group: "other" },
};

export const ORDER_STATUS_LABELS: Record<ParaclinicalOrderStatus, string> = {
  pending: "Chờ thực hiện",
  in_progress: "Đang thực hiện",
  completed: "Hoàn thành",
  cancelled: "Đã hủy",
};
```

---

## 4. Validation (`src/shared/validation/index.ts`)

Schema Zod cho create/update:

```typescript
export const ParaclinicalOrderCreateSchema = z.object({
  diagnosis_id: z.string().uuid().optional(),
  order_type: z.enum([...]),
  custom_type_name: z.string().max(200).optional(),
  body_site: z.string().max(200).optional(),
  clinical_reason: z.string().min(1, "Nhập lý do chỉ định"),
  notes: z.string().max(2000).optional(),
});

export const ParaclinicalOrderUpdateSchema = z.object({
  status: z.enum(["in_progress", "completed", "cancelled"]).optional(),
  result_summary: z.string().max(5000).optional(),
  result_file_id: z.string().uuid().optional(),
  abnormal_flag: z.enum(["normal", "abnormal", "critical"]).optional(),
  cancel_reason: z.string().max(500).optional(),
  notes: z.string().max(2000).optional(),
  change_reason: z.string().min(1).optional(),  // Required when visit signed
});
```

---

## 5. API Routes

### Routes mới (`apps/api/src/routes/paraclinical-orders.ts`)

| Method | Path | Mô tả | Permission |
|---|---|---|---|
| `GET` | `/api/visits/:visitId/orders` | Danh sách chỉ định theo lượt khám | `read_patients` |
| `POST` | `/api/visits/:visitId/orders` | Tạo chỉ định mới | `write_findings` |
| `PATCH` | `/api/visits/:visitId/orders/:orderId` | Cập nhật trạng thái/kết quả | `write_findings` |
| `DELETE` | `/api/visits/:visitId/orders/:orderId` | Hủy chỉ định (chỉ `pending`) | `write_findings` |
| `GET` | `/api/patients/:patientId/orders` | Tất cả chỉ định của bệnh nhân | `read_patients` |

### Service (`apps/api/src/services/paraclinical-order.service.ts`)

- Kiểm tra visit thuộc tenant, không locked (trừ update kết quả)
- `create`: validate order_type, clinical_reason bắt buộc
- `update`: chuyển trạng thái hợp lệ, audit log
- `cancel`: chỉ khi status = `pending`, cần cancel_reason
- Khi visit signed → chỉ cho cập nhật `result_summary`, `result_file_id`, `abnormal_flag`

### Repository (`apps/api/src/repositories/paraclinical-orders.repo.ts`)

- CRUD theo pattern hiện tại
- `listByVisit(tenantId, visitId)`
- `listByPatient(tenantId, patientId)`
- `get(tenantId, orderId)`
- `create(data)`, `update(tenantId, orderId, data)`
- `addRevision(...)` — audit trail

---

## 6. Frontend

### Component mới: `ParaclinicalOrdersCard`

Vị trí: tab "Chẩn đoán" trong `VisitDetailPage.tsx`, bên dưới `ClinicalDiagnosesCard`.

```
┌─────────────────────────────────────────────────┐
│ Chỉ định cận lâm sàng (3)          [+ Thêm]    │
├─────────────────────────────────────────────────┤
│ ┌─ Đang chờ ─────────────────────────────────┐ │
│ │ 🦷 OPG toàn hàm            Chờ thực hiện   │ │
│ │    Lý do: Đánh giá sâu răng hàm dưới      │ │
│ │    Liên kết: K02.1 - Sâu răng              │ │
│ ├─ Đang thực hiện ───────────────────────────┤ │
│ │ 🩸 Xét nghiệm máu tổng quát  Đang chờ KQ  │ │
│ │    Lý do: Trước phẫu thuật nhổ #48         │ │
│ ├─ Hoàn thành ───────────────────────────────┤ │
│ │ 🦷 CBCT hàm trên           ✅ Bình thường │ │
│ │    Kết quả: Không phát hiện u nội nha      │ │
│ │    📎 Xem file kết quả                     │ │
│ └─────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────┘
```

### Dialog tạo chỉ định

- Chọn loại: grouped select (Imaging / Xét nghiệm / Thủ thuật / Khác)
- Nhập lý do chỉ định (bắt buộc)
- Liên kết chẩn đoán (dropdown từ diagnoses của visit, optional)
- Vị trí cơ thể / răng (tùy chọn, auto-fill theo order_type)
- Ghi chú thêm (tùy chọn)

### Dialog cập nhật kết quả

- Tóm tắt kết quả (textarea)
- Upload file kết quả (PDF/Hình) → file_objects
- Đánh dấu bất thường: Bình thường / Bất thường / Nghiêm trọng
- Ghi chú (tùy chọn)

### Tab "Chẩn đoán" mở rộng

Hiện tại tab "Chẩn đoán" chỉ có `ClinicalDiagnosesCard`. Sau khi thêm:

```
tab "Chẩn đoán"
├── ClinicalDiagnosesCard (giữ nguyên)
├── ParaclinicalOrdersCard (mới)
└── Trợ lý chẩn đoán (giữ nguyên)
```

### Patient detail page

Thêm section "Chỉ định cận lâm sàng" trong lịch sử bệnh nhân để xem tất cả chỉ định theo thời gian.

---

## 7. Luồng Vận Hành

```
Bác sĩ tạo findings → Chẩn đoán (suspected/confirmed)
  → Bác sĩ tạo chỉ định cận lâm sàng
      → Lý do: gắn với chẩn đoán cụ thể
      → Loại: OPG, xét nghiệm máu, CBCT...
  → Phụ tá/bệnh nhân thực hiện
  → Cập nhật kết quả: tóm tắt + file + bất thường
  → Bác sĩ review kết quả → điều chỉnh chẩn đoán nếu cần
```

### Quy tắc nghiệp vụ

1. Chỉ **bác sĩ** (có `write_findings`) được tạo chỉ định
2. `clinical_reason` bắt buộc — giải thích tại sao cần chỉ định
3. `diagnosis_id` tùy chọn — liên kết với chẩn đoán cụ thể
4. Hủy chỉ định chỉ được khi status = `pending`
5. Visit đã signed → chỉ cập nhật kết quả, không tạo mới
6. Kết quả `critical` → hiển thị badge đỏ nổi bật
7. File kết quả lưu qua `file_objects` (R2 private), không công khai

---

## 8. Audit & Compliance

- Mọi hành động tạo/sửa/hủy ghi qua `audit_logs` middleware
- `entity_type = 'paraclinical_order'`
- Không lưu nội dung kết quả xét nghiệm trong audit log (chỉ lưu IDs)
- PDF kết quả lưu R2 private, truy cập qua Worker endpoint có quyền

---

## 9. Files Cần Thay Đổi

| File | Thay đổi |
|---|---|
| `src/db/migrations/0071_paraclinical_orders.sql` | **Mới** — tạo bảng |
| `src/shared/types/index.ts` | Thêm types |
| `src/shared/constants/paraclinical-orders.ts` | **Mới** — constants |
| `src/shared/validation/index.ts` | Thêm Zod schemas |
| `apps/api/src/repositories/paraclinical-orders.repo.ts` | **Mới** |
| `apps/api/src/services/paraclinical-order.service.ts` | **Mới** |
| `apps/api/src/routes/paraclinical-orders.ts` | **Mới** |
| `apps/api/src/routes/visits.ts` | Mount route mới |
| `apps/web/src/components/ParaclinicalOrdersCard.tsx` | **Mới** — UI card |
| `apps/web/src/pages/VisitDetailPage.tsx` | Thêm card vào tab chẩn đoán |
| `apps/web/src/pages/PatientDetailPage.tsx` | Thêm section lịch sử chỉ định |

---

## 10. Kiểm Thử

### Migration
```powershell
npm run d1:migrations:local
```

### API tests
- Tạo chỉ định với visit valid → 201
- Tạo chỉ định thiếu `clinical_reason` → 400
- Tạo chỉ định với visit locked → 403
- Canceled chỉ định `pending` → 200
- Canceled chỉ định `completed` → 400
- Update kết quả khi visit signed → 200
- Tạo mới khi visit signed → 403

### UI checks
- Tạo chỉ định từ tab Chẩn đoán
- Cập nhật trạng thái pending → in_progress → completed
- Upload file kết quả
- Verify badge bất thường hiển thị đúng
- Verify visit locked chỉ cho update kết quả

### Typecheck & Build
```powershell
npm run typecheck
npm run build --workspace apps/web
```

---

## 11. P2 (Tương Lai)

- **Tích hợp PACS**: kết nối viewer DICOM chuyên dụng cho CBCT/X-quang
- **Auto-order từ AI**: AI gợi ý chỉ định dựa trên findings, bác sĩ xác nhận
- **Nhắc nhở tự động**: đánh dấu chỉ định quá hạn chưa có kết quả
- **Report**: thống kê số lượng chỉ định theo loại, thời gian chờ kết quả
- **Integration với lab external**: gửi/nhận kết quả xét nghiệm từ phòng lab bên ngoài
- **Consent cho imaging**: gắn consent đặc biệt cho CBCT theo quy định bức xạ
