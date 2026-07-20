import type { D1Database } from "@cloudflare/workers-types";
import type { TreatmentCase, TreatmentCaseStatus, TreatmentCaseStatusHistory, TreatmentCaseType } from "@shared/types";
import type { D1Row } from "./base";

export function createTreatmentCasesRepository(db: D1Database) {
  return {
    async getByPlanId(tenantId: string, treatmentPlanId: string): Promise<TreatmentCase | null> {
      const row = await db.prepare(caseSelect("WHERE tc.tenant_id = ? AND tc.treatment_plan_id = ? LIMIT 1"))
        .bind(tenantId, treatmentPlanId).first() as D1Row | null;
      return row ? mapCase(row) : null;
    },

    async getById(tenantId: string, id: string): Promise<TreatmentCase | null> {
      const row = await db.prepare(caseSelect("WHERE tc.tenant_id = ? AND tc.id = ? LIMIT 1"))
        .bind(tenantId, id).first() as D1Row | null;
      return row ? mapCase(row) : null;
    },

    async create(data: {
      tenantId: string;
      treatmentPlanId: string;
      patientId: string;
      caseNumber: string;
      caseType: TreatmentCaseType;
      branchId: string;
      clinicianId: string;
      title: string;
      clinicalSummary?: string;
      treatmentGoal?: string;
      targetCompletedAt?: string;
      createdBy: string;
    }): Promise<TreatmentCase> {
      const id = crypto.randomUUID();
      const now = new Date().toISOString();
      await db.batch([
        db.prepare(
          `INSERT INTO treatment_cases (
             id, tenant_id, treatment_plan_id, patient_id, case_number, case_type, status,
             primary_branch_id, primary_clinician_id, title, clinical_summary, treatment_goal,
             activated_at, target_completed_at, created_by, created_at, updated_at
           ) VALUES (?, ?, ?, ?, ?, ?, 'active', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ).bind(
          id, data.tenantId, data.treatmentPlanId, data.patientId, data.caseNumber, data.caseType,
          data.branchId, data.clinicianId, data.title, data.clinicalSummary ?? null,
          data.treatmentGoal ?? null, now, data.targetCompletedAt ?? null, data.createdBy, now, now,
        ),
        db.prepare(
          `INSERT INTO treatment_case_members
             (id, tenant_id, treatment_case_id, user_id, role, assigned_at, assigned_by)
           VALUES (?, ?, ?, ?, 'primary_clinician', ?, ?)`,
        ).bind(crypto.randomUUID(), data.tenantId, id, data.clinicianId, now, data.createdBy),
        db.prepare(
          `INSERT INTO treatment_case_status_history
             (id, tenant_id, treatment_case_id, from_status, to_status, changed_by, changed_at)
           VALUES (?, ?, ?, NULL, 'active', ?, ?)`,
        ).bind(crypto.randomUUID(), data.tenantId, id, data.createdBy, now),
      ]);
      const created = await this.getById(data.tenantId, id);
      if (!created) throw new Error("Treatment case insert succeeded but read failed");
      return created;
    },

    async transition(
      tenantId: string,
      id: string,
      fromStatus: TreatmentCaseStatus,
      toStatus: TreatmentCaseStatus,
      changedBy: string,
      reason?: string,
    ): Promise<boolean> {
      const now = new Date().toISOString();
      const fields = ["status = ?", "updated_at = ?"];
      const binds: unknown[] = [toStatus, now];
      if (toStatus === "paused") {
        fields.push("paused_at = ?", "paused_reason = ?");
        binds.push(now, reason ?? null);
      } else if (toStatus === "active") {
        fields.push("paused_at = NULL", "paused_reason = NULL");
      } else if (toStatus === "completed") {
        fields.push("completed_at = ?");
        binds.push(now);
      } else if (toStatus === "cancelled") {
        fields.push("cancelled_at = ?", "cancelled_reason = ?");
        binds.push(now, reason ?? null);
      }
      binds.push(tenantId, id, fromStatus);
      const update = db.prepare(
        `UPDATE treatment_cases SET ${fields.join(", ")}
         WHERE tenant_id = ? AND id = ? AND status = ?`,
      ).bind(...binds);
      const history = db.prepare(
        `INSERT INTO treatment_case_status_history
           (id, tenant_id, treatment_case_id, from_status, to_status, reason, changed_by, changed_at)
         SELECT ?, ?, ?, ?, ?, ?, ?, ?
         WHERE changes() > 0`,
      ).bind(crypto.randomUUID(), tenantId, id, fromStatus, toStatus, reason ?? null, changedBy, now);
      const result = await db.batch([update, history]);
      return result[0].meta.changes > 0;
    },

    async listStatusHistory(tenantId: string, caseId: string): Promise<TreatmentCaseStatusHistory[]> {
      const result = await db.prepare(
        `SELECT * FROM treatment_case_status_history
         WHERE tenant_id = ? AND treatment_case_id = ? ORDER BY changed_at DESC`,
      ).bind(tenantId, caseId).all();
      return (result.results as D1Row[]).map(mapStatusHistory);
    },
  };
}

function caseSelect(where: string): string {
  return `SELECT tc.*, b.name AS primary_branch_name, u.name AS primary_clinician_name
          FROM treatment_cases tc
          LEFT JOIN branches b ON b.id = tc.primary_branch_id AND b.tenant_id = tc.tenant_id
          LEFT JOIN users u ON u.id = tc.primary_clinician_id AND u.tenant_id = tc.tenant_id
          ${where}`;
}

function mapCase(row: D1Row): TreatmentCase {
  return {
    id: row.id as string,
    tenant_id: row.tenant_id as string,
    treatment_plan_id: row.treatment_plan_id as string,
    patient_id: row.patient_id as string,
    case_number: row.case_number as string,
    case_type: row.case_type as TreatmentCaseType,
    status: row.status as TreatmentCaseStatus,
    primary_branch_id: row.primary_branch_id as string,
    primary_branch_name: (row.primary_branch_name as string | null) ?? undefined,
    primary_clinician_id: row.primary_clinician_id as string,
    primary_clinician_name: (row.primary_clinician_name as string | null) ?? undefined,
    title: row.title as string,
    clinical_summary: (row.clinical_summary as string | null) ?? undefined,
    treatment_goal: (row.treatment_goal as string | null) ?? undefined,
    activated_at: row.activated_at as string,
    target_completed_at: (row.target_completed_at as string | null) ?? undefined,
    completed_at: (row.completed_at as string | null) ?? undefined,
    paused_at: (row.paused_at as string | null) ?? undefined,
    paused_reason: (row.paused_reason as string | null) ?? undefined,
    cancelled_at: (row.cancelled_at as string | null) ?? undefined,
    cancelled_reason: (row.cancelled_reason as string | null) ?? undefined,
    created_by: row.created_by as string,
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
  };
}

function mapStatusHistory(row: D1Row): TreatmentCaseStatusHistory {
  return {
    id: row.id as string,
    tenant_id: row.tenant_id as string,
    treatment_case_id: row.treatment_case_id as string,
    from_status: (row.from_status as TreatmentCaseStatus | null) ?? undefined,
    to_status: row.to_status as TreatmentCaseStatus,
    reason: (row.reason as string | null) ?? undefined,
    changed_by: row.changed_by as string,
    changed_at: row.changed_at as string,
  };
}
