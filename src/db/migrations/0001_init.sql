-- Migration 0001 — Core auth tables.
--
-- Phase 1 goal: prove the migration pipeline works end-to-end.
-- Clinical tables (patients, visits, findings, plans, payments) come in Phase 2.
--
-- Architecture rules baked in here:
--   - Every clinical table carries tenant_id (rule #3)
--   - audit_logs is created early so middleware can write from day 1 (rule #4)

PRAGMA foreign_keys = ON;

-- ──────────────── Tenant (root isolation unit) ────────────────
CREATE TABLE IF NOT EXISTS tenants (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ──────────────── Branch (sub-unit under tenant) ────────────────
CREATE TABLE IF NOT EXISTS branches (
  id          TEXT PRIMARY KEY,
  tenant_id   TEXT NOT NULL REFERENCES tenants(id),
  name        TEXT NOT NULL,
  address     TEXT NOT NULL DEFAULT '',
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_branches_tenant ON branches(tenant_id);

-- ──────────────── Role (RBAC) ────────────────
CREATE TABLE IF NOT EXISTS roles (
  id           TEXT PRIMARY KEY,
  tenant_id    TEXT NOT NULL REFERENCES tenants(id),
  name         TEXT NOT NULL,
  -- permissions stored as JSON-encoded string array
  permissions  TEXT NOT NULL DEFAULT '[]',
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(tenant_id, name)
);

CREATE INDEX IF NOT EXISTS idx_roles_tenant ON roles(tenant_id);

-- ──────────────── User ────────────────
CREATE TABLE IF NOT EXISTS users (
  id              TEXT PRIMARY KEY,
  tenant_id       TEXT NOT NULL REFERENCES tenants(id),
  branch_id       TEXT NOT NULL REFERENCES branches(id),
  role_id         TEXT NOT NULL REFERENCES roles(id),
  email           TEXT NOT NULL UNIQUE,
  name            TEXT NOT NULL,
  password_hash   TEXT NOT NULL,
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_users_tenant ON users(tenant_id);
CREATE INDEX IF NOT EXISTS idx_users_branch ON users(branch_id);
CREATE INDEX IF NOT EXISTS idx_users_role   ON users(role_id);

-- ──────────────── Audit log (rule #4 — every clinical action writes here) ────────────────
CREATE TABLE IF NOT EXISTS audit_logs (
  id           TEXT PRIMARY KEY,
  tenant_id    TEXT NOT NULL REFERENCES tenants(id),
  user_id      TEXT NOT NULL REFERENCES users(id),
  action       TEXT NOT NULL,
  entity_type  TEXT NOT NULL,
  entity_id    TEXT NOT NULL,
  details      TEXT,
  ip_address   TEXT NOT NULL DEFAULT '',
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_audit_tenant_entity ON audit_logs(tenant_id, entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_user ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs(created_at);

-- ──────────────── Lark sync log (placeholder for Phase 4) ────────────────
CREATE TABLE IF NOT EXISTS lark_sync_logs (
  id             TEXT PRIMARY KEY,
  tenant_id      TEXT NOT NULL REFERENCES tenants(id),
  entity_type    TEXT NOT NULL,
  entity_id      TEXT NOT NULL,
  lark_event_id  TEXT,
  status         TEXT NOT NULL DEFAULT 'pending',
  error          TEXT,
  created_at     TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_lark_tenant ON lark_sync_logs(tenant_id);
CREATE INDEX IF NOT EXISTS idx_lark_status ON lark_sync_logs(status);