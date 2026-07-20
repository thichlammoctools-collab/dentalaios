-- Migration 0018 — Fixed system role catalog.
--
-- Role permissions and classification are platform-owned. Clinics can customize
-- only the display name stored in `name`.

ALTER TABLE roles ADD COLUMN system_key TEXT;

UPDATE roles
SET system_key = CASE
  WHEN id = 'role-admin' OR lower(name) = 'admin' THEN 'admin'
  WHEN id = 'role-doctor' OR lower(name) IN ('doctor', 'bác sĩ') THEN 'doctor'
  WHEN id = 'role-assistant' OR lower(name) IN ('assistant', 'phụ tá', 'trợ lý') THEN 'assistant'
  WHEN id = 'role-receptionist' OR lower(name) IN ('receptionist', 'lễ tân') THEN 'receptionist'
  WHEN id = 'role-quan-ly' OR lower(name) = 'quản lý' THEN 'manager'
  WHEN id = 'role-ke-toan' OR lower(name) = 'kế toán' THEN 'accountant'
  WHEN id = 'role-nhan-su' OR lower(name) = 'nhân sự' THEN 'hr'
  WHEN id = 'role-marketing' OR lower(name) = 'marketing' THEN 'marketing'
  WHEN id = 'role-bao-ve' OR lower(name) = 'bảo vệ' THEN 'security'
END;

UPDATE roles
SET permissions = CASE system_key
  WHEN 'admin' THEN '["all"]'
  WHEN 'doctor' THEN '["read_patients","write_findings","write_plans","approve_plans"]'
  WHEN 'assistant' THEN '["read_patients","write_visits"]'
  WHEN 'receptionist' THEN '["read_patients","write_payments","write_appointments"]'
  WHEN 'manager' THEN '["all"]'
  WHEN 'accountant' THEN '["read_patients","write_payments"]'
  WHEN 'hr' THEN '["manage_users","read_patients"]'
  WHEN 'marketing' THEN '["read_patients"]'
  WHEN 'security' THEN '[]'
  ELSE permissions
END
WHERE system_key IS NOT NULL;

WITH catalog(system_key, name, permissions) AS (
  VALUES
    ('admin', 'Quản trị viên', '["all"]'),
    ('doctor', 'Bác sĩ', '["read_patients","write_findings","write_plans","approve_plans"]'),
    ('assistant', 'Phụ tá', '["read_patients","write_visits"]'),
    ('receptionist', 'Lễ tân', '["read_patients","write_payments","write_appointments"]'),
    ('manager', 'Quản lý', '["all"]'),
    ('accountant', 'Kế toán', '["read_patients","write_payments"]'),
    ('hr', 'Nhân sự', '["manage_users","read_patients"]'),
    ('marketing', 'Marketing', '["read_patients"]'),
    ('security', 'Bảo vệ', '[]')
)
INSERT OR IGNORE INTO roles (id, tenant_id, system_key, name, permissions)
SELECT
  lower(hex(randomblob(16))),
  tenants.id,
  catalog.system_key,
  catalog.name,
  catalog.permissions
FROM tenants
CROSS JOIN catalog
LEFT JOIN roles
  ON roles.tenant_id = tenants.id AND roles.system_key = catalog.system_key
WHERE roles.id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_roles_tenant_system_key
  ON roles(tenant_id, system_key)
  WHERE system_key IS NOT NULL;
