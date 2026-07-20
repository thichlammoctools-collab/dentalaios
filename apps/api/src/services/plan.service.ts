import type { D1Database } from "@cloudflare/workers-types";
import type { TreatmentPlan, TreatmentPlanItem } from "@shared/types";
import type { PlanCreateInput, PlanItemCreateInput, PlanItemUpdateInput } from "@shared/validation";
import { createTreatmentPlansRepository } from "../repositories/treatment-plans.repo";
import { createTreatmentItemsRepository } from "../repositories/treatment-items.repo";
import { createTreatmentServicesRepository } from "../repositories/treatment-service-prices.repo";
import { NotFoundError, ValidationError } from "../lib/errors";
import { assertAllInTenant } from "../lib/tenant-scope";
import { assertTreatmentPersonnel } from "../lib/personnel";

export const planService = {
  list(
    db: D1Database,
    tenantId: string,
    opts: Parameters<ReturnType<typeof createTreatmentPlansRepository>["list"]>[1],
  ): Promise<TreatmentPlan[]> {
    return createTreatmentPlansRepository(db).list(tenantId, opts);
  },

  async get(db: D1Database, tenantId: string, id: string): Promise<TreatmentPlan> {
    const plan = await createTreatmentPlansRepository(db).getById(tenantId, id);
    if (!plan) throw new NotFoundError("Treatment plan not found");
    return plan;
  },

  listItems(db: D1Database, tenantId: string, planId: string): Promise<TreatmentPlanItem[]> {
    return createTreatmentItemsRepository(db).listByPlan(tenantId, planId);
  },

  async create(db: D1Database, tenantId: string, data: PlanCreateInput): Promise<TreatmentPlan> {
    // Enforce that the visit + patient referenced belong to the caller's tenant
    // and that the visit's own patient_id matches. Prevents cross-tenant plans
    // (H-02) and plans that link a valid visit to an unrelated patient.
    await assertAllInTenant(db, tenantId, [
      { table: "visits", id: data.visit_id },
      { table: "patients", id: data.patient_id },
    ]);
    const visit = await db
      .prepare("SELECT patient_id FROM visits WHERE tenant_id = ? AND id = ? LIMIT 1")
      .bind(tenantId, data.visit_id)
      .first<{ patient_id: string }>();
    if (!visit || visit.patient_id !== data.patient_id) {
      throw new ValidationError("patient_id không khớp với visit");
    }
    return createTreatmentPlansRepository(db).create(tenantId, {
      visit_id: data.visit_id,
      patient_id: data.patient_id,
      currency: data.currency,
      notes: data.notes,
    });
  },

  async addItem(
    db: D1Database,
    tenantId: string,
    planId: string,
    data: PlanItemCreateInput,
  ): Promise<TreatmentPlanItem> {
    const plans = createTreatmentPlansRepository(db);
    const plan = await plans.getById(tenantId, planId);
    if (!plan) throw new NotFoundError("Treatment plan not found");
    if (plan.status !== "draft") {
      throw new ValidationError("Chỉ có thể thêm item khi plan đang ở trạng thái draft");
    }
    const service = data.service_code
      ? await createTreatmentServicesRepository(db).getActiveByCode(tenantId, data.service_code)
      : null;
    if (data.service_code && !service) {
      throw new ValidationError("Mã dịch vụ không hợp lệ hoặc đã ngừng áp dụng");
    }
    await assertAllInTenant(db, tenantId, [
      { table: "users", id: data.treating_clinician_id ?? undefined },
      { table: "users", id: data.assistant_id ?? undefined },
    ]);
    await assertTreatmentPersonnel(db, tenantId, {
      treatingClinicianId: data.treating_clinician_id ?? undefined,
      assistantId: data.assistant_id ?? undefined,
    });
    const item = await createTreatmentItemsRepository(db).create(tenantId, planId, {
      tooth_number: data.tooth_number ?? undefined,
      service_code: service?.code,
      service_name: service?.name,
      procedure: service?.procedure ?? data.procedure,
      description: data.description,
      unit_cost: service?.price ?? data.unit_cost,
      price_includes_vat: true,
      treating_clinician_id: data.treating_clinician_id ?? undefined,
      assistant_id: data.assistant_id ?? undefined,
    });
    // Recompute total in same tenant scope
    await plans.recomputeTotal(tenantId, planId);
    return item;
  },

  async removeItem(db: D1Database, tenantId: string, planId: string, itemId: string): Promise<boolean> {
    // Verify item belongs to this plan
    const items = await createTreatmentItemsRepository(db).listByPlan(tenantId, planId);
    if (!items.some((it) => it.id === itemId)) return false;
    const ok = await createTreatmentItemsRepository(db).delete(tenantId, itemId);
    if (ok) await createTreatmentPlansRepository(db).recomputeTotal(tenantId, planId);
    return ok;
  },

  async updateItem(
    db: D1Database,
    tenantId: string,
    planId: string,
    itemId: string,
    data: PlanItemUpdateInput,
  ): Promise<TreatmentPlanItem> {
    const plans = createTreatmentPlansRepository(db);
    const plan = await plans.getById(tenantId, planId);
    if (!plan) throw new NotFoundError("Treatment plan not found");
    if (plan.status !== "draft") {
      throw new ValidationError("Chỉ có thể sửa item khi plan đang ở trạng thái draft");
    }

    const items = createTreatmentItemsRepository(db);
    if (!((await items.listByPlan(tenantId, planId)).some((item) => item.id === itemId))) {
      throw new NotFoundError("Treatment plan item not found");
    }
    const service = data.service_code
      ? await createTreatmentServicesRepository(db).getActiveByCode(tenantId, data.service_code)
      : null;
    if (data.service_code && !service) {
      throw new ValidationError("Mã dịch vụ không hợp lệ hoặc đã ngừng áp dụng");
    }
    await assertAllInTenant(db, tenantId, [
      { table: "users", id: data.treating_clinician_id ?? undefined },
      { table: "users", id: data.assistant_id ?? undefined },
    ]);
    await assertTreatmentPersonnel(db, tenantId, {
      treatingClinicianId: data.treating_clinician_id ?? undefined,
      assistantId: data.assistant_id ?? undefined,
    });
    const updated = await items.update(tenantId, itemId, {
      tooth_number: data.tooth_number ?? undefined,
      service_code: service?.code,
      service_name: service?.name,
      procedure: service?.procedure ?? data.procedure,
      description: data.description,
      unit_cost: service?.price ?? data.unit_cost,
      price_includes_vat: true,
      treating_clinician_id: data.treating_clinician_id ?? undefined,
      assistant_id: data.assistant_id ?? undefined,
    });
    if (!updated) throw new NotFoundError("Treatment plan item not found");
    await plans.recomputeTotal(tenantId, planId);
    return updated;
  },

  async approve(db: D1Database, tenantId: string, planId: string): Promise<TreatmentPlan> {
    const plan = await this.get(db, tenantId, planId);
    if (plan.status !== "draft") {
      throw new ValidationError(`Plan đang ở trạng thái ${plan.status}, không thể duyệt`);
    }
    const items = await createTreatmentItemsRepository(db).listByPlan(tenantId, planId);
    if (items.length === 0) {
      throw new ValidationError("Plan phải có ít nhất 1 item trước khi duyệt");
    }
    const approved = await createTreatmentPlansRepository(db).approve(tenantId, planId);
    if (!approved) throw new NotFoundError("Treatment plan not found");
    return approved;
  },

  async deletePlan(db: D1Database, tenantId: string, planId: string): Promise<boolean> {
    const plan = await this.get(db, tenantId, planId);
    if (plan.status === "completed") {
      throw new ValidationError("Không thể xóa kế hoạch đã hoàn thành");
    }
    const completedItem = await db
      .prepare(
        "SELECT 1 FROM treatment_plan_items WHERE tenant_id = ? AND treatment_plan_id = ? AND status = 'completed' LIMIT 1",
      )
      .bind(tenantId, planId)
      .first();
    if (completedItem) {
      throw new ValidationError("Không thể xóa kế hoạch đã có hạng mục điều trị hoàn thành");
    }

    const treatmentCase = await db
      .prepare("SELECT status FROM treatment_cases WHERE tenant_id = ? AND treatment_plan_id = ? LIMIT 1")
      .bind(tenantId, planId)
      .first<{ status: string }>();
    if (treatmentCase?.status === "completed") {
      throw new ValidationError("Không thể xóa kế hoạch có ca điều trị đã hoàn thành");
    }
    if (treatmentCase) {
      throw new ValidationError("Không thể xóa kế hoạch đã có ca điều trị");
    }

    const payment = await db
      .prepare("SELECT 1 FROM payments WHERE tenant_id = ? AND treatment_plan_id = ? LIMIT 1")
      .bind(tenantId, planId)
      .first();
    if (payment) {
      throw new ValidationError("Không thể xóa kế hoạch đã phát sinh phiếu thanh toán");
    }

    return createTreatmentPlansRepository(db).delete(tenantId, planId);
  },
};
