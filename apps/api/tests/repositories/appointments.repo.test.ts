import { describe, expect, it } from "vitest";
import { createAppointmentsRepository } from "../../src/repositories/appointments.repo";
import { createMockD1 } from "../helpers/mock-db";

describe("appointments repository", () => {
  it("writes null when removing an appointment assistant", async () => {
    const db = createMockD1();

    await createAppointmentsRepository(db as any).update("tenant-1", "appointment-1", {
      assistant_id: null,
    });

    const update = db.__calls.find((call) => call.method === "run" && call.sql.startsWith("UPDATE appointments"));
    expect(update?.sql).toContain("assistant_id = ?");
    expect(update?.binds).toEqual([null, "tenant-1", "appointment-1"]);
  });

  it("reserves five preparation minutes before and after chair appointments", async () => {
    const db = createMockD1();

    await createAppointmentsRepository(db as any).findChairConflicts(
      "tenant-1", "chair-1", "2099-07-15T08:00:00.000Z", "2099-07-15T08:30:00.000Z",
    );

    const query = db.__sqlContaining("chair_id = ?")[0];
    expect(query.sql).toContain("datetime(?, '+' || ? || ' minutes')");
    expect(query.sql).toContain("duration_min + ?");
    expect(query.binds).toEqual(expect.arrayContaining([5]));
  });

  it("uses patient overlap prevention in the atomic insert", async () => {
    const db = createMockD1({
      rowsByFragment: new Map([["WHERE tenant_id = ? AND id = ?", [{
        id: "appointment-1", tenant_id: "tenant-1", branch_id: "branch-1", clinician_id: "doctor-1", patient_id: "patient-1",
        assistant_id: null, chair_id: null, source_visit_id: null, scheduled_at: "2099-07-15T08:00:00.000Z", duration_min: 30,
        status: "booked", procedure: null, notes: null, source: "manual", lark_event_id: null, reminder_sent_at: null,
        reminder_method: null, cancelled_reason: null, created_by: "user-1", created_at: "2099-07-15T00:00:00.000Z", updated_at: "2099-07-15T00:00:00.000Z",
      }]]]),
    });
    await createAppointmentsRepository(db as any).create("tenant-1", {
      branch_id: "branch-1", clinician_id: "doctor-1", patient_id: "patient-1",
      scheduled_at: "2099-07-15T08:00:00.000Z", duration_min: 30, status: "booked",
      source: "manual", created_by: "user-1",
    });

    const insert = db.__calls.find((call) => call.method === "run" && call.sql.startsWith("INSERT INTO appointments"));
    expect(insert?.sql).toContain("patient_id = ?");
    expect(insert?.binds).toEqual(expect.arrayContaining(["patient-1"]));
  });

  it("checks patient conflicts across all branches in the tenant", async () => {
    const db = createMockD1();

    await createAppointmentsRepository(db as any).findPatientConflicts(
      "tenant-1", "patient-1", "2099-07-15T08:00:00.000Z", "2099-07-15T08:30:00.000Z",
    );

    const query = db.__sqlContaining("patient_id = ?")[0];
    expect(query.sql).toContain("tenant_id = ?");
    expect(query.sql).not.toContain("branch_id = ?");
  });
});
