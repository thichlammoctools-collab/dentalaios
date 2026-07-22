-- Migration 0018 — Add occlusion scope to clinical findings.
-- SQLite requires recreating a table to modify a CHECK constraint.

PRAGMA foreign_keys = OFF;

CREATE TABLE _clinical_findings_backup AS
  SELECT id, tenant_id, visit_id, tooth_number, tooth_system, scope, area, condition, notes, created_at
  FROM clinical_findings;

DROP TABLE clinical_findings;

CREATE TABLE clinical_findings (
  id             TEXT PRIMARY KEY,
  tenant_id      TEXT NOT NULL,
  visit_id       TEXT NOT NULL REFERENCES visits(id) ON DELETE CASCADE,
  tooth_number   INTEGER,
  tooth_system   TEXT CHECK (tooth_system = 'FDI' OR tooth_system IS NULL),
  scope          TEXT NOT NULL DEFAULT 'tooth'
                   CHECK (scope IN ('tooth', 'full_mouth', 'soft_tissue', 'occlusion')),
  area           TEXT,
  condition      TEXT NOT NULL,
  notes          TEXT,
  created_at     TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_findings_tenant_visit ON clinical_findings(tenant_id, visit_id);
CREATE INDEX idx_findings_tenant_tooth ON clinical_findings(tenant_id, tooth_number);

INSERT INTO clinical_findings
  (id, tenant_id, visit_id, tooth_number, tooth_system, scope, area, condition, notes, created_at)
SELECT id, tenant_id, visit_id, tooth_number, tooth_system, scope, area, condition, notes, created_at
FROM _clinical_findings_backup;

DROP TABLE _clinical_findings_backup;

PRAGMA foreign_keys = ON;
