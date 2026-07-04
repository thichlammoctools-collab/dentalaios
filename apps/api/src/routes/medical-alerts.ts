import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { medicalAlertCreateSchema } from "@shared/validation";
import { PERMISSIONS } from "@shared/constants";
import type { Env } from "../index";
import { requireAuth, getJwt } from "../middleware/auth";
import { requirePermission } from "../middleware/rbac";
import { auditLog } from "../middleware/audit";
import type { AuthContext } from "../middleware/auth";
import { medicalAlertsService } from "../services/medical-alerts.service";

const router = new Hono<{ Bindings: Env; Variables: AuthContext }>();

router.use("*", requireAuth());

// GET /api/patients/:id/alerts
router.get(
  "/:id/alerts",
  requirePermission(PERMISSIONS.READ_PATIENTS),
  async (c) => {
    const jwt = getJwt(c);
    const items = await medicalAlertsService.list(c.env.DB, jwt.tenant_id, c.req.param("id"));
    return c.json({ items, total: items.length });
  },
);

// POST /api/patients/:id/alerts
router.post(
  "/:id/alerts",
  requirePermission(PERMISSIONS.WRITE_PATIENTS),
  auditLog("create", "medical_alert"),
  zValidator("json", medicalAlertCreateSchema),
  async (c) => {
    const jwt = getJwt(c);
    const data = c.req.valid("json");
    const created = await medicalAlertsService.create(
      c.env.DB,
      jwt.tenant_id,
      c.req.param("id"),
      data,
    );
    return c.json(created, 201);
  },
);

// DELETE /api/patients/:id/alerts/:alertId
router.delete(
  "/:id/alerts/:alertId",
  requirePermission(PERMISSIONS.WRITE_PATIENTS),
  auditLog("delete", "medical_alert"),
  async (c) => {
    const jwt = getJwt(c);
    const ok = await medicalAlertsService.remove(
      c.env.DB,
      jwt.tenant_id,
      c.req.param("alertId"),
    );
    if (!ok) return c.json({ error: "Alert not found", code: "not_found" }, 404);
    return c.json({ ok: true }, 200);
  },
);

export default router;