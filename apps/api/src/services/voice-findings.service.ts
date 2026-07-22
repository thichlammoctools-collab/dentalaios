/**
 * Voice-to-findings service — parses spoken dental observations into structured ClinicalFinding objects.
 *
 * Uses Cloudflare Workers AI (@cf/meta/llama-4-scout-17b-16e-instruct) to convert free-form Vietnamese
 * transcript text into a list of structured findings (tooth number, scope, condition, notes).
 *
 * Falls back to a rule-based parser if AI is unavailable.
 */

import type { D1Database } from "@cloudflare/workers-types";
import { createVisitsRepository } from "../repositories/visits.repo";
import { NotFoundError } from "../lib/errors";
import { aiModelConfigService } from "./ai-model-config.service";
import type { AnatomicalSite, FindingCategory, FindingLocationDetails, FindingMeasurements, FindingScope } from "@shared/types";

export interface ParsedFinding {
  category: FindingCategory;
  scope: FindingScope;
  tooth_number: number | null;
  anatomical_site?: AnatomicalSite;
  location_details?: FindingLocationDetails;
  measurements?: FindingMeasurements;
  condition: string;
  notes: string;
}

export interface VoiceFindingsResult {
  findings: ParsedFinding[];
  ai_model: string;
  generated_at: string;
}

export interface VoiceFindingsDeps {
  db: D1Database;
  AI: unknown;
}

const SOFT_TISSUE_AREAS = [
  "gum", "tongue", "buccal", "palate",
  "floor_mouth", "lip", "pharynx", "jaw", "tmj", "salivary_gland",
  "parotid_gland", "submandibular_gland", "sublingual_gland", "minor_salivary_gland",
] as const;

// ─── Main entry point ──────────────────────────────────────────

export const voiceFindingsService = {
  async parseTranscript(
    deps: VoiceFindingsDeps,
    tenantId: string,
    visitId: string,
    transcript: string,
  ): Promise<VoiceFindingsResult> {
    const { db, AI } = deps;

    const visitsRepo = createVisitsRepository(db);
    const visit = await visitsRepo.getById(tenantId, visitId);
    if (!visit) throw new NotFoundError("Visit not found");

    const patient = await deps.db
      .prepare("SELECT name, gender, date_of_birth FROM patients WHERE id = ? AND tenant_id = ? LIMIT 1")
      .bind(visit.patient_id, tenantId)
      .first() as { name: string; gender: string; date_of_birth: string } | null;

    const patientInfo = patient
      ? `${patient.name}, ${patient.gender === "M" ? "Nam" : patient.gender === "F" ? "Nữ" : "Khác"}, sinh ${patient.date_of_birth}`
      : "không rõ";

    // Try Cloudflare AI
    const model = await aiModelConfigService.resolve(db, "voice_findings_parse");
    if (model.is_enabled && AI && typeof (AI as { run?: unknown }).run === "function") {
      try {
        const result = await (AI as { run: (model: string, inputs: object) => Promise<{ response?: string }> }).run(
          model.model_id,
          {
            messages: [
              {
                role: "system",
                content: `Bạn là bác sĩ nha khoa chuyên nghiệp. Đọc bản ghi ghi âm lời bác sĩ mô tả phát hiện lâm sàng và trả về CHÍNH XÁC một mảng JSON các findings.

QUY TẮC:
- Răng và mô cứng: category="tooth_hard_tissue", scope="tooth", tooth_number = số FDI
- Nha chu theo răng: category="periodontal", scope="tooth", tooth_number = số FDI, anatomical_site="gum". Vôi răng/viêm nướu có location_details.periodontal_surfaces=[mesial|distal|buccal|lingual]. Viêm nha chu có measurements.periodontal_pocket_depth_mm với các điểm mesiobuccal, midbuccal, distobuccal, mesiolingual, midlingual, distolingual (mm).
- Mô mềm miệng: category="oral_soft_tissue", scope="region", chọn anatomical_site phù hợp
- Phân loại khớp cắn: category="occlusion_orthodontics", scope="full_mouth"
- TMJ/cơ nhai: category="tmj_function", scope="region", anatomical_site="tmj"
- Khám tổng quát/dự phòng: category="preventive_general", scope="full_mouth"
- anatomical_site tuyến nước bọt: parotid_gland, submandibular_gland, sublingual_gland hoặc minor_salivary_gland; dùng location_details.laterality khi có bên.
- condition phải thuộc danh sách: caries, fracture, missing, periapical, calculus, pulpitis, discoloration, wear, other, gingivitis, periodontitis, ulcer, aphtha, leukoplakia, erythroplakia, herpes, candidiasis, fissure, abscess, fistula, recession, hypertrophy, tongue_coating, geographic_tongue, fissured_tongue, macroglossia, torus, tmd_pain, clicking, limitation, sialolith, swelling, staining, halitosis, dry_mouth, bruxism, angle_class_i, angle_class_ii_div_1, angle_class_ii_div_2, angle_class_iii, deep_bite, open_bite, crossbite, edge_to_edge, overjet, crowding, spacing
- notes là phần mô tả thêm không thuộc condition chuẩn
- Luôn trả JSON thuần túy, KHÔNG có text giải thích khác
- Nếu không chắc chắn về số răng FDI, dùng null và ghi vào notes
- Không bào chữa, chỉ trả JSON

Format:
{
  "findings": [
    {
      "category": "tooth_hard_tissue|periodontal|oral_soft_tissue|occlusion_orthodontics|tmj_function|preventive_general",
      "scope": "tooth|region|full_mouth",
      "tooth_number": <số FDI hoặc null>,
       "anatomical_site": "<gum|tongue|buccal|palate|floor_mouth|lip|pharynx|jaw|tmj|parotid_gland|submandibular_gland|sublingual_gland|minor_salivary_gland — chỉ khi scope=region, hoặc gum cho nha chu theo răng>",
       "location_details": "<object có periodontal_surfaces/laterality/vertical_position/surface_orientation nếu có>",
      "measurements": "<object số đo như overjet_mm hoặc max_opening_mm, hoặc {}>",
      "condition": "<tên tiếng Anh viết thường>",
      "notes": "<mô tả thêm hoặc empty string>"
    }
  ]
}`,
              },
              {
                role: "user",
                content: `Bệnh nhân: ${patientInfo}\nNgày khám: ${new Date(visit.date).toLocaleDateString("vi-VN")}\n\nBản ghi ghi âm:\n${transcript}\n\nHãy phân tích bản ghi và trả về JSON findings:`,
              },
            ],
            max_tokens: 1024,
            temperature: 0.1,
          },
        );
        const raw = (result as { response?: string }).response || "{}";
        const parsed = parseVoiceResponse(raw);
        if (parsed && parsed.findings.length > 0) {
          return {
            findings: parsed.findings,
            ai_model: model.model_id,
            generated_at: new Date().toISOString(),
          };
        }
      } catch {
        // fall through to fallback
      }
    }

    // Fallback: rule-based extraction
    return {
      findings: extractFindFromText(transcript),
      ai_model: "rule-based-fallback",
      generated_at: new Date().toISOString(),
    };
  },
};

// ─── Response parser ───────────────────────────────────────────

function parseVoiceResponse(raw: string): { findings: ParsedFinding[] } | null {
  try {
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;
    const parsed = JSON.parse(jsonMatch[0]);
    if (!Array.isArray(parsed.findings)) return null;

    const findings: ParsedFinding[] = parsed.findings.map((item: Record<string, unknown>) => {
      const scope = (item.scope === "tooth" || item.scope === "region" || item.scope === "full_mouth")
        ? item.scope
        : "tooth";
      const category = isFindingCategory(item.category) ? item.category : "tooth_hard_tissue";
      const tooth = item.tooth_number == null ? null : Number(item.tooth_number);
      const condition = String(item.condition || "other").toLowerCase().trim();
      const area = (() => {
        const a = String(item.anatomical_site ?? "").toLowerCase().trim();
        if (!a) return undefined;
        if (SOFT_TISSUE_AREAS.includes(a as typeof SOFT_TISSUE_AREAS[number])) return a;
        // fuzzy match
        const areaMap: Record<string, string> = {
          "nướu": "gum", "lợi": "gum",
          "lưỡi": "tongue",
          "niêm mạc": "buccal", "má": "buccal",
          "vòm": "palate",
          "đáy": "floor_mouth", "đáy miệng": "floor_mouth",
          "môi": "lip",
          "họng": "pharynx",
          "xương hàm": "jaw", "hàm": "jaw",
          "khớp": "tmj", "tmj": "tmj",
          "tuyến mang tai": "parotid_gland", "tuyến dưới hàm": "submandibular_gland", "tuyến dưới lưỡi": "sublingual_gland", "tuyến": "minor_salivary_gland",
        };
        return areaMap[a] ?? "gum";
      })();
      const measurements = typeof item.measurements === "object" && item.measurements !== null
        ? item.measurements as FindingMeasurements
        : undefined;
      const locationDetails = typeof item.location_details === "object" && item.location_details !== null
        ? item.location_details as FindingLocationDetails
        : undefined;
      const notes = String(item.notes ?? "").trim();

      return { category, scope, tooth_number: tooth, anatomical_site: area as AnatomicalSite | undefined, location_details: locationDetails, measurements, condition, notes };
    });

    return { findings };
  } catch {
    return null;
  }
}

// ─── Rule-based fallback ───────────────────────────────────────

function extractFindFromText(text: string): ParsedFinding[] {
  const findings: ParsedFinding[] = [];

  // Extract tooth numbers: "răng 36", "36", "#36", "FDI 36"
  const toothMatches = text.matchAll(/(?:răng\s*#?\s*|tooth\s*#?\s*|FDI\s*|số\s*)(\d{1,2})/gi);
  const toothNums = Array.from(toothMatches, (m) => parseInt(m[1])).filter(
    (n) => n >= 11 && n <= 88,
  );

  const uniqueTeeth = [...new Set(toothNums)];
  for (const tooth of uniqueTeeth) {
    const finding: ParsedFinding = {
      category: "tooth_hard_tissue",
      scope: "tooth",
      tooth_number: tooth,
      condition: "other",
      notes: "",
    };

    // Map condition keywords
    const lower = text.toLowerCase();
    if (/\bs[áàảã]u\b/.test(lower)) finding.condition = "caries";
    else if (/\bg[ãáàả]y\b|\bv[ỡôõo]/.test(lower) && /r[ăâ]ng\b|\bfracture\b/.test(lower)) finding.condition = "fracture";
    else if (/\bm[ấầậ]t\b|\bmissing\b/.test(lower)) finding.condition = "missing";
    else if (/\bviêm\s*t[ủùúû]y\b|\bpulpitis\b/.test(lower)) finding.condition = "pulpitis";
    else if (/\bviêm\s*(?:quanh\s*)?ch[óòỏõô]p\b|\bperiapical\b/.test(lower)) finding.condition = "periapical";
    else if (/\bcao\s*r[ăâ]nh\b|\bv[ôõ]i\b|\bcalculus\b/.test(lower)) finding.condition = "calculus";
    else if (/\bđ[ổốộỗ]i\s*m[àáảã]u\b|\bdiscoloration\b/.test(lower)) finding.condition = "discoloration";
    else if (/\bm[òõô]n\b|\bwear\b|\battrition\b/.test(lower)) finding.condition = "wear";
    else if (/\bh[ôõo]i\s*m[ắầậ]ng\b|\bhalitosis\b/.test(lower)) finding.condition = "halitosis";
    else if (/\bviêm\s*l[ợiĩíì]i\b|\bgingivitis\b/.test(lower)) finding.condition = "gingivitis";

    findings.push(finding);
  }

  // Full-mouth patterns
  const lower = text.toLowerCase();
  if (/\btoàn\s*h[àáảã]m\b|\bfull\s*mouth\b/i.test(text)) {
    const fmFinding: ParsedFinding = {
      category: "preventive_general",
      scope: "full_mouth",
      tooth_number: null,
      condition: "other",
      notes: "",
    };
    if (/\bcao\s*r[ăâ]nh\b|\bv[ôõ]i\b/.test(lower)) fmFinding.condition = "calculus";
    else if (/\bt[ẩầậ]y\s*tr[ắầậ]ng\b|\bwhitening\b|\bstaining\b/.test(lower)) fmFinding.condition = "staining";
    else if (/\bh[ôõo]i\s*m[ắầậ]ng\b/.test(lower)) fmFinding.condition = "halitosis";
    else if (/\bnghiến\b|\bbruxism\b/.test(lower)) fmFinding.condition = "bruxism";
    else if (/\bkh[óòỏõô]\s*m[ắầậ]ng\b|\bdry\s*mouth\b/i.test(lower)) fmFinding.condition = "dry_mouth";

    if (!findings.some((f) => f.category === "preventive_general")) {
      findings.push(fmFinding);
    }
  }

  // Soft tissue patterns
  const stPatterns = [
    { regex: /nước|lợi|nướu|gingiv/i, area: "gum", condition: "gingivitis" },
    { regex: /lưỡi|tongue/i, area: "tongue", condition: "other" },
    { regex: /niêm mạc|má|buccal/i, area: "buccal", condition: "other" },
    { regex: /vòm|palat/i, area: "palate", condition: "other" },
    { regex: /môi|lip/i, area: "lip", condition: "other" },
    { regex: /xương hàm|jaw/i, area: "jaw", condition: "other" },
    { regex: /khớp\s*(?:tmj|thái dương)|tmd/i, area: "tmj", condition: "tmd_pain" },
    { regex: /tuyến nước bọt|salivary/i, area: "salivary_gland", condition: "other" },
    { regex: /đáy miếng|floor/i, area: "floor_mouth", condition: "other" },
    { regex: /họng|pharynx|pharin/i, area: "pharynx", condition: "other" },
  ] satisfies Array<{ regex: RegExp; area: string; condition: string }>;

  for (const { regex, area, condition } of stPatterns) {
    if (regex.test(text)) {
      const category: FindingCategory = area === "gum" ? "periodontal" : area === "tmj" ? "tmj_function" : "oral_soft_tissue";
      const existing = findings.find((f) => f.category === category && f.anatomical_site === area);
      if (!existing) {
        findings.push({ category, scope: "region", tooth_number: null, anatomical_site: area as AnatomicalSite, condition, notes: "" });
      }
    }
  }

  const occlusionPatterns = [
    { regex: /angle\s*(?:loại|class)?\s*i\b|hạng\s*i\b/i, condition: "angle_class_i" },
    { regex: /angle\s*(?:loại|class)?\s*ii\s*(?:div(?:ision)?\s*)?1|hạng\s*ii\s*(?:1|một)/i, condition: "angle_class_ii_div_1" },
    { regex: /angle\s*(?:loại|class)?\s*ii\s*(?:div(?:ision)?\s*)?2|hạng\s*ii\s*(?:2|hai)/i, condition: "angle_class_ii_div_2" },
    { regex: /angle\s*(?:loại|class)?\s*iii|hạng\s*iii/i, condition: "angle_class_iii" },
    { regex: /cắn\s*sâu|deep\s*bite/i, condition: "deep_bite" },
    { regex: /cắn\s*hở|open\s*bite/i, condition: "open_bite" },
    { regex: /cắn\s*chéo|cross\s*bite/i, condition: "crossbite" },
    { regex: /cắn\s*đối\s*đầu|edge\s*to\s*edge/i, condition: "edge_to_edge" },
    { regex: /overjet|chìa/i, condition: "overjet" },
    { regex: /chen\s*chúc|crowding/i, condition: "crowding" },
    { regex: /thưa\s*răng|spacing/i, condition: "spacing" },
  ];
  for (const { regex, condition } of occlusionPatterns) {
    if (regex.test(text) && !findings.some((f) => f.category === "occlusion_orthodontics" && f.condition === condition)) {
      findings.push({ category: "occlusion_orthodontics", scope: "full_mouth", tooth_number: null, condition, notes: "" });
    }
  }

  return findings.length > 0 ? findings : [];
}

function isFindingCategory(value: unknown): value is FindingCategory {
  return ["tooth_hard_tissue", "periodontal", "oral_soft_tissue", "occlusion_orthodontics", "tmj_function", "preventive_general"].includes(String(value));
}
