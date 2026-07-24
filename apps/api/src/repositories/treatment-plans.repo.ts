import type { D1Database } from "@cloudflare/workers-types";
import type { TreatmentPlan } from "@shared/types";
import type { D1Row } from "./base";

export interface TreatmentPlansRepository {
  getById(tenantId: string, id: string): Promise<TreatmentPlan | null>;
  list(tenantId: string, opts?: { patientId?: string; visitId?: string; status?: TreatmentPlan["status"] }): Promise<TreatmentPlan[]>;
  create(
    tenantId: string,
    data: Omit<TreatmentPlan, "id" | "tenant_id" | "created_at" | "total_cost" | "estimated_duration_min" | "status" | "approved_at">,
  ): Promise<TreatmentPlan>;
  approve(tenantId: string, id: string): Promise<TreatmentPlan | null>;
  recomputeTotal(tenantId: string, id: string): Promise<number>;
  delete(tenantId: string, id: string): Promise<boolean>;
}

export function createTreatmentPlansRepository(db: D1Database): TreatmentPlansRepository {
  return {
    async getById(tenantId, id) {
      const row = (await db
        .prepare(`SELECT treatment_plans.*, COALESCE((SELECT SUM(estimated_duration_min) FROM treatment_plan_items WHERE tenant_id = treatment_plans.tenant_id AND treatment_plan_id = treatment_plans.id), 0) AS estimated_duration_min, CASE
          WHEN status <> 'completed'
            AND NOT EXISTS(SELECT 1 FROM treatment_plan_items WHERE tenant_id = treatment_plans.tenant_id AND treatment_plan_id = treatment_plans.id AND status = 'completed')
            AND NOT EXISTS(SELECT 1 FROM treatment_cases WHERE tenant_id = treatment_plans.tenant_id AND treatment_plan_id = treatment_plans.id)
            AND NOT EXISTS(SELECT 1 FROM payments WHERE tenant_id = treatment_plans.tenant_id AND treatment_plan_id = treatment_plans.id)
          THEN 1 ELSE 0 END AS can_delete
          FROM treatment_plans WHERE tenant_id = ? AND id = ? LIMIT 1`)
        .bind(tenantId, id)
        .first()) as D1Row | null;
      return row ? mapPlan(row) : null;
    },

    async list(tenantId, opts = {}) {
      const conditions = ["tp.tenant_id = ?"];
      const binds: unknown[] = [tenantId];
      if (opts.patientId) {
        conditions.push("tp.patient_id = ?");
        binds.push(opts.patientId);
      }
      if (opts.status) {
        conditions.push("tp.status = ?");
        binds.push(opts.status);
      }
      if (opts.visitId) {
        conditions.push("tp.visit_id = ?");
        binds.push(opts.visitId);
      }
      const result = await db
        .prepare(`SELECT tp.*, CASE
          WHEN tp.status <> 'completed'
            AND NOT EXISTS(SELECT 1 FROM treatment_plan_items WHERE tenant_id = tp.tenant_id AND treatment_plan_id = tp.id AND status = 'completed')
            AND NOT EXISTS(SELECT 1 FROM treatment_cases WHERE tenant_id = tp.tenant_id AND treatment_plan_id = tp.id)
            AND NOT EXISTS(SELECT 1 FROM payments WHERE tenant_id = tp.tenant_id AND treatment_plan_id = tp.id)
          THEN 1 ELSE 0 END AS can_delete,
          COUNT(i.id) AS service_total_count,
          COALESCE(SUM(CASE WHEN m.status = 'completed' THEN 1 ELSE 0 END), 0) AS service_completed_count,
          COALESCE(SUM(CASE WHEN m.status IN ('not_started', 'in_progress') OR m.id IS NULL THEN 1 ELSE 0 END), 0) AS service_remaining_count,
          COALESCE(SUM(CASE WHEN m.status = 'skipped' THEN 1 ELSE 0 END), 0) AS service_skipped_count,
          COALESCE(SUM(CASE WHEN m.status = 'completed' THEN i.unit_cost ELSE 0 END), 0) AS completed_revenue,
          COALESCE(SUM(CASE WHEN m.status IN ('not_started', 'in_progress') OR m.id IS NULL THEN i.unit_cost ELSE 0 END), 0) AS remaining_revenue
          FROM treatment_plans tp
          LEFT JOIN treatment_plan_items i ON i.tenant_id = tp.tenant_id AND i.treatment_plan_id = tp.id
          LEFT JOIN treatment_cases tc ON tc.tenant_id = tp.tenant_id AND tc.treatment_plan_id = tp.id
          LEFT JOIN treatment_case_milestones m ON m.tenant_id = tc.tenant_id AND m.treatment_case_id = tc.id AND m.treatment_plan_item_id = i.id
          WHERE ${conditions.join(" AND ")}
          GROUP BY tp.id
          ORDER BY tp.created_at DESC`)
        .bind(...binds)
        .all();
      return (result.results as D1Row[]).map(mapPlan);
    },

    async create(tenantId, data) {
      const id = crypto.randomUUID();
      const code = await allocateTreatmentPlanCode(db, tenantId);
      await db
        .prepare(
          `INSERT INTO treatment_plans
              (id, code, tenant_id, visit_id, patient_id, currency, notes)
            VALUES (?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(id, code, tenantId, data.visit_id, data.patient_id, data.currency, data.notes ?? null)
        .run();
      const created = await this.getById(tenantId, id);
      if (!created) throw new Error("Insert succeeded but read failed");
      return created;
    },

    async approve(tenantId, id) {
      const now = new Date().toISOString();
      await db
        .prepare(
          `UPDATE treatment_plans
           SET status = 'approved', approved_at = ?
           WHERE tenant_id = ? AND id = ? AND status = 'draft'`,
        )
        .bind(now, tenantId, id)
        .run();
      return this.getById(tenantId, id);
    },

    async recomputeTotal(tenantId, id) {
      // Keep SUM and UPDATE in one SQL statement. The former read-then-write
      // implementation allowed a slower concurrent mutation to overwrite a
      // newer total with a stale value.
      await db
        .prepare(
          `UPDATE treatment_plans
           SET total_cost = (
             SELECT COALESCE(SUM(unit_cost), 0)
             FROM treatment_plan_items
             WHERE tenant_id = ? AND treatment_plan_id = ?
           )
           WHERE tenant_id = ? AND id = ?`,
        )
        .bind(tenantId, id, tenantId, id)
        .run();
      const row = await db
        .prepare("SELECT total_cost FROM treatment_plans WHERE tenant_id = ? AND id = ?")
        .bind(tenantId, id)
        .first<{ total_cost: number }>();
      return Number(row?.total_cost ?? 0);
    },

    async delete(tenantId, id) {
      const res = await db
        .prepare("DELETE FROM treatment_plans WHERE tenant_id = ? AND id = ?")
        .bind(tenantId, id)
        .run();
      return res.meta.changes > 0;
    },
  };
}

function mapPlan(row: D1Row): TreatmentPlan {
  return {
    id: row.id as string,
    code: (row.code as string | null) ?? undefined,
    tenant_id: row.tenant_id as string,
    visit_id: row.visit_id as string,
    patient_id: row.patient_id as string,
    status: row.status as TreatmentPlan["status"],
    total_cost: Number(row.total_cost ?? 0),
    estimated_duration_min: Number(row.estimated_duration_min ?? 0),
    currency: row.currency as string,
    notes: (row.notes as string | null) ?? undefined,
    approved_at: (row.approved_at as string | null) ?? undefined,
    created_at: row.created_at as string,
    can_delete: Number(row.can_delete ?? 0) === 1,
    service_summary: row.service_total_count === undefined
      ? undefined
      : {
        total_count: Number(row.service_total_count ?? 0),
        completed_count: Number(row.service_completed_count ?? 0),
        remaining_count: Number(row.service_remaining_count ?? 0),
        skipped_count: Number(row.service_skipped_count ?? 0),
        completed_revenue: Number(row.completed_revenue ?? 0),
        remaining_revenue: Number(row.remaining_revenue ?? 0),
      },
  };
}

export async function allocateTreatmentPlanCode(db: D1Database, tenantId: string): Promise<string> {
  const dateKey = new Date().toISOString().slice(0, 10).replaceAll("-", "");
  const row = await db.prepare(`INSERT INTO clinical_document_code_counters (tenant_id, document_type, date_key, last_seq)
    VALUES (?, 'treatment_plan', ?, 1)
    ON CONFLICT(tenant_id, document_type, date_key) DO UPDATE SET last_seq = last_seq + 1
    RETURNING last_seq`)
    .bind(tenantId, dateKey)
    .first<{ last_seq: number }>();
  return `KHD-${dateKey}-${String(row?.last_seq ?? 1).padStart(4, "0")}`;
}
