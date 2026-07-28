-- Migration 0069 — Seed mã ICD-10 Việt Nam (Chương K — Răng miệng) + gắn mapping cho concept đã có.
--
-- Nguồn: ICD-10-VN 2026, Chương K — Diseases of the digestive system (phần Răng miệng).
-- Dữ liệu tham khảo từ Bộ Y tế Việt Nam và WHO ICD-10.
-- Dùng INSERT OR IGNORE để idempotent.
-- ID mã ICD-10 dùng pattern 'icd10-k0XX' để dễ truy vết.

PRAGMA foreign_keys = ON;

-- ══════════════════════════════════════════════════════════════════════
-- 1. Tạo Terminology Version — ICD-10-VN-2026 Chương K
-- ══════════════════════════════════════════════════════════════════════
INSERT OR IGNORE INTO clinical_terminology_versions
  (id, system, version_key, title, publisher, published_at, source_file_name, source_sha256, status, approved_at)
VALUES
  ('term-icd10-vn-2026', 'ICD10_VN', 'icd10-vn-2026',
   'ICD-10-VN 2026 — Chương K: Răng miệng',
   'Bộ Y tế Việt Nam', '2026-01-01',
   'ICD-10-VN-2026-Chapter-K.xlsx',
   'seeded-via-migration-0069',
   'approved', datetime('now'));

-- ══════════════════════════════════════════════════════════════════════
-- 2. Mã ICD-10 — Chương K: Răng miệng
-- ══════════════════════════════════════════════════════════════════════

-- ── K00: Rối loạn phát triển & mọc răng ──
INSERT OR IGNORE INTO icd10_codes (id, terminology_version_id, code, display_vi, parent_code, is_billable, sort_order) VALUES
('icd10-k00',    'term-icd10-vn-2026', 'K00',   'Rối loạn phát triển và mọc răng', NULL, 0, 100),
('icd10-k000',   'term-icd10-vn-2026', 'K00.0', 'Thiếu răng bẩm sinh', 'K00', 1, 101),
('icd10-k001',   'term-icd10-vn-2026', 'K00.1', 'Thừa răng bẩm sinh', 'K00', 1, 102),
('icd10-k002',   'term-icd10-vn-2026', 'K00.2', 'Dị dạng về kích thước và hình dạng răng', 'K00', 1, 103),
('icd10-k003',   'term-icd10-vn-2026', 'K00.3', 'Răng bị mốm (mottled teeth)', 'K00', 1, 104),
('icd10-k004',   'term-icd10-vn-2026', 'K00.4', 'Rối loạn quá trình tạo răng', 'K00', 1, 105),
('icd10-k005',   'term-icd10-vn-2026', 'K00.5', 'Dị dạng di truyền cấu trúc răng', 'K00', 1, 106),
('icd10-k006',   'term-icd10-vn-2026', 'K00.6', 'Rối loạn mọc răng', 'K00', 1, 107),
('icd10-k007',   'term-icd10-vn-2026', 'K00.7', 'Hội chứng mọc răng', 'K00', 1, 108),
('icd10-k008',   'term-icd10-vn-2026', 'K00.8', 'Rối loạn phát triển và mọc răng khác', 'K00', 1, 109),
('icd10-k009',   'term-icd10-vn-2026', 'K00.9', 'Rối loạn phát triển và mọc răng, không xác định', 'K00', 1, 110),

-- ── K01: Răng sâu ẩn & mọc ngầm ──
('icd10-k01',    'term-icd10-vn-2026', 'K01',   'Răng sâu ẩn và mọc ngầm', NULL, 0, 120),
('icd10-k010',   'term-icd10-vn-2026', 'K01.0', 'Răng sâu ẩn (embedded teeth)', 'K01', 1, 121),
('icd10-k011',   'term-icd10-vn-2026', 'K01.1', 'Răng mọc ngầm (impacted teeth)', 'K01', 1, 122),

-- ── K02: Sâu răng ──
('icd10-k02',    'term-icd10-vn-2026', 'K02',   'Sâu răng', NULL, 0, 130),
('icd10-k020',   'term-icd10-vn-2026', 'K02.0', 'Sâu men răng', 'K02', 1, 131),
('icd10-k021',   'term-icd10-vn-2026', 'K02.1', 'Sâu ngà răng', 'K02', 1, 132),
('icd10-k022',   'term-icd10-vn-2026', 'K02.2', 'Sâu cementum', 'K02', 1, 133),
('icd10-k023',   'term-icd10-vn-2026', 'K02.3', 'Sâu răng kìm hãm', 'K02', 1, 134),
('icd10-k024',   'term-icd10-vn-2026', 'K02.4', 'Mòn răng (odontoclasia)', 'K02', 1, 135),
('icd10-k028',   'term-icd10-vn-2026', 'K02.8', 'Sâu răng loại khác', 'K02', 1, 136),
('icd10-k029',   'term-icd10-vn-2026', 'K02.9', 'Sâu răng, không xác định', 'K02', 1, 137),

-- ── K03: Bệnh mô cứng răng ──
('icd10-k03',    'term-icd10-vn-2026', 'K03',   'Bệnh mô cứng răng', NULL, 0, 140),
('icd10-k030',   'term-icd10-vn-2026', 'K03.0', 'Mòn răng quá mức', 'K03', 1, 141),
('icd10-k031',   'term-icd10-vn-2026', 'K03.1', 'Mài mòn răng', 'K03', 1, 142),
('icd10-k032',   'term-icd10-vn-2026', 'K03.2', 'Bào mòn răng', 'K03', 1, 143),
('icd10-k033',   'term-icd10-vn-2026', 'K03.3', 'Teo răng bệnh lý', 'K03', 1, 144),
('icd10-k034',   'term-icd10-vn-2026', 'K03.4', 'Viêm cementum quá mức', 'K03', 1, 145),
('icd10-k035',   'term-icd10-vn-2026', 'K03.5', 'Dính răng', 'K03', 1, 146),
('icd10-k036',   'term-icd10-vn-2026', 'K03.6', 'Canxi hóa tủy quá mức', 'K03', 1, 147),
('icd10-k037',   'term-icd10-vn-2026', 'K03.7', 'Thay đổi màu mô cứng răng sau mọc', 'K03', 1, 148),
('icd10-k038',   'term-icd10-vn-2026', 'K03.8', 'Bệnh mô cứng răng khác', 'K03', 1, 149),
('icd10-k039',   'term-icd10-vn-2026', 'K03.9', 'Bệnh mô cứng răng, không xác định', 'K03', 1, 150),

-- ── K04: Bệnh tủy & quanh chóp ──
('icd10-k04',    'term-icd10-vn-2026', 'K04',   'Bệnh tủy và mô quanh chóp', NULL, 0, 160),
('icd10-k0400',  'term-icd10-vn-2026', 'K04.0', 'Viêm tủy', 'K04', 1, 161),
('icd10-k041',   'term-icd10-vn-2026', 'K04.1', 'Hoại tử tủy', 'K04', 1, 162),
('icd10-k042',   'term-icd10-vn-2026', 'K04.2', 'Thoái hóa tủy', 'K04', 1, 163),
('icd10-k043',   'term-icd10-vn-2026', 'K04.3', 'Viêm quanh chóp cấp do tủy', 'K04', 1, 164),
('icd10-k044',   'term-icd10-vn-2026', 'K04.4', 'Áp xe quanh chóp do tủy', 'K04', 1, 165),
('icd10-k045',   'term-icd10-vn-2026', 'K04.5', 'Viêm quanh chóp mạn', 'K04', 1, 166),
('icd10-k046',   'term-icd10-vn-2026', 'K04.6', 'Áp xe quanh chóp có lỗ rò', 'K04', 1, 167),
('icd10-k047',   'term-icd10-vn-2026', 'K04.7', 'Nang quanh chóp', 'K04', 1, 168),
('icd10-k048',   'term-icd10-vn-2026', 'K04.8', 'Bệnh tủy và mô quanh chóp khác', 'K04', 1, 169),
('icd10-k049',   'term-icd10-vn-2026', 'K04.9', 'Bệnh tủy và mô quanh chóp, không xác định', 'K04', 1, 170),

-- ── K05: Viêm nướu & nha chu ──
('icd10-k05',    'term-icd10-vn-2026', 'K05',   'Bệnh viêm nướu và nha chu', NULL, 0, 180),
('icd10-k050',   'term-icd10-vn-2026', 'K05.0', 'Viêm nướu cấp', 'K05', 1, 181),
('icd10-k051',   'term-icd10-vn-2026', 'K05.1', 'Viêm nướu mạn', 'K05', 1, 182),
('icd10-k052',   'term-icd10-vn-2026', 'K05.2', 'Viêm nha chu cấp', 'K05', 1, 183),
('icd10-k053',   'term-icd10-vn-2026', 'K05.3', 'Viêm nha chu mạn', 'K05', 1, 184),
('icd10-k054',   'term-icd10-vn-2026', 'K05.4', 'Teo nha chu', 'K05', 1, 185),
('icd10-k055',   'term-icd10-vn-2026', 'K05.5', 'Bệnh nha chu khác', 'K05', 1, 186),
('icd10-k056',   'term-icd10-vn-2026', 'K05.6', 'Bệnh nha chu, không xác định', 'K05', 1, 187),

-- ── K06: Bệnh nướu & ridged mỏm hàm khác ──
('icd10-k06',    'term-icd10-vn-2026', 'K06',   'Bệnh nướu và ridged mỏm hàm khác', NULL, 0, 190),
('icd10-k060',   'term-icd10-vn-2026', 'K06.0', 'Teo nướu', 'K06', 1, 191),
('icd10-k061',   'term-icd10-vn-2026', 'K06.1', 'Phì đại nướu', 'K06', 1, 192),
('icd10-k062',   'term-icd10-vn-2026', 'K06.2', 'Viêm nướu và nha chu do chấn thương', 'K06', 1, 193),
('icd10-k068',   'term-icd10-vn-2026', 'K06.8', 'Bệnh nướu khác', 'K06', 1, 194),
('icd10-k069',   'term-icd10-vn-2026', 'K06.9', 'Bệnh nướu, không xác định', 'K06', 1, 195),

-- ── K07: Dị dạng răng hàm mặt ──
('icd10-k07',    'term-icd10-vn-2026', 'K07',   'Dị dạng răng hàm mặt (bao gồm sai khớp cắn)', NULL, 0, 200),
('icd10-k070',   'term-icd10-vn-2026', 'K07.0', 'Dị dạng kích thước hàm lớn', 'K07', 1, 201),
('icd10-k071',   'term-icd10-vn-2026', 'K07.1', 'Dị dạng tương quan hàm-sọ', 'K07', 1, 202),
('icd10-k072',   'term-icd10-vn-2026', 'K07.2', 'Dị dạng tương quan cung răng', 'K07', 1, 203),
('icd10-k073',   'term-icd10-vn-2026', 'K07.3', 'Dị dạng vị trí răng', 'K07', 1, 204),
('icd10-k074',   'term-icd10-vn-2026', 'K07.4', 'Sai khớp cắn, không xác định', 'K07', 1, 205),
('icd10-k075',   'term-icd10-vn-2026', 'K07.5', 'Bất thường chức năng răng hàm mặt', 'K07', 1, 206),
('icd10-k076',   'term-icd10-vn-2026', 'K07.6', 'Rối loạn khớp thái dương hàm', 'K07', 1, 207),
('icd10-k078',   'term-icd10-vn-2026', 'K07.8', 'Dị dạng răng hàm mặt khác', 'K07', 1, 208),
('icd10-k079',   'term-icd10-vn-2026', 'K07.9', 'Dị dạng răng hàm mặt, không xác định', 'K07', 1, 209),

-- ── K08: Mất & rối loạn răng khác ──
('icd10-k08',    'term-icd10-vn-2026', 'K08',   'Mất và rối loạn răng và tổ chức nâng đỡ khác', NULL, 0, 210),
('icd10-k080',   'term-icd10-vn-2026', 'K08.0', 'Mất răng do nguyên nhân toàn thân', 'K08', 1, 211),
('icd10-k081',   'term-icd10-vn-2026', 'K08.1', 'Mất răng do tai nạn, nhổ hoặc bệnh nha chu', 'K08', 1, 212),
('icd10-k082',   'term-icd10-vn-2026', 'K08.2', 'Mất răng do chấn thương, không hàm giả', 'K08', 1, 213),
('icd10-k083',   'term-icd10-vn-2026', 'K08.3', 'Răng tồn dư', 'K08', 1, 214),
('icd10-k088',   'term-icd10-vn-2026', 'K08.8', 'Rối loạn răng và tổ chức nâng đỡ khác', 'K08', 1, 215),
('icd10-k089',   'term-icd10-vn-2026', 'K08.9', 'Rối loạn răng và tổ chức nâng đỡ, không xác định', 'K08', 1, 216),

-- ── K09: Nang vùng miệng ──
('icd10-k09',    'term-icd10-vn-2026', 'K09',   'Nang vùng miệng, không phân loại elsewhere', NULL, 0, 220),
('icd10-k090',   'term-icd10-vn-2026', 'K09.0', 'Nang tạo răng phát triển', 'K09', 1, 221),
('icd10-k091',   'term-icd10-vn-2026', 'K09.1', 'Nang quanh chóp (nang chân răng)', 'K09', 1, 222),
('icd10-k092',   'term-icd10-vn-2026', 'K09.2', 'Nang hàm khác', 'K09', 1, 223),
('icd10-k098',   'term-icd10-vn-2026', 'K09.8', 'Nang vùng miệng khác', 'K09', 1, 224),
('icd10-k099',   'term-icd10-vn-2026', 'K09.9', 'Nang vùng miệng, không xác định', 'K09', 1, 225),

-- ── K10: Bệnh hàm khác ──
('icd10-k10',    'term-icd10-vn-2026', 'K10',   'Bệnh hàm khác', NULL, 0, 230),
('icd10-k100',   'term-icd10-vn-2026', 'K10.0', 'Dị dạng phát triển hàm', 'K10', 1, 231),
('icd10-k101',   'term-icd10-vn-2026', 'K10.1', 'U tế bào khổng lồ hàm', 'K10', 1, 232),
('icd10-k102',   'term-icd10-vn-2026', 'K10.2', 'Viêm hàm', 'K10', 1, 233),
('icd10-k103',   'term-icd10-vn-2026', 'K10.3', 'Viêm ổ răng hàm', 'K10', 1, 234),
('icd10-k104',   'term-icd10-vn-2026', 'K10.4', 'Bệnh ổ răng hàm khác', 'K10', 1, 235),
('icd10-k108',   'term-icd10-vn-2026', 'K10.8', 'Bệnh hàm khác', 'K10', 1, 236),
('icd10-k109',   'term-icd10-vn-2026', 'K10.9', 'Bệnh hàm, không xác định', 'K10', 1, 237),

-- ── K11: Bệnh tuyến mang tai ──
('icd10-k11',    'term-icd10-vn-2026', 'K11',   'Bệnh tuyến mang tai', NULL, 0, 240),
('icd10-k110',   'term-icd10-vn-2026', 'K11.0', 'Teo hoặc thiếu tuyến mang tai', 'K11', 1, 241),
('icd10-k111',   'term-icd10-vn-2026', 'K11.1', 'Phì đại tuyến mang tai', 'K11', 1, 242),
('icd10-k112',   'term-icd10-vn-2026', 'K11.2', 'Viêm tuyến mang tai', 'K11', 1, 243),
('icd10-k113',   'term-icd10-vn-2026', 'K11.3', 'Áp xe tuyến mang tai', 'K11', 1, 244),
('icd10-k114',   'term-icd10-vn-2026', 'K11.4', 'Rò tuyến mang tai', 'K11', 1, 245),
('icd10-k115',   'term-icd10-vn-2026', 'K11.5', 'Sỏi tuyến mang tai', 'K11', 1, 246),
('icd10-k116',   'term-icd10-vn-2026', 'K11.6', 'Nang nhầy tuyến mang tai (mucocele)', 'K11', 1, 247),
('icd10-k118',   'term-icd10-vn-2026', 'K11.8', 'Bệnh tuyến mang tai khác', 'K11', 1, 248),
('icd10-k119',   'term-icd10-vn-2026', 'K11.9', 'Bệnh tuyến mang tai, không xác định', 'K11', 1, 249),

-- ── K12: Viêm miệng ──
('icd10-k12',    'term-icd10-vn-2026', 'K12',   'Viêm miệng và tổn thương liên quan', NULL, 0, 250),
('icd10-k120',   'term-icd10-vn-2026', 'K12.0', 'Loét miệng tái phát (aphthae)', 'K12', 1, 251),
('icd10-k121',   'term-icd10-vn-2026', 'K12.1', 'Viêm miệng dạng khác', 'K12', 1, 252),
('icd10-k122',   'term-icd10-vn-2026', 'K12.2', 'Viêm mô tế bào và áp xe miệng', 'K12', 1, 253),
('icd10-k123',   'term-icd10-vn-2026', 'K12.3', 'Loét miệng (aphthae) rộng', 'K12', 1, 254),

-- ── K13: Bệnh môi & niêm mạc miệng khác ──
('icd10-k13',    'term-icd10-vn-2026', 'K13',   'Bệnh môi và niêm mạc miệng khác', NULL, 0, 260),
('icd10-k130',   'term-icd10-vn-2026', 'K13.0', 'Viêm môi', 'K13', 1, 261),
('icd10-k131',   'term-icd10-vn-2026', 'K13.1', 'Phì đại kích ứng niêm mạc miệng', 'K13', 1, 262),
('icd10-k132',   'term-icd10-vn-2026', 'K13.2', 'Bạch sản và rối loạn biểu bì miệng', 'K13', 1, 263),
('icd10-k134',   'term-icd10-vn-2026', 'K13.4', 'U hạt và u hạt mủ niêm mạc miệng', 'K13', 1, 264),
('icd10-k135',   'term-icd10-vn-2026', 'K13.5', 'Xơ niêm mạc miệng dưới', 'K13', 1, 265),
('icd10-k136',   'term-icd10-vn-2026', 'K13.6', 'Phì đại реактив niêm mạc miệng', 'K13', 1, 266),
('icd10-k137',   'term-icd10-vn-2026', 'K13.7', 'Tổn thương niêm mạc miệng khác', 'K13', 1, 267),
('icd10-k138',   'term-icd10-vn-2026', 'K13.8', 'Bệnh niêm mạc miệng khác', 'K13', 1, 268),
('icd10-k139',   'term-icd10-vn-2026', 'K13.9', 'Bệnh niêm mạc miệng, không xác định', 'K13', 1, 269),

-- ── K14: Bệnh lưỡi ──
('icd10-k14',    'term-icd10-vn-2026', 'K14',   'Bệnh lưỡi', NULL, 0, 270),
('icd10-k140',   'term-icd10-vn-2026', 'K14.0', 'Viêm lưỡi', 'K14', 1, 271),
('icd10-k141',   'term-icd10-vn-2026', 'K14.1', 'Lưỡi địa lý', 'K14', 1, 272),
('icd10-k142',   'term-icd10-vn-2026', 'K14.2', 'Viêm lưỡi giữa hình thoi', 'K14', 1, 273),
('icd10-k143',   'term-icd10-vn-2026', 'K14.3', 'Phì đại nhú lưỡi', 'K14', 1, 274),
('icd10-k144',   'term-icd10-vn-2026', 'K14.4', 'Teo nhú lưỡi', 'K14', 1, 275),
('icd10-k145',   'term-icd10-vn-2026', 'K14.5', 'Đau lưỡi', 'K14', 1, 276),
('icd10-k146',   'term-icd10-vn-2026', 'K14.6', 'Viêm lưỡi, không xác định', 'K14', 1, 277),
('icd10-k148',   'term-icd10-vn-2026', 'K14.8', 'Bệnh lưỡi khác', 'K14', 1, 278),
('icd10-k149',   'term-icd10-vn-2026', 'K14.9', 'Bệnh lưỡi, không xác định', 'K14', 1, 279),

-- ── K92: Các bệnh đường tiêu hóa khác (liên quan nha khoa) ──
('icd10-k92',    'term-icd10-vn-2026', 'K92',   'Các bệnh đường tiêu hóa khác', NULL, 0, 280),
('icd10-k920',   'term-icd10-vn-2026', 'K92.0', 'Nôn ra máu', 'K92', 1, 281),
('icd10-k921',   'term-icd10-vn-2026', 'K92.1', 'Phân đen (melena)', 'K92', 1, 282),
('icd10-k922',   'term-icd10-vn-2026', 'K92.2', 'Đại tiện máu', 'K92', 1, 283),
('icd10-k928',   'term-icd10-vn-2026', 'K92.8', 'Bệnh đường tiêu hóa khác', 'K92', 1, 284),
('icd10-k929',   'term-icd10-vn-2026', 'K92.9', 'Bệnh đường tiêu hóa, không xác định', 'K92', 1, 285);

-- ══════════════════════════════════════════════════════════════════════
-- 3. Mapping Concept ↔ ICD-10 (primary)
-- ══════════════════════════════════════════════════════════════════════
-- Concept versions được seed từ migration 0051 với id pattern 'concept-version-{concept_id}'.

INSERT OR IGNORE INTO clinical_concept_icd10_mappings
  (id, concept_version_id, icd10_code_id, mapping_role, is_active)
VALUES
  -- concept-caries → K02.9 Sâu răng, không xác định
  ('mapping-caries-k029',    'concept-version-concept-caries',              'icd10-k029', 'primary', 1),
  -- concept-impacted → K01.1 Răng mọc ngầm
  ('mapping-impacted-k011',  'concept-version-concept-impacted',            'icd10-k011', 'primary', 1),
  -- concept-pulpitis → K04.0 Viêm tủy
  ('mapping-pulpitis-k040',  'concept-version-concept-pulpitis',            'icd10-k0400', 'primary', 1),
  -- concept-periapical → K04.4 Áp xe quanh chóp do tủy
  ('mapping-periapical-k044','concept-version-concept-periapical',          'icd10-k044', 'primary', 1),
  -- concept-fracture → K03.8 Bệnh mô cứng răng khác (gãy/vỡ)
  ('mapping-fracture-k038',  'concept-version-concept-fracture',            'icd10-k038', 'primary', 1),
  -- concept-gingivitis → K05.1 Viêm nướu mạn
  ('mapping-gingivitis-k051','concept-version-concept-gingivitis',          'icd10-k051', 'primary', 1),
  -- concept-periodontitis → K05.3 Viêm nha chu mạn
  ('mapping-perio-k053',     'concept-version-concept-periodontitis',       'icd10-k053', 'primary', 1),
  -- concept-periodontal-abscess → K05.2 Viêm nha chu cấp
  ('mapping-abscess-k052',   'concept-version-concept-periodontal-abscess', 'icd10-k052', 'primary', 1),
  -- concept-ulcer → K12.0 Loét miệng tái phát
  ('mapping-ulcer-k120',     'concept-version-concept-ulcer',              'icd10-k120', 'primary', 1),
  -- concept-leukoplakia → K13.2 Bạch sản
  ('mapping-leuko-k132',     'concept-version-concept-leukoplakia',        'icd10-k132', 'primary', 1),
  -- concept-malocclusion → K07.4 Sai khớp cắn, không xác định
  ('mapping-maloccl-k074',   'concept-version-concept-malocclusion',        'icd10-k074', 'primary', 1),
  -- concept-tmd-pain → K07.6 Rối loạn khớp thái dương hàm
  ('mapping-tmd-k076',       'concept-version-concept-tmd-pain',           'icd10-k076', 'primary', 1);
  -- concept-candidiasis: B37.0 (Chương B — Nấm Candida) — cần import riêng nếu dùng.
