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
});
