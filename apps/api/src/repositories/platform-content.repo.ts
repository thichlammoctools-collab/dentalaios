import type { D1Database } from "@cloudflare/workers-types";
import type { PlatformContent } from "@shared/types";
import type { D1Row } from "./base";
const map = (r: D1Row): PlatformContent => ({
  id: r.id as string,
  kind: r.kind as PlatformContent["kind"],
  title: r.title as string,
  body_markdown: r.body_markdown as string,
  status: r.status as PlatformContent["status"],
  audience: r.audience as PlatformContent["audience"],
  tenant_id: (r.tenant_id as string | null) ?? undefined,
  publish_at: (r.publish_at as string | null) ?? undefined,
  expire_at: (r.expire_at as string | null) ?? undefined,
  created_at: r.created_at as string,
  updated_at: r.updated_at as string,
});
export function createPlatformContentRepository(db: D1Database) {
  return {
    async list(): Promise<PlatformContent[]> {
      const rows = await db
        .prepare(
          "SELECT id, kind, title, body_markdown, status, audience, tenant_id, publish_at, expire_at, created_at, updated_at FROM platform_content ORDER BY updated_at DESC",
        )
        .bind()
        .all<D1Row>();
      return rows.results.map(map);
    },
    async get(id: string): Promise<PlatformContent | null> {
      const row = await db
        .prepare(
          "SELECT id, kind, title, body_markdown, status, audience, tenant_id, publish_at, expire_at, created_at, updated_at FROM platform_content WHERE id = ? LIMIT 1",
        )
        .bind(id)
        .first<D1Row>();
      return row ? map(row) : null;
    },
    async create(
      id: string,
      data: Omit<PlatformContent, "id" | "created_at" | "updated_at">,
      userId: string,
    ): Promise<void> {
      await db
        .prepare(
          "INSERT INTO platform_content (id, kind, title, body_markdown, status, audience, tenant_id, publish_at, expire_at, created_by, updated_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        )
        .bind(
          id,
          data.kind,
          data.title,
          data.body_markdown,
          data.status,
          data.audience,
          data.tenant_id ?? null,
          data.publish_at ?? null,
          data.expire_at ?? null,
          userId,
          userId,
        )
        .run();
    },
    async update(
      id: string,
      data: Partial<
        Omit<PlatformContent, "id" | "created_at" | "updated_at">
      > & {
        tenant_id?: string | null;
        publish_at?: string | null;
        expire_at?: string | null;
      },
      userId: string,
    ): Promise<void> {
      const fields: string[] = [];
      const binds: unknown[] = [];
      for (const [key, value] of Object.entries(data))
        if (value !== undefined) {
          fields.push(`${key} = ?`);
          binds.push(value ?? null);
        }
      if (fields.length)
        await db
          .prepare(
            `UPDATE platform_content SET ${fields.join(", ")}, updated_by = ?, updated_at = datetime('now') WHERE id = ?`,
          )
          .bind(...binds, userId, id)
          .run();
    },
  };
}
