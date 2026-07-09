-- Migration 0009 — Per-tenant Lark configuration.
--
-- Each clinic (tenant) can now configure their own Lark app credentials,
-- so they sync treatment-plan handovers to their own Lark workspace.
--
-- app_secret is stored encrypted at rest (AES-256-GCM); the key lives
-- in the ENCRYPTION_KEY Worker secret. app_secret_iv stores the per-row
-- initialization vector used for decryption.
--
-- UNIQUE(tenant_id) enforces one config per clinic.

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS lark_configs (
  id             TEXT PRIMARY KEY,
  tenant_id      TEXT NOT NULL REFERENCES tenants(id) UNIQUE,
  app_id         TEXT NOT NULL,
  app_secret     TEXT NOT NULL,   -- AES-256-GCM ciphertext (base64)
  app_secret_iv  TEXT NOT NULL,   -- base64 IV
  calendar_id    TEXT,            -- optional, defaults to "primary" at use time
  enabled        INTEGER NOT NULL DEFAULT 1,
  created_at     TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at     TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_lark_config_tenant ON lark_configs(tenant_id);