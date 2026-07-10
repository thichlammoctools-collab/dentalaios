-- Migration 0010 — Branch extra fields.
--
-- Adds phone, email, manager_name, opening_date to the branches table
-- so clinics can store richer branch information.

PRAGMA foreign_keys = ON;

ALTER TABLE branches ADD COLUMN phone        TEXT NOT NULL DEFAULT '';
ALTER TABLE branches ADD COLUMN email        TEXT NOT NULL DEFAULT '';
ALTER TABLE branches ADD COLUMN manager_name TEXT NOT NULL DEFAULT '';
ALTER TABLE branches ADD COLUMN opening_date TEXT; -- nullable, YYYY-MM-DD
