import type { D1Database } from "@cloudflare/workers-types";
import type { PlatformTenantSummary } from "@shared/types";
import type { D1Row } from "./base";
const map = (row: D1Row): PlatformTenantSummary => ({
  id: row.id as string,
  name: row.name as string,
  slug: (row.slug as string | null) ?? undefined,
  is_active: row.is_active === 1,
  created_at: row.created_at as string,
  branch_count: Number(row.branch_count ?? 0),
  user_count: Number(row.user_count ?? 0),
  integration_health:
    (row.integration_health as
      PlatformTenantSummary["integration_health"] | null) ?? "unknown",
});
const select =
  "SELECT t.id, t.name, t.slug, t.is_active, t.created_at, (SELECT COUNT(*) FROM branches b WHERE b.tenant_id = t.id) branch_count, (SELECT COUNT(*) FROM users u WHERE u.tenant_id = t.id) user_count, COALESCE((SELECT CASE WHEN SUM(CASE WHEN i.health_status = 'down' THEN 1 ELSE 0 END) > 0 THEN 'down' WHEN SUM(CASE WHEN i.health_status = 'degraded' THEN 1 ELSE 0 END) > 0 THEN 'degraded' WHEN SUM(CASE WHEN i.health_status = 'healthy' THEN 1 ELSE 0 END) > 0 THEN 'healthy' ELSE 'unknown' END FROM platform_integration_status i WHERE i.tenant_id = t.id), 'unknown') integration_health FROM tenants t";
export function createPlatformTenantsRepository(db: D1Database) {
  return {
    async list(input: {
      limit: number;
      cursor?: string;
      status?: "active" | "suspended";
      q?: string;
      sort: "created_at" | "name" | "updated_at";
    }): Promise<{ items: PlatformTenantSummary[]; next_cursor?: string }> {
      const order =
        input.sort === "name"
          ? "t.name ASC, t.id ASC"
          : "t.created_at DESC, t.id DESC";
      const conditions: string[] = [];
      const binds: unknown[] = [];
      if (input.status) {
        conditions.push("t.is_active = ?");
        binds.push(input.status === "active" ? 1 : 0);
      }
      if (input.q) {
        conditions.push("(t.name LIKE ? OR t.slug LIKE ?)");
        binds.push(`%${input.q}%`, `%${input.q}%`);
      }
      if (input.cursor && input.sort !== "name") {
        conditions.push("t.created_at < ?");
        binds.push(input.cursor);
      }
      const result = await db
        .prepare(
          `${select}${conditions.length ? ` WHERE ${conditions.join(" AND ")}` : ""} ORDER BY ${order} LIMIT ?`,
        )
        .bind(...binds, input.limit + 1)
        .all<D1Row>();
      const rows = result.results;
      const more = rows.length > input.limit;
      const items = rows.slice(0, input.limit).map(map);
      return {
        items,
        ...(more ? { next_cursor: items[items.length - 1]?.created_at } : {}),
      };
    },
    async get(id: string): Promise<PlatformTenantSummary | null> {
      const row = await db
        .prepare(`${select} WHERE t.id = ? LIMIT 1`)
        .bind(id)
        .first<D1Row>();
      return row ? map(row) : null;
    },
    async create(id: string, name: string, slug?: string): Promise<void> {
      await db
        .prepare(
          "INSERT INTO tenants (id, name, slug, is_active) VALUES (?, ?, ?, 1)",
        )
        .bind(id, name, slug ?? null)
        .run();
    },
    async update(
      id: string,
      data: { name?: string; slug?: string | null; is_active?: boolean },
    ): Promise<void> {
      const fields: string[] = [];
      const binds: unknown[] = [];
      if (data.name !== undefined) {
        fields.push("name = ?");
        binds.push(data.name);
      }
      if (data.slug !== undefined) {
        fields.push("slug = ?");
        binds.push(data.slug);
      }
      if (data.is_active !== undefined) {
        fields.push("is_active = ?");
        binds.push(Number(data.is_active));
      }
      if (fields.length)
        await db
          .prepare(`UPDATE tenants SET ${fields.join(", ")} WHERE id = ?`)
          .bind(...binds, id)
          .run();
    },
  };
}
