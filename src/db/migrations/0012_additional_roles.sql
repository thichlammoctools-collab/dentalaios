-- Migration 0012 — Thêm 5 vai trò mới
-- (Quản lý, Kế toán, Nhân sự, Marketing, Bảo vệ)
--
-- Permissions là placeholder — sẽ refine sau khi các chức năng liên quan hoàn thiện.
--
-- NOTE: Không sửa 4 roles hiện tại (admin/doctor/assistant/receptionist) để
-- không break demo users đang tham chiếu role_id cũ.

PRAGMA foreign_keys = ON;

INSERT OR IGNORE INTO roles (id, tenant_id, name, permissions) VALUES
  ('role-quan-ly',   'tenant-demo', 'Quản lý',  '["all"]'),
  ('role-ke-toan',   'tenant-demo', 'Kế toán',  '["read_patients","write_payments"]'),
  ('role-nhan-su',   'tenant-demo', 'Nhân sự',  '["manage_users","read_patients"]'),
  ('role-marketing', 'tenant-demo', 'Marketing','["read_patients"]'),
  ('role-bao-ve',    'tenant-demo', 'Bảo vệ',   '[]');