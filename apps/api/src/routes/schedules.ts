/**
 * Schedule routes — clinic/doctor working hours.
 *   GET  /api/schedules/clinic/:branchId
 *   PUT  /api/schedules/clinic/:branchId
 *   GET  /api/schedules/doctor/:doctorId
 *   PUT  /api/schedules/doctor/:doctorId
 */

import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { PERMISSIONS } from "@shared/constants";
import type { Env } from "../index";
import { requireAuth, getJwt } from "../middleware/auth";
import { requirePermission } from "../middleware/rbac";
import { auditLog } from "../middleware/audit";
import type { AuthContext } from "../middleware/auth";
import { scheduleService } from "../services/schedule.service";
import {
  clinicScheduleBulkUpdateSchema,
  doctorScheduleBulkUpdateSchema,
} from "@shared/validation";

const router = new Hono<{ Bindings: Env; Variables: AuthContext }>();

router.use("*", requireAuth());

// GET /api/schedules/clinic/:branchId
router.get(
  "/clinic/:branchId",
  requirePermission(PERMISSIONS.READ_PATIENTS),
  async (c) => {
    const jwt = getJwt(c);
    const branchId = c.req.param("branchId");
    const items = await scheduleService.getClinicSchedule(c.env.DB, jwt.tenant_id, branchId);
    return c.json({ items, total: items.length });
  },
);

// PUT /api/schedules/clinic/:branchId
router.put(
  "/clinic/:branchId",
  requirePermission(PERMISSIONS.WRITE_APPOINTMENTS),
  auditLog("update", "clinic_schedule"),
  zValidator("json", clinicScheduleBulkUpdateSchema),
  async (c) => {
    const jwt = getJwt(c);
    const branchId = c.req.param("branchId");
    const body = c.req.valid("json");
    // Force branchId from URL param
    const data = { ...body, branch_id: branchId };
    const items = await scheduleService.updateClinicSchedule(c.env.DB, jwt.tenant_id, branchId, data);
    return c.json({ items, total: items.length }, 200);
  },
);

// GET /api/schedules/doctor/:doctorId
router.get(
  "/doctor/:doctorId",
  requirePermission(PERMISSIONS.READ_PATIENTS),
  async (c) => {
    const jwt = getJwt(c);
    const doctorId = c.req.param("doctorId");
    const url = new URL(c.req.url);
    const branchId = url.searchParams.get("branch_id") ?? jwt.branch_id;
    const items = await scheduleService.getDoctorSchedule(c.env.DB, jwt.tenant_id, doctorId, branchId);
    return c.json({ items, total: items.length });
  },
);

// PUT /api/schedules/doctor/:doctorId
router.put(
  "/doctor/:doctorId",
  requirePermission(PERMISSIONS.WRITE_APPOINTMENTS),
  auditLog("update", "doctor_schedule"),
  zValidator("json", doctorScheduleBulkUpdateSchema),
  async (c) => {
    const jwt = getJwt(c);
    const doctorId = c.req.param("doctorId");
    const body = c.req.valid("json");
    const data = { ...body, doctor_id: doctorId };
    const items = await scheduleService.updateDoctorSchedule(c.env.DB, jwt.tenant_id, data);
    return c.json({ items, total: items.length }, 200);
  },
);

export default router;