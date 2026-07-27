-- Migration 0068 — Seed danh mục dịch vụ điều trị mẫu ban đầu.
--
-- Bộ mẫu tối thiểu, mã chuẩn hệ thống, giá tham khảo thị trường VN 2024-2026.
-- Platform admin cần rà soát và cập nhật `market_price_*` và `icd10` link trước
-- khi bật platform-wide. Seed dùng `INSERT OR IGNORE` để idempotent.

PRAGMA foreign_keys = ON;

INSERT OR IGNORE INTO platform_treatment_service_templates
  (code, name, procedure, default_price, default_duration_min, sort_order, description)
VALUES
  ('EXA-INITIAL',       'Khám và tư vấn ban đầu',              'examination', 100000,  20,  10, 'Khám tổng quát và tư vấn kế hoạch điều trị.'),
  ('EXA-PERIODIC',      'Khám định kỳ',                        'examination',  50000,  15,  20, 'Khám định kỳ, đánh giá tình trạng răng miệng.'),
  ('RES-COMP-1S',       'Trám composite xoang 1',              'filling',     500000,  30, 110, 'Trám composite một mặt cho tổn thương sâu răng.'),
  ('RES-COMP-2S',       'Trám composite xoang 2',              'filling',     700000,  40, 120, 'Trám composite hai mặt cho tổn thương sâu răng.'),
  ('RES-COMP-3S',       'Trám composite xoang 3',              'filling',     900000,  50, 130, 'Trám composite ba mặt cho tổn thương sâu răng lớn.'),
  ('RES-GIC',           'Trám GIC răng sữa/cổ răng',           'filling',     300000,  25, 140, 'Trám GIC cho răng sữa hoặc phục hồi cổ răng.'),
  ('END-RCT-ANT',       'Điều trị tủy răng cửa',               'root_canal', 2000000,  60, 210, 'Điều trị tủy răng cửa một ống tủy.'),
  ('END-RCT-PRE',       'Điều trị tủy răng hàm nhỏ',           'root_canal', 2500000,  75, 220, 'Điều trị tủy răng hàm nhỏ hai ống tủy.'),
  ('END-RCT-MOL',       'Điều trị tủy răng hàm lớn',           'root_canal', 3500000,  90, 230, 'Điều trị tủy răng hàm lớn nhiều ống tủy.'),
  ('END-RETREAT',       'Điều trị tủy lại',                    'root_canal', 4500000, 120, 240, 'Điều trị tủy lại cho răng đã điều trị trước đó.'),
  ('SUR-EXT-SIMPLE',    'Nhổ răng đơn giản',                   'extraction',  500000,  30, 310, 'Nhổ răng thường quy không phẫu thuật.'),
  ('SUR-EXT-SURGICAL',  'Nhổ răng phẫu thuật',                 'extraction', 1500000,  60, 320, 'Nhổ răng cần rạch/mở lợi.'),
  ('SUR-EXT-3M',        'Nhổ răng khôn (răng số 8)',           'extraction', 2500000,  90, 330, 'Nhổ răng khôn thường yêu cầu tiểu phẫu.'),
  ('PRO-CROWN-PFM',     'Bọc mão sứ kim loại',                 'crown',      2500000,  60, 410, 'Bọc mão sứ nền kim loại cho răng đã điều trị.'),
  ('PRO-CROWN-ZIRCONIA','Bọc mão sứ Zirconia',                 'crown',      5000000,  60, 420, 'Bọc mão sứ Zirconia thẩm mỹ cao.'),
  ('PRO-VENEER',        'Dán sứ veneer',                       'veneer',     6000000,  60, 430, 'Dán mặt dán sứ veneer thẩm mỹ.'),
  ('PRO-BRIDGE-3U',     'Cầu răng sứ 3 đơn vị',                'bridge',     7500000,  90, 440, 'Phục hình cầu răng 3 đơn vị thay thế răng mất.'),
  ('IMP-STAGE1',        'Cấy ghép implant (giai đoạn 1)',      'implant',   20000000,  90, 510, 'Đặt trụ implant vào xương hàm.'),
  ('IMP-CROWN',         'Phục hình trên implant',              'implant',    8000000,  60, 520, 'Gắn abutment và mão sứ trên trụ implant.'),
  ('PER-SCALING',       'Cạo vôi và đánh bóng',                'scaling',     300000,  30, 610, 'Cạo vôi trên lợi và đánh bóng răng.'),
  ('PER-SRP',           'Cạo vôi dưới lợi (SRP) một cung',     'scaling',     800000,  45, 620, 'Cạo vôi và làm sạch chân răng dưới lợi cho viêm nha chu.'),
  ('PRV-FLUORIDE',      'Bôi fluor phòng ngừa',                'fluoride',    200000,  20, 710, 'Bôi fluor gel/varnish phòng ngừa sâu răng.'),
  ('PRV-SEALANT',       'Trám bít hố rãnh',                    'fluoride',    200000,  20, 720, 'Trám bít hố rãnh phòng ngừa sâu răng mặt nhai.'),
  ('OTH-EMERGENCY',     'Xử lý cấp cứu nha khoa',              'other',       500000,  30, 810, 'Xử trí cấp cứu đau/sưng/chảy máu.');

-- Cập nhật giá thị trường tham khảo (median = default_price theo mặc định seed).
-- Range +/- 30% quanh giá median để có mốc so sánh; tenant vẫn override khi import.
UPDATE platform_treatment_service_templates
SET
  market_price_median = default_price,
  market_price_low = CAST(default_price * 0.7 AS INTEGER),
  market_price_high = CAST(default_price * 1.3 AS INTEGER),
  market_price_reference = 'Ước tính thị trường Việt Nam 2024-2026, cần xác nhận trước pilot',
  market_price_updated_at = datetime('now')
WHERE market_price_median IS NULL;

-- Seed ICD-10 primary link cho các mã ICD-10 đang có trong `icd10_codes`.
-- Chỉ chèn link khi mã ICD-10 khớp code tồn tại trong bảng chuẩn để tránh
-- vi phạm FK trong tenant chưa có terminology version.
INSERT OR IGNORE INTO platform_treatment_service_template_icd10
  (template_code, icd10_code_id, relation)
SELECT t.code, i.id, 'primary'
FROM (
  SELECT 'EXA-INITIAL'       AS code, 'Z01.2' AS icd UNION ALL
  SELECT 'EXA-PERIODIC',      'Z01.2' UNION ALL
  SELECT 'RES-COMP-1S',       'K02.1' UNION ALL
  SELECT 'RES-COMP-2S',       'K02.1' UNION ALL
  SELECT 'RES-COMP-3S',       'K02.1' UNION ALL
  SELECT 'RES-GIC',           'K02.1' UNION ALL
  SELECT 'END-RCT-ANT',       'K04.0' UNION ALL
  SELECT 'END-RCT-PRE',       'K04.0' UNION ALL
  SELECT 'END-RCT-MOL',       'K04.0' UNION ALL
  SELECT 'END-RETREAT',       'K04.5' UNION ALL
  SELECT 'SUR-EXT-SIMPLE',    'K08.1' UNION ALL
  SELECT 'SUR-EXT-SURGICAL',  'K08.1' UNION ALL
  SELECT 'SUR-EXT-3M',        'K01.1' UNION ALL
  SELECT 'PRO-CROWN-PFM',     'K02.5' UNION ALL
  SELECT 'PRO-CROWN-ZIRCONIA','K02.5' UNION ALL
  SELECT 'PRO-VENEER',        'K03.7' UNION ALL
  SELECT 'PRO-BRIDGE-3U',     'K08.1' UNION ALL
  SELECT 'IMP-STAGE1',        'K08.1' UNION ALL
  SELECT 'IMP-CROWN',         'K08.1' UNION ALL
  SELECT 'PER-SCALING',       'K05.1' UNION ALL
  SELECT 'PER-SRP',           'K05.3' UNION ALL
  SELECT 'PRV-FLUORIDE',      'Z29.3' UNION ALL
  SELECT 'PRV-SEALANT',       'Z29.8' UNION ALL
  SELECT 'OTH-EMERGENCY',     'K04.7'
) t
JOIN icd10_codes i ON i.code = t.icd
WHERE EXISTS (
  SELECT 1 FROM platform_treatment_service_templates ptst WHERE ptst.code = t.code
);
