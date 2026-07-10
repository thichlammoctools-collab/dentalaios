/**
 * Appointment routes:
 *   GET    /api/appointments          — list (filter: from, to, clinician_id, status)
 *   POST   /api/appointments          — create (with conflict detection)
 *   GET    /api/appointments/slots    — busy slots for a doctor on a date
 *   GET    /api/appointments/:id      — detail
 *   PATCH  /api/appointments/:id      — update status / reschedule
 *   DELETE /api/appointments/:id      — cancel (soft delete)
 */

import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { PERMISSIONS } from "@shared/constants";
import type { Env } from "../index";
import { requireAuth, getJwt } from "../middleware/auth";
import { requirePermission } from "../middleware/rbac";
import { auditLog } from "../middleware/audit";
import type { AuthContext } from "../middleware/auth";
import { appointmentService } from "../services/appointment.service";
import { appointmentCreateSchema, appointmentUpdateSchema, appointmentSlotQuerySchema } from "@shared/validation";

const router = new Hono<{ Bindings: Env; Variables: AuthContext }>();

router.use("*", requireAuth());

// GET /api/appointments
router.get(
  "/",
  requirePermission(PERMISSIONS.READ_PATIENTS),
  async (c) => {
    const jwt = getJwt(c);
    const url = new URL(c.req.url);
    const items = await appointmentService.list(c.env.DB, jwt.tenant_id, jwt.branch_id, {
      clinicianId: url.searchParams.get("clinician_id") ?? undefined,
      patientId: url.searchParams.get("patient_id") ?? undefined,
      from: url.searchParams.get("from") ?? undefined,
      to: url.searchParams.get("to") ?? undefined,
      status: (url.searchParams.get("status") as "booked" | "confirmed" | "arrived" | "completed" | "cancelled" | "no_show" | null) ?? undefined,
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
    const created = await appointmentService.create(
      c.env.DB,
      jwt.tenant_id,
      jwt.branch_id,
      jwt.sub,
      data,
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
    const busySlots = await appointmentService.getBusySlots(
      c.env.DB,
      jwt.tenant_id,
      doctor_id,
      date,
    );
    return c.json({ items: busySlots, total: busySlots.length });
  },
);

// GET /api/appointments/:id
router.get(
  "/:id",
  requirePermission(PERMISSIONS.READ_PATIENTS),
  async (c) => {
    const jwt = getJwt(c);
    const apt = await appointmentService.get(c.env.DB, jwt.tenant_id, c.req.param("id"));
    return c.json(apt, 200);
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
    const updated = await appointmentService.update(c.env.DB, jwt.tenant_id, c.req.param("id"), data);
    return c.json(updated, 200);
  },
);

// DELETE /api/appointments/:id — soft cancel
router.delete(
  "/:id",
  requirePermission(PERMISSIONS.WRITE_APPOINTMENTS),
  auditLog("cancel", "appointment"),
  async (c) => {
    const jwt = getJwt(c);
    const cancelled = await appointmentService.update(c.env.DB, jwt.tenant_id, c.req.param("id"), {
      status: "cancelled",
      cancelled_reason: "Hủy bởi người dùng",
    });
    return c.json(cancelled, 200);
  },
);

export default router;