-- Appointments are operational slots; milestones retain clinical progress.
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS treatment_milestone_appointments (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  treatment_case_milestone_id TEXT NOT NULL REFERENCES treatment_case_milestones(id) ON DELETE CASCADE,
  appointment_id TEXT NOT NULL REFERENCES appointments(id),
  link_type TEXT NOT NULL DEFAULT 'primary'
    CHECK (link_type IN ('primary', 'follow_up', 'consultation', 'preparation', 'delivery')),
  execution_status TEXT NOT NULL DEFAULT 'planned'
    CHECK (execution_status IN ('planned', 'partially_completed', 'completed', 'not_performed')),
  notes TEXT,
  linked_by TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(tenant_id, treatment_case_milestone_id, appointment_id)
);
CREATE INDEX IF NOT EXISTS idx_milestone_appointments_milestone
  ON treatment_milestone_appointments(tenant_id, treatment_case_milestone_id, created_at);
CREATE INDEX IF NOT EXISTS idx_milestone_appointments_appointment
  ON treatment_milestone_appointments(tenant_id, appointment_id);
