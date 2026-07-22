import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { referrerPortalLoginSchema, referrerPortalPasswordSchema } from "@shared/validation";
import type { Env } from "../index";
import { rateLimit } from "../middleware/rate-limit";
import { referrerPortalService } from "../services/referrer-portal.service";

const router = new Hono<{ Bindings: Env }>();
router.post("/login", rateLimit({ windowSeconds: 60, maxRequests: 5 }), zValidator("json", referrerPortalLoginSchema), async (c) => {
  const data = c.req.valid("json");
  return c.json({ session: await referrerPortalService.login(c.env.DB, c.env.REFERRAL_PORTAL_JWT_SECRET, data.clinic_slug, data.email, data.password) });
});
router.post("/activate", rateLimit({ windowSeconds: 60, maxRequests: 5 }), zValidator("json", referrerPortalPasswordSchema), async (c) => {
  const account = await referrerPortalService.activateOrReset(c.env.DB, c.req.valid("json").token, c.req.valid("json").password);
  return c.json({ session: await referrerPortalService.loginByAccount(c.env.DB, c.env.REFERRAL_PORTAL_JWT_SECRET, account.account_id) });
});
router.post("/reset-password", rateLimit({ windowSeconds: 60, maxRequests: 5 }), zValidator("json", referrerPortalPasswordSchema), async (c) => {
  await referrerPortalService.activateOrReset(c.env.DB, c.req.valid("json").token, c.req.valid("json").password);
  return c.json({ ok: true });
});
router.post("/logout", (c) => c.json({ ok: true }));
export default router;
