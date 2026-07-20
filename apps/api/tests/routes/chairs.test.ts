import { describe, expect, it } from "vitest";
import chairsRoutes from "../../src/routes/chairs";
import { authedRequestWithDB, mountRoute } from "../helpers/api";

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
