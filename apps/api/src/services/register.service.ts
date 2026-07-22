/**
 * Registration service — handles:
 *   1. Self-registration: create tenant + branch + admin user + email verification token
 *   2. Email verification: activate user account
 *   3. Invite acceptance: add member to existing tenant
 */

import type { D1Database } from "@cloudflare/workers-types";
import type {
  AuthSession,
  RegisterRequest,
  EmailVerifyRequest,
  InviteAcceptRequest,
} from "@shared/types";
import { hashPassword } from "../lib/password";
import { signJwt } from "../lib/jwt";
import { NotFoundError, ConflictError } from "../lib/errors";
import { newId } from "../lib/ids";
import { isUniqueConstraintError } from "../lib/db-errors";
import { SYSTEM_ROLES } from "@shared/constants";

function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 60)
    .trim();
}

export interface RegisterDeps {
  db: D1Database;
  jwtSecret: string | undefined;
  baseUrl: string;
}

export const registerService = {
  // ── Self-registration ─────────────────────────────────────────────────────────

  async register(
    deps: RegisterDeps,
    data: RegisterRequest,
  ): Promise<{ message: string; verify_token: string }> {
    const { db } = deps;

    const existing = await db
      .prepare("SELECT id FROM users WHERE email = ? LIMIT 1")
      .bind(data.email.toLowerCase())
      .first();
    if (existing) throw new ConflictError("Email đã được sử dụng");

    const tenantId = newId();
    const branchId = newId();
    const userId = newId();
    const roleIds = new Map(SYSTEM_ROLES.map((role) => [role.key, newId()]));
    const verifyToken = generateSecureToken();
    const tokenId = newId();
    const slug = slugify(data.clinic_name);
    const password_hash = await hashPassword(data.password);

    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const email = data.email.toLowerCase().trim();

    // D1 batch is executed as one transaction. This prevents a concurrent
    // registration with the same email from leaving tenant/branch/role rows
    // behind when the unique users.email insert loses the race.
    try {
      await db.batch([
        db
          .prepare("INSERT INTO tenants (id, name, slug, is_active) VALUES (?, ?, ?, 1)")
          .bind(tenantId, data.clinic_name.trim(), slug || tenantId),
        db
          .prepare("INSERT INTO branches (id, tenant_id, name, address) VALUES (?, ?, ?, ?)")
          .bind(branchId, tenantId, (data.branch_name || "Chi nhánh chính").trim(), ""),
        ...SYSTEM_ROLES.map((role) => db
          .prepare("INSERT INTO roles (id, tenant_id, system_key, name, permissions) VALUES (?, ?, ?, ?, ?)")
          .bind(roleIds.get(role.key), tenantId, role.key, role.name, JSON.stringify(role.permissions))),
        db
          .prepare(
            `INSERT INTO users (id, tenant_id, branch_id, role_id, email, name, password_hash, is_active)
             VALUES (?, ?, ?, ?, ?, ?, ?, 0)`,
          )
          .bind(userId, tenantId, branchId, roleIds.get("admin"), email, data.name.trim(), password_hash),
        db
          .prepare(
            `INSERT INTO email_verification_tokens (id, token, user_id, tenant_id, email, expires_at)
             VALUES (?, ?, ?, ?, ?, ?)`,
          )
          .bind(tokenId, verifyToken, userId, tenantId, email, expiresAt),
      ]);
    } catch (err) {
      if (isUniqueConstraintError(err)) {
        throw new ConflictError("Email đã được sử dụng");
      }
      throw err;
    }

    return {
      message: "Đăng ký thành công. Vui lòng xác thực email để kích hoạt tài khoản.",
      verify_token: verifyToken,
    };
  },

  // ── Email verification ────────────────────────────────────────────────────────

  async verifyEmail(
    deps: RegisterDeps,
    data: EmailVerifyRequest,
  ): Promise<{ message: string; session: AuthSession }> {
    const { db, jwtSecret } = deps;

    const row = await db
      .prepare(
        `SELECT evt.*, u.id AS user_id, u.tenant_id, u.branch_id, u.role_id,
                u.email, u.name, u.is_active AS user_is_active,
                r.name AS role_name, r.permissions AS role_permissions,
                t.name AS tenant_name, t.slug AS tenant_slug,
                b.name AS branch_name, b.address AS branch_address
         FROM email_verification_tokens evt
         JOIN users u ON u.id = evt.user_id
         JOIN roles r ON r.id = u.role_id
         JOIN tenants t ON t.id = u.tenant_id
         JOIN branches b ON b.id = u.branch_id
         WHERE evt.token = ? AND evt.expires_at > datetime('now')
         LIMIT 1`,
      )
      .bind(data.token)
      .first();

    if (!row) throw new NotFoundError("Token không hợp lệ hoặc đã hết hạn");

    const r = row as Record<string, unknown>;
    if (r.user_is_active === 1) throw new ConflictError("Tài khoản đã được kích hoạt trước đó");

    // A concurrent request can read the token immediately before another
    // request consumes it. Compare-and-set the account state first: only one
    // caller can move is_active from 0 to 1 and therefore receive a session.
    const activated = await db
      .prepare("UPDATE users SET is_active = 1 WHERE id = ? AND is_active = 0")
      .bind(r.user_id as string)
      .run();
    if (activated.meta.changes !== 1) {
      throw new ConflictError("Token đã được sử dụng");
    }
    await db.prepare("DELETE FROM email_verification_tokens WHERE token = ?").bind(data.token).run();

    const permissions = JSON.parse((r.role_permissions as string) || "[]");
    const { token, expires_at } = await signJwt(
      { sub: r.user_id as string, tenant_id: r.tenant_id as string, branch_id: r.branch_id as string, role_id: r.role_id as string, permissions },
      jwtSecret,
    );

    return {
      message: "Xác thực email thành công!",
      session: {
        user: { id: r.user_id as string, tenant_id: r.tenant_id as string, branch_id: r.branch_id as string, role_id: r.role_id as string, email: r.email as string, name: r.name as string, is_active: true, created_at: "" },
        role: { id: r.role_id as string, tenant_id: r.tenant_id as string, name: r.role_name as string, permissions, created_at: "" },
        tenant: { id: r.tenant_id as string, name: r.tenant_name as string, slug: r.tenant_slug as string | undefined, tax_code: "", tax_address: "", hotline: "", bank_account_number: "", is_active: true, created_at: "" },
        branch: { id: r.branch_id as string, tenant_id: r.tenant_id as string, name: r.branch_name as string, address: r.branch_address as string, phone: "", email: "", manager_name: "", opening_date: null, created_at: "" },
        token,
        expires_at,
      },
    };
  },

  // ── Invite management ─────────────────────────────────────────────────────────

  async createInvite(
    deps: RegisterDeps,
    inviterUserId: string,
    tenantId: string,
    data: { email: string; role_id: string; branch_id: string },
  ): Promise<{ invite_link: string }> {
    const { db, baseUrl } = deps;

    const existing = await db
      .prepare("SELECT id FROM users WHERE email = ? AND tenant_id = ? LIMIT 1")
      .bind(data.email.toLowerCase().trim(), tenantId)
      .first();
    if (existing) throw new ConflictError("Email đã là thành viên của phòng khám này");

    const role = await db.prepare("SELECT id FROM roles WHERE id = ? AND tenant_id = ? AND system_key IS NOT NULL LIMIT 1").bind(data.role_id, tenantId).first();
    if (!role) throw new NotFoundError("Role không hợp lệ");

    const branch = await db.prepare("SELECT id FROM branches WHERE id = ? AND tenant_id = ? LIMIT 1").bind(data.branch_id, tenantId).first();
    if (!branch) throw new NotFoundError("Chi nhánh không hợp lệ");

    const tokenId = newId();
    const inviteToken = generateSecureToken();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

    await db
      .prepare(
        `INSERT INTO invite_tokens (id, token, tenant_id, inviter_id, email, role_id, branch_id, expires_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(tokenId, inviteToken, tenantId, inviterUserId, data.email.toLowerCase().trim(), data.role_id, data.branch_id, expiresAt)
      .run();

    return { invite_link: `${baseUrl}/invite/${inviteToken}` };
  },

  async acceptInvite(
    deps: RegisterDeps,
    data: InviteAcceptRequest,
  ): Promise<{ message: string; session: AuthSession }> {
    const { db, jwtSecret } = deps;

    const row = await db
      .prepare(
        `SELECT it.*, r.name AS role_name, r.permissions AS role_permissions,
                t.name AS tenant_name, t.slug AS tenant_slug,
                b.name AS branch_name, b.address AS branch_address
         FROM invite_tokens it
         JOIN roles r ON r.id = it.role_id
         JOIN tenants t ON t.id = it.tenant_id
         JOIN branches b ON b.id = it.branch_id
         WHERE it.token = ? AND it.expires_at > datetime('now') AND it.accepted_at IS NULL
         LIMIT 1`,
       )
       .bind(data.token)
       .first();

    if (!row) throw new NotFoundError("Link mời không hợp lệ hoặc đã hết hạn");

    const r = row as Record<string, unknown>;
    const inviteEmail = (r.email as string).toLowerCase().trim();

    const existingUser = await db
      .prepare("SELECT id FROM users WHERE email = ? LIMIT 1")
      .bind(inviteEmail)
      .first();
    if (existingUser) throw new ConflictError("Email đã được sử dụng");

    const userId = newId();
    const password_hash = await hashPassword(data.password);

    const acceptedAt = new Date().toISOString();
    try {
      const acceptResults = await db.batch([
        db
          .prepare(
            `UPDATE invite_tokens
             SET accepted_at = ?
             WHERE token = ? AND accepted_at IS NULL AND expires_at > datetime('now')`,
          )
          .bind(acceptedAt, data.token),
        db
          .prepare(
            `INSERT INTO users (id, tenant_id, branch_id, role_id, email, name, password_hash, is_active)
             SELECT ?, ?, ?, ?, ?, ?, ?, 1
             WHERE EXISTS (
               SELECT 1 FROM invite_tokens WHERE token = ? AND accepted_at = ?
             )`,
          )
          .bind(
            userId,
            r.tenant_id as string,
            r.branch_id as string,
            r.role_id as string,
            inviteEmail,
            data.name.trim(),
            password_hash,
            data.token,
            acceptedAt,
          ),
      ]);
      if (acceptResults[0].meta.changes !== 1 || acceptResults[1].meta.changes !== 1) {
        throw new ConflictError("Link mời đã được sử dụng hoặc đã hết hạn");
      }
    } catch (err) {
      if (isUniqueConstraintError(err)) {
        throw new ConflictError("Email đã được sử dụng");
      }
      throw err;
    }

    const permissions = JSON.parse((r.role_permissions as string) || "[]");
    const { token, expires_at } = await signJwt(
      { sub: userId, tenant_id: r.tenant_id as string, branch_id: r.branch_id as string, role_id: r.role_id as string, permissions },
      jwtSecret,
    );

    return {
      message: "Tài khoản đã được tạo thành công!",
      session: {
        user: { id: userId, tenant_id: r.tenant_id as string, branch_id: r.branch_id as string, role_id: r.role_id as string, email: inviteEmail, name: data.name.trim(), is_active: true, created_at: "" },
        role: { id: r.role_id as string, tenant_id: r.tenant_id as string, name: r.role_name as string, permissions, created_at: "" },
        tenant: { id: r.tenant_id as string, name: r.tenant_name as string, slug: r.tenant_slug as string | undefined, tax_code: "", tax_address: "", hotline: "", bank_account_number: "", is_active: true, created_at: "" },
        branch: { id: r.branch_id as string, tenant_id: r.tenant_id as string, name: r.branch_name as string, address: r.branch_address as string, phone: "", email: "", manager_name: "", opening_date: null, created_at: "" },
        token,
        expires_at,
      },
    };
  },
};

function generateSecureToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}
