import { describe, expect, it } from "vitest";
import treatmentPlansRoutes from "../../src/routes/treatment-plans";
import { authedRequestWithDB, mountRoute } from "../helpers/api";

const approvedPlan = {
  id: "plan-1",
  tenant_id: "test-tenant",
  visit_id: "visit-1",
  patient_id: "patient-1",
  status: "approved",
  total_cost: 30000000,
  currency: "VND",
  notes: null,
  approved_at: "2026-07-20T08:00:00.000Z",
  created_at: "2026-07-20T08:00:00.000Z",
};

const activeCase = {
  id: "case-1",
  tenant_id: "test-tenant",
  treatment_plan_id: "plan-1",
  patient_id: "patient-1",
  case_number: "CA-20260720-0001",
  case_type: "implant",
  status: "active",
  primary_branch_id: "test-branch",
  primary_clinician_id: "test-user",
  title: "Ca Implant",
  activated_at: "2026-07-20T08:00:00.000Z",
  created_by: "test-user",
  created_at: "2026-07-20T08:00:00.000Z",
  updated_at: "2026-07-20T08:00:00.000Z",
};

describe("treatment case lifecycle", () => {
  it("activates an approved plan as an operational case", async () => {
    const app = mountRoute("/api/treatment-plans", treatmentPlansRoutes);
    const res = await authedRequestWithDB(
      app,
      "POST",
      "/api/treatment-plans/plan-1/case/activate",
      new Map([
        ["FROM treatment_plans", [approvedPlan]],
        ["FROM branches", [{ id: "test-branch", tenant_id: "test-tenant" }]],
        ["FROM users", [{ id: "test-user", tenant_id: "test-tenant" }]],
        ["INSERT INTO treatment_case_counters", [{ last_seq: 1 }]],
        ["FROM treatment_cases tc", (sql, index) => index === 0 ? [] : [activeCase]],
      ]),
      {
        permissions: ["approve_plans"],
        body: { case_type: "implant", title: "Ca Implant", target_completed_at: "2026-12-20" },
      },
    );

    expect(res.status).toBe(201);
    expect(await res.json()).toMatchObject({
      case_number: "CA-20260720-0001",
      case_type: "implant",
      status: "active",
    });
  });

  it("rejects activating a plan that has not been approved", async () => {
    const app = mountRoute("/api/treatment-plans", treatmentPlansRoutes);
    const res = await authedRequestWithDB(
      app,
      "POST",
      "/api/treatment-plans/plan-1/case/activate",
      new Map([["FROM treatment_plans", [{ ...approvedPlan, status: "draft" }]]]),
      { permissions: ["approve_plans"], body: { case_type: "implant" } },
    );

    expect(res.status).toBe(422);
  });

  it("requires a reason to pause an active case", async () => {
    const app = mountRoute("/api/treatment-plans", treatmentPlansRoutes);
    const res = await authedRequestWithDB(
      app,
      "POST",
      "/api/treatment-plans/plan-1/case/pause",
      new Map([["FROM treatment_cases", [activeCase]]]),
      { permissions: ["approve_plans"], body: {} },
    );

    expect(res.status).toBe(400);
  });

  it("does not permit transition from a completed case", async () => {
    const app = mountRoute("/api/treatment-plans", treatmentPlansRoutes);
    const res = await authedRequestWithDB(
      app,
      "POST",
      "/api/treatment-plans/plan-1/case/resume",
      new Map([["FROM treatment_cases", [{ ...activeCase, status: "completed" }]]]),
      { permissions: ["approve_plans"], body: {} },
    );

    expect(res.status).toBe(409);
  });

  it("returns null when an approved plan has no case yet", async () => {
    const app = mountRoute("/api/treatment-plans", treatmentPlansRoutes);
    const res = await authedRequestWithDB(
      app,
      "GET",
      "/api/treatment-plans/plan-1/case",
      new Map(),
      { permissions: ["read_patients"] },
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ case: null });
  });
});
