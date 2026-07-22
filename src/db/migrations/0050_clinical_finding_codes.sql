-- Immutable human-readable codes for clinical findings.

ALTER TABLE clinical_findings ADD COLUMN code TEXT;

-- Backfill deterministically by tenant and the finding creation date in Vietnam.
UPDATE clinical_findings
SET code = 'FND-' || strftime('%Y%m%d', created_at, '+7 hours') || '-' || printf('%04d', (
  SELECT COUNT(*)
  FROM clinical_findings AS prior
  WHERE prior.tenant_id = clinical_findings.tenant_id
    AND date(prior.created_at, '+7 hours') = date(clinical_findings.created_at, '+7 hours')
    AND (prior.created_at < clinical_findings.created_at OR (prior.created_at = clinical_findings.created_at AND prior.id <= clinical_findings.id))
))
WHERE code IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_clinical_findings_tenant_code
  ON clinical_findings(tenant_id, code);

-- SQLite cannot alter the existing document-type CHECK constraint in place.
CREATE TABLE clinical_document_code_counters_next (
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  document_type TEXT NOT NULL CHECK (document_type IN ('visit', 'treatment_plan', 'finding')),
  date_key TEXT NOT NULL,
  last_seq INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (tenant_id, document_type, date_key)
);

INSERT INTO clinical_document_code_counters_next (tenant_id, document_type, date_key, last_seq)
SELECT tenant_id, document_type, date_key, last_seq
FROM clinical_document_code_counters;

INSERT INTO clinical_document_code_counters_next (tenant_id, document_type, date_key, last_seq)
SELECT tenant_id, 'finding', substr(code, 5, 8), MAX(CAST(substr(code, 14) AS INTEGER))
FROM clinical_findings
WHERE code IS NOT NULL
GROUP BY tenant_id, substr(code, 5, 8)
ON CONFLICT(tenant_id, document_type, date_key) DO UPDATE SET last_seq = MAX(last_seq, excluded.last_seq);

DROP TABLE clinical_document_code_counters;
ALTER TABLE clinical_document_code_counters_next RENAME TO clinical_document_code_counters;
