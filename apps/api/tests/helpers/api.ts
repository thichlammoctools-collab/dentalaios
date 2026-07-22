/**
 * HTTP integration test helpers.
 *
 * - mountRoute(): mount a Hono router on a fresh test app with onError + logger
 * - makeAuthedRequest(): make a request with a valid JWT token (custom permissions)
 * - makePublicRequest(): make a request without auth (for /api/auth/login)
 */

import { Hono } from "hono";
import type { Env } from "../../src/index";
import { createTestApp } from "./app";
import { signJwt } from "../../src/lib/jwt";
import { TEST_SECRET, buildEnv } from "./jwt";
import { createMockD1, type FragmentMatcher, type MockD1Options } from "./mock-db";

/** Mount a Hono router (e.g. import from src/routes/auth) on a test app. */
export function mountRoute(path: string, router: Hono<any>) {
  const app = createTestApp() as Hono<{ Bindings: Env }>;
  app.route(path, router);
  return app;
}

/**
 * Build a JWT for testing with the given permissions.
 * `sub` and `tenant_id` are fixed to known test values.
 */
export async function makeToken(
  permissions: string[] = ["all"],
  overrides: { sub?: string; tenantId?: string; branchId?: string; roleId?: string } = {},
): Promise<string> {
  return (
    await signJwt(
      {
        sub: overrides.sub ?? "test-user",
        tenant_id: overrides.tenantId ?? "test-tenant",
        branch_id: overrides.branchId ?? "test-branch",
        role_id: overrides.roleId ?? "test-role",
        permissions,
      },
      TEST_SECRET,
    )
  ).token;
}

/** Make a request with a Bearer token. */
export async function authedRequest(
  app: Hono<{ Bindings: Env }>,
  method: string,
  path: string,
  options: {
    permissions?: string[];
    body?: unknown;
    token?: string;
  } = {},
) {
  const db = createMockD1();
  const env = buildEnv(db, { JWT_SECRET: TEST_SECRET });
  const token = options.token ?? (await makeToken(options.permissions ?? ["all"]));

  const init: RequestInit = {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(options.body !== undefined ? { "Content-Type": "application/json" } : {}),
    },
  };
  if (options.body !== undefined) {
    init.body = JSON.stringify(options.body);
  }
  return app.request(path, init, env);
}

/** Make a public (no auth) request — for /api/auth/login, /api/auth/logout. */
export async function publicRequest(
  app: Hono<{ Bindings: Env }>,
  method: string,
  path: string,
  body?: unknown,
) {
  const db = createMockD1();
  const env = buildEnv(db, { JWT_SECRET: TEST_SECRET });

  const init: RequestInit = {
    method,
    headers: body !== undefined ? { "Content-Type": "application/json" } : {},
  };
  if (body !== undefined) {
    init.body = JSON.stringify(body);
  }
  return app.request(path, init, env);
}

/** Helper to make a request with custom D1 mock (for clinical routes that need seeded data). */
export async function authedRequestWithDB(
  app: Hono<{ Bindings: Env }>,
  method: string,
  path: string,
  dbRowsByFragment: Map<string, FragmentMatcher>,
  options: {
    permissions?: string[];
    body?: unknown;
    runErrorByFragment?: MockD1Options["runErrorByFragment"];
  } = {},
) {
  const db = createMockD1({ rowsByFragment: dbRowsByFragment, runErrorByFragment: options.runErrorByFragment });
  const env = buildEnv(db, { JWT_SECRET: TEST_SECRET });
  const token = await makeToken(options.permissions ?? ["all"]);

  const init: RequestInit = {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(options.body !== undefined ? { "Content-Type": "application/json" } : {}),
    },
  };
  if (options.body !== undefined) {
    init.body = JSON.stringify(options.body);
  }
  return app.request(path, init, env);
}
