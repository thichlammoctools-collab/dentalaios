import type { D1Database } from "@cloudflare/workers-types";
import type { Visit, ClinicalFinding } from "@shared/types";
import type { VisitCreateInput, VisitUpdateInput, FindingCreateInput, FindingUpdateInput } from "@shared/validation";
import { createVisitsRepository } from "../repositories/visits.repo";
import { createFindingsRepository } from "../repositories/findings.repo";
import { createAppointmentsRepository } from "../repositories/appointments.repo";
import { createChairsRepository } from "../repositories/chairs.repo";
import { ConflictError, NotFoundError, ValidationError } from "../lib/errors";
import { assertAllInTenant } from "../lib/tenant-scope";

export const visitService = {
  list(
    db: D1Database,
    tenantId: string,
    opts: Parameters<ReturnType<typeof createVisitsRepository>["list"]>[1],
  ): Promise<Visit[]> {
    return createVisitsRepository(db).list(tenantId, opts);
  },

  async get(db: D1Database, tenantId: string, id: string): Promise<Visit> {
    const visit = await createVisitsRepository(db).getById(tenantId, id);
    if (!visit) throw new NotFoundError("Visit not found");
    return visit;
  },

  async create(db: D1Database, tenantId: string, data: VisitCreateInput): Promise<Visit> {
    // Ensure every foreign-key reference belongs to the caller's tenant.
    // Prevents cross-tenant reference injection (H-02) where a caller from
    // tenant A supplies a patient/branch/user id from tenant B.
    await assertAllInTenant(db, tenantId, [
      { table: "patients", id: data.patient_id },
      { table: "branches", id: data.branch_id },
      { table: "users", id: data.clinician_id },
      { table: "users", id: data.treating_clinician_id ?? undefined },
      { table: "users", id: data.assistant_id ?? undefined },
    ]);
    const visits = createVisitsRepository(db);
    let chairId = data.chair_id;
    if (data.source_appointment_id) {
      const existing = await visits.getBySourceAppointmentId(tenantId, data.source_appointment_id);
      if (existing) return existing;

      const appointment = await createAppointmentsRepository(db).getById(tenantId, data.source_appointment_id);
      if (!appointment || appointment.patient_id !== data.patient_id || appointment.branch_id !== data.branch_id) {
        throw new ValidationError("Lịch hẹn không hợp lệ cho lượt khám này");
      }
      if (appointment.status === "cancelled" || appointment.status === "no_show" || !appointment.chair_id) {
        throw new ValidationError("Lịch hẹn chưa thể bắt đầu khám");
      }
      chairId = appointment.chair_id;
    }
    await assertVisitChair(db, tenantId, data.branch_id, chairId, !data.source_appointment_id);
    const created = await visits.create(tenantId, {
      patient_id: data.patient_id,
      branch_id: data.branch_id,
      clinician_id: data.clinician_id,
      date: data.date ?? new Date().toISOString(),
      notes: data.notes,
      treating_clinician_id: data.treating_clinician_id ?? undefined,
      assistant_id: data.assistant_id ?? undefined,
      chair_id: chairId,
      source_appointment_id: data.source_appointment_id,
      blood_pressure_systolic: data.blood_pressure_systolic,
      blood_pressure_diastolic: data.blood_pressure_diastolic,
      blood_sugar_mgdl: data.blood_sugar_mgdl,
      vitals_recorded_at: data.blood_pressure_systolic || data.blood_pressure_diastolic || data.blood_sugar_mgdl
        ? new Date().toISOString()
        : undefined,
    });
    if (data.source_appointment_id) {
      const appointment = await createAppointmentsRepository(db).getById(tenantId, data.source_appointment_id);
      if (appointment && (appointment.status === "booked" || appointment.status === "confirmed")) {
        await createAppointmentsRepository(db).update(tenantId, appointment.id, { status: "arrived" });
      }
    }
    return created;
  },

  async update(db: D1Database, tenantId: string, id: string, data: VisitUpdateInput): Promise<Visit> {
    // Ownership check for optional user references on update.
    await assertAllInTenant(db, tenantId, [
      { table: "users", id: data.treating_clinician_id ?? undefined },
      { table: "users", id: data.assistant_id ?? undefined },
    ]);
    const visits = createVisitsRepository(db);
    const current = await visits.getById(tenantId, id);
    if (!current) throw new NotFoundError("Visit not found");
    if (data.chair_id !== undefined) {
      if (await hasConfirmedPayment(db, tenantId, id)) {
        throw new ConflictError("Không thể đổi ghế vì lượt khám đã có doanh thu xác nhận");
      }
      await assertVisitChair(db, tenantId, current.branch_id, data.chair_id, false);
    }
    const updated = await visits.update(tenantId, id, {
      ...data,
      treating_clinician_id: data.treating_clinician_id ?? undefined,
      assistant_id: data.assistant_id ?? undefined,
    });
    if (!updated) throw new NotFoundError("Visit not found");
    return updated;
  },

  listFindings(db: D1Database, tenantId: string, visitId: string): Promise<ClinicalFinding[]> {
    return createFindingsRepository(db).listByVisit(tenantId, visitId);
  },

  async addFinding(
    db: D1Database,
    tenantId: string,
    visitId: string,
    data: FindingCreateInput,
  ): Promise<ClinicalFinding> {
    const visit = await createVisitsRepository(db).getById(tenantId, visitId);
    if (!visit) throw new NotFoundError("Visit not found");
    return createFindingsRepository(db).create(tenantId, visitId, {
      tooth_number: data.tooth_number ?? undefined,
      tooth_system: data.scope === "tooth" ? "FDI" : undefined,
      scope: data.scope ?? "tooth",
      area: data.area,
      condition: data.condition,
      notes: data.notes,
    });
  },

  async updateFinding(
    db: D1Database,
    tenantId: string,
    visitId: string,
    findingId: string,
    data: FindingUpdateInput,
  ): Promise<ClinicalFinding> {
    const visit = await createVisitsRepository(db).getById(tenantId, visitId);
    if (!visit) throw new NotFoundError("Visit not found");
    return createFindingsRepository(db).update(tenantId, findingId, {
      condition: data.condition,
      notes: data.notes ?? null,
    });
  },
};

async function assertVisitChair(
  db: D1Database,
  tenantId: string,
  branchId: string,
  chairId: string | null | undefined,
  requireOperational: boolean,
): Promise<void> {
  if (!chairId) {
    if (requireOperational) throw new ValidationError("Vui lòng chọn ghế nha");
    return;
  }
  const chair = await createChairsRepository(db).getById(tenantId, chairId);
  if (!chair || chair.branch_id !== branchId) throw new ValidationError("Ghế nha không thuộc chi nhánh của lượt khám");
  if (requireOperational && (!chair.is_active || chair.operational_status === "maintenance" || chair.operational_status === "out_of_service")) {
    throw new ConflictError("Ghế nha hiện không thể sử dụng để tạo lượt khám");
  }
}

async function hasConfirmedPayment(db: D1Database, tenantId: string, visitId: string): Promise<boolean> {
  const row = await db.prepare(`SELECT 1 FROM payments p
    JOIN treatment_plans tp ON tp.id = p.treatment_plan_id AND tp.tenant_id = p.tenant_id
    WHERE p.tenant_id = ? AND tp.visit_id = ? AND p.status = 'confirmed' LIMIT 1`)
    .bind(tenantId, visitId)
    .first();
  return Boolean(row);
}
