-- Referral permissions are additive and only apply to the built-in accountant.
-- Admin and manager retain the existing `all` permission.
UPDATE roles
SET permissions = '["read_patients","write_payments","read_referrals","pay_referral_rewards"]'
WHERE system_key = 'accountant';
