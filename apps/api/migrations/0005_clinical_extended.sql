-- Migration 0005 — Extend clinical_findings with scope + area + nullable tooth_number.
--
-- D1/SQLite does not support DROP COLUMN or changing NOT NULL constraints in-place.
-- Strategy: recreate the table with the new schema, copy data, swap.

PRAGMA foreign_keys = OFF;

-- ── clinical_findings ──────────────────────────────────────────────
-- 1. Snapshot existing data
CREATE TABLE _clinical_findings_backup AS
  SELECT id, tenant_id, visit_id, tooth_number, tooth_system, condition, notes, created_at
  FROM clinical_findings;

-- 2. Drop old table
DROP TABLE clinical_findings;

-- 3. Create new table with extended schema
CREATE TABLE clinical_findings (
  id             TEXT PRIMARY KEY,
  tenant_id      TEXT NOT NULL,
  visit_id       TEXT NOT NULL REFERENCES visits(id) ON DELETE CASCADE,
  tooth_number   INTEGER,
  tooth_system   TEXT CHECK (tooth_system = 'FDI' OR tooth_system IS NULL),
  scope          TEXT NOT NULL DEFAULT 'tooth'
                   CHECK (scope IN ('tooth', 'full_mouth', 'soft_tissue')),
  area           TEXT,
  condition      TEXT NOT NULL,
  notes          TEXT,
  created_at     TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_findings_tenant_visit ON clinical_findings(tenant_id, visit_id);
CREATE INDEX idx_findings_tenant_tooth ON clinical_findings(tenant_id, tooth_number);

-- 4. Restore data — all existing rows are per-tooth, so scope = 'tooth'
INSERT INTO clinical_findings
  (id, tenant_id, visit_id, tooth_number, tooth_system, scope, area, condition, notes, created_at)
SELECT
  id, tenant_id, visit_id,
  tooth_number,
  COALESCE(tooth_system, 'FDI'),
  'tooth' AS scope,
  NULL    AS area,
  condition,
  notes,
  created_at
FROM _clinical_findings_backup;

DROP TABLE _clinical_findings_backup;

-- ── treatment_plan_items ───────────────────────────────────────────
-- tooth_number becomes nullable for full-mouth items (e.g. scaling)

CREATE TABLE _plan_items_backup AS
  SELECT id, tenant_id, treatment_plan_id, tooth_number, procedure, description, unit_cost, status, created_at
  FROM treatment_plan_items;

DROP TABLE treatment_plan_items;

CREATE TABLE treatment_plan_items (
  id                  TEXT PRIMARY KEY,
  tenant_id           TEXT NOT NULL,
  treatment_plan_id   TEXT NOT NULL REFERENCES treatment_plans(id) ON DELETE CASCADE,
  tooth_number        INTEGER,
  procedure           TEXT NOT NULL,
  description         TEXT NOT NULL,
  unit_cost           REAL NOT NULL DEFAULT 0,
  status              TEXT NOT NULL DEFAULT 'planned'
                        CHECK (status IN ('planned', 'in_progress', 'completed')),
  created_at          TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_plan_items_tenant_plan ON treatment_plan_items(tenant_id, treatment_plan_id);
CREATE INDEX idx_plan_items_tenant_tooth ON treatment_plan_items(tenant_id, tooth_number);

INSERT INTO treatment_plan_items
  SELECT * FROM _plan_items_backup;

DROP TABLE _plan_items_backup;

PRAGMA foreign_keys = ON;
