import type { D1Database } from "@cloudflare/workers-types";
import type { ParaclinicalOrder, ParaclinicalOrderStatusHistory } from "@shared/types";
import type { ParaclinicalOrderCreateInput, ParaclinicalOrderUpdateInput } from "@shared/validation";
import { ConflictError, NotFoundError, ValidationError } from "../lib/errors";
import { createParaclinicalOrdersRepository } from "../repositories/paraclinical-orders.repo";
import { createVisitsRepository } from "../repositories/visits.repo";

export const paraclinicalOrderService = {
  async listByVisit(db: D1Database, tenantId: string, visitId: string): Promise<ParaclinicalOrder[]> {
    await requireVisit(db, tenantId, visitId);
    return createParaclinicalOrdersRepository(db).listByVisit(tenantId, visitId);
  },

  async listByPatient(db: D1Database, tenantId: string, patientId: string): Promise<ParaclinicalOrder[]> {
    return createParaclinicalOrdersRepository(db).listByPatient(tenantId, patientId);
  },

  async listStatusHistory(db: D1Database, tenantId: string, visitId: string, orderId: string): Promise<ParaclinicalOrderStatusHistory[]> {
    const order = await createParaclinicalOrdersRepository(db).get(tenantId, orderId);
    if (!order || order.visit_id !== visitId) throw new NotFoundError("Chỉ định không tồn tại");
    return createParaclinicalOrdersRepository(db).listStatusHistory(tenantId, orderId);
  },

  async create(
    db: D1Database,
    tenantId: string,
    visitId: string,
    actorId: string,
    data: ParaclinicalOrderCreateInput,
  ): Promise<ParaclinicalOrder> {
    const visit = await requireVisit(db, tenantId, visitId);
    if (visit.locked_at) throw new ConflictError("Hồ sơ lượt khám đã ký và khóa");
    if (data.diagnosis_id) {
      const diag = await db.prepare("SELECT id FROM clinical_diagnoses WHERE tenant_id = ? AND id = ? AND visit_id = ? LIMIT 1")
        .bind(tenantId, data.diagnosis_id, visitId).first();
      if (!diag) throw new ValidationError("Chẩn đoán không thuộc lượt khám này");
    }
    const now = new Date().toISOString();
    const repo = createParaclinicalOrdersRepository(db);
    const order: ParaclinicalOrder = {
      id: crypto.randomUUID(),
      tenant_id: tenantId,
      visit_id: visitId,
      patient_id: visit.patient_id,
      diagnosis_id: data.diagnosis_id ?? undefined,
      order_type: data.order_type,
      custom_type_name: data.custom_type_name ?? undefined,
      body_site: data.body_site ?? undefined,
      status: "pending",
      clinical_reason: data.clinical_reason,
      ordered_by: actorId,
      ordered_at: now,
      notes: data.notes ?? undefined,
      created_at: now,
      updated_at: now,
    };
    return repo.create(order);
  },

  async update(
    db: D1Database,
    tenantId: string,
    visitId: string,
    orderId: string,
    _actorId: string,
    data: ParaclinicalOrderUpdateInput,
  ): Promise<ParaclinicalOrder> {
    const repo = createParaclinicalOrdersRepository(db);
    const current = await repo.get(tenantId, orderId);
    if (!current || current.visit_id !== visitId) throw new NotFoundError("Chỉ định không tồn tại");

    const now = new Date().toISOString();
    const next: ParaclinicalOrder = { ...current, updated_at: now };

    let previousStatus: ParaclinicalOrder["status"] | undefined;
    if (data.status !== undefined) {
      const allowed: Record<string, string[]> = {
        pending: ["in_progress", "cancelled"],
        in_progress: ["completed", "cancelled"],
      };
      const transitions = allowed[current.status] ?? [];
      if (!transitions.includes(data.status)) {
        throw new ValidationError(`Không thể chuyển trạng thái từ "${current.status}" sang "${data.status}"`);
      }
      previousStatus = current.status;
      next.status = data.status;
      if (data.status === "completed") next.completed_at = now;
      if (data.status === "cancelled") {
        next.cancelled_at = now;
        if (!data.cancel_reason) throw new ValidationError("Cần lý do hủy chỉ định");
        next.cancel_reason = data.cancel_reason;
      }
    }

    if (data.result_summary !== undefined) next.result_summary = data.result_summary ?? undefined;
    if (data.result_file_id !== undefined) next.result_file_id = data.result_file_id ?? undefined;
    if (data.abnormal_flag !== undefined) next.abnormal_flag = data.abnormal_flag ?? undefined;
    if (data.notes !== undefined) next.notes = data.notes ?? undefined;

    const updated = await repo.update(tenantId, orderId, next);
    if (!updated) throw new NotFoundError("Chỉ định không tồn tại");
    if (previousStatus) await repo.addStatusHistory(tenantId, orderId, previousStatus, updated.status, _actorId, now);
    return updated;
  },
};

async function requireVisit(db: D1Database, tenantId: string, visitId: string) {
  const visit = await createVisitsRepository(db).getById(tenantId, visitId);
  if (!visit) throw new NotFoundError("Visit not found");
  return visit;
}
