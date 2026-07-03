-- Seed 0001 — Roles + minimal demo data for development.
--
-- Run after migration:
--   wrangler d1 execute dentalaios-db --local  --file=../../src/db/seeds/0001_roles.sql
--   wrangler d1 execute dentalaios-db --remote --file=../../src/db/seeds/0001_roles.sql
--
-- Demo password for ALL 4 users: "password123"
-- Hash was generated via: npx tsx scripts/generate-seed-hashes.ts "password123"
-- Replace it in production; never commit real user credentials.

-- ──────────────── Demo tenant ────────────────
INSERT OR IGNORE INTO tenants (id, name) VALUES
  ('tenant-demo', 'Demo Clinic');

-- ──────────────── Demo branch ────────────────
INSERT OR IGNORE INTO branches (id, tenant_id, name, address) VALUES
  ('branch-main', 'tenant-demo', 'Main Branch', '123 Demo Street, HCMC');

-- ───���──────────── Roles (RBAC baseline) ────────────────
INSERT OR IGNORE INTO roles (id, tenant_id, name, permissions) VALUES
  ('role-admin',        'tenant-demo', 'admin',        '["all"]'),
  ('role-doctor',       'tenant-demo', 'doctor',       '["read_patients","write_findings","write_plans","approve_plans"]'),
  ('role-assistant',    'tenant-demo', 'assistant',    '["read_patients","write_visits"]'),
  ('role-receptionist', 'tenant-demo', 'receptionist', '["read_patients","write_payments","write_appointments"]');

-- ──────────────── Demo users (all share password "password123") ────────────────
INSERT OR IGNORE INTO users (id, tenant_id, branch_id, role_id, email, name, password_hash) VALUES
  ('user-admin-1',  'tenant-demo', 'branch-main', 'role-admin',        'admin@demo.clinic',    'Demo Admin',    '$2a$10$lYlzVZG3a3XCE3XmE4OvB.3mght4YpbrPrRXZ4SWh0kEnlOeOzMfW'),
  ('user-doctor-1', 'tenant-demo', 'branch-main', 'role-doctor',       'doctor@demo.clinic',   'Demo Doctor',   '$2a$10$lYlzVZG3a3XCE3XmE4OvB.3mght4YpbrPrRXZ4SWh0kEnlOeOzMfW'),
  ('user-asst-1',   'tenant-demo', 'branch-main', 'role-assistant',    'asst@demo.clinic',     'Demo Assistant','$2a$10$lYlzVZG3a3XCE3XmE4OvB.3mght4YpbrPrRXZ4SWh0kEnlOeOzMfW'),
  ('user-recp-1',   'tenant-demo', 'branch-main', 'role-receptionist', 'recp@demo.clinic',     'Demo Reception','$2a$10$lYlzVZG3a3XCE3XmE4OvB.3mght4YpbrPrRXZ4SWh0kEnlOeOzMfW');