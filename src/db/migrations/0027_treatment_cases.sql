-- Phase 1: operational treatment cases for approved treatment plans.
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS treatment_case_counters (
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  date_key TEXT NOT NULL,
  last_seq INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (tenant_id, date_key)
);

CREATE TABLE IF NOT EXISTS treatment_cases (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  treatment_plan_id TEXT NOT NULL UNIQUE REFERENCES treatment_plans(id),
  patient_id TEXT NOT NULL REFERENCES patients(id),
  case_number TEXT NOT NULL,
  case_type TEXT NOT NULL CHECK (case_type IN ('general', 'implant', 'orthodontics', 'prosthodontics', 'full_mouth', 'other')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'completed', 'cancelled')),
  primary_branch_id TEXT NOT NULL REFERENCES branches(id),
  primary_clinician_id TEXT NOT NULL REFERENCES users(id),
  title TEXT NOT NULL,
  clinical_summary TEXT,
  treatment_goal TEXT,
  activated_at TEXT NOT NULL,
  target_completed_at TEXT,
  completed_at TEXT,
  paused_at TEXT,
  paused_reason TEXT,
  cancelled_at TEXT,
  cancelled_reason TEXT,
  created_by TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(tenant_id, case_number)
);
CREATE INDEX IF NOT EXISTS idx_treatment_cases_tenant_patient ON treatment_cases(tenant_id, patient_id, status);
CREATE INDEX IF NOT EXISTS idx_treatment_cases_tenant_branch ON treatment_cases(tenant_id, primary_branch_id, status);

CREATE TABLE IF NOT EXISTS treatment_case_members (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  treatment_case_id TEXT NOT NULL REFERENCES treatment_cases(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id),
  role TEXT NOT NULL CHECK (role IN ('primary_clinician', 'co_clinician', 'consultant', 'assistant', 'coordinator', 'lab_contact')),
  assigned_at TEXT NOT NULL DEFAULT (datetime('now')),
  assigned_by TEXT NOT NULL REFERENCES users(id),
  removed_at TEXT,
  UNIQUE(tenant_id, treatment_case_id, user_id, role)
);
CREATE INDEX IF NOT EXISTS idx_treatment_case_members_user ON treatment_case_members(tenant_id, user_id, removed_at);

CREATE TABLE IF NOT EXISTS treatment_case_status_history (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  treatment_case_id TEXT NOT NULL REFERENCES treatment_cases(id) ON DELETE CASCADE,
  from_status TEXT,
  to_status TEXT NOT NULL CHECK (to_status IN ('active', 'paused', 'completed', 'cancelled')),
  reason TEXT,
  changed_by TEXT NOT NULL REFERENCES users(id),
  changed_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_treatment_case_status_history_case ON treatment_case_status_history(tenant_id, treatment_case_id, changed_at DESC);
