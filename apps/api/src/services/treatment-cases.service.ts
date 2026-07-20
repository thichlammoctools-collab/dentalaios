import type { D1Database } from "@cloudflare/workers-types";
import type { TreatmentCase, TreatmentCaseStatus, TreatmentCaseStatusHistory } from "@shared/types";
import type { TreatmentCaseActivateInput } from "@shared/validation";
import { createTreatmentPlansRepository } from "../repositories/treatment-plans.repo";
import { createTreatmentCasesRepository } from "../repositories/treatment-cases.repo";
import { assertAllInTenant } from "../lib/tenant-scope";
import { ConflictError, NotFoundError, ValidationError } from "../lib/errors";

const CASE_LABELS = {
  general: "Ca điều trị tổng quát",
  implant: "Ca Implant",
  orthodontics: "Ca chỉnh nha",
  prosthodontics: "Ca phục hình",
  full_mouth: "Ca điều trị toàn hàm",
  other: "Ca điều trị",
} as const;

export const treatmentCasesService = {
  async getByPlanId(db: D1Database, tenantId: string, planId: string): Promise<TreatmentCase | null> {
    return createTreatmentCasesRepository(db).getByPlanId(tenantId, planId);
  },

  async activate(
    db: D1Database,
    tenantId: string,
    planId: string,
    actor: { userId: string; branchId: string },
    data: TreatmentCaseActivateInput,
  ): Promise<TreatmentCase> {
    const plans = createTreatmentPlansRepository(db);
    const plan = await plans.getById(tenantId, planId);
    if (!plan) throw new NotFoundError("Kế hoạch điều trị không tồn tại");
    if (plan.status !== "approved") {
      throw new ValidationError("Chỉ có thể kích hoạt ca từ kế hoạch đã duyệt");
    }
    const cases = createTreatmentCasesRepository(db);
    if (await cases.getByPlanId(tenantId, planId)) {
      throw new ConflictError("Kế hoạch này đã có ca điều trị");
    }
    await assertAllInTenant(db, tenantId, [
      { table: "branches", id: actor.branchId },
      { table: "users", id: actor.userId },
    ]);
    const caseNumber = await allocateCaseNumber(db, tenantId);
    const caseType = data.case_type;
    return cases.create({
      tenantId,
      treatmentPlanId: planId,
      patientId: plan.patient_id,
      caseNumber,
      caseType,
      branchId: actor.branchId,
      clinicianId: actor.userId,
      title: data.title ?? CASE_LABELS[caseType],
      clinicalSummary: data.clinical_summary,
      treatmentGoal: data.treatment_goal,
      targetCompletedAt: data.target_completed_at,
      createdBy: actor.userId,
    });
  },

  async transition(
    db: D1Database,
    tenantId: string,
    planId: string,
    actorUserId: string,
    target: TreatmentCaseStatus,
    reason?: string,
  ): Promise<TreatmentCase> {
    const cases = createTreatmentCasesRepository(db);
    const treatmentCase = await cases.getByPlanId(tenantId, planId);
    if (!treatmentCase) throw new NotFoundError("Ca điều trị không tồn tại");
    const allowed: Record<TreatmentCaseStatus, TreatmentCaseStatus[]> = {
      active: ["paused", "completed", "cancelled"],
      paused: ["active", "cancelled"],
      completed: [],
      cancelled: [],
    };
    if (!allowed[treatmentCase.status].includes(target)) {
      throw new ConflictError(`Không thể chuyển ca từ ${treatmentCase.status} sang ${target}`);
    }
    if ((target === "paused" || target === "cancelled") && !reason) {
      throw new ValidationError("Cần nhập lý do cho thay đổi trạng thái này");
    }
    const changed = await cases.transition(tenantId, treatmentCase.id, treatmentCase.status, target, actorUserId, reason);
    if (!changed) throw new ConflictError("Trạng thái ca đã thay đổi, vui lòng tải lại");
    const updated = await cases.getById(tenantId, treatmentCase.id);
    if (!updated) throw new NotFoundError("Ca điều trị không tồn tại");
    return updated;
  },

  async listStatusHistory(db: D1Database, tenantId: string, planId: string): Promise<TreatmentCaseStatusHistory[]> {
    const treatmentCase = await createTreatmentCasesRepository(db).getByPlanId(tenantId, planId);
    if (!treatmentCase) throw new NotFoundError("Ca điều trị không tồn tại");
    return createTreatmentCasesRepository(db).listStatusHistory(tenantId, treatmentCase.id);
  },
};

async function allocateCaseNumber(db: D1Database, tenantId: string): Promise<string> {
  const dateKey = hoChiMinhDateKey();
  const row = await db.prepare(
    `INSERT INTO treatment_case_counters (tenant_id, date_key, last_seq)
     VALUES (?, ?, 1)
     ON CONFLICT(tenant_id, date_key) DO UPDATE SET last_seq = last_seq + 1
     RETURNING last_seq`,
  ).bind(tenantId, dateKey).first<{ last_seq: number }>();
  if (!row) throw new Error("Không thể cấp mã ca điều trị");
  return `CA-${dateKey}-${String(row.last_seq).padStart(4, "0")}`;
}

function hoChiMinhDateKey(): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value;
  return `${part("year")}${part("month")}${part("day")}`;
}
