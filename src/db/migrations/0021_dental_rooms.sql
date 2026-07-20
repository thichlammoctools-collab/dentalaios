-- Migration 0021 — Branch rooms used by dental chairs.
-- Room names are maintained once per branch instead of being free text on chairs.

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS dental_rooms (
  id          TEXT PRIMARY KEY,
  tenant_id   TEXT NOT NULL REFERENCES tenants(id),
  branch_id   TEXT NOT NULL REFERENCES branches(id),
  name        TEXT NOT NULL,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  is_active   INTEGER NOT NULL DEFAULT 1,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(tenant_id, branch_id, name)
);

CREATE INDEX IF NOT EXISTS idx_dental_rooms_tenant_branch
  ON dental_rooms(tenant_id, branch_id, is_active, sort_order);

-- Preserve rooms entered before rooms were managed as a separate resource.
INSERT OR IGNORE INTO dental_rooms (id, tenant_id, branch_id, name)
SELECT lower(hex(randomblob(16))), tenant_id, branch_id, room_name
FROM dental_chairs
WHERE room_name IS NOT NULL AND trim(room_name) <> '';

ALTER TABLE dental_chairs ADD COLUMN room_id TEXT REFERENCES dental_rooms(id);

UPDATE dental_chairs
SET room_id = (
  SELECT dental_rooms.id
  FROM dental_rooms
  WHERE dental_rooms.tenant_id = dental_chairs.tenant_id
    AND dental_rooms.branch_id = dental_chairs.branch_id
    AND dental_rooms.name = dental_chairs.room_name
)
WHERE room_name IS NOT NULL AND trim(room_name) <> '';

CREATE INDEX IF NOT EXISTS idx_chairs_tenant_room
  ON dental_chairs(tenant_id, room_id);
