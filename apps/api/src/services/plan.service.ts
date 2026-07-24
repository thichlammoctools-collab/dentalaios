import type { D1Database } from "@cloudflare/workers-types";
import type { TreatmentPlan, TreatmentPlanItem } from "@shared/types";
import type { PlanBatchCreateInput, PlanCreateInput, PlanItemCreateInput, PlanItemUpdateInput } from "@shared/validation";
import { allocateTreatmentPlanCode, createTreatmentPlansRepository } from "../repositories/treatment-plans.repo";
import { createTreatmentItemsRepository } from "../repositories/treatment-items.repo";
import { createTreatmentServicesRepository } from "../repositories/treatment-service-prices.repo";
import { NotFoundError, ValidationError } from "../lib/errors";
import { assertAllInTenant } from "../lib/tenant-scope";
import { assertTreatmentPersonnel } from "../lib/personnel";
import { createTreatmentPlanVersionsRepository, type TreatmentPlanVersionRecord } from "../repositories/treatment-plan-versions.repo";

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

  async createWithItems(
    db: D1Database,
    tenantId: string,
    data: PlanBatchCreateInput,
  ): Promise<{ plan: TreatmentPlan; items: TreatmentPlanItem[] }> {
    await assertAllInTenant(db, tenantId, [
      { table: "visits", id: data.plan.visit_id },
      { table: "patients", id: data.plan.patient_id },
      ...data.items.flatMap((item) => [
        { table: "users" as const, id: item.treating_clinician_id ?? undefined },
        { table: "users" as const, id: item.assistant_id ?? undefined },
      ]),
    ]);
    const visit = await db
      .prepare("SELECT patient_id FROM visits WHERE tenant_id = ? AND id = ? LIMIT 1")
      .bind(tenantId, data.plan.visit_id)
      .first<{ patient_id: string }>();
    if (!visit || visit.patient_id !== data.plan.patient_id) {
      throw new ValidationError("patient_id không khớp với visit");
    }

    const services = createTreatmentServicesRepository(db);
    const resolvedItems = [] as Array<{
      id: string;
      tooth_number: number | null;
      service_code?: string;
      service_name?: string;
      procedure: string;
      description: string;
      unit_cost: number;
      estimated_duration_min: number;
      treating_clinician_id: string | null;
      assistant_id: string | null;
    }>;
    for (const [itemIndex, item] of data.items.entries()) {
      const service = item.service_code ? await services.getActiveByCode(tenantId, item.service_code) : null;
      if (item.service_code && !service) {
        throw new ValidationError("Mã dịch vụ không hợp lệ hoặc đã ngừng áp dụng", { item_index: itemIndex });
      }
      try {
        await assertTreatmentPersonnel(db, tenantId, {
          treatingClinicianId: item.treating_clinician_id ?? undefined,
          assistantId: item.assistant_id ?? undefined,
        });
      } catch (error) {
        if (error instanceof ValidationError) {
          throw new ValidationError(error.message, { item_index: itemIndex });
        }
        throw error;
      }
      resolvedItems.push({
        id: crypto.randomUUID(),
        tooth_number: item.tooth_number,
        service_code: service?.code,
        service_name: service?.name,
        procedure: service?.procedure ?? item.procedure,
        description: item.description,
        unit_cost: service?.price ?? item.unit_cost,
        estimated_duration_min: service?.estimated_duration_min ?? item.estimated_duration_min,
        treating_clinician_id: item.treating_clinician_id ?? null,
        assistant_id: item.assistant_id ?? null,
      });
    }

    const planId = crypto.randomUUID();
    const planCode = await allocateTreatmentPlanCode(db, tenantId);
    const totalCost = resolvedItems.reduce((sum, item) => sum + item.unit_cost, 0);
    const statements = [
      db.prepare(`INSERT INTO treatment_plans
        (id, code, tenant_id, visit_id, patient_id, total_cost, currency, notes)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
        .bind(planId, planCode, tenantId, data.plan.visit_id, data.plan.patient_id, totalCost, data.plan.currency, data.plan.notes ?? null),
      ...resolvedItems.flatMap((item) => [
        db.prepare(`INSERT INTO treatment_plan_items
          (id, tenant_id, treatment_plan_id, tooth_number, procedure, description, unit_cost, estimated_duration_min, treating_clinician_id, assistant_id)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
          .bind(item.id, tenantId, planId, item.tooth_number, item.procedure, item.description, item.unit_cost, item.estimated_duration_min, item.treating_clinician_id, item.assistant_id),
        db.prepare(`INSERT INTO treatment_plan_item_price_snapshots
          (treatment_plan_item_id, tenant_id, service_code, service_name, price_includes_vat)
          VALUES (?, ?, ?, ?, 1)`)
          .bind(item.id, tenantId, item.service_code ?? null, item.service_name ?? null),
      ]),
    ];
    await db.batch(statements);

    const plan = await this.get(db, tenantId, planId);
    const items = await this.listItems(db, tenantId, planId);
    return { plan, items };
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
      estimated_duration_min: service?.estimated_duration_min ?? data.estimated_duration_min,
      price_includes_vat: true,
      treating_clinician_id: data.treating_clinician_id ?? undefined,
      assistant_id: data.assistant_id ?? undefined,
    });
    // Recompute total in same tenant scope
    await plans.recomputeTotal(tenantId, planId);
    return item;
  },

  async addItems(
    db: D1Database,
    tenantId: string,
    planId: string,
    items: PlanItemCreateInput[],
  ): Promise<TreatmentPlanItem[]> {
    const plans = createTreatmentPlansRepository(db);
    const plan = await plans.getById(tenantId, planId);
    if (!plan) throw new NotFoundError("Treatment plan not found");
    if (plan.status !== "draft") {
      throw new ValidationError("Chỉ có thể thêm item khi plan đang ở trạng thái draft");
    }

    const services = createTreatmentServicesRepository(db);
    const resolvedItems = [] as Array<{
      id: string;
      data: PlanItemCreateInput;
      service: Awaited<ReturnType<typeof services.getActiveByCode>>;
    }>;

    for (const [itemIndex, data] of items.entries()) {
      const service = data.service_code ? await services.getActiveByCode(tenantId, data.service_code) : null;
      if (data.service_code && !service) {
        throw new ValidationError("Mã dịch vụ không hợp lệ hoặc đã ngừng áp dụng", { item_index: itemIndex });
      }
      await assertAllInTenant(db, tenantId, [
        { table: "users", id: data.treating_clinician_id ?? undefined },
        { table: "users", id: data.assistant_id ?? undefined },
      ]);
      try {
        await assertTreatmentPersonnel(db, tenantId, {
          treatingClinicianId: data.treating_clinician_id ?? undefined,
          assistantId: data.assistant_id ?? undefined,
        });
      } catch (error) {
        if (error instanceof ValidationError) {
          throw new ValidationError(error.message, { item_index: itemIndex });
        }
        throw error;
      }
      resolvedItems.push({ id: crypto.randomUUID(), data, service });
    }

    const statements = resolvedItems.flatMap(({ id, data, service }) => [
      db.prepare(
        `INSERT INTO treatment_plan_items
            (id, tenant_id, treatment_plan_id, tooth_number, procedure, description, unit_cost, estimated_duration_min,
             treating_clinician_id, assistant_id)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(
        id, tenantId, planId, data.tooth_number ?? null, service?.procedure ?? data.procedure,
        data.description, service?.price ?? data.unit_cost, service?.estimated_duration_min ?? data.estimated_duration_min,
        data.treating_clinician_id ?? null, data.assistant_id ?? null,
      ),
      db.prepare(
        `INSERT INTO treatment_plan_item_price_snapshots
            (treatment_plan_item_id, tenant_id, service_code, service_name, price_includes_vat)
          VALUES (?, ?, ?, ?, ?)`,
      ).bind(id, tenantId, service?.code ?? null, service?.name ?? null, 1),
    ]);
    statements.push(
      db.prepare(
        `UPDATE treatment_plans
            SET total_cost = COALESCE((SELECT SUM(unit_cost) FROM treatment_plan_items WHERE tenant_id = ? AND treatment_plan_id = ?), 0),
                updated_at = datetime('now')
          WHERE tenant_id = ? AND id = ?`,
      ).bind(tenantId, planId, tenantId, planId),
    );
    await db.batch(statements);
    return createTreatmentItemsRepository(db).listByPlan(tenantId, planId);
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
      estimated_duration_min: service?.estimated_duration_min ?? data.estimated_duration_min,
      price_includes_vat: true,
      treating_clinician_id: data.treating_clinician_id ?? undefined,
      assistant_id: data.assistant_id ?? undefined,
    });
    if (!updated) throw new NotFoundError("Treatment plan item not found");
    await plans.recomputeTotal(tenantId, planId);
    return updated;
  },

  async approve(db: D1Database, tenantId: string, planId: string, doctorId: string = ""): Promise<{ plan: TreatmentPlan; version: TreatmentPlanVersionRecord }> {
    const plan = await this.get(db, tenantId, planId);
    if (plan.status !== "draft") {
      throw new ValidationError(`Plan đang ở trạng thái ${plan.status}, không thể duyệt`);
    }
    const items = await createTreatmentItemsRepository(db).listByPlan(tenantId, planId);
    if (items.length === 0) {
      throw new ValidationError("Plan phải có ít nhất 1 item trước khi duyệt");
    }
    const now = new Date().toISOString();
    const nextVersionNo = (plan.current_version_no ?? 0) + 1;
    const snapshotObj = { plan, items, approved_by: doctorId, approved_at: now, version_no: nextVersionNo };
    const snapshotJson = JSON.stringify(snapshotObj);
    const sha256 = await computeSha256Hex(snapshotJson);
    const versionId = crypto.randomUUID();
    await db.batch([
      db.prepare(`INSERT INTO treatment_plan_versions
        (id, tenant_id, treatment_plan_id, version_no, state, snapshot_json, sha256, created_by, approved_by, approved_at, archive_file_id, template_version, created_at)
        VALUES (?, ?, ?, ?, 'clinically_approved', ?, ?, ?, ?, ?, NULL, '1.0', ?)`)
        .bind(versionId, tenantId, planId, nextVersionNo, snapshotJson, sha256, doctorId || plan.patient_id, doctorId || null, now, now),
      db.prepare(`UPDATE treatment_plans
        SET status = 'approved', approved_by = ?, approved_at = ?, current_version_no = ?, clinical_approved_version_id = ?, updated_at = ?
        WHERE tenant_id = ? AND id = ? AND status = 'draft'`)
        .bind(doctorId || null, now, nextVersionNo, versionId, now, tenantId, planId),
    ]);
    const updatedPlan = await this.get(db, tenantId, planId);
    const version = await createTreatmentPlanVersionsRepository(db).getApproved(tenantId, versionId);
    if (!version) throw new Error("Plan approval succeeded but version read failed");
    return { plan: updatedPlan, version };
  },
  async listVersions(db: D1Database, tenantId: string, planId: string): Promise<TreatmentPlanVersionRecord[]> {
    await this.get(db, tenantId, planId);
    return createTreatmentPlanVersionsRepository(db).listByPlan(tenantId, planId);
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

async function computeSha256Hex(data: string): Promise<string> {
  const bytes = new TextEncoder().encode(data);
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, "0")).join("");
}
