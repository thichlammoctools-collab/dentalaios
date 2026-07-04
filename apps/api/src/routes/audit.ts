import { Hono } from "hono";
import { PERMISSIONS } from "@shared/constants";
import type { Env } from "../index";
import { requireAuth, getJwt } from "../middleware/auth";
import { requirePermission } from "../middleware/rbac";
import type { AuthContext } from "../middleware/auth";
import { auditService } from "../services/audit.service";

const router = new Hono<{ Bindings: Env; Variables: AuthContext }>();

router.use("*", requireAuth());

// GET /api/audit-logs
router.get(
  "/",
  requirePermission(PERMISSIONS.MANAGE_USERS),
  async (c) => {
    const jwt = getJwt(c);
    const url = new URL(c.req.url);
    const items = await auditService.list(c.env.DB, jwt.tenant_id, {
      userId: url.searchParams.get("user_id") ?? undefined,
      action: url.searchParams.get("action") ?? undefined,
      entityType: url.searchParams.get("entity_type") ?? undefined,
      limit: Number(url.searchParams.get("limit") ?? 100),
      offset: Number(url.searchParams.get("offset") ?? 0),
    });
    return c.json({ items, total: items.length });
  },
);

export default router;