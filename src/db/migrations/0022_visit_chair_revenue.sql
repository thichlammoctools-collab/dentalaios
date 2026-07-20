-- Migration 0022 -- Immutable-at-payment chair snapshots for visit revenue.

PRAGMA foreign_keys = ON;

ALTER TABLE visits ADD COLUMN chair_id TEXT REFERENCES dental_chairs(id);
ALTER TABLE visits ADD COLUMN source_appointment_id TEXT REFERENCES appointments(id);

CREATE INDEX IF NOT EXISTS idx_visits_tenant_chair_date
  ON visits(tenant_id, chair_id, date);

CREATE INDEX IF NOT EXISTS idx_visits_tenant_source_appointment
  ON visits(tenant_id, source_appointment_id);
