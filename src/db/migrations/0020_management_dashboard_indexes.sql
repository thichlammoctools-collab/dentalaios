-- Management dashboard aggregates are always scoped by tenant, often branch,
-- status, and an ISO timestamp range. These indexes keep those rollups bounded.

CREATE INDEX IF NOT EXISTS idx_appointments_tenant_branch_status_scheduled
  ON appointments(tenant_id, branch_id, status, scheduled_at);
CREATE INDEX IF NOT EXISTS idx_visits_tenant_branch_date
  ON visits(tenant_id, branch_id, date);
CREATE INDEX IF NOT EXISTS idx_patients_tenant_branch_created
  ON patients(tenant_id, branch_id, created_at);
CREATE INDEX IF NOT EXISTS idx_payments_tenant_status_created
  ON payments(tenant_id, status, created_at);
