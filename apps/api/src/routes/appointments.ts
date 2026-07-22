import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { appointmentCreateSchema, appointmentUpdateSchema, appointmentSlotQuerySchema } from "@shared/validation";
import { PERMISSIONS } from "@shared/constants";
import type { Env } from "../index";
import { requireAuth, getJwt } from "../middleware/auth";
import { requirePermission } from "../middleware/rbac";
import { auditLog } from "../middleware/audit";
import type { AuthContext } from "../middleware/auth";
import { appointmentsService } from "../services/appointments.service";

const router = new Hono<{ Bindings: Env; Variables: AuthContext }>();

router.use("*", requireAuth());

// GET /api/appointments
router.get(
  "/",
  requirePermission(PERMISSIONS.READ_PATIENTS),
  async (c) => {
    const jwt = getJwt(c);
    const url = new URL(c.req.url);
    const items = await appointmentsService.list(c.env.DB, jwt.tenant_id, {
      branchId: url.searchParams.get("branch_id") ?? undefined,
      clinicianId: url.searchParams.get("clinician_id") ?? undefined,
      patientId: url.searchParams.get("patient_id") ?? undefined,
      from: url.searchParams.get("from") ?? undefined,
      to: url.searchParams.get("to") ?? undefined,
      status: (url.searchParams.get("status") as "booked" | "confirmed" | "arrived" | "in_progress" | "completed" | "cancelled" | "no_show" | null) ?? undefined,
    });
    return c.json({ items, total: items.length });
  },
);

// POST /api/appointments
router.post(
  "/",
  requirePermission(PERMISSIONS.WRITE_APPOINTMENTS),
  auditLog("create", "appointment"),
  zValidator("json", appointmentCreateSchema),
  async (c) => {
    const jwt = getJwt(c);
    const data = c.req.valid("json");
    const encKey = c.env.ENCRYPTION_KEY ?? undefined;
    const created = await appointmentsService.create(
      c.env.DB, jwt.tenant_id, jwt.sub, jwt.branch_id,
      data,
      encKey,
    );
    return c.json(created, 201);
  },
);

// GET /api/appointments/slots — busy slots for a doctor on a date
router.get(
  "/slots",
  requirePermission(PERMISSIONS.READ_PATIENTS),
  zValidator("query", appointmentSlotQuerySchema),
  async (c) => {
    const jwt = getJwt(c);
    const { doctor_id, date } = c.req.valid("query");
    const items = await appointmentsService.getBusySlots(
      c.env.DB,
      jwt.tenant_id,
      doctor_id,
      date,
    );
    return c.json({ items, total: items.length });
  },
);

// GET /api/appointments/:id
router.get(
  "/:id",
  requirePermission(PERMISSIONS.READ_PATIENTS),
  async (c) => {
    const jwt = getJwt(c);
    const appt = await appointmentsService.get(c.env.DB, jwt.tenant_id, c.req.param("id"));
    return c.json(appt, 200);
  },
);

// PATCH /api/appointments/:id
router.patch(
  "/:id",
  requirePermission(PERMISSIONS.WRITE_APPOINTMENTS),
  auditLog("update", "appointment"),
  zValidator("json", appointmentUpdateSchema),
  async (c) => {
    const jwt = getJwt(c);
    const data = c.req.valid("json");
    const encKey = c.env.ENCRYPTION_KEY ?? undefined;
    const updated = await appointmentsService.update(c.env.DB, jwt.tenant_id, c.req.param("id"), data, encKey);
    return c.json(updated, 200);
  },
);

// DELETE /api/appointments/:id  → cancel
router.delete(
  "/:id",
  requirePermission(PERMISSIONS.WRITE_APPOINTMENTS),
  auditLog("cancel", "appointment"),
  async (c) => {
    const jwt = getJwt(c);
    let reason: string | undefined;
    try {
      const body = await c.req.json<{ reason?: string }>();
      reason = body.reason || undefined;
    } catch { /* body is optional */ }
    await appointmentsService.cancel(c.env.DB, jwt.tenant_id, c.req.param("id"), reason);
    return c.json({ ok: true }, 200);
  },
);

export default router;
