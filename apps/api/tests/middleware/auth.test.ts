import { describe, it, expect } from "vitest";
import { Hono } from "hono";
import { requireAuth, getJwt } from "../../src/middleware/auth";
import type { Env } from "../../src/index";
import type { AuthContext } from "../../src/middleware/auth";
import { signJwt } from "../../src/lib/jwt";
import { TEST_SECRET, USER_A, TENANT_A, buildEnv } from "../helpers/jwt";
import { createTestApp } from "../helpers/app";
import { createMockD1 } from "../helpers/mock-db";

function makeApp() {
  const app = createTestApp() as Hono<{ Bindings: Env; Variables: AuthContext }>;
  app.use("*", requireAuth());
  app.get("/protected", (c) => {
    const jwt = getJwt(c);
    return c.json({ ok: true, sub: jwt.sub, tenant: jwt.tenant_id });
  });
  return app;
}

function makeEnv() {
  const db = createMockD1();
  return buildEnv(db, { JWT_SECRET: TEST_SECRET });
}

async function makeValidToken(): Promise<string> {
  return (
    await signJwt(
      {
        sub: USER_A,
        tenant_id: TENANT_A,
        branch_id: "branch-1",
        role_id: "role-1",
        permissions: ["read_patients"],
      },
      TEST_SECRET,
    )
  ).token;
}

describe("requireAuth middleware", () => {
  it("rejects request without Authorization header", async () => {
    const app = makeApp();
    const env = makeEnv();
    const res = await app.request("/protected", {}, env);
    expect(res.status).toBe(401);
    const body = (await res.json()) as { error: string; code: string };
    expect(body.code).toBe("unauthorized");
  });

  it("rejects malformed Authorization header (no Bearer prefix)", async () => {
    const app = makeApp();
    const env = makeEnv();
    const res = await app.request(
      "/protected",
      { headers: { Authorization: "Token abc" } },
      env,
    );
    expect(res.status).toBe(401);
  });

  it("rejects empty Bearer token", async () => {
    const app = makeApp();
    const env = makeEnv();
    const res = await app.request(
      "/protected",
      { headers: { Authorization: "Bearer " } },
      env,
    );
    expect(res.status).toBe(401);
  });

  it("rejects token with invalid signature", async () => {
    const app = makeApp();
    const env = makeEnv();
    const validToken = await makeValidToken();
    const res = await app.request(
      "/protected",
      { headers: { Authorization: `Bearer ${validToken.slice(0, -5)}XXXXX` } },
      env,
    );
    expect(res.status).toBe(401);
  });

  it("rejects expired token", async () => {
    const { SignJWT } = await import("jose");
    const expired = await new SignJWT({
      tenant_id: TENANT_A,
      branch_id: "b",
      role_id: "r",
      permissions: [],
    })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject(USER_A)
      .setIssuedAt(Math.floor(Date.now() / 1000) - 7200)
      .setExpirationTime(Math.floor(Date.now() / 1000) - 3600)
      .sign(new TextEncoder().encode(TEST_SECRET));

    const app = makeApp();
    const env = makeEnv();
    const res = await app.request(
      "/protected",
      { headers: { Authorization: `Bearer ${expired}` } },
      env,
    );
    expect(res.status).toBe(401);
  });

  it("rejects token signed with different secret", async () => {
    const wrongToken = (
      await signJwt(
        {
          sub: USER_A,
          tenant_id: TENANT_A,
          branch_id: "branch-1",
          role_id: "role-1",
          permissions: [],
        },
        "different-secret",
      )
    ).token;

    const app = makeApp();
    const env = makeEnv();
    const res = await app.request(
      "/protected",
      { headers: { Authorization: `Bearer ${wrongToken}` } },
      env,
    );
    expect(res.status).toBe(401);
  });

  it("accepts valid token and attaches JWT to context", async () => {
    const validToken = await makeValidToken();
    const app = makeApp();
    const env = makeEnv();
    const res = await app.request(
      "/protected",
      { headers: { Authorization: `Bearer ${validToken}` } },
      env,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; sub: string; tenant: string };
    expect(body.ok).toBe(true);
    expect(body.sub).toBe(USER_A);
    expect(body.tenant).toBe(TENANT_A);
  });

  it("getJwt throws when middleware not registered", () => {
    const app = new Hono<{ Bindings: Env; Variables: AuthContext }>();
    app.get("/no-auth", (c) => {
      throw new Error("JWT not set");
    });
    // Verify the error message matches
    expect(() => getJwt({ get: () => undefined } as any)).toThrow("JWT not set");
  });
});