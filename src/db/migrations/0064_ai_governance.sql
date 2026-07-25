ALTER TABLE ai_model_metrics ADD COLUMN input_tokens INTEGER NOT NULL DEFAULT 0;
ALTER TABLE ai_model_metrics ADD COLUMN output_tokens INTEGER NOT NULL DEFAULT 0;
ALTER TABLE ai_model_metrics ADD COLUMN cost_microusd INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS ai_model_circuits (
  use_case TEXT NOT NULL,
  model_id TEXT NOT NULL,
  consecutive_failures INTEGER NOT NULL DEFAULT 0,
  opened_until TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (use_case, model_id)
);

CREATE TABLE IF NOT EXISTS platform_ai_model_rollouts (
  use_case TEXT PRIMARY KEY,
  candidate_model_id TEXT NOT NULL,
  traffic_percent INTEGER NOT NULL CHECK (traffic_percent BETWEEN 0 AND 100),
  status TEXT NOT NULL CHECK (status IN ('draft', 'pending_approval', 'approved', 'active', 'paused')),
  requested_by TEXT REFERENCES platform_users(id),
  approved_by TEXT REFERENCES platform_users(id),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS platform_ai_benchmark_cases (
  id TEXT PRIMARY KEY,
  use_case TEXT NOT NULL,
  label TEXT NOT NULL,
  prompt TEXT NOT NULL,
  expected_output TEXT NOT NULL,
  is_deidentified INTEGER NOT NULL CHECK (is_deidentified = 1),
  created_by TEXT NOT NULL REFERENCES platform_users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS platform_ai_benchmark_evaluations (
  id TEXT PRIMARY KEY,
  case_id TEXT NOT NULL REFERENCES platform_ai_benchmark_cases(id),
  model_id TEXT NOT NULL,
  output TEXT NOT NULL,
  json_valid INTEGER NOT NULL CHECK (json_valid IN (0, 1)),
  reviewer_score INTEGER CHECK (reviewer_score BETWEEN 0 AND 5),
  reviewer_note TEXT,
  reviewed_by TEXT REFERENCES platform_users(id),
  reviewed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

UPDATE platform_roles SET permissions = '["platform_dashboard.read","platform_tenants.read","platform_tenants.write","platform_content.read","platform_content.write","platform_config.read","platform_config.write","platform_admins.read","platform_admins.write","platform_procedures.read","platform_procedures.write","platform_ai_config.read","platform_ai_config.write","platform_ai_evaluate.write","platform_ai_approve.write","platform_audit.read"]' WHERE key = 'platform_owner';
UPDATE platform_roles SET permissions = '["platform_dashboard.read","platform_tenants.read","platform_tenants.write","platform_content.read","platform_content.write","platform_config.read","platform_config.write","platform_procedures.read","platform_procedures.write","platform_ai_config.read","platform_ai_config.write","platform_ai_evaluate.write","platform_audit.read"]' WHERE key = 'platform_operator';
