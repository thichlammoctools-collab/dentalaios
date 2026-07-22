-- Migration 0019 — Separate clinical discipline, physical scope, site and measurements.
-- Existing clinical findings remain intact and are mapped to their closest new category.

PRAGMA foreign_keys = OFF;

CREATE TABLE _clinical_findings_backup AS
  SELECT id, tenant_id, visit_id, tooth_number, tooth_system, scope, area, condition, notes, created_at
  FROM clinical_findings;

DROP TABLE clinical_findings;

CREATE TABLE clinical_findings (
  id                    TEXT PRIMARY KEY,
  tenant_id             TEXT NOT NULL,
  visit_id              TEXT NOT NULL REFERENCES visits(id) ON DELETE CASCADE,
  category              TEXT NOT NULL CHECK (category IN (
                          'tooth_hard_tissue', 'periodontal', 'oral_soft_tissue',
                          'occlusion_orthodontics', 'tmj_function', 'preventive_general'
                        )),
  scope                 TEXT NOT NULL CHECK (scope IN ('tooth', 'region', 'full_mouth')),
  tooth_number          INTEGER,
  tooth_system          TEXT CHECK (tooth_system = 'FDI' OR tooth_system IS NULL),
  anatomical_site       TEXT,
  location_details_json TEXT,
  measurements_json     TEXT,
  condition             TEXT NOT NULL,
  notes                 TEXT,
  created_at            TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_findings_tenant_visit ON clinical_findings(tenant_id, visit_id);
CREATE INDEX idx_findings_tenant_category ON clinical_findings(tenant_id, visit_id, category);
CREATE INDEX idx_findings_tenant_tooth ON clinical_findings(tenant_id, tooth_number);

INSERT INTO clinical_findings (
  id, tenant_id, visit_id, category, scope, tooth_number, tooth_system,
  anatomical_site, location_details_json, measurements_json, condition, notes, created_at
)
SELECT
  id,
  tenant_id,
  visit_id,
  CASE
    WHEN scope = 'tooth' THEN 'tooth_hard_tissue'
    WHEN scope = 'occlusion' THEN 'occlusion_orthodontics'
    WHEN scope = 'full_mouth' AND condition = 'bruxism' THEN 'tmj_function'
    WHEN scope = 'soft_tissue' AND condition IN ('tmd_pain', 'clicking', 'limitation') THEN 'tmj_function'
    WHEN scope = 'soft_tissue' AND area = 'gum' AND condition IN (
      'gingivitis', 'periodontitis', 'abscess', 'fistula', 'recession', 'hypertrophy', 'calculus'
    ) THEN 'periodontal'
    WHEN scope = 'full_mouth' THEN 'preventive_general'
    ELSE 'oral_soft_tissue'
  END AS category,
  CASE WHEN scope = 'tooth' THEN 'tooth' WHEN scope = 'full_mouth' OR scope = 'occlusion' THEN 'full_mouth' ELSE 'region' END AS scope,
  tooth_number,
  tooth_system,
  CASE
    WHEN scope = 'soft_tissue' AND condition IN ('tmd_pain', 'clicking', 'limitation') THEN 'tmj'
    ELSE area
  END AS anatomical_site,
  NULL,
  NULL,
  condition,
  notes,
  created_at
FROM _clinical_findings_backup;

DROP TABLE _clinical_findings_backup;

PRAGMA foreign_keys = ON;
