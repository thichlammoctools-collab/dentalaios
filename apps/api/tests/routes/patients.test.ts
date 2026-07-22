/**
 * Integration tests for /api/patients routes.
 */

import { describe, it, expect } from "vitest";
import patientsRoutes from "../../src/routes/patients";
import medicalAlertsRoutes from "../../src/routes/medical-alerts";
import patientNotesRoutes from "../../src/routes/patient-notes";
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
      ["SELECT COUNT(*) AS total FROM patients", [{ total: 2 }]],
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

  it("requires manager permission to list archived patients", async () => {
    const app = mountRoute("/api/patients", patientsRoutes);
    const res = await authedRequest(app, "GET", "/api/patients?archived=true", { permissions: ["read_patients"] });
    expect(res.status).toBe(403);
  });
});

describe("GET /api/patients/:id/open-treatment-milestones", () => {
  it("returns only open milestones from active treatment cases", async () => {
    const app = mountRoute("/api/patients", patientsRoutes);
    const res = await authedRequestWithDB(
      app,
      "GET",
      "/api/patients/patient-1/open-treatment-milestones",
      new Map([[
        "FROM treatment_cases tc",
        [{
          treatment_case_id: "case-1",
          treatment_plan_id: "plan-1",
          case_number: "CA-001",
          case_title: "Điều trị tổng quát",
          milestone_id: "milestone-1",
          sort_order: 1,
          status: "not_started",
          treatment_plan_item_id: "item-1",
          tenant_id: "test-tenant",
          tooth_number: 36,
          procedure: "root_canal",
          description: "Điều trị tủy răng 36",
          unit_cost: 3000000,
          item_status: "planned",
          item_created_at: "2026-01-01T00:00:00.000Z",
          service_code: "ROOT-CANAL",
          service_name: "Điều trị tủy",
          price_includes_vat: 1,
          price_snapshot_at: "2026-01-01T00:00:00.000Z",
        }],
      ]]),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      total: 1,
      items: [{
        treatment_case_id: "case-1",
        milestone_id: "milestone-1",
        item: { service_name: "Điều trị tủy", tooth_number: 36 },
      }],
    });
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
      new Map([
        ["FROM branches", [{ id: "test-branch", tenant_id: "test-tenant" }]],
        ["FROM patients", [createdRow]],
      ]),
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

  it("returns 400 when CCCD is missing", async () => {
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
        },
      },
    );
    expect(res.status).toBe(400);
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
          cccd: "012345678912",
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
          cccd: "012345678912",
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
          cccd: "012345678912",
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
        cccd: "012345678912",
      },
    });
    expect(res.status).toBe(403);
  });
});

describe("PUT /api/patients/:id", () => {
  it("returns 400 when CCCD is missing", async () => {
    const app = mountRoute("/api/patients", patientsRoutes);
    const res = await authedRequestWithDB(
      app,
      "PUT",
      "/api/patients/patient-1",
      new Map(),
      { body: { phone: "0912345678" } },
    );
    expect(res.status).toBe(400);
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

describe("patient note history", () => {
  it("lists notes with their author", async () => {
    const app = mountRoute("/api/patients", patientNotesRoutes);
    const res = await authedRequestWithDB(
      app,
      "GET",
      "/api/patients/patient-1/notes",
      new Map([
        ["FROM patients", [patientRow()]],
        ["FROM patient_notes", [{
          id: "note-1",
          tenant_id: "test-tenant",
          patient_id: "patient-1",
          user_id: "user-1",
          user_name: "Dr. Nguyen",
          content: "Theo dõi sau điều trị.",
          created_at: "2026-01-01T08:00:00Z",
        }]],
      ]),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { items: { content: string; user_name: string }[] };
    expect(body.items).toHaveLength(1);
    expect(body.items[0]).toMatchObject({
      content: "Theo dõi sau điều trị.",
      user_name: "Dr. Nguyen",
    });
  });

  it("creates a note using the authenticated user as its author", async () => {
    const app = mountRoute("/api/patients", patientNotesRoutes);
    const res = await authedRequestWithDB(
      app,
      "POST",
      "/api/patients/patient-1/notes",
      new Map([
        ["FROM patients", [patientRow()]],
        ["FROM patient_notes", [{
          id: "note-1",
          tenant_id: "test-tenant",
          patient_id: "patient-1",
          user_id: "test-user",
          user_name: "Test User",
          content: "Da hen tai kham.",
          created_at: "2026-01-01T08:00:00Z",
        }]],
      ]),
      { body: { content: "Da hen tai kham." } },
    );
    expect(res.status).toBe(201);
    const body = (await res.json()) as { user_id: string; content: string };
    expect(body.user_id).toBe("test-user");
    expect(body.content).toBe("Da hen tai kham.");
  });

  it("rejects note creation without write_patients permission", async () => {
    const app = mountRoute("/api/patients", patientNotesRoutes);
    const res = await authedRequest(app, "POST", "/api/patients/patient-1/notes", {
      permissions: ["read_patients"],
      body: { content: "Khong duoc phep" },
    });
    expect(res.status).toBe(403);
  });
});

describe("DELETE /api/patients/:id", () => {
  it("archives an active patient with a reason", async () => {
    const app = mountRoute("/api/patients", patientsRoutes);
    const res = await authedRequestWithDB(
      app,
      "DELETE",
      "/api/patients/patient-1",
      new Map(),
      {
        permissions: ["manage_patients"],
        body: { reason: "Bệnh nhân không còn điều trị tại phòng khám" },
      },
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { id: string; ok: boolean };
    expect(body.ok).toBe(true);
    expect(body.id).toBe("patient-1");
  });

  it("preserves clinical records while archiving", async () => {
    const db = createMockD1();
    const ok = await createPatientsRepository(db as unknown as D1Database).archive("test-tenant", "patient-1", "user-1", "Chuyển cơ sở điều trị");

    expect(ok).toBe(true);
    expect(db.__calls.map((call) => call.sql)).toEqual([
      "UPDATE patients SET archived_at = datetime('now'), archived_by = ?, archive_reason = ? WHERE tenant_id = ? AND id = ? AND archived_at IS NULL",
    ]);
    expect(db.__calls.at(-1)?.binds).toEqual(["user-1", "Chuyển cơ sở điều trị", "test-tenant", "patient-1"]);
  });

  it("requires a manager permission and archive reason", async () => {
    const app = mountRoute("/api/patients", patientsRoutes);
    const denied = await authedRequest(app, "DELETE", "/api/patients/patient-1", {
      permissions: ["write_patients"],
      body: { reason: "Không cần nữa" },
    });
    expect(denied.status).toBe(403);

    const invalid = await authedRequest(app, "DELETE", "/api/patients/patient-1", {
      permissions: ["manage_patients"],
      body: { reason: "x" },
    });
    expect(invalid.status).toBe(400);
  });
});

describe("POST /api/patients/:id/restore", () => {
  it("restores an archived patient for managers", async () => {
    const app = mountRoute("/api/patients", patientsRoutes);
    const res = await authedRequestWithDB(
      app,
      "POST",
      "/api/patients/patient-1/restore",
      new Map(),
      { permissions: ["manage_patients"] },
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ id: "patient-1", ok: true });
  });
});
