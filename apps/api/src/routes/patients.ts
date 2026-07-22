import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { patientCreateSchema, patientUpdateSchema } from "@shared/validation";
import { PERMISSIONS, isValidFdiTooth } from "@shared/constants";
import type { Env } from "../index";
import { requireAuth, getJwt } from "../middleware/auth";
import { requirePermission } from "../middleware/rbac";
import { auditLog } from "../middleware/audit";
import type { AuthContext } from "../middleware/auth";
import { ForbiddenError } from "../lib/errors";
import { patientService } from "../services/patient.service";
import { treatmentCasesService } from "../services/treatment-cases.service";

const router = new Hono<{ Bindings: Env; Variables: AuthContext }>();

router.use("*", requireAuth());

// GET /api/patients
router.get(
  "/",
  requirePermission(PERMISSIONS.READ_PATIENTS),
  async (c) => {
    const jwt = getJwt(c);
    const url = new URL(c.req.url);
    const branchId = url.searchParams.get("branch_id") ?? undefined;
    const search = url.searchParams.get("search") ?? undefined;
    const archived = url.searchParams.get("archived") === "true";
    if (archived && !jwt.permissions.includes(PERMISSIONS.ALL) && !jwt.permissions.includes(PERMISSIONS.MANAGE_PATIENTS)) {
      throw new ForbiddenError(`Missing permission: ${PERMISSIONS.MANAGE_PATIENTS}`);
    }
    const limit = Number(url.searchParams.get("limit") ?? 100);
    const offset = Number(url.searchParams.get("offset") ?? 0);
    const pagination = {
      branchId,
      search,
      archived,
    };
    const [items, total] = await Promise.all([
      patientService.list(c.env.DB, jwt.tenant_id, { ...pagination, limit, offset }),
      patientService.count(c.env.DB, jwt.tenant_id, pagination),
    ]);
    return c.json({ items, total, limit, offset });
  },
);

// POST /api/patients
router.post(
  "/",
  requirePermission(PERMISSIONS.WRITE_PATIENTS),
  auditLog("create", "patient"),
  zValidator("json", patientCreateSchema),
  async (c) => {
    const jwt = getJwt(c);
    const data = c.req.valid("json");
    const created = await patientService.create(c.env.DB, jwt.tenant_id, data, jwt.sub);
    return c.json(created, 201);
  },
);

// GET /api/patients/:id
router.get(
  "/:id/open-treatment-milestones",
  requirePermission(PERMISSIONS.READ_PATIENTS),
  async (c) => {
    const jwt = getJwt(c);
    const items = await treatmentCasesService.listOpenMilestonesByPatient(
      c.env.DB,
      jwt.tenant_id,
      c.req.param("id"),
    );
    return c.json({ items, total: items.length });
  },
);

// GET /api/patients/:id/teeth/:toothNumber/history
router.get(
  "/:id/teeth/:toothNumber/history",
  requirePermission(PERMISSIONS.READ_PATIENTS),
  auditLog("read", "tooth_history"),
  async (c) => {
    const jwt = getJwt(c);
    const toothNumber = Number(c.req.param("toothNumber"));
    if (!Number.isInteger(toothNumber) || !isValidFdiTooth(toothNumber)) {
      return c.json({ error: "Số răng FDI không hợp lệ", code: "invalid_tooth" }, 400);
    }
    const items = await patientService.toothHistory(
      c.env.DB,
      jwt.tenant_id,
      c.req.param("id"),
      toothNumber,
    );
    return c.json({ items, total: items.length });
  },
);

router.get(
  "/:id",
  requirePermission(PERMISSIONS.READ_PATIENTS),
  async (c) => {
    const jwt = getJwt(c);
    const patient = await patientService.get(c.env.DB, jwt.tenant_id, c.req.param("id"));
    if (!patient) return c.json({ error: "Patient not found", code: "not_found" }, 404);
    return c.json(patient, 200);
  },
);

// PUT /api/patients/:id
router.put(
  "/:id",
  requirePermission(PERMISSIONS.WRITE_PATIENTS),
  auditLog("update", "patient"),
  zValidator("json", patientUpdateSchema),
  async (c) => {
    const jwt = getJwt(c);
    const data = c.req.valid("json");
    const updated = await patientService.update(c.env.DB, jwt.tenant_id, c.req.param("id"), data);
    if (!updated) return c.json({ error: "Patient not found", code: "not_found" }, 404);
    return c.json(updated, 200);
  },
);

// POST /api/patients/:id/restore
router.post(
  "/:id/restore",
  requirePermission(PERMISSIONS.MANAGE_PATIENTS),
  auditLog("restore", "patient"),
  async (c) => {
    const jwt = getJwt(c);
    const id = c.req.param("id");
    const ok = await patientService.restore(c.env.DB, jwt.tenant_id, id);
    if (!ok) return c.json({ error: "Archived patient not found", code: "not_found" }, 404);
    return c.json({ id, ok: true }, 200);
  },
);

// DELETE /api/patients/:id archives the record without removing clinical history.
router.delete(
  "/:id",
  requirePermission(PERMISSIONS.MANAGE_PATIENTS),
  auditLog("archive", "patient"),
  zValidator("json", z.object({ reason: z.string().trim().min(3).max(500) })),
  async (c) => {
    const jwt = getJwt(c);
    const { reason } = c.req.valid("json");
    const id = c.req.param("id");
    const ok = await patientService.archive(c.env.DB, jwt.tenant_id, id, jwt.sub, reason);
    if (!ok) return c.json({ error: "Active patient not found", code: "not_found" }, 404);
    return c.json({ id, ok: true }, 200);
  },
);

export default router;
