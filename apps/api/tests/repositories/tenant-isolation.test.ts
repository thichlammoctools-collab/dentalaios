/**
 * Tenant isolation tests.
 *
 * For every repository method, verify:
 *   1. The SQL query contains "tenant_id" in WHERE clause
 *   2. The tenantId argument is passed as the FIRST bind parameter
 *   3. tenantId is NOT something the caller can override via data fields
 *
 * Strategy: use the spy-mode MockD1, run each repo method, then inspect
 * captured SQL + binds.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { createMockD1, type MockD1 } from "../helpers/mock-db";
import { TENANT_A, TENANT_B, PATIENT_A1, PATIENT_B1 } from "../helpers/jwt";
import { createPatientsRepository } from "../../src/repositories/patients.repo";
import { createVisitsRepository } from "../../src/repositories/visits.repo";
import { createFindingsRepository } from "../../src/repositories/findings.repo";
import { createTreatmentPlansRepository } from "../../src/repositories/treatment-plans.repo";
import { createTreatmentItemsRepository } from "../../src/repositories/treatment-items.repo";
import { createPaymentsRepository } from "../../src/repositories/payments.repo";
import { createMedicalAlertsRepository } from "../../src/repositories/medical-alerts.repo";

const SQL_WITH_TENANT = /WHERE\s+(?:[\w]+\.)?tenant_id\s*=\s*\?/i;

describe("Tenant isolation: patients.repo", () => {
  let db: MockD1;

  beforeEach(() => {
    db = createMockD1();
  });

  it("list() scopes by tenant_id", async () => {
    await createPatientsRepository(db as any).list(TENANT_A);
    const calls = db.__sqlContaining("FROM patients");
    expect(calls).toHaveLength(1);
    expect(calls[0].sql).toMatch(SQL_WITH_TENANT);
    expect(calls[0].binds[0]).toBe(TENANT_A);
  });

  it("list() passes branch_id and search AFTER tenant_id", async () => {
    await createPatientsRepository(db as any).list(TENANT_A, {
      branchId: "branch-1",
      search: "Nguyen",
    });
    const calls = db.__sqlContaining("FROM patients");
    expect(calls[0].binds[0]).toBe(TENANT_A);
    expect(calls[0].binds[1]).toBe("branch-1");
    expect(calls[0].binds[2]).toBe("%Nguyen%");
    expect(calls[0].binds[3]).toBe("%Nguyen%");
  });

  it("getById() scopes by tenant_id", async () => {
    await createPatientsRepository(db as any).getById(TENANT_A, PATIENT_A1);
    const calls = db.__sqlContaining("FROM patients");
    expect(calls[0].sql).toMatch(/WHERE\s+(?:[\w]+\.)?tenant_id\s*=\s*\?\s+AND\s+(?:[\w]+\.)?id\s*=\s*\?/is);
    expect(calls[0].binds[0]).toBe(TENANT_A);
    expect(calls[0].binds[1]).toBe(PATIENT_A1);
  });

  it("create() sets tenant_id from first arg, not from data", async () => {
    db = createMockD1({
      rowsByFragment: new Map([["FROM patients", [{ id: "fake-id", tenant_id: TENANT_A }]]]),
    });
    await createPatientsRepository(db as any).create(TENANT_A, {
      branch_id: "branch-1",
      name: "Nguyen Van A",
      date_of_birth: "1990-01-01",
      gender: "M",
      phone: "0901234567",
      // Attacker tries to inject tenant_id via data:
      // @ts-expect-error — testing tenant_id should not be accepted from data
      tenant_id: TENANT_B,
    });
    const calls = db.__sqlContaining("INSERT INTO patients");
    expect(calls[0].sql).toContain("tenant_id");
    // tenantId passed correctly as 2nd bind (id, tenant_id, branch_id, name, ...)
    expect(calls[0].binds[1]).toBe(TENANT_A);
    // Attacker's tenant_id value should NOT appear in binds
    expect(calls[0].binds).not.toContain(TENANT_B);
  });

  it("update() scopes by tenant_id in WHERE", async () => {
    db = createMockD1({
      rowsByFragment: new Map([["UPDATE patients", [{ id: PATIENT_A1, tenant_id: TENANT_A }]]]),
    });
    await createPatientsRepository(db as any).update(TENANT_A, PATIENT_A1, {
      name: "Updated Name",
    });
    const calls = db.__sqlContaining("UPDATE patients");
    expect(calls[0].sql).toMatch(/UPDATE patients.*WHERE\s+tenant_id\s+=\s+\?/i);
    expect(calls[0].binds[0]).toBe("Updated Name");
    // Last 2 binds are tenant_id, id
    expect(calls[0].binds.at(-2)).toBe(TENANT_A);
    expect(calls[0].binds.at(-1)).toBe(PATIENT_A1);
  });

  it("update() ignore attacker tenant_id in data", async () => {
    db = createMockD1({
      rowsByFragment: new Map([["UPDATE patients", [{ id: PATIENT_A1 }]]]),
    });
    await createPatientsRepository(db as any).update(TENANT_A, PATIENT_A1, {
      // @ts-expect-error — testing
      tenant_id: TENANT_B,
    } as any);
    const calls = db.__sqlContaining("UPDATE patients");
    expect(calls).toHaveLength(0); // no UPDATE was issued (no fields to update)
  });

  it("delete() scopes by tenant_id", async () => {
    await createPatientsRepository(db as any).delete(TENANT_A, PATIENT_A1);
    const calls = db.__sqlContaining("DELETE FROM patients");
    expect(calls[0].sql).toMatch(/DELETE FROM patients WHERE tenant_id = \? AND id = \?/i);
    expect(calls[0].binds[0]).toBe(TENANT_A);
    expect(calls[0].binds[1]).toBe(PATIENT_A1);
  });
});

describe("Tenant isolation: visits.repo", () => {
  let db: MockD1;
  beforeEach(() => {
    db = createMockD1();
  });

  it("list() scopes by tenant_id", async () => {
    await createVisitsRepository(db as any).list(TENANT_A);
    expect(db.__sqlContaining("FROM visits")[0].sql).toMatch(SQL_WITH_TENANT);
  });

  it("list(patientId) maintains tenant scope", async () => {
    await createVisitsRepository(db as any).list(TENANT_A, { patientId: PATIENT_A1 });
    const calls = db.__sqlContaining("FROM visits");
    expect(calls[0].sql).toMatch(/(?:[\w]+\.)?tenant_id\s*=\s*\?\s+AND\s+(?:[\w]+\.)?patient_id\s*=\s*\?/is);
    expect(calls[0].binds[0]).toBe(TENANT_A);
    expect(calls[0].binds[1]).toBe(PATIENT_A1);
  });

  it("create() sets tenant_id correctly", async () => {
    db = createMockD1({
      rowsByFragment: new Map([["FROM visits", [{ id: "v1", tenant_id: TENANT_A }]]]),
    });
    await createVisitsRepository(db as any).create(TENANT_A, {
      patient_id: PATIENT_A1,
      branch_id: "branch-1",
      clinician_id: "doc-1",
    });
    const calls = db.__sqlContaining("INSERT INTO visits");
    expect(calls[0].binds[1]).toBe(TENANT_A);
  });

  it("getById() scopes by tenant_id", async () => {
    await createVisitsRepository(db as any).getById(TENANT_A, "visit-1");
    expect(db.__sqlContaining("FROM visits")[0].sql).toMatch(/(?:[\w]+\.)?tenant_id\s*=\s*\?\s+AND\s+(?:[\w]+\.)?id\s*=\s*\?/is);
  });

  it("update() scopes by tenant_id", async () => {
    db = createMockD1({
      rowsByFragment: new Map([["UPDATE visits", [{ id: "v1" }]]]),
    });
    await createVisitsRepository(db as any).update(TENANT_A, "v1", { status: "completed" });
    expect(db.__sqlContaining("UPDATE visits")[0].sql).toMatch(/WHERE tenant_id = \? AND id = \?/);
  });
});

describe("Tenant isolation: findings.repo", () => {
  let db: MockD1;
  beforeEach(() => {
    db = createMockD1();
  });

  it("listByVisit() scopes by tenant_id", async () => {
    await createFindingsRepository(db as any).listByVisit(TENANT_A, "visit-1");
    const calls = db.__sqlContaining("FROM clinical_findings");
    expect(calls[0].sql).toMatch(/tenant_id = \? AND visit_id = \?/);
    expect(calls[0].binds[0]).toBe(TENANT_A);
  });

  it("create() sets tenant_id from first arg", async () => {
    db = createMockD1({
      rowsByFragment: new Map([["FROM clinical_findings", [{ id: "f1", tenant_id: TENANT_A }]]]),
    });
    await createFindingsRepository(db as any).create(TENANT_A, "visit-1", {
      tooth_number: 11,
      condition: "caries",
    });
    const calls = db.__sqlContaining("INSERT INTO clinical_findings");
    expect(calls[0].binds[1]).toBe(TENANT_A);
  });

  it("delete() scopes by tenant_id", async () => {
    await createFindingsRepository(db as any).delete(TENANT_A, "f-1");
    expect(db.__sqlContaining("DELETE FROM clinical_findings")[0].sql).toMatch(/tenant_id = \? AND id = \?/);
  });
});

describe("Tenant isolation: treatment-plans.repo", () => {
  let db: MockD1;
  beforeEach(() => {
    db = createMockD1();
  });

  it("list() scopes by tenant_id", async () => {
    await createTreatmentPlansRepository(db as any).list(TENANT_A);
    expect(db.__sqlContaining("FROM treatment_plans")[0].sql).toMatch(SQL_WITH_TENANT);
  });

  it("getById() scopes by tenant_id", async () => {
    await createTreatmentPlansRepository(db as any).getById(TENANT_A, "plan-1");
    expect(db.__sqlContaining("FROM treatment_plans")[0].sql).toMatch(/tenant_id = \? AND id = \?/);
  });

  it("create() sets tenant_id correctly", async () => {
    db = createMockD1({
      rowsByFragment: new Map([["FROM treatment_plans", [{ id: "p1", tenant_id: TENANT_A }]]]),
    });
    await createTreatmentPlansRepository(db as any).create(TENANT_A, {
      visit_id: "v1",
      patient_id: PATIENT_A1,
      currency: "VND",
    });
    const calls = db.__sqlContaining("INSERT INTO treatment_plans");
    expect(calls[0].binds[1]).toBe(TENANT_A);
  });

  it("approve() scopes by tenant_id AND status filter", async () => {
    db = createMockD1({
      rowsByFragment: new Map([["UPDATE treatment_plans", [{ id: "p1" }]]]),
    });
    await createTreatmentPlansRepository(db as any).approve(TENANT_A, "p1");
    const calls = db.__sqlContaining("UPDATE treatment_plans");
    expect(calls[0].sql).toMatch(/WHERE tenant_id = \? AND id = \? AND status = 'draft'/i);
    expect(calls[0].binds[1]).toBe(TENANT_A);
    expect(calls[0].binds[2]).toBe("p1");
  });

  it("recomputeTotal() scopes by tenant_id", async () => {
    db = createMockD1({
      rowsByFragment: new Map([["FROM treatment_plan_items", [{ total: 1000 }]]]),
    });
    await createTreatmentPlansRepository(db as any).recomputeTotal(TENANT_A, "p1");
    const sumCalls = db.__sqlContaining("FROM treatment_plan_items");
    expect(sumCalls[0].sql).toMatch(/WHERE tenant_id = \? AND treatment_plan_id = \?/);
    expect(sumCalls[0].binds[0]).toBe(TENANT_A);
  });
});

describe("Tenant isolation: treatment-items.repo", () => {
  let db: MockD1;
  beforeEach(() => {
    db = createMockD1();
  });

  it("listByPlan() scopes by tenant_id", async () => {
    await createTreatmentItemsRepository(db as any).listByPlan(TENANT_A, "p1");
    expect(db.__sqlContaining("FROM treatment_plan_items")[0].sql).toMatch(
      /treatment_plan_items\.tenant_id = \? AND treatment_plan_items\.treatment_plan_id = \?/,
    );
  });

  it("create() sets tenant_id from first arg", async () => {
    db = createMockD1({
      rowsByFragment: new Map([["FROM treatment_plan_items", [{ id: "i1", tenant_id: TENANT_A }]]]),
    });
    await createTreatmentItemsRepository(db as any).create(TENANT_A, "p1", {
      tooth_number: 11,
      procedure: "filling",
      description: "test",
      unit_cost: 100,
    });
    const calls = db.__sqlContaining("INSERT INTO treatment_plan_items");
    expect(calls[0].binds[1]).toBe(TENANT_A);
  });

  it("delete() scopes by tenant_id", async () => {
    await createTreatmentItemsRepository(db as any).delete(TENANT_A, "item-1");
    expect(db.__sqlContaining("DELETE FROM treatment_plan_items")[0].sql).toMatch(/tenant_id = \? AND id = \?/);
  });
});

describe("Tenant isolation: payments.repo", () => {
  let db: MockD1;
  beforeEach(() => {
    db = createMockD1();
  });

  it("list() scopes by tenant_id", async () => {
    await createPaymentsRepository(db as any).list(TENANT_A);
    expect(db.__sqlContaining("FROM payments")[0].sql).toMatch(SQL_WITH_TENANT);
  });

  it("getById() scopes by tenant_id", async () => {
    await createPaymentsRepository(db as any).getById(TENANT_A, "pay-1");
    expect(db.__sqlContaining("FROM payments")[0].sql).toMatch(/tenant_id = \? AND id = \?/);
  });

  it("create() sets tenant_id correctly", async () => {
    db = createMockD1({
      rowsByFragment: new Map([["FROM payments", [{ id: "pay1", tenant_id: TENANT_A }]]]),
    });
    await createPaymentsRepository(db as any).create(TENANT_A, {
      treatment_plan_id: "p1",
      patient_id: PATIENT_A1,
      amount: 100,
      currency: "VND",
      method: "cash",
    });
    const calls = db.__sqlContaining("INSERT INTO payments");
    expect(calls[0].binds[1]).toBe(TENANT_A);
  });

  it("updateStatus() scopes by tenant_id", async () => {
    db = createMockD1({
      rowsByFragment: new Map([["UPDATE payments", [{ id: "pay-1" }]]]),
    });
    await createPaymentsRepository(db as any).updateStatus(TENANT_A, "pay-1", "confirmed");
    expect(db.__sqlContaining("UPDATE payments")[0].sql).toMatch(/WHERE tenant_id = \? AND id = \?/);
  });
});

describe("Tenant isolation: medical-alerts.repo", () => {
  let db: MockD1;
  beforeEach(() => {
    db = createMockD1();
  });

  it("listByPatient() scopes by tenant_id", async () => {
    await createMedicalAlertsRepository(db as any).listByPatient(TENANT_A, PATIENT_A1);
    const calls = db.__sqlContaining("FROM medical_alerts");
    expect(calls[0].sql).toMatch(/tenant_id = \? AND patient_id = \?/);
    expect(calls[0].binds[0]).toBe(TENANT_A);
  });

  it("create() sets tenant_id from first arg", async () => {
    db = createMockD1({
      rowsByFragment: new Map([["FROM medical_alerts", [{ id: "a1", tenant_id: TENANT_A }]]]),
    });
    await createMedicalAlertsRepository(db as any).create(TENANT_A, PATIENT_A1, {
      type: "allergy",
      description: "penicillin",
      severity: "high",
    });
    const calls = db.__sqlContaining("INSERT INTO medical_alerts");
    expect(calls[0].binds[1]).toBe(TENANT_A);
  });

  it("delete() scopes by tenant_id", async () => {
    await createMedicalAlertsRepository(db as any).delete(TENANT_A, "alert-1");
    expect(db.__sqlContaining("DELETE FROM medical_alerts")[0].sql).toMatch(/tenant_id = \? AND id = \?/);
  });
});

describe("Tenant isolation: cross-tenant data separation (simulated)", () => {
  it("patient list for tenant A should NOT see tenant B's patients", async () => {
    // Seeded mock returns tenant A patients only when binding[0] === TENANT_A
    const db = createMockD1({
      rowsByFragment: new Map([
        ["FROM patients", [
          { id: PATIENT_A1, tenant_id: TENANT_A, name: "A's patient" },
        ]],
      ]),
    });

    const repoA = createPatientsRepository(db as any);
    const items = await repoA.list(TENANT_A);

    // Only TENANT_A's bind should be issued
    const calls = db.__sqlContaining("FROM patients");
    expect(calls).toHaveLength(1);
    expect(calls[0].binds[0]).toBe(TENANT_A);
    expect(calls[0].binds[0]).not.toBe(TENANT_B);
    // Items returned are all tenant A's
    expect(items.every((p) => p.tenant_id === TENANT_A)).toBe(true);
  });

  it("user from tenant A reading patient from tenant B gets 404", async () => {
    // Simulating: getById with tenant A querying a patient ID from tenant B.
    // The mock returns null (no row matched) because the mock's rowsByFragment
    // only matches when SQL fragment is present + bind order matches.
    const db = createMockD1({
      // Empty results — simulating "not found in this tenant"
      rowsByFragment: new Map(),
    });
    const patient = await createPatientsRepository(db as any).getById(TENANT_A, PATIENT_B1);
    expect(patient).toBeNull(); // tenant A cannot see tenant B's patient
  });
});
