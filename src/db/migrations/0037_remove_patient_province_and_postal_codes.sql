-- Migration 0036 may already have run in local environments. Remove fields
-- that are not part of the patient-address model, then rebuild geographic
-- reporting indexes from the administrative names and the retained ward/district codes.
DROP INDEX IF EXISTS idx_patients_geography_province;
DROP INDEX IF EXISTS idx_patients_geography_district;
DROP INDEX IF EXISTS idx_patients_geography_ward;

ALTER TABLE patients DROP COLUMN province_code;
ALTER TABLE patients DROP COLUMN postal_code;
ALTER TABLE patients ADD COLUMN country_name TEXT NOT NULL DEFAULT 'Việt Nam';

CREATE INDEX IF NOT EXISTS idx_patients_geography_province
  ON patients(tenant_id, province_name);

CREATE INDEX IF NOT EXISTS idx_patients_geography_district
  ON patients(tenant_id, province_name, district_code, district_name);

CREATE INDEX IF NOT EXISTS idx_patients_geography_ward
  ON patients(tenant_id, province_name, district_code, ward_code, ward_name);
