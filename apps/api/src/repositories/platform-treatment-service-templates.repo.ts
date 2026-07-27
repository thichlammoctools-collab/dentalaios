import type { D1Database } from "@cloudflare/workers-types";
import type {
  PlatformTreatmentServiceTemplate,
  PlatformTreatmentServiceTemplateIcd10Link,
  PlatformTreatmentServiceTemplateWithLinks,
} from "@shared/types";
import type { D1Row } from "./base";

const templateSelect = `
  SELECT code, name, procedure, default_price,
         market_price_low, market_price_median, market_price_high,
         market_price_currency, market_price_reference, market_price_updated_at,
         default_duration_min, description, is_active, sort_order,
         created_by, updated_by, created_at, updated_at
  FROM platform_treatment_service_templates
`;

function mapTemplate(row: D1Row): PlatformTreatmentServiceTemplate {
  return {
    code: row.code as string,
    name: row.name as string,
    procedure: row.procedure as string,
    default_price: Number(row.default_price),
    market_price_low: row.market_price_low == null ? null : Number(row.market_price_low),
    market_price_median: row.market_price_median == null ? null : Number(row.market_price_median),
    market_price_high: row.market_price_high == null ? null : Number(row.market_price_high),
    market_price_currency: (row.market_price_currency as string) ?? "VND",
    market_price_reference: (row.market_price_reference as string | null) ?? null,
    market_price_updated_at: (row.market_price_updated_at as string | null) ?? null,
    default_duration_min: Number(row.default_duration_min),
    description: (row.description as string | null) ?? null,
    is_active: Number(row.is_active) === 1,
    sort_order: Number(row.sort_order),
    created_by: (row.created_by as string | null) ?? null,
    updated_by: (row.updated_by as string | null) ?? null,
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
  };
}

function mapLink(row: D1Row): PlatformTreatmentServiceTemplateIcd10Link {
  return {
    template_code: row.template_code as string,
    icd10_code_id: row.icd10_code_id as string,
    icd10_code: (row.icd10_code as string | null) ?? undefined,
    icd10_display_vi: (row.icd10_display_vi as string | null) ?? undefined,
    relation: (row.relation as "primary" | "secondary") ?? "primary",
    note: (row.note as string | null) ?? null,
    created_at: row.created_at as string,
  };
}

export interface PlatformTemplateListFilters {
  procedure?: string;
  q?: string;
  icd10_code_id?: string;
  active_only?: boolean;
  is_active?: boolean;
}

export interface PlatformTemplateUpsertInput {
  code: string;
  name: string;
  procedure: string;
  default_price: number;
  market_price_low?: number | null;
  market_price_median?: number | null;
  market_price_high?: number | null;
  market_price_currency: string;
  market_price_reference?: string | null;
  market_price_updated_at?: string | null;
  default_duration_min: number;
  description?: string | null;
  is_active: boolean;
  sort_order: number;
  icd10_links: Array<{
    icd10_code_id: string;
    relation: "primary" | "secondary";
    note?: string | null;
  }>;
}

export function createPlatformTreatmentServiceTemplatesRepository(db: D1Database) {
  return {
    async list(filters: PlatformTemplateListFilters = {}): Promise<PlatformTreatmentServiceTemplate[]> {
      const where: string[] = [];
      const binds: unknown[] = [];
      if (filters.active_only === true || filters.is_active === true) where.push("is_active = 1");
      else if (filters.is_active === false) where.push("is_active = 0");
      if (filters.procedure) {
        where.push("procedure = ?");
        binds.push(filters.procedure);
      }
      if (filters.q) {
        where.push("(lower(name) LIKE ? OR lower(code) LIKE ?)");
        const like = `%${filters.q.toLowerCase()}%`;
        binds.push(like, like);
      }
      if (filters.icd10_code_id) {
        where.push(
          "code IN (SELECT template_code FROM platform_treatment_service_template_icd10 WHERE icd10_code_id = ?)",
        );
        binds.push(filters.icd10_code_id);
      }
      const clause = where.length ? ` WHERE ${where.join(" AND ")}` : "";
      const result = await db
        .prepare(`${templateSelect}${clause} ORDER BY sort_order ASC, name ASC, code ASC`)
        .bind(...binds)
        .all<D1Row>();
      return result.results.map(mapTemplate);
    },

    async get(code: string): Promise<PlatformTreatmentServiceTemplate | null> {
      const row = await db
        .prepare(`${templateSelect} WHERE code = ? LIMIT 1`)
        .bind(code)
        .first<D1Row>();
      return row ? mapTemplate(row) : null;
    },

    async getWithLinks(code: string): Promise<PlatformTreatmentServiceTemplateWithLinks | null> {
      const row = await db
        .prepare(`${templateSelect} WHERE code = ? LIMIT 1`)
        .bind(code)
        .first<D1Row>();
      if (!row) return null;
      const template = mapTemplate(row);
      const links = await this.listLinksFor([code]);
      return { ...template, icd10_links: links };
    },

    async listLinksFor(codes: string[]): Promise<PlatformTreatmentServiceTemplateIcd10Link[]> {
      if (codes.length === 0) return [];
      const placeholders = codes.map(() => "?").join(", ");
      const result = await db
        .prepare(
          `SELECT l.template_code, l.icd10_code_id, l.relation, l.note, l.created_at,
                  i.code AS icd10_code, i.display_vi AS icd10_display_vi
           FROM platform_treatment_service_template_icd10 l
           LEFT JOIN icd10_codes i ON i.id = l.icd10_code_id
           WHERE l.template_code IN (${placeholders})
           ORDER BY l.template_code, l.relation, i.code`,
        )
        .bind(...codes)
        .all<D1Row>();
      return result.results.map(mapLink);
    },

    async listImportedCodes(tenantId: string): Promise<Set<string>> {
      const result = await db
        .prepare(
          "SELECT DISTINCT imported_from_template_code AS code FROM treatment_services WHERE tenant_id = ? AND imported_from_template_code IS NOT NULL",
        )
        .bind(tenantId)
        .all<D1Row>();
      return new Set(result.results.map((row) => row.code as string));
    },

    async upsert(
      data: PlatformTemplateUpsertInput,
      actorId: string,
    ): Promise<PlatformTreatmentServiceTemplateWithLinks> {
      const existing = await this.get(data.code);
      const createdBy = existing?.created_by ?? actorId;
      const insertOrUpdate = db.prepare(
        `INSERT INTO platform_treatment_service_templates
           (code, name, procedure, default_price,
            market_price_low, market_price_median, market_price_high,
            market_price_currency, market_price_reference, market_price_updated_at,
            default_duration_min, description, is_active, sort_order,
            created_by, updated_by, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
         ON CONFLICT(code) DO UPDATE SET
           name = excluded.name,
           procedure = excluded.procedure,
           default_price = excluded.default_price,
           market_price_low = excluded.market_price_low,
           market_price_median = excluded.market_price_median,
           market_price_high = excluded.market_price_high,
           market_price_currency = excluded.market_price_currency,
           market_price_reference = excluded.market_price_reference,
           market_price_updated_at = excluded.market_price_updated_at,
           default_duration_min = excluded.default_duration_min,
           description = excluded.description,
           is_active = excluded.is_active,
           sort_order = excluded.sort_order,
           updated_by = excluded.updated_by,
           updated_at = datetime('now')`,
      ).bind(
        data.code,
        data.name.trim(),
        data.procedure,
        data.default_price,
        data.market_price_low ?? null,
        data.market_price_median ?? null,
        data.market_price_high ?? null,
        data.market_price_currency,
        data.market_price_reference ?? null,
        data.market_price_updated_at ?? null,
        data.default_duration_min,
        data.description ?? null,
        data.is_active ? 1 : 0,
        data.sort_order,
        createdBy,
        actorId,
      );
      const deleteLinks = db
        .prepare("DELETE FROM platform_treatment_service_template_icd10 WHERE template_code = ?")
        .bind(data.code);
      const linkStatements = data.icd10_links.map((link) =>
        db
          .prepare(
            "INSERT INTO platform_treatment_service_template_icd10 (template_code, icd10_code_id, relation, note) VALUES (?, ?, ?, ?)",
          )
          .bind(data.code, link.icd10_code_id, link.relation, link.note ?? null),
      );
      await db.batch([insertOrUpdate, deleteLinks, ...linkStatements]);
      const saved = await this.get(data.code);
      if (!saved) throw new Error("Template upsert succeeded but read failed");
      const links = await this.listLinksFor([data.code]);
      return { ...saved, icd10_links: links };
    },

    async setActive(
      code: string,
      isActive: boolean,
      actorId: string,
    ): Promise<PlatformTreatmentServiceTemplate | null> {
      const result = await db
        .prepare(
          "UPDATE platform_treatment_service_templates SET is_active = ?, updated_by = ?, updated_at = datetime('now') WHERE code = ?",
        )
        .bind(isActive ? 1 : 0, actorId, code)
        .run();
      if (!result.meta.changes) return null;
      return this.get(code);
    },

    async icd10CodeExists(codeId: string): Promise<boolean> {
      const row = await db
        .prepare("SELECT 1 AS present FROM icd10_codes WHERE id = ? LIMIT 1")
        .bind(codeId)
        .first<{ present: number }>();
      return Boolean(row?.present);
    },
  };
}
