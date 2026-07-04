-- Seed 0002 — Demo data for Dental Empire OS Clinic.
-- Run after migration 0001 and seed 0001 (roles + users).
-- Creates 6 patients, 8 visits with findings, 4 treatment plans with items,
-- 5 payments. All under tenant-demo / branch-main.
--
-- Run:
--   wrangler d1 execute dentalaios-db --remote --file=../../src/db/seeds/0002_demo_data.sql

-- ──────────────── Patients ────────────────
INSERT OR IGNORE INTO patients (id, tenant_id, branch_id, name, date_of_birth, gender, phone, email, notes) VALUES
  ('pt-001', 'tenant-demo', 'branch-main', 'Nguyễn Văn A',    '1990-05-15', 'M', '0901234567', 'a@example.com', 'Khách quen, đến khám định kỳ 6 tháng/lần'),
  ('pt-002', 'tenant-demo', 'branch-main', 'Trần Thị B',      '1985-08-22', 'F', '0912345678', 'b@example.com', 'Dị ứng penicillin'),
  ('pt-003', 'tenant-demo', 'branch-main', 'Lê Văn C',        '1992-03-10', 'M', '0923456789', NULL, NULL),
  ('pt-004', 'tenant-demo', 'branch-main', 'Phạm Thị D',      '1978-12-01', 'F', '0934567890', 'd@example.com', 'Bệnh nhân tiểu đường type 2'),
  ('pt-005', 'tenant-demo', 'branch-main', 'Hoàng Văn E',     '2000-07-25', 'M', '0945678901', NULL, 'Niềng răng'),
  ('pt-006', 'tenant-demo', 'branch-main', 'Vũ Thị F',        '1995-11-30', 'F', '0956789012', 'f@example.com', NULL);

-- ──────────────── Medical alerts ────────────────
INSERT OR IGNORE INTO medical_alerts (id, tenant_id, patient_id, type, description, severity) VALUES
  ('alert-001', 'tenant-demo', 'pt-002', 'allergy',    'Penicillin — phát ban, khó thở', 'high'),
  ('alert-002', 'tenant-demo', 'pt-002', 'allergy',    'Latex', 'low'),
  ('alert-003', 'tenant-demo', 'pt-004', 'chronic',    'Tiểu đường type 2 — kiểm soát bằng Metformin', 'medium'),
  ('alert-004', 'tenant-demo', 'pt-004', 'medication', 'Warfarin (chống đông máu)', 'medium'),
  ('alert-005', 'tenant-demo', 'pt-005', 'allergy',    'NSAIDs', 'low');

-- ──────────────── Visits ────────────────
INSERT OR IGNORE INTO visits (id, tenant_id, patient_id, branch_id, clinician_id, date, status, notes) VALUES
  ('vis-001', 'tenant-demo', 'pt-001', 'branch-main', 'user-doctor-1', '2026-06-25T09:00:00Z', 'completed', 'Khám tổng quát. Làm sạch răng.'),
  ('vis-002', 'tenant-demo', 'pt-002', 'branch-main', 'user-doctor-1', '2026-06-28T10:30:00Z', 'completed', 'Tư vấn nhổ răng khôn.'),
  ('vis-003', 'tenant-demo', 'pt-001', 'branch-main', 'user-doctor-1', '2026-07-01T14:00:00Z', 'in_progress', 'Tái khám sau 1 tuần.'),
  ('vis-004', 'tenant-demo', 'pt-003', 'branch-main', 'user-doctor-1', '2026-07-02T11:00:00Z', 'in_progress', 'Đau răng số 36.'),
  ('vis-005', 'tenant-demo', 'pt-005', 'branch-main', 'user-doctor-1', '2026-07-03T15:30:00Z', 'in_progress', 'Tư vấn niềng răng.');

-- ──────────────── Clinical findings ────────────────
INSERT OR IGNORE INTO clinical_findings (id, tenant_id, visit_id, tooth_number, tooth_system, condition, notes) VALUES
  ('cf-001', 'tenant-demo', 'vis-001', 16, 'FDI', 'calculus',  'Cao răng nhẹ vùng răng cối hàm trên'),
  ('cf-002', 'tenant-demo', 'vis-002', 38, 'FDI', 'periapical','Viêm quanh chóp răng khôn hàm dưới trái'),
  ('cf-003', 'tenant-demo', 'vis-004', 36, 'FDI', 'caries',    'Sâu răng cối lớn hàm dưới trái, mặt nhai'),
  ('cf-004', 'tenant-demo', 'vis-004', 37, 'FDI', 'caries',    'Sâu răng cối lớn thứ 2 hàm dưới trái'),
  ('cf-005', 'tenant-demo', 'vis-005', 11, 'FDI', 'other',     'Răng cửa trên lệch nhẹ, cần niềng'),
  ('cf-006', 'tenant-demo', 'vis-003', 26, 'FDI', 'fracture',  'Răng cối lớn hàm trên trái có vết nứt men');

-- ──────────────── Treatment plans ────────────────
INSERT OR IGNORE INTO treatment_plans (id, tenant_id, visit_id, patient_id, status, total_cost, currency, notes, approved_at) VALUES
  ('tp-001', 'tenant-demo', 'vis-001', 'pt-001', 'completed', 800000,  'VND', 'Làm sạch + đánh bóng',                '2026-06-25T09:30:00Z'),
  ('tp-002', 'tenant-demo', 'vis-002', 'pt-002', 'approved',  2500000, 'VND', 'Nhổ răng khôn + khám sau',            '2026-06-28T11:00:00Z'),
  ('tp-003', 'tenant-demo', 'vis-004', 'pt-003', 'draft',     1800000, 'VND', 'Trám 2 răng cối sâu',                  NULL),
  ('tp-004', 'tenant-demo', 'vis-005', 'pt-005', 'draft',     35000000,'VND', 'Niềng răng mắc cài kim loại 18 tháng', NULL);

-- ──────────────── Treatment plan items ────────────────
INSERT OR IGNORE INTO treatment_plan_items (id, tenant_id, treatment_plan_id, tooth_number, procedure, description, unit_cost, status) VALUES
  ('tpi-001', 'tenant-demo', 'tp-001', 16, 'cleaning',    'Lấy cao răng + đánh bóng',                          500000, 'completed'),
  ('tpi-002', 'tenant-demo', 'tp-001', 17, 'cleaning',    'Lấy cao răng vùng răng cối',                         300000, 'completed'),
  ('tpi-003', 'tenant-demo', 'tp-002', 38, 'extraction',  'Nhổ răng khôn hàm dưới trái (gây tê)',              2000000, 'planned'),
  ('tpi-004', 'tenant-demo', 'tp-002', 38, 'medication',  'Thuốc kháng sinh + giảm đau sau nhổ',                500000, 'planned'),
  ('tpi-005', 'tenant-demo', 'tp-003', 36, 'filling',     'Trám răng composite mặt nhai răng 36',               800000, 'planned'),
  ('tpi-006', 'tenant-demo', 'tp-003', 37, 'filling',     'Trám răng composite mặt nhai răng 37',               800000, 'planned'),
  ('tpi-007', 'tenant-demo', 'tp-003', 36, 'other',       'Chụp X-quang kiểm tra trước khi trám',                200000, 'planned'),
  ('tpi-008', 'tenant-demo', 'tp-004', 11, 'other',       'Niềng răng — gói trọn gói 18 tháng',           30000000, 'planned'),
  ('tpi-009', 'tenant-demo', 'tp-004', 21, 'other',       'Niềng răng — gói trọn gói 18 tháng',            5000000, 'planned'),
  ('tpi-010', 'tenant-demo', 'tp-004', 12, 'extraction',  'Nhổ răng thừa trước khi niềng (nếu cần)',            0, 'planned');

-- ──────────────── Payments ────────────────
INSERT OR IGNORE INTO payments (id, tenant_id, treatment_plan_id, patient_id, amount, currency, method, status, reference, notes) VALUES
  ('pay-001', 'tenant-demo', 'tp-001', 'pt-001', 800000,  'VND', 'cash',     'confirmed', 'CASH-2026-001',  'Thanh toán ngay sau khám'),
  ('pay-002', 'tenant-demo', 'tp-002', 'pt-002', 1000000, 'VND', 'transfer', 'confirmed', 'VCB-2026-00628',  'Đặt cọc 1tr trước nhổ răng'),
  ('pay-003', 'tenant-demo', 'tp-003', 'pt-003', 500000,  'VND', 'cash',     'pending',   NULL,             'Tạm ứng trước khi điều trị'),
  ('pay-004', 'tenant-demo', 'tp-004', 'pt-005', 5000000, 'VND', 'transfer', 'confirmed', 'VCB-2026-00703',  'Đặt cọc niềng răng'),
  ('pay-005', 'tenant-demo', 'tp-002', 'pt-002', 500000,  'VND', 'cash',     'pending',   NULL,             'Thanh toán sau tư vấn');