-- Migration 0062 - Doctor acknowledgement for clinical safety warnings.
-- These records preserve the decision context without storing a duplicate
-- clinical payload in generic audit logs.

CREATE TABLE IF NOT EXISTS visit_safety_acknowledgements (
  id              TEXT PRIMARY KEY,
  tenant_id       TEXT NOT NULL REFERENCES tenants(id),
  visit_id        TEXT NOT NULL REFERENCES visits(id),
  warning_type    TEXT NOT NULL CHECK (warning_type IN ('blood_pressure', 'blood_sugar', 'bmi')),
  outcome         TEXT NOT NULL CHECK (outcome IN ('acknowledged', 'continue_with_reason', 'defer_treatment', 'refer_or_escalate')),
  reason          TEXT,
  acknowledged_by TEXT NOT NULL REFERENCES users(id),
  acknowledged_at TEXT NOT NULL DEFAULT (datetime('now')),
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(tenant_id, visit_id, warning_type)
);

CREATE INDEX IF NOT EXISTS idx_visit_safety_acknowledgements_tenant_visit
  ON visit_safety_acknowledgements(tenant_id, visit_id, acknowledged_at DESC);
