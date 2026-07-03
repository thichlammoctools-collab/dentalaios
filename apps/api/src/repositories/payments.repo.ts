import type { D1Database } from "@cloudflare/workers-types";
import type { Payment } from "@shared/types";
import type { D1Row } from "./base";

export interface PaymentsRepository {
  list(tenantId: string, opts?: { patientId?: string; treatmentPlanId?: string; status?: Payment["status"] }): Promise<Payment[]>;
  getById(tenantId: string, id: string): Promise<Payment | null>;
  create(tenantId: string, data: Omit<Payment, "id" | "tenant_id" | "created_at" | "status">): Promise<Payment>;
  updateStatus(tenantId: string, id: string, status: Payment["status"]): Promise<Payment | null>;
}

export function createPaymentsRepository(db: D1Database): PaymentsRepository {
  return {
    async list(tenantId, opts = {}) {
      const conditions = ["tenant_id = ?"];
      const binds: unknown[] = [tenantId];
      if (opts.patientId) {
        conditions.push("patient_id = ?");
        binds.push(opts.patientId);
      }
      if (opts.treatmentPlanId) {
        conditions.push("treatment_plan_id = ?");
        binds.push(opts.treatmentPlanId);
      }
      if (opts.status) {
        conditions.push("status = ?");
        binds.push(opts.status);
      }
      const result = await db
        .prepare(`SELECT * FROM payments WHERE ${conditions.join(" AND ")} ORDER BY created_at DESC`)
        .bind(...binds)
        .all();
      return (result.results as D1Row[]).map(mapPayment);
    },

    async getById(tenantId, id) {
      const row = (await db
        .prepare("SELECT * FROM payments WHERE tenant_id = ? AND id = ? LIMIT 1")
        .bind(tenantId, id)
        .first()) as D1Row | null;
      return row ? mapPayment(row) : null;
    },

    async create(tenantId, data) {
      const id = crypto.randomUUID();
      await db
        .prepare(
          `INSERT INTO payments
             (id, tenant_id, treatment_plan_id, patient_id, amount, currency, method, reference, notes)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          id,
          tenantId,
          data.treatment_plan_id,
          data.patient_id,
          data.amount,
          data.currency,
          data.method,
          data.reference ?? null,
          data.notes ?? null,
        )
        .run();
      const created = await this.getById(tenantId, id);
      if (!created) throw new Error("Insert succeeded but read failed");
      return created;
    },

    async updateStatus(tenantId, id, status) {
      await db
        .prepare("UPDATE payments SET status = ? WHERE tenant_id = ? AND id = ?")
        .bind(status, tenantId, id)
        .run();
      return this.getById(tenantId, id);
    },
  };
}

function mapPayment(row: D1Row): Payment {
  return {
    id: row.id as string,
    tenant_id: row.tenant_id as string,
    treatment_plan_id: row.treatment_plan_id as string,
    patient_id: row.patient_id as string,
    amount: Number(row.amount ?? 0),
    currency: row.currency as string,
    method: row.method as Payment["method"],
    status: row.status as Payment["status"],
    reference: (row.reference as string | null) ?? undefined,
    notes: (row.notes as string | null) ?? undefined,
    created_at: row.created_at as string,
  };
}