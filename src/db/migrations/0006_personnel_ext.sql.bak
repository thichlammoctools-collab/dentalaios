-- Thêm trường vào visits: bác sĩ điều trị + phụ tá
ALTER TABLE visits ADD COLUMN treating_clinician_id TEXT
  REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE visits ADD COLUMN assistant_id TEXT
  REFERENCES users(id) ON DELETE SET NULL;

-- Thêm trường vào patients: theo dõi nguồn giới thiệu cụ thể
ALTER TABLE patients ADD COLUMN referral_type TEXT
  CHECK(referral_type IN ('doctor','staff','other','ad','none'));
ALTER TABLE patients ADD COLUMN referral_user_id TEXT
  REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE patients ADD COLUMN referral_notes TEXT;
