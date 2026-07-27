/**
 * Clinical Pathway Content Registry — V1: endodontic pain.
 *
 * Deterministic, versioned, no LLM. Approved by clinical council before pilot.
 * Checklist items and pattern rules are fixed in code; not admin-configurable in V1.
 */

import type { EndodonticPainAssessmentPayload, PathwayPattern } from "@shared/types";

export const PATHWAY_VERSION = "endodontic-pain-v1";
export const PATHWAY_KEY = "endodontic_pain" as const;

export interface ChecklistItem {
  key: string;
  label: string;
  required: boolean;
  source_reference: string;
  pathway_version: string;
}

/**
 * Fixed checklist for endodontic pain pathway V1.
 * Item keys match the structured assessment payload fields.
 */
export const ENDODONTIC_PAIN_CHECKLIST: ChecklistItem[] = [
  {
    key: "tooth_identified",
    label: "Xác định răng đau/nghi ngờ",
    required: true,
    source_reference: "AAE Pathways — Pulpal and Periapical Diagnosis",
    pathway_version: PATHWAY_VERSION,
  },
  {
    key: "spontaneous_pain",
    label: "Ghi pattern đau tự phát",
    required: true,
    source_reference: "AAE Pathways — Pulpal Diagnosis",
    pathway_version: PATHWAY_VERSION,
  },
  {
    key: "pain_on_biting",
    label: "Ghi đau khi nhai",
    required: true,
    source_reference: "AAE Pathways — Periapical Diagnosis",
    pathway_version: PATHWAY_VERSION,
  },
  {
    key: "prolonged_pain_after_stimulus",
    label: "Ghi đau kéo dài sau kích thích",
    required: true,
    source_reference: "AAE Pathways — Pulpal Diagnosis",
    pathway_version: PATHWAY_VERSION,
  },
  {
    key: "cold_test",
    label: "Ghi cold test",
    required: true,
    source_reference: "AAE Pathways — Pulpal Vitality Testing",
    pathway_version: PATHWAY_VERSION,
  },
  {
    key: "percussion",
    label: "Ghi percussion",
    required: true,
    source_reference: "AAE Pathways — Periapical Diagnosis",
    pathway_version: PATHWAY_VERSION,
  },
  {
    key: "palpation",
    label: "Ghi palpation",
    required: true,
    source_reference: "AAE Pathways — Periapical Diagnosis",
    pathway_version: PATHWAY_VERSION,
  },
  {
    key: "bite_test",
    label: "Ghi bite test",
    required: true,
    source_reference: "AAE Pathways — Pulpal Diagnosis",
    pathway_version: PATHWAY_VERSION,
  },
  {
    key: "large_caries_or_restoration",
    label: "Đánh giá sâu lớn hoặc phục hồi sâu/cũ",
    required: true,
    source_reference: "AAE Pathways — Etiology",
    pathway_version: PATHWAY_VERSION,
  },
  {
    key: "periapical_signs",
    label: "Đánh giá dấu hiệu quanh chóp trên hình ảnh",
    required: true,
    source_reference: "AAE Pathways — Periapical Diagnosis",
    pathway_version: PATHWAY_VERSION,
  },
  {
    key: "missing_data_documented",
    label: "Ghi nhận thiếu dữ liệu hoặc lý do không thực hiện nếu bỏ qua",
    required: false,
    source_reference: "Clinical governance — skip documentation",
    pathway_version: PATHWAY_VERSION,
  },
];

const CHECKLIST_BY_KEY = new Map(ENDODONTIC_PAIN_CHECKLIST.map((item) => [item.key, item]));

export function getChecklistItem(key: string): ChecklistItem | undefined {
  return CHECKLIST_BY_KEY.get(key);
}

/** Map assessment payload fields to checklist item keys that are "completed" when the field has a value. */
export function getCompletedItemKeys(assessment: EndodonticPainAssessmentPayload, toothIdentified: boolean): string[] {
  const keys: string[] = [];
  if (toothIdentified) keys.push("tooth_identified");
  if (assessment.symptoms.spontaneous_pain !== "unknown") keys.push("spontaneous_pain");
  if (assessment.symptoms.pain_on_biting !== "unknown") keys.push("pain_on_biting");
  if (assessment.symptoms.prolonged_pain_after_stimulus !== "unknown") keys.push("prolonged_pain_after_stimulus");
  if (assessment.tests.cold_test !== "not_done") keys.push("cold_test");
  if (assessment.tests.percussion !== "not_done") keys.push("percussion");
  if (assessment.tests.palpation !== "not_done") keys.push("palpation");
  if (assessment.tests.bite_test !== "not_done") keys.push("bite_test");
  if (assessment.context.large_caries !== "unknown" || assessment.context.deep_old_restoration !== "unknown") keys.push("large_caries_or_restoration");
  if (assessment.context.periapical_signs_on_imaging !== "not_assessed") keys.push("periapical_signs");
  if (assessment.notes && assessment.notes.trim().length > 0) keys.push("missing_data_documented");
  return keys;
}

/**
 * Deterministic pattern engine V1 — no LLM, no auto-diagnosis.
 * Returns max 1-2 prioritised patterns based on the assessment payload.
 */
export function evaluatePatterns(assessment: EndodonticPainAssessmentPayload, toothNumber: number): PathwayPattern[] {
  const patterns: PathwayPattern[] = [];

  // Pattern 1: Reversible pulpitis — spontaneous pain + positive cold + no prolonged pain
  if (
    assessment.symptoms.spontaneous_pain === "present" &&
    assessment.tests.cold_test === "positive" &&
    assessment.symptoms.prolonged_pain_after_stimulus === "absent"
  ) {
    patterns.push({
      pattern_key: "reversible_pulpitis",
      title: "Có thể viêm tủy có hồi phục",
      priority: 1,
      explanation: `Răng ${toothNumber}: đau tự phát, cold test dương tính, đau không kéo dài sau kích thích — phù hợp viêm tủy có hồi phục.`,
      evidence_item_keys: ["spontaneous_pain", "cold_test", "prolonged_pain_after_stimulus"],
      missing_item_keys: [],
      source_reference: "AAE Pathways — Reversible Pulpitis",
      pathway_version: PATHWAY_VERSION,
      review_status: "unreviewed",
    });
  }

  // Pattern 2: Symptomatic irreversible pulpitis — prolonged pain after stimulus
  if (
    assessment.symptoms.prolonged_pain_after_stimulus === "present" &&
    assessment.tests.cold_test === "positive"
  ) {
    patterns.push({
      pattern_key: "symptomatic_irreversible_pulpitis",
      title: "Có thể viêm tủy triệu chứng — không hồi phục",
      priority: 1,
      explanation: `Răng ${toothNumber}: đau kéo dài sau kích thích, cold test dương tính — phù hợp viêm tủy không hồi phục.`,
      evidence_item_keys: ["prolonged_pain_after_stimulus", "cold_test"],
      missing_item_keys: [],
      source_reference: "AAE Pathways — Symptomatic Irreversible Pulpitis",
      pathway_version: PATHWAY_VERSION,
      review_status: "unreviewed",
    });
  }

  // Pattern 3: Apical periodontitis — percussion + palpation positive + periapical signs
  if (
    assessment.tests.percussion === "positive" &&
    assessment.tests.palpation === "positive" &&
    (assessment.context.periapical_signs_on_imaging === "present" || assessment.context.periapical_signs_on_imaging === "unknown")
  ) {
    patterns.push({
      pattern_key: "apical_periodontitis",
      title: "Dấu hiệu viêm quanh chóp",
      priority: 2,
      explanation: `Răng ${toothNumber}: percussion và palpation dương tính — cần đánh giá viêm quanh chóp.`,
      evidence_item_keys: ["percussion", "palpation", "periapical_signs"],
      missing_item_keys: [],
      source_reference: "AAE Pathways — Symptomatic Apical Periodontitis",
      pathway_version: PATHWAY_VERSION,
      review_status: "unreviewed",
    });
  }

  // Pattern 4: Data insufficient — highlight missing critical tests
  const missing: string[] = [];
  if (assessment.tests.cold_test === "not_done") missing.push("cold_test");
  if (assessment.tests.percussion === "not_done") missing.push("percussion");
  if (assessment.tests.palpation === "not_done") missing.push("palpation");
  if (assessment.tests.bite_test === "not_done") missing.push("bite_test");

  if (missing.length >= 2) {
    patterns.push({
      pattern_key: "data_insufficient",
      title: "Dữ liệu chưa đủ / cần kiểm tra thêm",
      priority: 0,
      explanation: `Chưa thực hiện ${missing.length} test cốt lõi (${missing.join(", ")}). Cần hoàn tất trước khi đánh giá thêm.`,
      evidence_item_keys: [],
      missing_item_keys: missing,
      source_reference: "Clinical governance — data completeness",
      pathway_version: PATHWAY_VERSION,
      review_status: "unreviewed",
    });
  }

  // Sort by priority (0 = highest urgency like "data insufficient")
  patterns.sort((a, b) => a.priority - b.priority);

  // Return max 2 patterns per plan
  return patterns.slice(0, 2);
}
