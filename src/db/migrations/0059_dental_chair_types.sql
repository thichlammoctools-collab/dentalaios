-- Replace the retired hygiene chair type with prosthodontics.
-- SQLite requires rebuilding the table to change its CHECK constraint.
PRAGMA defer_foreign_keys = ON;

CREATE TABLE dental_chairs_next (
  id                    TEXT PRIMARY KEY,
  tenant_id             TEXT NOT NULL REFERENCES tenants(id),
  branch_id             TEXT NOT NULL REFERENCES branches(id),
  code                  TEXT NOT NULL,
  name                  TEXT NOT NULL,
  room_name             TEXT,
  chair_type            TEXT NOT NULL DEFAULT 'general'
                        CHECK (chair_type IN ('general', 'surgery', 'orthodontic', 'pediatric', 'prosthodontics')),
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
  room_id               TEXT REFERENCES dental_rooms(id),
  UNIQUE(tenant_id, branch_id, code)
);

INSERT INTO dental_chairs_next (
  id, tenant_id, branch_id, code, name, room_name, chair_type,
  operational_status, default_doctor_id, default_assistant_id, turnover_min,
  sort_order, color, is_active, notes, created_at, updated_at, room_id
)
SELECT
  id, tenant_id, branch_id, code, name, room_name,
  CASE chair_type WHEN 'hygiene' THEN 'prosthodontics' ELSE chair_type END,
  operational_status, default_doctor_id, default_assistant_id, turnover_min,
  sort_order, color, is_active, notes, created_at, updated_at, room_id
FROM dental_chairs;

DROP TABLE dental_chairs;
ALTER TABLE dental_chairs_next RENAME TO dental_chairs;

CREATE INDEX idx_chairs_tenant_branch
  ON dental_chairs(tenant_id, branch_id, is_active, sort_order);
CREATE INDEX idx_chairs_tenant_room
  ON dental_chairs(tenant_id, room_id);

PRAGMA defer_foreign_keys = OFF;
