-- Migration 0056 — Receptionists manage patient records.
-- The patient form is available to receptionists, so grant the matching API permission.

UPDATE roles
SET permissions = '["read_patients","write_patients","write_payments","write_appointments"]'
WHERE system_key = 'receptionist';
