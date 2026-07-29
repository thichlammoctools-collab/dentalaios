import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { paraclinicalOrderCreateSchema, paraclinicalOrderUpdateSchema } from "@shared/validation";
import { PERMISSIONS } from "@shared/constants";
import type { Env } from "../index";
import { requireAuth, getJwt } from "../middleware/auth";
import { requirePermission } from "../middleware/rbac";
import { auditLog } from "../middleware/audit";
import type { AuthContext } from "../middleware/auth";
import { paraclinicalOrderService } from "../services/paraclinical-order.service";

const router = new Hono<{ Bindings: Env; Variables: AuthContext }>();

router.use("*", requireAuth());

// List orders by visit
router.get(
  "/:visitId/orders",
  requirePermission(PERMISSIONS.READ_PATIENTS),
  async (c) => {
    const jwt = getJwt(c);
    const items = await paraclinicalOrderService.listByVisit(c.env.DB, jwt.tenant_id, c.req.param("visitId"));
    return c.json({ items, total: items.length });
  },
);

// Create order
router.post(
  "/:visitId/orders",
  requirePermission(PERMISSIONS.WRITE_FINDINGS),
  auditLog("create", "paraclinical_order"),
  zValidator("json", paraclinicalOrderCreateSchema),
  async (c) => {
    const jwt = getJwt(c);
    const order = await paraclinicalOrderService.create(c.env.DB, jwt.tenant_id, c.req.param("visitId"), jwt.sub, c.req.valid("json"));
    return c.json(order, 201);
  },
);

// Update order (status, results, etc.)
router.patch(
  "/:visitId/orders/:orderId",
  requirePermission(PERMISSIONS.WRITE_FINDINGS),
  auditLog("update", "paraclinical_order"),
  zValidator("json", paraclinicalOrderUpdateSchema),
  async (c) => {
    const jwt = getJwt(c);
    const order = await paraclinicalOrderService.update(
      c.env.DB, jwt.tenant_id, c.req.param("visitId"), c.req.param("orderId"), jwt.sub, c.req.valid("json"),
    );
    return c.json(order);
  },
);

// List orders by patient (across visits)
router.get(
  "/patient/:patientId/orders",
  requirePermission(PERMISSIONS.READ_PATIENTS),
  async (c) => {
    const jwt = getJwt(c);
    const items = await paraclinicalOrderService.listByPatient(c.env.DB, jwt.tenant_id, c.req.param("patientId"));
    return c.json({ items, total: items.length });
  },
);

export default router;
