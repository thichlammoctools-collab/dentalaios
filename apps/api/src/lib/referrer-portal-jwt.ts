import { SignJWT, jwtVerify } from "jose";

const TTL_SECONDS = 60 * 60 * 24;

function secret(value: string | undefined): Uint8Array {
  if (!value) throw new Error("REFERRAL_PORTAL_JWT_SECRET is not configured");
  return new TextEncoder().encode(value);
}

export interface ReferrerPortalJwtPayload {
  sub: string;
  tenant_id: string;
  referrer_id: string;
  exp: number;
  iat: number;
}

export async function signReferrerPortalJwt(claims: Omit<ReferrerPortalJwtPayload, "exp" | "iat">, key: string | undefined): Promise<{ token: string; expires_at: string }> {
  const now = Math.floor(Date.now() / 1000);
  const token = await new SignJWT({ tenant_id: claims.tenant_id, referrer_id: claims.referrer_id })
    .setProtectedHeader({ alg: "HS256" }).setSubject(claims.sub).setIssuedAt(now).setExpirationTime(now + TTL_SECONDS).sign(secret(key));
  return { token, expires_at: new Date((now + TTL_SECONDS) * 1000).toISOString() };
}

export async function verifyReferrerPortalJwt(token: string, key: string | undefined): Promise<ReferrerPortalJwtPayload> {
  const { payload } = await jwtVerify(token, secret(key), { algorithms: ["HS256"] });
  if (typeof payload.sub !== "string" || typeof payload.tenant_id !== "string" || typeof payload.referrer_id !== "string" || typeof payload.exp !== "number" || typeof payload.iat !== "number") throw new Error("Invalid portal token");
  return { sub: payload.sub, tenant_id: payload.tenant_id, referrer_id: payload.referrer_id, exp: payload.exp, iat: payload.iat };
}
