/**
 * Tests for auth.service.login + getMe.
 *
 * NOTE: Tests pass deps = { db, jwtSecret } explicitly (not env).
 * Passing full env directly causes vitest TypeScript transform to lose
 * the `db` reference in the closed-over deps argument — known vitest
 * issue with complex Hono Env types.
 */

import { describe, it, expect } from "vitest";
import { authService } from "../../src/services/auth.service";
import { createMockD1 } from "../helpers/mock-db";
import { TEST_SECRET, USER_A, TENANT_A, buildEnv } from "../helpers/jwt";
import { verifyJwt } from "../../src/lib/jwt";

const VALID_HASH = "$2a$10$lYlzVZG3a3XCE3XmE4OvB.3mght4YpbrPrRXZ4SWh0kEnlOeOzMfW"; // hash of "password123"

const baseUserRow = (overrides: Record<string, unknown> = {}) => ({
  u_id: USER_A,
  u_tenant_id: TENANT_A,
  u_branch_id: "branch-1",
  u_role_id: "role-1",
  u_email: "admin@demo.clinic",
  u_name: "Demo Admin",
  u_password_hash: VALID_HASH,
  u_is_active: 1,
  u_email_verified_at: "2026-01-01",
  u_created_at: "2026-01-01",
  r_id: "role-1",
  r_tenant_id: TENANT_A,
  r_name: "admin",
  r_permissions: '["all"]',
  r_created_at: "2026-01-01",
  t_id: TENANT_A,
  t_name: "Demo Clinic",
  t_created_at: "2026-01-01",
  b_id: "branch-1",
  b_tenant_id: TENANT_A,
  b_name: "Main",
  b_address: "123 St",
  b_created_at: "2026-01-01",
  ...overrides,
});

function makeDeps(rowsByFragment: Map<string, unknown[]> = new Map()) {
  const db = createMockD1({ rowsByFragment });
  const env = buildEnv(db, { JWT_SECRET: TEST_SECRET });
  return { db: env.DB, jwtSecret: env.JWT_SECRET };
}

describe("authService.login", () => {
  it("rejects unknown email with 401", async () => {
    const deps = makeDeps(new Map());
    await expect(authService.login(deps, "nobody@example.com", "any")).rejects.toMatchObject({
      status: 401,
      code: "unauthorized",
    });
  });

  it("rejects wrong password with 401 (no info leak)", async () => {
    const userRow = baseUserRow({ u_email: "user@example.com", u_password_hash: VALID_HASH });
    const deps = makeDeps(new Map([["FROM users", [userRow]]]));
    await expect(authService.login(deps, "user@example.com", "wrong-password")).rejects.toMatchObject({
      status: 401,
    });
  });

  it("rejects login for a suspended tenant", async () => {
    const userRow = baseUserRow({ t_is_active: 0 });
    const deps = makeDeps(new Map([["FROM users", [userRow]]]));
    await expect(authService.login(deps, "admin@demo.clinic", "password123")).rejects.toMatchObject({
      status: 401,
      code: "unauthorized",
    });
  });

  it("accepts correct credentials and returns valid session", async () => {
    const userRow = baseUserRow({ u_password_hash: VALID_HASH });
    const deps = makeDeps(new Map([["FROM users", [userRow]]]));

    const session = await authService.login(deps, "admin@demo.clinic", "password123");
    expect(session.user.email).toBe("admin@demo.clinic");
    expect(session.user.tenant_id).toBe(TENANT_A);
    expect(session.role.permissions).toContain("all");
    expect(session.tenant.name).toBe("Demo Clinic");

    const payload = await verifyJwt(session.token, TEST_SECRET);
    expect(payload.sub).toBe(USER_A);
    expect(payload.tenant_id).toBe(TENANT_A);
  });

  it("JWT payload always carries tenant_id from user's tenant", async () => {
    const userRow = baseUserRow({ u_email: "a@a.com", u_password_hash: VALID_HASH });
    const deps = makeDeps(new Map([["FROM users", [userRow]]]));

    const session = await authService.login(deps, "a@a.com", "password123");
    const payload = await verifyJwt(session.token, TEST_SECRET);
    expect(payload.tenant_id).toBe(TENANT_A);
    expect(payload.tenant_id).not.toBe("tenant-B");
  });
});

describe("authService.getMe", () => {
  it("returns context for existing (userId, tenantId)", async () => {
    const deps = makeDeps(new Map([["FROM users", [baseUserRow()]]]));
    const me = await authService.getMe(deps, USER_A, TENANT_A);
    expect(me).not.toBeNull();
    expect(me!.user.id).toBe(USER_A);
    expect(me!.user.tenant_id).toBe(TENANT_A);
  });

  it("returns null when user not found", async () => {
    const deps = makeDeps(new Map());
    const me = await authService.getMe(deps, "ghost", TENANT_A);
    expect(me).toBeNull();
  });

  it("returns null when tenant_id mismatches (cross-tenant)", async () => {
    const deps = makeDeps(new Map());
    const me = await authService.getMe(deps, USER_A, "tenant-B");
    expect(me).toBeNull();
  });

  it("does NOT include password_hash in returned context", async () => {
    const deps = makeDeps(new Map([["FROM users", [baseUserRow()]]]));
    const me = await authService.getMe(deps, USER_A, TENANT_A);
    expect(me).not.toBeNull();
    expect("password_hash" in me!.user).toBe(false);
  });
});
