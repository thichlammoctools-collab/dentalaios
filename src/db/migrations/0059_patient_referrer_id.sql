-- Persist a referrer choice even when no commission program applies.
ALTER TABLE patients ADD COLUMN referrer_id TEXT REFERENCES referrers(id);
CREATE INDEX IF NOT EXISTS idx_patients_referrer ON patients(tenant_id, referrer_id);
