/**
 * Audit middleware: writes audit_logs entries for mutations.
 *
 * Strategy: Wrap a route handler with this middleware AFTER auth + RBAC.
 * On success (next() resolves), it reads the response body for the created/updated
 * entity id and writes a single audit row.
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
  return async (c) => {
    await c.var; // ensure auth has run
    const jwt = getJwt(c);

    // Run the downstream handler
    await c.var;
    const res = c.res;

    // Only audit successful (2xx) mutations
    if (res.status < 200 || res.status >= 300) return;

    // Best-effort parse JSON to extract entity id.
    // If body isn't JSON or has no id, log with empty entity_id.
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

    const ip = c.req.header("cf-connecting-ip") ?? c.req.header("x-forwarded-for") ?? "";

    await c.env.DB.prepare(
      `INSERT INTO audit_logs
         (id, tenant_id, user_id, action, entity_type, entity_id, ip_address)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(newId(), jwt.tenant_id, jwt.sub, action, entityType, entityId, ip)
      .run();
  };
}