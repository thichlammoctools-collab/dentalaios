import { describe, expect, it } from "vitest";
import { createExpensesRepository } from "../../src/repositories/expenses.repo";
import { createMockD1 } from "../helpers/mock-db";
import { TENANT_A } from "../helpers/jwt";

describe("expenses repository", () => {
  it("scopes lists by tenant before optional filters", async () => {
    const db = createMockD1();
    await createExpensesRepository(db as never).list(TENANT_A, { branchId: "branch-a", status: "posted" });
    const call = db.__sqlContaining("FROM expenses")[0];
    expect(call.sql).toMatch(/WHERE tenant_id = \? AND branch_id = \? AND status = \?/i);
    expect(call.binds.slice(0, 3)).toEqual([TENANT_A, "branch-a", "posted"]);
  });

  it("creates an expense using the supplied tenant and actor", async () => {
    const row = {
      id: "expense-1", tenant_id: TENANT_A, branch_id: null, occurred_at: "2026-07-28",
      category: "supplies", amount: 120000, currency: "VND", method: "cash", vendor_name: null,
      reference: null, notes: null, status: "posted", void_reason: null, voided_at: null,
      created_by: "user-a", created_at: "2026-07-28T00:00:00Z",
    };
    const db = createMockD1({ rowsByFragment: new Map([["SELECT * FROM expenses", [row]]]) });
    const created = await createExpensesRepository(db as never).create(TENANT_A, "user-a", {
      occurred_at: "2026-07-28", category: "supplies", amount: 120000, currency: "VND", method: "cash",
    });
    const call = db.__sqlContaining("INSERT INTO expenses")[0];
    expect(call.binds[1]).toBe(TENANT_A);
    expect(call.binds.at(-1)).toBe("user-a");
    expect(created.tenant_id).toBe(TENANT_A);
  });

  it("voids only a posted expense within the tenant", async () => {
    const db = createMockD1();
    await createExpensesRepository(db as never).void(TENANT_A, "expense-1", "Nhập trùng");
    const call = db.__sqlContaining("UPDATE expenses")[0];
    expect(call.sql).toMatch(/WHERE tenant_id = \? AND id = \? AND status = 'posted'/i);
    expect(call.binds).toEqual(["Nhập trùng", TENANT_A, "expense-1"]);
  });
});
