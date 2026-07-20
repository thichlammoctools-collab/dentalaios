-- Preserve the catalog price context used when a treatment-plan item is created.
-- This table is deliberately separate because older databases may or may not
-- have treatment_plan_items.service_code after the duplicate 0022 migration.
CREATE TABLE IF NOT EXISTS treatment_plan_item_price_snapshots (
  treatment_plan_item_id TEXT PRIMARY KEY REFERENCES treatment_plan_items(id) ON DELETE CASCADE,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  service_code TEXT,
  service_name TEXT,
  price_includes_vat INTEGER NOT NULL DEFAULT 1 CHECK (price_includes_vat IN (0, 1)),
  price_snapshot_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_plan_item_snapshots_tenant_service
  ON treatment_plan_item_price_snapshots(tenant_id, service_code);
