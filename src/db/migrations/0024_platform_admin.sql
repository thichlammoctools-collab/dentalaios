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

CREATE TABLE IF NOT EXISTS platform_users (
  id TEXT PRIMARY KEY,
  role_id TEXT NOT NULL REFERENCES platform_roles(id),
  email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  mfa_secret_encrypted TEXT,
  mfa_enabled_at TEXT,
  last_login_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_platform_users_email ON platform_users(email);
CREATE INDEX IF NOT EXISTS idx_platform_users_role ON platform_users(role_id, is_active);

CREATE TABLE IF NOT EXISTS platform_sessions (
  id TEXT PRIMARY KEY,
  platform_user_id TEXT NOT NULL REFERENCES platform_users(id),
  issued_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  revoked_at TEXT,
  mfa_verified_at TEXT NOT NULL,
  ip_hash TEXT NOT NULL DEFAULT '',
  user_agent_hash TEXT NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_platform_sessions_active ON platform_sessions(platform_user_id, revoked_at, expires_at);

CREATE TABLE IF NOT EXISTS platform_mfa_recovery_codes (
  id TEXT PRIMARY KEY,
  platform_user_id TEXT NOT NULL REFERENCES platform_users(id),
  code_hash TEXT NOT NULL,
  used_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(platform_user_id, code_hash)
);

CREATE INDEX IF NOT EXISTS idx_platform_recovery_codes_active ON platform_mfa_recovery_codes(platform_user_id, used_at);

CREATE TABLE IF NOT EXISTS platform_audit_logs (
  id TEXT PRIMARY KEY,
  platform_user_id TEXT REFERENCES platform_users(id),
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  tenant_id TEXT REFERENCES tenants(id),
  result TEXT NOT NULL CHECK (result IN ('success', 'failure')),
  reason TEXT,
  request_id TEXT NOT NULL DEFAULT '',
  ip_hash TEXT NOT NULL DEFAULT '',
  user_agent_hash TEXT NOT NULL DEFAULT '',
  details TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_platform_audit_created ON platform_audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_platform_audit_user ON platform_audit_logs(platform_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_platform_audit_tenant ON platform_audit_logs(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_platform_audit_action ON platform_audit_logs(action, created_at DESC);

CREATE TABLE IF NOT EXISTS platform_feature_flags (
  key TEXT PRIMARY KEY,
  description TEXT NOT NULL,
  default_enabled INTEGER NOT NULL DEFAULT 0 CHECK (default_enabled IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS platform_tenant_feature_overrides (
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  flag_key TEXT NOT NULL REFERENCES platform_feature_flags(key),
  enabled INTEGER NOT NULL CHECK (enabled IN (0, 1)),
  updated_by TEXT NOT NULL REFERENCES platform_users(id),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (tenant_id, flag_key)
);

CREATE INDEX IF NOT EXISTS idx_platform_flag_overrides_tenant ON platform_tenant_feature_overrides(tenant_id);

CREATE TABLE IF NOT EXISTS platform_tenant_limits (
  tenant_id TEXT PRIMARY KEY REFERENCES tenants(id),
  max_users INTEGER NOT NULL DEFAULT 25 CHECK (max_users >= 0),
  max_branches INTEGER NOT NULL DEFAULT 3 CHECK (max_branches >= 0),
  storage_quota_bytes INTEGER NOT NULL DEFAULT 0 CHECK (storage_quota_bytes >= 0),
  updated_by TEXT NOT NULL REFERENCES platform_users(id),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS platform_content (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('announcement', 'help_article')),
  title TEXT NOT NULL,
  body_markdown TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('draft', 'scheduled', 'published', 'archived')),
  audience TEXT NOT NULL CHECK (audience IN ('global', 'tenant')),
  tenant_id TEXT REFERENCES tenants(id),
  publish_at TEXT,
  expire_at TEXT,
  created_by TEXT NOT NULL REFERENCES platform_users(id),
  updated_by TEXT NOT NULL REFERENCES platform_users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  CHECK ((audience = 'global' AND tenant_id IS NULL) OR (audience = 'tenant' AND tenant_id IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS idx_platform_content_publication ON platform_content(status, audience, tenant_id, publish_at);

CREATE TABLE IF NOT EXISTS platform_integration_status (
  provider TEXT NOT NULL,
  tenant_id TEXT REFERENCES tenants(id),
  enabled INTEGER NOT NULL DEFAULT 0 CHECK (enabled IN (0, 1)),
  health_status TEXT NOT NULL DEFAULT 'unknown' CHECK (health_status IN ('healthy', 'degraded', 'down', 'unknown')),
  last_checked_at TEXT,
  last_success_at TEXT,
  last_error_code TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (provider, tenant_id)
);

