PRAGMA foreign_keys = ON;

-- ──────────────── Patient Notes (append-only, per-user history) ────────────────
-- Each note is immutable so a patient's note history and author remain traceable.

CREATE TABLE IF NOT EXISTS patient_notes (
  id            TEXT PRIMARY KEY,
  tenant_id     TEXT NOT NULL REFERENCES tenants(id),
  patient_id    TEXT NOT NULL REFERENCES patients(id),
  user_id       TEXT NOT NULL REFERENCES users(id),
  content       TEXT NOT NULL,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_patient_notes_patient ON patient_notes(tenant_id, patient_id);
CREATE INDEX IF NOT EXISTS idx_patient_notes_created ON patient_notes(tenant_id, patient_id, created_at ASC);
