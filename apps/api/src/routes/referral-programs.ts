import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { referralProgramSchema } from "@shared/validation";
import { PERMISSIONS } from "@shared/constants";
import type { Env } from "../index";
import { auditLog } from "../middleware/audit";
import { getJwt, requireAuth, type AuthContext } from "../middleware/auth";
import { requirePermission } from "../middleware/rbac";
import { referralService } from "../services/referral.service";

const router = new Hono<{ Bindings: Env; Variables: AuthContext }>();
router.use("*", requireAuth());
router.get("/", requirePermission(PERMISSIONS.READ_REFERRALS), async (c) => { const jwt = getJwt(c); return c.json({ items: await referralService.listPrograms(c.env.DB, jwt.tenant_id) }); });
router.post("/", requirePermission(PERMISSIONS.MANAGE_REFERRAL_PROGRAMS), auditLog("create", "referral_program"), zValidator("json", referralProgramSchema), async (c) => { const jwt = getJwt(c); return c.json(await referralService.createProgram(c.env.DB, jwt.tenant_id, jwt.sub, c.req.valid("json")), 201); });
router.patch("/:id", requirePermission(PERMISSIONS.MANAGE_REFERRAL_PROGRAMS), auditLog("update_status", "referral_program"), zValidator("json", z.object({ status: z.enum(["draft", "active", "inactive"]) })), async (c) => { const jwt = getJwt(c); return c.json(await referralService.updateProgramStatus(c.env.DB, jwt.tenant_id, c.req.param("id"), c.req.valid("json").status)); });
export default router;
