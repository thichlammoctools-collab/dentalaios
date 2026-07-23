-- Add freehand paths while retaining legacy rectangle annotations.
-- SQLite/D1 requires recreating the table to expand a CHECK constraint.

CREATE TABLE image_annotation_versions_next (
  id              TEXT PRIMARY KEY,
  tenant_id       TEXT NOT NULL REFERENCES tenants(id),
  annotation_id   TEXT NOT NULL REFERENCES image_annotations(id) ON DELETE CASCADE,
  version_no      INTEGER NOT NULL CHECK (version_no >= 1),
  shape_type      TEXT NOT NULL CHECK (shape_type IN ('pin', 'rectangle', 'freehand')),
  geometry_json   TEXT NOT NULL,
  note            TEXT NOT NULL,
  tooth_number    INTEGER,
  anatomical_site TEXT,
  created_by      TEXT NOT NULL REFERENCES users(id),
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(annotation_id, version_no)
);

INSERT INTO image_annotation_versions_next
  (id, tenant_id, annotation_id, version_no, shape_type, geometry_json, note, tooth_number, anatomical_site, created_by, created_at)
SELECT id, tenant_id, annotation_id, version_no, shape_type, geometry_json, note, tooth_number, anatomical_site, created_by, created_at
FROM image_annotation_versions;

-- Recreate the dependent evidence table before replacing its referenced
-- annotation-version table, preserving existing evidence links.
CREATE TABLE clinical_diagnosis_image_evidence_next (
  id                    TEXT PRIMARY KEY,
  tenant_id             TEXT NOT NULL REFERENCES tenants(id),
  diagnosis_id          TEXT NOT NULL REFERENCES clinical_diagnoses(id) ON DELETE CASCADE,
  patient_image_id      TEXT NOT NULL REFERENCES patient_images(id),
  annotation_version_id TEXT REFERENCES image_annotation_versions_next(id),
  relation              TEXT NOT NULL CHECK (relation IN ('supports', 'contradicts', 'incidental')),
  note                  TEXT,
  linked_by             TEXT NOT NULL REFERENCES users(id),
  linked_at             TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(diagnosis_id, patient_image_id, annotation_version_id)
);

INSERT INTO clinical_diagnosis_image_evidence_next
  (id, tenant_id, diagnosis_id, patient_image_id, annotation_version_id, relation, note, linked_by, linked_at)
SELECT id, tenant_id, diagnosis_id, patient_image_id, annotation_version_id, relation, note, linked_by, linked_at
FROM clinical_diagnosis_image_evidence;

DROP TABLE clinical_diagnosis_image_evidence;
DROP TABLE image_annotation_versions;
ALTER TABLE image_annotation_versions_next RENAME TO image_annotation_versions;
ALTER TABLE clinical_diagnosis_image_evidence_next RENAME TO clinical_diagnosis_image_evidence;

CREATE INDEX IF NOT EXISTS idx_annotation_versions_tenant_annotation
  ON image_annotation_versions(tenant_id, annotation_id, version_no DESC);
CREATE INDEX IF NOT EXISTS idx_diagnosis_image_evidence_tenant_diagnosis
  ON clinical_diagnosis_image_evidence(tenant_id, diagnosis_id);
CREATE INDEX IF NOT EXISTS idx_diagnosis_image_evidence_tenant_image
  ON clinical_diagnosis_image_evidence(tenant_id, patient_image_id);
