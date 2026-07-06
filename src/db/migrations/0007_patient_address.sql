-- Migration 0007 — Add address field to patients.

PRAGMA foreign_keys = ON;

ALTER TABLE patients ADD COLUMN address TEXT;
