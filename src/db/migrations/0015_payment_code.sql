-- Migration 0015 — Payment code generation.
--
-- Adds a unique human-readable code to each payment: `{PREFIX}-{YYYYMMDD}-{seq}`.
-- Prefix is configured per-tenant via tenant_settings (key = "payment_code_prefix").
-- Sequence is atomic per-tenant per-day via a dedicated counter table.
--
-- Code is immutable once written (no application code ever updates it).
--
-- Architecture rules:
--   - Payments carries tenant_id (rule #3) — counter table is scoped by tenant_id too.
--   - Non-unique index on code (intentional) — different tenants may share a prefix;
--     per-tenant counter guarantees intra-tenant uniqueness.

PRAGMA foreign_keys = ON;

-- 1) Add code column (nullable for backfill)
ALTER TABLE payments ADD COLUMN code TEXT;

-- 2) Backfill existing rows with deterministic codes.
--    Uses MAX-derived seq per tenant per day (per-row order) — non-contiguous if rows
--    were deleted, which is acceptable since codes only need to be unique.
UPDATE payments
SET code = (
  'TT-' ||
  strftime('%Y%m%d', created_at) || '-' ||
  printf('%04d',
    (
      SELECT COUNT(*) FROM payments p2
      WHERE p2.tenant_id = payments.tenant_id
        AND date(p2.created_at) = date(payments.created_at)
        AND p2.created_at <= payments.created_at
    )
  )
)
WHERE code IS NULL;

-- 3) Non-unique index on code (lookup by code is useful; global uniqueness is unwanted
--    since two tenants may share a prefix).
CREATE INDEX IF NOT EXISTS idx_payments_code ON payments(code);

-- 4) Counter table — atomic per-tenant per-day sequence.
--    INSERT ... ON CONFLICT DO UPDATE SET last_seq = last_seq + 1 RETURNING last_seq
--    is a single SQL statement and is atomic on D1.
CREATE TABLE IF NOT EXISTS payment_code_counters (
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  date_key  TEXT NOT NULL,           -- 'YYYYMMDD' UTC
  last_seq  INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (tenant_id, date_key)
);

-- 5) Seed counters from MAX seq of backfilled codes so future allocations
--    don't collide with backfill values.
INSERT INTO payment_code_counters (tenant_id, date_key, last_seq)
SELECT tenant_id,
       substr(code, 4, 8) AS date_key,
       MAX(CAST(substr(code, 13) AS INTEGER)) AS last_seq
FROM payments
WHERE code IS NOT NULL
GROUP BY tenant_id, substr(code, 4, 8)
ON CONFLICT(tenant_id, date_key) DO UPDATE
  SET last_seq = MAX(last_seq, excluded.last_seq);

-- 6) Generic tenant settings (key-value, scoped to tenant).
CREATE TABLE IF NOT EXISTS tenant_settings (
  tenant_id  TEXT NOT NULL REFERENCES tenants(id),
  key        TEXT NOT NULL,
  value      TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (tenant_id, key)
);

-- 7) Seed default prefix 'TT' for every existing tenant.
INSERT INTO tenant_settings (tenant_id, key, value)
SELECT id, 'payment_code_prefix', 'TT' FROM tenants
WHERE id NOT IN (
  SELECT tenant_id FROM tenant_settings WHERE key = 'payment_code_prefix'
);