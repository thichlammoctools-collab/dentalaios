import type { D1Database } from "@cloudflare/workers-types";
import type { TreatmentPlan, TreatmentPlanItem } from "@shared/types";
import type { PlanCreateInput, PlanItemCreateInput } from "@shared/validation";
import { createTreatmentPlansRepository } from "../repositories/treatment-plans.repo";
import { createTreatmentItemsRepository } from "../repositories/treatment-items.repo";
import { NotFoundError, ValidationError } from "../lib/errors";

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
    const item = await createTreatmentItemsRepository(db).create(tenantId, planId, {
      tooth_number: data.tooth_number ?? undefined,
      procedure: data.procedure,
      description: data.description,
      unit_cost: data.unit_cost,
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
};