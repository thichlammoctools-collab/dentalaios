PRAGMA foreign_keys = ON;

-- ──────────────── File Objects (R2 metadata) ────────────────
-- Every uploaded file (patient images, avatars, etc.) is tracked here.
-- Referenced by patient_images.file_id, users.avatar_file_id, patients.avatar_file_id.
CREATE TABLE IF NOT EXISTS file_objects (
  id            TEXT PRIMARY KEY,
  tenant_id     TEXT NOT NULL REFERENCES tenants(id),
  r2_key        TEXT NOT NULL,
  filename      TEXT NOT NULL,
  content_type  TEXT NOT NULL,
  size          INTEGER NOT NULL,
  uploaded_by   TEXT NOT NULL REFERENCES users(id),
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_file_objects_tenant ON file_objects(tenant_id);
CREATE INDEX IF NOT EXISTS idx_file_objects_r2_key ON file_objects(r2_key);
