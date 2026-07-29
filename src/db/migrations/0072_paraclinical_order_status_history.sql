-- Immutable status timeline for paraclinical orders.
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS paraclinical_order_status_history (
  id           TEXT PRIMARY KEY,
  tenant_id    TEXT NOT NULL REFERENCES tenants(id),
  order_id     TEXT NOT NULL REFERENCES paraclinical_orders(id),
  from_status  TEXT CHECK (from_status IN ('pending', 'in_progress', 'completed', 'cancelled')),
  to_status    TEXT NOT NULL CHECK (to_status IN ('pending', 'in_progress', 'completed', 'cancelled')),
  changed_by   TEXT NOT NULL REFERENCES users(id),
  changed_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_para_order_status_history_order
  ON paraclinical_order_status_history(tenant_id, order_id, changed_at DESC);
