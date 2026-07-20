import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { patientCreateSchema, patientUpdateSchema } from "@shared/validation";
import { PERMISSIONS } from "@shared/constants";
import type { Env } from "../index";
import { requireAuth, getJwt } from "../middleware/auth";
import { requirePermission } from "../middleware/rbac";
import { auditLog } from "../middleware/audit";
import type { AuthContext } from "../middleware/auth";
import { patientService } from "../services/patient.service";

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
    const limit = Number(url.searchParams.get("limit") ?? 100);
    const offset = Number(url.searchParams.get("offset") ?? 0);
    const pagination = {
      branchId,
      search,
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
    const created = await patientService.create(c.env.DB, jwt.tenant_id, data);
    return c.json(created, 201);
  },
);

// GET /api/patients/:id
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

// DELETE /api/patients/:id
router.delete(
  "/:id",
  requirePermission(PERMISSIONS.WRITE_PATIENTS),
  auditLog("delete", "patient"),
  async (c) => {
    const jwt = getJwt(c);
    const ok = await patientService.remove(c.env.DB, jwt.tenant_id, c.req.param("id"));
    if (!ok) return c.json({ error: "Patient not found", code: "not_found" }, 404);
    return c.json({ ok: true }, 200);
  },
);

export default router;
