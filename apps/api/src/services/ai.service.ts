/**
 * AI service — uses Cloudflare Workers AI to generate visit summaries.
 *
 * Model: @cf/llama-3.1-8b-instruct (available on all Cloudflare plans)
 * Fallback: returns a structured text summary if AI is not configured.
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

export interface AiDeps {
  db: D1Database;
  AI: unknown;
}

export const aiService = {
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

    // Build structured prompt
    const prompt = buildPrompt({
      patient: patient ? { name: patient.name, dob: patient.date_of_birth, gender: patient.gender, phone: patient.phone } : null,
      visit: { date: visit.date, status: visit.status, notes: visit.notes },
      findings: findings.map((f) => ({
        tooth: f.tooth_number,
        condition: f.condition,
        notes: f.notes,
      })),
      plans: planItems.map(({ plan, items }) => ({
        status: plan?.status,
        totalCost: plan?.total_cost,
        currency: plan?.currency,
        items: items.map((i) => ({
          tooth: i.tooth_number,
          procedure: i.procedure,
          description: i.description,
          cost: i.unit_cost,
          status: i.status,
        })),
      })),
    });

    // Try Cloudflare AI first
    if (AI && typeof (AI as { run?: unknown }).run === "function") {
      try {
        const result = await (AI as { run: (model: string, inputs: object) => Promise<{ response?: string }> }).run(
          "@cf/llama-3.1-8b-instruct",
          {
            messages: [
              {
                role: "system",
                content:
                  "Bạn là trợ lý nha khoa chuyên nghiệp. Viết tóm tắt bệnh án bằng tiếng Việt, ngắn gọn, dễ hiểu. Dùng ngôn ngữ thân thiện, phù hợp để bác sĩ đọc lại nhanh.",
              },
              { role: "user", content: prompt },
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
        // Fall through to structured summary
      }
    }

    // Fallback: structured text summary without AI
    return {
      summary: buildStructuredSummary({
        patient: patient ? { name: patient.name, dob: patient.date_of_birth, gender: patient.gender, phone: patient.phone } : null,
        visit: { date: visit.date, status: visit.status, notes: visit.notes },
        findings: findings.map((f) => ({
          tooth: f.tooth_number,
          condition: f.condition,
          notes: f.notes,
        })),
        plans: planItems.map(({ plan, items }) => ({
          status: plan?.status,
          totalCost: plan?.total_cost,
          currency: plan?.currency,
          items: items.map((i) => ({
            tooth: i.tooth_number,
            procedure: i.procedure,
            description: i.description,
            cost: i.unit_cost,
            status: i.status,
          })),
        })),
      }),
      ai_model: "structured-fallback",
      generated_at: new Date().toISOString(),
    };
  },
};

interface SummaryInput {
  patient: { name: string; dob: string; gender: string; phone: string } | null;
  visit: { date: string; status: string; notes?: string | null };
  findings: { tooth: number; condition: string; notes?: string | null }[];
  plans: {
    status?: string | null;
    totalCost?: number | null;
    currency?: string | null;
    items: { tooth: number; procedure: string; description: string; cost: number; status: string }[];
  }[];
}

function buildPrompt(data: SummaryInput): string {
  const patient = data.patient
    ? `Bệnh nhân: ${data.patient.name}, ${data.patient.gender === "M" ? "Nam" : data.patient.gender === "F" ? "Nữ" : "Khác"}, sinh ${data.patient.dob}, ĐT: ${data.patient.phone}`
    : "Bệnh nhân: không xác định";
  const visit = `Lượt khám: ${new Date(data.visit.date).toLocaleDateString("vi-VN")}, trạng thái: ${data.visit.status}${data.visit.notes ? `, Ghi chú: ${data.visit.notes}` : ""}`;
  const findings = data.findings.length
    ? `Clinical findings (FDI):\n${data.findings.map((f) => `  - Răng ${f.tooth}: ${f.condition}${f.notes ? ` (${f.notes})` : ""}`).join("\n")}`
    : "Clinical findings: không có";
  const plans = data.plans.length
    ? `Kế hoạch điều trị:\n${data.plans.map((p) => `  [${p.status}] Tổng: ${(p.totalCost ?? 0).toLocaleString("vi-VN")} ${p.currency || "VND"}\n${p.items.map((i) => `    - Răng ${i.tooth}: ${i.procedure} — ${i.description} (${i.cost.toLocaleString("vi-VN")} ${p.currency || "VND"}) [${i.status}]`).join("\n")}`).join("\n")}`
    : "Kế hoạch: không có";
  return `${patient}\n${visit}\n\n${findings}\n\n${plans}\n\nHãy viết tóm tắt bệnh án ngắn gọn bằng tiếng Việt cho bác sĩ.`;
}

function buildStructuredSummary(data: SummaryInput): string {
  const lines: string[] = [];
  if (data.patient) {
    lines.push(`## Bệnh nhân\n${data.patient.name}, ${data.patient.gender === "M" ? "Nam" : "Nữ"}, sinh ${data.patient.dob}, ĐT: ${data.patient.phone}`);
  }
  lines.push(`## Lượt khám ngày ${new Date(data.visit.date).toLocaleDateString("vi-VN")} (${data.visit.status})`);
  if (data.visit.notes) lines.push(`Ghi chú: ${data.visit.notes}`);
  if (data.findings.length) {
    lines.push(`## Clinical Findings (${data.findings.length})`);
    data.findings.forEach((f) => {
      lines.push(`- Răng ${f.tooth}: ${f.condition}${f.notes ? ` — ${f.notes}` : ""}`);
    });
  }
  if (data.plans.some((p) => p.items.length)) {
    lines.push("## Kế hoạch điều trị");
    data.plans.forEach((p) => {
      if (!p.items.length) return;
      lines.push(`[${p.status}] ${(p.totalCost ?? 0).toLocaleString("vi-VN")} ${p.currency || "VND"}`);
      p.items.forEach((i) => {
        lines.push(`  - Răng ${i.tooth}: ${i.procedure} — ${i.description} (${i.cost.toLocaleString("vi-VN")} VND)`);
      });
    });
  }
  return lines.join("\n");
}
