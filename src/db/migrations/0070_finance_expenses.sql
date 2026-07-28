-- Finance cash-management MVP. This is not a double-entry accounting ledger.
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS expenses (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  branch_id TEXT REFERENCES branches(id),
  occurred_at TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN (
    'rent', 'utilities', 'supplies', 'lab_fee', 'staff_cost',
    'marketing', 'maintenance', 'equipment', 'administration', 'other'
  )),
  amount REAL NOT NULL CHECK (amount > 0),
  currency TEXT NOT NULL DEFAULT 'VND' CHECK (currency = 'VND'),
  method TEXT NOT NULL CHECK (method IN ('cash', 'transfer', 'card', 'other')),
  vendor_name TEXT,
  reference TEXT,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'posted' CHECK (status IN ('posted', 'void')),
  void_reason TEXT,
  voided_at TEXT,
  created_by TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  CHECK ((status = 'posted' AND void_reason IS NULL AND voided_at IS NULL)
    OR (status = 'void' AND void_reason IS NOT NULL AND voided_at IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS idx_expenses_tenant_status_occurred
  ON expenses(tenant_id, status, occurred_at);
CREATE INDEX IF NOT EXISTS idx_expenses_tenant_branch_status_occurred
  ON expenses(tenant_id, branch_id, status, occurred_at);
CREATE INDEX IF NOT EXISTS idx_referral_rewards_finance_paid
  ON referral_rewards(tenant_id, status, paid_at);
CREATE INDEX IF NOT EXISTS idx_payments_finance_confirmed
  ON payments(tenant_id, status, confirmed_at);

-- System role permissions are catalog-owned. Existing accountant sessions need
-- to refresh their JWT after this migration to receive the new permissions.
UPDATE roles
SET permissions = '["read_patients","write_payments","view_finance","manage_finance"]'
WHERE system_key = 'accountant'
   OR id = 'role-ke-toan'
   OR lower(name) = 'kế toán';
