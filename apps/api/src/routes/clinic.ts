/**
 * Clinic settings routes:
 *   GET  /api/clinic               — get tenant + all branches
 *   PATCH /api/clinic             — update tenant info (admin only)
 *   POST /api/clinic/branches      — create a new branch
 *   PATCH /api/clinic/branches/:id — update a branch
 *   DELETE /api/clinic/branches/:id — delete a branch
 */

import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { PERMISSIONS } from "@shared/constants";
import type { Env } from "../index";
import { requireAuth, getJwt } from "../middleware/auth";
import { requirePermission } from "../middleware/rbac";
import { auditLog } from "../middleware/audit";
import type { AuthContext } from "../middleware/auth";
import { clinicService } from "../services/clinic.service";
import { NotFoundError } from "../lib/errors";

const router = new Hono<{ Bindings: Env; Variables: AuthContext }>();

router.use("*", requireAuth());

// GET /api/clinic — get tenant + branches
router.get("/", async (c) => {
  const jwt = getJwt(c);
  const [tenant, branches] = await Promise.all([
    clinicService.getTenant(c.env.DB, jwt.tenant_id),
    clinicService.listBranches(c.env.DB, jwt.tenant_id),
  ]);
  if (!tenant) throw new NotFoundError("Tenant not found");
  return c.json({ tenant, branches });
});

// PATCH /api/clinic — update tenant
router.patch(
  "/",
  requirePermission(PERMISSIONS.MANAGE_USERS),
  auditLog("update", "tenant"),
  zValidator("json", z.object({ name: z.string().min(1).max(200) })),
  async (c) => {
    const jwt = getJwt(c);
    const { name } = c.req.valid("json");
    const updated = await clinicService.updateTenant(c.env.DB, jwt.tenant_id, { name });
    if (!updated) throw new NotFoundError("Tenant not found");
    return c.json(updated);
  },
);

// POST /api/clinic/branches — create branch
router.post(
  "/branches",
  requirePermission(PERMISSIONS.MANAGE_USERS),
  auditLog("create", "branch"),
  zValidator("json", z.object({
    name: z.string().min(1).max(200),
    address: z.string().max(500).optional(),
  })),
  async (c) => {
    const jwt = getJwt(c);
    const { name, address } = c.req.valid("json");
    const branch = await clinicService.createBranch(c.env.DB, jwt.tenant_id, { name, address });
    return c.json(branch, 201);
  },
);

// PATCH /api/clinic/branches/:id — update branch
router.patch(
  "/branches/:id",
  requirePermission(PERMISSIONS.MANAGE_USERS),
  auditLog("update", "branch"),
  zValidator("json", z.object({
    name: z.string().min(1).max(200).optional(),
    address: z.string().max(500).optional(),
  })),
  async (c) => {
    const jwt = getJwt(c);
    const { name, address } = c.req.valid("json");
    const updated = await clinicService.updateBranch(c.env.DB, jwt.tenant_id, c.req.param("id"), { name, address });
    if (!updated) throw new NotFoundError("Branch not found");
    return c.json(updated);
  },
);

// DELETE /api/clinic/branches/:id — delete branch
router.delete(
  "/branches/:id",
  requirePermission(PERMISSIONS.MANAGE_USERS),
  auditLog("delete", "branch"),
  async (c) => {
    const jwt = getJwt(c);
    const deleted = await clinicService.deleteBranch(c.env.DB, jwt.tenant_id, c.req.param("id"));
    if (!deleted) throw new NotFoundError("Branch not found");
    return c.json({ ok: true });
  },
);

export default router;
