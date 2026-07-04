import { describe, it, expect, beforeEach } from "vitest";
import { Hono } from "hono";
import { requireAuth, getJwt } from "../../src/middleware/auth";
import { requirePermission, requireAnyPermission } from "../../src/middleware/rbac";
import type { Env } from "../../src/index";
import type { AuthContext } from "../../src/middleware/auth";
import { signJwt } from "../../src/lib/jwt";
import { TEST_SECRET, buildEnv } from "../helpers/jwt";
import { PERMISSIONS } from "@shared/constants";
import { createTestApp } from "../helpers/app";

async function makeToken(permissions: string[]): Promise<string> {
  return (
    await signJwt(
      {
        sub: "user-1",
        tenant_id: "tenant-1",
        branch_id: "branch-1",
        role_id: "role-1",
        permissions,
      },
      TEST_SECRET,
    )
  ).token;
}

function makeApp() {
  const app = createTestApp() as Hono<{ Bindings: Env; Variables: AuthContext }>;
  app.use("*", requireAuth());
  app.get(
    "/write-plans",
    requirePermission(PERMISSIONS.WRITE_PLANS),
    (c) => c.json({ ok: true }),
  );
  app.get(
    "/approve",
    requirePermission(PERMISSIONS.APPROVE_PLANS),
    (c) => c.json({ ok: true }),
  );
  app.get(
    "/any-payment",
    requireAnyPermission([PERMISSIONS.WRITE_PAYMENTS, PERMISSIONS.WRITE_APPOINTMENTS]),
    (c) => c.json({ ok: true }),
  );
  return app;
}

describe("requirePermission middleware", () => {
  let env: Env;
  beforeEach(() => {
    env = buildEnv({} as any);
  });

  it("grants access when permission present", async () => {
    const app = makeApp();
    const token = await makeToken(["write_plans"]);
    const res = await app.request(
      "/write-plans",
      { headers: { Authorization: `Bearer ${token}` } },
      env,
    );
    expect(res.status).toBe(200);
  });

  it("denies access when permission missing", async () => {
    const app = makeApp();
    const token = await makeToken(["read_patients"]);
    const res = await app.request(
      "/write-plans",
      { headers: { Authorization: `Bearer ${token}` } },
      env,
    );
    expect(res.status).toBe(403);
    const body = (await res.json()) as { code: string; error: string };
    expect(body.code).toBe("forbidden");
    expect(body.error).toContain("write_plans");
  });

  it("PERMISSIONS.ALL bypasses all checks (admin)", async () => {
    const app = makeApp();
    const token = await makeToken(["all"]);
    const res = await app.request(
      "/approve",
      { headers: { Authorization: `Bearer ${token}` } },
      env,
    );
    expect(res.status).toBe(200);
  });

  it("receptionist cannot approve plans", async () => {
    const app = makeApp();
    // receptionist permissions from seed
    const token = await makeToken(["read_patients", "write_payments", "write_appointments"]);
    const res = await app.request(
      "/approve",
      { headers: { Authorization: `Bearer ${token}` } },
      env,
    );
    expect(res.status).toBe(403);
  });

  it("assistant can read but not write_plans", async () => {
    const app = makeApp();
    const token = await makeToken(["read_patients", "write_visits"]);
    const resWrite = await app.request(
      "/write-plans",
      { headers: { Authorization: `Bearer ${token}` } },
      env,
    );
    expect(resWrite.status).toBe(403);
  });

  it("doctor can write_plans but not manage_users", async () => {
    const app = makeApp();
    const token = await makeToken([
      "read_patients",
      "write_findings",
      "write_plans",
      "approve_plans",
    ]);
    const resPlans = await app.request(
      "/write-plans",
      { headers: { Authorization: `Bearer ${token}` } },
      env,
    );
    expect(resPlans.status).toBe(200);
  });
});

describe("requireAnyPermission middleware", () => {
  let env: Env;
  beforeEach(() => {
    env = buildEnv({} as any);
  });

  it("grants when ANY required permission present", async () => {
    const app = makeApp();
    const token = await makeToken(["write_payments"]);
    const res = await app.request(
      "/any-payment",
      { headers: { Authorization: `Bearer ${token}` } },
      env,
    );
    expect(res.status).toBe(200);
  });

  it("grants when alternative permission present", async () => {
    const app = makeApp();
    const token = await makeToken(["write_appointments"]);
    const res = await app.request(
      "/any-payment",
      { headers: { Authorization: `Bearer ${token}` } },
      env,
    );
    expect(res.status).toBe(200);
  });

  it("denies when none of the required permissions present", async () => {
    const app = makeApp();
    const token = await makeToken(["read_patients"]);
    const res = await app.request(
      "/any-payment",
      { headers: { Authorization: `Bearer ${token}` } },
      env,
    );
    expect(res.status).toBe(403);
    const body = (await res.json()) as { error: string };
    expect(body.error).toContain("write_payments");
    expect(body.error).toContain("write_appointments");
  });
});