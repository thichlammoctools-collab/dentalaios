import { describe, expect, it } from "vitest";
import dashboardRoutes from "../../src/routes/dashboard";
import { authedRequest, authedRequestWithDB, makeToken, mountRoute } from "../helpers/api";
import { buildEnv, TEST_SECRET } from "../helpers/jwt";
import { createMockD1 } from "../helpers/mock-db";

const branchRow = {
  id: "test-branch", tenant_id: "test-tenant", name: "Chi nhánh kiểm thử", address: "", phone: "", email: "", manager_name: "", opening_date: null, created_at: "2026-01-01",
};

describe("GET /api/dashboard/branch", () => {
  it("requires patient read permission", async () => {
    const app = mountRoute("/api/dashboard", dashboardRoutes);
    const response = await authedRequest(app, "GET", "/api/dashboard/branch", { permissions: [] });
    expect(response.status).toBe(403);
  });

  it("locks the snapshot to the authenticated branch and ignores query scope", async () => {
    const app = mountRoute("/api/dashboard", dashboardRoutes);
    const db = createMockD1({ rowsByFragment: new Map([["FROM branches WHERE tenant_id", [branchRow]]]) });
    const env = buildEnv(db, { JWT_SECRET: TEST_SECRET });
    const token = await makeToken(["read_patients"], { branchId: "test-branch" });

    const response = await app.request("/api/dashboard/branch?branch_id=other-branch", {
      headers: { Authorization: `Bearer ${token}` },
    }, env);

    expect(response.status).toBe(200);
    const body = await response.json() as {
      branch: { id: string; name: string };
      timezone: string;
      daily: { visits: number; revenue: number }[];
      actions: { count: number; items: unknown[]; remaining_count: number }[];
    };
    expect(body.branch).toEqual({ id: "test-branch", name: "Chi nhánh kiểm thử" });
    expect(body.timezone).toBe("Asia/Ho_Chi_Minh");
    expect(body.daily).toHaveLength(7);
    expect(body.actions).toHaveLength(4);
    expect(body.actions.every((group) => group.count === 0 && group.items.length === 0 && group.remaining_count === 0)).toBe(true);
    expect(db.__calls.some((call) => call.binds.includes("other-branch"))).toBe(false);
    expect(db.__calls.some((call) => call.binds.includes("test-branch"))).toBe(true);
  });
});

describe("GET /api/dashboard/management", () => {
  it("rejects users without the management dashboard permission", async () => {
    const app = mountRoute("/api/dashboard", dashboardRoutes);
    const response = await authedRequest(app, "GET", "/api/dashboard/management", {
      permissions: ["read_patients"],
    });
    expect(response.status).toBe(403);
  });

  it("returns a tenant-scoped aggregate snapshot for an administrator", async () => {
    const app = mountRoute("/api/dashboard", dashboardRoutes);
    const response = await authedRequestWithDB(
      app,
      "GET",
      "/api/dashboard/management?range=7",
      new Map([
        ["SELECT * FROM branches", [{
          id: "branch-1", tenant_id: "test-tenant", name: "Chi nhánh 1", address: "", phone: "", email: "", manager_name: "", opening_date: null, created_at: "2026-01-01",
        }]],
      ]),
      { permissions: ["all"] },
    );

    expect(response.status).toBe(200);
    const body = await response.json() as {
      timezone: string;
      range: number;
      branches: { id: string }[];
      daily: { date: string; visits: number; revenue: number }[];
      exceptions: unknown[];
    };
    expect(body.timezone).toBe("Asia/Ho_Chi_Minh");
    expect(body.range).toBe(7);
    expect(body.branches).toEqual([{ id: "branch-1", name: "Chi nhánh 1" }]);
    expect(body.daily).toHaveLength(7);
    expect(body.daily.every((point) => point.visits === 0 && point.revenue === 0)).toBe(true);
    expect(body.exceptions).toEqual([]);
  });

  it("rejects an invalid range before aggregation", async () => {
    const app = mountRoute("/api/dashboard", dashboardRoutes);
    const response = await authedRequest(app, "GET", "/api/dashboard/management?range=31", {
      permissions: ["all"],
    });
    expect(response.status).toBe(400);
  });
});
