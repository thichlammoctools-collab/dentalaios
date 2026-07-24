-- Clinical workflow, immutable evidence, plan version, and witnessed-consent foundation.
-- Additive only: historical records remain distinguishable as legacy and no
-- existing record is retroactively signed, consented, or clinically approved.

ALTER TABLE visits ADD COLUMN visit_type TEXT NOT NULL DEFAULT 'initial_exam'
  CHECK (visit_type IN ('initial_exam', 'follow_up', 'treatment', 'emergency'));
ALTER TABLE visits ADD COLUMN clinical_state TEXT NOT NULL DEFAULT 'in_progress'
  CHECK (clinical_state IN ('pre_exam', 'awaiting_doctor_review', 'in_progress', 'signed', 'amended', 'cancelled'));
ALTER TABLE visits ADD COLUMN effective_at TEXT;
ALTER TABLE visits ADD COLUMN signed_by TEXT REFERENCES users(id);
ALTER TABLE visits ADD COLUMN signed_at TEXT;
ALTER TABLE visits ADD COLUMN locked_at TEXT;
ALTER TABLE visits ADD COLUMN legacy_at TEXT;
ALTER TABLE visits ADD COLUMN legacy_source TEXT;

-- Keep existing completed visits readable but make their provenance explicit.
UPDATE visits
SET legacy_at = datetime('now'), legacy_source = 'pre_clinical_workflow'
WHERE status = 'completed' AND legacy_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_visits_tenant_clinical_state
  ON visits(tenant_id, clinical_state, date DESC);

ALTER TABLE clinical_findings ADD COLUMN entered_by TEXT REFERENCES users(id);
ALTER TABLE clinical_findings ADD COLUMN entry_source TEXT NOT NULL DEFAULT 'doctor'
  CHECK (entry_source IN ('assistant', 'doctor', 'ai', 'legacy'));
ALTER TABLE clinical_findings ADD COLUMN clinical_effective_at TEXT;

ALTER TABLE clinical_diagnoses ADD COLUMN entered_by TEXT REFERENCES users(id);
ALTER TABLE clinical_diagnoses ADD COLUMN entry_source TEXT NOT NULL DEFAULT 'doctor'
  CHECK (entry_source IN ('assistant', 'doctor', 'ai', 'legacy'));
ALTER TABLE clinical_diagnoses ADD COLUMN clinical_effective_at TEXT;

CREATE TABLE IF NOT EXISTS clinical_review_events (
  id             TEXT PRIMARY KEY,
  tenant_id      TEXT NOT NULL REFERENCES tenants(id),
  visit_id       TEXT NOT NULL REFERENCES visits(id),
  entity_type    TEXT NOT NULL CHECK (entity_type IN ('finding', 'diagnosis', 'initial_assessment')),
  entity_id      TEXT NOT NULL,
  review_status  TEXT NOT NULL CHECK (review_status IN ('pending', 'accepted', 'rejected', 'superseded')),
  entered_by     TEXT NOT NULL REFERENCES users(id),
  reviewed_by    TEXT REFERENCES users(id),
  reviewed_at    TEXT,
  review_note    TEXT,
  created_at     TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_clinical_review_events_tenant_queue
  ON clinical_review_events(tenant_id, visit_id, review_status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_clinical_review_events_tenant_entity
  ON clinical_review_events(tenant_id, entity_type, entity_id, created_at DESC);

CREATE TABLE IF NOT EXISTS visit_initial_assessments (
  id                         TEXT PRIMARY KEY,
  tenant_id                  TEXT NOT NULL REFERENCES tenants(id),
  visit_id                   TEXT NOT NULL UNIQUE REFERENCES visits(id),
  chief_complaint            TEXT,
  history_of_present_illness TEXT,
  dental_history             TEXT,
  medical_conditions_json    TEXT,
  medications_json           TEXT,
  allergies_json             TEXT,
  pregnancy_lactation        TEXT,
  tobacco_alcohol            TEXT,
  asa_class                  TEXT CHECK (asa_class IN ('I', 'II', 'III', 'IV', 'V', 'VI')),
  examination_summary        TEXT,
  preliminary_risk_notes     TEXT,
  entered_by                 TEXT NOT NULL REFERENCES users(id),
  reviewed_by                TEXT REFERENCES users(id),
  reviewed_at                TEXT,
  entry_source               TEXT NOT NULL DEFAULT 'assistant' CHECK (entry_source IN ('assistant', 'doctor', 'legacy')),
  clinical_effective_at      TEXT,
  created_at                 TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at                 TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_initial_assessments_tenant_visit
  ON visit_initial_assessments(tenant_id, visit_id);

CREATE TABLE IF NOT EXISTS clinical_record_versions (
  id                    TEXT PRIMARY KEY,
  tenant_id             TEXT NOT NULL REFERENCES tenants(id),
  visit_id              TEXT NOT NULL REFERENCES visits(id),
  version_no            INTEGER NOT NULL CHECK (version_no >= 1),
  record_type           TEXT NOT NULL CHECK (record_type IN ('signed_record', 'amendment')),
  canonical_json        TEXT NOT NULL,
  sha256                TEXT NOT NULL CHECK (length(sha256) = 64),
  reason                TEXT,
  created_by            TEXT NOT NULL REFERENCES users(id),
  created_at            TEXT NOT NULL DEFAULT (datetime('now')),
  supersedes_version_id TEXT REFERENCES clinical_record_versions(id),
  archive_file_id       TEXT REFERENCES file_objects(id),
  UNIQUE(visit_id, version_no)
);
CREATE INDEX IF NOT EXISTS idx_clinical_record_versions_tenant_visit
  ON clinical_record_versions(tenant_id, visit_id, version_no DESC);

CREATE TABLE IF NOT EXISTS clinical_record_amendments (
  id                     TEXT PRIMARY KEY,
  tenant_id              TEXT NOT NULL REFERENCES tenants(id),
  visit_id               TEXT NOT NULL REFERENCES visits(id),
  base_version_id        TEXT NOT NULL REFERENCES clinical_record_versions(id),
  proposed_version_id    TEXT NOT NULL UNIQUE REFERENCES clinical_record_versions(id),
  reason                 TEXT NOT NULL,
  before_json            TEXT NOT NULL,
  after_json             TEXT NOT NULL,
  created_by             TEXT NOT NULL REFERENCES users(id),
  confirmed_by           TEXT REFERENCES users(id),
  confirmed_at           TEXT,
  created_at             TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_clinical_amendments_tenant_visit
  ON clinical_record_amendments(tenant_id, visit_id, created_at DESC);

ALTER TABLE treatment_plans ADD COLUMN approved_by TEXT REFERENCES users(id);
ALTER TABLE treatment_plans ADD COLUMN current_version_no INTEGER NOT NULL DEFAULT 0;
ALTER TABLE treatment_plans ADD COLUMN clinical_approved_version_id TEXT;
ALTER TABLE treatment_plans ADD COLUMN legacy_at TEXT;
UPDATE treatment_plans
SET legacy_at = datetime('now')
WHERE status IN ('approved', 'completed') AND legacy_at IS NULL;

CREATE TABLE IF NOT EXISTS treatment_plan_versions (
  id                  TEXT PRIMARY KEY,
  tenant_id           TEXT NOT NULL REFERENCES tenants(id),
  treatment_plan_id   TEXT NOT NULL REFERENCES treatment_plans(id),
  version_no          INTEGER NOT NULL CHECK (version_no >= 1),
  state               TEXT NOT NULL CHECK (state IN ('draft', 'clinically_approved', 'superseded', 'cancelled')),
  snapshot_json       TEXT NOT NULL,
  sha256              TEXT NOT NULL CHECK (length(sha256) = 64),
  created_by          TEXT NOT NULL REFERENCES users(id),
  approved_by         TEXT REFERENCES users(id),
  approved_at         TEXT,
  archive_file_id     TEXT REFERENCES file_objects(id),
  template_version    TEXT,
  created_at          TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(treatment_plan_id, version_no)
);
CREATE INDEX IF NOT EXISTS idx_plan_versions_tenant_plan
  ON treatment_plan_versions(tenant_id, treatment_plan_id, version_no DESC);
CREATE INDEX IF NOT EXISTS idx_plan_versions_tenant_state
  ON treatment_plan_versions(tenant_id, state, approved_at DESC);

CREATE TABLE IF NOT EXISTS legal_representatives (
  id                       TEXT PRIMARY KEY,
  tenant_id                TEXT NOT NULL REFERENCES tenants(id),
  patient_id               TEXT NOT NULL REFERENCES patients(id),
  name                     TEXT NOT NULL,
  relationship             TEXT NOT NULL,
  identity_document_type   TEXT,
  identity_document_cipher TEXT,
  identity_document_masked TEXT,
  verification_metadata    TEXT,
  verified_by              TEXT REFERENCES users(id),
  verified_at              TEXT,
  active_at                TEXT NOT NULL DEFAULT (datetime('now')),
  inactive_at              TEXT,
  created_at               TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at               TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_legal_representatives_tenant_patient
  ON legal_representatives(tenant_id, patient_id, inactive_at);

CREATE TABLE IF NOT EXISTS consent_templates (
  id             TEXT PRIMARY KEY,
  tenant_id      TEXT NOT NULL REFERENCES tenants(id),
  version_no     INTEGER NOT NULL CHECK (version_no >= 1),
  scope          TEXT NOT NULL CHECK (scope IN ('treatment_plan', 'procedure')),
  language       TEXT NOT NULL DEFAULT 'vi',
  title          TEXT NOT NULL,
  content        TEXT NOT NULL,
  content_hash   TEXT NOT NULL CHECK (length(content_hash) = 64),
  effective_from TEXT NOT NULL,
  effective_to   TEXT,
  is_active      INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  created_by     TEXT NOT NULL REFERENCES users(id),
  created_at     TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(tenant_id, scope, version_no)
);
CREATE INDEX IF NOT EXISTS idx_consent_templates_tenant_scope_active
  ON consent_templates(tenant_id, scope, is_active, effective_from DESC);

CREATE TABLE IF NOT EXISTS high_risk_procedure_rules (
  id                  TEXT PRIMARY KEY,
  tenant_id           TEXT NOT NULL REFERENCES tenants(id),
  service_code        TEXT,
  procedure           TEXT,
  category            TEXT,
  consent_template_id TEXT NOT NULL REFERENCES consent_templates(id),
  requirement_level   TEXT NOT NULL DEFAULT 'required' CHECK (requirement_level IN ('required', 'recommended')),
  effective_from      TEXT NOT NULL,
  effective_to        TEXT,
  is_active           INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  created_by          TEXT NOT NULL REFERENCES users(id),
  created_at          TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_high_risk_rules_tenant_active
  ON high_risk_procedure_rules(tenant_id, is_active, effective_from DESC);

CREATE TABLE IF NOT EXISTS consent_records (
  id                        TEXT PRIMARY KEY,
  tenant_id                 TEXT NOT NULL REFERENCES tenants(id),
  patient_id                TEXT NOT NULL REFERENCES patients(id),
  legal_representative_id   TEXT REFERENCES legal_representatives(id),
  plan_version_id           TEXT REFERENCES treatment_plan_versions(id),
  treatment_plan_item_id    TEXT REFERENCES treatment_plan_items(id),
  consent_template_id       TEXT NOT NULL REFERENCES consent_templates(id),
  status                    TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'signed', 'withdrawn', 'superseded')),
  signature_file_id         TEXT REFERENCES file_objects(id),
  rendered_document_file_id TEXT REFERENCES file_objects(id),
  signer_name               TEXT,
  signer_relationship       TEXT,
  witnessed_by              TEXT REFERENCES users(id),
  signed_at                 TEXT,
  device_metadata_json      TEXT,
  content_hash              TEXT CHECK (content_hash IS NULL OR length(content_hash) = 64),
  withdrawal_reason         TEXT,
  withdrawn_by              TEXT REFERENCES users(id),
  withdrawn_at              TEXT,
  created_by                TEXT NOT NULL REFERENCES users(id),
  created_at                TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at                TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_consent_records_tenant_plan_version
  ON consent_records(tenant_id, plan_version_id, status, signed_at DESC);
CREATE INDEX IF NOT EXISTS idx_consent_records_tenant_patient
  ON consent_records(tenant_id, patient_id, status, signed_at DESC);

ALTER TABLE treatment_cases ADD COLUMN treatment_plan_version_id TEXT REFERENCES treatment_plan_versions(id);

CREATE TABLE IF NOT EXISTS clinical_evidence_events (
  id            TEXT PRIMARY KEY,
  tenant_id     TEXT NOT NULL REFERENCES tenants(id),
  actor_user_id TEXT NOT NULL REFERENCES users(id),
  event_type    TEXT NOT NULL CHECK (event_type IN ('visit_signed', 'visit_amended', 'plan_approved', 'consent_signed', 'consent_withdrawn', 'case_activated', 'audit_exported')),
  entity_type   TEXT NOT NULL,
  entity_id     TEXT NOT NULL,
  metadata_json TEXT NOT NULL,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_clinical_evidence_events_tenant_entity
  ON clinical_evidence_events(tenant_id, entity_type, entity_id, created_at DESC);
