-- Migration 0003 — Patient vitals & marketing source.
-- Adds family contact info, marketing source, body metrics to patients.
-- Adds vitals (blood pressure, blood sugar) to visits.
-- Adds referral tracking to patients.
-- Adds treating clinician & assistant to visits.

PRAGMA foreign_keys = ON;

-- ─── patients: family contact ───────────────────────────────
ALTER TABLE patients ADD COLUMN family_name         TEXT;
ALTER TABLE patients ADD COLUMN family_phone       TEXT;
ALTER TABLE patients ADD COLUMN family_relation    TEXT;

-- ─── patients: marketing source ────────────────────────────
ALTER TABLE patients ADD COLUMN marketing_source    TEXT;

-- ─── patients: referral tracking ────────────────────────────
ALTER TABLE patients ADD COLUMN referral_type       TEXT;
ALTER TABLE patients ADD COLUMN referral_user_id    TEXT;
ALTER TABLE patients ADD COLUMN referral_notes      TEXT;

-- ─── patients: body metrics ────────────────────────────────
ALTER TABLE patients ADD COLUMN height_cm           REAL;
ALTER TABLE patients ADD COLUMN weight_kg          REAL;

-- ─── visits: vitals ──────────────────────────────────────
ALTER TABLE visits ADD COLUMN blood_pressure_systolic   INTEGER;
ALTER TABLE visits ADD COLUMN blood_pressure_diastolic  INTEGER;
ALTER TABLE visits ADD COLUMN blood_sugar_mgdl          REAL;
ALTER TABLE visits ADD COLUMN vitals_recorded_at         TEXT;

-- ─── visits: personnel ────────────────────────────────────
ALTER TABLE visits ADD COLUMN treating_clinician_id TEXT;
ALTER TABLE visits ADD COLUMN assistant_id          TEXT;
