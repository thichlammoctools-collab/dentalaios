import type { MiddlewareHandler } from "hono";
import type { Env } from "../index";
import { UnauthorizedError } from "../lib/errors";
import { verifyReferrerPortalJwt, type ReferrerPortalJwtPayload } from "../lib/referrer-portal-jwt";

export type ReferrerPortalAuthContext = { referrerPortalJwt: ReferrerPortalJwtPayload };

export function requireReferrerPortalAuth(): MiddlewareHandler<{ Bindings: Env; Variables: ReferrerPortalAuthContext }> {
  return async (c, next) => {
    const header = c.req.header("Authorization");
    if (!header?.startsWith("Bearer ")) throw new UnauthorizedError("Missing portal authorization");
    try {
      const jwt = await verifyReferrerPortalJwt(header.slice(7).trim(), c.env.REFERRAL_PORTAL_JWT_SECRET);
      const account = await c.env.DB.prepare("SELECT id FROM referrer_accounts WHERE id = ? AND tenant_id = ? AND referrer_id = ? AND is_active = 1").bind(jwt.sub, jwt.tenant_id, jwt.referrer_id).first();
      if (!account) throw new UnauthorizedError("Tài khoản portal không còn hoạt động");
      c.set("referrerPortalJwt", jwt);
      await next();
    } catch (error) {
      if (error instanceof UnauthorizedError) throw error;
      throw new UnauthorizedError("Portal token không hợp lệ hoặc đã hết hạn");
    }
  };
}

export function getReferrerPortalJwt(c: { get: (key: "referrerPortalJwt") => ReferrerPortalJwtPayload | undefined }): ReferrerPortalJwtPayload {
  const jwt = c.get("referrerPortalJwt");
  if (!jwt) throw new Error("Portal route is missing requireReferrerPortalAuth");
  return jwt;
}
