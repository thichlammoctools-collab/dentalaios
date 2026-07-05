-- Migration 0004 — SaaS Registration
--
-- Adds:
--   - email_verification_tokens: token-based email verification
--   - invite_tokens: admin can invite new members to existing tenant
--   - tenant.slug: URL-safe unique identifier for invite links
--   - tenants.is_active: suspend tenants without deleting data
--   - users.is_active: soft-disable users without deleting records

PRAGMA foreign_keys = ON;

-- ──────────────── Tenant enhancements ────────────────
ALTER TABLE tenants ADD COLUMN slug TEXT UNIQUE;
ALTER TABLE tenants ADD COLUMN is_active INTEGER NOT NULL DEFAULT 1;

-- ──────────────── User enhancements ────────────────
ALTER TABLE users ADD COLUMN is_active INTEGER NOT NULL DEFAULT 1;

-- ──────────────── Email verification tokens ────────────────
-- Used for: new user registration email verification
CREATE TABLE IF NOT EXISTS email_verification_tokens (
  id          TEXT PRIMARY KEY,
  token       TEXT NOT NULL UNIQUE,
  user_id     TEXT NOT NULL REFERENCES users(id),
  tenant_id   TEXT NOT NULL REFERENCES tenants(id),
  email       TEXT NOT NULL,
  expires_at  TEXT NOT NULL,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_evt_token    ON email_verification_tokens(token);
CREATE INDEX IF NOT EXISTS idx_evt_user    ON email_verification_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_evt_expires ON email_verification_tokens(expires_at);

-- ──────────────── Invite tokens ────────────────
-- Used for: admin invites a new member to their tenant
CREATE TABLE IF NOT EXISTS invite_tokens (
  id          TEXT PRIMARY KEY,
  token       TEXT NOT NULL UNIQUE,
  tenant_id   TEXT NOT NULL REFERENCES tenants(id),
  inviter_id  TEXT NOT NULL REFERENCES users(id),
  email       TEXT NOT NULL,
  role_id     TEXT NOT NULL REFERENCES roles(id),
  branch_id   TEXT NOT NULL REFERENCES branches(id),
  expires_at  TEXT NOT NULL,
  accepted_at TEXT,
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_invite_token   ON invite_tokens(token);
CREATE INDEX IF NOT EXISTS idx_invite_tenant  ON invite_tokens(tenant_id);
CREATE INDEX IF NOT EXISTS idx_invite_expires ON invite_tokens(expires_at);
