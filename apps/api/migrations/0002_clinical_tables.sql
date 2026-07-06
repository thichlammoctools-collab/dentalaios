-- Migration 0002 — Clinical tables.
--
-- All clinical tables carry tenant_id (architecture rule #3).
-- Composite indexes prioritise tenant_id first for query isolation.

PRAGMA foreign_keys = ON;

-- ──────────────── Patients ────────────────
CREATE TABLE IF NOT EXISTS patients (
  id             TEXT PRIMARY KEY,
  tenant_id      TEXT NOT NULL REFERENCES tenants(id),
  branch_id      TEXT NOT NULL REFERENCES branches(id),
  name           TEXT NOT NULL,
  date_of_birth  TEXT NOT NULL, -- ISO YYYY-MM-DD
  gender         TEXT NOT NULL CHECK (gender IN ('M', 'F', 'O')),
  phone          TEXT NOT NULL,
  email          TEXT,
  notes          TEXT,
  created_at     TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_patients_tenant ON patients(tenant_id);
CREATE INDEX IF NOT EXISTS idx_patients_tenant_branch ON patients(tenant_id, branch_id);
CREATE INDEX IF NOT EXISTS idx_patients_phone ON patients(tenant_id, phone);
CREATE INDEX IF NOT EXISTS idx_patients_name ON patients(tenant_id, name);

-- ──────────────── Medical alerts ────────────────
CREATE TABLE IF NOT EXISTS medical_alerts (
  id           TEXT PRIMARY KEY,
  tenant_id    TEXT NOT NULL REFERENCES tenants(id),
  patient_id   TEXT NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  type         TEXT NOT NULL,    -- allergy | chronic | medication
  description  TEXT NOT NULL,
  severity     TEXT NOT NULL CHECK (severity IN ('low', 'medium', 'high')),
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_alerts_tenant_patient ON medical_alerts(tenant_id, patient_id);

-- ──────────────── Visits ────────────────
CREATE TABLE IF NOT EXISTS visits (
  id            TEXT PRIMARY KEY,
  tenant_id     TEXT NOT NULL REFERENCES tenants(id),
  patient_id    TEXT NOT NULL REFERENCES patients(id),
  branch_id     TEXT NOT NULL REFERENCES branches(id),
  clinician_id  TEXT NOT NULL REFERENCES users(id),
  date          TEXT NOT NULL DEFAULT (datetime('now')),
  status        TEXT NOT NULL DEFAULT 'in_progress'
                  CHECK (status IN ('in_progress', 'completed', 'cancelled')),
  notes         TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_visits_tenant_patient ON visits(tenant_id, patient_id);
CREATE INDEX IF NOT EXISTS idx_visits_tenant_branch ON visits(tenant_id, branch_id);
CREATE INDEX IF NOT EXISTS idx_visits_tenant_date ON visits(tenant_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_visits_tenant_clinician ON visits(tenant_id, clinician_id);

-- ──────────────── Clinical findings (by FDI tooth) ────────────────
CREATE TABLE IF NOT EXISTS clinical_findings (
  id             TEXT PRIMARY KEY,
  tenant_id      TEXT NOT NULL REFERENCES tenants(id),
  visit_id       TEXT NOT NULL REFERENCES visits(id) ON DELETE CASCADE,
  tooth_number   INTEGER NOT NULL,
  tooth_system   TEXT NOT NULL DEFAULT 'FDI' CHECK (tooth_system = 'FDI'),
  condition      TEXT NOT NULL,
  notes          TEXT,
  created_at     TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_findings_tenant_visit ON clinical_findings(tenant_id, visit_id);
CREATE INDEX IF NOT EXISTS idx_findings_tenant_tooth ON clinical_findings(tenant_id, tooth_number);

-- ──────────────── Treatment plans ────────────────
CREATE TABLE IF NOT EXISTS treatment_plans (
  id            TEXT PRIMARY KEY,
  tenant_id     TEXT NOT NULL REFERENCES tenants(id),
  visit_id      TEXT NOT NULL REFERENCES visits(id),
  patient_id    TEXT NOT NULL REFERENCES patients(id),
  status        TEXT NOT NULL DEFAULT 'draft'
                  CHECK (status IN ('draft', 'approved', 'completed', 'cancelled')),
  total_cost    REAL NOT NULL DEFAULT 0,
  currency      TEXT NOT NULL DEFAULT 'VND',
  notes         TEXT,
  approved_at   TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_plans_tenant_patient ON treatment_plans(tenant_id, patient_id);
CREATE INDEX IF NOT EXISTS idx_plans_tenant_visit ON treatment_plans(tenant_id, visit_id);
CREATE INDEX IF NOT EXISTS idx_plans_tenant_status ON treatment_plans(tenant_id, status);

-- ──────────────── Treatment plan items ────────────────
CREATE TABLE IF NOT EXISTS treatment_plan_items (
  id                  TEXT PRIMARY KEY,
  tenant_id           TEXT NOT NULL REFERENCES tenants(id),
  treatment_plan_id   TEXT NOT NULL REFERENCES treatment_plans(id) ON DELETE CASCADE,
  tooth_number        INTEGER NOT NULL,
  procedure           TEXT NOT NULL,
  description         TEXT NOT NULL,
  unit_cost           REAL NOT NULL DEFAULT 0,
  status              TEXT NOT NULL DEFAULT 'planned'
                        CHECK (status IN ('planned', 'in_progress', 'completed')),
  created_at          TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_plan_items_tenant_plan ON treatment_plan_items(tenant_id, treatment_plan_id);
CREATE INDEX IF NOT EXISTS idx_plan_items_tenant_tooth ON treatment_plan_items(tenant_id, tooth_number);

-- ──────────────── Payments ────────────────
CREATE TABLE IF NOT EXISTS payments (
  id                  TEXT PRIMARY KEY,
  tenant_id           TEXT NOT NULL REFERENCES tenants(id),
  treatment_plan_id   TEXT NOT NULL REFERENCES treatment_plans(id),
  patient_id          TEXT NOT NULL REFERENCES patients(id),
  amount              REAL NOT NULL,
  currency            TEXT NOT NULL DEFAULT 'VND',
  method              TEXT NOT NULL CHECK (method IN ('cash', 'transfer', 'card', 'other')),
  status              TEXT NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending', 'confirmed', 'failed')),
  reference           TEXT,
  notes               TEXT,
  created_at          TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_payments_tenant_plan ON payments(tenant_id, treatment_plan_id);
CREATE INDEX IF NOT EXISTS idx_payments_tenant_patient ON payments(tenant_id, patient_id);
CREATE INDEX IF NOT EXISTS idx_payments_tenant_status ON payments(tenant_id, status);