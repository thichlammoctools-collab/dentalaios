import type { D1Database } from "@cloudflare/workers-types";
import type { PlatformRole, PlatformUser } from "@shared/types";
import { parsePermissions, type D1Row } from "./base";

export interface PlatformUserContext { user: PlatformUser; role: PlatformRole; password_hash: string; mfa_secret_encrypted?: string; }

function map(row: D1Row): PlatformUserContext {
  return { user: { id: row.u_id as string, role_id: row.u_role_id as string, name: row.u_name as string, is_active: row.u_is_active === 1, mfa_enabled: Boolean(row.u_mfa_enabled_at), last_login_at: (row.u_last_login_at as string | null) ?? undefined, created_at: row.u_created_at as string, updated_at: row.u_updated_at as string }, role: { id: row.r_id as string, key: row.r_key as PlatformRole["key"], name: row.r_name as string, permissions: parsePermissions(row.r_permissions as string) as PlatformRole["permissions"], created_at: row.r_created_at as string }, password_hash: row.u_password_hash as string, mfa_secret_encrypted: (row.u_mfa_secret_encrypted as string | null) ?? undefined };
}

const select = "SELECT u.id u_id, u.role_id u_role_id, u.name u_name, u.password_hash u_password_hash, u.is_active u_is_active, u.mfa_secret_encrypted u_mfa_secret_encrypted, u.mfa_enabled_at u_mfa_enabled_at, u.last_login_at u_last_login_at, u.created_at u_created_at, u.updated_at u_updated_at, r.id r_id, r.key r_key, r.name r_name, r.permissions r_permissions, r.created_at r_created_at FROM platform_users u JOIN platform_roles r ON r.id = u.role_id";

export function createPlatformUsersRepository(db: D1Database) {
  return {
    async findByEmail(email: string): Promise<PlatformUserContext | null> { const row = await db.prepare(`${select} WHERE lower(u.email) = lower(?) LIMIT 1`).bind(email).first<D1Row>(); return row ? map(row) : null; },
    async findById(id: string): Promise<PlatformUserContext | null> { const row = await db.prepare(`${select} WHERE u.id = ? LIMIT 1`).bind(id).first<D1Row>(); return row ? map(row) : null; },
    async list(): Promise<PlatformUserContext[]> { const rows = await db.prepare(`${select} ORDER BY u.created_at DESC`).bind().all<D1Row>(); return rows.results.map(map); },
    async roleId(key: string): Promise<string | null> { const row = await db.prepare("SELECT id FROM platform_roles WHERE key = ? LIMIT 1").bind(key).first<{ id: string }>(); return row?.id ?? null; },
    async ownerCount(): Promise<number> { const row = await db.prepare("SELECT COUNT(*) count FROM platform_users u JOIN platform_roles r ON r.id = u.role_id WHERE r.key = 'platform_owner' AND u.is_active = 1").bind().first<{ count: number }>(); return Number(row?.count ?? 0); },
    async touchLogin(id: string): Promise<void> { await db.prepare("UPDATE platform_users SET last_login_at = datetime('now'), updated_at = datetime('now') WHERE id = ?").bind(id).run(); },
    async create(data: { id: string; email: string; name: string; password_hash: string; role_id: string }): Promise<void> { await db.prepare("INSERT INTO platform_users (id, role_id, email, name, password_hash) VALUES (?, ?, ?, ?, ?)").bind(data.id, data.role_id, data.email, data.name, data.password_hash).run(); },
    async update(id: string, data: { name?: string; role_id?: string; is_active?: boolean; mfa_secret_encrypted?: string | null; mfa_enabled_at?: string | null }): Promise<void> { const fields: string[] = []; const binds: unknown[] = []; for (const [key, value] of Object.entries(data)) if (value !== undefined) { fields.push(`${key} = ?`); binds.push(key === "is_active" ? Number(value) : value); } if (fields.length) await db.prepare(`UPDATE platform_users SET ${fields.join(", ")}, updated_at = datetime('now') WHERE id = ?`).bind(...binds, id).run(); },
    async setMfa(id: string, encrypted: string, enabledAt: string): Promise<void> { await db.prepare("UPDATE platform_users SET mfa_secret_encrypted = ?, mfa_enabled_at = ?, updated_at = datetime('now') WHERE id = ?").bind(encrypted, enabledAt, id).run(); },
    async revokeAllSessions(id: string): Promise<void> { await db.prepare("UPDATE platform_sessions SET revoked_at = datetime('now') WHERE platform_user_id = ? AND revoked_at IS NULL").bind(id).run(); },
  };
}
