/**
 * Integration tests for /api/appointments routes.
 *
 * Covers:
 *   - GET list (with branch filter, status filter)
 *   - POST create (happy path, conflict detection, schedule validation)
 *   - GET slots (busy slots for a doctor)
 *   - PATCH update (status change, reschedule conflict)
 *   - DELETE cancel (soft delete)
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
  source_visit_id: null,
  scheduled_at: "2026-07-15T08:00:00.000Z",
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

const doctorScheduleRow = (overrides: Record<string, unknown> = {}) => ({
  id: "sched-1",
  tenant_id: "test-tenant",
  branch_id: "test-branch",
  doctor_id: "doc-1",
  weekday: 3, // Wednesday
  start_time: "08:00",
  end_time: "17:00",
  slot_minutes: 30,
  created_at: "2026-07-10T00:00:00Z",
  ...overrides,
});

const clinicScheduleRow = (overrides: Record<string, unknown> = {}) => ({
  id: "clinic-sched-1",
  tenant_id: "test-tenant",
  branch_id: "test-branch",
  weekday: 3,
  open_time: "08:00",
  close_time: "17:00",
  is_closed: 0,
  created_at: "2026-07-10T00:00:00Z",
  ...overrides,
});

describe("GET /api/appointments", () => {
  it("returns list filtered by current branch", async () => {
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
  it("returns 201 + appointment for valid input", async () => {
    const app = mountRoute("/api/appointments", appointmentsRoutes);
    const res = await authedRequestWithDB(
      app,
      "POST",
      "/api/appointments",
      new Map<string, unknown[]>([
        ["FROM doctor_schedules", [doctorScheduleRow()]],
        ["FROM clinic_schedules", [clinicScheduleRow()]],
        // conflict check (findConflicts query)
        ["status NOT IN ('cancelled', 'no_show')", []],
        // read back after insert
        ["FROM appointments", [appointmentRow()]],
      ]),
      {
        permissions: ["write_appointments"],
        body: {
          patient_id: "patient-1",
          clinician_id: "doc-1",
          scheduled_at: "2026-07-15T08:00:00.000Z",
          duration_min: 30,
        },
      },
    );
    expect(res.status).toBe(201);
    const body = (await res.json()) as { id: string; status: string };
    expect(body.id).toBe("appt-1");
    expect(body.status).toBe("booked");
  });

  it("returns 409 when doctor has overlapping appointment", async () => {
    const app = mountRoute("/api/appointments", appointmentsRoutes);
    const res = await authedRequestWithDB(
      app,
      "POST",
      "/api/appointments",
      new Map<string, unknown[]>([
        ["FROM doctor_schedules", [doctorScheduleRow()]],
        ["FROM clinic_schedules", [clinicScheduleRow()]],
        // existing appointment overlaps
        ["status NOT IN ('cancelled', 'no_show')", [appointmentRow()]],
      ]),
      {
        permissions: ["write_appointments"],
        body: {
          patient_id: "patient-2",
          clinician_id: "doc-1",
          scheduled_at: "2026-07-15T08:00:00.000Z",
          duration_min: 30,
        },
      },
    );
    expect(res.status).toBe(409);
    const body = (await res.json()) as { code: string; error: string };
    expect(body.code).toBe("conflict");
    expect(body.error).toContain("lịch hẹn");
  });

  it("returns 422 when doctor has no schedule for weekday", async () => {
    const app = mountRoute("/api/appointments", appointmentsRoutes);
    const res = await authedRequestWithDB(
      app,
      "POST",
      "/api/appointments",
      new Map<string, unknown[]>([
        // doctor_schedules is empty → no schedule for any weekday
        ["FROM doctor_schedules", []],
        ["FROM clinic_schedules", [clinicScheduleRow()]],
      ]),
      {
        permissions: ["write_appointments"],
        body: {
          patient_id: "patient-1",
          clinician_id: "doc-1",
          scheduled_at: "2026-07-15T08:00:00.000Z",
        },
      },
    );
    expect(res.status).toBe(422);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe("validation_error");
  });

  it("returns 422 when slot is outside clinic opening hours", async () => {
    const app = mountRoute("/api/appointments", appointmentsRoutes);
    const res = await authedRequestWithDB(
      app,
      "POST",
      "/api/appointments",
      new Map<string, unknown[]>([
        ["FROM doctor_schedules", [doctorScheduleRow({ start_time: "06:00", end_time: "20:00" })]],
        ["FROM clinic_schedules", [clinicScheduleRow({ open_time: "08:00", close_time: "17:00" })]],
      ]),
      {
        permissions: ["write_appointments"],
        body: {
          patient_id: "patient-1",
          clinician_id: "doc-1",
          scheduled_at: "2026-07-15T07:00:00.000Z", // 07:00 < open 08:00
        },
      },
    );
    expect(res.status).toBe(422);
  });

  it("returns 403 for user without write_appointments permission", async () => {
    const app = mountRoute("/api/appointments", appointmentsRoutes);
    const res = await authedRequestWithDB(
      app,
      "POST",
      "/api/appointments",
      new Map(),
      {
        permissions: ["read_patients"], // doctor who can read but not write
        body: {
          patient_id: "patient-1",
          clinician_id: "doc-1",
          scheduled_at: "2026-07-15T08:00:00.000Z",
        },
      },
    );
    expect(res.status).toBe(403);
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
        body: { clinician_id: "doc-1" }, // missing patient_id + scheduled_at
      },
    );
    expect(res.status).toBe(400);
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
    expect(body.items[0].scheduled_at).toBe("2026-07-15T08:00:00.000Z");
  });

  it("returns 400 for missing date param", async () => {
    const app = mountRoute("/api/appointments", appointmentsRoutes);
    const res = await authedRequestWithDB(
      app,
      "GET",
      "/api/appointments/slots?doctor_id=doc-1",
      new Map(),
    );
    expect(res.status).toBe(400);
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
      new Map(), // empty → not found
    );
    expect(res.status).toBe(404);
  });
});

describe("PATCH /api/appointments/:id", () => {
  it("updates status to confirmed", async () => {
    const app = mountRoute("/api/appointments", appointmentsRoutes);
    const updated = appointmentRow({ status: "confirmed" });
    const res = await authedRequestWithDB(
      app,
      "PATCH",
      "/api/appointments/appt-1",
      new Map([
        // initial getById → booked
        ["FROM appointments", [appointmentRow()]],
      ]),
      {
        permissions: ["write_appointments"],
        body: { status: "confirmed" },
      },
    );
    expect(res.status).toBe(200);
    // Second call to getById happens via service.update → returns updated row
    const body = (await res.json()) as { id: string };
    expect(body.id).toBe("appt-1");
  });

  it("returns 422 when cancelling without reason", async () => {
    const app = mountRoute("/api/appointments", appointmentsRoutes);
    const res = await authedRequestWithDB(
      app,
      "PATCH",
      "/api/appointments/appt-1",
      new Map([["FROM appointments", [appointmentRow()]]]),
      {
        permissions: ["write_appointments"],
        body: { status: "cancelled" }, // missing cancelled_reason
      },
    );
    expect(res.status).toBe(422);
  });

  it("returns 422 when updating completed appointment", async () => {
    const app = mountRoute("/api/appointments", appointmentsRoutes);
    const res = await authedRequestWithDB(
      app,
      "PATCH",
      "/api/appointments/appt-1",
      new Map([["FROM appointments", [appointmentRow({ status: "completed" })]]]),
      {
        permissions: ["write_appointments"],
        body: { status: "cancelled", cancelled_reason: "Test" },
      },
    );
    expect(res.status).toBe(422);
  });
});

describe("DELETE /api/appointments/:id", () => {
  it("soft cancels appointment", async () => {
    const app = mountRoute("/api/appointments", appointmentsRoutes);
    const cancelled = appointmentRow({ status: "cancelled", cancelled_reason: "Hủy bởi người dùng" });
    const res = await authedRequestWithDB(
      app,
      "DELETE",
      "/api/appointments/appt-1",
      new Map([
        ["FROM appointments", [appointmentRow()]],
        // second getById after update
      ]),
      {
        permissions: ["write_appointments"],
      },
    );
    expect(res.status).toBe(200);
  });
});