/**
 * Dashboard stats route:
 *   GET /api/dashboard/stats — aggregate KPIs
 */

import { Hono } from "hono";
import { PERMISSIONS } from "@shared/constants";
import type { Env } from "../index";
import { requireAuth, getJwt } from "../middleware/auth";
import { requirePermission } from "../middleware/rbac";
import type { AuthContext } from "../middleware/auth";
import { dashboardService } from "../services/dashboard.service";

const router = new Hono<{ Bindings: Env; Variables: AuthContext }>();

router.use("*", requireAuth());
router.use("*", requirePermission(PERMISSIONS.READ_PATIENTS));

// GET /api/dashboard/stats
router.get("/stats", async (c) => {
  const jwt = getJwt(c);
  const stats = await dashboardService.getStats(c.env.DB, jwt.tenant_id);
  return c.json(stats);
});

export default router;
