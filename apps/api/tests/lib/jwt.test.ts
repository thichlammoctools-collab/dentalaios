import { describe, it, expect } from "vitest";
import { signJwt, verifyJwt } from "../../src/lib/jwt";

describe("JWT sign/verify", () => {
  const claims = {
    sub: "user-123",
    tenant_id: "tenant-1",
    branch_id: "branch-1",
    role_id: "role-1",
    permissions: ["read_patients", "write_plans"],
  };

  it("signs and verifies roundtrip", async () => {
    const { token } = await signJwt(claims, "secret");
    const payload = await verifyJwt(token, "secret");
    expect(payload.sub).toBe(claims.sub);
    expect(payload.tenant_id).toBe(claims.tenant_id);
    expect(payload.branch_id).toBe(claims.branch_id);
    expect(payload.role_id).toBe(claims.role_id);
    expect(payload.permissions).toEqual(claims.permissions);
  });

  it("rejects token signed with different secret", async () => {
    const { token } = await signJwt(claims, "secret-A");
    await expect(verifyJwt(token, "secret-B")).rejects.toThrow();
  });

  it("rejects tampered token", async () => {
    const { token } = await signJwt(claims, "secret");
    const tampered = token.slice(0, -3) + "AAA";
    await expect(verifyJwt(tampered, "secret")).rejects.toThrow();
  });

  it("rejects malformed token", async () => {
    await expect(verifyJwt("not-a-jwt", "secret")).rejects.toThrow();
  });

  it("rejects empty token", async () => {
    await expect(verifyJwt("", "secret")).rejects.toThrow();
  });

  it("rejects expired token", async () => {
    // jose's HS256 expiry check — we use TTL of 24h. To simulate expired,
    // we sign with exp manually in the past by overriding time?
    // Simpler: sign a token then verify with a manually-crafted expired one.
    // We construct the token ourselves using jose.
    const { SignJWT } = await import("jose");
    const expired = await new SignJWT({
      tenant_id: "t",
      branch_id: "b",
      role_id: "r",
      permissions: [],
    })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject("u")
      .setIssuedAt(Math.floor(Date.now() / 1000) - 7200) // 2h ago
      .setExpirationTime(Math.floor(Date.now() / 1000) - 3600) // 1h ago (expired)
      .sign(new TextEncoder().encode("secret"));
    await expect(verifyJwt(expired, "secret")).rejects.toThrow();
  });

  it("throws when secret is undefined", async () => {
    await expect(signJwt(claims, undefined)).rejects.toThrow("JWT_SECRET is not configured");
  });

  it("returned expires_at is in the future and roughly 24h", async () => {
    const before = Math.floor(Date.now() / 1000);
    const { expires_at } = await signJwt(claims, "secret");
    const expiresAt = Math.floor(new Date(expires_at).getTime() / 1000);
    const after = Math.floor(Date.now() / 1000);
    // TTL = 24h = 86400s, but should be within [before+86399, after+86401]
    expect(expiresAt).toBeGreaterThanOrEqual(before + 86399);
    expect(expiresAt).toBeLessThanOrEqual(after + 86401);
  });

  it("issued token contains all required payload fields", async () => {
    const { token } = await signJwt(claims, "secret");
    const payload = await verifyJwt(token, "secret");
    expect(payload).toMatchObject({
      sub: claims.sub,
      tenant_id: claims.tenant_id,
      branch_id: claims.branch_id,
      role_id: claims.role_id,
      permissions: claims.permissions,
    });
    expect(typeof payload.exp).toBe("number");
    expect(typeof payload.iat).toBe("number");
    expect(payload.exp).toBeGreaterThan(payload.iat);
  });
});