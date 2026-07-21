/**
 * Integration tests for /api/appointments routes.
 *
 * The active service is `appointmentsService` (from appointments.service.ts).
 * It performs CRUD, time validation, conflict detection, and Lark Calendar sync.
 *
 * Tests cover:
 *   - GET list (with branch filter, status filter)
 *   - POST create (happy path + 403 permission + 400 validation)
 *   - GET slots (busy slots for a doctor)
 *   - PATCH update (status change)
 *   - DELETE cancel
 */

import { describe, it, expect } from "vitest";
import appointmentsRoutes from "../../src/routes/appointments";
import { mountRoute, authedRequestWithDB } from "../helpers/api";

const appointmentRow = (overrides: Record<string, unknown> = {}) => ({
  id: "appt-1",
  tenant_id: "test-tenant",
  branch_id: "test-branch",
  clinician_id: "doc-1",
  patient_id: "patient-1",
  chair_id: null,
  source_visit_id: null,
  scheduled_at: "2099-07-15T08:00:00.000Z",
  duration_min: 30,
  status: "booked",
  procedure: "scaling",
  notes: null,
  source: "manual",
  lark_event_id: null,
  reminder_sent_at: null,
  reminder_method: null,
  cancelled_reason: null,
  created_by: "test-user",
  created_at: "2026-07-10T00:00:00Z",
  updated_at: "2026-07-10T00:00:00Z",
  ...overrides,
});

describe("GET /api/appointments", () => {
  it("returns list", async () => {
    const app = mountRoute("/api/appointments", appointmentsRoutes);
    const res = await authedRequestWithDB(
      app,
      "GET",
      "/api/appointments",
      new Map([["FROM appointments", [appointmentRow(), appointmentRow({ id: "appt-2" })]]]),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { items: { id: string }[]; total: number };
    expect(body.items).toHaveLength(2);
    expect(body.total).toBe(2);
  });

  it("filters by status query param", async () => {
    const app = mountRoute("/api/appointments", appointmentsRoutes);
    const res = await authedRequestWithDB(
      app,
      "GET",
      "/api/appointments?status=confirmed",
      new Map([["FROM appointments", [appointmentRow({ status: "confirmed" })]]]),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { items: { status: string }[] };
    expect(body.items[0].status).toBe("confirmed");
  });
});

describe("POST /api/appointments", () => {
  it("returns 201 + appointment for valid input (no conflict)", async () => {
    const app = mountRoute("/api/appointments", appointmentsRoutes);
    const res = await authedRequestWithDB(
      app,
      "POST",
      "/api/appointments",
      new Map<string, unknown[]>([
        ["FROM branches", [{ id: "test-branch", tenant_id: "test-tenant" }]],
        ["FROM patients", [{ id: "patient-1", tenant_id: "test-tenant" }]],
        ["FROM users", [{ id: "doc-1", tenant_id: "test-tenant" }]],
        // Conflict check (findConflicts) returns empty → no overlap
        // Post-insert getById returns the created row
        ["FROM appointments", (_sql: string, idx: number) =>
          idx === 0 ? [] : [appointmentRow()]
        ],
      ]),
      {
        permissions: ["write_appointments"],
        body: {
          patient_id: "patient-1",
          clinician_id: "doc-1",
          scheduled_at: "2099-07-15T08:00:00.000Z",
          duration_min: 30,
        },
      },
    );
    expect(res.status).toBe(201);
    const body = (await res.json()) as { id: string; status: string };
    expect(body.id).toBe("appt-1");
    expect(body.status).toBe("booked");
  });

  it("returns 403 for user without write_appointments permission", async () => {
    const app = mountRoute("/api/appointments", appointmentsRoutes);
    const res = await authedRequestWithDB(
      app,
      "POST",
      "/api/appointments",
      new Map(),
      {
        permissions: ["read_patients"],
        body: {
          patient_id: "patient-1",
          clinician_id: "doc-1",
          scheduled_at: "2099-07-15T08:00:00.000Z",
        },
      },
    );
    expect(res.status).toBe(403);
  });

  it("returns 409 when an assigned chair has an overlapping appointment", async () => {
    const app = mountRoute("/api/appointments", appointmentsRoutes);
    const res = await authedRequestWithDB(
      app,
      "POST",
      "/api/appointments",
      new Map<string, unknown[]>([
        ["FROM branches", [{ id: "test-branch", tenant_id: "test-tenant" }]],
        ["FROM patients", [{ id: "patient-1", tenant_id: "test-tenant" }]],
        ["FROM users", [{ id: "doc-1", tenant_id: "test-tenant" }]],
        ["FROM dental_chairs", [{ id: "chair-1", tenant_id: "test-tenant", branch_id: "test-branch", is_active: 1, operational_status: "available" }]],
        ["FROM appointments", (_sql: string, index: number) => index === 0 ? [] : [appointmentRow({ chair_id: "chair-1" })]],
      ]),
      {
        permissions: ["write_appointments"],
        body: {
          patient_id: "patient-1",
          clinician_id: "doc-1",
          chair_id: "chair-1",
          scheduled_at: "2099-07-15T08:00:00.000Z",
          duration_min: 30,
        },
      },
    );
    expect(res.status).toBe(409);
    const body = await res.json() as { error: string };
    expect(body.error).toContain("Ghế nha");
  });

  it("returns 400 for missing required field", async () => {
    const app = mountRoute("/api/appointments", appointmentsRoutes);
    const res = await authedRequestWithDB(
      app,
      "POST",
      "/api/appointments",
      new Map(),
      {
        permissions: ["write_appointments"],
        body: { clinician_id: "doc-1" },
      },
    );
    expect(res.status).toBe(400);
  });

  it("rejects an appointment time in the past", async () => {
    const app = mountRoute("/api/appointments", appointmentsRoutes);
    const res = await authedRequestWithDB(
      app,
      "POST",
      "/api/appointments",
      new Map(),
      {
        permissions: ["write_appointments"],
        body: {
          patient_id: "patient-1",
          clinician_id: "doc-1",
          scheduled_at: "2020-01-01T08:00:00.000Z",
        },
      },
    );
    expect(res.status).toBe(422);
    expect((await res.json() as { error: string }).error).toContain("ít nhất 5 phút");
  });
});

describe("GET /api/appointments/slots", () => {
  it("returns busy slots for a doctor on a date", async () => {
    const app = mountRoute("/api/appointments", appointmentsRoutes);
    const res = await authedRequestWithDB(
      app,
      "GET",
      "/api/appointments/slots?doctor_id=doc-1&date=2026-07-15",
      new Map([["FROM appointments", [appointmentRow()]]]),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { items: { scheduled_at: string }[]; total: number };
    expect(body.items).toHaveLength(1);
    expect(body.items[0].scheduled_at).toBe("2099-07-15T08:00:00.000Z");
  });
});

describe("GET /api/appointments/:id", () => {
  it("returns appointment detail", async () => {
    const app = mountRoute("/api/appointments", appointmentsRoutes);
    const res = await authedRequestWithDB(
      app,
      "GET",
      "/api/appointments/appt-1",
      new Map([["FROM appointments", [appointmentRow()]]]),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { id: string };
    expect(body.id).toBe("appt-1");
  });

  it("returns 404 when not found", async () => {
    const app = mountRoute("/api/appointments", appointmentsRoutes);
    const res = await authedRequestWithDB(
      app,
      "GET",
      "/api/appointments/ghost",
      new Map(),
    );
    expect(res.status).toBe(404);
  });
});

describe("PATCH /api/appointments/:id", () => {
  it("updates status to confirmed", async () => {
    const app = mountRoute("/api/appointments", appointmentsRoutes);
    const res = await authedRequestWithDB(
      app,
      "PATCH",
      "/api/appointments/appt-1",
      new Map([
        // getById returns booked
        ["FROM appointments", [appointmentRow()]],
      ]),
      {
        permissions: ["write_appointments"],
        body: { status: "confirmed" },
      },
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { id: string };
    expect(body.id).toBe("appt-1");
  });

  it("rejects rescheduling an appointment to a past time", async () => {
    const app = mountRoute("/api/appointments", appointmentsRoutes);
    const res = await authedRequestWithDB(
      app,
      "PATCH",
      "/api/appointments/appt-1",
      new Map([[
        "FROM appointments",
        [appointmentRow()],
      ]]),
      {
        permissions: ["write_appointments"],
        body: { scheduled_at: "2020-01-01T08:00:00.000Z" },
      },
    );
    expect(res.status).toBe(422);
    expect((await res.json() as { error: string }).error).toContain("ít nhất 5 phút");
  });
});

describe("POST /api/appointments", () => {
  it("returns 409 when clinician has overlapping appointment (conflict detected)", async () => {
    const app = mountRoute("/api/appointments", appointmentsRoutes);
    const res = await authedRequestWithDB(
      app,
      "POST",
      "/api/appointments",
      new Map([
        ["FROM branches", [{ id: "test-branch", tenant_id: "test-tenant" }]],
        ["FROM patients", [{ id: "patient-2", tenant_id: "test-tenant" }]],
        ["FROM users", [{ id: "doc-1", tenant_id: "test-tenant" }]],
        // Conflict check returns existing overlapping appointment
        ["FROM appointments", (_sql: string, idx: number) =>
          idx === 0 ? [appointmentRow()] : []
        ],
      ]),
      {
        permissions: ["write_appointments"],
        body: {
          patient_id: "patient-2",
          clinician_id: "doc-1",
          scheduled_at: "2099-07-15T08:00:00.000Z",
          duration_min: 30,
        },
      },
    );
    expect(res.status).toBe(409);
    const body = (await res.json()) as { code: string; error: string };
    expect(body.code).toBe("conflict");
    expect(body.error).toContain("trùng");
  });
});

describe("DELETE /api/appointments/:id", () => {
  it("soft cancels appointment", async () => {
    const app = mountRoute("/api/appointments", appointmentsRoutes);
    const res = await authedRequestWithDB(
      app,
      "DELETE",
      "/api/appointments/appt-1",
      new Map([
        // getById → existing booked appointment
        ["FROM appointments", [appointmentRow()]],
      ]),
      {
        permissions: ["write_appointments"],
      },
    );
    expect(res.status).toBe(200);
  });

  it("returns 409 when rescheduling conflicts with another appointment", async () => {
    const app = mountRoute("/api/appointments", appointmentsRoutes);
    const res = await authedRequestWithDB(
      app,
      "PATCH",
      "/api/appointments/appt-1",
      new Map([
        // getAllForCheck + conflict check (first query = conflict, second = getById after update)
        ["FROM appointments", (_sql: string, idx: number) => {
          if (idx === 0) return [appointmentRow()]; // existing appointment (getById)
          if (idx === 1) return [appointmentRow({ id: "conflict-1" })]; // conflict check
          return [appointmentRow()]; // getById after update
        }],
      ]),
      {
        permissions: ["write_appointments"],
        body: {
          // Try to reschedule to a time that conflicts
          scheduled_at: "2099-07-15T08:30:00.000Z", // overlaps with existing 08:00-08:30
        },
      },
    );
    expect(res.status).toBe(409);
    const body = (await res.json()) as { code: string; error: string };
    expect(body.code).toBe("conflict");
  });

  it("returns 409 when changing doctor to one with existing conflict", async () => {
    const app = mountRoute("/api/appointments", appointmentsRoutes);
    const res = await authedRequestWithDB(
      app,
      "PATCH",
      "/api/appointments/appt-1",
      new Map([
        ["FROM users", [{ id: "new-doc", tenant_id: "test-tenant" }]],
        ["FROM appointments", (_sql: string, idx: number) => {
          if (idx === 0) return [appointmentRow()]; // existing
          if (idx === 1) return [appointmentRow({ clinician_id: "new-doc" })]; // conflict with new doctor
          return [appointmentRow({ clinician_id: "new-doc" })];
        }],
      ]),
      {
        permissions: ["write_appointments"],
        body: {
          clinician_id: "new-doc",
        },
      },
    );
    expect(res.status).toBe(409);
  });
});

describe("GET /api/appointments/slots", () => {
  it("excludes cancelled appointments from busy slots", async () => {
    const app = mountRoute("/api/appointments", appointmentsRoutes);
    const res = await authedRequestWithDB(
      app,
      "GET",
      "/api/appointments/slots?doctor_id=doc-1&date=2026-07-15",
      new Map([
        ["FROM appointments", [
          appointmentRow({ status: "confirmed" }),
          appointmentRow({ id: "appt-2", status: "cancelled" }),
        ]],
      ]),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { items: { scheduled_at: string }[]; total: number };
    // cancelled one should be excluded by getBusySlots filter
    expect(body.items).toHaveLength(1);
    expect(body.items[0].scheduled_at).toBe("2099-07-15T08:00:00.000Z");
  });
});
