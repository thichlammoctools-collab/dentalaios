/**
 * Clinic settings routes:
 *   GET  /api/clinic               — get tenant + all branches
 *   PATCH /api/clinic             — update tenant info (admin only)
 *   POST /api/clinic/branches      — create a new branch
 *   PATCH /api/clinic/branches/:id — update a branch
 *   DELETE /api/clinic/branches/:id — delete a branch
 */

import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { PERMISSIONS } from "@shared/constants";
import { branchCreateSchema, branchUpdateSchema, paymentPrefixSchema } from "@shared/validation";
import type { Env } from "../index";
import { requireAuth, getJwt } from "../middleware/auth";
import { requirePermission } from "../middleware/rbac";
import { auditLog } from "../middleware/audit";
import type { AuthContext } from "../middleware/auth";
import { clinicService } from "../services/clinic.service";
import { authService } from "../services/auth.service";
import { testLarkCredentials } from "../lib/lark-client";
import { NotFoundError, ValidationError } from "../lib/errors";
import { paymentService } from "../services/payment.service";

const router = new Hono<{ Bindings: Env; Variables: AuthContext }>();

router.use("*", requireAuth());

// GET /api/clinic — get tenant + branches
router.get("/", async (c) => {
  const jwt = getJwt(c);
  const [tenant, branches] = await Promise.all([
    clinicService.getTenant(c.env.DB, jwt.tenant_id),
    clinicService.listBranches(c.env.DB, jwt.tenant_id),
  ]);
  if (!tenant) throw new NotFoundError("Tenant not found");
  return c.json({ tenant, branches });
});

// PATCH /api/clinic — update tenant
router.patch(
  "/",
  requirePermission(PERMISSIONS.MANAGE_USERS),
  auditLog("update", "tenant"),
  zValidator("json", z.object({ name: z.string().min(1).max(200) })),
  async (c) => {
    const jwt = getJwt(c);
    const { name } = c.req.valid("json");
    const updated = await clinicService.updateTenant(c.env.DB, jwt.tenant_id, { name });
    if (!updated) throw new NotFoundError("Tenant not found");
    return c.json(updated);
  },
);

// POST /api/clinic/branches — create branch
router.post(
  "/branches",
  requirePermission(PERMISSIONS.MANAGE_USERS),
  auditLog("create", "branch"),
  zValidator("json", branchCreateSchema),
  async (c) => {
    const jwt = getJwt(c);
    const data = c.req.valid("json");
    const branch = await clinicService.createBranch(c.env.DB, jwt.tenant_id, data);

    // Enqueue async Lark notification (Task + optional Calendar event).
    // Skip silently if JOBS binding is missing (e.g. local dev without queue).
    if (c.env.JOBS) {
      try {
        const me = await authService.getMe(
          { db: c.env.DB, jwtSecret: c.env.JWT_SECRET },
          jwt.sub,
          jwt.tenant_id,
        );
        await c.env.JOBS.send({
          type: "branch_lark_sync",
          branch_id: branch.id,
          tenant_id: jwt.tenant_id,
          created_by: me?.user.name ?? "Admin",
        });
      } catch (err) {
        console.error("[/branches POST] failed to enqueue Lark sync:", err);
      }
    }

    return c.json(branch, 201);
  },
);

// PATCH /api/clinic/branches/:id — update branch
router.patch(
  "/branches/:id",
  requirePermission(PERMISSIONS.MANAGE_USERS),
  auditLog("update", "branch"),
  zValidator("json", branchUpdateSchema),
  async (c) => {
    const jwt = getJwt(c);
    const data = c.req.valid("json");
    const updated = await clinicService.updateBranch(c.env.DB, jwt.tenant_id, c.req.param("id"), data);
    if (!updated) throw new NotFoundError("Branch not found");
    return c.json(updated);
  },
);

// DELETE /api/clinic/branches/:id — delete branch
router.delete(
  "/branches/:id",
  requirePermission(PERMISSIONS.MANAGE_USERS),
  auditLog("delete", "branch"),
  async (c) => {
    const jwt = getJwt(c);
    const deleted = await clinicService.deleteBranch(c.env.DB, jwt.tenant_id, c.req.param("id"));
    if (!deleted) throw new NotFoundError("Branch not found");
    return c.json({ ok: true });
  },
);

// ──────────────── Per-tenant Lark configuration ────────────────

const larkConfigSchema = z.object({
  app_id: z.string().min(1).max(200),
  app_secret: z.string().min(1).max(500),
  calendar_id: z.string().max(200).optional(),
  enabled: z.boolean().optional(),
});

function requireEncryptionKey(env: Env): string {
  if (!env.ENCRYPTION_KEY) {
    throw new ValidationError(
      "Server is missing ENCRYPTION_KEY — Lark integration unavailable",
    );
  }
  return env.ENCRYPTION_KEY;
}

// GET /api/clinic/lark — fetch this tenant's Lark config (no secret in response)
router.get(
  "/lark",
  requirePermission(PERMISSIONS.MANAGE_USERS),
  async (c) => {
    const jwt = getJwt(c);
    const config = await clinicService.getLarkConfig(c.env.DB, jwt.tenant_id);
    return c.json({ config: config ?? null });
  },
);

// PUT /api/clinic/lark — save/update Lark config (encrypts secret at rest)
router.put(
  "/lark",
  requirePermission(PERMISSIONS.MANAGE_USERS),
  auditLog("update", "lark_config"),
  zValidator("json", larkConfigSchema),
  async (c) => {
    const jwt = getJwt(c);
    const key = requireEncryptionKey(c.env);
    const body = c.req.valid("json");
    const config = await clinicService.saveLarkConfig(
      c.env.DB,
      jwt.tenant_id,
      body,
      key,
    );
    return c.json({ config });
  },
);

// DELETE /api/clinic/lark — remove Lark integration (hard delete)
router.delete(
  "/lark",
  requirePermission(PERMISSIONS.MANAGE_USERS),
  auditLog("delete", "lark_config"),
  async (c) => {
    const jwt = getJwt(c);
    const ok = await clinicService.deleteLarkConfig(c.env.DB, jwt.tenant_id);
    if (!ok) throw new NotFoundError("Lark config not found");
    return c.json({ ok: true });
  },
);

// POST /api/clinic/lark/test — test stored credentials by calling Lark auth
router.post(
  "/lark/test",
  requirePermission(PERMISSIONS.MANAGE_USERS),
  async (c) => {
    const jwt = getJwt(c);
    const key = requireEncryptionKey(c.env);

    // If request body carries app_id + app_secret, test those directly (preview before save).
    // Otherwise test the stored config.
    let body: { app_id?: string; app_secret?: string } = {};
    try {
      const text = await c.req.text();
      if (text) body = JSON.parse(text) as typeof body;
    } catch {
      /* empty body is fine — fall through to stored config test */
    }

    let appId: string | undefined;
    let appSecret: string | undefined;

    if (body.app_id && body.app_secret) {
      appId = body.app_id;
      appSecret = body.app_secret;
    } else {
      const config = await clinicService.getLarkConfig(c.env.DB, jwt.tenant_id);
      if (!config) throw new ValidationError("Chưa có cấu hình Lark");
      const repo = (
        await import("../repositories/lark-config.repo")
      ).createLarkConfigRepository(c.env.DB);
      const decrypted = await repo.getByTenant(jwt.tenant_id, key);
      if (!decrypted) throw new NotFoundError("Stored Lark config missing");
      appId = decrypted.app_id;
      appSecret = decrypted.app_secret;
    }

    const result = await testLarkCredentials(appId, appSecret);
    return c.json(result);
  },
);

export default router;

// ──────────────── Payment code prefix (admin only) ────────────────

// GET /api/clinic/payment-prefix — fetch this tenant's payment code prefix
router.get(
  "/payment-prefix",
  requirePermission(PERMISSIONS.MANAGE_USERS),
  async (c) => {
    const jwt = getJwt(c);
    return c.json(await paymentService.getPaymentPrefix(c.env.DB, jwt.tenant_id));
  },
);

// PUT /api/clinic/payment-prefix — set the tenant's payment code prefix
router.put(
  "/payment-prefix",
  requirePermission(PERMISSIONS.MANAGE_USERS),
  auditLog("update", "tenant_setting"),
  zValidator("json", paymentPrefixSchema),
  async (c) => {
    const jwt = getJwt(c);
    const { prefix } = c.req.valid("json");
    return c.json(await paymentService.setPaymentPrefix(c.env.DB, jwt.tenant_id, prefix));
  },
);
