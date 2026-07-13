-- Migration 0013 - Add CCCD (Citizen Identification Card) field to patients.
--
-- Vietnamese citizen ID is a 12-digit number. Column is nullable so existing
-- rows are unaffected. An index enables fast lookup by CCCD.

PRAGMA foreign_keys = ON;

ALTER TABLE patients ADD COLUMN cccd TEXT;

CREATE INDEX IF NOT EXISTS idx_patients_cccd ON patients(cccd);
