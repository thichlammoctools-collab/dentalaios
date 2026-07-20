-- Preserve who completed a visit and when; needed for clinical and commission audit.
ALTER TABLE visits ADD COLUMN completed_at TEXT;
ALTER TABLE visits ADD COLUMN completed_by TEXT REFERENCES users(id);

CREATE INDEX IF NOT EXISTS idx_visits_tenant_completion
  ON visits(tenant_id, status, completed_at);
