-- Migration 0065 — Clinical Pathway Assessments (V1: endodontic pain).
--
-- Additive only: no backfill, no existing record changes.
-- Architecture rule #3: every clinical table carries tenant_id.

PRAGMA foreign_keys = ON;

-- ──────────────── Pathway assessments ────────────────
CREATE TABLE IF NOT EXISTS clinical_pathway_assessments (
  id                TEXT PRIMARY KEY,
  tenant_id         TEXT NOT NULL REFERENCES tenants(id),
  visit_id          TEXT NOT NULL REFERENCES visits(id),
  tooth_number      INTEGER NOT NULL,
  pathway_key       TEXT NOT NULL DEFAULT 'endodontic_pain',
  pathway_version   TEXT NOT NULL,
  status            TEXT NOT NULL DEFAULT 'active'
                      CHECK (status IN ('active', 'completed', 'closed_with_exceptions')),
  assessment_json   TEXT NOT NULL DEFAULT '{}',
  entry_source      TEXT NOT NULL DEFAULT 'doctor'
                      CHECK (entry_source IN ('assistant', 'doctor')),
  entered_by        TEXT NOT NULL REFERENCES users(id),
  clinical_effective_at TEXT,
  reviewed_by       TEXT REFERENCES users(id),
  reviewed_at       TEXT,
  closed_by         TEXT REFERENCES users(id),
  closed_at         TEXT,
  close_note        TEXT,
  current_revision  INTEGER NOT NULL DEFAULT 0,
  created_at        TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at        TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_pathway_assessments_tenant_visit
  ON clinical_pathway_assessments(tenant_id, visit_id, pathway_key, status);
CREATE INDEX IF NOT EXISTS idx_pathway_assessments_tenant_tooth
  ON clinical_pathway_assessments(tenant_id, visit_id, tooth_number);

-- ──────────────── Pathway assessment items ────────────────
CREATE TABLE IF NOT EXISTS clinical_pathway_assessment_items (
  id              TEXT PRIMARY KEY,
  tenant_id       TEXT NOT NULL REFERENCES tenants(id),
  assessment_id   TEXT NOT NULL REFERENCES clinical_pathway_assessments(id) ON DELETE CASCADE,
  item_key        TEXT NOT NULL,
  item_version    INTEGER NOT NULL DEFAULT 1,
  status          TEXT NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'completed', 'skipped')),
  value_json      TEXT,
  skip_reason     TEXT,
  completed_by    TEXT REFERENCES users(id),
  completed_at    TEXT,
  updated_at      TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(assessment_id, item_key, item_version)
);

CREATE INDEX IF NOT EXISTS idx_pathway_items_tenant_assessment
  ON clinical_pathway_assessment_items(tenant_id, assessment_id, status);

-- ──────────────── Pathway assessment revisions ────────────────
CREATE TABLE IF NOT EXISTS clinical_pathway_assessment_revisions (
  id              TEXT PRIMARY KEY,
  tenant_id       TEXT NOT NULL REFERENCES tenants(id),
  assessment_id   TEXT NOT NULL REFERENCES clinical_pathway_assessments(id) ON DELETE CASCADE,
  revision_no     INTEGER NOT NULL,
  before_json     TEXT NOT NULL,
  after_json      TEXT NOT NULL,
  change_reason   TEXT NOT NULL,
  changed_by      TEXT NOT NULL REFERENCES users(id),
  changed_at      TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(assessment_id, revision_no)
);

CREATE INDEX IF NOT EXISTS idx_pathway_revisions_tenant_assessment
  ON clinical_pathway_assessment_revisions(tenant_id, assessment_id, revision_no DESC);

-- ──────────────── Extend review event entity_type for pathway_assessment ────────────────
-- SQLite does not allow altering CHECK constraints; new writes use the
-- application layer to enforce the expanded enum. The column already
-- accepts arbitrary TEXT, so existing rows are unaffected. No DDL change needed.

-- ──────────────── Seed feature flag ────────────────
INSERT OR IGNORE INTO platform_feature_flags (key, description, default_enabled)
VALUES ('clinical_copilot.endodontic_pain_v1', 'Clinical Copilot V1 —疼痛/内牙 pathway checklist và pattern engine', 0);
