import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { paymentCreateSchema } from "@shared/validation";
import { PERMISSIONS } from "@shared/constants";
import type { Env } from "../index";
import { requireAuth, getJwt } from "../middleware/auth";
import { requirePermission } from "../middleware/rbac";
import { auditLog } from "../middleware/audit";
import type { AuthContext } from "../middleware/auth";
import { paymentService } from "../services/payment.service";

const router = new Hono<{ Bindings: Env; Variables: AuthContext }>();

router.use("*", requireAuth());

// GET /api/payments
router.get(
  "/",
  requirePermission(PERMISSIONS.WRITE_PAYMENTS),
  async (c) => {
    const jwt = getJwt(c);
    const url = new URL(c.req.url);
    const items = await paymentService.list(c.env.DB, jwt.tenant_id, {
      patientId: url.searchParams.get("patient_id") ?? undefined,
      treatmentPlanId: url.searchParams.get("treatment_plan_id") ?? undefined,
      status: (url.searchParams.get("status") as "pending" | "confirmed" | "failed" | null) ?? undefined,
    });
    return c.json({ items, total: items.length });
  },
);

// POST /api/payments
router.post(
  "/",
  requirePermission(PERMISSIONS.WRITE_PAYMENTS),
  auditLog("create", "payment"),
  zValidator("json", paymentCreateSchema),
  async (c) => {
    const jwt = getJwt(c);
    const data = c.req.valid("json");
    const created = await paymentService.create(c.env.DB, jwt.tenant_id, data);
    return c.json(created, 201);
  },
);

// POST /api/payments/:id/confirm
router.post(
  "/:id/confirm",
  requirePermission(PERMISSIONS.WRITE_PAYMENTS),
  auditLog("confirm", "payment"),
  async (c) => {
    const jwt = getJwt(c);
    const updated = await paymentService.confirm(c.env.DB, jwt.tenant_id, c.req.param("id"));
    return c.json(updated, 200);
  },
);

export default router;