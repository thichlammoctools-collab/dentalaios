import type { D1Database } from "@cloudflare/workers-types";
import { ConflictError, NotFoundError, UnauthorizedError } from "../lib/errors";
import { hashPassword, verifyPassword } from "../lib/password";
import { newId } from "../lib/ids";
import { signReferrerPortalJwt } from "../lib/referrer-portal-jwt";

async function hashToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest), (item) => item.toString(16).padStart(2, "0")).join("");
}

function generateToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (item) => item.toString(16).padStart(2, "0")).join("");
}

export const referrerPortalService = {
  async createAccount(db: D1Database, tenantId: string, referrerId: string, email: string, createdBy: string, baseUrl: string) {
    const referrer = await db.prepare("SELECT id FROM referrers WHERE tenant_id = ? AND id = ?").bind(tenantId, referrerId).first();
    if (!referrer) throw new NotFoundError("Người giới thiệu không tồn tại");
    const existing = await db.prepare("SELECT id FROM referrer_accounts WHERE tenant_id = ? AND referrer_id = ?").bind(tenantId, referrerId).first<{ id: string }>();
    if (existing) throw new ConflictError("Người giới thiệu đã có tài khoản portal");
    const id = newId();
    const normalizedEmail = email.toLowerCase().trim();
    try {
      await db.prepare("INSERT INTO referrer_accounts (id, tenant_id, referrer_id, email) VALUES (?, ?, ?, ?)").bind(id, tenantId, referrerId, normalizedEmail).run();
    } catch {
      throw new ConflictError("Email portal đã được sử dụng trong phòng khám");
    }
    const token = await this.createActionToken(db, tenantId, id, "activate", createdBy);
    return { id, email: normalizedEmail, activation_link: `${baseUrl}/referrer/activate?token=${token}` };
  },

  async createActionToken(db: D1Database, tenantId: string, accountId: string, kind: "activate" | "reset_password", createdBy?: string): Promise<string> {
    const token = generateToken();
    await db.prepare("UPDATE referrer_account_tokens SET used_at = datetime('now') WHERE tenant_id = ? AND account_id = ? AND kind = ? AND used_at IS NULL").bind(tenantId, accountId, kind).run();
    await db.prepare(
      "INSERT INTO referrer_account_tokens (id, tenant_id, account_id, token_hash, kind, expires_at, created_by) VALUES (?, ?, ?, ?, ?, ?, ?)",
    ).bind(newId(), tenantId, accountId, await hashToken(token), kind, new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), createdBy ?? null).run();
    return token;
  },

  async activateOrReset(db: D1Database, token: string, password: string) {
    const hash = await hashToken(token);
    const row = await db.prepare(
      `SELECT t.id AS token_id, t.tenant_id, t.account_id, t.kind, a.referrer_id FROM referrer_account_tokens t
       JOIN referrer_accounts a ON a.id = t.account_id WHERE t.token_hash = ? AND t.used_at IS NULL AND t.expires_at > datetime('now')`,
    ).bind(hash).first<{ token_id: string; tenant_id: string; account_id: string; kind: string; referrer_id: string }>();
    if (!row) throw new NotFoundError("Link kích hoạt không hợp lệ hoặc đã hết hạn");
    const passwordHash = await hashPassword(password);
    const result = await db.batch([
      db.prepare("UPDATE referrer_account_tokens SET used_at = datetime('now') WHERE id = ? AND used_at IS NULL").bind(row.token_id),
      db.prepare("UPDATE referrer_accounts SET password_hash = ?, is_active = 1, updated_at = datetime('now') WHERE id = ?").bind(passwordHash, row.account_id),
    ]);
    if (result[0].meta.changes !== 1) throw new ConflictError("Link đã được sử dụng");
    return { tenant_id: row.tenant_id, account_id: row.account_id, referrer_id: row.referrer_id };
  },

  async login(db: D1Database, jwtSecret: string | undefined, clinicSlug: string, email: string, password: string) {
    const row = await db.prepare(
      `SELECT a.id AS account_id, a.tenant_id, a.referrer_id, a.password_hash, a.is_active, t.is_active AS tenant_active
       FROM referrer_accounts a JOIN tenants t ON t.id = a.tenant_id
       WHERE t.slug = ? AND a.email = ? LIMIT 1`,
    ).bind(clinicSlug, email.toLowerCase().trim()).first<{ account_id: string; tenant_id: string; referrer_id: string; password_hash: string; is_active: number; tenant_active: number }>();
    if (!row || row.is_active !== 1 || row.tenant_active !== 1 || !(await verifyPassword(password, row.password_hash))) throw new UnauthorizedError("Email hoặc mật khẩu portal không đúng");
    await db.prepare("UPDATE referrer_accounts SET last_login_at = datetime('now') WHERE id = ?").bind(row.account_id).run();
    return signReferrerPortalJwt({ sub: row.account_id, tenant_id: row.tenant_id, referrer_id: row.referrer_id }, jwtSecret);
  },

  async loginByAccount(db: D1Database, jwtSecret: string | undefined, accountId: string) {
    const row = await db.prepare("SELECT id, tenant_id, referrer_id FROM referrer_accounts WHERE id = ? AND is_active = 1").bind(accountId).first<{ id: string; tenant_id: string; referrer_id: string }>();
    if (!row) throw new UnauthorizedError("Tài khoản portal không còn hoạt động");
    return signReferrerPortalJwt({ sub: row.id, tenant_id: row.tenant_id, referrer_id: row.referrer_id }, jwtSecret);
  },

  async dashboard(db: D1Database, tenantId: string, referrerId: string) {
    const referrer = await db.prepare("SELECT id, code, name, type FROM referrers WHERE tenant_id = ? AND id = ?").bind(tenantId, referrerId).first();
    if (!referrer) throw new UnauthorizedError("Người giới thiệu không còn hoạt động");
    const stats = await db.prepare(
      `SELECT COUNT(*) AS case_count, COALESCE(SUM(CASE WHEN rw.status IN ('cash_payable','cash_paid','voucher_issued') THEN rw.calculated_amount ELSE 0 END), 0) AS reward_total
       FROM referral_cases c LEFT JOIN referral_rewards rw ON rw.referral_case_id = c.id WHERE c.tenant_id = ? AND c.referrer_id = ?`,
    ).bind(tenantId, referrerId).first<{ case_count: number; reward_total: number }>();
    return {
      referrer,
      case_count: Number(stats?.case_count ?? 0),
      total_cases: Number(stats?.case_count ?? 0),
      reward_total: Number(stats?.reward_total ?? 0),
    };
  },

  async listCases(db: D1Database, tenantId: string, referrerId: string) {
    const result = await db.prepare("SELECT id, status, registered_at, eligible_at FROM referral_cases WHERE tenant_id = ? AND referrer_id = ? ORDER BY registered_at DESC").bind(tenantId, referrerId).all();
    return result.results;
  },

  async listRewards(db: D1Database, tenantId: string, referrerId: string) {
    const result = await db.prepare(
      `SELECT rw.id, rw.reward_kind, rw.calculated_amount, rw.currency, rw.status, rw.created_at, rw.paid_at, rw.reviewed_at
       FROM referral_rewards rw JOIN referral_cases c ON c.id = rw.referral_case_id WHERE rw.tenant_id = ? AND c.referrer_id = ? ORDER BY rw.created_at DESC`,
    ).bind(tenantId, referrerId).all();
    return result.results;
  },

  async listVouchers(db: D1Database, tenantId: string, referrerId: string) {
    const result = await db.prepare(
      `SELECT v.id, v.code, v.face_value, v.issued_at, v.expires_at, v.status FROM referral_vouchers v
       JOIN referral_rewards rw ON rw.id = v.reward_id JOIN referral_cases c ON c.id = rw.referral_case_id
       WHERE v.tenant_id = ? AND c.referrer_id = ? ORDER BY v.issued_at DESC`,
    ).bind(tenantId, referrerId).all();
    return result.results;
  },
};
