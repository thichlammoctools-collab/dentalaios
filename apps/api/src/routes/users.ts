import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { userCreateSchema, userUpdateSchema } from "@shared/validation";
import { PERMISSIONS } from "@shared/constants";
import type { Env } from "../index";
import { requireAuth, getJwt } from "../middleware/auth";
import { requirePermission } from "../middleware/rbac";
import { auditLog } from "../middleware/audit";
import type { AuthContext } from "../middleware/auth";
import { usersService } from "../services/users.service";
import { createUsersRepository } from "../repositories/users.repo";
import { ForbiddenError } from "../lib/errors";

const router = new Hono<{ Bindings: Env; Variables: AuthContext }>();

router.use("*", requireAuth());

// GET /api/users
router.get(
  "/",
  requirePermission(PERMISSIONS.MANAGE_USERS),
  async (c) => {
    const jwt = getJwt(c);
    const items = await usersService.list(c.env.DB, jwt.tenant_id);
    return c.json({ items, total: items.length });
  },
);

// GET /api/users/branch/:branchId — list users by branch for dropdowns
router.get(
  "/branch/:branchId",
  requirePermission(PERMISSIONS.READ_PATIENTS),
  async (c) => {
    const jwt = getJwt(c);
    const items = await usersService.listByBranch(c.env.DB, jwt.tenant_id, c.req.param("branchId"));
    return c.json({ items, total: items.length });
  },
);

// POST /api/users
router.post(
  "/",
  requirePermission(PERMISSIONS.MANAGE_USERS),
  auditLog("create", "user"),
  zValidator("json", userCreateSchema),
  async (c) => {
    const jwt = getJwt(c);
    const ownerRole = await c.env.DB
      .prepare("SELECT id FROM roles WHERE id = ? AND tenant_id = ? AND system_key = 'admin'")
      .bind(jwt.role_id, jwt.tenant_id)
      .first<{ id: string }>();
    if (!ownerRole) {
      throw new ForbiddenError("Chỉ chủ phòng khám mới có thể tạo người dùng");
    }
    const data = c.req.valid("json");
    const created = await usersService.create(c.env.DB, jwt.tenant_id, data);
    return c.json(created, 201);
  },
);

// GET /api/users/:id
router.get(
  "/:id",
  requirePermission(PERMISSIONS.MANAGE_USERS),
  async (c) => {
    const jwt = getJwt(c);
    const user = await createUsersRepository(c.env.DB).getById(jwt.tenant_id, c.req.param("id"));
    if (!user) return c.json({ error: "User not found", code: "not_found" }, 404);
    return c.json(user);
  },
);

// PUT /api/users/:id
router.put(
  "/:id",
  requirePermission(PERMISSIONS.MANAGE_USERS),
  auditLog("update", "user"),
  zValidator("json", userUpdateSchema),
  async (c) => {
    const jwt = getJwt(c);
    const data = c.req.valid("json");
    const updated = await usersService.update(c.env.DB, jwt.tenant_id, c.req.param("id"), data);
    if (!updated) return c.json({ error: "User not found", code: "not_found" }, 404);
    return c.json(updated);
  },
);

// DELETE /api/users/:id
router.delete(
  "/:id",
  requirePermission(PERMISSIONS.MANAGE_USERS),
  auditLog("delete", "user"),
  async (c) => {
    const jwt = getJwt(c);
    const ok = await usersService.remove(c.env.DB, jwt.tenant_id, c.req.param("id"));
    if (!ok) return c.json({ error: "User not found", code: "not_found" }, 404);
    return c.json({ ok: true });
  },
);

export default router;
