-- Migration 0019 — Dental chairs and appointment chair allocation.
--
-- A chair is a branch-level operational resource. Its current display state is
-- calculated from this manual status and active appointment intervals.

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS dental_chairs (
  id                    TEXT PRIMARY KEY,
  tenant_id             TEXT NOT NULL REFERENCES tenants(id),
  branch_id             TEXT NOT NULL REFERENCES branches(id),
  code                  TEXT NOT NULL,
  name                  TEXT NOT NULL,
  room_name             TEXT,
  chair_type            TEXT NOT NULL DEFAULT 'general'
                        CHECK (chair_type IN ('general', 'surgery', 'orthodontic', 'pediatric', 'hygiene')),
  operational_status    TEXT NOT NULL DEFAULT 'available'
                        CHECK (operational_status IN ('available', 'cleaning', 'maintenance', 'out_of_service')),
  default_doctor_id     TEXT REFERENCES users(id),
  default_assistant_id  TEXT REFERENCES users(id),
  turnover_min          INTEGER NOT NULL DEFAULT 10 CHECK (turnover_min BETWEEN 0 AND 120),
  sort_order            INTEGER NOT NULL DEFAULT 0,
  color                 TEXT,
  is_active             INTEGER NOT NULL DEFAULT 1,
  notes                 TEXT,
  created_at            TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at            TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(tenant_id, branch_id, code)
);

CREATE INDEX IF NOT EXISTS idx_chairs_tenant_branch
  ON dental_chairs(tenant_id, branch_id, is_active, sort_order);

ALTER TABLE appointments ADD COLUMN chair_id TEXT REFERENCES dental_chairs(id);

CREATE INDEX IF NOT EXISTS idx_appts_tenant_chair
  ON appointments(tenant_id, chair_id, scheduled_at);
