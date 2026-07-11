import type { D1Database } from "@cloudflare/workers-types";
import type { Role } from "@shared/types";
import { parsePermissions, type D1Row, permissionsToJson } from "./base";

export interface RolesRepository {
  list(tenantId: string): Promise<Role[]>;
  getById(tenantId: string, id: string): Promise<Role | null>;
  create(tenantId: string, data: { name: string; description?: string; permissions?: string[] }): Promise<Role>;
  update(
    tenantId: string,
    id: string,
    data: { name?: string; description?: string; permissions?: string[] },
  ): Promise<Role | null>;
}

export function createRolesRepository(db: D1Database): RolesRepository {
  return {
    async list(tenantId) {
      const result = await db
        .prepare("SELECT * FROM roles WHERE tenant_id = ? ORDER BY name ASC")
        .bind(tenantId)
        .all();
      return (result.results as D1Row[]).map(mapRole);
    },

    async create(tenantId, data) {
      const id = crypto.randomUUID();
      await db
        .prepare(
          "INSERT INTO roles (id, tenant_id, name, description, permissions, created_at) VALUES (?, ?, ?, ?, ?, ?)",
        )
        .bind(
          id,
          tenantId,
          data.name,
          data.description ?? null,
          permissionsToJson(data.permissions ?? []),
          new Date().toISOString(),
        )
        .run();
      const created = await this.getById(tenantId, id);
      if (!created) throw new Error("Failed to retrieve created role");
      return created;
    },

    async getById(tenantId, id) {
      const row = (await db
        .prepare("SELECT * FROM roles WHERE tenant_id = ? AND id = ? LIMIT 1")
        .bind(tenantId, id)
        .first()) as D1Row | null;
      return row ? mapRole(row) : null;
    },

    async update(tenantId, id, data) {
      const fields: string[] = [];
      const binds: unknown[] = [];
      if (data.name !== undefined) {
        fields.push("name = ?");
        binds.push(data.name);
      }
      if (data.description !== undefined) {
        fields.push("description = ?");
        binds.push(data.description ?? null);
      }
      if (data.permissions !== undefined) {
        fields.push("permissions = ?");
        binds.push(permissionsToJson(data.permissions));
      }
      if (fields.length === 0) return this.getById(tenantId, id);
      binds.push(tenantId, id);
      await db
        .prepare(`UPDATE roles SET ${fields.join(", ")} WHERE tenant_id = ? AND id = ?`)
        .bind(...binds)
        .run();
      return this.getById(tenantId, id);
    },
  };
}

function mapRole(row: D1Row): Role {
  return {
    id: row.id as string,
    tenant_id: row.tenant_id as string,
    name: row.name as string,
    description: (row.description as string | null) ?? undefined,
    permissions: parsePermissions(row.permissions as string | null),
    created_at: row.created_at as string,
  };
}