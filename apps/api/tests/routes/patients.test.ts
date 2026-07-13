/**
 * Integration tests for /api/patients routes.
 */

import { describe, it, expect } from "vitest";
import patientsRoutes from "../../src/routes/patients";
import medicalAlertsRoutes from "../../src/routes/medical-alerts";
import { createPatientsRepository } from "../../src/repositories/patients.repo";
import { mountRoute, authedRequestWithDB, authedRequest } from "../helpers/api";
import { createMockD1 } from "../helpers/mock-db";

const patientRow = (overrides: Record<string, unknown> = {}) => ({
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
  cccd: null,
  ...overrides,
});

describe("GET /api/patients", () => {
  it("returns 200 with patient list for authenticated user", async () => {
    const rows = [patientRow({ name: "Patient A" }), patientRow({ id: "patient-2", name: "Patient B" })];
    const app = mountRoute("/api/patients", patientsRoutes);
    const res = await authedRequestWithDB(app, "GET", "/api/patients", new Map([
      ["FROM patients", rows],
    ]));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { items: unknown[]; total: number };
    expect(body.items).toHaveLength(2);
    expect(body.total).toBe(2);
  });

  it("returns empty list when no patients", async () => {
    const app = mountRoute("/api/patients", patientsRoutes);
    const res = await authedRequestWithDB(app, "GET", "/api/patients", new Map());
    expect(res.status).toBe(200);
    const body = (await res.json()) as { items: unknown[]; total: number };
    expect(body.items).toEqual([]);
  });

  it("returns 401 without auth", async () => {
    const app = mountRoute("/api/patients", patientsRoutes);
    // Build request without token manually
    const res = await app.request(
      "/api/patients",
      { method: "GET" },
      // minimal env
      { DB: undefined, FILES: {} as R2Bucket, JOBS: {} as Queue, ENVIRONMENT: "test", FRONTEND_ORIGIN: "", JWT_SECRET: "test", ENCRYPTION_KEY: undefined, LARK_APP_ID: undefined, LARK_APP_SECRET: undefined, R2_ACCOUNT_ID: undefined, R2_ACCESS_KEY_ID: undefined, R2_SECRET_ACCESS_KEY: undefined } as any,
    );
    expect(res.status).toBe(401);
  });

  it("returns 403 for user without read_patients permission", async () => {
    const app = mountRoute("/api/patients", patientsRoutes);
    // Token with NO read_patients
    const res = await authedRequest(app, "GET", "/api/patients", { permissions: ["write_payments"] });
    expect(res.status).toBe(403);
  });
});

describe("POST /api/patients", () => {
  it("returns 201 + patient for valid data", async () => {
    const app = mountRoute("/api/patients", patientsRoutes);
    const createdRow = patientRow({ name: "Test Patient", cccd: "012345678912" });
    const res = await authedRequestWithDB(
      app,
      "POST",
      "/api/patients",
      new Map([["FROM patients", [createdRow]]]),
      {
        body: {
          branch_id: "test-branch",
          name: "  Test Patient  ", // with whitespace — should be trimmed
          date_of_birth: "1990-01-01",
          gender: "M",
          phone: "0901234567",
          cccd: "012345678912",
        },
      },
    );
    expect(res.status).toBe(201);
    const body = (await res.json()) as { id: string; name: string; cccd?: string };
    expect(body.id).toBe("patient-1");
    expect(body.name).toBe("Test Patient");
    expect(body.cccd).toBe("012345678912");
  });

  it("returns 400 for missing required field", async () => {
    const app = mountRoute("/api/patients", patientsRoutes);
    const res = await authedRequestWithDB(
      app,
      "POST",
      "/api/patients",
      new Map(),
      {
        body: {
          // name missing
          branch_id: "test-branch",
          date_of_birth: "1990-01-01",
          gender: "M",
          phone: "0901234567",
        },
      },
    );
    expect(res.status).toBe(400);
    // zValidator returns { success: false, error: {...} }
    const body = (await res.json()) as { success: boolean };
    expect(body.success).toBe(false);
  });

  it("returns 422 for invalid date_of_birth (month 13)", async () => {
    const app = mountRoute("/api/patients", patientsRoutes);
    const res = await authedRequestWithDB(
      app,
      "POST",
      "/api/patients",
      new Map(),
      {
        body: {
          branch_id: "test-branch",
          name: "Test",
          date_of_birth: "1990-13-45",
          gender: "M",
          phone: "0901234567",
        },
      },
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 for CCCD that is not 12 digits", async () => {
    const app = mountRoute("/api/patients", patientsRoutes);
    const res = await authedRequestWithDB(
      app,
      "POST",
      "/api/patients",
      new Map(),
      {
        body: {
          branch_id: "test-branch",
          name: "Test",
          date_of_birth: "1990-01-01",
          gender: "M",
          phone: "0901234567",
          cccd: "0123456789",
        },
      },
    );
    expect(res.status).toBe(400);
  });

  it("returns 422 for whitespace-only name", async () => {
    const app = mountRoute("/api/patients", patientsRoutes);
    const res = await authedRequestWithDB(
      app,
      "POST",
      "/api/patients",
      new Map(),
      {
        body: {
          branch_id: "test-branch",
          name: "   ",
          date_of_birth: "1990-01-01",
          gender: "M",
          phone: "0901234567",
        },
      },
    );
    expect(res.status).toBe(400);
  });

  it("returns 403 for user without write_patients permission", async () => {
    const app = mountRoute("/api/patients", patientsRoutes);
    const res = await authedRequest(app, "POST", "/api/patients", {
      permissions: ["read_patients"], // no write
      body: {
        branch_id: "b",
        name: "Test",
        date_of_birth: "1990-01-01",
        gender: "M",
        phone: "0901234567",
      },
    });
    expect(res.status).toBe(403);
  });
});

describe("GET /api/patients/:id", () => {
  it("returns 200 + patient for matching id", async () => {
    const app = mountRoute("/api/patients", patientsRoutes);
    const res = await authedRequestWithDB(
      app,
      "GET",
      "/api/patients/patient-1",
      new Map([["FROM patients", [patientRow({ id: "patient-1" })]]]),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { id: string; name: string };
    expect(body.id).toBe("patient-1");
  });

  it("returns 404 for non-existent patient", async () => {
    const app = mountRoute("/api/patients", patientsRoutes);
    const res = await authedRequestWithDB(
      app,
      "GET",
      "/api/patients/ghost",
      new Map(),
    );
    expect(res.status).toBe(404);
  });
});

describe("GET /api/patients/:id/alerts", () => {
  it("returns list of medical alerts", async () => {
    const app = mountRoute("/api/patients", medicalAlertsRoutes);
    const res = await authedRequestWithDB(
      app,
      "GET",
      "/api/patients/patient-1/alerts",
      new Map([["FROM medical_alerts", [
        {
          id: "alert-1",
          tenant_id: "test-tenant",
          patient_id: "patient-1",
          type: "allergy",
          description: "penicillin",
          severity: "high",
          created_at: "2026-01-01",
        },
      ]]]),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { items: { description: string }[] };
    expect(body.items[0].description).toBe("penicillin");
  });

  it("returns empty list when no alerts", async () => {
    const app = mountRoute("/api/patients", medicalAlertsRoutes);
    const res = await authedRequestWithDB(
      app,
      "GET",
      "/api/patients/patient-1/alerts",
      new Map(),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { items: unknown[] };
    expect(body.items).toEqual([]);
  });
});

describe("DELETE /api/patients/:id", () => {
  it("returns 200 for successful delete", async () => {
    const app = mountRoute("/api/patients", patientsRoutes);
    const res = await authedRequestWithDB(
      app,
      "DELETE",
      "/api/patients/patient-1",
      new Map(),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean };
    expect(body.ok).toBe(true);
  });

  it("deletes clinical records before deleting the patient", async () => {
    const db = createMockD1();
    const ok = await createPatientsRepository(db as unknown as D1Database).delete("test-tenant", "patient-1");

    expect(ok).toBe(true);
    expect(db.__calls.map((call) => call.sql)).toEqual([
      "DELETE FROM appointments WHERE tenant_id = ? AND patient_id = ?",
      "DELETE FROM payments WHERE tenant_id = ? AND patient_id = ?",
      "DELETE FROM treatment_plan_items WHERE tenant_id = ? AND treatment_plan_id IN (SELECT id FROM treatment_plans WHERE tenant_id = ? AND patient_id = ?)",
      "DELETE FROM treatment_plans WHERE tenant_id = ? AND patient_id = ?",
      "DELETE FROM patient_images WHERE tenant_id = ? AND patient_id = ?",
      "DELETE FROM medical_alerts WHERE tenant_id = ? AND patient_id = ?",
      "DELETE FROM clinical_findings WHERE tenant_id = ? AND visit_id IN (SELECT id FROM visits WHERE tenant_id = ? AND patient_id = ?)",
      "DELETE FROM visits WHERE tenant_id = ? AND patient_id = ?",
      "DELETE FROM patients WHERE tenant_id = ? AND id = ?",
    ]);
    expect(db.__calls.at(-1)?.binds).toEqual(["test-tenant", "patient-1"]);
  });
});
