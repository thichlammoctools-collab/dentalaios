-- Keep the existing address as a human-readable display value while storing
-- administrative levels independently for geographic reporting and future
-- integration with an official administrative-unit catalog.
ALTER TABLE patients ADD COLUMN address_line TEXT;
ALTER TABLE patients ADD COLUMN ward_name TEXT;
ALTER TABLE patients ADD COLUMN ward_code TEXT;
ALTER TABLE patients ADD COLUMN district_name TEXT;
ALTER TABLE patients ADD COLUMN district_code TEXT;
ALTER TABLE patients ADD COLUMN province_name TEXT;
ALTER TABLE patients ADD COLUMN province_code TEXT;
ALTER TABLE patients ADD COLUMN postal_code TEXT;
ALTER TABLE patients ADD COLUMN country_code TEXT NOT NULL DEFAULT 'VN';

CREATE INDEX IF NOT EXISTS idx_patients_geography_province
  ON patients(tenant_id, province_code, province_name);

CREATE INDEX IF NOT EXISTS idx_patients_geography_district
  ON patients(tenant_id, province_code, district_code, district_name);

CREATE INDEX IF NOT EXISTS idx_patients_geography_ward
  ON patients(tenant_id, province_code, district_code, ward_code, ward_name);
