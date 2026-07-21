PRAGMA foreign_keys = ON;

-- A payment may settle one or more treatment-plan items. Keeping allocations
-- separate preserves the immutable payment ledger while exposing item balances.
CREATE TABLE IF NOT EXISTS payment_item_allocations (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  payment_id TEXT NOT NULL REFERENCES payments(id) ON DELETE CASCADE,
  treatment_plan_item_id TEXT NOT NULL REFERENCES treatment_plan_items(id),
  amount REAL NOT NULL CHECK (amount > 0),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(payment_id, treatment_plan_item_id)
);

CREATE INDEX IF NOT EXISTS idx_payment_item_allocations_item
  ON payment_item_allocations(tenant_id, treatment_plan_item_id);
