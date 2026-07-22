/**
 * Integration tests for AI appointment routes:
 *   POST /api/ai/parse-appointment-chat
 *   POST /api/ai/suggest-next-appointment
 *
 * The AI binding is a no-op in tests (no actual Cloudflare AI),
 * so all paths fall back to the rule-based implementations.
 */

import { describe, it, expect } from "vitest";
import aiRoutes from "../../src/routes/ai";
import { mountRoute, authedRequestWithDB } from "../helpers/api";

const patientRow = (overrides: Record<string, unknown> = {}) => ({
  id: "patient-1",
  tenant_id: "test-tenant",
  branch_id: "test-branch",
  name: "Nguyễn Văn An",
  date_of_birth: "1990-01-01",
  gender: "M",
  phone: "0901234567",
  email: null,
  notes: null,
  created_at: "2026-01-01",
  ...overrides,
});

const visitRow = (overrides: Record<string, unknown> = {}) => ({
  id: "visit-1",
  tenant_id: "test-tenant",
  patient_id: "patient-1",
  branch_id: "test-branch",
  clinician_id: "doc-1",
  date: "2026-07-15T10:00:00.000Z",
  status: "in_progress",
  notes: null,
  created_at: "2026-07-15",
  ...overrides,
});

const doctorRow = (overrides: Record<string, unknown> = {}) => ({
  id: "doc-1",
  tenant_id: "test-tenant",
  branch_id: "test-branch",
  role_id: "role-doctor",
  email: "nam@demo.clinic",
  name: "Trần Văn Nam",
  is_active: 1,
  created_at: "2026-01-01",
  ...overrides,
});

const findingRow = (overrides: Record<string, unknown> = {}) => ({
  id: "finding-1",
  tenant_id: "test-tenant",
  visit_id: "visit-1",
  tooth_number: 36,
  tooth_system: "FDI",
  scope: "tooth",
  condition: "caries",
  notes: null,
  created_at: "2026-07-15",
  ...overrides,
});

const planRow = (overrides: Record<string, unknown> = {}) => ({
  id: "plan-1",
  tenant_id: "test-tenant",
  visit_id: "visit-1",
  patient_id: "patient-1",
  status: "approved",
  total_cost: 1500000,
  currency: "VND",
  notes: null,
  approved_at: "2026-07-15",
  created_at: "2026-07-15",
  ...overrides,
});

const planItemRow = (overrides: Record<string, unknown> = {}) => ({
  id: "item-1",
  tenant_id: "test-tenant",
  treatment_plan_id: "plan-1",
  tooth_number: 36,
  procedure: "root_canal",
  description: "Điều trị tủy răng 36",
  unit_cost: 1500000,
  status: "in_progress",
  created_at: "2026-07-15",
  ...overrides,
});

const treatmentServiceRow = (overrides: Record<string, unknown> = {}) => ({
  id: "service-1",
  tenant_id: "test-tenant",
  code: "TRAM-01",
  name: "Trám composite",
  procedure: "filling",
  price: 725000,
  is_active: 1,
  created_at: "2026-01-01",
  updated_at: "2026-01-01",
  ...overrides,
});

describe("POST /api/ai/generate-plan", () => {
  it("uses the active tenant service catalog for fallback recommendations", async () => {
    const app = mountRoute("/api/ai", aiRoutes);
    const res = await authedRequestWithDB(
      app,
      "POST",
      "/api/ai/generate-plan",
      new Map([
        ["FROM visits", [visitRow()]],
        ["FROM clinical_findings", [findingRow({ condition: "caries" })]],
        ["FROM patients", [patientRow()]],
        ["FROM treatment_services", [treatmentServiceRow()]],
      ]),
      { body: { visit_id: "visit-1" } },
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      items: Array<{ service_code?: string; service_name?: string; procedure: string; cost: number }>;
      ai_model: string;
    };
    expect(body.ai_model).toBe("structured-fallback");
    expect(body.items[0]).toMatchObject({
      service_code: "TRAM-01",
      service_name: "Trám composite",
      procedure: "filling",
      cost: 725000,
    });
  });

  it("does not recommend inactive services", async () => {
    const app = mountRoute("/api/ai", aiRoutes);
    const res = await authedRequestWithDB(
      app,
      "POST",
      "/api/ai/generate-plan",
      new Map([
        ["FROM visits", [visitRow()]],
        ["FROM clinical_findings", [findingRow({ condition: "caries" })]],
        ["FROM patients", [patientRow()]],
        ["FROM treatment_services", [treatmentServiceRow({ is_active: 0 })]],
      ]),
      { body: { visit_id: "visit-1" } },
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as { items: Array<{ service_code?: string; procedure: string; cost: number }> };
    expect(body.items[0]).toMatchObject({ procedure: "filling", cost: 800000 });
    expect(body.items[0].service_code).toBeUndefined();
  });
});

describe("POST /api/ai/parse-appointment-chat", () => {
  it("returns 200 + parsed appointment from chat message", async () => {
    const app = mountRoute("/api/ai", aiRoutes);
    const res = await authedRequestWithDB(
      app,
      "POST",
      "/api/ai/parse-appointment-chat",
      new Map([
        ["FROM patients", [patientRow()]],
        ["FROM users", [doctorRow()]],
      ]),
      {
        permissions: ["write_appointments", "read_patients"],
        body: {
          message: "Cho BS Nam khám BN An ngày mai 9h30",
        },
      },
    );
    if (res.status !== 200) throw new Error(await res.text());
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      appointment: { duration_min: number; summary: string };
      ai_model: string;
    };
    expect(body.appointment).toMatchObject({
      patient_hint: "Nguyễn Văn An",
      clinician_hint: "Trần Văn Nam",
      duration_min: 30,
      procedure: "examination",
    });
    expect(body.appointment.scheduled_at).toMatch(/T09:30:00\+07:00$/);
    expect(body.ai_model).toMatch(/llama|rule-based/);
  });

  it("returns 403 without write_appointments permission", async () => {
    const app = mountRoute("/api/ai", aiRoutes);
    const res = await authedRequestWithDB(
      app,
      "POST",
      "/api/ai/parse-appointment-chat",
      new Map(),
      {
        permissions: ["read_patients"],
        body: { message: "Test message" },
      },
    );
    expect(res.status).toBe(403);
  });

  it("returns 400 for empty message", async () => {
    const app = mountRoute("/api/ai", aiRoutes);
    const res = await authedRequestWithDB(
      app,
      "POST",
      "/api/ai/parse-appointment-chat",
      new Map(),
      {
        permissions: ["write_appointments", "read_patients"],
        body: { message: "" },
      },
    );
    expect(res.status).toBe(400);
  });

  it("fallback detects root_canal procedure and 60min duration", async () => {
    const app = mountRoute("/api/ai", aiRoutes);
    const res = await authedRequestWithDB(
      app,
      "POST",
      "/api/ai/parse-appointment-chat",
      new Map([["FROM patients", []], ["FROM users", []]]),
      {
        permissions: ["write_appointments", "read_patients"],
        body: { message: "Cho BN An khám tủy răng 36" },
      },
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      appointment: { duration_min: number; procedure: string | null };
      ai_model: string;
    };
    expect(body.ai_model).toBe("rule-based-fallback");
    expect(body.appointment.duration_min).toBe(60);
    expect(body.appointment.procedure).toBe("root_canal");
  });

  it("fallback understands a future Vietnamese weekday", async () => {
    const app = mountRoute("/api/ai", aiRoutes);
    const res = await authedRequestWithDB(
      app,
      "POST",
      "/api/ai/parse-appointment-chat",
      new Map([["FROM patients", []], ["FROM users", []]]),
      {
        permissions: ["write_appointments", "read_patients"],
        body: { message: "Cạo vôi thứ 2 tuần sau lúc 14h" },
      },
    );
    const body = (await res.json()) as {
      appointment: { duration_min: number; procedure: string | null; scheduled_at: string | null };
    };
    expect(body.appointment).toMatchObject({ duration_min: 30, procedure: "scaling" });
    expect(body.appointment.scheduled_at).toMatch(/T14:00:00\+07:00$/);
  });
});

describe("POST /api/ai/suggest-next-appointment", () => {
  it("returns 200 + suggestion from visit with incomplete treatment", async () => {
    const app = mountRoute("/api/ai", aiRoutes);
    const res = await authedRequestWithDB(
      app,
      "POST",
      "/api/ai/suggest-next-appointment",
      new Map<string, unknown[]>([
        ["FROM visits", [visitRow()]],
        ["FROM clinical_findings", [findingRow()]],
        ["FROM treatment_plans", [planRow()]],
        ["FROM treatment_plan_items", [planItemRow({ status: "in_progress" })]],
        ["FROM patients", [patientRow()]],
        ["FROM users", [doctorRow()]],
      ]),
      {
        permissions: ["write_appointments", "read_patients"],
        body: { visit_id: "visit-1" },
      },
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      suggestion: {
        suggested_date: string;
        suggested_time: string;
        duration_min: number;
        procedure: string | null;
        reason: string;
      } | null;
      ai_model: string;
    };
    expect(body.suggestion).not.toBeNull();
    expect(body.suggestion!.suggested_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(body.suggestion!.suggested_time).toMatch(/^\d{2}:\d{2}$/);
    expect(body.suggestion!.procedure).toBe("root_canal");
    expect(body.suggestion!.duration_min).toBe(60);
  });

  it("returns 404 when visit does not exist", async () => {
    const app = mountRoute("/api/ai", aiRoutes);
    const res = await authedRequestWithDB(
      app,
      "POST",
      "/api/ai/suggest-next-appointment",
      new Map(),
      {
        permissions: ["write_appointments", "read_patients"],
        body: { visit_id: "ghost" },
      },
    );
    expect(res.status).toBe(404);
  });

  it("returns 403 without write_appointments permission", async () => {
    const app = mountRoute("/api/ai", aiRoutes);
    const res = await authedRequestWithDB(
      app,
      "POST",
      "/api/ai/suggest-next-appointment",
      new Map(),
      {
        permissions: ["read_patients"],
        body: { visit_id: "visit-1" },
      },
    );
    expect(res.status).toBe(403);
  });
});
