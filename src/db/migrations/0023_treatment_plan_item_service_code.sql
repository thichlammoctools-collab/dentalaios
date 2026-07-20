-- Tenant-level treatment service catalog. All prices include VAT.
CREATE TABLE IF NOT EXISTS treatment_services (
  id          TEXT PRIMARY KEY,
  tenant_id   TEXT NOT NULL REFERENCES tenants(id),
  code        TEXT NOT NULL,
  name        TEXT NOT NULL,
  procedure   TEXT NOT NULL,
  price       REAL NOT NULL CHECK (price >= 0),
  is_active   INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(tenant_id, code)
);

CREATE INDEX IF NOT EXISTS idx_treatment_services_tenant
  ON treatment_services(tenant_id, is_active, code);

-- Needed for source-generated plan items to retain their catalog linkage.
ALTER TABLE treatment_plan_items ADD COLUMN service_code TEXT;

CREATE INDEX IF NOT EXISTS idx_plan_items_tenant_service_code
  ON treatment_plan_items(tenant_id, service_code);
