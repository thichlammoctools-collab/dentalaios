/**
 * Integration tests for /api/payments routes.
 */

import { describe, it, expect } from "vitest";
import paymentsRoutes from "../../src/routes/payments";
import { mountRoute, authedRequestWithDB } from "../helpers/api";

const paymentRow = (overrides: Record<string, unknown> = {}) => ({
  id: "payment-1",
  tenant_id: "test-tenant",
  treatment_plan_id: "plan-1",
  patient_id: "patient-1",
  amount: 500000,
  currency: "VND",
  method: "cash",
  status: "pending",
  reference: null,
  notes: null,
  code: "TT-20260101-0001",
  created_at: "2026-01-01",
  ...overrides,
});

describe("GET /api/payments", () => {
  it("returns list of payments for user with write_payments", async () => {
    const app = mountRoute("/api/payments", paymentsRoutes);
    const res = await authedRequestWithDB(
      app,
      "GET",
      "/api/payments",
      new Map([["FROM payments", [paymentRow(), paymentRow({ id: "payment-2", amount: 1000000 })]]]),
      { permissions: ["write_payments"] },
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { items: { id: string }[] };
    expect(body.items).toHaveLength(2);
  });

  it("filters by patient_id", async () => {
    const app = mountRoute("/api/payments", paymentsRoutes);
    const res = await authedRequestWithDB(
      app,
      "GET",
      "/api/payments?patient_id=patient-1",
      new Map([["FROM payments", [paymentRow()]]]),
      { permissions: ["write_payments"] },
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { items: unknown[] };
    expect(body.items).toHaveLength(1);
  });

  it("returns 403 for user without write_payments", async () => {
    const app = mountRoute("/api/payments", paymentsRoutes);
    const res = await authedRequestWithDB(
      app,
      "GET",
      "/api/payments",
      new Map(),
      { permissions: ["read_patients"] }, // no write_payments
    );
    expect(res.status).toBe(403);
  });

  it("returns 401 without auth", async () => {
    const app = mountRoute("/api/payments", paymentsRoutes);
    const res = await app.request(
      "/api/payments",
      { method: "GET" },
      {
        DB: undefined as any,
        FILES: {} as R2Bucket,
        JOBS: {} as Queue,
        ENVIRONMENT: "test",
        FRONTEND_ORIGIN: "",
        JWT_SECRET: "test",
      } as any,
    );
    expect(res.status).toBe(401);
  });
});

describe("POST /api/payments", () => {
  it("returns 201 + payment for valid data", async () => {
    const app = mountRoute("/api/payments", paymentsRoutes);
    const res = await authedRequestWithDB(
      app,
      "POST",
      "/api/payments",
      new Map([
        ["FROM treatment_plans", [{
          id: "plan-1",
          tenant_id: "test-tenant",
          patient_id: "patient-1",
          status: "approved",
          visit_id: "v1",
          total_cost: 1000000,
          currency: "VND",
          notes: null,
          approved_at: null,
          created_at: "2026-01-01",
        }]],
        // Code generator: prefix lookup + counter upsert + uniqueness check
        ["FROM tenant_settings", []], // no prefix configured → fallback to "TT"
        ["INSERT INTO payment_code_counters", [{ last_seq: 1 }]],
        ["FROM payments WHERE code =", []], // no clash — must precede generic "FROM payments"
        ["FROM payments", [paymentRow({ amount: 500000 })]],
      ]),
      {
        permissions: ["write_payments"],
        body: {
          treatment_plan_id: "plan-1",
          patient_id: "patient-1",
          amount: 500000,
          currency: "VND",
          method: "cash",
          reference: "TXN-001",
        },
      },
    );
    expect(res.status).toBe(201);
    const body = (await res.json()) as { amount: number; method: string; status: string };
    expect(body.amount).toBe(500000);
    expect(body.method).toBe("cash");
    expect(body.status).toBe("pending");
  });

  it("returns 400 for missing required fields", async () => {
    const app = mountRoute("/api/payments", paymentsRoutes);
    const res = await authedRequestWithDB(
      app,
      "POST",
      "/api/payments",
      new Map(),
      {
        permissions: ["write_payments"],
        body: {
          // patient_id missing
          treatment_plan_id: "plan-1",
          amount: 100,
          currency: "VND",
          method: "cash",
        },
      },
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 for non-positive amount", async () => {
    const app = mountRoute("/api/payments", paymentsRoutes);
    const res = await authedRequestWithDB(
      app,
      "POST",
      "/api/payments",
      new Map(),
      {
        permissions: ["write_payments"],
        body: {
          treatment_plan_id: "plan-1",
          patient_id: "patient-1",
          amount: 0, // must be > 0
          currency: "VND",
          method: "cash",
        },
      },
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 for invalid method", async () => {
    const app = mountRoute("/api/payments", paymentsRoutes);
    const res = await authedRequestWithDB(
      app,
      "POST",
      "/api/payments",
      new Map(),
      {
        permissions: ["write_payments"],
        body: {
          treatment_plan_id: "plan-1",
          patient_id: "patient-1",
          amount: 100,
          currency: "VND",
          method: "crypto", // not in enum
        },
      },
    );
    expect(res.status).toBe(400);
  });

  it("returns 404 when plan does not exist", async () => {
    const app = mountRoute("/api/payments", paymentsRoutes);
    const res = await authedRequestWithDB(
      app,
      "POST",
      "/api/payments",
      new Map(), // empty → no plan
      {
        permissions: ["write_payments"],
        body: {
          treatment_plan_id: "ghost",
          patient_id: "patient-1",
          amount: 100,
          currency: "VND",
          method: "cash",
        },
      },
    );
    expect(res.status).toBe(404);
  });
});

describe("POST /api/payments/:id/confirm", () => {
  it("returns 200 + confirmed payment", async () => {
    const app = mountRoute("/api/payments", paymentsRoutes);
    const confirmed = paymentRow({ status: "pending" });
    const res = await authedRequestWithDB(
      app,
      "POST",
      "/api/payments/payment-1/confirm",
      new Map<string, unknown[]>([
        ["FROM payments", (_sql, callIndex) => callIndex === 0 ? [confirmed] : [paymentRow({ status: "confirmed" })]],
      ]),
      { permissions: ["write_payments"] },
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string };
    expect(body.status).toBe("confirmed");
  });

  it("returns 404 when payment does not exist", async () => {
    const app = mountRoute("/api/payments", paymentsRoutes);
    const res = await authedRequestWithDB(
      app,
      "POST",
      "/api/payments/ghost/confirm",
      new Map(),
      { permissions: ["write_payments"] },
    );
    expect(res.status).toBe(404);
  });
});

describe("confirmed payment protections", () => {
  it("rejects edits to a confirmed payment", async () => {
    const app = mountRoute("/api/payments", paymentsRoutes);
    const res = await authedRequestWithDB(
      app,
      "PATCH",
      "/api/payments/payment-1",
      new Map([["FROM payments", [paymentRow({ status: "confirmed" })]]]),
      { permissions: ["write_payments"], body: { amount: 100000 } },
    );
    expect(res.status).toBe(409);
  });

  it("creates a linked confirmed adjustment with a mandatory reason", async () => {
    const app = mountRoute("/api/payments", paymentsRoutes);
    const adjusted = paymentRow({ id: "adjustment-1", amount: -50000, status: "confirmed", original_payment_id: "payment-1", adjustment_reason: "Nhập dư" });
    const res = await authedRequestWithDB(
      app,
      "POST",
      "/api/payments/payment-1/adjust",
      new Map<string, unknown[]>([
        ["FROM tenant_settings", []],
        ["INSERT INTO payment_code_counters", [{ last_seq: 2 }]],
        ["FROM payments WHERE code =", []],
        ["FROM payments", (_sql, callIndex) => callIndex === 0 ? [paymentRow({ status: "confirmed" })] : [adjusted]],
      ]),
      { permissions: ["write_payments"], body: { amount: -50000, reason: "Nhập dư" } },
    );
    expect(res.status).toBe(201);
    const body = (await res.json()) as { status: string; original_payment_id: string; amount: number };
    expect(body.status).toBe("confirmed");
    expect(body.original_payment_id).toBe("payment-1");
    expect(body.amount).toBe(-50000);
  });

  it("requires a reason for an adjustment", async () => {
    const app = mountRoute("/api/payments", paymentsRoutes);
    const res = await authedRequestWithDB(
      app,
      "POST",
      "/api/payments/payment-1/adjust",
      new Map(),
      { permissions: ["write_payments"], body: { amount: -50000 } },
    );
    expect(res.status).toBe(400);
  });
});
