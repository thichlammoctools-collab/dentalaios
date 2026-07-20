-- Global clinical procedure catalog, maintained by Platform Admins.
CREATE TABLE IF NOT EXISTS procedure_catalog (
  code       TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  is_active  INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_procedure_catalog_active_sort
  ON procedure_catalog(is_active, sort_order, name);

-- Preserve the procedure codes already used by tenant services and treatment plans.
INSERT OR IGNORE INTO procedure_catalog (code, name, sort_order) VALUES
  ('examination', 'Khám & chẩn đoán', 10),
  ('filling', 'Trám răng', 20),
  ('root_canal', 'Điều trị tủy', 30),
  ('extraction', 'Nhổ răng', 40),
  ('crown', 'Bọc mão răng', 50),
  ('scaling', 'Cạo vôi răng', 60),
  ('implant', 'Cấy ghép implant', 70),
  ('bridge', 'Cầu răng sứ', 80),
  ('veneer', 'Dán sứ veneer', 90),
  ('fluoride', 'Tẩy trắng fluoride', 100),
  ('other', 'Khác', 999);

-- Preserve any tenant-defined legacy code as a selectable catalog entry.
INSERT OR IGNORE INTO procedure_catalog (code, name, sort_order)
SELECT DISTINCT procedure, procedure, 9000
FROM treatment_services
WHERE length(trim(procedure)) >= 2;

-- Catalog managers are platform owners and operators, never tenant users.
UPDATE platform_roles
SET permissions = '["platform_dashboard.read","platform_tenants.read","platform_tenants.write","platform_content.read","platform_content.write","platform_config.read","platform_config.write","platform_admins.read","platform_admins.write","platform_procedures.read","platform_procedures.write","platform_audit.read"]'
WHERE key = 'platform_owner';

UPDATE platform_roles
SET permissions = '["platform_dashboard.read","platform_tenants.read","platform_tenants.write","platform_content.read","platform_content.write","platform_config.read","platform_config.write","platform_procedures.read","platform_procedures.write","platform_audit.read"]'
WHERE key = 'platform_operator';
