-- Migration 0057 — Classify patient images by clinical purpose.

ALTER TABLE patient_images
  ADD COLUMN image_purpose TEXT NOT NULL DEFAULT 'clinical_record'
  CHECK (image_purpose IN ('clinical_record', 'treatment_before', 'treatment_after'));

CREATE INDEX IF NOT EXISTS idx_patient_images_tenant_purpose
  ON patient_images(tenant_id, patient_id, image_purpose);
