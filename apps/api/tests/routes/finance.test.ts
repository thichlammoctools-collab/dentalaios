import { describe, expect, it } from "vitest";
import financeRoutes from "../../src/routes/finance";
import { authedRequest, authedRequestWithDB, mountRoute } from "../helpers/api";

const branchRow = {
  id: "test-branch", tenant_id: "test-tenant", name: "Chi nhánh kiểm thử", address: "", phone: "", email: "", manager_name: "", opening_date: null, created_at: "2026-01-01",
};

describe("finance routes", () => {
  it("requires finance view permission for the tenant-wide summary", async () => {
    const app = mountRoute("/api/finance", financeRoutes);
    const response = await authedRequest(app, "GET", "/api/finance/summary", { permissions: ["write_payments"] });
    expect(response.status).toBe(403);
  });

  it("returns a zero-filled snapshot without patient information", async () => {
    const app = mountRoute("/api/finance", financeRoutes);
    const response = await authedRequestWithDB(app, "GET", "/api/finance/summary?range=7", new Map([
      ["SELECT * FROM branches", [branchRow]],
    ]), { permissions: ["view_finance"] });
    expect(response.status).toBe(200);
    const body = await response.json() as { timezone: string; daily: unknown[]; branches: { id: string }[]; ledger: unknown[]; kpis: { net_cash: number } };
    expect(body.timezone).toBe("Asia/Ho_Chi_Minh");
    expect(body.daily).toHaveLength(7);
    expect(body.branches).toEqual([{ id: "test-branch", name: "Chi nhánh kiểm thử" }]);
    expect(body.ledger).toEqual([]);
    expect(body.kpis.net_cash).toBe(0);
  });

  it("requires finance management permission to record an expense", async () => {
    const app = mountRoute("/api/finance", financeRoutes);
    const response = await authedRequest(app, "POST", "/api/finance/expenses", {
      permissions: ["view_finance"],
      body: { occurred_at: "2026-07-28", category: "supplies", amount: 120000, currency: "VND", method: "cash" },
    });
    expect(response.status).toBe(403);
  });

  it("rejects invalid finance filters before querying aggregates", async () => {
    const app = mountRoute("/api/finance", financeRoutes);
    const response = await authedRequest(app, "GET", "/api/finance/summary?range=31", { permissions: ["view_finance"] });
    expect(response.status).toBe(400);
  });
});
