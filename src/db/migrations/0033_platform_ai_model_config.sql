-- Model selection is control-plane metadata only. Provider credentials stay in
-- Cloudflare Worker bindings and are never exposed through Platform Control.
CREATE TABLE IF NOT EXISTS platform_ai_model_configs (
  application_key TEXT NOT NULL,
  use_case TEXT NOT NULL,
  model_id TEXT NOT NULL,
  is_enabled INTEGER NOT NULL DEFAULT 1 CHECK (is_enabled IN (0, 1)),
  updated_by TEXT NOT NULL REFERENCES platform_users(id),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (application_key, use_case)
);

CREATE INDEX IF NOT EXISTS idx_platform_ai_model_configs_updated
  ON platform_ai_model_configs(updated_at DESC);

UPDATE platform_roles
SET permissions = '["platform_dashboard.read","platform_tenants.read","platform_tenants.write","platform_content.read","platform_content.write","platform_config.read","platform_config.write","platform_admins.read","platform_admins.write","platform_procedures.read","platform_procedures.write","platform_ai_config.read","platform_ai_config.write","platform_audit.read"]'
WHERE key = 'platform_owner';

UPDATE platform_roles
SET permissions = '["platform_dashboard.read","platform_tenants.read","platform_tenants.write","platform_content.read","platform_content.write","platform_config.read","platform_config.write","platform_procedures.read","platform_procedures.write","platform_ai_config.read","platform_audit.read"]'
WHERE key = 'platform_operator';

UPDATE platform_roles
SET permissions = '["platform_dashboard.read","platform_tenants.read","platform_content.read","platform_config.read","platform_admins.read","platform_ai_config.read","platform_audit.read"]'
WHERE key = 'platform_auditor';
