-- Migration 0038 — Preserve clinical history when a patient leaves the clinic.
-- Archived patients remain available for audit and can be restored by authorized staff.

ALTER TABLE patients ADD COLUMN archived_at TEXT;
ALTER TABLE patients ADD COLUMN archived_by TEXT REFERENCES users(id);
ALTER TABLE patients ADD COLUMN archive_reason TEXT;

CREATE INDEX IF NOT EXISTS idx_patients_tenant_archived
  ON patients(tenant_id, archived_at);
