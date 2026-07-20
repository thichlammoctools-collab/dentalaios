import type { D1Database } from "@cloudflare/workers-types";
import type { PlatformSession, PlatformUser } from "@shared/types";
import { decryptSecret, encryptSecret } from "../lib/crypto";
import { newId } from "../lib/ids";
import { signPlatformJwt } from "../lib/platform-jwt";
import { generateTotpSecret, verifyTotp } from "../lib/platform-totp";
import { verifyPassword } from "../lib/password";
import { UnauthorizedError } from "../lib/errors";
import { createPlatformSessionsRepository } from "../repositories/platform-sessions.repo";
import { createPlatformUsersRepository } from "../repositories/platform-users.repo";
export interface PlatformAuthDeps {
  db: D1Database;
  jwtSecret?: string;
  mfaEncryptionKey?: string;
}
export interface RequestMetadata {
  ip: string;
  userAgent: string;
}
function required(value: string | undefined, name: string): string {
  if (!value) throw new Error(`${name} is not configured`);
  return value;
}

async function hashMetadata(value: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}
export const platformAuthService = {
  async login(
    deps: PlatformAuthDeps,
    email: string,
    password: string,
  ): Promise<{ challenge_id: string }> {
    const user = await createPlatformUsersRepository(deps.db).findByEmail(
      email,
    );
    if (
      !user ||
      !user.user.is_active ||
      !(await verifyPassword(password, user.password_hash)) ||
      !user.mfa_secret_encrypted
    )
      throw new UnauthorizedError("Email hoặc mật khẩu không đúng");
    const challenge_id = newId();
    await createPlatformSessionsRepository(deps.db).createChallenge(
      challenge_id,
      user.user.id,
      new Date(Date.now() + 300000).toISOString(),
    );
    return { challenge_id };
  },
  async verifyMfa(
    deps: PlatformAuthDeps,
    challengeId: string,
    input: string,
    metadata: RequestMetadata,
  ): Promise<PlatformSession> {
    const sessions = createPlatformSessionsRepository(deps.db);
    const userId = await sessions.consumeChallenge(challengeId);
    if (!userId)
      throw new UnauthorizedError("Mã xác thực không hợp lệ hoặc đã hết hạn");
    const users = createPlatformUsersRepository(deps.db);
    const context = await users.findById(userId);
    if (!context || !context.user.is_active || !context.mfa_secret_encrypted)
      throw new UnauthorizedError("Mã xác thực không hợp lệ hoặc đã hết hạn");
    const [ciphertext, iv] = context.mfa_secret_encrypted.split(".");
    const secret = await decryptSecret(
      ciphertext,
      iv,
      required(deps.mfaEncryptionKey, "PLATFORM_MFA_ENCRYPTION_KEY"),
    );
    if (!(await verifyTotp(secret, input)))
      throw new UnauthorizedError("Mã xác thực không hợp lệ hoặc đã hết hạn");
    const now = new Date().toISOString();
    const id = newId();
    const signed = await signPlatformJwt(
      {
        sub: context.user.id,
        sid: id,
        role_key: context.role.key,
        permissions: context.role.permissions,
      },
      deps.jwtSecret,
    );
    await sessions.create({
      id,
      platform_user_id: context.user.id,
      issued_at: now,
      expires_at: signed.expires_at,
      last_seen_at: now,
      mfa_verified_at: now,
      ip_hash: await hashMetadata(metadata.ip),
      user_agent_hash: await hashMetadata(metadata.userAgent),
    });
    await users.touchLogin(context.user.id);
    return {
      token: signed.token,
      expires_at: signed.expires_at,
      user: context.user,
      role: context.role,
    };
  },
  async provisionMfa(
    deps: PlatformAuthDeps,
    user: PlatformUser,
  ): Promise<{ secret: string; otpauth_uri: string }> {
    const secret = generateTotpSecret();
    const encrypted = await encryptSecret(
      secret,
      required(deps.mfaEncryptionKey, "PLATFORM_MFA_ENCRYPTION_KEY"),
    );
    await createPlatformUsersRepository(deps.db).update(user.id, {
      mfa_secret_encrypted: `${encrypted.ciphertext}.${encrypted.iv}`,
      mfa_enabled_at: null,
    });
    return {
      secret,
      otpauth_uri: `otpauth://totp/DentalAIOS%20Platform:${encodeURIComponent(user.id)}?secret=${secret}&issuer=DentalAIOS%20Platform&algorithm=SHA1&digits=6&period=30`,
    };
  },
  async confirmMfa(
    deps: PlatformAuthDeps,
    user: PlatformUser,
    input: string,
  ): Promise<void> {
    const context = await createPlatformUsersRepository(deps.db).findById(
      user.id,
    );
    if (!context?.mfa_secret_encrypted)
      throw new UnauthorizedError("MFA chưa được cấp phát");
    const [ciphertext, iv] = context.mfa_secret_encrypted.split(".");
    if (
      !(await verifyTotp(
        await decryptSecret(
          ciphertext,
          iv,
          required(deps.mfaEncryptionKey, "PLATFORM_MFA_ENCRYPTION_KEY"),
        ),
        input,
      ))
    )
      throw new UnauthorizedError("Mã xác thực không hợp lệ");
    await createPlatformUsersRepository(deps.db).update(user.id, {
      mfa_enabled_at: new Date().toISOString(),
    });
  },
};
