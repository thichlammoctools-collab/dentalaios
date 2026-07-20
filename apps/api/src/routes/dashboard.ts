/**
 * Dashboard stats route:
 *   GET /api/dashboard/stats — branch workflow KPIs
 *   GET /api/dashboard/management — tenant operational snapshot
 */

import { Hono } from "hono";
import { PERMISSIONS } from "@shared/constants";
import { managementDashboardQuerySchema } from "@shared/validation";
import type { Env } from "../index";
import { requireAuth, getJwt } from "../middleware/auth";
import { requirePermission } from "../middleware/rbac";
import type { AuthContext } from "../middleware/auth";
import { dashboardService } from "../services/dashboard.service";

const router = new Hono<{ Bindings: Env; Variables: AuthContext }>();

// Browser WebSockets cannot attach an Authorization header. The opaque,
// short-lived ticket minted below is the authorization factor for this single
// upgrade and is atomically consumed by the tenant-specific Durable Object.
router.get("/stream/:tenantId", async (c) => {
  const ticket = new URL(c.req.url).searchParams.get("ticket");
  if (!ticket) return c.json({ error: "Missing stream ticket", code: "validation_error" }, 400);
  const namespace = c.env.DASHBOARD_HUB;
  if (!namespace) return c.json({ error: "Dashboard live updates are unavailable", code: "internal_error" }, 503);

  const request = new Request(`https://dashboard-hub/connect?ticket=${encodeURIComponent(ticket)}`, {
    headers: c.req.raw.headers,
  });
  // Altering the routing segment only selects another object; it cannot make
  // a ticket valid there because tickets are persisted in their origin tenant
  // object and atomically consumed before the socket is accepted.
  const hub = namespace.get(namespace.idFromName(c.req.param("tenantId")));
  return hub.fetch(request);
});

router.use("*", requireAuth());

// GET /api/dashboard/stats
router.get("/stats", requirePermission(PERMISSIONS.READ_PATIENTS), async (c) => {
  const jwt = getJwt(c);
  const stats = await dashboardService.getStats(c.env.DB, jwt.tenant_id);
  return c.json(stats);
});

// GET /api/dashboard/management?range=30&branch_id=<id>
router.get("/management", requirePermission(PERMISSIONS.VIEW_MANAGEMENT_DASHBOARD), async (c) => {
  const parsed = managementDashboardQuerySchema.safeParse(Object.fromEntries(new URL(c.req.url).searchParams));
  if (!parsed.success) return c.json({ error: parsed.error.issues[0]?.message ?? "Invalid dashboard filter", code: "validation_error" }, 400);
  const jwt = getJwt(c);
  const snapshot = await dashboardService.getManagementSnapshot(c.env.DB, jwt.tenant_id, parsed.data);
  return c.json(snapshot);
});

// POST /api/dashboard/stream-ticket
router.post("/stream-ticket", requirePermission(PERMISSIONS.VIEW_MANAGEMENT_DASHBOARD), async (c) => {
  const jwt = getJwt(c);
  const namespace = c.env.DASHBOARD_HUB;
  if (!namespace) return c.json({ error: "Dashboard live updates are unavailable", code: "internal_error" }, 503);
  const hub = namespace.get(namespace.idFromName(jwt.tenant_id));
  const response = await hub.fetch("https://dashboard-hub/tickets", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tenant_id: jwt.tenant_id, user_id: jwt.sub }),
  });
  if (!response.ok) return c.json({ error: "Could not create dashboard stream", code: "internal_error" }, 500);
  const ticket = await response.json<{ ticket: string; expires_at: string }>();
  return c.json({ ...ticket, path: `/api/dashboard/stream/${encodeURIComponent(jwt.tenant_id)}?ticket=${encodeURIComponent(ticket.ticket)}` });
});

export default router;
