import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { roleUpdateSchema } from "@shared/validation";
import { PERMISSIONS } from "@shared/constants";
import type { Env } from "../index";
import { requireAuth, getJwt } from "../middleware/auth";
import { requirePermission } from "../middleware/rbac";
import { auditLog } from "../middleware/audit";
import type { AuthContext } from "../middleware/auth";
import { rolesService } from "../services/roles.service";

const router = new Hono<{ Bindings: Env; Variables: AuthContext }>();

router.use("*", requireAuth());

// GET /api/roles
router.get(
  "/",
  requirePermission(PERMISSIONS.MANAGE_ROLES),
  async (c) => {
    const jwt = getJwt(c);
    const items = await rolesService.list(c.env.DB, jwt.tenant_id);
    return c.json({ items, total: items.length });
  },
);

// PUT /api/roles/:id
router.put(
  "/:id",
  requirePermission(PERMISSIONS.MANAGE_ROLES),
  auditLog("update", "role"),
  zValidator("json", roleUpdateSchema),
  async (c) => {
    const jwt = getJwt(c);
    const data = c.req.valid("json");
    const updated = await rolesService.update(c.env.DB, jwt.tenant_id, c.req.param("id"), data);
    if (!updated) return c.json({ error: "Role not found", code: "not_found" }, 404);
    return c.json(updated);
  },
);

export default router;