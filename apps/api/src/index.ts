/**
 * Dental Empire OS Clinic — API Worker
 *
 * Architecture rules (from #dentalaiosguide.md.txt):
 * 1. Frontend talks only to Worker API.
 * 2. Worker API talks to D1 and R2 through bindings.
 * 3. Every clinical table includes tenant_id.
 * 4. Every clinical action writes an audit log.
 * 5. R2 buckets are private.
 * 6. File access is always checked by Worker.
 * 7. Lark receives only operational fields.
 * 8. Do not place patient data in logs.
 * 9. Do not trust frontend role checks.
 * 10. Keep repository interfaces so D1 can migrate later.
 */

import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";

export type Env = {
  DB: D1Database;
  FILES: R2Bucket;
  JOBS: Queue;
  ENVIRONMENT: string;
  FRONTEND_ORIGIN: string;
  LARK_APP_ID?: string;
  LARK_APP_SECRET?: string;
  JWT_SECRET?: string;
};

const app = new Hono<{ Bindings: Env }>();

// Logger middleware — Hono's logger() must NEVER be passed to clinical values.
// It logs method/path/status only, never bodies. Safe per architecture rule #8.
app.use("*", logger());

// CORS — open in dev; tighten via FRONTEND_ORIGIN in production via env override.
app.use(
  "*",
  cors({
    origin: (origin, c) => {
      const allowed = c.env.FRONTEND_ORIGIN || "*";
      // In dev allow any origin (vite may use random ports); prod uses FRONTEND_ORIGIN.
      return allowed === "*" ? origin || "*" : allowed;
    },
    allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization"],
    credentials: true,
    maxAge: 86400,
  }),
);

// Health endpoint — used by verification step in Phase 1.
app.get("/api/health", (c) =>
  c.json({
    ok: true,
    env: c.env.ENVIRONMENT,
    timestamp: new Date().toISOString(),
  }),
);

// 404 fallback
app.notFound((c) => c.json({ error: "Not found" }, 404));

// Error handler — never leak stack traces or DB errors to clients.
app.onError((err, c) => {
  console.error("Unhandled error:", err.message);
  return c.json({ error: "Internal server error" }, 500);
});

export default {
  fetch: (request: Request, env: Env, ctx: ExecutionContext) =>
    app.fetch(request, env, ctx),
};