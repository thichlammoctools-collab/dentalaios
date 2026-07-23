import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { referrerAccountCreateSchema, referrerCreateSchema, referrerQuickCreateSchema, referrerUpdateSchema } from "@shared/validation";
import { PERMISSIONS } from "@shared/constants";
import type { Env } from "../index";
import { auditLog } from "../middleware/audit";
import { getJwt, requireAuth, type AuthContext } from "../middleware/auth";
import { requirePermission } from "../middleware/rbac";
import { referralService } from "../services/referral.service";
import { referrerPortalService } from "../services/referrer-portal.service";
import { sendReferrerPortalLink } from "../services/referrer-email.service";
import { createReferralsRepository } from "../repositories/referrals.repo";

const router = new Hono<{ Bindings: Env; Variables: AuthContext }>();
router.use("*", requireAuth());

router.get("/", requirePermission(PERMISSIONS.MANAGE_REFERRERS), async (c) => {
  const jwt = getJwt(c);
  return c.json({ items: await referralService.listReferrers(c.env.DB, jwt.tenant_id) });
});
router.get("/search", requirePermission(PERMISSIONS.WRITE_PATIENTS), async (c) => {
  const jwt = getJwt(c);
  const query = new URL(c.req.url).searchParams.get("q")?.trim();
  if (!query || query.length < 2) return c.json({ items: [] });
  const pattern = `%${query.replace(/[%_\\]/g, "\\$&")}%`;
  const result = await c.env.DB.prepare(
    "SELECT * FROM referrers WHERE tenant_id = ? AND status = 'active' AND (code LIKE ? ESCAPE '\\' OR phone LIKE ? ESCAPE '\\' OR email LIKE ? ESCAPE '\\') ORDER BY name LIMIT 10",
  ).bind(jwt.tenant_id, pattern, pattern, pattern).all();
  return c.json({ items: result.results.map((row) => ({ id: row.id, code: row.code, name: row.name, type: row.type, email: row.email ?? undefined, phone: row.phone ?? undefined })) });
});
router.post("/quick", requirePermission(PERMISSIONS.WRITE_PATIENTS), auditLog("create", "referrer"), zValidator("json", referrerQuickCreateSchema), async (c) => {
  const jwt = getJwt(c);
  const input = c.req.valid("json");
  const existing = await c.env.DB.prepare(
    "SELECT id FROM referrers WHERE tenant_id = ? AND ((? IS NOT NULL AND email = ?) OR (? IS NOT NULL AND phone = ?)) LIMIT 1",
  ).bind(jwt.tenant_id, input.email ?? null, input.email ?? null, input.phone ?? null, input.phone ?? null).first();
  if (existing) return c.json({ error: "Người giới thiệu với email hoặc số điện thoại này đã tồn tại", code: "conflict" }, 409);
  return c.json(await referralService.createReferrer(c.env.DB, jwt.tenant_id, jwt.sub, input), 201);
});
router.post("/", requirePermission(PERMISSIONS.MANAGE_REFERRERS), auditLog("create", "referrer"), zValidator("json", referrerCreateSchema), async (c) => {
  const jwt = getJwt(c);
  return c.json(await referralService.createReferrer(c.env.DB, jwt.tenant_id, jwt.sub, c.req.valid("json")), 201);
});
router.patch("/:id", requirePermission(PERMISSIONS.MANAGE_REFERRERS), auditLog("update", "referrer"), zValidator("json", referrerUpdateSchema), async (c) => {
  const jwt = getJwt(c);
  return c.json(await referralService.updateReferrer(c.env.DB, jwt.tenant_id, jwt.sub, c.req.param("id"), c.req.valid("json")));
});
router.delete("/:id", requirePermission(PERMISSIONS.MANAGE_REFERRERS), auditLog("delete", "referrer"), async (c) => {
  const jwt = getJwt(c);
  await referralService.deleteReferrer(c.env.DB, jwt.tenant_id, jwt.sub, c.req.param("id"));
  return c.body(null, 204);
});
router.post("/:id/regenerate-code", requirePermission(PERMISSIONS.MANAGE_REFERRERS), auditLog("regenerate_code", "referrer"), async (c) => {
  const jwt = getJwt(c);
  return c.json(await referralService.regenerateCode(c.env.DB, jwt.tenant_id, jwt.sub, c.req.param("id")));
});
router.post("/:id/account", requirePermission(PERMISSIONS.MANAGE_REFERRERS), auditLog("create_portal_account", "referrer"), zValidator("json", referrerAccountCreateSchema), async (c) => {
  const jwt = getJwt(c);
  const baseUrl = c.env.FRONTEND_ORIGIN || new URL(c.req.url).origin;
  const account = await referrerPortalService.createAccount(c.env.DB, jwt.tenant_id, c.req.param("id"), c.req.valid("json").email, jwt.sub, baseUrl);
  const emailed = await sendReferrerPortalLink(c.env, account.email, account.activation_link, "activate");
  return c.json({ ...account, emailed }, 201);
});
router.post("/:id/account/reset-password", requirePermission(PERMISSIONS.MANAGE_REFERRERS), auditLog("reset_portal_password", "referrer"), async (c) => {
  const jwt = getJwt(c);
  const account = await c.env.DB.prepare("SELECT id FROM referrer_accounts WHERE tenant_id = ? AND referrer_id = ?").bind(jwt.tenant_id, c.req.param("id")).first<{ id: string }>();
  if (!account) return c.json({ error: "Tài khoản portal không tồn tại", code: "not_found" }, 404);
  const token = await referrerPortalService.createActionToken(c.env.DB, jwt.tenant_id, account.id, "reset_password", jwt.sub);
  const resetLink = `${c.env.FRONTEND_ORIGIN}/referrer/activate?token=${token}`;
  const accountEmail = await c.env.DB.prepare("SELECT email FROM referrer_accounts WHERE id = ?").bind(account.id).first<{ email: string }>();
  const emailed = accountEmail ? await sendReferrerPortalLink(c.env, accountEmail.email, resetLink, "reset_password") : false;
  return c.json({ reset_link: resetLink, emailed });
});
router.get("/lookup/:code", requirePermission(PERMISSIONS.WRITE_PATIENTS), async (c) => {
  const jwt = getJwt(c);
  const referrer = await createReferralsRepository(c.env.DB).findReferrerByCode(jwt.tenant_id, c.req.param("code"));
  if (!referrer) return c.json({ error: "Mã giới thiệu không hợp lệ", code: "not_found" }, 404);
  return c.json({ id: referrer.id, code: referrer.code, name: referrer.name, type: referrer.type });
});

export default router;
