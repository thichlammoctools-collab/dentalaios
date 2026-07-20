import { SignJWT, jwtVerify } from "jose";
import type { PlatformJwtPayload, PlatformPermission, PlatformRoleKey } from "@shared/types";
import { PLATFORM_SESSION_MAX_AGE_SECONDS } from "@shared/constants";

const ALG = "HS256";
const ISSUER = "dentalaios-platform";
const AUDIENCE = "dentalaios-platform-api";

function secret(value: string | undefined): Uint8Array {
  if (!value) throw new Error("PLATFORM_JWT_SECRET is not configured");
  return new TextEncoder().encode(value);
}

export async function signPlatformJwt(
  claims: Pick<PlatformJwtPayload, "sub" | "sid" | "role_key" | "permissions">,
  key: string | undefined,
): Promise<{ token: string; expires_at: string }> {
  const now = Math.floor(Date.now() / 1000);
  const expires = now + PLATFORM_SESSION_MAX_AGE_SECONDS;
  const token = await new SignJWT({ sid: claims.sid, scope: "platform", role_key: claims.role_key, permissions: claims.permissions })
    .setProtectedHeader({ alg: ALG }).setIssuer(ISSUER).setAudience(AUDIENCE)
    .setSubject(claims.sub).setIssuedAt(now).setExpirationTime(expires).sign(secret(key));
  return { token, expires_at: new Date(expires * 1000).toISOString() };
}

export async function verifyPlatformJwt(token: string, key: string | undefined): Promise<PlatformJwtPayload> {
  const { payload } = await jwtVerify(token, secret(key), { algorithms: [ALG], issuer: ISSUER, audience: AUDIENCE });
  if (typeof payload.sub !== "string" || typeof payload.sid !== "string" || payload.scope !== "platform") throw new Error("Invalid platform token");
  if (typeof payload.role_key !== "string" || !Array.isArray(payload.permissions) || typeof payload.exp !== "number" || typeof payload.iat !== "number") throw new Error("Invalid platform token");
  return { sub: payload.sub, sid: payload.sid, scope: "platform", role_key: payload.role_key as PlatformRoleKey, permissions: payload.permissions.filter((value): value is PlatformPermission => typeof value === "string"), exp: payload.exp, iat: payload.iat };
}
