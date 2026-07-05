import type { D1Database } from "@cloudflare/workers-types";
import type { Branch } from "@shared/types";
import type { D1Row } from "./base";

export interface BranchRepository {
  list(tenantId: string): Promise<Branch[]>;
  getById(tenantId: string, id: string): Promise<Branch | null>;
  create(tenantId: string, data: { name: string; address?: string }): Promise<Branch>;
  update(tenantId: string, id: string, data: { name?: string; address?: string }): Promise<Branch | null>;
  delete(tenantId: string, id: string): Promise<boolean>;
}

export function createBranchRepository(db: D1Database): BranchRepository {
  return {
    async list(tenantId) {
      const result = await db
        .prepare("SELECT * FROM branches WHERE tenant_id = ? ORDER BY created_at ASC")
        .bind(tenantId)
        .all();
      return (result.results as D1Row[]).map(mapBranch);
    },

    async getById(tenantId, id) {
      const row = await db
        .prepare("SELECT * FROM branches WHERE tenant_id = ? AND id = ? LIMIT 1")
        .bind(tenantId, id)
        .first() as D1Row | null;
      return row ? mapBranch(row) : null;
    },

    async create(tenantId, data) {
      const id = crypto.randomUUID();
      await db
        .prepare("INSERT INTO branches (id, tenant_id, name, address) VALUES (?, ?, ?, ?)")
        .bind(id, tenantId, data.name.trim(), data.address?.trim() || "")
        .run();
      const row = await db
        .prepare("SELECT * FROM branches WHERE id = ? LIMIT 1")
        .bind(id)
        .first() as D1Row | null;
      if (!row) throw new Error("Insert succeeded but read failed");
      return mapBranch(row);
    },

    async update(tenantId, id, data) {
      const fields: string[] = [];
      const binds: unknown[] = [];
      if (data.name !== undefined) { fields.push("name = ?"); binds.push(data.name.trim()); }
      if (data.address !== undefined) { fields.push("address = ?"); binds.push(data.address.trim()); }
      if (fields.length === 0) return this.getById(tenantId, id);
      binds.push(tenantId, id);
      await db
        .prepare(`UPDATE branches SET ${fields.join(", ")} WHERE tenant_id = ? AND id = ?`)
        .bind(...binds)
        .run();
      return this.getById(tenantId, id);
    },

    async delete(tenantId, id) {
      const res = await db
        .prepare("DELETE FROM branches WHERE tenant_id = ? AND id = ?")
        .bind(tenantId, id)
        .run();
      return res.meta.changes > 0;
    },
  };
}

function mapBranch(row: D1Row): Branch {
  return {
    id: row.id as string,
    tenant_id: row.tenant_id as string,
    name: row.name as string,
    address: row.address as string,
    created_at: row.created_at as string,
  };
}
