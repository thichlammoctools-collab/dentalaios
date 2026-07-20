PRAGMA foreign_keys = ON;

-- Confirmed payments are financial facts. Corrections are recorded as linked,
-- confirmed adjustment entries instead of overwriting the original payment.
ALTER TABLE payments ADD COLUMN original_payment_id TEXT REFERENCES payments(id);
ALTER TABLE payments ADD COLUMN adjustment_reason TEXT;

CREATE INDEX IF NOT EXISTS idx_payments_original_payment
  ON payments(tenant_id, original_payment_id);

-- A payment can retain multiple private R2-backed proofs such as transfer slips
-- and invoices. File objects remain tenant-scoped and are never exposed as URLs.
CREATE TABLE IF NOT EXISTS payment_attachments (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  payment_id TEXT NOT NULL REFERENCES payments(id) ON DELETE CASCADE,
  file_id TEXT NOT NULL REFERENCES file_objects(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('transfer_receipt', 'receipt', 'invoice', 'other')),
  description TEXT,
  created_by TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (payment_id, file_id)
);

CREATE INDEX IF NOT EXISTS idx_payment_attachments_payment
  ON payment_attachments(tenant_id, payment_id);
