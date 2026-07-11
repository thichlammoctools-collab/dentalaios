-- Migration 0011 — Add assistant_id to appointments.
--
-- A primary dental assistant assigned to the appointment. Optional, nullable.
-- Architecture rule #3: column carries tenant_id via FK to users (which has tenant_id).

PRAGMA foreign_keys = ON;

ALTER TABLE appointments ADD COLUMN assistant_id TEXT REFERENCES users(id);

CREATE INDEX IF NOT EXISTS idx_appts_assistant ON appointments(tenant_id, assistant_id);