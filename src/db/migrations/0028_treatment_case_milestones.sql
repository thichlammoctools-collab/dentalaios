-- Link operational treatment cases to the immutable items of an approved plan.
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS treatment_case_milestones (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  treatment_case_id TEXT NOT NULL REFERENCES treatment_cases(id) ON DELETE CASCADE,
  treatment_plan_item_id TEXT NOT NULL REFERENCES treatment_plan_items(id),
  sort_order INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'not_started' CHECK (status IN ('not_started', 'in_progress', 'completed', 'skipped')),
  planned_at TEXT NOT NULL,
  started_at TEXT,
  completed_at TEXT,
  skipped_at TEXT,
  skipped_reason TEXT,
  updated_by TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(tenant_id, treatment_case_id, treatment_plan_item_id)
);
CREATE INDEX IF NOT EXISTS idx_case_milestones_case_order
  ON treatment_case_milestones(tenant_id, treatment_case_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_case_milestones_item
  ON treatment_case_milestones(tenant_id, treatment_plan_item_id);

CREATE TABLE IF NOT EXISTS treatment_case_milestone_history (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  treatment_case_milestone_id TEXT NOT NULL REFERENCES treatment_case_milestones(id) ON DELETE CASCADE,
  from_status TEXT,
  to_status TEXT NOT NULL CHECK (to_status IN ('not_started', 'in_progress', 'completed', 'skipped')),
  reason TEXT,
  changed_by TEXT NOT NULL REFERENCES users(id),
  changed_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_case_milestone_history_timeline
  ON treatment_case_milestone_history(tenant_id, treatment_case_milestone_id, changed_at DESC);
