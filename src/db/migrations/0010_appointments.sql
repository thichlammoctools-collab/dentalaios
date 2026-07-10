-- Migration 0010 — Appointments (lịch hẹn).
--
-- Stores scheduled patient appointments. Each appointment can be linked to a
-- Lark calendar event (via lark_event_id) when the tenant has Lark configured.
--
-- Architecture rules:
--   - tenant_id present (rule #3)
--   - audit via middleware, not raw logging (rule #4)
--   - Only operational fields are sent to Lark (rule #7)

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS appointments (
  id              TEXT PRIMARY KEY,
  tenant_id       TEXT NOT NULL,
  patient_id      TEXT NOT NULL REFERENCES patients(id),
  branch_id       TEXT NOT NULL REFERENCES branches(id),
  doctor_id       TEXT REFERENCES users(id),
  doctor_name     TEXT,
  scheduled_at    TEXT NOT NULL,          -- ISO datetime (UTC)
  duration_minutes INTEGER NOT NULL DEFAULT 60,
  room            TEXT,
  notes           TEXT,
  status          TEXT NOT NULL DEFAULT 'scheduled',
  -- Lark sync
  lark_event_id   TEXT,
  created_by      TEXT NOT NULL REFERENCES users(id),
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Index for calendar queries by tenant + date range
CREATE INDEX IF NOT EXISTS idx_appointments_tenant_scheduled
  ON appointments(tenant_id, scheduled_at);

-- Index for patient history
CREATE INDEX IF NOT EXISTS idx_appointments_patient
  ON appointments(patient_id);
