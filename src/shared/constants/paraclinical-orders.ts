import type { ParaclinicalOrderType, ParaclinicalOrderStatus } from "@shared/types";

export interface ParaclinicalOrderTypeDefinition {
  label: string;
  group: "imaging" | "lab" | "procedure" | "other";
}

export const PARACLINICAL_ORDER_TYPES: Record<ParaclinicalOrderType, ParaclinicalOrderTypeDefinition> = {
  panoramic_xray:     { label: "Phim toàn hàm (OPG)", group: "imaging" },
  periapical_xray:    { label: "X-quang chóp", group: "imaging" },
  bitewing_xray:      { label: "X-quang kẽ răng", group: "imaging" },
  cbct:               { label: "CBCT hàm mặt", group: "imaging" },
  cephalometric_xray: { label: "X-quang sọ nghiêng", group: "imaging" },
  blood_test:         { label: "Xét nghiệm máu tổng quát", group: "lab" },
  coagulation_test:   { label: "Xét nghiệm đông máu", group: "lab" },
  blood_glucose:      { label: "Đường huyết", group: "lab" },
  hba1c:              { label: "HbA1c", group: "lab" },
  allergy_test:       { label: "Test dị ứng", group: "lab" },
  biopsy:             { label: "Sinh thiết", group: "procedure" },
  culture_sensitivity: { label: "Cấy và nhạy kháng sinh", group: "lab" },
  other:              { label: "Khác", group: "other" },
};

export const ORDER_STATUS_LABELS: Record<ParaclinicalOrderStatus, string> = {
  pending: "Chờ thực hiện",
  in_progress: "Đang thực hiện",
  completed: "Hoàn thành",
  cancelled: "Đã hủy",
};

export const ORDER_GROUP_LABELS: Record<string, string> = {
  imaging: "Chẩn đoán hình ảnh",
  lab: "Xét nghiệm",
  procedure: "Thủ thuật",
  other: "Khác",
};

export function getOrderTypeLabel(orderType: ParaclinicalOrderType): string {
  return PARACLINICAL_ORDER_TYPES[orderType]?.label ?? orderType;
}

export function getOrderTypeGroup(orderType: ParaclinicalOrderType): string {
  const group = PARACLINICAL_ORDER_TYPES[orderType]?.group ?? "other";
  return ORDER_GROUP_LABELS[group] ?? group;
}
