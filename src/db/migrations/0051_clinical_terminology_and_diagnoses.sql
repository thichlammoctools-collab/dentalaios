-- Versioned clinical terminology, approved ICD-10 Vietnam imports, and visit diagnoses.
-- ICD-10 rows are intentionally not seeded here: they must originate from an
-- approved official artifact with provenance recorded in clinical_terminology_versions.

CREATE TABLE IF NOT EXISTS clinical_terminology_versions (
  id               TEXT PRIMARY KEY,
  system           TEXT NOT NULL CHECK (system IN ('LOCAL', 'ICD10_VN')),
  version_key      TEXT NOT NULL,
  title            TEXT NOT NULL,
  publisher        TEXT,
  published_at     TEXT,
  source_url       TEXT,
  source_file_name TEXT,
  source_sha256    TEXT,
  status           TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'approved', 'retired')),
  approved_by      TEXT REFERENCES platform_users(id),
  approved_at      TEXT,
  created_at       TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at       TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (system, version_key),
  CHECK (
    system = 'LOCAL' OR (
      source_file_name IS NOT NULL AND source_sha256 IS NOT NULL AND publisher IS NOT NULL
    )
  )
);

CREATE INDEX IF NOT EXISTS idx_terminology_versions_system_status
  ON clinical_terminology_versions(system, status);

CREATE TABLE IF NOT EXISTS clinical_concepts (
  id                      TEXT PRIMARY KEY,
  code                    TEXT NOT NULL UNIQUE,
  legacy_condition        TEXT NOT NULL,
  kind                    TEXT NOT NULL CHECK (kind IN ('diagnosis', 'observation', 'symptom', 'risk', 'preventive')),
  category                TEXT NOT NULL CHECK (category IN ('tooth_hard_tissue', 'periodontal', 'oral_soft_tissue', 'occlusion_orthodontics', 'tmj_function', 'preventive_general')),
  default_scope           TEXT NOT NULL CHECK (default_scope IN ('tooth', 'region', 'full_mouth')),
  default_anatomical_site TEXT,
  display_vi              TEXT NOT NULL,
  description_vi          TEXT,
  is_active               INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  sort_order              INTEGER NOT NULL DEFAULT 0,
  created_at              TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at              TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (category, default_scope, legacy_condition)
);

CREATE INDEX IF NOT EXISTS idx_clinical_concepts_active_category
  ON clinical_concepts(is_active, category, default_scope, sort_order, display_vi);

CREATE TABLE IF NOT EXISTS clinical_concept_versions (
  id                     TEXT PRIMARY KEY,
  concept_id             TEXT NOT NULL REFERENCES clinical_concepts(id),
  terminology_version_id TEXT NOT NULL REFERENCES clinical_terminology_versions(id),
  display_vi             TEXT NOT NULL,
  description_vi         TEXT,
  status                 TEXT NOT NULL DEFAULT 'approved' CHECK (status IN ('draft', 'approved', 'retired')),
  effective_from         TEXT NOT NULL DEFAULT (datetime('now')),
  effective_to           TEXT,
  created_at             TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (concept_id, terminology_version_id)
);

CREATE INDEX IF NOT EXISTS idx_concept_versions_concept_status
  ON clinical_concept_versions(concept_id, status);

CREATE TABLE IF NOT EXISTS icd10_codes (
  id                     TEXT PRIMARY KEY,
  terminology_version_id TEXT NOT NULL REFERENCES clinical_terminology_versions(id),
  code                   TEXT NOT NULL,
  display_vi             TEXT NOT NULL,
  parent_code            TEXT,
  is_billable            INTEGER NOT NULL DEFAULT 1 CHECK (is_billable IN (0, 1)),
  is_active              INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  sort_order             INTEGER NOT NULL DEFAULT 0,
  created_at             TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (terminology_version_id, code)
);

CREATE INDEX IF NOT EXISTS idx_icd10_codes_version_code
  ON icd10_codes(terminology_version_id, code);
CREATE INDEX IF NOT EXISTS idx_icd10_codes_version_display
  ON icd10_codes(terminology_version_id, display_vi);

CREATE TABLE IF NOT EXISTS clinical_concept_icd10_mappings (
  id                 TEXT PRIMARY KEY,
  concept_version_id TEXT NOT NULL REFERENCES clinical_concept_versions(id),
  icd10_code_id      TEXT NOT NULL REFERENCES icd10_codes(id),
  mapping_role       TEXT NOT NULL DEFAULT 'primary' CHECK (mapping_role IN ('primary', 'alternative')),
  is_active          INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  created_at         TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (concept_version_id, icd10_code_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_concept_icd10_one_primary
  ON clinical_concept_icd10_mappings(concept_version_id)
  WHERE mapping_role = 'primary' AND is_active = 1;

ALTER TABLE clinical_findings ADD COLUMN concept_id TEXT REFERENCES clinical_concepts(id);
CREATE INDEX IF NOT EXISTS idx_findings_tenant_visit_concept
  ON clinical_findings(tenant_id, visit_id, concept_id);

CREATE TABLE IF NOT EXISTS clinical_diagnoses (
  id                          TEXT PRIMARY KEY,
  tenant_id                   TEXT NOT NULL REFERENCES tenants(id),
  visit_id                    TEXT NOT NULL REFERENCES visits(id) ON DELETE CASCADE,
  patient_id                  TEXT NOT NULL REFERENCES patients(id),
  source_finding_id           TEXT REFERENCES clinical_findings(id),
  concept_id                  TEXT NOT NULL REFERENCES clinical_concepts(id),
  concept_version_id          TEXT NOT NULL REFERENCES clinical_concept_versions(id),
  status                      TEXT NOT NULL CHECK (status IN ('suspected', 'confirmed', 'ruled_out', 'resolved')),
  icd10_code_id               TEXT REFERENCES icd10_codes(id),
  icd10_version_id            TEXT REFERENCES clinical_terminology_versions(id),
  icd10_code_snapshot         TEXT,
  icd10_display_vi_snapshot   TEXT,
  concept_code_snapshot       TEXT NOT NULL,
  concept_display_vi_snapshot TEXT NOT NULL,
  mapping_id                  TEXT REFERENCES clinical_concept_icd10_mappings(id),
  mapping_role                TEXT CHECK (mapping_role IN ('primary', 'alternative')),
  source                      TEXT NOT NULL CHECK (source IN ('manual', 'finding_confirmed', 'voice_suggestion', 'image_suggestion', 'backfill')),
  source_text                 TEXT,
  confirmed_by                TEXT REFERENCES users(id),
  confirmed_at                TEXT,
  ruled_out_at                TEXT,
  resolved_at                 TEXT,
  notes                       TEXT,
  created_by                  TEXT NOT NULL REFERENCES users(id),
  created_at                  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at                  TEXT NOT NULL DEFAULT (datetime('now')),
  current_revision            INTEGER NOT NULL DEFAULT 1,
  CHECK ((status != 'confirmed') OR (icd10_code_snapshot IS NOT NULL AND icd10_display_vi_snapshot IS NOT NULL AND confirmed_by IS NOT NULL AND confirmed_at IS NOT NULL)),
  CHECK ((status != 'ruled_out') OR ruled_out_at IS NOT NULL),
  CHECK ((status != 'resolved') OR resolved_at IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_diagnoses_tenant_visit ON clinical_diagnoses(tenant_id, visit_id);
CREATE INDEX IF NOT EXISTS idx_diagnoses_tenant_patient_status ON clinical_diagnoses(tenant_id, patient_id, status);
CREATE INDEX IF NOT EXISTS idx_diagnoses_tenant_icd_status ON clinical_diagnoses(tenant_id, icd10_code_snapshot, status);
CREATE INDEX IF NOT EXISTS idx_diagnoses_tenant_source_finding ON clinical_diagnoses(tenant_id, source_finding_id);

CREATE TABLE IF NOT EXISTS clinical_diagnosis_revisions (
  id            TEXT PRIMARY KEY,
  tenant_id     TEXT NOT NULL REFERENCES tenants(id),
  diagnosis_id  TEXT NOT NULL REFERENCES clinical_diagnoses(id) ON DELETE CASCADE,
  revision_no   INTEGER NOT NULL,
  change_reason TEXT NOT NULL,
  before_json   TEXT NOT NULL,
  after_json    TEXT NOT NULL,
  changed_by    TEXT NOT NULL REFERENCES users(id),
  changed_at    TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (diagnosis_id, revision_no)
);

CREATE INDEX IF NOT EXISTS idx_diagnosis_revisions_tenant_diagnosis
  ON clinical_diagnosis_revisions(tenant_id, diagnosis_id, revision_no DESC);

-- The source catalog keeps the existing finding keys stable during the transition.
INSERT OR IGNORE INTO clinical_terminology_versions
  (id, system, version_key, title, publisher, status, approved_at)
VALUES
  ('term-local-v1', 'LOCAL', 'dentalaios-local-v1', 'Danh mục thuật ngữ nha khoa nội bộ v1', 'Dental Empire OS', 'approved', datetime('now'));

INSERT OR IGNORE INTO clinical_concepts
  (id, code, legacy_condition, kind, category, default_scope, default_anatomical_site, display_vi, sort_order)
VALUES
  ('concept-caries', 'dental.caries', 'caries', 'diagnosis', 'tooth_hard_tissue', 'tooth', NULL, 'Sâu răng', 10),
  ('concept-impacted', 'dental.impacted_tooth', 'impacted', 'diagnosis', 'tooth_hard_tissue', 'tooth', NULL, 'Răng mọc ngầm', 20),
  ('concept-pulpitis', 'dental.pulpitis', 'pulpitis', 'diagnosis', 'tooth_hard_tissue', 'tooth', NULL, 'Viêm tủy', 30),
  ('concept-periapical', 'dental.periapical_disease', 'periapical', 'diagnosis', 'tooth_hard_tissue', 'tooth', NULL, 'Viêm quanh chóp', 40),
  ('concept-fracture', 'dental.tooth_fracture', 'fracture', 'diagnosis', 'tooth_hard_tissue', 'tooth', NULL, 'Gãy/vỡ răng', 50),
  ('concept-gingivitis', 'periodontal.gingivitis', 'gingivitis', 'diagnosis', 'periodontal', 'tooth', 'gum', 'Viêm nướu', 60),
  ('concept-periodontitis', 'periodontal.periodontitis', 'periodontitis', 'diagnosis', 'periodontal', 'tooth', 'gum', 'Viêm nha chu', 70),
  ('concept-periodontal-abscess', 'periodontal.abscess', 'abscess', 'diagnosis', 'periodontal', 'region', 'gum', 'Áp xe nha chu', 80),
  ('concept-ulcer', 'oral.ulcer', 'ulcer', 'diagnosis', 'oral_soft_tissue', 'region', NULL, 'Loét miệng', 90),
  ('concept-leukoplakia', 'oral.leukoplakia', 'leukoplakia', 'diagnosis', 'oral_soft_tissue', 'region', NULL, 'Bạch sản', 100),
  ('concept-candidiasis', 'oral.candidiasis', 'candidiasis', 'diagnosis', 'oral_soft_tissue', 'region', NULL, 'Nấm miệng', 110),
  ('concept-malocclusion', 'orthodontics.malocclusion', 'deep_bite', 'diagnosis', 'occlusion_orthodontics', 'full_mouth', NULL, 'Sai khớp cắn', 120),
  ('concept-tmd-pain', 'tmj.tmd_pain', 'tmd_pain', 'diagnosis', 'tmj_function', 'region', 'tmj', 'Đau rối loạn khớp thái dương hàm', 130),
  ('concept-good', 'dental.sound_tooth', 'good', 'observation', 'tooth_hard_tissue', 'tooth', NULL, 'Tốt', 200),
  ('concept-calculus', 'periodontal.calculus', 'calculus', 'observation', 'periodontal', 'tooth', 'gum', 'Vôi răng', 210),
  ('concept-plaque', 'periodontal.plaque', 'plaque', 'observation', 'periodontal', 'tooth', 'gum', 'Mảng bám', 220),
  ('concept-wear', 'dental.wear', 'wear', 'observation', 'tooth_hard_tissue', 'tooth', NULL, 'Mòn răng', 230),
  ('concept-caries-risk', 'preventive.caries_risk', 'caries_risk', 'risk', 'preventive_general', 'full_mouth', NULL, 'Nguy cơ sâu răng', 240),
  ('concept-fluoride', 'preventive.fluoride', 'fluoride', 'preventive', 'preventive_general', 'full_mouth', NULL, 'Fluoride dự phòng', 250),
  ('concept-hygiene', 'preventive.oral_hygiene_instruction', 'oral_hygiene_instruction', 'preventive', 'preventive_general', 'full_mouth', NULL, 'Hướng dẫn vệ sinh', 260);

INSERT OR IGNORE INTO clinical_concept_versions
  (id, concept_id, terminology_version_id, display_vi, description_vi, status)
SELECT 'concept-version-' || id, id, 'term-local-v1', display_vi, description_vi, 'approved'
FROM clinical_concepts;
