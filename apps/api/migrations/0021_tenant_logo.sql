-- Migration 0021 — Per-tenant clinic logo stored as a private file object.

ALTER TABLE tenants ADD COLUMN logo_file_id TEXT REFERENCES file_objects(id);
