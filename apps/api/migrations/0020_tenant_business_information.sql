-- Migration 0020 — Tenant business information for invoices and payments.

ALTER TABLE tenants ADD COLUMN tax_code TEXT NOT NULL DEFAULT '';
ALTER TABLE tenants ADD COLUMN tax_address TEXT NOT NULL DEFAULT '';
ALTER TABLE tenants ADD COLUMN hotline TEXT NOT NULL DEFAULT '';
ALTER TABLE tenants ADD COLUMN bank_account_number TEXT NOT NULL DEFAULT '';
