import { describe, it, expect } from "vitest";
import { Hono } from "hono";
import type { Env } from "../../src/index";
import { requirePlatformAuth } from "../../src/middleware/platform-auth";
import { signPlatformJwt } from "../../src/lib/platform-jwt";
import { buildEnv, TEST_SECRET } from "../helpers/jwt";
import { createTestApp } from "../helpers/app";
import { createMockD1 } from "../helpers/mock-db";

async function makePlatformToken(userKey: string) {
  return (
    await signPlatformJwt(
      {
        sub: userKey,
        sid: "platform-session-1",
        role_key: "platform_owner" as never,
        permissions: ["platform_dashboard.read"],
      },
      TEST_SECRET,
    )
  ).token;
}

describe("requirePlatformAuth middleware", () => {
  it("keeps a session active when its last request was within the idle window", async () => {
    const now = Date.now();
    const db = createMockD1({
      rowsByFragment: new Map([
        ["FROM platform_sessions", [{
          id: "platform-session-1",
          platform_user_id: "user-1",
          issued_at: new Date(now - 120_000).toISOString(),
          expires_at: new Date(now + 60_000).toISOString(),
          last_seen_at: new Date(now - 120_000).toISOString(),
          revoked_at: null,
          mfa_verified_at: new Date(now - 120_000).toISOString(),
        }]],
        ["FROM platform_users u JOIN platform_roles r", [{
          u_id: "user-1",
          u_role_id: "role-1",
          u_name: "Owner",
          u_password_hash: "unused",
          u_is_active: 1,
          u_mfa_secret_encrypted: null,
          u_mfa_enabled_at: new Date(now - 120_000).toISOString(),
          u_last_login_at: null,
          u_created_at: new Date(now - 120_000).toISOString(),
          u_updated_at: new Date(now - 120_000).toISOString(),
          r_id: "role-1",
          r_key: "platform_owner",
          r_name: "Owner",
          r_permissions: '["platform_dashboard.read"]',
          r_created_at: new Date(now - 120_000).toISOString(),
        }]],
      ]),
    });
    const env = buildEnv(db as unknown as D1Database, { PLATFORM_JWT_SECRET: TEST_SECRET });
    const app = createTestApp() as Hono<{ Bindings: Env }>;
    app.use("*", requirePlatformAuth());
    app.get("/test", (c) => c.json({ ok: true }));

    const token = await makePlatformToken("user-1");
    const res = await app.request(
      "/test",
      { headers: { Authorization: `Bearer ${token}` } },
      env,
    );

    expect(res.status).toBe(200);
  });

  it("does not turn downstream errors into session-expired responses", async () => {
    const db = createMockD1({
      rowsByFragment: new Map([
        ["FROM platform_sessions", [{
          id: "platform-session-1",
          platform_user_id: "user-1",
          issued_at: new Date().toISOString(),
          expires_at: new Date(Date.now() + 60_000).toISOString(),
          last_seen_at: new Date().toISOString(),
          revoked_at: null,
          mfa_verified_at: new Date().toISOString(),
        }]],
        ["FROM platform_users u JOIN platform_roles r", [{
          u_id: "user-1",
          u_role_id: "role-1",
          u_name: "Owner",
          u_password_hash: "unused",
          u_is_active: 1,
          u_mfa_secret_encrypted: null,
          u_mfa_enabled_at: new Date().toISOString(),
          u_last_login_at: null,
          u_created_at: new Date().toISOString(),
          u_updated_at: new Date().toISOString(),
          r_id: "role-1",
          r_key: "platform_owner",
          r_name: "Owner",
          r_permissions: '["platform_dashboard.read"]',
          r_created_at: new Date().toISOString(),
        }]],
      ]),
    });
    const env = buildEnv(db as unknown as D1Database, { PLATFORM_JWT_SECRET: TEST_SECRET });

    const app = createTestApp() as Hono<{ Bindings: Env }>;
    app.use("*", requirePlatformAuth());
    app.get("/test", () => {
      throw new Error("Database query failed");
    });

    const token = await makePlatformToken("user-1");
    const res = await app.request(
      "/test",
      { headers: { Authorization: `Bearer ${token}` } },
      env,
    );

    // A 401 makes the SPA clear the valid platform session and redirect to login.
    expect(res.status).toBe(500);
  });

  it("still returns 401 when token itself is invalid", async () => {
    const env = buildEnv(createMockD1() as unknown as D1Database, { PLATFORM_JWT_SECRET: TEST_SECRET });

    const app = createTestApp() as Hono<{ Bindings: Env }>;
    app.use("*", requirePlatformAuth());
    app.get("/test", (c) => c.json({ ok: true }));

    const res = await app.request(
      "/test",
      { headers: { Authorization: "Bearer not-a-real-token" } },
      env,
    );

    expect(res.status).toBe(401);
    const body = (await res.json()) as { error: string };
    expect(body.error.toLowerCase()).toContain("expired");
  });
});
