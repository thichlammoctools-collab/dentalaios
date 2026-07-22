/**
 * AI appointment service — two functions:
 *
 * 1. parseChatMessage: 1-shot NL Vietnamese → structured Appointment JSON.
 *    Input: free-form text (e.g. "Cho lịch hẹn BS Nam khám răng 36 cho BN An明天上午9h30")
 *    Output: { patient_hint, clinician_hint, scheduled_at, duration_min, procedure, notes }
 *
 * 2. suggestNextAppointment: from current visit → suggest follow-up appointment.
 *    Input: visit_id (reads visit + findings + treatment plan)
 *    Output: { suggested_date, suggested_time, duration_min, procedure, notes }
 *
 * Uses Cloudflare Workers AI (@cf/meta/llama-4-scout-17b-16e-instruct).
 * Fallback: returns null so the frontend can ask for manual input.
 */

import type { D1Database } from "@cloudflare/workers-types";
import { createVisitsRepository } from "../repositories/visits.repo";
import { createFindingsRepository } from "../repositories/findings.repo";
import { createTreatmentPlansRepository } from "../repositories/treatment-plans.repo";
import { createTreatmentItemsRepository } from "../repositories/treatment-items.repo";
import { createPatientsRepository } from "../repositories/patients.repo";
import { createUsersRepository } from "../repositories/users.repo";
import { NotFoundError } from "../lib/errors";
import { isDoctorRole } from "@shared/constants";
import { getAnatomicalSiteLabel, getFindingCategory } from "@shared/constants/clinical-findings";
import { aiModelConfigService } from "./ai-model-config.service";

// ─── Result types ────────────────────────────────────────────

export interface ParsedAppointment {
  /** Patient name hint (to be matched against existing patients) */
  patient_hint: string | null;
  /** Doctor name hint (to be matched against existing doctors) */
  clinician_hint: string | null;
  /** ISO datetime string (UTC) */
  scheduled_at: string | null;
  /** Duration in minutes */
  duration_min: number;
  /** Procedure type hint */
  procedure: string | null;
  /** Free-form notes */
  notes: string | null;
  /** Human-readable summary of what was understood */
  summary: string;
}

export interface ParseChatResult {
  appointment: ParsedAppointment;
  ai_model: string;
  generated_at: string;
}

export interface NextAppointmentSuggestion {
  /** Suggested date (YYYY-MM-DD) */
  suggested_date: string;
  /** Suggested time (HH:MM) */
  suggested_time: string;
  /** Duration in minutes */
  duration_min: number;
  /** Procedure type */
  procedure: string | null;
  /** Clinical reason for follow-up */
  reason: string;
  /** Notes for the receptionist */
  notes: string;
}

export interface SuggestNextResult {
  suggestion: NextAppointmentSuggestion | null;
  ai_model: string;
  generated_at: string;
}

export interface AiAppointmentDeps {
  db: D1Database;
  AI: unknown;
}

// ─── Parse chat message ──────────────────────────────────────

export const aiAppointmentService = {
  async parseChatMessage(
    deps: AiAppointmentDeps,
    tenantId: string,
    message: string,
  ): Promise<ParseChatResult> {
    const { db, AI } = deps;

    // Gather context: patient names + doctor names for the LLM to reference
    const [patients, doctors] = await Promise.all([
      db.prepare("SELECT id, name, phone FROM patients WHERE tenant_id = ? LIMIT 100")
        .bind(tenantId).all<{ id: string; name: string; phone: string }>(),
      db.prepare(`SELECT u.id, u.role_id, u.name, r.system_key AS role_key, r.name AS role_name
                    FROM users u JOIN roles r ON r.id = u.role_id
                    WHERE u.tenant_id = ? AND u.is_active = 1 LIMIT 50`)
        .bind(tenantId).all<{ id: string; role_id: string; name: string; role_key?: string; role_name: string }>(),
    ]);

    const patientList = patients.results.map((p) => `  - ${p.name} (SĐT: ${p.phone})`).join("\n");
    const doctorList = doctors.results
      .filter((d) => isDoctorRole(d.role_key, d.role_id, d.role_name))
      .map((d) => `  - ${d.name}`)
      .join("\n");

    const model = await aiModelConfigService.resolve(db, "appointment_chat_parse");
    if (model.is_enabled && AI && typeof (AI as { run?: unknown }).run === "function") {
      try {
        const result = await (AI as { run: (model: string, inputs: object) => Promise<{ response?: string }> }).run(
          model.model_id,
          {
            messages: [
              {
                role: "system",
                content: `Bạn là trợ lý đặt lịch nha khoa. Phân tích tin nhắn tiếng Việt của người dùng và tạo một lịch hẹn.

DANH SÁCH BỆNH NHÂN HIỆN CÓ:
${patientList || "(chưa có bệnh nhân)"}

DANH SÁCH BÁC SĨ HIỆN CÓ:
${doctorList || "(chưa có bác sĩ)"}

QUY TẮC:
- "patient_hint": tên bệnh nhân trong tin nhắn. Phải khớp tên trong danh sách trên. Nếu không tìm thấy, null.
- "clinician_hint": tên bác sĩ. Phải khớp tên trong danh sách. Nếu không thấy, null.
- "scheduled_at": giờ hẹn dưới dạng ISO 8601 UTC. Tính từ giờ hiện tại nếu người dùng nói "ngày mai", "tuần sau", "thứ 2" etc.
  - Nếu người dùng chỉ nói ngày (không nói giờ), dùng giờ mặc định 09:00.
  - Nếu người dùng nói "chiều" mà không rõ giờ, dùng 14:00.
  - Luôn trả về timezone UTC (+07:00 convert sang UTC).
- "duration_min": mặc định 30 phút. Nếu người dùng nói "khám nhanh" = 15, "điều trị tủy" = 60, "cạo vôi" = 30.
- "procedure": procedure code (filling, root_canal, extraction, crown, scaling, implant, veneer, examination, other)
- "notes": thông tin thêm từ tin nhắn
- "summary": 1 câu tóm tắt lịch hẹn bằng tiếng Việt rõ ràng

Ví dụ:
- "Cho BS Nam khám BN An ngày mai 9h30" → scheduled_at = ngày mai 09:30 UTC, clinician_hint = "Nam", patient_hint = "An"
- "BS Lan khám răng 36 cho BN Bình thứ 2 tuần sau, 2h" → duration = 120, procedure = other
- "Khám tổng quát cho BN Chính sáng nay 8h30" → procedure = examination

Trả CHÍNH XÁC JSON, KHÔNG thêm text khác:
{
  "patient_hint": "tên hoặc null",
  "clinician_hint": "tên hoặc null",
  "scheduled_at": "ISO datetime hoặc null",
  "duration_min": 30,
  "procedure": "procedure code hoặc null",
  "notes": "ghi chú hoặc null",
  "summary": "tóm tắt lịch hẹn"
}`,
              },
              {
                role: "user",
                content: message,
              },
            ],
            max_tokens: 1024,
            temperature: 0.2,
          },
        );
        const raw = (result as { response?: string }).response || "{}";
        const parsed = parseAiResponse(raw);
        if (parsed) {
          return {
            appointment: parsed,
            ai_model: model.model_id,
            generated_at: new Date().toISOString(),
          };
        }
      } catch {
        // fall through to fallback
      }
    }

    // Fallback: extract basic info with regex
    return {
      appointment: ruleBasedParse(message),
      ai_model: "rule-based-fallback",
      generated_at: new Date().toISOString(),
    };
  },

  // ─── Suggest next appointment from visit ─────────────────────

  async suggestNextAppointment(
    deps: AiAppointmentDeps,
    tenantId: string,
    visitId: string,
  ): Promise<SuggestNextResult> {
    const { db, AI } = deps;

    const visitsRepo = createVisitsRepository(db);
    const findingsRepo = createFindingsRepository(db);
    const plansRepo = createTreatmentPlansRepository(db);
    const itemsRepo = createTreatmentItemsRepository(db);
    const patientsRepo = createPatientsRepository(db);
    const usersRepo = createUsersRepository(db);

    const visit = await visitsRepo.getById(tenantId, visitId);
    if (!visit) throw new NotFoundError("Visit not found");

    const [patient, clinician, findings, planIds] = await Promise.all([
      patientsRepo.getById(tenantId, visit.patient_id),
      usersRepo.getById(tenantId, visit.clinician_id),
      findingsRepo.listByVisit(tenantId, visitId),
      plansRepo.list(tenantId, { visitId }),
    ]);

    // Get plan items
    const allItems: { procedure: string; status: string; tooth_number?: number; description: string }[] = [];
    for (const plan of planIds) {
      const fullPlan = plan ? await plansRepo.getById(tenantId, plan.id) : null;
      if (fullPlan) {
        const items = await itemsRepo.listByPlan(tenantId, fullPlan.id);
        allItems.push(...items.map((i) => ({
          procedure: i.procedure,
          status: i.status,
          tooth_number: i.tooth_number,
          description: i.description,
        })));
      }
    }

    const incompleteItems = allItems.filter((i) => i.status !== "completed");

    const patientInfo = patient ? `${patient.name}, sinh ${patient.date_of_birth}` : "không rõ";
    const doctorName = clinician?.name ?? "không rõ";

    const findingsText = findings.length
      ? findings.map((f) => {
        const loc = f.scope === "tooth" ? `${getFindingCategory(f.category).label} · Răng ${f.tooth_number}` : f.scope === "full_mouth" ? getFindingCategory(f.category).label : `${getFindingCategory(f.category).label} (${getAnatomicalSiteLabel(f.anatomical_site)})`;
        return `- ${loc}: ${f.condition}${f.notes ? ` (${f.notes})` : ""}`;
      }).join("\n")
      : "Không có findings.";

    const incompleteText = incompleteItems.length
      ? incompleteItems.map((i) => `- ${i.tooth_number ? `Răng ${i.tooth_number}` : "Toàn hàm"}: ${i.procedure} — ${i.description} [${i.status}]`).join("\n")
      : "Không có hạng mục chưa hoàn thành.";

    const today = new Date().toISOString().slice(0, 10);

    const model = await aiModelConfigService.resolve(db, "next_appointment_suggestion");
    if (model.is_enabled && AI && typeof (AI as { run?: unknown }).run === "function") {
      try {
        const result = await (AI as { run: (model: string, inputs: object) => Promise<{ response?: string }> }).run(
          model.model_id,
          {
            messages: [
              {
                role: "system",
                content: `Bạn là bác sĩ nha khoa chuyên nghiệp. Dựa trên thông tin buổi khám hiện tại, hãy đề xuất thời gian khám tiếp theo cho bệnh nhân.

Ngày hôm nay: ${today}

QUY TẮC THỜI GIAN:
- Root canal (điều trị tủy): tái khám sau 7–14 ngày
- Implant: tái khám sau 7–10 ngày
- Extraction (nhổ): tái khám sau 3–7 ngày
- Crown/bọc mão: hẹn gắn sau 7–14 ngày
- Scaling/cạo vôi: tái khám sau 6 tháng (180 ngày)
- Filling/trám: tái khám sau 3–6 tháng nếu nhiều trám
- Veneer: hẹn gắn sau 7–14 ngày
- Examination: chỉ tái khám khi có vấn đề (30–90 ngày)
- Nếu KHÔNG CÓ hạng mục chưa hoàn thành: gợi ý tái khám sau 6 tháng

Trả CHÍNH XÁC JSON, KHÔNG thêm text:
{
  "suggested_date": "YYYY-MM-DD",
  "suggested_time": "HH:MM",
  "duration_min": 30,
  "procedure": "procedure code hoặc null",
  "reason": "lý do gợi ý bằng tiếng Việt, 1 câu",
  "notes": "ghi chú cho lễ tân bằng tiếng Việt"
}`,
              },
              {
                role: "user",
                content: `Bệnh nhân: ${patientInfo}
Bác sĩ: ${doctorName}
Ngày khám: ${visit.date}

PHÁT HIỆN LÂM SÀNG:
${findingsText}

HẠNG MỤC ĐIỀU TRỊ CHƯA HOÀN THÀNH:
${incompleteText}

Hãy đề xuất lịch hẹn tiếp theo:`,
              },
            ],
            max_tokens: 512,
            temperature: 0.2,
          },
        );
        const raw = (result as { response?: string }).response || "{}";
        const parsed = parseSuggestResponse(raw);
        if (parsed) {
          return {
            suggestion: parsed,
            ai_model: model.model_id,
            generated_at: new Date().toISOString(),
          };
        }
      } catch {
        // fall through
      }
    }

    // Fallback: rule-based
    return {
      suggestion: ruleBasedSuggestion(incompleteItems),
      ai_model: "rule-based-fallback",
      generated_at: new Date().toISOString(),
    };
  },
};

// ─── AI response parsers ─────────────────────────────────────

function parseAiResponse(raw: string): ParsedAppointment | null {
  try {
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;
    const parsed = JSON.parse(jsonMatch[0]);
    return {
      patient_hint: parsed.patient_hint ? String(parsed.patient_hint) : null,
      clinician_hint: parsed.clinician_hint ? String(parsed.clinician_hint) : null,
      scheduled_at: parsed.scheduled_at ? String(parsed.scheduled_at) : null,
      duration_min: Number(parsed.duration_min) || 30,
      procedure: parsed.procedure ? String(parsed.procedure) : null,
      notes: parsed.notes ? String(parsed.notes) : null,
      summary: parsed.summary ? String(parsed.summary) : "Lịch hẹn mới",
    };
  } catch {
    return null;
  }
}

function parseSuggestResponse(raw: string): NextAppointmentSuggestion | null {
  try {
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;
    const parsed = JSON.parse(jsonMatch[0]);
    if (!parsed.suggested_date) return null;
    return {
      suggested_date: String(parsed.suggested_date),
      suggested_time: String(parsed.suggested_time || "09:00"),
      duration_min: Number(parsed.duration_min) || 30,
      procedure: parsed.procedure ? String(parsed.procedure) : null,
      reason: String(parsed.reason || "Tái khám"),
      notes: String(parsed.notes || ""),
    };
  } catch {
    return null;
  }
}

// ─── Rule-based fallbacks ────────────────────────────────────

function ruleBasedParse(message: string): ParsedAppointment {
  const lower = message.toLowerCase();

  // Extract time hints
  let durationMin = 30;
  if (/\b\d+\s*h(?:ours?|oa)?\b/i.test(message)) {
    const h = message.match(/(\d+)\s*h/i);
    if (h) durationMin = parseInt(h[1]) * 60;
  } else if (/khám\s*nhanh|quick/i.test(lower)) {
    durationMin = 15;
  } else if (/tủy|root\s*canal/i.test(lower)) {
    durationMin = 60;
  } else if (/cạo\s*vôi|scaling/i.test(lower)) {
    durationMin = 30;
  }

  // Procedure hints
  let procedure: string | null = null;
  if (/khám\s*tổng\s*quát|examination/i.test(lower)) procedure = "examination";
  else if (/trám|filling/i.test(lower)) procedure = "filling";
  else if (/tủy|root\s*canal/i.test(lower)) procedure = "root_canal";
  else if (/nhổ|extraction/i.test(lower)) procedure = "extraction";
  else if (/bọc|mão|crown/i.test(lower)) procedure = "crown";
  else if (/cạo\s*vôi|scaling/i.test(lower)) procedure = "scaling";
  else if (/implant/i.test(lower)) procedure = "implant";
  else if (/veneer/i.test(lower)) procedure = "veneer";

  return {
    patient_hint: null,
    clinician_hint: null,
    scheduled_at: null,
    duration_min: durationMin,
    procedure,
    notes: message.slice(0, 500),
    summary: `Yêu cầu lịch hẹn: ${message.slice(0, 100)}`,
  };
}

function ruleBasedSuggestion(
  incompleteItems: { procedure: string; status: string; tooth_number?: number }[],
): NextAppointmentSuggestion | null {
  if (incompleteItems.length === 0) {
    // No incomplete items → suggest 6-month checkup
    const sixMonths = new Date();
    sixMonths.setDate(sixMonths.getDate() + 180);
    return {
      suggested_date: sixMonths.toISOString().slice(0, 10),
      suggested_time: "09:00",
      duration_min: 30,
      procedure: "examination",
      reason: "Tái khám định kỳ sau 6 tháng",
      notes: "Tái khám định kỳ — kiểm tra tổng quát",
    };
  }

  // Find the first incomplete item and suggest follow-up based on procedure
  const first = incompleteItems[0];
  const daysMap: Record<string, number> = {
    root_canal: 10,
    implant: 8,
    extraction: 5,
    crown: 10,
    scaling: 180,
    filling: 90,
    veneer: 10,
    examination: 30,
  };
  const days = daysMap[first.procedure] ?? 14;

  const nextDate = new Date();
  nextDate.setDate(nextDate.getDate() + days);

  return {
    suggested_date: nextDate.toISOString().slice(0, 10),
    suggested_time: "09:00",
    duration_min: first.procedure === "root_canal" ? 60 : 30,
    procedure: first.procedure,
    reason: `Tái khám ${first.procedure} — chờ ${days} ngày`,
    notes: `Tiếp tục điều trị ${first.procedure}${first.tooth_number ? ` răng ${first.tooth_number}` : ""}`,
  };
}
