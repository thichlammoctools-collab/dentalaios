import { describe, expect, it } from "vitest";
import clinicRoutes from "../../src/routes/clinic";
import { authedRequestWithDB, mountRoute } from "../helpers/api";

const branch = {
  id: "branch-2",
  tenant_id: "test-tenant",
  name: "Chi nhánh 2",
  address: "",
  created_at: "2026-07-20T00:00:00.000Z",
};

describe("clinic branch deletion", () => {
  it("prevents deletion of the current branch", async () => {
    const app = mountRoute("/api/clinic", clinicRoutes);
    const res = await authedRequestWithDB(
      app,
      "DELETE",
      "/api/clinic/branches/test-branch",
      new Map([["FROM branches WHERE tenant_id = ? AND id = ?", [{ ...branch, id: "test-branch" }]]]),
      { permissions: ["manage_users"] },
    );

    expect(res.status).toBe(409);
    expect((await res.json() as { error: string }).error).toContain("chi nhánh hiện tại");
  });

  it("prevents deletion of the tenant's last branch", async () => {
    const app = mountRoute("/api/clinic", clinicRoutes);
    const res = await authedRequestWithDB(
      app,
      "DELETE",
      "/api/clinic/branches/branch-2",
      new Map([
        ["FROM branches WHERE tenant_id = ? AND id = ?", [branch]],
        ["FROM branches WHERE tenant_id = ? ORDER BY", [branch]],
      ]),
      { permissions: ["manage_users"] },
    );

    expect(res.status).toBe(409);
    expect((await res.json() as { error: string }).error).toContain("ít nhất một chi nhánh");
  });

  it("prevents deletion when the branch still has related records", async () => {
    const app = mountRoute("/api/clinic", clinicRoutes);
    const res = await authedRequestWithDB(
      app,
      "DELETE",
      "/api/clinic/branches/branch-2",
      new Map([
        ["FROM branches WHERE tenant_id = ? AND id = ?", [branch]],
        ["FROM branches WHERE tenant_id = ? ORDER BY", [branch, { ...branch, id: "branch-3" }]],
        ["AS has_users", [{ has_users: 1, has_patients: 0, has_visits: 0, has_appointments: 0, has_clinic_schedules: 0, has_doctor_schedules: 0, has_chairs: 0, has_rooms: 0, has_treatment_cases: 0 }]],
      ]),
      { permissions: ["manage_users"] },
    );

    expect(res.status).toBe(409);
    expect((await res.json() as { error: string }).error).toContain("người dùng");
  });

  it("deletes an empty non-current branch", async () => {
    const app = mountRoute("/api/clinic", clinicRoutes);
    const res = await authedRequestWithDB(
      app,
      "DELETE",
      "/api/clinic/branches/branch-2",
      new Map([
        ["FROM branches WHERE tenant_id = ? AND id = ?", [branch]],
        ["FROM branches WHERE tenant_id = ? ORDER BY", [branch, { ...branch, id: "branch-3" }]],
        ["AS has_users", [{ has_users: 0, has_patients: 0, has_visits: 0, has_appointments: 0, has_clinic_schedules: 0, has_doctor_schedules: 0, has_chairs: 0, has_rooms: 0, has_treatment_cases: 0 }]],
      ]),
      { permissions: ["manage_users"] },
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });
});
