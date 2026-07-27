-- Migration 0067 — Platform-wide treatment service templates.
--
-- Cung cấp danh mục dịch vụ điều trị mẫu ở cấp platform để phòng khám nhập
-- nhanh vào bảng `treatment_services` tenant. Mỗi mẫu có mã chuẩn hệ thống
-- (không phải ICD-10) và liên kết 0..n mã ICD-10 chẩn đoán để phục vụ gợi ý.
--
-- Additive only: không backfill, không sửa dữ liệu tenant hiện có.

PRAGMA foreign_keys = ON;

-- ──────────────── Platform treatment service templates ────────────────
CREATE TABLE IF NOT EXISTS platform_treatment_service_templates (
  code                     TEXT PRIMARY KEY,
  name                     TEXT NOT NULL,
  procedure                TEXT NOT NULL REFERENCES procedure_catalog(code),
  default_price            REAL NOT NULL CHECK (default_price >= 0),
  market_price_low         REAL CHECK (market_price_low IS NULL OR market_price_low >= 0),
  market_price_median      REAL CHECK (market_price_median IS NULL OR market_price_median >= 0),
  market_price_high        REAL CHECK (market_price_high IS NULL OR market_price_high >= 0),
  market_price_currency    TEXT NOT NULL DEFAULT 'VND',
  market_price_reference   TEXT,
  market_price_updated_at  TEXT,
  default_duration_min     INTEGER NOT NULL CHECK (default_duration_min BETWEEN 1 AND 480),
  description              TEXT,
  is_active                INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  sort_order               INTEGER NOT NULL DEFAULT 100,
  created_by               TEXT,
  updated_by               TEXT,
  created_at               TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at               TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_platform_treatment_service_templates_active
  ON platform_treatment_service_templates(procedure, is_active, sort_order, name);

-- ──────────────── Template ↔ ICD-10 diagnosis links ────────────────
CREATE TABLE IF NOT EXISTS platform_treatment_service_template_icd10 (
  template_code   TEXT NOT NULL REFERENCES platform_treatment_service_templates(code) ON DELETE CASCADE,
  icd10_code_id   TEXT NOT NULL REFERENCES icd10_codes(id),
  relation        TEXT NOT NULL DEFAULT 'primary'
                    CHECK (relation IN ('primary', 'secondary')),
  note            TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (template_code, icd10_code_id)
);

CREATE INDEX IF NOT EXISTS idx_platform_treatment_service_template_icd10_reverse
  ON platform_treatment_service_template_icd10(icd10_code_id, template_code);

-- ──────────────── Snapshot origin trên `treatment_services` ────────────────
ALTER TABLE treatment_services ADD COLUMN imported_from_template_code TEXT;
ALTER TABLE treatment_services ADD COLUMN imported_at TEXT;

CREATE INDEX IF NOT EXISTS idx_treatment_services_imported_from
  ON treatment_services(tenant_id, imported_from_template_code);
