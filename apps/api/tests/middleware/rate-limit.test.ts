import { describe, it, expect } from "vitest";
import { Hono } from "hono";
import { rateLimit } from "../../src/middleware/rate-limit";
import { createMockD1 } from "../helpers/mock-db";
import { buildEnv } from "../helpers/jwt";
import type { Env } from "../../src/index";
import { createTestApp } from "../helpers/app";

function makeApp() {
  const app = createTestApp() as Hono<{ Bindings: Env }>;
  app.use("*", rateLimit({ windowSeconds: 60, maxRequests: 3 }));
  app.get("/test", (c) => c.json({ ok: true }));
  return app;
}

describe("rateLimit middleware", () => {
  it("allows first request", async () => {
    const app = makeApp();
    const db = createMockD1();
    const env = buildEnv(db, { JWT_SECRET: "test" });
    const res = await app.request(
      "/test",
      { headers: { "cf-connecting-ip": "1.2.3.4" } },
      env,
    );
    expect(res.status).toBe(200);
  });

  it("allows up to maxRequests", async () => {
    const app = makeApp();
    const db = createMockD1({
      rowsByFragment: new Map(), // count defaults to 1
    });
    const env = buildEnv(db, { JWT_SECRET: "test" });

    for (let i = 0; i < 3; i++) {
      const res = await app.request(
        "/test",
        { headers: { "cf-connecting-ip": "5.6.7.8" } },
        env,
      );
      expect(res.status).toBe(200);
    }
  });

  it("blocks when count exceeds maxRequests", async () => {
    const app = makeApp();
    const db = createMockD1({
      rowsByFragment: new Map([["rate_limit_buckets", [{ count: 10 }]]]),
    });
    const env = buildEnv(db, { JWT_SECRET: "test" });

    const res = await app.request(
      "/test",
      { headers: { "cf-connecting-ip": "9.10.11.12" } },
      env,
    );
    expect(res.status).toBe(429);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe("rate_limited");
  });
});