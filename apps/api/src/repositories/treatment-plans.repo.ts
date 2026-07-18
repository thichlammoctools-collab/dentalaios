import type { D1Database } from "@cloudflare/workers-types";
import type { TreatmentPlan } from "@shared/types";
import type { D1Row } from "./base";

export interface TreatmentPlansRepository {
  getById(tenantId: string, id: string): Promise<TreatmentPlan | null>;
  list(tenantId: string, opts?: { patientId?: string; visitId?: string; status?: TreatmentPlan["status"] }): Promise<TreatmentPlan[]>;
  create(
    tenantId: string,
    data: Omit<TreatmentPlan, "id" | "tenant_id" | "created_at" | "total_cost" | "status" | "approved_at">,
  ): Promise<TreatmentPlan>;
  approve(tenantId: string, id: string): Promise<TreatmentPlan | null>;
  recomputeTotal(tenantId: string, id: string): Promise<number>;
  delete(tenantId: string, id: string): Promise<boolean>;
}

export function createTreatmentPlansRepository(db: D1Database): TreatmentPlansRepository {
  return {
    async getById(tenantId, id) {
      const row = (await db
        .prepare("SELECT * FROM treatment_plans WHERE tenant_id = ? AND id = ? LIMIT 1")
        .bind(tenantId, id)
        .first()) as D1Row | null;
      return row ? mapPlan(row) : null;
    },

    async list(tenantId, opts = {}) {
      const conditions = ["tenant_id = ?"];
      const binds: unknown[] = [tenantId];
      if (opts.patientId) {
        conditions.push("patient_id = ?");
        binds.push(opts.patientId);
      }
      if (opts.status) {
        conditions.push("status = ?");
        binds.push(opts.status);
      }
      if (opts.visitId) {
        conditions.push("visit_id = ?");
        binds.push(opts.visitId);
      }
      const result = await db
        .prepare(`SELECT * FROM treatment_plans WHERE ${conditions.join(" AND ")} ORDER BY created_at DESC`)
        .bind(...binds)
        .all();
      return (result.results as D1Row[]).map(mapPlan);
    },

    async create(tenantId, data) {
      const id = crypto.randomUUID();
      await db
        .prepare(
          `INSERT INTO treatment_plans
             (id, tenant_id, visit_id, patient_id, currency, notes)
           VALUES (?, ?, ?, ?, ?, ?)`,
        )
        .bind(id, tenantId, data.visit_id, data.patient_id, data.currency, data.notes ?? null)
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
    tenant_id: row.tenant_id as string,
    visit_id: row.visit_id as string,
    patient_id: row.patient_id as string,
    status: row.status as TreatmentPlan["status"],
    total_cost: Number(row.total_cost ?? 0),
    currency: row.currency as string,
    notes: (row.notes as string | null) ?? undefined,
    approved_at: (row.approved_at as string | null) ?? undefined,
    created_at: row.created_at as string,
  };
}
