import type { AnatomicalSite, FindingCategory, FindingScope } from "@shared/types";

export interface FindingConditionOption {
  value: string;
  label: string;
}

export interface ClinicalFindingCategoryDefinition {
  value: FindingCategory;
  label: string;
  description: string;
  scope: FindingScope;
  defaultSite?: AnatomicalSite;
  conditions: FindingConditionOption[];
}

export const ANATOMICAL_SITE_OPTIONS: Array<{ value: AnatomicalSite; label: string }> = [
  { value: "gum", label: "Nướu" },
  { value: "tongue", label: "Lưỡi" },
  { value: "buccal", label: "Niêm mạc má" },
  { value: "palate", label: "Vòm miệng" },
  { value: "floor_mouth", label: "Sàn miệng" },
  { value: "lip", label: "Môi" },
  { value: "pharynx", label: "Hầu họng" },
  { value: "parotid_gland", label: "Tuyến mang tai" },
  { value: "submandibular_gland", label: "Tuyến dưới hàm" },
  { value: "sublingual_gland", label: "Tuyến dưới lưỡi" },
  { value: "minor_salivary_gland", label: "Tuyến nước bọt nhỏ" },
  { value: "tmj", label: "Khớp thái dương hàm" },
];

export const CLINICAL_FINDING_CATEGORIES: ClinicalFindingCategoryDefinition[] = [
  {
    value: "tooth_hard_tissue",
    label: "Răng & mô cứng",
    description: "Khám răng theo hệ FDI/ISO 3950 và mặt răng.",
    scope: "tooth",
    conditions: [
      { value: "good", label: "Tốt" }, { value: "caries", label: "Sâu răng" },
      { value: "unerupted", label: "Chưa mọc" }, { value: "impacted", label: "Mọc ngầm" },
      { value: "tilted", label: "Mọc nghiêng" }, { value: "fracture", label: "Gãy/vỡ" },
      { value: "missing", label: "Mất răng" }, { value: "periapical", label: "Viêm quanh chóp" },
      { value: "pulpitis", label: "Viêm tủy" }, { value: "discoloration", label: "Đổi màu" },
      { value: "wear", label: "Mòn răng" }, { value: "other", label: "Khác" },
    ],
  },
  {
    value: "periodontal",
    label: "Nha chu",
    description: "Khám nướu và mô nâng đỡ răng.",
    scope: "region",
    defaultSite: "gum",
    conditions: [
      { value: "plaque", label: "Mảng bám" }, { value: "calculus", label: "Vôi răng" },
      { value: "gingivitis", label: "Viêm nướu" }, { value: "periodontitis", label: "Viêm nha chu" },
      { value: "recession", label: "Tụt nướu" }, { value: "hypertrophy", label: "Phì đại nướu" },
      { value: "abscess", label: "Áp xe nha chu" }, { value: "fistula", label: "Rò nha chu" },
      { value: "mobility", label: "Lung lay răng" }, { value: "furcation", label: "Tổn thương chẽ" },
      { value: "other", label: "Khác" },
    ],
  },
  {
    value: "oral_soft_tissue",
    label: "Mô mềm miệng",
    description: "Khám niêm mạc miệng, lưỡi, môi và tuyến nước bọt.",
    scope: "region",
    defaultSite: "tongue",
    conditions: [
      { value: "ulcer", label: "Loét miệng" }, { value: "aphtha", label: "Aphthae" },
      { value: "leukoplakia", label: "Bạch sản" }, { value: "erythroplakia", label: "Hồng sản" },
      { value: "herpes", label: "Herpes" }, { value: "candidiasis", label: "Nấm miệng" },
      { value: "fissure", label: "Nứt khóe miệng" }, { value: "tongue_coating", label: "Bựa lưỡi" },
      { value: "geographic_tongue", label: "Lưỡi địa lý" }, { value: "fissured_tongue", label: "Lưỡi nứt" },
      { value: "macroglossia", label: "Lưỡi to" }, { value: "sialolith", label: "Sỏi tuyến nước bọt" },
      { value: "swelling", label: "Sưng" }, { value: "other", label: "Khác" },
    ],
  },
  {
    value: "occlusion_orthodontics",
    label: "Khớp cắn & chỉnh nha",
    description: "Phân loại Angle và các bất thường khớp cắn.",
    scope: "full_mouth",
    conditions: [
      { value: "angle_class_i", label: "Angle loại I" }, { value: "angle_class_ii_div_1", label: "Angle loại II, chia 1" },
      { value: "angle_class_ii_div_2", label: "Angle loại II, chia 2" }, { value: "angle_class_iii", label: "Angle loại III" },
      { value: "deep_bite", label: "Cắn sâu" }, { value: "open_bite", label: "Cắn hở" },
      { value: "crossbite", label: "Cắn chéo" }, { value: "edge_to_edge", label: "Cắn đối đầu" },
      { value: "overjet", label: "Cắn chìa" }, { value: "crowding", label: "Chen chúc" },
      { value: "spacing", label: "Thưa răng" }, { value: "other", label: "Khác" },
    ],
  },
  {
    value: "tmj_function",
    label: "TMJ & chức năng",
    description: "Khám khớp thái dương hàm, cơ nhai và chức năng.",
    scope: "region",
    defaultSite: "tmj",
    conditions: [
      { value: "tmd_pain", label: "Đau TMJ/cơ nhai" }, { value: "clicking", label: "Tiếng click" },
      { value: "crepitus", label: "Tiếng lạo xạo" }, { value: "limitation", label: "Hạn chế há miệng" },
      { value: "deviation", label: "Lệch đường há" }, { value: "bruxism", label: "Nghiến/siết răng" },
      { value: "other", label: "Khác" },
    ],
  },
  {
    value: "preventive_general",
    label: "Toàn miệng & dự phòng",
    description: "Đánh giá tổng quát và chỉ định dự phòng.",
    scope: "full_mouth",
    conditions: [
      { value: "plaque", label: "Mảng bám toàn miệng" }, { value: "calculus", label: "Vôi răng toàn miệng" },
      { value: "halitosis", label: "Hôi miệng" }, { value: "dry_mouth", label: "Khô miệng" },
      { value: "caries_risk", label: "Nguy cơ sâu răng" }, { value: "oral_hygiene_instruction", label: "Hướng dẫn vệ sinh" },
      { value: "fluoride", label: "Fluoride dự phòng" }, { value: "sealant", label: "Trám bít hố rãnh" },
      { value: "other", label: "Khác" },
    ],
  },
];

export function getFindingCategory(category: FindingCategory): ClinicalFindingCategoryDefinition {
  const definition = CLINICAL_FINDING_CATEGORIES.find((item) => item.value === category);
  if (!definition) throw new Error(`Unknown clinical finding category: ${category}`);
  return definition;
}

export function getFindingConditionLabel(category: FindingCategory, condition: string): string {
  const categoryLabel = CLINICAL_FINDING_CATEGORIES
    .find((item) => item.value === category)
    ?.conditions.find((item) => item.value === condition)?.label;
  if (categoryLabel) return categoryLabel;

  // Legacy records may predate the current category taxonomy.
  return CLINICAL_FINDING_CATEGORIES
    .flatMap((item) => item.conditions)
    .find((item) => item.value === condition)?.label ?? condition;
}

export function getAnatomicalSiteLabel(site?: AnatomicalSite): string {
  return ANATOMICAL_SITE_OPTIONS.find((item) => item.value === site)?.label ?? site ?? "";
}

export const PERIODONTAL_SURFACE_OPTIONS = [
  { value: "mesial", label: "Gần" },
  { value: "distal", label: "Xa" },
  { value: "buccal", label: "Ngoài (má)" },
  { value: "lingual", label: "Trong (lưỡi/khẩu cái)" },
] as const;

export const PERIODONTAL_POCKET_POINTS = [
  { value: "mesiobuccal", label: "Gần - ngoài" },
  { value: "midbuccal", label: "Giữa - ngoài" },
  { value: "distobuccal", label: "Xa - ngoài" },
  { value: "mesiolingual", label: "Gần - trong" },
  { value: "midlingual", label: "Giữa - trong" },
  { value: "distolingual", label: "Xa - trong" },
] as const;

export function getFindingLocationLabel(location?: {
  laterality?: string;
  vertical_position?: string;
  surface_orientation?: string;
}): string {
  if (!location) return "";
  const labels: Record<string, string> = {
    right: "phải", left: "trái", bilateral: "hai bên", midline: "đường giữa",
    upper: "trên", lower: "dưới", internal: "trong", external: "ngoài",
  };
  return [location.laterality, location.vertical_position, location.surface_orientation]
    .map((value) => value ? labels[value] ?? value : "")
    .filter(Boolean)
    .join(", ");
}
