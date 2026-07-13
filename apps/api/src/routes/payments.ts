import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { paymentCreateSchema, paymentUpdateSchema } from "@shared/validation";
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

// GET /api/payments/:id
router.get(
  "/:id",
  requirePermission(PERMISSIONS.WRITE_PAYMENTS),
  async (c) => {
    const jwt = getJwt(c);
    const payment = await paymentService.get(c.env.DB, jwt.tenant_id, c.req.param("id"));
    return c.json(payment);
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

// PATCH /api/payments/:id — edit amount, method, reference, notes (status goes via /confirm or /fail)
router.patch(
  "/:id",
  requirePermission(PERMISSIONS.WRITE_PAYMENTS),
  auditLog("update", "payment"),
  zValidator("json", paymentUpdateSchema),
  async (c) => {
    const jwt = getJwt(c);
    const patch = c.req.valid("json");
    const updated = await paymentService.update(c.env.DB, jwt.tenant_id, c.req.param("id"), patch);
    return c.json(updated);
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

// POST /api/payments/:id/fail
router.post(
  "/:id/fail",
  requirePermission(PERMISSIONS.WRITE_PAYMENTS),
  auditLog("update_status", "payment"),
  async (c) => {
    const jwt = getJwt(c);
    const updated = await paymentService.markFailed(c.env.DB, jwt.tenant_id, c.req.param("id"));
    return c.json(updated, 200);
  },
);

export default router;