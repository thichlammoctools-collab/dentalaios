import { Hono } from "hono";
import type { Env } from "../index";
import { getReferrerPortalJwt, requireReferrerPortalAuth, type ReferrerPortalAuthContext } from "../middleware/referrer-portal-auth";
import { referrerPortalService } from "../services/referrer-portal.service";

const router = new Hono<{ Bindings: Env; Variables: ReferrerPortalAuthContext }>();
router.use("*", requireReferrerPortalAuth());
router.get("/me", async (c) => { const jwt = getReferrerPortalJwt(c); return c.json(await referrerPortalService.dashboard(c.env.DB, jwt.tenant_id, jwt.referrer_id)); });
router.get("/dashboard", async (c) => { const jwt = getReferrerPortalJwt(c); return c.json(await referrerPortalService.dashboard(c.env.DB, jwt.tenant_id, jwt.referrer_id)); });
router.get("/cases", async (c) => { const jwt = getReferrerPortalJwt(c); return c.json({ items: await referrerPortalService.listCases(c.env.DB, jwt.tenant_id, jwt.referrer_id) }); });
router.get("/rewards", async (c) => { const jwt = getReferrerPortalJwt(c); return c.json({ items: await referrerPortalService.listRewards(c.env.DB, jwt.tenant_id, jwt.referrer_id) }); });
router.get("/vouchers", async (c) => { const jwt = getReferrerPortalJwt(c); return c.json({ items: await referrerPortalService.listVouchers(c.env.DB, jwt.tenant_id, jwt.referrer_id) }); });
export default router;
