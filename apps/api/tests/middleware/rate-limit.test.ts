import { describe, it, expect, beforeEach } from "vitest";
import { Hono } from "hono";
import { rateLimit } from "../../src/middleware/rate-limit";
import { createMockD1, type MockD1 } from "../helpers/mock-db";
import { buildEnv } from "../helpers/jwt";
import type { Env } from "../../src/index";
import { createTestApp } from "../helpers/app";

describe("rateLimit middleware", () => {
  let env: Env;

  beforeEach(() => {
    env = buildEnv(createMockD1());
  });

  it("allows first request", async () => {
    const db = env.DB as unknown as MockD1;
    db.__reset();

    const app = new Hono<{ Bindings: Env }>();
    app.use("*", rateLimit({ windowSeconds: 60, maxRequests: 3 }));
    app.get("/test", (c) => c.json({ ok: true }));

    const res = await app.request(
      "/test",
      { headers: { "cf-connecting-ip": "1.2.3.4" } },
      env,
    );
    expect(res.status).toBe(200);
  });

  it("allows up to maxRequests", async () => {
    const db = createMockD1({
      rowsByFragment: new Map(), // no RETURNING row → count defaults to 1
    });
    env = buildEnv(db);

    const app = new Hono<{ Bindings: Env }>();
    app.use("*", rateLimit({ windowSeconds: 60, maxRequests: 3 }));
    app.get("/test", (c) => c.json({ ok: true }));

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
    // Mock returns count > max so we trigger the rejection path.
    const db = createMockD1({
      rowsByFragment: new Map([["rate_limit_buckets", [{ count: 10 }]]]),
    });
    env = buildEnv(db);

    const app = createTestApp() as Hono<{ Bindings: Env }>;
    app.use("*", rateLimit({ windowSeconds: 60, maxRequests: 5 }));
    app.get("/test", (c) => c.json({ ok: true }));

    const res = await app.request(
      "/test",
      { headers: { "cf-connecting-ip": "9.10.11.12" } },
      env,
    );
    expect(res.status).toBe(429);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe("rate_limited");
  });

  it("scopes buckets per IP (different IPs not affected)", async () => {
    // The bucket key includes IP — confirm by checking the bind value.
    let lastBind1: unknown;
    const db: MockD1 = {
      ...createMockD1(),
      prepare: (sql: string) => ({
        bind: (...binds: unknown[]) => {
          lastBind1 = binds[0];
          return {
            async first<T>() {
              return null as T | null;
            },
            async all<T>() {
              return { results: [] as T[] };
            },
            async run() {
              return { meta: { changes: 0 } };
            },
          };
        },
      }),
      __calls: [],
      __sqlContaining: () => [],
      __reset: () => {},
    } as unknown as MockD1;
    env = buildEnv(db);

    const app = new Hono<{ Bindings: Env }>();
    app.use("*", rateLimit({ windowSeconds: 60, maxRequests: 100 }));
    app.get("/test", (c) => c.json({ ok: true }));

    await app.request(
      "/test",
      { headers: { "cf-connecting-ip": "100.100.100.100" } },
      env,
    );
    expect(lastBind1).toContain("100.100.100.100");

    await app.request(
      "/test",
      { headers: { "cf-connecting-ip": "200.200.200.200" } },
      env,
    );
    expect(lastBind1).toContain("200.200.200.200");
  });

  it("uses unknown fallback when no IP header", async () => {
    let lastBind1: unknown;
    const db: MockD1 = {
      ...createMockD1(),
      prepare: (sql: string) => ({
        bind: (...binds: unknown[]) => {
          lastBind1 = binds[0];
          return {
            async first<T>() {
              return null as T | null;
            },
            async all<T>() {
              return { results: [] as T[] };
            },
            async run() {
              return { meta: { changes: 0 } };
            },
          };
        },
      }),
      __calls: [],
      __sqlContaining: () => [],
      __reset: () => {},
    } as unknown as MockD1;
    env = buildEnv(db);

    const app = new Hono<{ Bindings: Env }>();
    app.use("*", rateLimit({ windowSeconds: 60, maxRequests: 100 }));
    app.get("/test", (c) => c.json({ ok: true }));

    await app.request("/test", {}, env);
    expect(lastBind1).toContain("unknown");
  });
});