/**
 * JWT signing/verification using jose (Workers-native, no Node crypto).
 *
 * Algorithm: HS256 with shared secret from env.JWT_SECRET.
 * TTL: 24h.
 *
 * Architecture rule #8: JWT payload NEVER contains patient data.
 * Only IDs (user, tenant, branch, role) + permissions.
 */

import { SignJWT, jwtVerify } from "jose";
import type { JwtPayload } from "@shared/types";

const ALG = "HS256";
const TTL_SECONDS = 60 * 60 * 24; // 24h

function getSecret(secret: string | undefined): Uint8Array {
  if (!secret) throw new Error("JWT_SECRET is not configured");
  // jose expects a Uint8Array key.
  return new TextEncoder().encode(secret);
}

export interface SignClaims {
  sub: string; // user id
  tenant_id: string;
  branch_id: string;
  role_id: string;
  permissions: string[];
}

export async function signJwt(
  claims: SignClaims,
  secret: string | undefined,
): Promise<{ token: string; expires_at: string }> {
  const now = Math.floor(Date.now() / 1000);
  const token = await new SignJWT({
    tenant_id: claims.tenant_id,
    branch_id: claims.branch_id,
    role_id: claims.role_id,
    permissions: claims.permissions,
  })
    .setProtectedHeader({ alg: ALG })
    .setSubject(claims.sub)
    .setIssuedAt(now)
    .setExpirationTime(now + TTL_SECONDS)
    .sign(getSecret(secret));

  const expires_at = new Date((now + TTL_SECONDS) * 1000).toISOString();
  return { token, expires_at };
}

export async function verifyJwt(
  token: string,
  secret: string | undefined,
): Promise<JwtPayload> {
  const { payload } = await jwtVerify(token, getSecret(secret), { algorithms: [ALG] });
  // jose types are loose — narrow them.
  if (typeof payload.sub !== "string") throw new Error("Invalid token: missing sub");
  if (typeof payload.tenant_id !== "string") throw new Error("Invalid token: missing tenant_id");
  if (typeof payload.branch_id !== "string") throw new Error("Invalid token: missing branch_id");
  if (typeof payload.role_id !== "string") throw new Error("Invalid token: missing role_id");
  if (!Array.isArray(payload.permissions)) throw new Error("Invalid token: missing permissions");
  if (typeof payload.exp !== "number") throw new Error("Invalid token: missing exp");
  if (typeof payload.iat !== "number") throw new Error("Invalid token: missing iat");

  return {
    sub: payload.sub,
    tenant_id: payload.tenant_id,
    branch_id: payload.branch_id,
    role_id: payload.role_id,
    permissions: payload.permissions as string[],
    exp: payload.exp,
    iat: payload.iat,
  };
}