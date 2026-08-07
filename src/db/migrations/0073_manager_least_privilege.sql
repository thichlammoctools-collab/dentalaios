-- Migration 0073 — replace Manager's legacy all-permission grant.
--
-- `system_key` is stable even when tenants customize a role display name.
-- Do not alter names, descriptions, or role identifiers in this data migration.

UPDATE roles
SET permissions = '["read_patients","write_patients","write_appointments","manage_schedule","manage_users","manage_roles","view_management_dashboard","view_finance"]'
WHERE system_key = 'manager';
