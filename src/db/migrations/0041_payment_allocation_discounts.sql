PRAGMA foreign_keys = ON;

-- Discounts are recorded with the affected service allocation so the reason
-- remains traceable and the outstanding service balance includes the discount.
ALTER TABLE payment_item_allocations ADD COLUMN discount_amount REAL NOT NULL DEFAULT 0 CHECK (discount_amount >= 0);
ALTER TABLE payment_item_allocations ADD COLUMN discount_reason TEXT;
