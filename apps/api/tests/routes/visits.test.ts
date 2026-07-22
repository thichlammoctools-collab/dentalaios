/**
 * Integration tests for /api/visits routes.
 */

import { describe, it, expect } from "vitest";
import visitsRoutes from "../../src/routes/visits";
import { mountRoute, authedRequestWithDB } from "../helpers/api";

const visitRow = (overrides: Record<string, unknown> = {}) => ({
  id: "visit-1",
  tenant_id: "test-tenant",
  patient_id: "patient-1",
    branch_id: "test-branch",
    branch_name: "Chi nhánh Trung tâm",
  clinician_id: "test-user",
  date: "2026-01-01T10:00:00Z",
  status: "in_progress",
  notes: null,
  created_at: "2026-01-01T10:00:00Z",
  ...overrides,
});

const personnelContextRow = (id: string, role: "doctor" | "assistant") => ({
  u_id: id,
  u_tenant_id: "test-tenant",
  u_branch_id: "test-branch",
  u_role_id: `role-${role}`,
  u_email: `${id}@example.test`,
  u_name: id,
  u_is_active: 1,
  u_password_hash: "hash",
  u_created_at: "2026-01-01T10:00:00Z",
  r_id: `role-${role}`,
  r_tenant_id: "test-tenant",
  r_system_key: role,
  r_name: role,
  r_permissions: "[]",
  r_created_at: "2026-01-01T10:00:00Z",
  t_id: "test-tenant",
  t_name: "Test tenant",
  t_is_active: 1,
  t_created_at: "2026-01-01T10:00:00Z",
  b_id: "test-branch",
  b_tenant_id: "test-tenant",
  b_name: "Test branch",
  b_address: "",
  b_created_at: "2026-01-01T10:00:00Z",
});

describe("GET /api/visits", () => {
  it("returns visit list filtered by patient_id", async () => {
    const app = mountRoute("/api/visits", visitsRoutes);
    const res = await authedRequestWithDB(
      app,
      "GET",
      "/api/visits?patient_id=patient-1",
      new Map([["FROM visits", [visitRow(), visitRow({ id: "visit-2" })]]]),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { items: { id: string; branch_name?: string }[] };
    expect(body.items).toHaveLength(2);
    expect(body.items[0].branch_name).toBe("Chi nhánh Trung tâm");
  });
});

describe("POST /api/visits", () => {
  it("returns 201 + visit for valid data", async () => {
    const app = mountRoute("/api/visits", visitsRoutes);
    const res = await authedRequestWithDB(
      app,
      "POST",
      "/api/visits",
      new Map([
        ["FROM patients", [{ id: "patient-1", tenant_id: "test-tenant" }]],
        ["FROM branches", [{ id: "test-branch", tenant_id: "test-tenant" }]],
        ["FROM users", (sql, callIndex) => sql.includes("JOIN roles")
          ? [callIndex === 3 ? personnelContextRow("doctor-1", "doctor") : personnelContextRow("assistant-1", "assistant")]
          : [{ id: "test-user", tenant_id: "test-tenant" }]],
        ["FROM dental_chairs", [{
          id: "chair-1", tenant_id: "test-tenant", branch_id: "test-branch",
          is_active: 1, operational_status: "available",
        }]],
        ["FROM visits", [visitRow()]],
      ]),
      {
        body: {
          patient_id: "patient-1",
          branch_id: "test-branch",
          clinician_id: "test-user",
          treating_clinician_id: "doctor-1",
          assistant_id: "assistant-1",
          chair_id: "chair-1",
          notes: "Khám tổng quát",
        },
      },
    );
    expect(res.status).toBe(201);
    const body = (await res.json()) as { id: string; status: string };
    expect(body.id).toBe("visit-1");
    expect(body.status).toBe("in_progress");
  });

  it("returns 422 for missing patient_id", async () => {
    const app = mountRoute("/api/visits", visitsRoutes);
    const res = await authedRequestWithDB(
      app,
      "POST",
      "/api/visits",
      new Map(),
      {
        body: {
          branch_id: "test-branch",
          clinician_id: "test-user",
        },
      },
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 when direct visit omits treatment personnel", async () => {
    const app = mountRoute("/api/visits", visitsRoutes);
    const res = await authedRequestWithDB(
      app,
      "POST",
      "/api/visits",
      new Map(),
      {
        body: {
          patient_id: "patient-1",
          branch_id: "test-branch",
          clinician_id: "test-user",
          chair_id: "chair-1",
        },
      },
    );
    expect(res.status).toBe(400);
  });

  it("returns 403 for user without write_visits permission", async () => {
    const app = mountRoute("/api/visits", visitsRoutes);
    // Receptionist has read_patients, write_payments, write_appointments — no write_visits
    const res = await authedRequestWithDB(
      app,
      "POST",
      "/api/visits",
      new Map(),
      {
        permissions: ["read_patients", "write_payments", "write_appointments"],
        body: {
          patient_id: "patient-1",
          branch_id: "test-branch",
          clinician_id: "test-user",
        },
      },
    );
    expect(res.status).toBe(403);
  });
});

describe("POST /api/visits/:id/findings", () => {
  it("returns 201 + finding for valid FDI tooth", async () => {
    const app = mountRoute("/api/visits", visitsRoutes);
    const findingRow = {
      id: "finding-1",
      tenant_id: "test-tenant",
      visit_id: "visit-1",
      tooth_number: 11,
      tooth_system: "FDI",
      condition: "caries",
      notes: null,
      created_at: "2026-01-01",
    };
    const res = await authedRequestWithDB(
      app,
      "POST",
      "/api/visits/visit-1/findings",
      new Map([
        ["FROM visits", [visitRow()]], // for the existence check
        ["FROM clinical_findings", [findingRow]],
      ]),
      {
        permissions: ["write_findings"],
        body: {
          tooth_number: 11,
          category: "tooth_hard_tissue",
          scope: "tooth",
          condition: "caries",
        },
      },
    );
    expect(res.status).toBe(201);
    const body = (await res.json()) as { tooth_number: number; condition: string };
    expect(body.tooth_number).toBe(11);
    expect(body.condition).toBe("caries");
  });

  it("returns 422 for invalid FDI tooth (99)", async () => {
    const app = mountRoute("/api/visits", visitsRoutes);
    const res = await authedRequestWithDB(
      app,
      "POST",
      "/api/visits/visit-1/findings",
      new Map(),
      {
        permissions: ["write_findings"],
        body: {
          tooth_number: 99, // invalid
          category: "tooth_hard_tissue",
          scope: "tooth",
          condition: "caries",
        },
      },
    );
    expect(res.status).toBe(400);
  });

  it("returns 404 when visit does not exist", async () => {
    const app = mountRoute("/api/visits", visitsRoutes);
    const res = await authedRequestWithDB(
      app,
      "POST",
      "/api/visits/ghost/findings",
      new Map(), // empty → visit not found
      {
        permissions: ["write_findings"],
        body: {
          tooth_number: 11,
          category: "tooth_hard_tissue",
          scope: "tooth",
          condition: "caries",
        },
      },
    );
    expect(res.status).toBe(404);
  });

  it("accepts primary teeth (51-85)", async () => {
    const app = mountRoute("/api/visits", visitsRoutes);
    const findingRow = {
      id: "f1",
      tenant_id: "test-tenant",
      visit_id: "visit-1",
      tooth_number: 55,
      tooth_system: "FDI",
      condition: "caries",
      notes: null,
      created_at: "2026-01-01",
    };
    const res = await authedRequestWithDB(
      app,
      "POST",
      "/api/visits/visit-1/findings",
      new Map([
        ["FROM visits", [visitRow()]],
        ["FROM clinical_findings", [findingRow]],
      ]),
      {
        permissions: ["write_findings"],
        body: {
          tooth_number: 55,
          category: "tooth_hard_tissue",
          scope: "tooth",
          condition: "caries",
        },
      },
    );
    expect(res.status).toBe(201);
  });

  it("accepts an occlusion finding for the full mouth", async () => {
    const app = mountRoute("/api/visits", visitsRoutes);
    const findingRow = {
      id: "occlusion-1", tenant_id: "test-tenant", visit_id: "visit-1", category: "occlusion_orthodontics",
      scope: "full_mouth", tooth_number: null, tooth_system: null, anatomical_site: null,
      condition: "deep_bite", notes: "Overjet 5 mm", created_at: "2026-01-01",
    };
    const res = await authedRequestWithDB(app, "POST", "/api/visits/visit-1/findings", new Map([
      ["FROM visits", [visitRow()]], ["FROM clinical_findings", [findingRow]],
    ]), {
      permissions: ["write_findings"],
      body: { tooth_number: null, category: "occlusion_orthodontics", scope: "full_mouth", condition: "deep_bite", measurements: { overjet_mm: 5 } },
    });
    expect(res.status).toBe(201);
    expect((await res.json() as { category: string }).category).toBe("occlusion_orthodontics");
  });

  it("rejects an oral soft-tissue finding without an anatomical site", async () => {
    const app = mountRoute("/api/visits", visitsRoutes);
    const res = await authedRequestWithDB(app, "POST", "/api/visits/visit-1/findings", new Map(), {
      permissions: ["write_findings"],
      body: { tooth_number: null, category: "oral_soft_tissue", scope: "region", condition: "ulcer" },
    });
    expect(res.status).toBe(400);
  });

  it("accepts calculus recorded by periodontal tooth surfaces", async () => {
    const app = mountRoute("/api/visits", visitsRoutes);
    const findingRow = { id: "periodontal-1", tenant_id: "test-tenant", visit_id: "visit-1", category: "periodontal", scope: "tooth", tooth_number: 36, tooth_system: "FDI", anatomical_site: "gum", condition: "calculus", notes: null, created_at: "2026-01-01" };
    const res = await authedRequestWithDB(app, "POST", "/api/visits/visit-1/findings", new Map([["FROM visits", [visitRow()]], ["FROM clinical_findings", [findingRow]]]), {
      permissions: ["write_findings"],
      body: { tooth_number: 36, category: "periodontal", scope: "tooth", anatomical_site: "gum", condition: "calculus", location_details: { periodontal_surfaces: ["buccal", "mesial"] } },
    });
    expect(res.status).toBe(201);
  });

  it("accepts periodontitis with six-point pocket measurements", async () => {
    const app = mountRoute("/api/visits", visitsRoutes);
    const findingRow = { id: "periodontal-2", tenant_id: "test-tenant", visit_id: "visit-1", category: "periodontal", scope: "tooth", tooth_number: 36, tooth_system: "FDI", anatomical_site: "gum", condition: "periodontitis", notes: null, created_at: "2026-01-01" };
    const res = await authedRequestWithDB(app, "POST", "/api/visits/visit-1/findings", new Map([["FROM visits", [visitRow()]], ["FROM clinical_findings", [findingRow]]]), {
      permissions: ["write_findings"],
      body: { tooth_number: 36, category: "periodontal", scope: "tooth", anatomical_site: "gum", condition: "periodontitis", measurements: { periodontal_pocket_depth_mm: { mesiobuccal: 4, mesiolingual: 5 } } },
    });
    expect(res.status).toBe(201);
  });

  it("rejects periodontitis without pocket depth", async () => {
    const app = mountRoute("/api/visits", visitsRoutes);
    const res = await authedRequestWithDB(app, "POST", "/api/visits/visit-1/findings", new Map(), {
      permissions: ["write_findings"],
      body: { tooth_number: 36, category: "periodontal", scope: "tooth", anatomical_site: "gum", condition: "periodontitis" },
    });
    expect(res.status).toBe(400);
  });

  it("accepts side-specific submandibular gland finding", async () => {
    const app = mountRoute("/api/visits", visitsRoutes);
    const findingRow = { id: "salivary-1", tenant_id: "test-tenant", visit_id: "visit-1", category: "oral_soft_tissue", scope: "region", tooth_number: null, tooth_system: null, anatomical_site: "submandibular_gland", condition: "swelling", notes: null, created_at: "2026-01-01" };
    const res = await authedRequestWithDB(app, "POST", "/api/visits/visit-1/findings", new Map([["FROM visits", [visitRow()]], ["FROM clinical_findings", [findingRow]]]), {
      permissions: ["write_findings"],
      body: { tooth_number: null, category: "oral_soft_tissue", scope: "region", anatomical_site: "submandibular_gland", condition: "swelling", location_details: { laterality: "left" } },
    });
    expect(res.status).toBe(201);
  });
});

describe("PATCH /api/visits/:id", () => {
  it("returns 200 + updated visit when status changes", async () => {
    const app = mountRoute("/api/visits", visitsRoutes);
    const updated = visitRow({ status: "completed" });
    const res = await authedRequestWithDB(
      app,
      "PATCH",
      "/api/visits/visit-1",
      new Map<string, unknown[]>([
        // First read validates the current lifecycle state; second read is after UPDATE.
        ["FROM visits", (sql, index) => index === 0 ? [visitRow()] : [updated]],
      ]),
      {
        body: { status: "completed", notes: "Done" },
      },
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string };
    expect(body.status).toBe("completed");
  });

  it("rejects completing a visit that is already completed", async () => {
    const app = mountRoute("/api/visits", visitsRoutes);
    const res = await authedRequestWithDB(
      app,
      "PATCH",
      "/api/visits/visit-1",
      new Map([["FROM visits", [visitRow({ status: "completed" })]]]),
      { body: { status: "completed" } },
    );

    expect(res.status).toBe(409);
  });

  it("returns 422 for invalid status value", async () => {
    const app = mountRoute("/api/visits", visitsRoutes);
    const res = await authedRequestWithDB(
      app,
      "PATCH",
      "/api/visits/visit-1",
      new Map(),
      {
        body: { status: "invalid-status" },
      },
    );
    expect(res.status).toBe(400);
  });
});
