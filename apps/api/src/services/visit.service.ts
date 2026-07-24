import type { D1Database } from "@cloudflare/workers-types";
import type { Visit, ClinicalFinding } from "@shared/types";
import type { VisitCreateInput, VisitUpdateInput, FindingCreateInput, FindingUpdateInput, FindingsBatchCreateInput } from "@shared/validation";
import { createVisitsRepository } from "../repositories/visits.repo";
import { allocateFindingCode, createFindingsRepository } from "../repositories/findings.repo";
import { createDiagnosesRepository } from "../repositories/diagnoses.repo";
import { createClinicalTerminologyRepository } from "../repositories/clinical-terminology.repo";
import { createAppointmentsRepository } from "../repositories/appointments.repo";
import { createChairsRepository } from "../repositories/chairs.repo";
import { ConflictError, NotFoundError, ValidationError } from "../lib/errors";
import { assertAllInTenant } from "../lib/tenant-scope";
import { assertTreatmentPersonnel } from "../lib/personnel";
import { isForeignKeyError } from "../lib/db-errors";

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
    let treatingClinicianId = data.treating_clinician_id ?? undefined;
    let assistantId = data.assistant_id ?? undefined;
    if (data.source_appointment_id) {
      const existing = await visits.getBySourceAppointmentId(tenantId, data.source_appointment_id);
      if (existing) return existing;

      const appointment = await createAppointmentsRepository(db).getById(tenantId, data.source_appointment_id);
      if (!appointment || appointment.patient_id !== data.patient_id || appointment.branch_id !== data.branch_id) {
        throw new ValidationError("Lịch hẹn không hợp lệ cho lượt khám này");
      }
      const startsAt = new Date(appointment.scheduled_at);
      const endsAt = new Date(startsAt.getTime() + appointment.duration_min * 60_000);
      const now = new Date();
      if (appointment.status !== "arrived" || !appointment.chair_id || now < startsAt || now >= endsAt) {
        throw new ValidationError("Chỉ có thể bắt đầu khám khi bệnh nhân đã đến và đang trong khung giờ hẹn");
      }
      chairId = appointment.chair_id;
      treatingClinicianId = appointment.clinician_id;
      assistantId = appointment.assistant_id;
    }
    if (!treatingClinicianId) throw new ValidationError("Vui lòng chọn bác sĩ điều trị");
    if (!assistantId) throw new ValidationError("Vui lòng chọn phụ tá");
    await assertTreatmentPersonnel(db, tenantId, { treatingClinicianId, assistantId });
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
      visit_type: data.visit_type,
      clinical_state: "in_progress",
      blood_pressure_systolic: data.blood_pressure_systolic,
      blood_pressure_diastolic: data.blood_pressure_diastolic,
      blood_sugar_mgdl: data.blood_sugar_mgdl,
      vitals_recorded_at: data.blood_pressure_systolic || data.blood_pressure_diastolic || data.blood_sugar_mgdl
        ? new Date().toISOString()
        : undefined,
    });
    if (data.source_appointment_id) {
      await createAppointmentsRepository(db).update(tenantId, data.source_appointment_id, { status: "in_progress" });
    }
    return created;
  },

  async update(db: D1Database, tenantId: string, id: string, data: VisitUpdateInput, actorUserId: string): Promise<Visit> {
    // Ownership check for optional user references on update.
    await assertAllInTenant(db, tenantId, [
      { table: "users", id: data.treating_clinician_id ?? undefined },
      { table: "users", id: data.assistant_id ?? undefined },
    ]);
    const visits = createVisitsRepository(db);
    const current = await visits.getById(tenantId, id);
    if (!current) throw new NotFoundError("Visit not found");
    if (current.locked_at) throw new ConflictError("Hồ sơ lượt khám đã được ký và khóa; hãy tạo amendment");
    if (data.status) {
      if (current.status !== "in_progress" || !["completed", "cancelled"].includes(data.status)) {
        throw new ConflictError("Chỉ có thể hoàn tất hoặc hủy lượt khám đang thực hiện");
      }
    }
    if (data.chair_id !== undefined) {
      if (await hasConfirmedPayment(db, tenantId, id)) {
        throw new ConflictError("Không thể đổi ghế vì lượt khám đã có doanh thu xác nhận");
      }
      await assertVisitChair(db, tenantId, current.branch_id, data.chair_id, false);
    }
    await assertTreatmentPersonnel(db, tenantId, {
      treatingClinicianId: data.treating_clinician_id ?? undefined,
      assistantId: data.assistant_id ?? undefined,
    });
    const updated = await visits.update(tenantId, id, {
      ...data,
      treating_clinician_id: data.treating_clinician_id ?? undefined,
      assistant_id: data.assistant_id ?? undefined,
      completed_at: data.status === "completed" ? new Date().toISOString() : undefined,
      completed_by: data.status === "completed" ? actorUserId : undefined,
    });
    if (!updated) throw new NotFoundError("Visit not found");
    if (data.status === "completed" && updated.source_appointment_id) {
      await createAppointmentsRepository(db).update(tenantId, updated.source_appointment_id, { status: "completed" });
    }
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
    actor: { userId: string; entrySource?: "assistant" | "doctor" | "ai" } = { userId: "", entrySource: "doctor" },
  ): Promise<ClinicalFinding> {
    const visit = await createVisitsRepository(db).getById(tenantId, visitId);
    if (!visit) throw new NotFoundError("Visit not found");
    if (visit.locked_at) throw new ConflictError("Hồ sơ lượt khám đã được ký và khóa; hãy tạo amendment");
    const concept = data.concept_id ? await createClinicalTerminologyRepository(db).getConcept(data.concept_id) : null;
    if (data.concept_id && (!concept || !concept.is_active)) throw new ValidationError("Khái niệm lâm sàng không còn hoạt động");
    if (concept && (concept.category !== data.category || concept.default_scope !== data.scope)) throw new ValidationError("Khái niệm không phù hợp với nhóm hoặc phạm vi finding");
    if (concept?.kind === "diagnosis") throw new ValidationError("Chẩn đoán cần được xác nhận qua hồ sơ diagnosis riêng");
    const source = actor.entrySource ?? "doctor";
    const effectiveAt = source === "doctor" ? new Date().toISOString() : undefined;
    return createFindingsRepository(db).create(tenantId, visitId, {
      tooth_number: data.tooth_number ?? undefined,
      tooth_system: data.scope === "tooth" ? "FDI" : undefined,
      category: data.category,
      concept_id: concept?.id,
      scope: data.scope,
      anatomical_site: data.category === "periodontal" && data.scope === "tooth" ? "gum" : data.anatomical_site,
      location_details: data.location_details,
      measurements: data.measurements,
      condition: concept?.legacy_condition ?? data.condition,
      notes: data.notes,
      entered_by: actor.userId || undefined,
      entry_source: source,
      clinical_effective_at: effectiveAt,
    });
  },

  async addFindings(
    db: D1Database,
    tenantId: string,
    visitId: string,
    data: FindingsBatchCreateInput,
    actor: { userId: string; entrySource?: "assistant" | "doctor" | "ai" } = { userId: "", entrySource: "doctor" },
  ): Promise<ClinicalFinding[]> {
    // Validate all foreign references/concepts before the first write.
    const visit = await createVisitsRepository(db).getById(tenantId, visitId);
    if (!visit) throw new NotFoundError("Visit not found");
    if (visit.locked_at) throw new ConflictError("Hồ sơ lượt khám đã được ký và khóa; hãy tạo amendment");
    const terminology = createClinicalTerminologyRepository(db);
    const resolved: Array<{
      finding: FindingCreateInput;
      concept: Awaited<ReturnType<typeof terminology.getConcept>>;
    }> = [];
    for (const [itemIndex, finding] of data.findings.entries()) {
      const concept = finding.concept_id ? await terminology.getConcept(finding.concept_id) : null;
      if (finding.concept_id && (!concept || !concept.is_active)) {
        throw new ValidationError("Khái niệm lâm sàng không còn hoạt động", { item_index: itemIndex });
      }
      if (concept && (concept.category !== finding.category || concept.default_scope !== finding.scope)) {
        throw new ValidationError("Khái niệm không phù hợp với nhóm hoặc phạm vi finding", { item_index: itemIndex });
      }
      if (concept?.kind === "diagnosis") {
        throw new ValidationError("Chẩn đoán cần được xác nhận qua hồ sơ diagnosis riêng", { item_index: itemIndex });
      }
      resolved.push({ finding, concept });
    }

    const rows = [] as Array<{ id: string; code: string; finding: FindingCreateInput; concept: Awaited<ReturnType<typeof terminology.getConcept>> }>;
    for (const { finding, concept } of resolved) {
      rows.push({ id: crypto.randomUUID(), code: await allocateFindingCode(db, tenantId), finding, concept });
    }
    const source = actor.entrySource ?? "doctor";
    const effectiveAt = source === "doctor" ? new Date().toISOString() : null;
    const enteredBy = actor.userId || null;
    await db.batch(rows.map(({ id, code, finding, concept }) => db
      .prepare(`INSERT INTO clinical_findings
        (id, code, tenant_id, visit_id, category, scope, tooth_number, tooth_system, anatomical_site, location_details_json, measurements_json, condition, concept_id, notes, entered_by, entry_source, clinical_effective_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(
        id, code, tenantId, visitId, finding.category, finding.scope, finding.tooth_number ?? null,
        finding.scope === "tooth" ? "FDI" : null,
        finding.category === "periodontal" && finding.scope === "tooth" ? "gum" : finding.anatomical_site ?? null,
        finding.location_details ? JSON.stringify(finding.location_details) : null,
        finding.measurements ? JSON.stringify(finding.measurements) : null,
        concept?.legacy_condition ?? finding.condition, concept?.id ?? null, finding.notes ?? null,
        enteredBy, source, effectiveAt,
      ),
    ));
    return createFindingsRepository(db).listByVisit(tenantId, visitId);
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
    if (visit.locked_at) throw new ConflictError("Hồ sơ lượt khám đã được ký và khóa; hãy tạo amendment");
    const findings = createFindingsRepository(db);
    if (!await findings.getByVisitAndId(tenantId, visitId, findingId)) {
      throw new NotFoundError("Finding not found");
    }
    const concept = data.concept_id ? await createClinicalTerminologyRepository(db).getConcept(data.concept_id) : null;
    if (data.concept_id && (!concept || !concept.is_active)) throw new ValidationError("Khái niệm lâm sàng không còn hoạt động");
    return findings.update(tenantId, findingId, {
      condition: concept?.legacy_condition ?? data.condition,
      concept_id: data.concept_id ?? undefined,
      notes: data.notes ?? null,
      anatomical_site: data.anatomical_site,
      location_details: data.location_details,
      measurements: data.measurements,
    });
  },

  async deleteFinding(
    db: D1Database,
    tenantId: string,
    visitId: string,
    findingId: string,
  ): Promise<void> {
    const visits = createVisitsRepository(db);
    const visit = await visits.getById(tenantId, visitId);
    if (!visit) throw new NotFoundError("Visit not found");
    if (visit.locked_at) throw new ConflictError("Hồ sơ lượt khám đã được ký và khóa; hãy tạo amendment");

    const findings = createFindingsRepository(db);
    const finding = (await findings.listByVisit(tenantId, visitId)).find((item) => item.id === findingId);
    if (!finding) throw new NotFoundError("Finding not found");
    const diagnoses = createDiagnosesRepository(db);
    if (await diagnoses.existsForSourceFinding(tenantId, findingId)) {
      throw new ConflictError("Không thể xóa ghi nhận vì đã được dùng làm nguồn cho chẩn đoán. Hãy cập nhật hoặc xử lý chẩn đoán trước.");
    }
    try {
      await findings.delete(tenantId, findingId);
    } catch (err) {
      // A diagnosis could be created after the dependency check above.
      if (isForeignKeyError(err)) {
        throw new ConflictError("Không thể xóa ghi nhận vì đã được dùng làm nguồn cho chẩn đoán. Hãy cập nhật hoặc xử lý chẩn đoán trước.");
      }
      throw err;
    }
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
