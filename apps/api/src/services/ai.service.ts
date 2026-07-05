/**
 * AI service — uses Cloudflare Workers AI to generate visit summaries and treatment plans.
 *
 * Model: @cf/llama-3.1-8b-instruct (available on all Cloudflare plans)
 * Fallback: returns a structured summary / rule-based plan if AI is not configured.
 */

import type { D1Database } from "@cloudflare/workers-types";
import { createVisitsRepository } from "../repositories/visits.repo";
import { createFindingsRepository } from "../repositories/findings.repo";
import { createTreatmentPlansRepository } from "../repositories/treatment-plans.repo";
import { createTreatmentItemsRepository } from "../repositories/treatment-items.repo";
import { createPatientsRepository } from "../repositories/patients.repo";
import { NotFoundError } from "../lib/errors";

export interface SummarizeResult {
  summary: string;
  ai_model: string;
  generated_at: string;
}

export interface TreatmentPlanItemDraft {
  tooth: number | null;
  procedure: string;
  description: string;
  cost: number;
}

export interface GeneratePlanResult {
  items: TreatmentPlanItemDraft[];
  notes: string;
  ai_model: string;
  generated_at: string;
}

export interface AiDeps {
  db: D1Database;
  AI: unknown;
}

export const aiService = {
  // ─── Summarize ─────────────────────────────────────────────────
  async summarizeVisit(deps: AiDeps, tenantId: string, visitId: string): Promise<SummarizeResult> {
    const { db, AI } = deps;

    const visitsRepo = createVisitsRepository(db);
    const findingsRepo = createFindingsRepository(db);
    const plansRepo = createTreatmentPlansRepository(db);
    const itemsRepo = createTreatmentItemsRepository(db);
    const patientsRepo = createPatientsRepository(db);

    const visit = await visitsRepo.getById(tenantId, visitId);
    if (!visit) throw new NotFoundError("Visit not found");

    const patient = await patientsRepo.getById(tenantId, visit.patient_id);
    const findings = await findingsRepo.listByVisit(tenantId, visitId);
    const planIds = await plansRepo.list(tenantId, { visitId });

    const planItems: { plan: Awaited<ReturnType<typeof plansRepo.getById>>; items: Awaited<ReturnType<typeof itemsRepo.listByPlan>> }[] = [];
    for (const plan of planIds) {
      const fullPlan = await plansRepo.getById(tenantId, plan.id);
      const items = fullPlan ? await itemsRepo.listByPlan(tenantId, plan.id) : [];
      planItems.push({ plan: fullPlan, items });
    }

    const data = buildSummaryData({ patient, visit, findings, planItems });

    // Try Cloudflare AI
    if (AI && typeof (AI as { run?: unknown }).run === "function") {
      try {
        const result = await (AI as { run: (model: string, inputs: object) => Promise<{ response?: string }> }).run(
          "@cf/llama-3.1-8b-instruct",
          {
            messages: [
              { role: "system", content: "Bạn là trợ lý nha khoa chuyên nghiệp. Viết tóm tắt bệnh án bằng tiếng Việt, ngắn gọn, dễ hiểu. Dùng ngôn ngữ thân thiện, phù hợp để bác sĩ đọc lại nhanh." },
              { role: "user", content: buildPrompt(data) },
            ],
            max_tokens: 512,
            temperature: 0.3,
          },
        );
        return {
          summary: (result as { response?: string }).response || "Không có phản hồi từ AI.",
          ai_model: "llama-3.1-8b-instruct",
          generated_at: new Date().toISOString(),
        };
      } catch {
        // fall through
      }
    }

    // Fallback: structured text
    return {
      summary: buildStructuredSummary(data),
      ai_model: "structured-fallback",
      generated_at: new Date().toISOString(),
    };
  },

  // ─── Generate Treatment Plan ──────────────────────────────────
  async generateTreatmentPlan(deps: AiDeps, tenantId: string, visitId: string): Promise<GeneratePlanResult> {
    const { db, AI } = deps;

    const visitsRepo = createVisitsRepository(db);
    const findingsRepo = createFindingsRepository(db);
    const patientsRepo = createPatientsRepository(db);

    const visit = await visitsRepo.getById(tenantId, visitId);
    if (!visit) throw new NotFoundError("Visit not found");

    const patient = await patientsRepo.getById(tenantId, visit.patient_id);
    const findings = await findingsRepo.listByVisit(tenantId, visitId);

    const patientInfo = patient
      ? `${patient.name}, ${patient.gender === "M" ? "Nam" : patient.gender === "F" ? "Nữ" : "Khác"}, sinh ${patient.date_of_birth}`
      : "không rõ";
    const findingsText = findings.length
      ? findings.map((f) => {
          const loc = f.scope === "tooth" ? `Răng ${f.tooth_number}` : f.scope === "full_mouth" ? "Toàn hàm" : `Mô mềm (${f.area ?? f.scope})`;
          return `  - ${loc}: ${f.condition}${f.notes ? ` (${f.notes})` : ""}`;
        }).join("\n")
      : "  (không có clinical findings)";

    const prompt = `Bạn là bác sĩ nha khoa giàu kinh nghiệm. Dựa trên thông tin bệnh nhân và clinical findings, hãy đề xuất kế hoạch điều trị chi tiết.

THÔNG TIN BỆNH NHÂN: ${patientInfo}
NGÀY KHÁM: ${new Date(visit.date).toLocaleDateString("vi-VN")}

CLINICAL FINDINGS:
${findingsText}

Hãy trả lời CHÍNH XÁC theo format JSON bên dưới (KHÔNG thêm text gì khác ngoài JSON):
{
  "items": [
    {
      "tooth": <số răng FDI, hoặc null nếu là thủ thuật toàn hàm (scaling, tẩy trắng toàn hàm)>,
      "procedure": "<một trong: examination, filling, root_canal, extraction, crown, scaling, implant, bridge, veneer, fluoride, other>",
      "description": "<mô tả ngắn gọn điều trị bằng tiếng Việt, 10-30 từ>",
      "cost": <chi phí ước tính VND, chỉ là số nguyên, không có dấu phẩy>
    }
  ],
  "notes": "<ghi chú tổng quát cho bác sĩ bằng tiếng Việt, 1-2 câu hoặc empty string>"
}

QUY TẮC QUAN TRỌNG:
- Chỉ đề xuất điều trị dựa trên clinical findings có sẵn
- Mỗi finding chỉ cần 1 item điều trị chính
- Finding "toàn hàm" → tooth = null, procedure phù hợp (scaling, fluoride…)
- Finding "mô mềm" → tooth = null, procedure = examination hoặc treatment phù hợp
- Chi phí tham khảo (VND): examination=200000, filling=500000-2000000 tùy loại, root_canal=3000000-6000000, extraction=500000-1500000, crown=5000000-15000000, scaling=300000-800000, implant=15000000-30000000, bridge=8000000-20000000
- Không bào chữa, chỉ trả JSON thuần túy`;

    // Try Cloudflare AI
    if (AI && typeof (AI as { run?: unknown }).run === "function") {
      try {
        const result = await (AI as { run: (model: string, inputs: object) => Promise<{ response?: string }> }).run(
          "@cf/llama-3.1-8b-instruct",
          {
            messages: [
              { role: "system", content: "Bạn là bác sĩ nha khoa chuyên nghiệp. Luôn trả lời đúng format JSON, không thêm text khác." },
              { role: "user", content: prompt },
            ],
            max_tokens: 1024,
            temperature: 0.2,
          },
        );
        const raw = (result as { response?: string }).response || "{}";
        const parsed = parseAiPlanResponse(raw);
        if (parsed) {
          return { ...parsed, ai_model: "llama-3.1-8b-instruct", generated_at: new Date().toISOString() };
        }
      } catch {
        // fall through
      }
    }

    // Fallback: rule-based plan
    return buildFallbackPlan(findings, visit, patient);
  },
};

// ─── Helpers ────────────────────────────────────────────────────

interface SummaryData {
  patient: { name: string; dob: string; gender: string; phone: string } | null;
  visit: { date: string; status: string; notes?: string | null };
  findings: { tooth?: number; scope: string; area?: string; condition: string; notes?: string | null }[];
  planItems: {
    plan: Awaited<ReturnType<ReturnType<typeof createTreatmentPlansRepository>["getById"]>>;
    items: Awaited<ReturnType<ReturnType<typeof createTreatmentItemsRepository>["listByPlan"]>>;
  }[];
}

function buildSummaryData(opts: {
  patient: Awaited<ReturnType<ReturnType<typeof createPatientsRepository>["getById"]>>;
  visit: Awaited<ReturnType<ReturnType<typeof createVisitsRepository>["getById"]>>;
  findings: Awaited<ReturnType<ReturnType<typeof createFindingsRepository>["listByVisit"]>>;
  planItems: SummaryData["planItems"];
}): SummaryData {
  return {
    patient: opts.patient ? { name: opts.patient.name, dob: opts.patient.date_of_birth, gender: opts.patient.gender, phone: opts.patient.phone } : null,
    visit: { date: opts.visit.date, status: opts.visit.status, notes: opts.visit.notes },
    findings: opts.findings.map((f) => ({ tooth: f.tooth_number, scope: f.scope, area: f.area, condition: f.condition, notes: f.notes })),
    planItems: opts.planItems,
  };
}

function buildPrompt(data: SummaryData): string {
  const patient = data.patient
    ? `Bệnh nhân: ${data.patient.name}, ${data.patient.gender === "M" ? "Nam" : data.patient.gender === "F" ? "Nữ" : "Khác"}, sinh ${data.patient.dob}, ĐT: ${data.patient.phone}`
    : "Bệnh nhân: không xác định";
  const visit = `Lượt khám: ${new Date(data.visit.date).toLocaleDateString("vi-VN")}, trạng thái: ${data.visit.status}${data.visit.notes ? `, Ghi chú: ${data.visit.notes}` : ""}`;
  const findings = data.findings.length
    ? `Clinical findings:\n${data.findings.map((f) => {
        const loc = f.scope === "tooth" ? `Răng ${f.tooth}` : f.scope === "full_mouth" ? "Toàn hàm" : `Mô mềm (${f.area ?? f.scope})`;
        return `  - ${loc}: ${f.condition}${f.notes ? ` (${f.notes})` : ""}`;
      }).join("\n")}`
    : "Clinical findings: không có";
  const plans = data.planItems.length
    ? `Kế hoạch điều trị:\n${data.planItems.map(({ plan, items }) => `  [${plan?.status}] Tổng: ${(plan?.total_cost ?? 0).toLocaleString("vi-VN")} ${plan?.currency || "VND"}\n${items.map((i) => `    - ${i.tooth_number ? `Răng ${i.tooth_number}` : "Toàn hàm"}: ${i.procedure} — ${i.description} (${i.unit_cost.toLocaleString("vi-VN")} ${plan?.currency || "VND"}) [${i.status}]`).join("\n")}`).join("\n")}`
    : "Kế hoạch: không có";
  return `${patient}\n${visit}\n\n${findings}\n\n${plans}\n\nHãy viết tóm tắt bệnh án ngắn gọn bằng tiếng Việt cho bác sĩ.`;
}

function buildStructuredSummary(data: SummaryData): string {
  const lines: string[] = [];
  if (data.patient) {
    lines.push(`## Bệnh nhân\n${data.patient.name}, ${data.patient.gender === "M" ? "Nam" : "Nữ"}, sinh ${data.patient.dob}, ĐT: ${data.patient.phone}`);
  }
  lines.push(`## Lượt khám ngày ${new Date(data.visit.date).toLocaleDateString("vi-VN")} (${data.visit.status})`);
  if (data.visit.notes) lines.push(`Ghi chú: ${data.visit.notes}`);
  if (data.findings.length) {
    lines.push(`## Clinical Findings (${data.findings.length})`);
    data.findings.forEach((f) => {
      const loc = f.scope === "tooth" ? `Răng ${f.tooth}` : f.scope === "full_mouth" ? "Toàn hàm" : `Mô mềm (${f.area ?? f.scope})`;
      lines.push(`- ${loc}: ${f.condition}${f.notes ? ` — ${f.notes}` : ""}`);
    });
  }
  if (data.planItems.some((p) => p.items.length)) {
    lines.push("## Kế hoạch điều trị");
    data.planItems.forEach(({ plan, items }) => {
      if (!items.length) return;
      lines.push(`[${plan?.status}] ${(plan?.total_cost ?? 0).toLocaleString("vi-VN")} ${plan?.currency || "VND"}`);
      items.forEach((i) => {
        const loc = i.tooth_number ? `Răng ${i.tooth_number}` : "Toàn hàm";
        lines.push(`  - ${loc}: ${i.procedure} — ${i.description} (${i.unit_cost.toLocaleString("vi-VN")} VND)`);
      });
    });
  }
  return lines.join("\n");
}

function parseAiPlanResponse(raw: string): GeneratePlanResult | null {
  try {
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;
    const parsed = JSON.parse(jsonMatch[0]);
    if (!Array.isArray(parsed.items)) return null;
    return {
      items: parsed.items.map((item: Record<string, unknown>) => ({
        tooth: item.tooth == null ? null : (Number(item.tooth) || 0),
        procedure: String(item.procedure || "other"),
        description: String(item.description || ""),
        cost: Number(item.cost) || 0,
      })),
      notes: String(parsed.notes || ""),
      ai_model: "llama-3.1-8b-instruct",
      generated_at: new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

const PROCEDURE_MAP: Record<string, { procedure: string; cost: number }> = {
  caries: { procedure: "filling", cost: 800000 },
  "deep caries": { procedure: "filling", cost: 1500000 },
  pulpitis: { procedure: "root_canal", cost: 4000000 },
  "pulp necrosis": { procedure: "root_canal", cost: 4500000 },
  periapical: { procedure: "root_canal", cost: 4000000 },
  "periapical abscess": { procedure: "root_canal", cost: 5000000 },
  fracture: { procedure: "crown", cost: 6000000 },
  missing: { procedure: "implant", cost: 20000000 },
  "partial edentulism": { procedure: "bridge", cost: 12000000 },
  calculus: { procedure: "scaling", cost: 500000 },
  gingivitis: { procedure: "scaling", cost: 500000 },
  periodontitis: { procedure: "scaling", cost: 800000 },
  "tooth wear": { procedure: "crown", cost: 6000000 },
  hypercementosis: { procedure: "examination", cost: 200000 },
  concrescence: { procedure: "examination", cost: 200000 },
  dilaceration: { procedure: "examination", cost: 200000 },
  "pulp polyp": { procedure: "root_canal", cost: 4000000 },
  impaction: { procedure: "extraction", cost: 2000000 },
  transposition: { procedure: "examination", cost: 200000 },
  "supernumerary tooth": { procedure: "extraction", cost: 1500000 },
  "agenesis (permanent)": { procedure: "examination", cost: 200000 },
  "tooth discoloration": { procedure: "veneer", cost: 8000000 },
  attrition: { procedure: "crown", cost: 6000000 },
  abrasion: { procedure: "filling", cost: 1000000 },
  erosion: { procedure: "filling", cost: 1000000 },
  abfraction: { procedure: "filling", cost: 800000 },
  "pulp stone": { procedure: "root_canal", cost: 3500000 },
  resorption: { procedure: "root_canal", cost: 5000000 },
  "unerupted tooth": { procedure: "examination", cost: 200000 },
  "unerupted third molar": { procedure: "extraction", cost: 2500000 },
  "fistula/sinus": { procedure: "root_canal", cost: 4000000 },
  "internal resorption": { procedure: "root_canal", cost: 5000000 },
  "external resorption": { procedure: "root_canal", cost: 5000000 },
  "vertical root fracture": { procedure: "extraction", cost: 1500000 },
  "caries in young patient": { procedure: "filling", cost: 600000 },
  "reversible pulpitis": { procedure: "filling", cost: 800000 },
  "irreversible pulpitis": { procedure: "root_canal", cost: 4000000 },
  "symptomatic apical periodontitis": { procedure: "root_canal", cost: 4500000 },
  "asymptomatic apical periodontitis": { procedure: "root_canal", cost: 4000000 },
  "acute apical abscess": { procedure: "root_canal", cost: 5000000 },
  "chronic apical abscess": { procedure: "root_canal", cost: 4500000 },
  suppuration: { procedure: "root_canal", cost: 4500000 },
};

const PROCEDURE_LABELS: Record<string, string> = {
  examination: "Khám và chẩn đoán",
  filling: "Trám răng",
  root_canal: "Điều trị tủy",
  extraction: "Nhổ răng",
  crown: "Bọc mão răng",
  scaling: "Cạo vôi răng",
  implant: "Cấy ghép implant",
  bridge: "Cầu răng sứ",
  veneer: "Dán sứ veneer",
  fluoride: "Tẩy trắng fluoride",
  other: "Điều trị khác",
};

function buildFallbackPlan(
  findings: Awaited<ReturnType<ReturnType<typeof createFindingsRepository>["listByVisit"]>>,
  visit: Awaited<ReturnType<ReturnType<typeof createVisitsRepository>["getById"]>>,
  patient: Awaited<ReturnType<ReturnType<typeof createPatientsRepository>["getById"]>>,
): GeneratePlanResult {
  const items: TreatmentPlanItemDraft[] = findings.map((f) => {
    const found = PROCEDURE_MAP[f.condition];
    const procedure = found?.procedure || "examination";
    const label = PROCEDURE_LABELS[procedure] || "Điều trị";
    const loc = f.scope === "tooth" && f.tooth_number != null
      ? `răng ${f.tooth_number}`
      : f.scope === "full_mouth"
        ? "toàn hàm"
        : `mô mềm (${f.area ?? f.scope})`;
    return {
      tooth: f.tooth_number ?? null,
      procedure,
      description: `${label} ${loc}${f.notes ? ` — ${f.notes}` : ""}`,
      cost: found?.cost || 200000,
    };
  });

  const patientName = patient?.name || "bệnh nhân";
  return {
    items,
    notes: `Kế hoạch điều trị cho ${patientName} dựa trên clinical findings từ lượt khám ngày ${new Date(visit.date).toLocaleDateString("vi-VN")}. Chi phí là ước tính, cần điều chỉnh theo thực tế.`,
    ai_model: "structured-fallback",
    generated_at: new Date().toISOString(),
  };
}
