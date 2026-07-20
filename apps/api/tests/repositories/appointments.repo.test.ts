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
});
