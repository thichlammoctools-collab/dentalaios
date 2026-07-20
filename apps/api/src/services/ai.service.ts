/**
 * AI service — uses Cloudflare Workers AI to generate visit summaries and treatment plans.
 *
 * Model: @cf/meta/llama-4-scout-17b-16e-instruct (17B params, superior Vietnamese support)
 * Fallback: returns a structured summary / rule-based plan if AI is not configured.
 */

import type { D1Database, R2Bucket, R2ObjectBody } from "@cloudflare/workers-types";
import { createVisitsRepository } from "../repositories/visits.repo";
import { createFindingsRepository } from "../repositories/findings.repo";
import { createTreatmentPlansRepository } from "../repositories/treatment-plans.repo";
import { createTreatmentItemsRepository } from "../repositories/treatment-items.repo";
import { createPatientsRepository } from "../repositories/patients.repo";
import { createTreatmentServicesRepository } from "../repositories/treatment-service-prices.repo";
import { NotFoundError } from "../lib/errors";
import { aiModelConfigService } from "./ai-model-config.service";

export interface SummarizeResult {
  summary: string;
  ai_model: string;
  generated_at: string;
}

export interface TreatmentPlanItemDraft {
  tooth: number | null;
  service_code?: string;
  service_name?: string;
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
  FILES?: R2Bucket;
}

export interface ImageAnalysisFinding {
  tooth_number: number | null;
  scope: "tooth" | "full_mouth" | "soft_tissue";
  area?: string;
  condition: string;
  description: string;
  recommendation: string;
}

export interface AnalyzeImageResult {
  analysis: string;
  findings: ImageAnalysisFinding[];
  ai_model: string;
  generated_at: string;
}

// ─── Utilities ───────────────────────────────────────────────────

function uint8ArrayToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
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
    const model = await aiModelConfigService.resolve(db, "visit_summary");
    if (model.is_enabled && AI && typeof (AI as { run?: unknown }).run === "function") {
      try {
        const result = await (AI as { run: (model: string, inputs: object) => Promise<{ response?: string }> }).run(
          model.model_id,
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
          ai_model: model.model_id,
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
    const treatmentServicesRepo = createTreatmentServicesRepository(db);

    const visit = await visitsRepo.getById(tenantId, visitId);
    if (!visit) throw new NotFoundError("Visit not found");

    const patient = await patientsRepo.getById(tenantId, visit.patient_id);
    const [findings, services] = await Promise.all([
      findingsRepo.listByVisit(tenantId, visitId),
      treatmentServicesRepo.list(tenantId),
    ]);
    const activeServices = services.filter((service) => service.is_active);

    const patientInfo = patient
      ? `${patient.name}, ${patient.gender === "M" ? "Nam" : patient.gender === "F" ? "Nữ" : "Khác"}, sinh ${patient.date_of_birth}`
      : "không rõ";
    const findingsText = findings.length
      ? findings.map((f) => {
          const loc = f.scope === "tooth" ? `Răng ${f.tooth_number}` : f.scope === "full_mouth" ? "Toàn hàm" : `Mô mềm (${f.area ?? f.scope})`;
          return `  - ${loc}: ${f.condition}${f.notes ? ` (${f.notes})` : ""}`;
        }).join("\n")
      : "  (không có clinical findings)";

    const catalogText = activeServices.length
      ? activeServices.map((service) =>
          `- ${service.code} | ${service.name} | thủ thuật=${service.procedure} | giá=${service.price} VND`,
        ).join("\n")
      : "(Phòng khám chưa cấu hình danh mục dịch vụ đang hoạt động.)";

    const prompt = `Bạn là bác sĩ nha khoa giàu kinh nghiệm. Dựa trên thông tin bệnh nhân và clinical findings, hãy đề xuất kế hoạch điều trị chi tiết.

THÔNG TIN BỆNH NHÂN: ${patientInfo}
NGÀY KHÁM: ${new Date(visit.date).toLocaleDateString("vi-VN")}

CLINICAL FINDINGS:
${findingsText}

DANH MỤC DỊCH VỤ ĐIỀU TRỊ ĐANG HOẠT ĐỘNG CỦA PHÒNG KHÁM:
${catalogText}

Hãy trả lời CHÍNH XÁC theo format JSON bên dưới (KHÔNG thêm text gì khác ngoài JSON):
{
  "items": [
    {
      "tooth": <số răng FDI, hoặc null nếu là thủ thuật toàn hàm (scaling, tẩy trắng toàn hàm)>,
      "service_code": "<MÃ dịch vụ chính xác trong danh mục phía trên, hoặc null nếu danh mục trống>",
      "procedure": "<thủ thuật của dịch vụ đã chọn>",
      "description": "<mô tả ngắn gọn điều trị bằng tiếng Việt, 10-30 từ>",
      "cost": <đúng đơn giá VND của dịch vụ đã chọn, chỉ là số nguyên, không có dấu phẩy>
    }
  ],
  "notes": "<ghi chú tổng quát cho bác sĩ bằng tiếng Việt, 1-2 câu hoặc empty string>"
}

QUY TẮC QUAN TRỌNG:
- Chỉ đề xuất điều trị dựa trên clinical findings có sẵn
- Mỗi finding chỉ cần 1 item điều trị chính
- Finding "toàn hàm" → tooth = null, procedure phù hợp (scaling, fluoride…)
- Finding "mô mềm" → tooth = null, procedure = examination hoặc treatment phù hợp
- Khi danh mục có dịch vụ: CHỈ chọn service_code có trong danh mục, giữ nguyên procedure và cost tương ứng. Không tự tạo mã hoặc giá mới.
- Khi danh mục trống: service_code = null và có thể dùng chi phí tham khảo.
- Không bào chữa, chỉ trả JSON thuần túy`;

    // Try Cloudflare AI
    const model = await aiModelConfigService.resolve(db, "treatment_plan_draft");
    if (model.is_enabled && AI && typeof (AI as { run?: unknown }).run === "function") {
      try {
        const result = await (AI as { run: (model: string, inputs: object) => Promise<{ response?: string }> }).run(
          model.model_id,
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
        const parsed = parseAiPlanResponse(raw, activeServices);
        if (parsed) {
          return { ...parsed, ai_model: model.model_id, generated_at: new Date().toISOString() };
        }
      } catch {
        // fall through
      }
    }

    // Fallback: rule-based plan
    return buildFallbackPlan(findings, visit, patient, activeServices);
  },

  // ─── Analyze Image ─────────────────────────────────────────────
  async analyzeImage(
    deps: AiDeps,
    tenantId: string,
    fileId: string,
    imageType: string,
    optionalPrompt?: string,
  ): Promise<AnalyzeImageResult> {
    const { AI, FILES, db } = deps;

    const imageTypeLabels: Record<string, string> = {
      cbct: "CBCT (Cone Beam CT)",
      scan_3d: "Scan 3D",
      dicom: "DICOM",
      photo_before: "Hình chụp trước điều trị",
      photo_after: "Hình chụp sau điều trị",
      xray: "X-quang",
      intraoral: "Intraoral",
      other: "Hình ảnh y khoa",
    };
    const typeLabel = imageTypeLabels[imageType] ?? "Hình ảnh y khoa";

    const textPrompt = optionalPrompt
      ?? `Phân tích ${typeLabel} trong nha khoa và trả về JSON chính xác theo format bên dưới.

YÊU CẦU:
- Chỉ trả về JSON thuần túy, không thêm text khác
- Xác định răng theo hệ FDI (VD: 11, 12, 21, 22, 36…)
- Mô tả chính xác vị trí và mức độ tổn thương
- Đưa ra đề xuất điều trị phù hợp

FORMAT JSON (bắt buộc):
{
  "analysis": "<tổng quan về hình ảnh, 1-3 câu tiếng Việt>",
  "findings": [
    {
      "tooth_number": <số FDI hoặc null nếu là toàn hàm/mô mềm>,
      "scope": "<tooth | full_mouth | soft_tissue>",
      "area": "<mặt răng nếu là tooth: occlusal/mesial/distal/lingual/buccal, hoặc bỏ trống>",
      "condition": "<tình trạng bằng tiếng Việt: sâu răng, viêm tủy, viêm quanh răng, tổn thương…>",
      "description": "<mô tả chi tiết tổn thương bằng tiếng Việt, 1-2 câu>",
      "recommendation": "<đề xuất điều trị bằng tiếng Việt, 1-2 câu>"
    }
  ]
}

QUY TẮC QUAN TRỌNG:
- findings có thể là mảng rỗng [] nếu không phát hiện bất thường
- tooth_number dùng hệ FDI (VD: 11= răng cửa trên phải, 36= răng hàm dưới trái)
- scope="tooth" khi chỉ 1 răng, scope="full_mouth" khi nhiều răng, scope="soft_tissue" khi là mô mềm`;

    // Step 1: Resolve the database file id in the caller's tenant before
    // reading R2. `fileId` is an opaque DB UUID, not an R2 key; using it as a
    // key both fails for valid uploads and lets callers try arbitrary keys.
    const file = await db
      .prepare("SELECT r2_key, content_type FROM file_objects WHERE tenant_id = ? AND id = ? LIMIT 1")
      .bind(tenantId, fileId)
      .first<{ r2_key: string; content_type: string }>();
    if (!file) throw new NotFoundError("Image file not found");

    // Step 2: Fetch the tenant-scoped image from R2.
    let imageBase64: string | null = null;
    let mimeType = file.content_type || "image/jpeg";
    if (FILES) {
      try {
        const r2Obj = await FILES.get(file.r2_key);
        if (r2Obj && "arrayBuffer" in r2Obj) {
          const buf = await (r2Obj as R2ObjectBody).arrayBuffer();
          // Limit to 5MB to avoid token limits
          const MAX_SIZE = 5 * 1024 * 1024;
          const truncated = buf.byteLength > MAX_SIZE ? buf.slice(0, MAX_SIZE) : buf;
          const bytes = new Uint8Array(truncated);
          imageBase64 = uint8ArrayToBase64(bytes);
          // Try to detect mime type from content-type header
          const ct = (r2Obj as R2ObjectBody).httpMetadata?.contentType;
          if (ct) mimeType = ct;
        }
      } catch {
        throw new NotFoundError("Image file missing in storage");
      }
    }

    if (!imageBase64) throw new NotFoundError("Image file missing in storage");

    const model = await aiModelConfigService.resolve(db, "clinical_image_analysis");

    // Step 3: Try vision model with base64 image
    if (
      model.is_enabled &&
      AI &&
      typeof (AI as { run?: unknown }).run === "function" &&
      imageBase64
    ) {
      try {
        const result = await (AI as { run: (model: string, inputs: object) => Promise<unknown> }).run(
          model.model_id,
          {
            messages: [
              {
                role: "system",
                content: "Bạn là bác sĩ nha khoa giàu kinh nghiệm. Khi nhìn hình ảnh y khoa, hãy mô tả chính xác những gì bạn thấy, xác định răng theo hệ FDI, và trả lời đúng format JSON, không thêm text khác ngoài JSON.",
              },
              {
                role: "user",
                content: [
                  { type: "text", text: textPrompt },
                  {
                    type: "image_url",
                    image_url: { url: `data:${mimeType};base64,${imageBase64}` },
                  },
                ],
              },
            ],
            max_tokens: 1536,
            temperature: 0.2,
          },
        );
        const raw = (result as { response?: string })?.response || "{}";
        const parsed = parseAnalyzeImageResponse(raw);
        if (parsed) {
          return { ...parsed, ai_model: model.model_id, generated_at: new Date().toISOString() };
        }
      } catch {
        // fall through to text-only
      }
    }

    // Step 4: Final fallback
    return {
      analysis: `Đã tiếp nhận hình ảnh ${typeLabel}. Vui lòng xem xét thủ công.`,
      findings: [],
      ai_model: "structured-fallback",
      generated_at: new Date().toISOString(),
    };
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
  visit: NonNullable<Awaited<ReturnType<ReturnType<typeof createVisitsRepository>["getById"]>>>;
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
  const translated = translateFindings(data.findings);
  const patient = data.patient
    ? `Bệnh nhân: ${data.patient.name}, ${data.patient.gender === "M" ? "Nam" : data.patient.gender === "F" ? "Nữ" : "Khác"}, sinh ${data.patient.dob}, ĐT: ${data.patient.phone}`
    : "Bệnh nhân: không xác định";
  const visit = `Lượt khám: ${new Date(data.visit.date).toLocaleDateString("vi-VN")}, trạng thái: ${visitStatusVi(data.visit.status)}${data.visit.notes ? `, Ghi chú: ${data.visit.notes}` : ""}`;
  const findings = translated.length
    ? `Phát hiện lâm sàng:\n${translated.map((f) => {
        const loc = f.scope === "tooth" ? `Răng ${f.tooth}` : f.scope === "full_mouth" ? "Toàn hàm" : `Mô mềm (${f.area ?? f.scope})`;
        return `  - ${loc}: ${f.condition}${f.notes ? ` (${f.notes})` : ""}`;
      }).join("\n")}`
    : "Phát hiện lâm sàng: không có";
  const plans = data.planItems.length
    ? `Kế hoạch điều trị:\n${data.planItems.map(({ plan, items }) => `  [${visitStatusVi(plan?.status ?? "planned")}] Tổng: ${(plan?.total_cost ?? 0).toLocaleString("vi-VN")} ${plan?.currency || "VND"}\n${items.map((i) => `    - ${i.tooth_number ? `Răng ${i.tooth_number}` : "Toàn hàm"}: ${procedureVi(i.procedure)} — ${i.description} (${i.unit_cost.toLocaleString("vi-VN")} ${plan?.currency || "VND"}) [${procedureVi(i.status)}]`).join("\n")}`).join("\n")}`
    : "Kế hoạch: không có";
  return `${patient}\n${visit}\n\n${findings}\n\n${plans}\n\nHãy viết tóm tắt bệnh án ngắn gọn bằng tiếng Việt cho bác sĩ.`;
}

function visitStatusVi(status: string): string {
  if (status === "in_progress") return "Đang khám";
  if (status === "completed") return "Hoàn thành";
  if (status === "cancelled") return "Đã hủy";
  if (status === "draft") return "Bản nháp";
  if (status === "approved") return "Đã duyệt";
  if (status === "planned") return "Đã lên kế hoạch";
  return status;
}

function procedureVi(proc: string): string {
  const map: Record<string, string> = {
    examination: "Khám & chẩn đoán",
    filling: "Trám răng",
    root_canal: "Điều trị tủy",
    extraction: "Nhổ răng",
    crown: "Bọc mão răng",
    scaling: "Cạo vôi răng",
    implant: "Cấy ghép implant",
    bridge: "Cầu răng sứ",
    veneer: "Dán sứ veneer",
    fluoride: "Tráng răng fluoride",
    other: "Điều trị khác",
    planned: "Đã lên kế hoạch",
    in_progress: "Đang điều trị",
    completed: "Hoàn thành",
    proposed: "Đề xuất",
  };
  return map[proc] ?? proc;
}

function conditionVi(cond: string): string {
  const map: Record<string, string> = {
    "caries": "Sâu răng",
    "caries_other": "Sâu răng khác",
    "caries other": "Sâu răng khác",
    "caries_o": "Sâu răng khác",
    "caries_occlusal": "Sâu răng mặt nhai",
    "caries_mesial": "Sâu răng mặt trung tâm",
    "caries_distal": "Sâu răng mặt xa",
    "caries_lingual": "Sâu răng mặt lưỡi",
    "caries_buccal": "Sâu răng mặt má",
    "caries_interproximal": "Sâu kẽ răng",
    "pulpitis": "Viêm tủy",
    "viêm tủy": "Viêm tủy",
    "viêm cuống răng": "Viêm cuống răng",
    "apical_periodontitis": "Viêm cuống răng",
    "pulpal_necrosis": "Hoại tử tủy",
    "gingivitis": "Viêm lợi",
    "viêm lợi": "Viêm lợi",
    "periodontitis": "Viêm nha chu",
    "viêm nha chu": "Viêm nha chu",
    "halitosis": "Hôi miệng",
    "hôi miệng": "Hôi miệng",
    "fracture": "Gãy răng",
    "fissure": "Răng nứt",
    "abscess": "Áp xe răng",
    "á p xe": "Áp xe răng",
    "missing_tooth": "Thiếu răng",
    "discoloration": "Đổi màu răng",
    "malocclusion": "Răng lệch khớp cắn",
    "sensitivity": "Nhạy cảm răng",
    "calculus": "Cao răng",
    "stain": "Đốm răng",
    "pericoronitis": "Viêm quanh răng khôn",
    "fistula": "Rò quanh răng",
    "lesion": "Tổn thương",
    "other": "Khác",
  };
  const lower = cond.toLowerCase();
  return map[lower] ?? cond;
}

function translateFindings(findings: SummaryData["findings"]): SummaryData["findings"] {
  return findings.map((f) => ({ ...f, condition: conditionVi(f.condition) }));
}

function buildStructuredSummary(data: SummaryData): string {
  const translated = translateFindings(data.findings);
  const lines: string[] = [];
  if (data.patient) {
    lines.push(`## Bệnh nhân\n${data.patient.name}, ${data.patient.gender === "M" ? "Nam" : "Nữ"}, sinh ${data.patient.dob}, ĐT: ${data.patient.phone}`);
  }
  lines.push(`## Lượt khám ngày ${new Date(data.visit.date).toLocaleDateString("vi-VN")} (${visitStatusVi(data.visit.status)})`);
  if (data.visit.notes) lines.push(`Ghi chú: ${data.visit.notes}`);
  if (translated.length) {
    lines.push(`## Phát hiện lâm sàng (${translated.length})`);
    translated.forEach((f) => {
      const loc = f.scope === "tooth" ? `Răng ${f.tooth}` : f.scope === "full_mouth" ? "Toàn hàm" : `Mô mềm (${f.area ?? f.scope})`;
      lines.push(`- ${loc}: ${f.condition}${f.notes ? ` — ${f.notes}` : ""}`);
    });
  }
  if (data.planItems.some((p) => p.items.length)) {
    lines.push("## Kế hoạch điều trị");
    data.planItems.forEach(({ plan, items }) => {
      if (!items.length) return;
      lines.push(`[${visitStatusVi(plan?.status ?? "planned")}] Tổng: ${(plan?.total_cost ?? 0).toLocaleString("vi-VN")} ${plan?.currency || "VND"}`);
      items.forEach((i) => {
        const loc = i.tooth_number ? `Răng ${i.tooth_number}` : "Toàn hàm";
        lines.push(`  - ${loc}: ${procedureVi(i.procedure)} — ${i.description} (${i.unit_cost.toLocaleString("vi-VN")} VND) [${procedureVi(i.status)}]`);
      });
    });
  }
  return lines.join("\n");
}

function parseAiPlanResponse(
  raw: string,
  services: Awaited<ReturnType<ReturnType<typeof createTreatmentServicesRepository>["list"]>>,
): GeneratePlanResult | null {
  try {
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;
    const parsed = JSON.parse(jsonMatch[0]);
    if (!Array.isArray(parsed.items)) return null;
    return {
      items: parsed.items.flatMap((item: Record<string, unknown>) => {
        const requestedCode = typeof item.service_code === "string" ? item.service_code : "";
        const requestedProcedure = String(item.procedure || "other");
        const service = services.find((candidate) => candidate.code === requestedCode)
          ?? services.find((candidate) => candidate.procedure === requestedProcedure);
        if (services.length > 0 && !service) return [];
        return [{
          tooth: item.tooth == null ? null : (Number(item.tooth) || 0),
          service_code: service?.code,
          service_name: service?.name,
          procedure: service?.procedure ?? requestedProcedure,
          description: String(item.description || ""),
          cost: service?.price ?? (Number(item.cost) || 0),
        }];
      }),
      notes: String(parsed.notes || ""),
      ai_model: "llama-4-scout-17b",
      generated_at: new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

function parseAnalyzeImageResponse(raw: string): { analysis: string; findings: ImageAnalysisFinding[] } | null {
  try {
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;
    const parsed = JSON.parse(jsonMatch[0]);
    return {
      analysis: String(parsed.analysis || ""),
      findings: Array.isArray(parsed.findings)
        ? parsed.findings.map((f: Record<string, unknown>) => ({
            tooth_number: f.tooth_number == null ? null : (Number(f.tooth_number) || 0),
            scope: (String(f.scope || "tooth")) as ImageAnalysisFinding["scope"],
            area: f.area ? String(f.area) : undefined,
            condition: String(f.condition || "Không xác định"),
            description: String(f.description || ""),
            recommendation: String(f.recommendation || ""),
          }))
        : [],
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
  services: Awaited<ReturnType<ReturnType<typeof createTreatmentServicesRepository>["list"]>>,
): GeneratePlanResult {
  const items: TreatmentPlanItemDraft[] = findings.flatMap((f) => {
    const found = PROCEDURE_MAP[f.condition];
    const procedure = found?.procedure || "examination";
    const service = services.find((candidate) => candidate.procedure === procedure);
    if (services.length > 0 && !service) return [];
    const label = PROCEDURE_LABELS[procedure] || "Điều trị";
    const loc = f.scope === "tooth" && f.tooth_number != null
      ? `răng ${f.tooth_number}`
      : f.scope === "full_mouth"
        ? "toàn hàm"
        : `mô mềm (${f.area ?? f.scope})`;
    return [{
      tooth: f.tooth_number ?? null,
      service_code: service?.code,
      service_name: service?.name,
      procedure: service?.procedure ?? procedure,
      description: `${label} ${loc}${f.notes ? ` — ${f.notes}` : ""}`,
      cost: service?.price ?? found?.cost ?? 200000,
    }];
  });

  const patientName = patient?.name || "bệnh nhân";
  return {
    items,
    notes: `Kế hoạch điều trị cho ${patientName} dựa trên clinical findings${visit ? ` từ lượt khám ngày ${new Date(visit.date).toLocaleDateString("vi-VN")}` : ""}. Chi phí là ước tính, cần điều chỉnh theo thực tế.`,
    ai_model: "structured-fallback",
    generated_at: new Date().toISOString(),
  };
}
