-- Seed 0001 — Roles + minimal demo data for development.
--
-- Run after migration:
--   wrangler d1 execute dentalaios-db --local  --file=../../src/db/seeds/0001_roles.sql
--   wrangler d1 execute dentalaios-db --remote --file=../../src/db/seeds/0001_roles.sql
--
-- NOTE: For real deployment, replace `tenant-1` with a real tenant ID
-- and password_hash with bcrypt-hashed values from the auth flow.

-- ──────────────── Demo tenant (Phase 1 only) ────────────────
INSERT OR IGNORE INTO tenants (id, name) VALUES
  ('tenant-demo', 'Demo Clinic');

-- ──────────────── Demo branch ────────────────
INSERT OR IGNORE INTO branches (id, tenant_id, name, address) VALUES
  ('branch-main', 'tenant-demo', 'Main Branch', '123 Demo Street, HCMC');

-- ──────────────── Roles (RBAC baseline) ────────────────
INSERT OR IGNORE INTO roles (id, tenant_id, name, permissions) VALUES
  ('role-admin',        'tenant-demo', 'admin',        '["all"]'),
  ('role-doctor',       'tenant-demo', 'doctor',       '["read_patients","write_findings","write_plans","approve_plans"]'),
  ('role-assistant',    'tenant-demo', 'assistant',    '["read_patients","write_visits"]'),
  ('role-receptionist', 'tenant-demo', 'receptionist', '["read_patients","write_payments","write_appointments"]');

-- ──────────────── Demo users (password_hash placeholder) ────────────────
-- Replace password_hash with bcrypt of "password123" in real auth flow (Phase 2).
INSERT OR IGNORE INTO users (id, tenant_id, branch_id, role_id, email, name, password_hash) VALUES
  ('user-admin-1',  'tenant-demo', 'branch-main', 'role-admin',        'admin@demo.clinic',    'Demo Admin',    'PLACEHOLDER_HASH'),
  ('user-doctor-1', 'tenant-demo', 'branch-main', 'role-doctor',       'doctor@demo.clinic',   'Demo Doctor',   'PLACEHOLDER_HASH'),
  ('user-asst-1',   'tenant-demo', 'branch-main', 'role-assistant',    'asst@demo.clinic',     'Demo Assistant','PLACEHOLDER_HASH'),
  ('user-recp-1',   'tenant-demo', 'branch-main', 'role-receptionist', 'recp@demo.clinic',     'Demo Reception','PLACEHOLDER_HASH');