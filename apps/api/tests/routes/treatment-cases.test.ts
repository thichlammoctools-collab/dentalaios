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

const planItem = {
  id: "plan-item-1",
  tenant_id: "test-tenant",
  treatment_plan_id: "plan-1",
  tooth_number: 36,
  procedure: "root_canal",
  description: "Điều trị tủy răng 36",
  unit_cost: 3000000,
  status: "planned",
  created_at: "2026-07-20T08:00:00.000Z",
};

const milestone = {
  ...planItem,
  id: "milestone-1",
  tenant_id: "test-tenant",
  treatment_case_id: "case-1",
  treatment_plan_item_id: "plan-item-1",
  sort_order: 1,
  status: "not_started",
  planned_at: "2026-07-20T08:00:00.000Z",
  updated_by: "test-user",
  created_at: "2026-07-20T08:00:00.000Z",
  updated_at: "2026-07-20T08:00:00.000Z",
  item_status: "planned",
};

const appointment = {
  id: "appointment-1",
  tenant_id: "test-tenant",
  branch_id: "test-branch",
  clinician_id: "test-user",
  patient_id: "patient-1",
  scheduled_at: "2099-07-22T09:00:00.000Z",
  duration_min: 30,
  status: "confirmed",
  source: "manual",
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
        ["FROM treatment_plan_items", [planItem]],
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

  it("does not complete a case with unfinished plan milestones", async () => {
    const app = mountRoute("/api/treatment-plans", treatmentPlansRoutes);
    const res = await authedRequestWithDB(
      app,
      "POST",
      "/api/treatment-plans/plan-1/case/complete",
      new Map([
        ["FROM treatment_cases", [activeCase]],
        ["FROM treatment_case_milestones", [milestone]],
      ]),
      { permissions: ["approve_plans"], body: {} },
    );
    expect(res.status).toBe(422);
  });

  it("updates a milestone linked to an approved plan item", async () => {
    const app = mountRoute("/api/treatment-plans", treatmentPlansRoutes);
    const updated = { ...milestone, status: "in_progress", started_at: "2026-07-20T09:00:00.000Z" };
    const res = await authedRequestWithDB(
      app,
      "PATCH",
      "/api/treatment-plans/plan-1/case/milestones/milestone-1",
      new Map([
        ["FROM treatment_cases", [activeCase]],
        ["AND m.id = ? LIMIT 1", (sql, index) => index === 0 ? [milestone] : [updated]],
      ]),
      { permissions: ["approve_plans"], body: { status: "in_progress" } },
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ id: "milestone-1", status: "in_progress" });
  });

  it("rejects linking an appointment for another patient", async () => {
    const app = mountRoute("/api/treatment-plans", treatmentPlansRoutes);
    const res = await authedRequestWithDB(
      app,
      "POST",
      "/api/treatment-plans/plan-1/case/milestones/milestone-1/link-appointment",
      new Map([
        ["FROM treatment_cases", [activeCase]],
        ["AND m.id = ? LIMIT 1", [milestone]],
        ["SELECT * FROM appointments", [{ ...appointment, patient_id: "other-patient" }]],
      ]),
      { permissions: ["write_appointments"], body: { appointment_id: "appointment-1" } },
    );
    expect(res.status).toBe(422);
  });

  it("accepts multiple milestone IDs when creating one appointment", async () => {
    const app = mountRoute("/api/treatment-plans", treatmentPlansRoutes);
    const secondMilestone = {
      ...milestone,
      id: "milestone-2",
      treatment_plan_item_id: "plan-item-2",
      description: "Trám răng 37",
    };
    const res = await authedRequestWithDB(
      app,
      "POST",
      "/api/treatment-plans/plan-1/case/milestones/milestone-1/appointments",
      new Map([
        ["FROM treatment_cases", [activeCase]],
        ["AND m.id = ? LIMIT 1", [milestone, milestone, secondMilestone]],
        ["FROM appointments WHERE", [appointment]],
        ["FROM dental_chairs", []],
        ["FROM users", [{ id: "test-user", tenant_id: "test-tenant" }]],
        ["FROM patients", [{ id: "patient-1", tenant_id: "test-tenant" }]],
        ["FROM branches", [{ id: "test-branch", tenant_id: "test-tenant" }]],
      ]),
      {
        permissions: ["write_appointments"],
        body: {
          milestone_ids: ["milestone-1", "milestone-2"],
          clinician_id: "test-user",
          scheduled_at: "2099-07-22T09:00:00.000Z",
          duration_min: 60,
        },
      },
    );
    if (res.status !== 201) throw new Error(await res.text());
  });

  it("summarizes confirmed, pending, and failed payments for a case plan", async () => {
    const app = mountRoute("/api/treatment-plans", treatmentPlansRoutes);
    const res = await authedRequestWithDB(
      app,
      "GET",
      "/api/treatment-plans/plan-1/case/financial-summary",
      new Map([
        ["FROM treatment_plans", [approvedPlan]],
        ["FROM payments", [
          { id: "payment-1", tenant_id: "test-tenant", treatment_plan_id: "plan-1", patient_id: "patient-1", amount: 10000000, currency: "VND", method: "cash", status: "confirmed", code: "TT-1", created_at: "2026-07-20" },
          { id: "payment-2", tenant_id: "test-tenant", treatment_plan_id: "plan-1", patient_id: "patient-1", amount: 2000000, currency: "VND", method: "cash", status: "pending", code: "TT-2", created_at: "2026-07-20" },
          { id: "payment-3", tenant_id: "test-tenant", treatment_plan_id: "plan-1", patient_id: "patient-1", amount: 1000000, currency: "VND", method: "cash", status: "failed", code: "TT-3", created_at: "2026-07-20" },
        ]],
      ]),
      { permissions: ["read_patients"] },
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      plan_total: 30000000,
      confirmed_paid: 10000000,
      pending_amount: 2000000,
      failed_amount: 1000000,
      outstanding_amount: 20000000,
    });
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
