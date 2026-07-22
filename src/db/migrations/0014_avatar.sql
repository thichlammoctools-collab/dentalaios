-- Migration 0014 — Avatar support for users and patients.
--
-- Adds avatar_file_id columns to users and patients tables so each entity
-- can store a reference to a file_objects row (R2-stored avatar image).

PRAGMA foreign_keys = ON;

ALTER TABLE users ADD COLUMN avatar_file_id TEXT REFERENCES file_objects(id);
ALTER TABLE patients ADD COLUMN avatar_file_id TEXT REFERENCES file_objects(id);
