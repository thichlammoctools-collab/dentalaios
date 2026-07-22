-- Migration 0043 - Enforce a tenant-scoped unique CCCD for active patients.
--
-- The cccd column was introduced in 0013. Rebuilding patients is unnecessary
-- and fails on D1 because existing tables reference patients(id).
-- Historical records may lack a CCCD; archived records retain their CCCD but
-- do not prevent an active record from using the same value.

CREATE UNIQUE INDEX idx_patients_tenant_active_cccd
  ON patients(tenant_id, cccd)
  WHERE cccd IS NOT NULL AND archived_at IS NULL;
