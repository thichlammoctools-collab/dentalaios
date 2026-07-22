-- Tenant business information used for invoices and payment instructions.

ALTER TABLE tenants ADD COLUMN tax_code TEXT NOT NULL DEFAULT '';
ALTER TABLE tenants ADD COLUMN tax_address TEXT NOT NULL DEFAULT '';
ALTER TABLE tenants ADD COLUMN email TEXT NOT NULL DEFAULT '';
ALTER TABLE tenants ADD COLUMN hotline TEXT NOT NULL DEFAULT '';
ALTER TABLE tenants ADD COLUMN bank_account_number TEXT NOT NULL DEFAULT '';
