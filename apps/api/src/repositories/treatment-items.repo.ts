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
            `SELECT treatment_plan_items.*,
                    price_snapshot.service_code AS snapshot_service_code,
                    price_snapshot.service_name AS snapshot_service_name,
                    price_snapshot.price_includes_vat AS snapshot_price_includes_vat,
                    price_snapshot.price_snapshot_at AS snapshot_price_snapshot_at
             FROM treatment_plan_items
            LEFT JOIN treatment_plan_item_price_snapshots AS price_snapshot
              ON price_snapshot.tenant_id = treatment_plan_items.tenant_id
             AND price_snapshot.treatment_plan_item_id = treatment_plan_items.id
            WHERE treatment_plan_items.tenant_id = ? AND treatment_plan_items.treatment_plan_id = ?
            ORDER BY tooth_number ASC`,
        )
        .bind(tenantId, planId)
        .all();
      return (result.results as D1Row[]).map(mapItem);
    },

    async create(tenantId, planId, data) {
      const id = crypto.randomUUID();
      const itemInsert = db
        .prepare(
          `INSERT INTO treatment_plan_items
              (id, tenant_id, treatment_plan_id, tooth_number, procedure, description, unit_cost)
            VALUES (?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          id,
          tenantId,
          planId,
          data.tooth_number ?? null,
          data.procedure,
          data.description,
          data.unit_cost,
        );
      const snapshotInsert = db
        .prepare(
          `INSERT INTO treatment_plan_item_price_snapshots
              (treatment_plan_item_id, tenant_id, service_code, service_name, price_includes_vat)
            VALUES (?, ?, ?, ?, ?)`,
        )
        .bind(id, tenantId, data.service_code ?? null, data.service_name ?? null, data.price_includes_vat ? 1 : 0);
      await db.batch([itemInsert, snapshotInsert]);
      const row = (await db
        .prepare(
          `SELECT treatment_plan_items.*,
                  price_snapshot.service_code AS snapshot_service_code,
                  price_snapshot.service_name AS snapshot_service_name,
                  price_snapshot.price_includes_vat AS snapshot_price_includes_vat,
                  price_snapshot.price_snapshot_at AS snapshot_price_snapshot_at
           FROM treatment_plan_items
           LEFT JOIN treatment_plan_item_price_snapshots AS price_snapshot
             ON price_snapshot.tenant_id = treatment_plan_items.tenant_id
            AND price_snapshot.treatment_plan_item_id = treatment_plan_items.id
           WHERE treatment_plan_items.tenant_id = ? AND treatment_plan_items.id = ? LIMIT 1`,
        )
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
    service_code: (row.snapshot_service_code as string | null) ?? (row.service_code as string | null) ?? undefined,
    service_name: (row.snapshot_service_name as string | null) ?? undefined,
    procedure: row.procedure as string,
    description: row.description as string,
    unit_cost: Number(row.unit_cost ?? 0),
    price_includes_vat: row.snapshot_price_includes_vat === undefined ? true : Boolean(row.snapshot_price_includes_vat),
    price_snapshot_at: (row.snapshot_price_snapshot_at as string | null) ?? undefined,
    status: row.status as TreatmentPlanItem["status"],
    created_at: row.created_at as string,
  };
}
