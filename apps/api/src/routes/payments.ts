import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { paymentAdjustmentSchema, paymentAttachmentCreateSchema, paymentCreateSchema, paymentUpdateSchema } from "@shared/validation";
import { PERMISSIONS } from "@shared/constants";
import type { Env } from "../index";
import { requireAuth, getJwt } from "../middleware/auth";
import { requirePermission } from "../middleware/rbac";
import { auditLog } from "../middleware/audit";
import type { AuthContext } from "../middleware/auth";
import { paymentService } from "../services/payment.service";
import { filesService } from "../services/files.service";

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

// GET /api/payments/paymentable-items?treatment_plan_id=...
// This must precede /:id so the static path is not treated as a payment ID.
router.get(
  "/paymentable-items",
  requirePermission(PERMISSIONS.WRITE_PAYMENTS),
  async (c) => {
    const planId = new URL(c.req.url).searchParams.get("treatment_plan_id");
    if (!planId) return c.json({ error: "treatment_plan_id là bắt buộc", code: "validation_error" }, 400);
    const jwt = getJwt(c);
    const items = await paymentService.listPaymentableItems(c.env.DB, jwt.tenant_id, planId);
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

// POST /api/payments/:id/adjust — append a confirmed correcting entry; never overwrite a confirmed payment.
router.post(
  "/:id/adjust",
  requirePermission(PERMISSIONS.WRITE_PAYMENTS),
  auditLog("adjust", "payment"),
  zValidator("json", paymentAdjustmentSchema),
  async (c) => {
    const jwt = getJwt(c);
    const adjusted = await paymentService.adjust(c.env.DB, jwt.tenant_id, c.req.param("id"), c.req.valid("json"));
    return c.json(adjusted, 201);
  },
);

router.get(
  "/:id/attachments",
  requirePermission(PERMISSIONS.WRITE_PAYMENTS),
  async (c) => {
    const jwt = getJwt(c);
    return c.json({ items: await paymentService.listAttachments(c.env.DB, jwt.tenant_id, c.req.param("id")) });
  },
);

const paymentProofPresignSchema = z.object({
  filename: z.string().trim().min(1).max(200),
  content_type: z.string().min(1).max(100).refine((value) => value.startsWith("image/") || value === "application/pdf", "Chỉ hỗ trợ ảnh hoặc PDF"),
  size: z.number().int().positive().max(20 * 1024 * 1024),
});

// POST /api/payments/:id/attachments/presign — upload proof to a payment-scoped private key.
router.post(
  "/:id/attachments/presign",
  requirePermission(PERMISSIONS.WRITE_PAYMENTS),
  zValidator("json", paymentProofPresignSchema),
  async (c) => {
    const jwt = getJwt(c);
    await paymentService.get(c.env.DB, jwt.tenant_id, c.req.param("id"));
    const input = c.req.valid("json");
    return c.json(await filesService.presign(c.env, jwt.tenant_id, { ...input, prefix: "payments" }, {
      db: c.env.DB,
      userId: jwt.sub,
    }), 200);
  },
);

router.post(
  "/:id/attachments",
  requirePermission(PERMISSIONS.WRITE_PAYMENTS),
  auditLog("attach_proof", "payment", { entityIdFrom: (body) => typeof body === "object" && body !== null && "payment_id" in body ? String(body.payment_id) : undefined }),
  zValidator("json", paymentAttachmentCreateSchema),
  async (c) => {
    const jwt = getJwt(c);
    const attachment = await paymentService.addAttachment(c.env.DB, jwt.tenant_id, c.req.param("id"), c.req.valid("json"), jwt.sub);
    return c.json(attachment, 201);
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
