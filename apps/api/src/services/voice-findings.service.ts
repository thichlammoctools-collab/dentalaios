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

export interface ParsedFinding {
  scope: "tooth" | "full_mouth" | "soft_tissue";
  tooth_number: number | null;
  area?: string;
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
    if (AI && typeof (AI as { run?: unknown }).run === "function") {
      try {
        const result = await (AI as { run: (model: string, inputs: object) => Promise<{ response?: string }> }).run(
          "@cf/meta/llama-4-scout-17b-16e-instruct",
          {
            messages: [
              {
                role: "system",
                content: `Bạn là bác sĩ nha khoa chuyên nghiệp. Đọc bản ghi ghi âm lời bác sĩ mô tả phát hiện lâm sàng và trả về CHÍNH XÁC một mảng JSON các findings.

QUY TẮC:
- Mỗi câu mô tả 1 răng = 1 finding có scope="tooth" và tooth_number = số FDI
- Mô tả toàn hàm (ca răng, tẩy trắng, khám toàn hàm…) = scope="full_mouth"
- Mô tả mô mềm (lợi, lưỡi, niêm mạc…) = scope="soft_tissue", chọn area phù hợp nhất
- condition phải thuộc danh sách: caries, fracture, missing, periapical, calculus, pulpitis, discoloration, wear, other, gingivitis, periodontitis, ulcer, aphtha, leukoplakia, erythroplakia, herpes, candidiasis, fissure, abscess, fistula, recession, hypertrophy, tongue_coating, geographic_tongue, fissured_tongue, macroglossia, torus, tmd_pain, clicking, limitation, sialolith, swelling, staining, halitosis, dry_mouth, bruxism
- notes là phần mô tả thêm không thuộc condition chuẩn
- Luôn trả JSON thuần túy, KHÔNG có text giải thích khác
- Nếu không chắc chắn về số răng FDI, dùng null và ghi vào notes
- Không bào chữa, chỉ trả JSON

Format:
{
  "findings": [
    {
      "scope": "tooth|full_mouth|soft_tissue",
      "tooth_number": <số FDI hoặc null>,
      "area": "<một trong: gum|tongue|buccal|palate|floor_mouth|lip|pharynx|jaw|tmj|salivary_gland — CHỈ khi scope=soft_tissue, bỏ trống otherwise>",
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
            ai_model: "llama-4-scout-17b",
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
      const scope = (item.scope === "tooth" || item.scope === "full_mouth" || item.scope === "soft_tissue")
        ? item.scope
        : "tooth";
      const tooth = item.tooth_number == null ? null : Number(item.tooth_number);
      const condition = String(item.condition || "other").toLowerCase().trim();
      const area = (() => {
        const a = String(item.area ?? "").toLowerCase().trim();
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
          "tuyến": "salivary_gland",
        };
        return areaMap[a] ?? "gum";
      })();
      const notes = String(item.notes ?? "").trim();

      return { scope, tooth_number: tooth, area, condition, notes } as ParsedFinding;
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

    if (!findings.some((f) => f.scope === "full_mouth")) {
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
      const existing = findings.find((f) => f.scope === "soft_tissue" && f.area === area);
      if (!existing) {
        findings.push({ scope: "soft_tissue", tooth_number: null, area, condition, notes: "" });
      }
    }
  }

  return findings.length > 0 ? findings : [];
}
