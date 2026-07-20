-- Platform administration is deliberately isolated from tenant identities,
-- tenant roles, and tenant audit records.
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS platform_roles (
  id TEXT PRIMARY KEY,
  key TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  permissions TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT OR IGNORE INTO platform_roles (id, key, name, permissions) VALUES
  ('platform-role-owner', 'platform_owner', 'Platform owner', '["platform_dashboard.read","platform_tenants.read","platform_tenants.write","platform_content.read","platform_content.write","platform_config.read","platform_config.write","platform_admins.read","platform_admins.write","platform_audit.read"]'),
  ('platform-role-operator', 'platform_operator', 'Platform operator', '["platform_dashboard.read","platform_tenants.read","platform_tenants.write","platform_content.read","platform_content.write","platform_config.read","platform_config.write","platform_audit.read"]'),
  ('platform-role-auditor', 'platform_auditor', 'Platform auditor', '["platform_dashboard.read","platform_tenants.read","platform_content.read","platform_config.read","platform_admins.read","platform_audit.read"]');

