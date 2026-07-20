-- Assign treatment personnel per plan item for future commission calculations.
-- These are snapshots at the item level, separate from visit attendance.
ALTER TABLE treatment_plan_items ADD COLUMN treating_clinician_id TEXT REFERENCES users(id);
ALTER TABLE treatment_plan_items ADD COLUMN assistant_id TEXT REFERENCES users(id);

CREATE INDEX IF NOT EXISTS idx_plan_items_tenant_clinician
  ON treatment_plan_items(tenant_id, treating_clinician_id);
CREATE INDEX IF NOT EXISTS idx_plan_items_tenant_assistant
  ON treatment_plan_items(tenant_id, assistant_id);
