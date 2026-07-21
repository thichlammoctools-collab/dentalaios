import type { D1Database } from "@cloudflare/workers-types";
import type { PatientOpenTreatmentMilestone, TreatmentCase, TreatmentCaseFinancialSummary, TreatmentCaseMilestone, TreatmentCaseMilestoneStatus, TreatmentCaseStatus, TreatmentCaseStatusHistory, TreatmentMilestoneAppointment } from "@shared/types";
import type { MilestoneAppointmentCreateInput, MilestoneAppointmentExecutionInput, MilestoneAppointmentLinkInput, TreatmentCaseActivateInput, TreatmentCaseMilestoneUpdateInput } from "@shared/validation";
import { createTreatmentPlansRepository } from "../repositories/treatment-plans.repo";
import { createTreatmentItemsRepository } from "../repositories/treatment-items.repo";
import { createTreatmentCasesRepository } from "../repositories/treatment-cases.repo";
import { createTreatmentMilestoneAppointmentsRepository } from "../repositories/treatment-milestone-appointments.repo";
import { createPaymentsRepository } from "../repositories/payments.repo";
import { appointmentsService } from "./appointments.service";
import { assertAllInTenant } from "../lib/tenant-scope";
import { ConflictError, NotFoundError, ValidationError } from "../lib/errors";
import { isUniqueConstraintError } from "../lib/db-errors";

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
    const planItems = await createTreatmentItemsRepository(db).listByPlan(tenantId, planId);
    if (planItems.length === 0) {
      throw new ValidationError("Kế hoạch phải có ít nhất một hạng mục để kích hoạt ca điều trị");
    }
    const caseNumber = await allocateCaseNumber(db, tenantId);
    const caseType = data.case_type;
    try {
      return await cases.create({
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
        milestones: planItems.map((item, index) => ({ treatmentPlanItemId: item.id, sortOrder: index + 1 })),
      });
    } catch (err) {
      if (isUniqueConstraintError(err)) {
        throw new ConflictError("Kế hoạch này đã có ca điều trị");
      }
      throw err;
    }
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
    if (target === "completed") {
      const milestones = await cases.listMilestones(tenantId, treatmentCase.id);
      if (milestones.some((milestone) => !["completed", "skipped"].includes(milestone.status))) {
        throw new ValidationError("Hoàn tất hoặc bỏ qua có lý do tất cả milestone trước khi hoàn tất ca");
      }
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

  async listMilestones(db: D1Database, tenantId: string, planId: string): Promise<TreatmentCaseMilestone[]> {
    const treatmentCase = await createTreatmentCasesRepository(db).getByPlanId(tenantId, planId);
    if (!treatmentCase) throw new NotFoundError("Ca điều trị không tồn tại");
    return createTreatmentCasesRepository(db).listMilestones(tenantId, treatmentCase.id);
  },

  listOpenMilestonesByPatient(
    db: D1Database,
    tenantId: string,
    patientId: string,
  ): Promise<PatientOpenTreatmentMilestone[]> {
    return createTreatmentCasesRepository(db).listOpenMilestonesByPatient(tenantId, patientId);
  },

  async updateMilestone(
    db: D1Database,
    tenantId: string,
    planId: string,
    milestoneId: string,
    actorUserId: string,
    data: TreatmentCaseMilestoneUpdateInput,
  ): Promise<TreatmentCaseMilestone> {
    const cases = createTreatmentCasesRepository(db);
    const treatmentCase = await cases.getByPlanId(tenantId, planId);
    if (!treatmentCase) throw new NotFoundError("Ca điều trị không tồn tại");
    if (treatmentCase.status !== "active") {
      throw new ConflictError("Chỉ có thể cập nhật milestone khi ca đang điều trị");
    }
    const milestone = await cases.getMilestone(tenantId, treatmentCase.id, milestoneId);
    if (!milestone) throw new NotFoundError("Milestone không tồn tại");
    if (milestone.status === data.status) return milestone;
    const allowed: Record<TreatmentCaseMilestoneStatus, TreatmentCaseMilestoneStatus[]> = {
      not_started: ["in_progress", "completed", "skipped"],
      in_progress: ["not_started", "completed", "skipped"],
      completed: [],
      skipped: [],
    };
    if (!allowed[milestone.status].includes(data.status)) {
      throw new ConflictError("Không thể chuyển milestone sang trạng thái đã chọn");
    }
    const changed = await cases.transitionMilestone(
      tenantId, treatmentCase.id, milestoneId, milestone.status, data.status, actorUserId, data.reason,
    );
    if (!changed) throw new ConflictError("Milestone đã thay đổi, vui lòng tải lại");
    const updated = await cases.getMilestone(tenantId, treatmentCase.id, milestoneId);
    if (!updated) throw new NotFoundError("Milestone không tồn tại");
    return updated;
  },

  async listMilestoneAppointments(
    db: D1Database, tenantId: string, planId: string, milestoneId: string,
  ): Promise<TreatmentMilestoneAppointment[]> {
    const treatmentCase = await requireCase(db, tenantId, planId);
    const milestone = await createTreatmentCasesRepository(db).getMilestone(tenantId, treatmentCase.id, milestoneId);
    if (!milestone) throw new NotFoundError("Milestone không tồn tại");
    return createTreatmentMilestoneAppointmentsRepository(db).listByMilestone(tenantId, milestoneId);
  },

  async linkMilestoneAppointment(
    db: D1Database,
    tenantId: string,
    planId: string,
    milestoneId: string,
    actorUserId: string,
    data: MilestoneAppointmentLinkInput,
  ): Promise<TreatmentMilestoneAppointment[]> {
    const { treatmentCase, milestone } = await requireOpenMilestone(db, tenantId, planId, milestoneId);
    const appointment = await appointmentsService.get(db, tenantId, data.appointment_id);
    assertCompatibleAppointment(treatmentCase, milestone, appointment);
    try {
      await createTreatmentMilestoneAppointmentsRepository(db).link({
        tenantId,
        milestoneId,
        appointmentId: appointment.id,
        linkType: data.link_type,
        linkedBy: actorUserId,
      });
    } catch (err) {
      if (isUniqueConstraintError(err)) throw new ConflictError("Lịch hẹn này đã được liên kết với milestone");
      throw err;
    }
    return createTreatmentMilestoneAppointmentsRepository(db).listByMilestone(tenantId, milestoneId);
  },

  async createMilestoneAppointment(
    db: D1Database,
    tenantId: string,
    planId: string,
    milestoneId: string,
    actor: { userId: string; branchId: string },
    data: MilestoneAppointmentCreateInput,
    encryptionKey?: string,
  ): Promise<TreatmentMilestoneAppointment[]> {
    const { treatmentCase } = await requireOpenMilestone(db, tenantId, planId, milestoneId);
    if (treatmentCase.primary_branch_id !== actor.branchId) {
      throw new ConflictError("Chỉ có thể tạo lịch từ chi nhánh phụ trách ca điều trị");
    }
    const milestoneIds = [...new Set([milestoneId, ...(data.milestone_ids ?? [])])];
    const milestones = await Promise.all(milestoneIds.map(async (id) => {
      const value = await createTreatmentCasesRepository(db).getMilestone(tenantId, treatmentCase.id, id);
      if (!value) throw new NotFoundError("Milestone không tồn tại trong ca điều trị");
      if (["completed", "skipped"].includes(value.status)) {
        throw new ConflictError("Không thể thêm milestone đã kết thúc vào lịch hẹn");
      }
      return value;
    }));
    const procedures = [...new Set(milestones.map((value) => value.item.service_name ?? value.item.procedure))];
    const appointment = await appointmentsService.create(db, tenantId, actor.userId, treatmentCase.primary_branch_id, {
      patient_id: treatmentCase.patient_id,
      clinician_id: data.clinician_id,
      assistant_id: data.assistant_id,
      chair_id: data.chair_id,
      scheduled_at: data.scheduled_at,
      duration_min: data.duration_min,
      procedure: procedures.join("; "),
      notes: data.notes,
      source: "manual",
    }, encryptionKey);
    await createTreatmentMilestoneAppointmentsRepository(db).linkMany({
      tenantId,
      milestoneIds,
      appointmentId: appointment.id,
      linkType: data.link_type,
      linkedBy: actor.userId,
    });
    return createTreatmentMilestoneAppointmentsRepository(db).listByMilestone(tenantId, milestoneId);
  },

  async updateMilestoneAppointmentExecution(
    db: D1Database,
    tenantId: string,
    planId: string,
    milestoneId: string,
    appointmentId: string,
    data: MilestoneAppointmentExecutionInput,
  ): Promise<TreatmentMilestoneAppointment> {
    const { milestone } = await requireOpenMilestone(db, tenantId, planId, milestoneId);
    const links = createTreatmentMilestoneAppointmentsRepository(db);
    const link = await links.getLink(tenantId, milestone.id, appointmentId);
    if (!link) throw new NotFoundError("Liên kết lịch hẹn không tồn tại");
    if (link.appointment.status !== "completed") {
      throw new ConflictError("Chỉ ghi nhận kết quả sau khi lịch hẹn đã hoàn thành");
    }
    await links.updateExecution(tenantId, milestone.id, appointmentId, data.execution_status, data.notes);
    const updated = await links.getLink(tenantId, milestone.id, appointmentId);
    if (!updated) throw new NotFoundError("Liên kết lịch hẹn không tồn tại");
    return updated;
  },

  async unlinkMilestoneAppointment(
    db: D1Database, tenantId: string, planId: string, milestoneId: string, appointmentId: string,
  ): Promise<boolean> {
    await requireOpenMilestone(db, tenantId, planId, milestoneId);
    return createTreatmentMilestoneAppointmentsRepository(db).unlink(tenantId, milestoneId, appointmentId);
  },

  async financialSummary(db: D1Database, tenantId: string, planId: string): Promise<TreatmentCaseFinancialSummary> {
    const plan = await createTreatmentPlansRepository(db).getById(tenantId, planId);
    if (!plan) throw new NotFoundError("Kế hoạch điều trị không tồn tại");
    const payments = await createPaymentsRepository(db).list(tenantId, { treatmentPlanId: planId });
    const totalByStatus = (status: "confirmed" | "pending" | "failed") => payments
      .filter((payment) => payment.status === status)
      .reduce((sum, payment) => sum + payment.amount, 0);
    const confirmedPaid = totalByStatus("confirmed");
    return {
      plan_total: plan.total_cost,
      confirmed_paid: confirmedPaid,
      pending_amount: totalByStatus("pending"),
      failed_amount: totalByStatus("failed"),
      outstanding_amount: Math.max(plan.total_cost - confirmedPaid, 0),
      payments,
    };
  },
};

async function requireCase(db: D1Database, tenantId: string, planId: string): Promise<TreatmentCase> {
  const treatmentCase = await createTreatmentCasesRepository(db).getByPlanId(tenantId, planId);
  if (!treatmentCase) throw new NotFoundError("Ca điều trị không tồn tại");
  return treatmentCase;
}

async function requireOpenMilestone(db: D1Database, tenantId: string, planId: string, milestoneId: string) {
  const treatmentCase = await requireCase(db, tenantId, planId);
  if (treatmentCase.status !== "active") throw new ConflictError("Ca điều trị không ở trạng thái đang thực hiện");
  const milestone = await createTreatmentCasesRepository(db).getMilestone(tenantId, treatmentCase.id, milestoneId);
  if (!milestone) throw new NotFoundError("Milestone không tồn tại");
  if (["completed", "skipped"].includes(milestone.status)) {
    throw new ConflictError("Không thể cập nhật lịch cho milestone đã kết thúc");
  }
  return { treatmentCase, milestone };
}

function assertCompatibleAppointment(treatmentCase: TreatmentCase, milestone: TreatmentCaseMilestone, appointment: { patient_id: string; branch_id: string; status: string }): void {
  if (appointment.patient_id !== treatmentCase.patient_id) throw new ValidationError("Lịch hẹn không thuộc bệnh nhân của ca điều trị");
  if (appointment.branch_id !== treatmentCase.primary_branch_id) throw new ValidationError("Lịch hẹn không thuộc chi nhánh phụ trách ca điều trị");
  if (["cancelled", "no_show"].includes(appointment.status)) throw new ValidationError("Không thể liên kết lịch hẹn đã hủy hoặc bệnh nhân không đến");
  if (["completed", "skipped"].includes(milestone.status)) throw new ConflictError("Milestone đã kết thúc");
}

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
