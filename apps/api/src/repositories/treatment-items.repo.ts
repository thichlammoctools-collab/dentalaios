import type { D1Database } from "@cloudflare/workers-types";
import type { TreatmentPlanItem } from "@shared/types";
import type { D1Row } from "./base";

export interface TreatmentItemsRepository {
  listByPlan(tenantId: string, planId: string): Promise<TreatmentPlanItem[]>;
  create(
    tenantId: string,
    planId: string,
    data: Omit<TreatmentPlanItem, "id" | "tenant_id" | "treatment_plan_id" | "status" | "created_at">,
  ): Promise<TreatmentPlanItem>;
  delete(tenantId: string, id: string): Promise<boolean>;
}

export function createTreatmentItemsRepository(db: D1Database): TreatmentItemsRepository {
  return {
    async listByPlan(tenantId, planId) {
      const result = await db
        .prepare(
          `SELECT * FROM treatment_plan_items
           WHERE tenant_id = ? AND treatment_plan_id = ?
           ORDER BY tooth_number ASC`,
        )
        .bind(tenantId, planId)
        .all();
      return (result.results as D1Row[]).map(mapItem);
    },

    async create(tenantId, planId, data) {
      const id = crypto.randomUUID();
      await db
        .prepare(
          `INSERT INTO treatment_plan_items
              (id, tenant_id, treatment_plan_id, tooth_number, service_code, procedure, description, unit_cost)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          id,
          tenantId,
          planId,
          data.tooth_number ?? null,
          data.service_code ?? null,
          data.procedure,
          data.description,
          data.unit_cost,
        )
        .run();
      const row = (await db
        .prepare("SELECT * FROM treatment_plan_items WHERE tenant_id = ? AND id = ? LIMIT 1")
        .bind(tenantId, id)
        .first()) as D1Row | null;
      if (!row) throw new Error("Insert succeeded but read failed");
      return mapItem(row);
    },

    async delete(tenantId, id) {
      const res = await db
        .prepare("DELETE FROM treatment_plan_items WHERE tenant_id = ? AND id = ?")
        .bind(tenantId, id)
        .run();
      return res.meta.changes > 0;
    },
  };
}

function mapItem(row: D1Row): TreatmentPlanItem {
  return {
    id: row.id as string,
    tenant_id: row.tenant_id as string,
    treatment_plan_id: row.treatment_plan_id as string,
    tooth_number: row.tooth_number as number | undefined,
    service_code: (row.service_code as string | null) ?? undefined,
    procedure: row.procedure as string,
    description: row.description as string,
    unit_cost: Number(row.unit_cost ?? 0),
    status: row.status as TreatmentPlanItem["status"],
    created_at: row.created_at as string,
  };
}
