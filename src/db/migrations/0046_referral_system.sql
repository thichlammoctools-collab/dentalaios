PRAGMA foreign_keys = ON;

-- Referral data is deliberately separate from legacy patient referral fields so
-- existing records remain readable and no historical reward is created.
CREATE TABLE IF NOT EXISTS referrers (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  type TEXT NOT NULL CHECK (type IN ('patient', 'doctor', 'assistant', 'partner')),
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  linked_patient_id TEXT REFERENCES patients(id),
  linked_user_id TEXT REFERENCES users(id),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_by TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (tenant_id, code),
  CHECK (linked_patient_id IS NULL OR linked_user_id IS NULL)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_referrers_active_patient
  ON referrers(tenant_id, linked_patient_id) WHERE linked_patient_id IS NOT NULL AND status = 'active';
CREATE UNIQUE INDEX IF NOT EXISTS idx_referrers_active_user
  ON referrers(tenant_id, linked_user_id) WHERE linked_user_id IS NOT NULL AND status = 'active';
CREATE INDEX IF NOT EXISTS idx_referrers_tenant_type_status
  ON referrers(tenant_id, type, status, name);

CREATE TABLE IF NOT EXISTS referrer_accounts (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  referrer_id TEXT NOT NULL REFERENCES referrers(id),
  email TEXT NOT NULL,
  password_hash TEXT NOT NULL DEFAULT '',
  is_active INTEGER NOT NULL DEFAULT 0,
  last_login_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (referrer_id),
  UNIQUE (tenant_id, email)
);

CREATE TABLE IF NOT EXISTS referrer_account_tokens (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  account_id TEXT NOT NULL REFERENCES referrer_accounts(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  kind TEXT NOT NULL CHECK (kind IN ('activate', 'reset_password')),
  expires_at TEXT NOT NULL,
  used_at TEXT,
  created_by TEXT REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_referrer_account_tokens_expiry
  ON referrer_account_tokens(expires_at);

CREATE TABLE IF NOT EXISTS referral_programs (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'inactive')),
  starts_at TEXT NOT NULL,
  ends_at TEXT,
  priority INTEGER NOT NULL DEFAULT 0,
  conversion_window_days INTEGER NOT NULL DEFAULT 90 CHECK (conversion_window_days BETWEEN 1 AND 3650),
  review_window_days INTEGER NOT NULL DEFAULT 30 CHECK (review_window_days BETWEEN 1 AND 365),
  current_version INTEGER NOT NULL DEFAULT 1 CHECK (current_version > 0),
  created_by TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_referral_programs_active
  ON referral_programs(tenant_id, status, starts_at, ends_at, priority DESC);

CREATE TABLE IF NOT EXISTS referral_program_branches (
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  program_id TEXT NOT NULL REFERENCES referral_programs(id) ON DELETE CASCADE,
  branch_id TEXT NOT NULL REFERENCES branches(id),
  PRIMARY KEY (program_id, branch_id)
);
CREATE INDEX IF NOT EXISTS idx_referral_program_branches_branch
  ON referral_program_branches(tenant_id, branch_id, program_id);

CREATE TABLE IF NOT EXISTS referral_reward_rules (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  program_id TEXT NOT NULL REFERENCES referral_programs(id) ON DELETE CASCADE,
  program_version INTEGER NOT NULL,
  referrer_type TEXT NOT NULL CHECK (referrer_type IN ('patient', 'doctor', 'assistant', 'partner')),
  min_net_revenue REAL NOT NULL CHECK (min_net_revenue >= 0),
  reward_kind TEXT NOT NULL CHECK (reward_kind IN ('cash', 'voucher')),
  calculation_type TEXT NOT NULL CHECK (calculation_type IN ('fixed', 'percentage')),
  value REAL NOT NULL CHECK (value > 0),
  voucher_valid_days INTEGER CHECK (voucher_valid_days BETWEEN 1 AND 3650),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  CHECK ((reward_kind = 'voucher' AND voucher_valid_days IS NOT NULL) OR reward_kind = 'cash'),
  CHECK (calculation_type != 'percentage' OR value <= 100),
  UNIQUE (program_id, program_version, referrer_type, min_net_revenue)
);
CREATE INDEX IF NOT EXISTS idx_referral_reward_rules_lookup
  ON referral_reward_rules(tenant_id, program_id, program_version, referrer_type, min_net_revenue DESC);

CREATE TABLE IF NOT EXISTS referral_cases (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  patient_id TEXT NOT NULL REFERENCES patients(id),
  referrer_id TEXT NOT NULL REFERENCES referrers(id),
  branch_id TEXT NOT NULL REFERENCES branches(id),
  program_id TEXT NOT NULL REFERENCES referral_programs(id),
  program_version INTEGER NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('code', 'manual')),
  status TEXT NOT NULL DEFAULT 'pending_conversion' CHECK (status IN ('pending_conversion', 'eligible', 'pending_approval', 'approved', 'rejected', 'expired', 'recovery_required', 'recovered', 'cancelled')),
  registered_at TEXT NOT NULL DEFAULT (datetime('now')),
  conversion_ends_at TEXT NOT NULL,
  eligible_at TEXT,
  review_due_at TEXT,
  risk_flags TEXT NOT NULL DEFAULT '[]',
  created_by TEXT NOT NULL REFERENCES users(id),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (tenant_id, patient_id)
);
CREATE INDEX IF NOT EXISTS idx_referral_cases_status
  ON referral_cases(tenant_id, status, review_due_at);
CREATE INDEX IF NOT EXISTS idx_referral_cases_referrer
  ON referral_cases(tenant_id, referrer_id, registered_at DESC);
CREATE INDEX IF NOT EXISTS idx_referral_cases_branch
  ON referral_cases(tenant_id, branch_id, registered_at DESC);

CREATE TABLE IF NOT EXISTS referral_rewards (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  referral_case_id TEXT NOT NULL REFERENCES referral_cases(id),
  rule_id TEXT NOT NULL REFERENCES referral_reward_rules(id),
  reward_kind TEXT NOT NULL CHECK (reward_kind IN ('cash', 'voucher')),
  calculation_type TEXT NOT NULL CHECK (calculation_type IN ('fixed', 'percentage')),
  configured_value REAL NOT NULL,
  basis_net_revenue REAL NOT NULL,
  calculated_amount REAL NOT NULL,
  currency TEXT NOT NULL DEFAULT 'VND',
  status TEXT NOT NULL DEFAULT 'pending_approval' CHECK (status IN ('pending_approval', 'cash_payable', 'cash_paid', 'voucher_issued', 'rejected', 'expired', 'recovery_required', 'recovered')),
  reviewed_by TEXT REFERENCES users(id),
  reviewed_at TEXT,
  rejection_reason TEXT,
  paid_by TEXT REFERENCES users(id),
  paid_at TEXT,
  payment_method TEXT,
  payment_reference TEXT,
  recovery_by TEXT REFERENCES users(id),
  recovered_at TEXT,
  recovery_reason TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (referral_case_id)
);
CREATE INDEX IF NOT EXISTS idx_referral_rewards_status
  ON referral_rewards(tenant_id, status, created_at DESC);

CREATE TABLE IF NOT EXISTS referral_vouchers (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  reward_id TEXT NOT NULL REFERENCES referral_rewards(id),
  code TEXT NOT NULL,
  face_value REAL NOT NULL,
  issued_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'issued' CHECK (status IN ('issued', 'expired', 'cancelled')),
  cancelled_by TEXT REFERENCES users(id),
  cancelled_at TEXT,
  cancellation_reason TEXT,
  UNIQUE (reward_id),
  UNIQUE (tenant_id, code)
);
CREATE INDEX IF NOT EXISTS idx_referral_vouchers_status_expiry
  ON referral_vouchers(tenant_id, status, expires_at);

CREATE TABLE IF NOT EXISTS referral_case_change_requests (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  case_id TEXT NOT NULL REFERENCES referral_cases(id),
  kind TEXT NOT NULL CHECK (kind IN ('replace_referrer', 'cancel')),
  proposed_referrer_id TEXT REFERENCES referrers(id),
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  requested_by TEXT NOT NULL REFERENCES users(id),
  reviewed_by TEXT REFERENCES users(id),
  reviewed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  CHECK ((kind = 'replace_referrer' AND proposed_referrer_id IS NOT NULL) OR kind = 'cancel')
);
CREATE INDEX IF NOT EXISTS idx_referral_change_requests
  ON referral_case_change_requests(tenant_id, status, created_at DESC);

CREATE TABLE IF NOT EXISTS referral_events (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  case_id TEXT NOT NULL REFERENCES referral_cases(id),
  reward_id TEXT REFERENCES referral_rewards(id),
  actor_type TEXT NOT NULL CHECK (actor_type IN ('user', 'system')),
  actor_id TEXT REFERENCES users(id),
  event_type TEXT NOT NULL,
  from_status TEXT,
  to_status TEXT,
  reason TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  CHECK ((actor_type = 'system' AND actor_id IS NULL) OR (actor_type = 'user' AND actor_id IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS idx_referral_events_case
  ON referral_events(tenant_id, case_id, created_at DESC);

ALTER TABLE payments ADD COLUMN confirmed_at TEXT;
CREATE INDEX IF NOT EXISTS idx_payments_referral_revenue
  ON payments(tenant_id, patient_id, status, confirmed_at);
