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
import registerRoutes from "./routes/register";
import inviteRoutes from "./routes/invite";
import dashboardRoutes from "./routes/dashboard";
import aiRoutes from "./routes/ai";
import patientsRoutes from "./routes/patients";
import visitsRoutes from "./routes/visits";
import treatmentPlansRoutes from "./routes/treatment-plans";
import treatmentPlansExtras from "./routes/treatment-plans-extras";
import paymentsRoutes from "./routes/payments";
import medicalAlertsRoutes from "./routes/medical-alerts";
import auditRoutes from "./routes/audit";
import usersRoutes from "./routes/users";
import rolesRoutes from "./routes/roles";
import filesRoutes from "./routes/files";
import clinicRoutes from "./routes/clinic";
import patientImagesRoutes from "./routes/patient-images";
import appointmentsRoutes from "./routes/appointments";
import schedulesRoutes from "./routes/schedules";

export type Env = {
  DB: D1Database;
  FILES: R2Bucket;
  JOBS: Queue;
  AI: unknown; // Cloudflare Workers AI binding
  ENVIRONMENT: string;
  FRONTEND_ORIGIN: string;
  ENCRYPTION_KEY?: string; // 64-char hex (32 bytes) — AES-256-GCM key for encrypting secrets at rest
  LARK_APP_ID?: string;    // DEPRECATED — kept as global fallback; prefer per-tenant lark_configs
  LARK_APP_SECRET?: string;// DEPRECATED — kept as global fallback; prefer per-tenant lark_configs
  JWT_SECRET?: string;
  R2_ACCOUNT_ID?: string;
  R2_ACCESS_KEY_ID?: string;
  R2_SECRET_ACCESS_KEY?: string;
};

const app = new Hono<{ Bindings: Env }>();

app.use("*", logger());

app.use(
  "*",
  cors({
    origin: (origin, c) => {
      const allowed = c.env.FRONTEND_ORIGIN || "";
      const isProd = c.env.ENVIRONMENT === "production";

      // Helper: match origin against allowed pattern.
      // Wildcard `*` matches an OPTIONAL single subdomain segment (e.g. "abc." or empty).
      // Examples:
      //   "https://*.example.com" matches "https://example.com" AND "https://abc.example.com"
      const matches = (origin: string, pattern: string): boolean => {
        if (origin === pattern) return true;
        if (!pattern.includes("*")) return false;
        // Escape ALL regex metachars including * itself, then unescape * -> optional subdomain
        const escaped = pattern.replace(/[.+?^${}()|[\]\\*]/g, "\\$&");
        // Replace each `\*` with `([a-z0-9-]+\.)?` (optional single subdomain)
        const final = escaped.replace(/\\\*/g, "([a-z0-9-]+\\.)?");
        const regex = new RegExp("^" + final + "$");
        return regex.test(origin);
      };

      // Production: must have a valid FRONTEND_ORIGIN
      if (isProd && (allowed === "" || allowed === "*")) {
        console.error(
          "[cors] FRONTEND_ORIGIN must be a specific URL in production",
        );
        return ""; // hono/cors treats empty origin as no-CORS
      }

      if (allowed === "" || allowed === "*") {
        // Dev: allow any origin
        return origin || "*";
      }

      // Production: check if origin matches allowed (or allowed pattern)
      if (origin && matches(origin, allowed)) {
        return origin; // reflect the matched origin
      }

      // Reject
      return "";
    },
    allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization"],
    credentials: true,
    maxAge: 86400,
  }),
);

// Health
app.get("/api/health", (c) =>
  c.json({
    ok: true,
    env: c.env.ENVIRONMENT,
    timestamp: new Date().toISOString(),
  }),
);

// Auth
app.route("/api/auth", authRoutes);

// Registration (public)
app.route("/api/register", registerRoutes);
app.route("/api/invites", inviteRoutes);

// Dashboard
app.route("/api/dashboard", dashboardRoutes);

// AI
app.route("/api/ai", aiRoutes);

// Clinical — patients (also handles /:id/alerts via sub-router)
app.route("/api/patients", patientsRoutes);
app.route("/api/patients", medicalAlertsRoutes);

// Visits
app.route("/api/visits", visitsRoutes);

// Treatment plans (CRUD + /items + /approve via plans router; /pdf + /lark-handover via extras)
app.route("/api/treatment-plans", treatmentPlansRoutes);
app.route("/api/treatment-plans", treatmentPlansExtras);

// Payments
app.route("/api/payments", paymentsRoutes);

// Operations
app.route("/api/audit-logs", auditRoutes);
app.route("/api/users", usersRoutes);
app.route("/api/roles", rolesRoutes);
app.route("/api/files", filesRoutes);
app.route("/api/clinic", clinicRoutes);
app.route("/api/patient-images", patientImagesRoutes);

// Appointments + Schedules
app.route("/api/appointments", appointmentsRoutes);
app.route("/api/schedules", schedulesRoutes);

// 404
app.notFound((c) => c.json({ error: "Not found", code: "not_found" }, 404));

// Error handler
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
  console.error("Unhandled error:", err.message);
  return c.json({ error: "Internal server error", code: "internal_error" }, 500);
});

// Queue consumer handler (Phase 5)
import { larkRetryConsumer } from "./jobs/lark-retry";
import type { MessageBatch } from "@cloudflare/workers-types";
import type { LarkRetryMessage } from "./jobs/lark-retry";

async function queueHandler(
  batch: MessageBatch<LarkRetryMessage>,
  env: Env,
): Promise<void> {
  await larkRetryConsumer(batch, env);
}

// Default export: fetch + queue
export default {
  fetch: (request: Request, env: Env, ctx: ExecutionContext) =>
    app.fetch(request, env, ctx),
  queue: queueHandler,
};