import type { D1Database } from "@cloudflare/workers-types";
import type { Expense, ExpenseStatus } from "@shared/types";
import type { ExpenseCreateInput } from "@shared/validation";
import type { D1Row } from "./base";

export interface ExpensesRepository {
  list(tenantId: string, opts?: { branchId?: string; status?: ExpenseStatus; limit?: number }): Promise<Expense[]>;
  getById(tenantId: string, id: string): Promise<Expense | null>;
  create(tenantId: string, createdBy: string, data: ExpenseCreateInput): Promise<Expense>;
  void(tenantId: string, id: string, reason: string): Promise<Expense | null>;
}

export function createExpensesRepository(db: D1Database): ExpensesRepository {
  return {
    async list(tenantId, opts = {}) {
      const conditions = ["tenant_id = ?"];
      const binds: unknown[] = [tenantId];
      if (opts.branchId) {
        conditions.push("branch_id = ?");
        binds.push(opts.branchId);
      }
      if (opts.status) {
        conditions.push("status = ?");
        binds.push(opts.status);
      }
      const limit = Math.min(Math.max(opts.limit ?? 100, 1), 250);
      binds.push(limit);
      const result = await db.prepare(
        `SELECT * FROM expenses WHERE ${conditions.join(" AND ")}
         ORDER BY occurred_at DESC, created_at DESC LIMIT ?`,
      ).bind(...binds).all<D1Row>();
      return (result.results ?? []).map(mapExpense);
    },

    async getById(tenantId, id) {
      const row = await db.prepare(
        "SELECT * FROM expenses WHERE tenant_id = ? AND id = ? LIMIT 1",
      ).bind(tenantId, id).first<D1Row>();
      return row ? mapExpense(row) : null;
    },

    async create(tenantId, createdBy, data) {
      const id = crypto.randomUUID();
      await db.prepare(
        `INSERT INTO expenses (
          id, tenant_id, branch_id, occurred_at, category, amount, currency,
          method, vendor_name, reference, notes, created_by
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(
        id,
        tenantId,
        data.branch_id ?? null,
        data.occurred_at,
        data.category,
        data.amount,
        data.currency,
        data.method,
        data.vendor_name ?? null,
        data.reference ?? null,
        data.notes ?? null,
        createdBy,
      ).run();
      const created = await this.getById(tenantId, id);
      if (!created) throw new Error("Insert succeeded but read failed");
      return created;
    },

    async void(tenantId, id, reason) {
      await db.prepare(
        `UPDATE expenses
         SET status = 'void', void_reason = ?, voided_at = datetime('now')
         WHERE tenant_id = ? AND id = ? AND status = 'posted'`,
      ).bind(reason.trim(), tenantId, id).run();
      return this.getById(tenantId, id);
    },
  };
}

function mapExpense(row: D1Row): Expense {
  return {
    id: row.id as string,
    tenant_id: row.tenant_id as string,
    branch_id: (row.branch_id as string | null) ?? undefined,
    occurred_at: row.occurred_at as string,
    category: row.category as Expense["category"],
    amount: Number(row.amount ?? 0),
    currency: row.currency as string,
    method: row.method as Expense["method"],
    vendor_name: (row.vendor_name as string | null) ?? undefined,
    reference: (row.reference as string | null) ?? undefined,
    notes: (row.notes as string | null) ?? undefined,
    status: row.status as ExpenseStatus,
    void_reason: (row.void_reason as string | null) ?? undefined,
    voided_at: (row.voided_at as string | null) ?? undefined,
    created_by: row.created_by as string,
    created_at: row.created_at as string,
  };
}
