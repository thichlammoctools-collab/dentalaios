import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import {
  chairAvailabilityQuerySchema,
  chairBoardQuerySchema,
  chairCreateSchema,
  chairStatusUpdateSchema,
  chairUpdateSchema,
} from "@shared/validation";
import { PERMISSIONS } from "@shared/constants";
import type { Env } from "../index";
import { requireAuth, getJwt } from "../middleware/auth";
import { requirePermission } from "../middleware/rbac";
import { auditLog } from "../middleware/audit";
import type { AuthContext } from "../middleware/auth";
import { chairsService } from "../services/chairs.service";

const router = new Hono<{ Bindings: Env; Variables: AuthContext }>();

router.use("*", requireAuth());

router.get("/availability", requirePermission(PERMISSIONS.READ_PATIENTS), zValidator("query", chairAvailabilityQuerySchema), async (c) => {
  const jwt = getJwt(c);
  const query = c.req.valid("query");
  const items = await chairsService.availability(
    c.env.DB, jwt.tenant_id, query.branch_id, query.start_at, query.duration_min, query.exclude_appointment_id,
  );
  return c.json({ items, total: items.length });
});

router.get("/board", requirePermission(PERMISSIONS.READ_PATIENTS), zValidator("query", chairBoardQuerySchema), async (c) => {
  const jwt = getJwt(c);
  const query = c.req.valid("query");
  const chairs = await chairsService.board(c.env.DB, jwt.tenant_id, query.branch_id, query.date);
  return c.json({ branch_id: query.branch_id, date: query.date, generated_at: new Date().toISOString(), chairs });
});

router.get("/", requirePermission(PERMISSIONS.READ_PATIENTS), async (c) => {
  const jwt = getJwt(c);
  const branchId = new URL(c.req.url).searchParams.get("branch_id") ?? undefined;
  const items = await chairsService.list(c.env.DB, jwt.tenant_id, branchId);
  return c.json({ items, total: items.length });
});

router.post("/", requirePermission(PERMISSIONS.MANAGE_USERS), auditLog("create", "dental_chair"), zValidator("json", chairCreateSchema), async (c) => {
  const jwt = getJwt(c);
  return c.json(await chairsService.create(c.env.DB, jwt.tenant_id, c.req.valid("json")), 201);
});

router.patch("/:id/status", requirePermission(PERMISSIONS.WRITE_APPOINTMENTS), auditLog("update", "dental_chair"), zValidator("json", chairStatusUpdateSchema), async (c) => {
  const jwt = getJwt(c);
  return c.json(await chairsService.updateStatus(c.env.DB, jwt.tenant_id, c.req.param("id"), c.req.valid("json")));
});

router.get("/:id", requirePermission(PERMISSIONS.READ_PATIENTS), async (c) => {
  const jwt = getJwt(c);
  return c.json(await chairsService.get(c.env.DB, jwt.tenant_id, c.req.param("id")));
});

router.patch("/:id", requirePermission(PERMISSIONS.MANAGE_USERS), auditLog("update", "dental_chair"), zValidator("json", chairUpdateSchema), async (c) => {
  const jwt = getJwt(c);
  return c.json(await chairsService.update(c.env.DB, jwt.tenant_id, c.req.param("id"), c.req.valid("json")));
});

export default router;
