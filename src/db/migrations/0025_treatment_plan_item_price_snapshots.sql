-- Preserve the catalog price context used when a treatment-plan item is created.
-- The duplicate 0022 migration prefix meant these columns were not present in
-- databases where D1 recorded the chair-revenue migration as 0022.
ALTER TABLE treatment_plan_items ADD COLUMN service_code TEXT;
ALTER TABLE treatment_plan_items ADD COLUMN service_name TEXT;
ALTER TABLE treatment_plan_items ADD COLUMN price_includes_vat INTEGER NOT NULL DEFAULT 1
  CHECK (price_includes_vat IN (0, 1));
ALTER TABLE treatment_plan_items ADD COLUMN price_snapshot_at TEXT;

CREATE INDEX IF NOT EXISTS idx_plan_items_tenant_service_code
  ON treatment_plan_items(tenant_id, service_code);
