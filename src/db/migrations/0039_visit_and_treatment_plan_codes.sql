-- Migration 0039 — Immutable human-readable codes for visits and treatment plans.

ALTER TABLE visits ADD COLUMN code TEXT;
ALTER TABLE treatment_plans ADD COLUMN code TEXT;

-- Backfill existing rows deterministically within each tenant and creation day.
UPDATE visits
SET code = 'LK-' || strftime('%Y%m%d', created_at) || '-' || printf('%04d', (
  SELECT COUNT(*)
  FROM visits AS prior
  WHERE prior.tenant_id = visits.tenant_id
    AND date(prior.created_at) = date(visits.created_at)
    AND (prior.created_at < visits.created_at OR (prior.created_at = visits.created_at AND prior.id <= visits.id))
))
WHERE code IS NULL;

UPDATE treatment_plans
SET code = 'KHD-' || strftime('%Y%m%d', created_at) || '-' || printf('%04d', (
  SELECT COUNT(*)
  FROM treatment_plans AS prior
  WHERE prior.tenant_id = treatment_plans.tenant_id
    AND date(prior.created_at) = date(treatment_plans.created_at)
    AND (prior.created_at < treatment_plans.created_at OR (prior.created_at = treatment_plans.created_at AND prior.id <= treatment_plans.id))
))
WHERE code IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_visits_tenant_code ON visits(tenant_id, code);
CREATE UNIQUE INDEX IF NOT EXISTS idx_treatment_plans_tenant_code ON treatment_plans(tenant_id, code);

-- Independent, atomic daily counters prevent duplicate codes during concurrent creation.
CREATE TABLE IF NOT EXISTS clinical_document_code_counters (
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  document_type TEXT NOT NULL CHECK (document_type IN ('visit', 'treatment_plan')),
  date_key TEXT NOT NULL,
  last_seq INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (tenant_id, document_type, date_key)
);

INSERT INTO clinical_document_code_counters (tenant_id, document_type, date_key, last_seq)
SELECT tenant_id, 'visit', substr(code, 4, 8), MAX(CAST(substr(code, 13) AS INTEGER))
FROM visits
WHERE code IS NOT NULL
GROUP BY tenant_id, substr(code, 4, 8)
ON CONFLICT(tenant_id, document_type, date_key) DO UPDATE SET last_seq = MAX(last_seq, excluded.last_seq);

INSERT INTO clinical_document_code_counters (tenant_id, document_type, date_key, last_seq)
SELECT tenant_id, 'treatment_plan', substr(code, 5, 8), MAX(CAST(substr(code, 14) AS INTEGER))
FROM treatment_plans
WHERE code IS NOT NULL
GROUP BY tenant_id, substr(code, 5, 8)
ON CONFLICT(tenant_id, document_type, date_key) DO UPDATE SET last_seq = MAX(last_seq, excluded.last_seq);
