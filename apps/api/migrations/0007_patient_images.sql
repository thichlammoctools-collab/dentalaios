PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS patient_images (
  id            TEXT PRIMARY KEY,
  tenant_id     TEXT NOT NULL REFERENCES tenants(id),
  patient_id    TEXT NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  visit_id      TEXT REFERENCES visits(id) ON DELETE SET NULL,
  uploaded_by   TEXT NOT NULL REFERENCES users(id),
  image_type    TEXT NOT NULL
                  CHECK (image_type IN (
                    'cbct','scan_3d','dicom',
                    'photo_before','photo_after',
                    'xray','intraoral','other'
                  )),
  description   TEXT,
  file_id       TEXT NOT NULL REFERENCES file_objects(id) ON DELETE CASCADE,
  thumb_key     TEXT,
  original_name TEXT,
  original_size INTEGER,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_patient_images_tenant_patient ON patient_images(tenant_id, patient_id);
CREATE INDEX IF NOT EXISTS idx_patient_images_tenant_visit   ON patient_images(tenant_id, visit_id);
CREATE INDEX IF NOT EXISTS idx_patient_images_tenant_type   ON patient_images(tenant_id, image_type);
