import { describe, expect, it } from "vitest";
import chairsRoutes from "../../src/routes/chairs";
import { createChairsRepository } from "../../src/repositories/chairs.repo";
import { authedRequestWithDB, mountRoute } from "../helpers/api";
import { createMockD1 } from "../helpers/mock-db";

const chairRow = (overrides: Record<string, unknown> = {}) => ({
  id: "chair-1",
  tenant_id: "test-tenant",
  branch_id: "test-branch",
  code: "CHAIR-01",
  name: "Ghế 01",
  room_name: "Phòng A",
  chair_type: "general",
  operational_status: "available",
  default_doctor_id: null,
  default_assistant_id: null,
  turnover_min: 10,
  sort_order: 1,
  color: null,
  is_active: 1,
  notes: null,
  created_at: "2026-07-20T00:00:00.000Z",
  updated_at: "2026-07-20T00:00:00.000Z",
  ...overrides,
});

const roomRow = (overrides: Record<string, unknown> = {}) => ({
  id: "room-1",
  tenant_id: "test-tenant",
  branch_id: "test-branch",
  name: "Phòng A",
  sort_order: 0,
  is_active: 1,
  created_at: "2026-07-20T00:00:00.000Z",
  updated_at: "2026-07-20T00:00:00.000Z",
  ...overrides,
});

describe("GET /api/chairs", () => {
  it("lists chairs within the current tenant", async () => {
    const app = mountRoute("/api/chairs", chairsRoutes);
    const res = await authedRequestWithDB(
      app,
      "GET",
      "/api/chairs?branch_id=test-branch",
      new Map([["FROM dental_chairs", [chairRow()]]]),
      { permissions: ["read_patients"] },
    );
    expect(res.status).toBe(200);
    const body = await res.json() as { items: Array<{ code: string; is_active: boolean }> };
    expect(body.items).toHaveLength(1);
    expect(body.items[0]).toMatchObject({ code: "CHAIR-01", is_active: true });
  });

  it("qualifies chair filters after joining rooms", async () => {
    const db = createMockD1({ rowsByFragment: new Map([["FROM dental_chairs", [chairRow()]]]) });

    await createChairsRepository(db as never).list("test-tenant", { branchId: "test-branch", activeOnly: true });

    const query = db.__sqlContaining("FROM dental_chairs")[0];
    expect(query.sql).toContain("dental_chairs.tenant_id = ?");
    expect(query.sql).toContain("dental_chairs.branch_id = ?");
    expect(query.sql).toContain("dental_chairs.is_active = 1");
  });
});

describe("GET /api/chairs/rooms", () => {
  it("lists rooms for the requested branch", async () => {
    const app = mountRoute("/api/chairs", chairsRoutes);
    const res = await authedRequestWithDB(
      app,
      "GET",
      "/api/chairs/rooms?branch_id=test-branch",
      new Map([
        ["FROM branches", [{ id: "test-branch" }]],
        ["FROM dental_rooms", [roomRow()]],
      ]),
      { permissions: ["read_patients"] },
    );
    expect(res.status).toBe(200);
    const body = await res.json() as { items: Array<{ id: string; name: string }> };
    expect(body.items).toHaveLength(1);
    expect(body.items[0]).toMatchObject({ id: "room-1", name: "Phòng A", branch_id: "test-branch" });
  });

  it("requires a branch id", async () => {
    const app = mountRoute("/api/chairs", chairsRoutes);
    const res = await authedRequestWithDB(app, "GET", "/api/chairs/rooms", new Map(), { permissions: ["read_patients"] });
    expect(res.status).toBe(400);
  });
});

describe("GET /api/chairs/revenue-report", () => {
  it("requires management dashboard permission", async () => {
    const app = mountRoute("/api/chairs", chairsRoutes);
    const res = await authedRequestWithDB(
      app,
      "GET",
      "/api/chairs/revenue-report?branch_id=test-branch&range=30",
      new Map(),
      { permissions: ["read_patients"] },
    );
    expect(res.status).toBe(403);
  });

  it("scopes aggregates to the requested tenant branch", async () => {
    const app = mountRoute("/api/chairs", chairsRoutes);
    const res = await authedRequestWithDB(
      app,
      "GET",
      "/api/chairs/revenue-report?branch_id=test-branch&range=7",
      new Map([
        ["FROM branches", [{ id: "test-branch" }]],
        ["FROM dental_chairs", [chairRow()]],
        ["FROM payments", [{ chair_id: "chair-1", confirmed_revenue: 500_000, payment_count: 1 }]],
        ["FROM appointments", [{ chair_id: "chair-1", completed_minutes: 60 }]],
      ]),
      { permissions: ["view_management_dashboard"] },
    );
    expect(res.status).toBe(200);
    const body = await res.json() as { items: Array<{ confirmed_revenue: number; revenue_per_completed_hour: number | null }> };
    expect(body.items[0]).toMatchObject({ confirmed_revenue: 500_000, revenue_per_completed_hour: 500_000 });
  });
});

describe("GET /api/chairs/utilization", () => {
  it("returns today utilization for every chair", async () => {
    const app = mountRoute("/api/chairs", chairsRoutes);
    const res = await authedRequestWithDB(
      app,
      "GET",
      "/api/chairs/utilization?branch_id=test-branch&period=today",
      new Map([
        ["FROM branches", [{ id: "test-branch" }]],
        ["FROM dental_chairs", [chairRow(), chairRow({ id: "chair-2", code: "CHAIR-02" })]],
        ["GROUP BY chair_id", [{ chair_id: "chair-1", appointment_count: 2, scheduled_minutes: 75 }]],
      ]),
      { permissions: ["read_patients"] },
    );
    expect(res.status).toBe(200);
    const body = await res.json() as { period: string; items: Array<{ chair: { id: string }; appointment_count: number; scheduled_minutes: number }> };
    expect(body.period).toBe("today");
    expect(body.items).toEqual(expect.arrayContaining([
      expect.objectContaining({ chair: expect.objectContaining({ id: "chair-1" }), appointment_count: 2, scheduled_minutes: 75 }),
      expect.objectContaining({ chair: expect.objectContaining({ id: "chair-2" }), appointment_count: 0, scheduled_minutes: 0 }),
    ]));
  });

  it("rejects an unsupported utilization period", async () => {
    const app = mountRoute("/api/chairs", chairsRoutes);
    const res = await authedRequestWithDB(app, "GET", "/api/chairs/utilization?branch_id=test-branch&period=month", new Map(), { permissions: ["read_patients"] });
    expect(res.status).toBe(400);
  });
});

describe("PATCH /api/chairs/:id/status", () => {
  it("requires appointment write permission", async () => {
    const app = mountRoute("/api/chairs", chairsRoutes);
    const res = await authedRequestWithDB(
      app,
      "PATCH",
      "/api/chairs/chair-1/status",
      new Map(),
      { permissions: ["read_patients"], body: { operational_status: "maintenance" } },
    );
    expect(res.status).toBe(403);
  });
});
