import type { D1Database } from "@cloudflare/workers-types";
import type { Payment, PaymentItemAllocationInput } from "@shared/types";
import type { D1Row } from "./base";

export interface PaymentsRepository {
  list(tenantId: string, opts?: { patientId?: string; treatmentPlanId?: string; status?: Payment["status"] }): Promise<Payment[]>;
  getById(tenantId: string, id: string): Promise<Payment | null>;
  create(tenantId: string, data: Omit<Payment, "id" | "tenant_id" | "created_at" | "status">): Promise<Payment>;
  createWithAllocations(
    tenantId: string,
    data: Omit<Payment, "id" | "tenant_id" | "created_at" | "status">,
    allocations: PaymentItemAllocationInput[],
  ): Promise<Payment>;
  createAdjustment(
    tenantId: string,
    data: Omit<Payment, "id" | "tenant_id" | "created_at" | "status"> & { original_payment_id: string; adjustment_reason: string },
  ): Promise<Payment>;
  updateStatus(tenantId: string, id: string, status: Payment["status"]): Promise<Payment | null>;
  /**
   * Patch a subset of editable fields (amount, method, reference, notes).
   * Status and code are NOT settable here — use updateStatus for status,
   * and code is immutable.
   */
  updateEditable(
    tenantId: string,
    id: string,
    patch: {
      amount?: number;
      method?: Payment["method"];
      reference?: string | null;
      notes?: string | null;
    },
  ): Promise<Payment | null>;
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
             (id, tenant_id, treatment_plan_id, patient_id, amount, currency,
              method, reference, notes, code)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
          data.code,
        )
        .run();
      const created = await this.getById(tenantId, id);
      if (!created) throw new Error("Insert succeeded but read failed");
      return created;
    },

    async createWithAllocations(tenantId, data, allocations) {
      const id = crypto.randomUUID();
      const statements = [
        db.prepare(
          `INSERT INTO payments
             (id, tenant_id, treatment_plan_id, patient_id, amount, currency,
              method, reference, notes, code)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ).bind(
          id, tenantId, data.treatment_plan_id, data.patient_id, data.amount,
          data.currency, data.method, data.reference ?? null, data.notes ?? null, data.code,
        ),
        ...allocations.map((allocation) => db.prepare(
          `INSERT INTO payment_item_allocations
             (id, tenant_id, payment_id, treatment_plan_item_id, amount, discount_amount, discount_reason)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
        ).bind(
          crypto.randomUUID(), tenantId, id, allocation.treatment_plan_item_id, allocation.amount,
          allocation.discount_amount ?? 0, allocation.discount_reason ?? null,
        )),
      ];
      await db.batch(statements);
      const created = await this.getById(tenantId, id);
      if (!created) throw new Error("Insert succeeded but read failed");
      return created;
    },

    async createAdjustment(tenantId, data) {
      const id = crypto.randomUUID();
      await db
        .prepare(
          `INSERT INTO payments
             (id, tenant_id, treatment_plan_id, patient_id, amount, currency,
              method, reference, notes, code, status, original_payment_id, adjustment_reason)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'confirmed', ?, ?)`,
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
          data.code,
          data.original_payment_id,
          data.adjustment_reason,
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

    async updateEditable(tenantId, id, patch) {
      const sets: string[] = [];
      const binds: unknown[] = [];
      if (patch.amount !== undefined) {
        sets.push("amount = ?");
        binds.push(patch.amount);
      }
      if (patch.method !== undefined) {
        sets.push("method = ?");
        binds.push(patch.method);
      }
      if (patch.reference !== undefined) {
        sets.push("reference = ?");
        binds.push(patch.reference);
      }
      if (patch.notes !== undefined) {
        sets.push("notes = ?");
        binds.push(patch.notes);
      }
      if (sets.length === 0) {
        // Empty patch — return current row.
        return this.getById(tenantId, id);
      }
      binds.push(tenantId, id);
      await db
        .prepare(
          `UPDATE payments SET ${sets.join(", ")} WHERE tenant_id = ? AND id = ?`,
        )
        .bind(...binds)
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
    code: row.code as string,
    original_payment_id: (row.original_payment_id as string | null) ?? undefined,
    adjustment_reason: (row.adjustment_reason as string | null) ?? undefined,
    created_at: row.created_at as string,
  };
}
