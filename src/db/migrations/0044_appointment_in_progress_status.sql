-- Migration 0044 -- Add an in-progress status to appointment lifecycle.
-- SQLite cannot modify a CHECK constraint in place, so rebuild the table.
-- Appointments are referenced by visits and milestone links. D1 always enforces
-- foreign keys, so defer their validation until the replacement table is ready.
PRAGMA defer_foreign_keys = ON;

CREATE TABLE appointments_new (
  id                TEXT PRIMARY KEY,
  tenant_id         TEXT NOT NULL REFERENCES tenants(id),
  branch_id         TEXT NOT NULL REFERENCES branches(id),
  clinician_id      TEXT NOT NULL REFERENCES users(id),
  patient_id        TEXT NOT NULL REFERENCES patients(id),
  source_visit_id   TEXT REFERENCES visits(id),
  scheduled_at      TEXT NOT NULL,
  duration_min      INTEGER NOT NULL DEFAULT 30,
  status            TEXT NOT NULL DEFAULT 'booked'
                    CHECK (status IN ('booked', 'confirmed', 'arrived', 'in_progress', 'completed', 'cancelled', 'no_show')),
  procedure         TEXT,
  notes             TEXT,
  source            TEXT NOT NULL DEFAULT 'manual',
  lark_event_id     TEXT,
  reminder_sent_at  TEXT,
  reminder_method   TEXT,
  cancelled_reason  TEXT,
  created_by        TEXT NOT NULL REFERENCES users(id),
  created_at        TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at        TEXT NOT NULL DEFAULT (datetime('now')),
  assistant_id      TEXT REFERENCES users(id),
  chair_id          TEXT REFERENCES dental_chairs(id)
);

INSERT INTO appointments_new SELECT
  id, tenant_id, branch_id, clinician_id, patient_id, source_visit_id,
  scheduled_at, duration_min, status, procedure, notes, source,
  lark_event_id, reminder_sent_at, reminder_method, cancelled_reason,
  created_by, created_at, updated_at, assistant_id, chair_id
FROM appointments;

DROP TABLE appointments;
ALTER TABLE appointments_new RENAME TO appointments;

CREATE INDEX idx_appts_tenant_date ON appointments(tenant_id, scheduled_at);
CREATE INDEX idx_appts_tenant_branch ON appointments(tenant_id, branch_id, scheduled_at);
CREATE INDEX idx_appts_tenant_clinician ON appointments(tenant_id, clinician_id, scheduled_at);
CREATE INDEX idx_appts_tenant_patient ON appointments(tenant_id, patient_id, scheduled_at);
CREATE INDEX idx_appts_status ON appointments(tenant_id, status, scheduled_at);

PRAGMA defer_foreign_keys = OFF;
