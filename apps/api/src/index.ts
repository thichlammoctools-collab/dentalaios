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
import { AppError } from "./lib/errors";

import authRoutes from "./routes/auth";
import patientsRoutes from "./routes/patients";
import visitsRoutes from "./routes/visits";
import treatmentPlansRoutes from "./routes/treatment-plans";
import paymentsRoutes from "./routes/payments";

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

// Logger middleware — Hono's logger() logs method/path/status only,
// never bodies. Safe per architecture rule #8.
app.use("*", logger());

// CORS — open in dev; tighten via FRONTEND_ORIGIN in production via env override.
app.use(
  "*",
  cors({
    origin: (origin, c) => {
      const allowed = c.env.FRONTEND_ORIGIN || "*";
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

// Mount feature routes
app.route("/api/auth", authRoutes);
app.route("/api/patients", patientsRoutes);
app.route("/api/visits", visitsRoutes);
app.route("/api/treatment-plans", treatmentPlansRoutes);
app.route("/api/payments", paymentsRoutes);

// 404 fallback
app.notFound((c) => c.json({ error: "Not found", code: "not_found" }, 404));

// Error handler — map AppError to typed JSON responses.
// Never leak stack traces or DB errors.
app.onError((err, c) => {
  if (err instanceof AppError) {
    return c.json(
      {
        error: err.message,
        code: err.code,
        ...(err.details !== undefined ? { details: err.details } : {}),
      },
      err.status as 400 | 401 | 403 | 404 | 409 | 422 | 500,
    );
  }
  // Unknown error — log message only, never clinical data
  console.error("Unhandled error:", err.message);
  return c.json({ error: "Internal server error", code: "internal_error" }, 500);
});

export default {
  fetch: (request: Request, env: Env, ctx: ExecutionContext) =>
    app.fetch(request, env, ctx),
};