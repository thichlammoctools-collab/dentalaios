/**
 * User repository — auth lookup + role/tenant/branch joins.
 *
 * Auth path: findByEmail() joins user → role → tenant → branch for JWT claims.
 *
 * Password hash is NEVER returned to callers (security).
 */

import type { D1Database } from "@cloudflare/workers-types";
import type { User, Role, Tenant, Branch } from "@shared/types";
import { parsePermissions, type D1Row } from "./base";

export interface UserWithContext {
  user: User;
  role: Role;
  tenant: Tenant;
  branch: Branch;
  password_hash: string; // internal only — caller must verify then drop
}

export interface UsersRepository {
  findByEmail(email: string): Promise<UserWithContext | null>;
  findContextById(userId: string, tenantId: string): Promise<UserWithContext | null>;
  list(tenantId: string): Promise<User[]>;
  getById(tenantId: string, id: string): Promise<User | null>;
  create(
    tenantId: string,
    data: Omit<User, "id" | "tenant_id" | "created_at"> & { password_hash: string },
  ): Promise<User>;
  update(tenantId: string, id: string, data: Partial<Pick<User, "name" | "role_id" | "branch_id">> & { password_hash?: string }): Promise<User | null>;
  delete(tenantId: string, id: string): Promise<boolean>;
}

export function createUsersRepository(db: D1Database): UsersRepository {
  return {
    async findByEmail(email) {
      // JOIN user + role + tenant + branch in one query.
      // Email is UNIQUE across all tenants in V1; if multi-tenant scoping by email
      // is needed later, add a tenant hint parameter.
      const row = (await db
        .prepare(
          `SELECT
             u.id AS u_id, u.tenant_id AS u_tenant_id, u.branch_id AS u_branch_id,
             u.role_id AS u_role_id, u.email AS u_email, u.name AS u_name,
             u.password_hash AS u_password_hash, u.created_at AS u_created_at,
             r.id AS r_id, r.tenant_id AS r_tenant_id, r.name AS r_name,
             r.permissions AS r_permissions, r.created_at AS r_created_at,
             t.id AS t_id, t.name AS t_name, t.created_at AS t_created_at,
             b.id AS b_id, b.tenant_id AS b_tenant_id, b.name AS b_name,
             b.address AS b_address, b.created_at AS b_created_at
           FROM users u
           JOIN roles r ON r.id = u.role_id
           JOIN tenants t ON t.id = u.tenant_id
           JOIN branches b ON b.id = u.branch_id
           WHERE u.email = ?
           LIMIT 1`,
        )
        .bind(email)
        .first()) as D1Row | null;

      if (!row) return null;
      return mapUserWithContext(row);
    },

    async findContextById(userId, tenantId) {
      const row = (await db
        .prepare(
          `SELECT
             u.id AS u_id, u.tenant_id AS u_tenant_id, u.branch_id AS u_branch_id,
             u.role_id AS u_role_id, u.email AS u_email, u.name AS u_name,
             u.password_hash AS u_password_hash, u.created_at AS u_created_at,
             r.id AS r_id, r.tenant_id AS r_tenant_id, r.name AS r_name,
             r.permissions AS r_permissions, r.created_at AS r_created_at,
             t.id AS t_id, t.name AS t_name, t.created_at AS t_created_at,
             b.id AS b_id, b.tenant_id AS b_tenant_id, b.name AS b_name,
             b.address AS b_address, b.created_at AS b_created_at
           FROM users u
           JOIN roles r ON r.id = u.role_id
           JOIN tenants t ON t.id = u.tenant_id
           JOIN branches b ON b.id = u.branch_id
           WHERE u.id = ? AND u.tenant_id = ?
           LIMIT 1`,
        )
        .bind(userId, tenantId)
        .first()) as D1Row | null;

      if (!row) return null;
      return mapUserWithContext(row);
    },

    async list(tenantId) {
      const result = await db
        .prepare(
          "SELECT * FROM users WHERE tenant_id = ? ORDER BY created_at DESC",
        )
        .bind(tenantId)
        .all();
      return (result.results as D1Row[]).map(mapUser);
    },

    async getById(tenantId, id) {
      const row = (await db
        .prepare("SELECT * FROM users WHERE tenant_id = ? AND id = ? LIMIT 1")
        .bind(tenantId, id)
        .first()) as D1Row | null;
      return row ? mapUser(row) : null;
    },

    async create(tenantId, data) {
      const id = crypto.randomUUID();
      await db
        .prepare(
          `INSERT INTO users
             (id, tenant_id, branch_id, role_id, email, name, password_hash)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          id,
          tenantId,
          data.branch_id,
          data.role_id,
          data.email,
          data.name,
          data.password_hash,
        )
        .run();
      const row = (await db
        .prepare("SELECT * FROM users WHERE tenant_id = ? AND id = ? LIMIT 1")
        .bind(tenantId, id)
        .first()) as D1Row | null;
      if (!row) throw new Error("Insert succeeded but read failed");
      return mapUser(row);
    },

    async update(tenantId, id, data) {
      const fields: string[] = [];
      const binds: unknown[] = [];
      if (data.name !== undefined) {
        fields.push("name = ?");
        binds.push(data.name);
      }
      if (data.role_id !== undefined) {
        fields.push("role_id = ?");
        binds.push(data.role_id);
      }
      if (data.branch_id !== undefined) {
        fields.push("branch_id = ?");
        binds.push(data.branch_id);
      }
      if (data.password_hash !== undefined) {
        fields.push("password_hash = ?");
        binds.push(data.password_hash);
      }
      if (fields.length === 0) return this.getById(tenantId, id);
      binds.push(tenantId, id);
      await db
        .prepare(`UPDATE users SET ${fields.join(", ")} WHERE tenant_id = ? AND id = ?`)
        .bind(...binds)
        .run();
      return this.getById(tenantId, id);
    },

    async delete(tenantId, id) {
      const res = await db
        .prepare("DELETE FROM users WHERE tenant_id = ? AND id = ?")
        .bind(tenantId, id)
        .run();
      return res.meta.changes > 0;
    },
  };
}

function mapUser(row: D1Row): User {
  return {
    id: row.id as string,
    tenant_id: row.tenant_id as string,
    branch_id: row.branch_id as string,
    role_id: row.role_id as string,
    email: row.email as string,
    name: row.name as string,
    created_at: row.created_at as string,
  };
}

function mapUserWithContext(row: D1Row): UserWithContext {
  const user: User = {
    id: row.u_id as string,
    tenant_id: row.u_tenant_id as string,
    branch_id: row.u_branch_id as string,
    role_id: row.u_role_id as string,
    email: row.u_email as string,
    name: row.u_name as string,
    created_at: row.u_created_at as string,
  };
  const role: Role = {
    id: row.r_id as string,
    tenant_id: row.r_tenant_id as string,
    name: row.r_name as string,
    permissions: parsePermissions(row.r_permissions as string | null),
    created_at: row.r_created_at as string,
  };
  const tenant: Tenant = {
    id: row.t_id as string,
    name: row.t_name as string,
    created_at: row.t_created_at as string,
  };
  const branch: Branch = {
    id: row.b_id as string,
    tenant_id: row.b_tenant_id as string,
    name: row.b_name as string,
    address: row.b_address as string,
    created_at: row.b_created_at as string,
  };
  return {
    user,
    role,
    tenant,
    branch,
    password_hash: row.u_password_hash as string,
  };
}