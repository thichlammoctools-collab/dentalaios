/**
 * Audit middleware: writes audit_logs entries for mutations.
 *
 * Strategy: Run AFTER the downstream handler so we can read `c.res` (status + body).
 * On success (2xx), extract entity_id from JSON response and write a single audit row.
 *
 * Architecture rule #8: NEVER log patient data.
 * Audit entries contain: user_id, action, entity_type, entity_id, ip_address, timestamp.
 * No PII, no diagnosis, no procedure details.
 *
 * Usage:
 *   app.post("/api/patients",
 *     requireAuth(),
 *     requirePermission(PERMISSIONS.WRITE_PATIENTS),
 *     auditLog("create", "patient"),
 *     zValidator("json", patientCreateSchema),
 *     handler
 *   )
 */

import type { MiddlewareHandler } from "hono";
import type { Env } from "../index";
import { newId } from "../lib/ids";
import type { AuthContext } from "./auth";
import { getJwt } from "./auth";

export function auditLog(
  action: string,
  entityType: string,
  options?: {
    /** Extract entity_id from JSON response. Defaults to `.id`. */
    entityIdFrom?: (body: unknown) => string | undefined;
  },
): MiddlewareHandler<{ Bindings: Env; Variables: AuthContext }> {
  return async (c, next) => {
    // Run the downstream handler first
    await next();

    // Wrap the audit decision + write in try/catch so an audit failure never
    // breaks the user-facing response. The audit row is best-effort.
    try {
      const res = c.res;
      // Only audit successful (2xx) mutations
      if (res.status < 200 || res.status >= 300) return;

      // Best-effort parse JSON to extract entity id.
      let entityId = "";
      try {
        const cloned = res.clone();
        const body = (await cloned.json()) as unknown;
        if (options?.entityIdFrom) {
          const id = options.entityIdFrom(body);
          if (typeof id === "string") entityId = id;
        } else if (body && typeof body === "object" && "id" in body) {
          const id = (body as { id?: unknown }).id;
          if (typeof id === "string") entityId = id;
        }
      } catch {
        // body wasn't JSON; skip entity_id
      }

      // Read JWT (set by requireAuth middleware which runs before this)
      const jwt = getJwt(c);

      const ip =
        c.req.header("cf-connecting-ip") ??
        c.req.header("x-forwarded-for") ??
        "";

      await c.env.DB.prepare(
        `INSERT INTO audit_logs
           (id, tenant_id, user_id, action, entity_type, entity_id, ip_address)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
        .bind(newId(), jwt.tenant_id, jwt.sub, action, entityType, entityId, ip)
        .run();

      // Dashboard clients receive only a data-free invalidation and then make
      // their own authorized aggregate request. A failed broadcast is non-fatal.
      if (c.env.DASHBOARD_HUB) {
        try {
          const hub = c.env.DASHBOARD_HUB.get(c.env.DASHBOARD_HUB.idFromName(jwt.tenant_id));
          await hub.fetch("https://dashboard-hub/publish", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ entity_type: entityType }),
          });
        } catch (broadcastError) {
          console.error("[dashboard] failed to publish invalidation:", broadcastError instanceof Error ? broadcastError.message : String(broadcastError));
        }
      }
    } catch (err) {
      console.error(
        `[audit] failed to write log action=${action} entity=${entityType}:`,
        err instanceof Error ? err.message : String(err),
      );
    }
  };
}
