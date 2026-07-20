import type { D1Database } from "@cloudflare/workers-types";
import type { ProcedureCatalogItem } from "@shared/types";
import type { D1Row } from "./base";

const select = "SELECT code, name, is_active, sort_order, created_at, updated_at FROM procedure_catalog";

function map(row: D1Row): ProcedureCatalogItem {
  return {
    code: row.code as string,
    name: row.name as string,
    is_active: Boolean(row.is_active),
    sort_order: Number(row.sort_order),
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
  };
}

export function createProcedureCatalogRepository(db: D1Database) {
  return {
    async list(activeOnly = false): Promise<ProcedureCatalogItem[]> {
      const result = await db.prepare(`${select}${activeOnly ? " WHERE is_active = 1" : ""} ORDER BY sort_order ASC, name ASC, code ASC`).bind().all<D1Row>();
      return result.results.map(map);
    },

    async get(code: string): Promise<ProcedureCatalogItem | null> {
      const row = await db.prepare(`${select} WHERE code = ? LIMIT 1`).bind(code).first<D1Row>();
      return row ? map(row) : null;
    },

    async getActive(code: string): Promise<ProcedureCatalogItem | null> {
      const row = await db.prepare(`${select} WHERE code = ? AND is_active = 1 LIMIT 1`).bind(code).first<D1Row>();
      return row ? map(row) : null;
    },

    async backfillExisting(): Promise<number> {
      const result = await db.prepare(`INSERT OR IGNORE INTO procedure_catalog (code, name, sort_order)
        SELECT procedure, procedure, 9000 FROM (
          SELECT DISTINCT trim(procedure) AS procedure FROM treatment_services WHERE length(trim(procedure)) >= 2
          UNION
          SELECT DISTINCT trim(procedure) AS procedure FROM treatment_plan_items WHERE length(trim(procedure)) >= 2
        ) ORDER BY procedure`).bind().run();
      return result.meta.changes;
    },

    async create(data: Pick<ProcedureCatalogItem, "code" | "name" | "is_active" | "sort_order">): Promise<ProcedureCatalogItem> {
      await db.prepare("INSERT INTO procedure_catalog (code, name, is_active, sort_order) VALUES (?, ?, ?, ?)")
        .bind(data.code, data.name, data.is_active ? 1 : 0, data.sort_order).run();
      const item = await db.prepare(`${select} WHERE code = ? LIMIT 1`).bind(data.code).first<D1Row>();
      if (!item) throw new Error("Procedure creation succeeded but read failed");
      return map(item);
    },

    async update(code: string, data: Partial<Pick<ProcedureCatalogItem, "name" | "is_active" | "sort_order">>): Promise<ProcedureCatalogItem | null> {
      const fields: string[] = [];
      const binds: unknown[] = [];
      for (const [key, value] of Object.entries(data)) {
        if (value !== undefined) {
          fields.push(`${key} = ?`);
          binds.push(key === "is_active" ? (value ? 1 : 0) : value);
        }
      }
      if (!fields.length) return db.prepare(`${select} WHERE code = ? LIMIT 1`).bind(code).first<D1Row>().then((row) => row ? map(row) : null);
      const result = await db.prepare(`UPDATE procedure_catalog SET ${fields.join(", ")}, updated_at = datetime('now') WHERE code = ?`)
        .bind(...binds, code).run();
      if (!result.meta.changes) return null;
      const item = await db.prepare(`${select} WHERE code = ? LIMIT 1`).bind(code).first<D1Row>();
      return item ? map(item) : null;
    },
  };
}
