import type { D1Database } from "@cloudflare/workers-types";
import type { D1Row } from "./base";

export interface StoredPlatformSession { id: string; platform_user_id: string; issued_at: string; expires_at: string; last_seen_at: string; revoked_at?: string; mfa_verified_at: string; }

function map(row: D1Row): StoredPlatformSession {
  return { id: row.id as string, platform_user_id: row.platform_user_id as string, issued_at: row.issued_at as string, expires_at: row.expires_at as string, last_seen_at: row.last_seen_at as string, revoked_at: (row.revoked_at as string | null) ?? undefined, mfa_verified_at: row.mfa_verified_at as string };
}

export function createPlatformSessionsRepository(db: D1Database) {
  return {
    async create(data: StoredPlatformSession & { ip_hash: string; user_agent_hash: string }): Promise<void> { await db.prepare("INSERT INTO platform_sessions (id, platform_user_id, issued_at, expires_at, last_seen_at, mfa_verified_at, ip_hash, user_agent_hash) VALUES (?, ?, ?, ?, ?, ?, ?, ?)").bind(data.id, data.platform_user_id, data.issued_at, data.expires_at, data.last_seen_at, data.mfa_verified_at, data.ip_hash, data.user_agent_hash).run(); },
    async find(id: string): Promise<StoredPlatformSession | null> { const row = await db.prepare("SELECT id, platform_user_id, issued_at, expires_at, last_seen_at, revoked_at, mfa_verified_at FROM platform_sessions WHERE id = ? LIMIT 1").bind(id).first<D1Row>(); return row ? map(row) : null; },
    async touch(id: string): Promise<void> { await db.prepare("UPDATE platform_sessions SET last_seen_at = datetime('now') WHERE id = ?").bind(id).run(); },
    async revoke(id: string): Promise<void> { await db.prepare("UPDATE platform_sessions SET revoked_at = datetime('now') WHERE id = ? AND revoked_at IS NULL").bind(id).run(); },
    async reauth(id: string, at: string): Promise<void> { await db.prepare("UPDATE platform_sessions SET mfa_verified_at = ?, last_seen_at = ? WHERE id = ?").bind(at, at, id).run(); },
    async createChallenge(id: string, userId: string, expiresAt: string): Promise<void> { await db.prepare("INSERT INTO platform_login_challenges (id, platform_user_id, expires_at) VALUES (?, ?, ?)").bind(id, userId, expiresAt).run(); },
    async findActiveChallenge(id: string): Promise<string | null> { const row = await db.prepare("SELECT platform_user_id FROM platform_login_challenges WHERE id = ? AND consumed_at IS NULL AND datetime(expires_at) > datetime('now') LIMIT 1").bind(id).first<{ platform_user_id: string }>(); return row?.platform_user_id ?? null; },
    async consumeChallenge(id: string): Promise<boolean> { const result = await db.prepare("UPDATE platform_login_challenges SET consumed_at = datetime('now') WHERE id = ? AND consumed_at IS NULL AND datetime(expires_at) > datetime('now')").bind(id).run(); return result.meta.changes === 1; },
  };
}
