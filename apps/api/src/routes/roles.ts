import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { roleCreateSchema, roleUpdateSchema } from "@shared/validation";
import { PERMISSIONS } from "@shared/constants";
import type { Env } from "../index";
import { requireAuth, getJwt } from "../middleware/auth";
import { requirePermission } from "../middleware/rbac";
import { auditLog } from "../middleware/audit";
import type { AuthContext } from "../middleware/auth";
import { rolesService } from "../services/roles.service";
import { ForbiddenError } from "../lib/errors";

/**
 * Permission-set changes are security-sensitive. A user who merely has
 * `manage_roles` must not be able to add `manage_users` to their own role and
 * bootstrap into a tenant administrator. Only an existing `all` administrator
 * can create or change a role's permission set.
 */
function requirePermissionSetAdmin(jwt: ReturnType<typeof getJwt>, hasPermissionsField: boolean): void {
  if (hasPermissionsField && !jwt.permissions.includes(PERMISSIONS.ALL)) {
    throw new ForbiddenError("Chỉ quản trị viên mới có thể thay đổi quyền của vai trò");
  }
}

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

// POST /api/roles
router.post(
  "/",
  requirePermission(PERMISSIONS.MANAGE_ROLES),
  auditLog("create", "role"),
  zValidator("json", roleCreateSchema),
  async (c) => {
    const jwt = getJwt(c);
    const data = c.req.valid("json");
    requirePermissionSetAdmin(jwt, true);
    const role = await rolesService.create(c.env.DB, jwt.tenant_id, data);
    return c.json(role, 201);
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
    requirePermissionSetAdmin(jwt, data.permissions !== undefined);
    const updated = await rolesService.update(c.env.DB, jwt.tenant_id, c.req.param("id"), data);
    if (!updated) return c.json({ error: "Role not found", code: "not_found" }, 404);
    return c.json(updated);
  },
);

// DELETE /api/roles/:id
// Deleting a role can lock users out or alter administrative controls, so it
// is reserved for an already full administrator rather than any role manager.
router.delete(
  "/:id",
  requirePermission(PERMISSIONS.MANAGE_ROLES),
  auditLog("delete", "role"),
  async (c) => {
    const jwt = getJwt(c);
    if (!jwt.permissions.includes(PERMISSIONS.ALL)) {
      throw new ForbiddenError("Chỉ quản trị viên mới có thể xóa vai trò");
    }
    const ok = await rolesService.remove(c.env.DB, jwt.tenant_id, c.req.param("id"));
    if (!ok) return c.json({ error: "Role not found", code: "not_found" }, 404);
    return c.json({ ok: true });
  },
);

export default router;
