-- Migration 0043 — Make the citizen ID the mandatory, tenant-scoped patient reference.
--
-- Before applying remotely, every existing patient must have a verified, valid,
-- unique 12-digit CCCD within its tenant. This migration intentionally fails if
-- operational data cleanup has not been completed.

PRAGMA foreign_keys = OFF;

CREATE TABLE patients_new (
  id                TEXT PRIMARY KEY,
  tenant_id         TEXT NOT NULL REFERENCES tenants(id),
  branch_id         TEXT NOT NULL REFERENCES branches(id),
  name              TEXT NOT NULL,
  date_of_birth     TEXT NOT NULL,
  gender            TEXT NOT NULL CHECK (gender IN ('M', 'F', 'O')),
  phone             TEXT NOT NULL,
  email             TEXT,
  notes             TEXT,
  created_at        TEXT NOT NULL DEFAULT (datetime('now')),
  family_name       TEXT,
  family_phone      TEXT,
  family_relation   TEXT,
  marketing_source  TEXT,
  referral_type     TEXT CHECK (referral_type IN ('doctor', 'staff', 'other', 'ad', 'none')),
  referral_user_id  TEXT REFERENCES users(id),
  referral_notes    TEXT,
  height_cm         REAL,
  weight_kg         REAL,
  address           TEXT,
  avatar_file_id    TEXT REFERENCES file_objects(id),
  cccd              TEXT NOT NULL CHECK (length(cccd) = 12 AND cccd NOT GLOB '*[^0-9]*'),
  address_line      TEXT,
  ward_name         TEXT,
  ward_code         TEXT,
  district_name     TEXT,
  district_code     TEXT,
  province_name     TEXT,
  country_code      TEXT NOT NULL DEFAULT 'VN',
  country_name      TEXT NOT NULL DEFAULT 'Việt Nam',
  archived_at       TEXT,
  archived_by       TEXT REFERENCES users(id),
  archive_reason    TEXT,
  UNIQUE (tenant_id, cccd)
);

INSERT INTO patients_new (
  id, tenant_id, branch_id, name, date_of_birth, gender, phone, email, notes, created_at,
  family_name, family_phone, family_relation, marketing_source, referral_type, referral_user_id,
  referral_notes, height_cm, weight_kg, address, avatar_file_id, cccd,
  address_line, ward_name, ward_code, district_name, district_code, province_name,
  country_code, country_name, archived_at, archived_by, archive_reason
)
SELECT
  id, tenant_id, branch_id, name, date_of_birth, gender, phone, email, notes, created_at,
  family_name, family_phone, family_relation, marketing_source, referral_type, referral_user_id,
  referral_notes, height_cm, weight_kg, address, avatar_file_id, cccd,
  address_line, ward_name, ward_code, district_name, district_code, province_name,
  country_code, country_name, archived_at, archived_by, archive_reason
FROM patients;

DROP TABLE patients;
ALTER TABLE patients_new RENAME TO patients;

CREATE INDEX idx_patients_tenant ON patients(tenant_id);
CREATE INDEX idx_patients_tenant_branch ON patients(tenant_id, branch_id);
CREATE INDEX idx_patients_phone ON patients(tenant_id, phone);
CREATE INDEX idx_patients_name ON patients(tenant_id, name);
CREATE INDEX idx_patients_tenant_branch_created ON patients(tenant_id, branch_id, created_at);
CREATE INDEX idx_patients_geography_province ON patients(tenant_id, province_name);
CREATE INDEX idx_patients_geography_district ON patients(tenant_id, province_name, district_code, district_name);
CREATE INDEX idx_patients_geography_ward ON patients(tenant_id, province_name, district_code, ward_code, ward_name);
CREATE INDEX idx_patients_tenant_archived ON patients(tenant_id, archived_at);

PRAGMA foreign_keys = ON;
