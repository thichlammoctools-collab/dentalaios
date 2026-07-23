-- Immutable annotations on browser-renderable patient images and their diagnosis evidence links.

CREATE TABLE IF NOT EXISTS image_annotations (
  id                 TEXT PRIMARY KEY,
  tenant_id          TEXT NOT NULL REFERENCES tenants(id),
  patient_image_id   TEXT NOT NULL REFERENCES patient_images(id) ON DELETE CASCADE,
  current_version_no INTEGER NOT NULL DEFAULT 1 CHECK (current_version_no >= 1),
  created_by         TEXT NOT NULL REFERENCES users(id),
  created_at         TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at         TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_image_annotations_tenant_image
  ON image_annotations(tenant_id, patient_image_id, created_at DESC);

CREATE TABLE IF NOT EXISTS image_annotation_versions (
  id              TEXT PRIMARY KEY,
  tenant_id       TEXT NOT NULL REFERENCES tenants(id),
  annotation_id   TEXT NOT NULL REFERENCES image_annotations(id) ON DELETE CASCADE,
  version_no      INTEGER NOT NULL CHECK (version_no >= 1),
  shape_type      TEXT NOT NULL CHECK (shape_type IN ('pin', 'rectangle')),
  geometry_json   TEXT NOT NULL,
  note            TEXT NOT NULL,
  tooth_number    INTEGER,
  anatomical_site TEXT,
  created_by      TEXT NOT NULL REFERENCES users(id),
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(annotation_id, version_no)
);

CREATE INDEX IF NOT EXISTS idx_annotation_versions_tenant_annotation
  ON image_annotation_versions(tenant_id, annotation_id, version_no DESC);

CREATE TABLE IF NOT EXISTS clinical_diagnosis_image_evidence (
  id                    TEXT PRIMARY KEY,
  tenant_id             TEXT NOT NULL REFERENCES tenants(id),
  diagnosis_id          TEXT NOT NULL REFERENCES clinical_diagnoses(id) ON DELETE CASCADE,
  patient_image_id      TEXT NOT NULL REFERENCES patient_images(id),
  annotation_version_id TEXT REFERENCES image_annotation_versions(id),
  relation              TEXT NOT NULL CHECK (relation IN ('supports', 'contradicts', 'incidental')),
  note                  TEXT,
  linked_by             TEXT NOT NULL REFERENCES users(id),
  linked_at             TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(diagnosis_id, patient_image_id, annotation_version_id)
);

CREATE INDEX IF NOT EXISTS idx_diagnosis_image_evidence_tenant_diagnosis
  ON clinical_diagnosis_image_evidence(tenant_id, diagnosis_id);
CREATE INDEX IF NOT EXISTS idx_diagnosis_image_evidence_tenant_image
  ON clinical_diagnosis_image_evidence(tenant_id, patient_image_id);

-- Tenant, patient, and annotation-to-image ownership are enforced in
-- imageAnnotationsService before an evidence row can be inserted. D1's remote
-- migration runner splits trigger bodies at semicolons, so this invariant is
-- deliberately kept in the service rather than a SQLite trigger.
