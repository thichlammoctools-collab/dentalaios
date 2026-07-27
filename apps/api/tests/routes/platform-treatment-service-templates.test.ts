import { describe, expect, it } from "vitest";
import platformRoutes from "../../src/routes/platform";
import { createTestApp } from "../helpers/app";
import { buildEnv, TEST_SECRET } from "../helpers/jwt";
import { createMockD1 } from "../helpers/mock-db";
import { signPlatformJwt } from "../../src/lib/platform-jwt";
import type { Env } from "../../src/index";
import type { Hono } from "hono";

function mountPlatform(): Hono<{ Bindings: Env }> {
  const app = createTestApp() as Hono<{ Bindings: Env }>;
  app.route("/api/platform", platformRoutes);
  return app;
}

function sessionRow(overrides: { mfaVerifiedAt?: string | null } = {}) {
  const now = Date.now();
  return {
    id: "platform-session-1",
    platform_user_id: "user-1",
    issued_at: new Date(now - 120_000).toISOString(),
    expires_at: new Date(now + 60_000).toISOString(),
    last_seen_at: new Date(now - 30_000).toISOString(),
    revoked_at: null,
    mfa_verified_at: overrides.mfaVerifiedAt === undefined ? new Date(now - 60_000).toISOString() : overrides.mfaVerifiedAt,
  };
}

function userRow(permissions: string[], roleKey: "platform_owner" | "platform_operator" | "platform_auditor" = "platform_owner") {
  const iso = new Date().toISOString();
  return {
    u_id: "user-1",
    u_role_id: "role-1",
    u_name: "Owner",
    u_password_hash: "unused",
    u_is_active: 1,
    u_mfa_secret_encrypted: null,
    u_mfa_enabled_at: iso,
    u_last_login_at: null,
    u_created_at: iso,
    u_updated_at: iso,
    r_id: "role-1",
    r_key: roleKey,
    r_name: "Owner",
    r_permissions: JSON.stringify(permissions),
    r_created_at: iso,
  };
}

async function platformToken(permissions: string[] = ["platform_config.read", "platform_config.write"]) {
  return (
    await signPlatformJwt(
      { sub: "user-1", sid: "platform-session-1", role_key: "platform_owner" as never, permissions: permissions as never },
      TEST_SECRET,
    )
  ).token;
}

const templateRow = {
  code: "RES-COMP-1S",
  name: "Trám composite xoang 1",
  procedure: "filling",
  default_price: 500000,
  market_price_low: null,
  market_price_median: null,
  market_price_high: null,
  market_price_currency: "VND",
  market_price_reference: null,
  market_price_updated_at: null,
  default_duration_min: 30,
  description: null,
  is_active: 1,
  sort_order: 110,
  created_by: null,
  updated_by: null,
  created_at: "2026-07-20T00:00:00.000Z",
  updated_at: "2026-07-20T00:00:00.000Z",
};

const procedureRow = {
  code: "filling",
  name: "Trám răng",
  is_active: 1,
  sort_order: 100,
  created_at: "2026-07-20T00:00:00.000Z",
  updated_at: "2026-07-20T00:00:00.000Z",
};

describe("platform treatment service templates", () => {
  it("requires a platform token", async () => {
    const app = mountPlatform();
    const env = buildEnv(createMockD1(), { PLATFORM_JWT_SECRET: TEST_SECRET });
    const res = await app.request("/api/platform/treatment-service-templates", {}, env);
    expect(res.status).toBe(401);
  });

  it("lists templates with active_only filter honoured", async () => {
    const app = mountPlatform();
    const db = createMockD1({
      rowsByFragment: new Map<string, unknown[]>([
        ["FROM platform_sessions", [sessionRow()]],
        ["FROM platform_users u JOIN platform_roles r", [userRow(["platform_config.read"])]],
        ["FROM platform_treatment_service_templates", [templateRow]],
      ]),
    });
    const env = buildEnv(db, { PLATFORM_JWT_SECRET: TEST_SECRET });
    const token = await platformToken(["platform_config.read"]);
    const res = await app.request(
      "/api/platform/treatment-service-templates?is_active=true",
      { headers: { Authorization: `Bearer ${token}` } },
      env,
    );
    expect(res.status).toBe(200);
    const body = await res.json() as { items: unknown[] };
    expect(body.items).toHaveLength(1);
    const listCall = db.__sqlContaining("FROM platform_treatment_service_templates").find((c) => c.method === "all");
    expect(listCall?.sql).toContain("is_active = 1");
  });

  it("blocks upsert when MFA is stale", async () => {
    const app = mountPlatform();
    const db = createMockD1({
      rowsByFragment: new Map<string, unknown[]>([
        ["FROM platform_sessions", [sessionRow({ mfaVerifiedAt: new Date(Date.now() - 60 * 60_000).toISOString() })]],
        ["FROM platform_users u JOIN platform_roles r", [userRow(["platform_config.read", "platform_config.write"])]],
      ]),
    });
    const env = buildEnv(db, { PLATFORM_JWT_SECRET: TEST_SECRET });
    const token = await platformToken(["platform_config.read", "platform_config.write"]);
    const res = await app.request(
      "/api/platform/treatment-service-templates",
      {
        method: "PUT",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          code: "RES-COMP-1S",
          name: "Trám composite xoang 1",
          procedure: "filling",
          default_price: 500000,
          default_duration_min: 30,
          icd10_links: [],
        }),
      },
      env,
    );
    expect(res.status).toBe(403);
  });

  it("upserts a template and writes an audit log entry", async () => {
    const app = mountPlatform();
    const db = createMockD1({
      rowsByFragment: new Map<string, unknown[]>([
        ["FROM platform_sessions", [sessionRow()]],
        ["FROM platform_users u JOIN platform_roles r", [userRow(["platform_config.read", "platform_config.write"])]],
        ["FROM procedure_catalog", [procedureRow]],
        ["FROM platform_treatment_service_templates", [templateRow]],
      ]),
    });
    const env = buildEnv(db, { PLATFORM_JWT_SECRET: TEST_SECRET });
    const token = await platformToken(["platform_config.read", "platform_config.write"]);
    const res = await app.request(
      "/api/platform/treatment-service-templates",
      {
        method: "PUT",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          code: "RES-COMP-1S",
          name: "Trám composite xoang 1",
          procedure: "filling",
          default_price: 500000,
          default_duration_min: 30,
          icd10_links: [],
        }),
      },
      env,
    );
    expect(res.status).toBe(200);
    const audit = db.__sqlContaining("INSERT INTO platform_audit_log");
    expect(audit.length).toBeGreaterThan(0);
    expect(audit[0].binds).toEqual(expect.arrayContaining(["treatment_service_template.upserted"]));
  });

  it("rejects an upsert whose procedure is not in the catalog", async () => {
    const app = mountPlatform();
    const db = createMockD1({
      rowsByFragment: new Map<string, unknown[]>([
        ["FROM platform_sessions", [sessionRow()]],
        ["FROM platform_users u JOIN platform_roles r", [userRow(["platform_config.read", "platform_config.write"])]],
        // No procedure_catalog row seeded → repo.getActive returns null.
      ]),
    });
    const env = buildEnv(db, { PLATFORM_JWT_SECRET: TEST_SECRET });
    const token = await platformToken(["platform_config.read", "platform_config.write"]);
    const res = await app.request(
      "/api/platform/treatment-service-templates",
      {
        method: "PUT",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          code: "RES-COMP-1S",
          name: "Trám composite xoang 1",
          procedure: "unknown_procedure",
          default_price: 500000,
          default_duration_min: 30,
          icd10_links: [],
        }),
      },
      env,
    );
    expect(res.status).toBe(409);
  });
});
