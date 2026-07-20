/**
 * Integration tests for /api/treatment-plans routes.
 */

import { describe, it, expect } from "vitest";
import treatmentPlansRoutes from "../../src/routes/treatment-plans";
import treatmentPlansExtras from "../../src/routes/treatment-plans-extras";
import { mountRoute, authedRequestWithDB } from "../helpers/api";

const planRow = (overrides: Record<string, unknown> = {}) => ({
  id: "plan-1",
  tenant_id: "test-tenant",
  visit_id: "visit-1",
  patient_id: "patient-1",
  status: "draft",
  total_cost: 0,
  currency: "VND",
  notes: null,
  approved_at: null,
  created_at: "2026-01-01",
  ...overrides,
});

const itemRow = (overrides: Record<string, unknown> = {}) => ({
  id: "item-1",
  tenant_id: "test-tenant",
  treatment_plan_id: "plan-1",
  tooth_number: 11,
  procedure: "filling",
  description: "Trám răng cửa trên",
  unit_cost: 500000,
  status: "planned",
  created_at: "2026-01-01",
  ...overrides,
});

describe("POST /api/treatment-plans", () => {
  it("returns 201 + new plan in draft status", async () => {
    const app = mountRoute("/api/treatment-plans", treatmentPlansRoutes);
    const res = await authedRequestWithDB(
      app,
      "POST",
      "/api/treatment-plans",
      new Map([
        ["FROM visits", [{ id: "visit-1", tenant_id: "test-tenant", patient_id: "patient-1" }]],
        ["FROM patients", [{ id: "patient-1", tenant_id: "test-tenant" }]],
        ["FROM treatment_plans", [planRow()]],
      ]),
      {
        body: {
          visit_id: "visit-1",
          patient_id: "patient-1",
          currency: "VND",
        },
      },
    );
    expect(res.status).toBe(201);
    const body = (await res.json()) as { id: string; status: string; currency: string };
    expect(body.id).toBe("plan-1");
    expect(body.status).toBe("draft");
    expect(body.currency).toBe("VND");
  });

  it("returns 422 for missing patient_id", async () => {
    const app = mountRoute("/api/treatment-plans", treatmentPlansRoutes);
    const res = await authedRequestWithDB(
      app,
      "POST",
      "/api/treatment-plans",
      new Map(),
      {
        body: {
          visit_id: "visit-1",
          currency: "VND",
        },
      },
    );
    expect(res.status).toBe(400);
  });

  it("returns 403 for user without write_plans", async () => {
    const app = mountRoute("/api/treatment-plans", treatmentPlansRoutes);
    // Assistant: read_patients + write_visits only — no write_plans
    const res = await authedRequestWithDB(
      app,
      "POST",
      "/api/treatment-plans",
      new Map(),
      {
        permissions: ["read_patients", "write_visits"],
        body: {
          visit_id: "visit-1",
          patient_id: "patient-1",
        },
      },
    );
    expect(res.status).toBe(403);
  });
});

describe("POST /api/treatment-plans/:id/items", () => {
  it("returns 201 + item for valid data", async () => {
    const app = mountRoute("/api/treatment-plans", treatmentPlansRoutes);
    const res = await authedRequestWithDB(
      app,
      "POST",
      "/api/treatment-plans/plan-1/items",
      new Map([
        ["FROM treatment_plans", [planRow()]],
        // SELECT for createItem: WHERE tenant_id AND id
        ["FROM treatment_plan_items WHERE tenant_id", [itemRow()]],
        // SELECT SUM for recomputeTotal
        ["COALESCE(SUM", [{ total: 500000 }]],
      ]),
      {
        body: {
          tooth_number: 11,
          procedure: "filling",
          description: "Trám răng cửa trên",
          unit_cost: 500000,
        },
      },
    );
    expect(res.status).toBe(201);
    const body = (await res.json()) as { tooth_number: number; unit_cost: number };
    expect(body.tooth_number).toBe(11);
    expect(body.unit_cost).toBe(500000);
  });

  it("returns 422 for invalid FDI tooth (00)", async () => {
    const app = mountRoute("/api/treatment-plans", treatmentPlansRoutes);
    const res = await authedRequestWithDB(
      app,
      "POST",
      "/api/treatment-plans/plan-1/items",
      new Map(),
      {
        body: {
          tooth_number: 0, // invalid
          procedure: "filling",
          description: "test",
          unit_cost: 100,
        },
      },
    );
    expect(res.status).toBe(400);
  });

  it("returns 422 for negative unit_cost", async () => {
    const app = mountRoute("/api/treatment-plans", treatmentPlansRoutes);
    const res = await authedRequestWithDB(
      app,
      "POST",
      "/api/treatment-plans/plan-1/items",
      new Map(),
      {
        body: {
          tooth_number: 11,
          procedure: "filling",
          description: "test",
          unit_cost: -100,
        },
      },
    );
    expect(res.status).toBe(400);
  });

  it("returns 404 for non-existent plan", async () => {
    const app = mountRoute("/api/treatment-plans", treatmentPlansRoutes);
    const res = await authedRequestWithDB(
      app,
      "POST",
      "/api/treatment-plans/ghost/items",
      new Map(),
      {
        body: {
          tooth_number: 11,
          procedure: "filling",
          description: "test",
          unit_cost: 100,
        },
      },
    );
    expect(res.status).toBe(404);
  });

  it("returns 422 when trying to add item to approved plan", async () => {
    const app = mountRoute("/api/treatment-plans", treatmentPlansRoutes);
    const res = await authedRequestWithDB(
      app,
      "POST",
      "/api/treatment-plans/plan-1/items",
      new Map([
        ["FROM treatment_plans", [planRow({ status: "approved" })]],
      ]),
      {
        body: {
          tooth_number: 11,
          procedure: "filling",
          description: "test",
          unit_cost: 100,
        },
      },
    );
    expect(res.status).toBe(422);
    const body = (await res.json()) as { error: string };
    expect(body.error).toContain("draft");
  });
});

describe("POST /api/treatment-plans/:id/approve", () => {
  it("approves a draft plan with items", async () => {
    const app = mountRoute("/api/treatment-plans", treatmentPlansRoutes);
    const approved = planRow({ status: "approved", approved_at: "2026-01-02" });
    const res = await authedRequestWithDB(
      app,
      "POST",
      "/api/treatment-plans/plan-1/approve",
      new Map<string, unknown[]>([
        // 1st SELECT: getById → planRow (draft)
        // 2nd SELECT: listByPlan → [itemRow]
        // Then UPDATE (no rows)
        // Then final getById → approved
        ["FROM treatment_plans", (sql, idx) => (idx === 0 ? [planRow()] : [approved])],
        ["FROM treatment_plan_items", [itemRow()]],
      ]),
      {
        permissions: ["approve_plans"],
      },
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string; approved_at: string };
    expect(body.status).toBe("approved");
    expect(body.approved_at).toBeTruthy();
  });

  it("rejects approving empty plan", async () => {
    const app = mountRoute("/api/treatment-plans", treatmentPlansRoutes);
    const res = await authedRequestWithDB(
      app,
      "POST",
      "/api/treatment-plans/plan-1/approve",
      new Map([
        ["FROM treatment_plans", [planRow()]],
        ["FROM treatment_plan_items", []], // empty — no items
      ]),
      {
        permissions: ["approve_plans"],
      },
    );
    expect(res.status).toBe(422);
    const body = (await res.json()) as { error: string };
    expect(body.error).toContain("1 item");
  });

  it("returns 403 for receptionist (no approve_plans)", async () => {
    const app = mountRoute("/api/treatment-plans", treatmentPlansRoutes);
    const res = await authedRequestWithDB(
      app,
      "POST",
      "/api/treatment-plans/plan-1/approve",
      new Map(),
      {
        permissions: ["read_patients", "write_payments"], // receptionist
      },
    );
    expect(res.status).toBe(403);
  });
});

describe("GET /api/treatment-plans/:id", () => {
  it("returns plan", async () => {
    const app = mountRoute("/api/treatment-plans", treatmentPlansRoutes);
    const res = await authedRequestWithDB(
      app,
      "GET",
      "/api/treatment-plans/plan-1",
      new Map([["FROM treatment_plans", [planRow({ total_cost: 1500000 })]]]),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { id: string; total_cost: number };
    expect(body.id).toBe("plan-1");
    expect(body.total_cost).toBe(1500000);
  });
});

describe("GET /api/treatment-plans/:id/items", () => {
  it("returns list of items", async () => {
    const app = mountRoute("/api/treatment-plans", treatmentPlansRoutes);
    const res = await authedRequestWithDB(
      app,
      "GET",
      "/api/treatment-plans/plan-1/items",
      new Map([["FROM treatment_plan_items", [itemRow(), itemRow({ id: "item-2", tooth_number: 16 })]]]),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { items: { id: string }[] };
    expect(body.items).toHaveLength(2);
  });
});

describe("GET /api/treatment-plans/:id/pdf", () => {
  it("returns a downloadable PDF for a plan in the caller tenant", async () => {
    const app = mountRoute("/api/treatment-plans", treatmentPlansExtras);
    const userContextRow = {
      u_id: "test-user",
      u_tenant_id: "test-tenant",
      u_branch_id: "test-branch",
      u_role_id: "test-role",
      u_email: "admin@demo.clinic",
      u_name: "Demo Admin",
      u_is_active: 1,
      u_password_hash: "x",
      u_created_at: "2026-01-01",
      r_id: "test-role",
      r_tenant_id: "test-tenant",
      r_name: "admin",
      r_permissions: '["all"]',
      r_created_at: "2026-01-01",
      t_id: "test-tenant",
      t_name: "Demo Clinic",
      t_slug: "demo-clinic",
      t_is_active: 1,
      t_created_at: "2026-01-01",
      b_id: "test-branch",
      b_tenant_id: "test-tenant",
      b_name: "Main",
      b_address: "1 Main Street",
      b_created_at: "2026-01-01",
    };
    const res = await authedRequestWithDB(
      app,
      "GET",
      "/api/treatment-plans/plan-1/pdf",
      new Map([
        ["FROM treatment_plans", [planRow({ total_cost: 500000 })]],
        ["FROM treatment_plan_items", [itemRow()]],
        ["FROM users", [userContextRow]],
        ["FROM patients", [patientRow()]],
      ]),
    );

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/pdf");
    expect(res.headers.get("content-disposition")).toContain("Ke-hoach-dieu-tri-plan-1.pdf");
    expect(new Uint8Array(await res.arrayBuffer()).slice(0, 4)).toEqual(
      new Uint8Array([0x25, 0x50, 0x44, 0x46]),
    );
  });

  it("uses the active clinic service price from the submitted service code", async () => {
    const app = mountRoute("/api/treatment-plans", treatmentPlansRoutes);
    const res = await authedRequestWithDB(
      app,
      "POST",
      "/api/treatment-plans/plan-1/items",
      new Map([
        ["FROM treatment_plans", [planRow()]],
        ["FROM treatment_services", [{ id: "service-1", tenant_id: "test-tenant", code: "TRAM-COM", name: "Trám composite", procedure: "filling", price: 650000, is_active: 1, created_at: "2026-01-01", updated_at: "2026-01-01" }]],
        ["FROM treatment_plan_items WHERE tenant_id", [itemRow({ service_code: "TRAM-COM", unit_cost: 650000 })]],
        ["COALESCE(SUM", [{ total: 650000 }]],
      ]),
      { body: { tooth_number: 11, service_code: "TRAM-COM", procedure: "other", description: "Trám răng", unit_cost: 1 } },
    );
    expect(res.status).toBe(201);
    expect((await res.json() as { unit_cost: number }).unit_cost).toBe(650000);
  });

  it("rejects access without read_patients permission", async () => {
    const app = mountRoute("/api/treatment-plans", treatmentPlansExtras);
    const res = await authedRequestWithDB(
      app,
      "GET",
      "/api/treatment-plans/plan-1/pdf",
      new Map(),
      { permissions: ["write_plans"] },
    );

    expect(res.status).toBe(403);
  });
});

describe("POST /api/treatment-plans/:id/lark-handover", () => {
  it("returns mock task ID when Lark credentials not configured", async () => {
    const app = mountRoute("/api/treatment-plans", treatmentPlansExtras);
    // Use 'all' permission + approved plan with items + user/me rows
    const userRow = {
      u_id: "test-user",
      u_tenant_id: "test-tenant",
      u_branch_id: "test-branch",
      u_role_id: "test-role",
      u_email: "admin@demo.clinic",
      u_name: "Demo Admin",
      u_password_hash: "x",
      u_created_at: "2026-01-01",
      r_id: "test-role",
      r_tenant_id: "test-tenant",
      r_name: "admin",
      r_permissions: '["all"]',
      r_created_at: "2026-01-01",
      t_id: "test-tenant",
      t_name: "Demo Clinic",
      t_created_at: "2026-01-01",
      b_id: "test-branch",
      b_tenant_id: "test-tenant",
      b_name: "Main",
      b_address: "",
      b_created_at: "2026-01-01",
    };
    const res = await authedRequestWithDB(
      app,
      "POST",
      "/api/treatment-plans/plan-1/lark-handover",
      new Map([
        ["FROM treatment_plans", [planRow({ status: "approved" })]],
        ["FROM treatment_plan_items", [itemRow()]],
        ["FROM patients", [patientRow()]],
        ["FROM users", [userRow]],
      ]),
      { permissions: ["write_plans", "all"] },
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { mocked: boolean; taskId: string };
    expect(body.mocked).toBe(true);
    expect(body.taskId).toBeTruthy();
  });

  it("returns 422 when plan not approved", async () => {
    const app = mountRoute("/api/treatment-plans", treatmentPlansExtras);
    const res = await authedRequestWithDB(
      app,
      "POST",
      "/api/treatment-plans/plan-1/lark-handover",
      new Map([["FROM treatment_plans", [planRow({ status: "draft" })]]]),
    );
    expect(res.status).toBe(422);
    const body = (await res.json()) as { error: string };
    expect(body.error).toContain("duyệt");
  });
});

function patientRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "patient-1",
    tenant_id: "test-tenant",
    branch_id: "test-branch",
    name: "Nguyen Van A",
    date_of_birth: "1990-01-01",
    gender: "M",
    phone: "0901234567",
    email: null,
    notes: null,
    created_at: "2026-01-01",
    ...overrides,
  };
}
