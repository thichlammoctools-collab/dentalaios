import { describe, expect, it } from "vitest";
import dashboardRoutes from "../../src/routes/dashboard";
import { authedRequest, authedRequestWithDB, mountRoute } from "../helpers/api";

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
