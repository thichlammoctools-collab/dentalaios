import type { D1Database } from "@cloudflare/workers-types";
import type { ParaclinicalOrder, ParaclinicalOrderStatus, ParaclinicalOrderStatusHistory } from "@shared/types";
import type { D1Row } from "./base";

const columns = [
  "id", "tenant_id", "visit_id", "patient_id", "diagnosis_id",
  "order_type", "custom_type_name", "body_site", "status", "clinical_reason",
  "result_summary", "result_file_id", "abnormal_flag",
  "ordered_by", "ordered_at", "completed_at", "cancelled_at", "cancel_reason",
  "notes", "created_at", "updated_at",
];

const select = `SELECT ${columns.join(", ")} FROM paraclinical_orders`;

function mapOrder(row: D1Row): ParaclinicalOrder {
  return {
    id: row.id as string,
    tenant_id: row.tenant_id as string,
    visit_id: row.visit_id as string,
    patient_id: row.patient_id as string,
    diagnosis_id: (row.diagnosis_id as string) ?? undefined,
    order_type: row.order_type as ParaclinicalOrder["order_type"],
    custom_type_name: (row.custom_type_name as string) ?? undefined,
    body_site: (row.body_site as string) ?? undefined,
    status: row.status as ParaclinicalOrder["status"],
    clinical_reason: row.clinical_reason as string,
    result_summary: (row.result_summary as string) ?? undefined,
    result_file_id: (row.result_file_id as string) ?? undefined,
    abnormal_flag: (row.abnormal_flag as ParaclinicalOrder["abnormal_flag"]) ?? undefined,
    ordered_by: row.ordered_by as string,
    ordered_at: row.ordered_at as string,
    completed_at: (row.completed_at as string) ?? undefined,
    cancelled_at: (row.cancelled_at as string) ?? undefined,
    cancel_reason: (row.cancel_reason as string) ?? undefined,
    notes: (row.notes as string) ?? undefined,
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
  };
}

function mapStatusHistory(row: D1Row): ParaclinicalOrderStatusHistory {
  return {
    id: row.id as string,
    tenant_id: row.tenant_id as string,
    order_id: row.order_id as string,
    from_status: (row.from_status as ParaclinicalOrderStatus) ?? undefined,
    to_status: row.to_status as ParaclinicalOrderStatus,
    changed_by: row.changed_by as string,
    changed_at: row.changed_at as string,
  };
}

export function createParaclinicalOrdersRepository(db: D1Database) {
  return {
    async listByVisit(tenantId: string, visitId: string): Promise<ParaclinicalOrder[]> {
      const result = await db.prepare(`${select} WHERE tenant_id = ? AND visit_id = ? ORDER BY created_at DESC`)
        .bind(tenantId, visitId).all<D1Row>();
      return result.results.map(mapOrder);
    },

    async listByPatient(tenantId: string, patientId: string): Promise<ParaclinicalOrder[]> {
      const result = await db.prepare(`${select} WHERE tenant_id = ? AND patient_id = ? ORDER BY ordered_at DESC LIMIT 200`)
        .bind(tenantId, patientId).all<D1Row>();
      return result.results.map(mapOrder);
    },

    async get(tenantId: string, orderId: string): Promise<ParaclinicalOrder | null> {
      const row = await db.prepare(`${select} WHERE tenant_id = ? AND id = ? LIMIT 1`)
        .bind(tenantId, orderId).first<D1Row>();
      return row ? mapOrder(row) : null;
    },

    async create(data: ParaclinicalOrder): Promise<ParaclinicalOrder> {
      await db.prepare(`INSERT INTO paraclinical_orders (${columns.join(", ")}) VALUES (${columns.map(() => "?").join(", ")})`)
        .bind(...columns.map((key) => (data as unknown as Record<string, unknown>)[key] ?? null)).run();
      const created = await this.get(data.tenant_id, data.id);
      if (!created) throw new Error("Paraclinical order insert failed");
      await db.prepare(
        `INSERT INTO paraclinical_order_status_history
           (id, tenant_id, order_id, from_status, to_status, changed_by, changed_at)
         VALUES (?, ?, ?, NULL, 'pending', ?, ?)`,
      ).bind(crypto.randomUUID(), data.tenant_id, data.id, data.ordered_by, data.ordered_at).run();
      return created;
    },

    async update(tenantId: string, orderId: string, data: ParaclinicalOrder): Promise<ParaclinicalOrder | null> {
      const updateColumns = columns.filter((key) => !["id", "tenant_id", "visit_id", "patient_id", "created_at", "ordered_by"].includes(key));
      await db.prepare(`UPDATE paraclinical_orders SET ${updateColumns.map((key) => `${key} = ?`).join(", ")} WHERE tenant_id = ? AND id = ?`)
        .bind(...updateColumns.map((key) => (data as unknown as Record<string, unknown>)[key] ?? null), tenantId, orderId).run();
      return this.get(tenantId, orderId);
    },

    async addStatusHistory(
      tenantId: string,
      orderId: string,
      fromStatus: ParaclinicalOrderStatus,
      toStatus: ParaclinicalOrderStatus,
      changedBy: string,
      changedAt: string,
    ): Promise<void> {
      await db.prepare(
        `INSERT INTO paraclinical_order_status_history
           (id, tenant_id, order_id, from_status, to_status, changed_by, changed_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ).bind(crypto.randomUUID(), tenantId, orderId, fromStatus, toStatus, changedBy, changedAt).run();
    },

    async listStatusHistory(tenantId: string, orderId: string): Promise<ParaclinicalOrderStatusHistory[]> {
      const result = await db.prepare(
        `SELECT id, tenant_id, order_id, from_status, to_status, changed_by, changed_at
         FROM paraclinical_order_status_history
         WHERE tenant_id = ? AND order_id = ?
         ORDER BY changed_at DESC`,
      ).bind(tenantId, orderId).all<D1Row>();
      return result.results.map(mapStatusHistory);
    },
  };
}
