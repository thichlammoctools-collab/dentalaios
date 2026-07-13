-- Migration 0012 — Add contact and manager fields to branches.
--
-- Branches originally had only id, tenant_id, name, address, created_at.
-- This adds phone, email, manager_name, opening_date for the BranchForm UI.
-- All new columns have defaults so existing rows are not affected.

PRAGMA foreign_keys = ON;

ALTER TABLE branches ADD COLUMN phone TEXT NOT NULL DEFAULT '';
ALTER TABLE branches ADD COLUMN email TEXT NOT NULL DEFAULT '';
ALTER TABLE branches ADD COLUMN manager_name TEXT NOT NULL DEFAULT '';
ALTER TABLE branches ADD COLUMN opening_date TEXT;  -- nullable