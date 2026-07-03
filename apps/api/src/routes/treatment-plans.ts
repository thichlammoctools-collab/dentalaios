import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { planCreateSchema, planItemCreateSchema } from "@shared/validation";
import { PERMISSIONS } from "@shared/constants";
import type { Env } from "../index";
import { requireAuth, getJwt } from "../middleware/auth";
import { requirePermission } from "../middleware/rbac";
import { auditLog } from "../middleware/audit";
import type { AuthContext } from "../middleware/auth";
import { planService } from "../services/plan.service";

const router = new Hono<{ Bindings: Env; Variables: AuthContext }>();

router.use("*", requireAuth());

// GET /api/treatment-plans
router.get(
  "/",
  requirePermission(PERMISSIONS.READ_PATIENTS),
  async (c) => {
    const jwt = getJwt(c);
    const url = new URL(c.req.url);
    const items = await planService.list(c.env.DB, jwt.tenant_id, {
      patientId: url.searchParams.get("patient_id") ?? undefined,
      status: (url.searchParams.get("status") as "draft" | "approved" | "completed" | "cancelled" | null) ?? undefined,
    });
    return c.json({ items, total: items.length });
  },
);

// POST /api/treatment-plans
router.post(
  "/",
  requirePermission(PERMISSIONS.WRITE_PLANS),
  auditLog("create", "treatment_plan"),
  zValidator("json", planCreateSchema),
  async (c) => {
    const jwt = getJwt(c);
    const data = c.req.valid("json");
    const created = await planService.create(c.env.DB, jwt.tenant_id, data);
    return c.json(created, 201);
  },
);

// GET /api/treatment-plans/:id
router.get(
  "/:id",
  requirePermission(PERMISSIONS.READ_PATIENTS),
  async (c) => {
    const jwt = getJwt(c);
    const plan = await planService.get(c.env.DB, jwt.tenant_id, c.req.param("id"));
    return c.json(plan, 200);
  },
);

// GET /api/treatment-plans/:id/items
router.get(
  "/:id/items",
  requirePermission(PERMISSIONS.READ_PATIENTS),
  async (c) => {
    const jwt = getJwt(c);
    const items = await planService.listItems(c.env.DB, jwt.tenant_id, c.req.param("id"));
    return c.json({ items, total: items.length });
  },
);

// POST /api/treatment-plans/:id/items
router.post(
  "/:id/items",
  requirePermission(PERMISSIONS.WRITE_PLANS),
  auditLog("create", "treatment_plan_item"),
  zValidator("json", planItemCreateSchema),
  async (c) => {
    const jwt = getJwt(c);
    const data = c.req.valid("json");
    const created = await planService.addItem(c.env.DB, jwt.tenant_id, c.req.param("id"), data);
    return c.json(created, 201);
  },
);

// DELETE /api/treatment-plans/:id/items/:itemId
router.delete(
  "/:id/items/:itemId",
  requirePermission(PERMISSIONS.WRITE_PLANS),
  auditLog("delete", "treatment_plan_item"),
  async (c) => {
    const jwt = getJwt(c);
    const ok = await planService.removeItem(
      c.env.DB,
      jwt.tenant_id,
      c.req.param("id"),
      c.req.param("itemId"),
    );
    if (!ok) return c.json({ error: "Item not found", code: "not_found" }, 404);
    return c.json({ ok: true }, 200);
  },
);

// POST /api/treatment-plans/:id/approve
router.post(
  "/:id/approve",
  requirePermission(PERMISSIONS.APPROVE_PLANS),
  auditLog("approve", "treatment_plan"),
  async (c) => {
    const jwt = getJwt(c);
    const approved = await planService.approve(c.env.DB, jwt.tenant_id, c.req.param("id"));
    return c.json(approved, 200);
  },
);

export default router;