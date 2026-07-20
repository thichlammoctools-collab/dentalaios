import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { visitCreateSchema, visitUpdateSchema, findingCreateSchema, findingUpdateSchema } from "@shared/validation";
import { PERMISSIONS } from "@shared/constants";
import type { Env } from "../index";
import { requireAuth, getJwt } from "../middleware/auth";
import { requirePermission } from "../middleware/rbac";
import { auditLog } from "../middleware/audit";
import type { AuthContext } from "../middleware/auth";
import { visitService } from "../services/visit.service";

const router = new Hono<{ Bindings: Env; Variables: AuthContext }>();

router.use("*", requireAuth());

// GET /api/visits
router.get(
  "/",
  requirePermission(PERMISSIONS.READ_PATIENTS),
  async (c) => {
    const jwt = getJwt(c);
    const url = new URL(c.req.url);
    const items = await visitService.list(c.env.DB, jwt.tenant_id, {
      patientId: url.searchParams.get("patient_id") ?? undefined,
      branchId: url.searchParams.get("branch_id") ?? undefined,
      status: (url.searchParams.get("status") as "in_progress" | "completed" | "cancelled" | null) ?? undefined,
    });
    return c.json({ items, total: items.length });
  },
);

// POST /api/visits
router.post(
  "/",
  requirePermission(PERMISSIONS.WRITE_VISITS),
  auditLog("create", "visit"),
  zValidator("json", visitCreateSchema),
  async (c) => {
    const jwt = getJwt(c);
    const data = c.req.valid("json");
    const created = await visitService.create(c.env.DB, jwt.tenant_id, data);
    return c.json(created, 201);
  },
);

// GET /api/visits/:id
router.get(
  "/:id",
  requirePermission(PERMISSIONS.READ_PATIENTS),
  async (c) => {
    const jwt = getJwt(c);
    const visit = await visitService.get(c.env.DB, jwt.tenant_id, c.req.param("id"));
    return c.json(visit, 200);
  },
);

// PATCH /api/visits/:id
router.patch(
  "/:id",
  requirePermission(PERMISSIONS.WRITE_VISITS),
  auditLog("update", "visit"),
  zValidator("json", visitUpdateSchema),
  async (c) => {
    const jwt = getJwt(c);
    const data = c.req.valid("json");
    const updated = await visitService.update(c.env.DB, jwt.tenant_id, c.req.param("id"), data, jwt.sub);
    return c.json(updated, 200);
  },
);

// GET /api/visits/:id/findings
router.get(
  "/:id/findings",
  requirePermission(PERMISSIONS.READ_PATIENTS),
  async (c) => {
    const jwt = getJwt(c);
    const items = await visitService.listFindings(c.env.DB, jwt.tenant_id, c.req.param("id"));
    return c.json({ items, total: items.length });
  },
);

// POST /api/visits/:id/findings
router.post(
  "/:id/findings",
  requirePermission(PERMISSIONS.WRITE_FINDINGS),
  auditLog("create", "clinical_finding"),
  zValidator("json", findingCreateSchema),
  async (c) => {
    const jwt = getJwt(c);
    const data = c.req.valid("json");
    const created = await visitService.addFinding(c.env.DB, jwt.tenant_id, c.req.param("id"), data);
    return c.json(created, 201);
  },
);

// PATCH /api/visits/:visitId/findings/:findingId
router.patch(
  "/:visitId/findings/:findingId",
  requirePermission(PERMISSIONS.WRITE_FINDINGS),
  auditLog("update", "clinical_finding"),
  zValidator("json", findingUpdateSchema),
  async (c) => {
    const jwt = getJwt(c);
    const data = c.req.valid("json");
    const updated = await visitService.updateFinding(
      c.env.DB,
      jwt.tenant_id,
      c.req.param("visitId"),
      c.req.param("findingId"),
      data,
    );
    return c.json(updated, 200);
  },
);

export default router;
