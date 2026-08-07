import { describe, expect, it } from "vitest";
import { Hono } from "hono";
import { requireAuth } from "../../src/middleware/auth";
import { requireFeatureEnabled } from "../../src/middleware/feature-flags";
import { requirePermission } from "../../src/middleware/rbac";
import type { Env } from "../../src/index";
import type { AuthContext } from "../../src/middleware/auth";
import { createTestApp } from "../helpers/app";
import { makeToken } from "../helpers/api";
import { TEST_SECRET, buildEnv } from "../helpers/jwt";
import { createMockD1 } from "../helpers/mock-db";
import { FEATURE_FLAGS, PERMISSIONS } from "@shared/constants";

function makeApp() {
  const app = createTestApp() as Hono<{ Bindings: Env; Variables: AuthContext }>;
  app.use("*", requireAuth());
  app.get(
    "/protected",
    requireFeatureEnabled(FEATURE_FLAGS.CLINICAL_COPILOT_ENDODONTIC_PAIN_V1),
    requirePermission(PERMISSIONS.READ_PATIENTS),
    (c) => c.json({ ok: true }),
  );
  return app;
}

async function request(
  enabled: number | undefined,
  permissions: string[],
  options: { tenantId?: string; token?: string } = {},
) {
  const db = createMockD1({
    rowsByFragment: new Map([
      ["FROM platform_feature_flags", enabled === undefined ? [] : [{ enabled }]],
    ]),
  });
  const env = buildEnv(db, { JWT_SECRET: TEST_SECRET });
  const token = options.token ?? await makeToken(permissions, { tenantId: options.tenantId });
  const response = await makeApp().request(
    "/protected",
    { headers: { Authorization: `Bearer ${token}` } },
    env,
  );
  return { response, db };
}

describe("requireFeatureEnabled", () => {
  it("allows an entitled tenant with the required capability", async () => {
    const { response } = await request(1, [PERMISSIONS.READ_PATIENTS]);
    expect(response.status).toBe(200);
  });

  it("returns 404 for an admin when the module is disabled", async () => {
    const { response } = await request(0, [PERMISSIONS.ALL]);
    expect(response.status).toBe(404);
    expect((await response.json()) as { code: string }).toMatchObject({ code: "not_found" });
  });

  it("returns 404 before checking permissions when the module is disabled", async () => {
    const { response } = await request(0, []);
    expect(response.status).toBe(404);
  });

  it("returns 403 when the module is enabled but permission is absent", async () => {
    const { response } = await request(1, []);
    expect(response.status).toBe(403);
  });

  it("fails closed when the feature is not registered", async () => {
    const { response } = await request(undefined, [PERMISSIONS.ALL]);
    expect(response.status).toBe(404);
  });

  it("uses the authenticated tenant for the entitlement lookup", async () => {
    const { response, db } = await request(1, [PERMISSIONS.READ_PATIENTS], { tenantId: "tenant-b" });
    expect(response.status).toBe(200);
    const lookup = db.__sqlContaining("FROM platform_feature_flags");
    expect(lookup).toHaveLength(1);
    expect(lookup[0].binds).toEqual(["tenant-b", FEATURE_FLAGS.CLINICAL_COPILOT_ENDODONTIC_PAIN_V1]);
  });
});
