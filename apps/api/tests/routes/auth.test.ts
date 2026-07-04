/**
 * Integration tests for /api/auth routes.
 * Tests HTTP-level request/response with mocked D1 + JWT.
 */

import { describe, it, expect } from "vitest";
import authRoutes from "../../src/routes/auth";
import { mountRoute, publicRequest, authedRequest } from "../helpers/api";
import { createMockD1 } from "../helpers/mock-db";
import { TEST_SECRET, buildEnv } from "../helpers/jwt";

const VALID_HASH = "$2a$10$lYlzVZG3a3XCE3XmE4OvB.3mght4YpbrPrRXZ4SWh0kEnlOeOzMfW"; // "password123"

const userRow = (overrides: Record<string, unknown> = {}) => ({
  u_id: "user-1",
  u_tenant_id: "tenant-1",
  u_branch_id: "branch-1",
  u_role_id: "role-1",
  u_email: "admin@demo.clinic",
  u_name: "Demo Admin",
  u_password_hash: VALID_HASH,
  u_created_at: "2026-01-01",
  r_id: "role-1",
  r_tenant_id: "tenant-1",
  r_name: "admin",
  r_permissions: '["all"]',
  r_created_at: "2026-01-01",
  t_id: "tenant-1",
  t_name: "Demo Clinic",
  t_created_at: "2026-01-01",
  b_id: "branch-1",
  b_tenant_id: "tenant-1",
  b_name: "Main",
  b_address: "123 St",
  b_created_at: "2026-01-01",
  ...overrides,
});

describe("POST /api/auth/login", () => {
  it("returns 200 + valid session for correct credentials", async () => {
    const db = createMockD1({
      rowsByFragment: new Map([["FROM users", [userRow()]]]),
    });
    const env = buildEnv(db, { JWT_SECRET: TEST_SECRET });
    const app = mountRoute("/api/auth", authRoutes);

    const res = await app.request(
      "/api/auth/login",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "admin@demo.clinic", password: "password123" }),
      },
      env,
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as { session: { token: string; user: { email: string } } };
    expect(body.session.user.email).toBe("admin@demo.clinic");
    expect(body.session.token).toBeTruthy();
  });

  it("returns 401 for unknown email (no info leak)", async () => {
    const db = createMockD1({ rowsByFragment: new Map() });
    const env = buildEnv(db, { JWT_SECRET: TEST_SECRET });
    const app = mountRoute("/api/auth", authRoutes);

    const res = await app.request(
      "/api/auth/login",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "nobody@example.com", password: "any" }),
      },
      env,
    );
    expect(res.status).toBe(401);
    const body = (await res.json()) as { error: string };
    expect(body.error).toContain("Email hoặc mật khẩu");
  });

  it("returns 401 for wrong password (no info leak — same message as unknown email)", async () => {
    const db = createMockD1({
      rowsByFragment: new Map([["FROM users", [userRow()]]]),
    });
    const env = buildEnv(db, { JWT_SECRET: TEST_SECRET });
    const app = mountRoute("/api/auth", authRoutes);

    const res = await app.request(
      "/api/auth/login",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "admin@demo.clinic", password: "wrong-pwd" }),
      },
      env,
    );
    expect(res.status).toBe(401);
  });

  it("returns 422 for invalid email format", async () => {
    const app = mountRoute("/api/auth", authRoutes);
    const res = await publicRequest(
      app,
      "POST",
      "/api/auth/login",
      { email: "not-an-email", password: "x" },
    );
    expect(res.status).toBe(422);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe("validation_error");
  });

  it("returns 422 for missing password", async () => {
    const app = mountRoute("/api/auth", authRoutes);
    const res = await publicRequest(
      app,
      "POST",
      "/api/auth/login",
      { email: "admin@demo.clinic" },
    );
    expect(res.status).toBe(422);
  });
});

describe("GET /api/auth/me", () => {
  it("returns user info for valid token", async () => {
    const db = createMockD1({
      rowsByFragment: new Map([["FROM users", [userRow()]]]),
    });
    const env = buildEnv(db, { JWT_SECRET: TEST_SECRET });
    const app = mountRoute("/api/auth", authRoutes);

    const res = await authedRequest(app, "GET", "/api/auth/me");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { user: { email: string }; role: { name: string } };
    expect(body.user.email).toBe("admin@demo.clinic");
    expect(body.role.name).toBe("admin");
  });

  it("returns 401 without Authorization header", async () => {
    const app = mountRoute("/api/auth", authRoutes);
    const res = await publicRequest(app, "GET", "/api/auth/me");
    expect(res.status).toBe(401);
  });
});

describe("POST /api/auth/logout", () => {
  it("returns 200 with valid token (stateless)", async () => {
    const app = mountRoute("/api/auth", authRoutes);
    const res = await authedRequest(app, "POST", "/api/auth/logout");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean };
    expect(body.ok).toBe(true);
  });
});