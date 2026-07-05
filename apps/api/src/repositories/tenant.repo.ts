import type { D1Database } from "@cloudflare/workers-types";
import type { Tenant } from "@shared/types";
import type { D1Row } from "./base";

export interface TenantRepository {
  getById(id: string): Promise<Tenant | null>;
  update(id: string, data: { name?: string; slug?: string; is_active?: boolean }): Promise<Tenant | null>;
}

export function createTenantRepository(db: D1Database): TenantRepository {
  return {
    async getById(id) {
      const row = await db
        .prepare("SELECT * FROM tenants WHERE id = ? LIMIT 1")
        .bind(id)
        .first() as D1Row | null;
      return row ? mapTenant(row) : null;
    },

    async update(id, data) {
      const fields: string[] = [];
      const binds: unknown[] = [];
      if (data.name !== undefined) { fields.push("name = ?"); binds.push(data.name.trim()); }
      if (data.slug !== undefined) { fields.push("slug = ?"); binds.push(data.slug || null); }
      if (data.is_active !== undefined) { fields.push("is_active = ?"); binds.push(data.is_active ? 1 : 0); }
      if (fields.length === 0) return this.getById(id);
      binds.push(id);
      await db
        .prepare(`UPDATE tenants SET ${fields.join(", ")} WHERE id = ?`)
        .bind(...binds)
        .run();
      return this.getById(id);
    },
  };
}

function mapTenant(row: D1Row): Tenant {
  return {
    id: row.id as string,
    name: row.name as string,
    slug: (row.slug as string | null) || undefined,
    email: (row.email as string | null) || undefined,
    is_active: (row.is_active as number) === 1,
    created_at: row.created_at as string,
  };
}
