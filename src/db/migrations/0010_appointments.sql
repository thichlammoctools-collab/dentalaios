-- Migration 0010 — Appointments, clinic_schedules, doctor_schedules.
--
-- Appointments are future-facing scheduled events (distinct from Visits,
-- which are "happening now" clinical encounters).
-- Architecture rules apply:
--   #3: every clinical table carries tenant_id
--   #4: every mutation writes audit_logs (via middleware, not in this file)

PRAGMA foreign_keys = ON;

-- ──────────────── Clinic operating hours ────────────────
CREATE TABLE IF NOT EXISTS clinic_schedules (
  id          TEXT PRIMARY KEY,
  tenant_id   TEXT NOT NULL REFERENCES tenants(id),
  branch_id   TEXT NOT NULL REFERENCES branches(id),
  weekday     INTEGER NOT NULL CHECK (weekday BETWEEN 1 AND 7), -- 1=Mon..7=Sun
  open_time   TEXT NOT NULL,  -- "HH:MM" 24h
  close_time  TEXT NOT NULL,  -- "HH:MM" 24h
  is_closed   INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(tenant_id, branch_id, weekday)
);

CREATE INDEX IF NOT EXISTS idx_clinic_sched_tenant_branch ON clinic_schedules(tenant_id, branch_id);

-- ──────────────── Doctor working schedule (per branch) ────────────────
CREATE TABLE IF NOT EXISTS doctor_schedules (
  id            TEXT PRIMARY KEY,
  tenant_id     TEXT NOT NULL REFERENCES tenants(id),
  branch_id     TEXT NOT NULL REFERENCES branches(id),
  doctor_id     TEXT NOT NULL REFERENCES users(id),
  weekday       INTEGER NOT NULL CHECK (weekday BETWEEN 1 AND 7),
  start_time    TEXT NOT NULL,  -- "HH:MM"
  end_time      TEXT NOT NULL,  -- "HH:MM"
  slot_minutes  INTEGER NOT NULL DEFAULT 30,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_doctor_sched ON doctor_schedules(tenant_id, doctor_id, weekday);

-- ──────────────── Appointments (future-facing) ────────────────
CREATE TABLE IF NOT EXISTS appointments (
  id                TEXT PRIMARY KEY,
  tenant_id         TEXT NOT NULL REFERENCES tenants(id),
  branch_id         TEXT NOT NULL REFERENCES branches(id),
  clinician_id      TEXT NOT NULL REFERENCES users(id),
  patient_id        TEXT NOT NULL REFERENCES patients(id),
  source_visit_id   TEXT REFERENCES visits(id),
  scheduled_at      TEXT NOT NULL,  -- ISO datetime
  duration_min      INTEGER NOT NULL DEFAULT 30,
  status            TEXT NOT NULL DEFAULT 'booked'
                      CHECK (status IN ('booked','confirmed','arrived','completed',
                                        'cancelled','no_show')),
  procedure         TEXT,
  notes             TEXT,
  source            TEXT NOT NULL DEFAULT 'manual',  -- manual|ai_chat|ai_next_visit|reschedule
  lark_event_id     TEXT,
  reminder_sent_at  TEXT,
  reminder_method   TEXT,  -- zalo|lark|email|none
  cancelled_reason  TEXT,
  created_by        TEXT NOT NULL REFERENCES users(id),
  created_at        TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at        TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_appts_tenant_date      ON appointments(tenant_id, scheduled_at);
CREATE INDEX IF NOT EXISTS idx_appts_tenant_branch    ON appointments(tenant_id, branch_id, scheduled_at);
CREATE INDEX IF NOT EXISTS idx_appts_tenant_clinician ON appointments(tenant_id, clinician_id, scheduled_at);
CREATE INDEX IF NOT EXISTS idx_appts_tenant_patient   ON appointments(tenant_id, patient_id, scheduled_at);
CREATE INDEX IF NOT EXISTS idx_appts_status           ON appointments(tenant_id, status, scheduled_at);
