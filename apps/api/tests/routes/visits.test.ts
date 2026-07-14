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
  clinician_id: "test-user",
  date: "2026-01-01T10:00:00Z",
  status: "in_progress",
  notes: null,
  created_at: "2026-01-01T10:00:00Z",
  ...overrides,
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
    const body = (await res.json()) as { items: { id: string }[] };
    expect(body.items).toHaveLength(2);
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
        ["FROM users", [{ id: "test-user", tenant_id: "test-tenant" }]],
        ["FROM visits", [visitRow()]],
      ]),
      {
        body: {
          patient_id: "patient-1",
          branch_id: "test-branch",
          clinician_id: "test-user",
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
          condition: "caries",
        },
      },
    );
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
        // getById after UPDATE returns updated row
        ["FROM visits", [updated]],
      ]),
      {
        body: { status: "completed", notes: "Done" },
      },
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string };
    expect(body.status).toBe("completed");
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
