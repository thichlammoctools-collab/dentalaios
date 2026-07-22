import type { D1Database } from "@cloudflare/workers-types";
import type { ClinicalConcept, ClinicalConceptIcd10Mapping, Icd10Code, TerminologyVersion } from "@shared/types";
import type { D1Row } from "./base";

const versionSelect = `SELECT id, system, version_key, title, publisher, published_at, source_url, source_file_name,
  source_sha256, status, approved_by, approved_at, created_at, updated_at FROM clinical_terminology_versions`;
const conceptSelect = `SELECT id, code, legacy_condition, kind, category, default_scope, default_anatomical_site,
  display_vi, description_vi, is_active, sort_order, created_at, updated_at FROM clinical_concepts`;
const icdSelect = `SELECT id, terminology_version_id, code, display_vi, parent_code, is_billable, is_active, sort_order, created_at FROM icd10_codes`;

export function createClinicalTerminologyRepository(db: D1Database) {
  return {
    async listVersions(): Promise<TerminologyVersion[]> {
      const result = await db.prepare(`${versionSelect} ORDER BY system, created_at DESC`).all<D1Row>();
      return result.results.map(mapVersion);
    },

    async getVersion(id: string): Promise<TerminologyVersion | null> {
      const row = await db.prepare(`${versionSelect} WHERE id = ? LIMIT 1`).bind(id).first<D1Row>();
      return row ? mapVersion(row) : null;
    },

    async createVersion(data: Omit<TerminologyVersion, "id" | "status" | "approved_by" | "approved_at" | "created_at" | "updated_at">): Promise<TerminologyVersion> {
      const id = crypto.randomUUID();
      await db.prepare(`INSERT INTO clinical_terminology_versions
        (id, system, version_key, title, publisher, published_at, source_url, source_file_name, source_sha256)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .bind(id, data.system, data.version_key, data.title, data.publisher ?? null, data.published_at ?? null, data.source_url ?? null, data.source_file_name ?? null, data.source_sha256 ?? null).run();
      const version = await this.getVersion(id);
      if (!version) throw new Error("Terminology version insert failed");
      return version;
    },

    async setVersionStatus(id: string, status: TerminologyVersion["status"], approvedBy?: string): Promise<TerminologyVersion | null> {
      await db.prepare(`UPDATE clinical_terminology_versions
        SET status = ?, approved_by = CASE WHEN ? = 'approved' THEN ? ELSE approved_by END,
            approved_at = CASE WHEN ? = 'approved' THEN datetime('now') ELSE approved_at END, updated_at = datetime('now')
        WHERE id = ?`).bind(status, status, approvedBy ?? null, status, id).run();
      return this.getVersion(id);
    },

    async listConcepts(filters: { activeOnly?: boolean; category?: string; scope?: string; query?: string } = {}): Promise<ClinicalConcept[]> {
      const where: string[] = [];
      const binds: unknown[] = [];
      if (filters.activeOnly) where.push("c.is_active = 1");
      if (filters.category) { where.push("c.category = ?"); binds.push(filters.category); }
      if (filters.scope) { where.push("c.default_scope = ?"); binds.push(filters.scope); }
      if (filters.query) { where.push("(c.display_vi LIKE ? OR c.code LIKE ?)"); binds.push(`%${filters.query}%`, `%${filters.query}%`); }
      const result = await db.prepare(`${conceptSelect.replace(" FROM clinical_concepts", " FROM clinical_concepts c")}${where.length ? ` WHERE ${where.join(" AND ")}` : ""} ORDER BY c.sort_order, c.display_vi`).bind(...binds).all<D1Row>();
      return result.results.map(mapConcept);
    },

    async getConcept(id: string): Promise<ClinicalConcept | null> {
      const row = await db.prepare(`${conceptSelect} WHERE id = ? LIMIT 1`).bind(id).first<D1Row>();
      return row ? mapConcept(row) : null;
    },

    async getConceptVersion(conceptId: string): Promise<{ id: string; display_vi: string } | null> {
      return db.prepare(`SELECT id, display_vi FROM clinical_concept_versions
        WHERE concept_id = ? AND status = 'approved' ORDER BY effective_from DESC LIMIT 1`).bind(conceptId).first<{ id: string; display_vi: string }>();
    },

    async createConcept(data: Omit<ClinicalConcept, "id" | "created_at" | "updated_at" | "version_id" | "default_icd10">): Promise<ClinicalConcept> {
      const id = crypto.randomUUID();
      await db.prepare(`INSERT INTO clinical_concepts
        (id, code, legacy_condition, kind, category, default_scope, default_anatomical_site, display_vi, description_vi, is_active, sort_order)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .bind(id, data.code, data.legacy_condition, data.kind, data.category, data.default_scope, data.default_anatomical_site ?? null, data.display_vi, data.description_vi ?? null, data.is_active ? 1 : 0, data.sort_order).run();
      await db.prepare(`INSERT INTO clinical_concept_versions (id, concept_id, terminology_version_id, display_vi, description_vi)
        VALUES (?, ?, 'term-local-v1', ?, ?)`).bind(crypto.randomUUID(), id, data.display_vi, data.description_vi ?? null).run();
      const concept = await this.getConcept(id);
      if (!concept) throw new Error("Clinical concept insert failed");
      return concept;
    },

    async updateConcept(id: string, data: Partial<Omit<ClinicalConcept, "id" | "code" | "created_at" | "updated_at" | "version_id" | "default_icd10">>): Promise<ClinicalConcept | null> {
      const fields: string[] = [];
      const binds: unknown[] = [];
      for (const [key, value] of Object.entries(data)) {
        if (value === undefined) continue;
        fields.push(`${key} = ?`);
        binds.push(key === "is_active" ? (value ? 1 : 0) : value ?? null);
      }
      if (!fields.length) return this.getConcept(id);
      await db.prepare(`UPDATE clinical_concepts SET ${fields.join(", ")}, updated_at = datetime('now') WHERE id = ?`).bind(...binds, id).run();
      return this.getConcept(id);
    },

    async importIcd10(versionId: string, codes: Array<Omit<Icd10Code, "id" | "terminology_version_id" | "is_active" | "created_at">>): Promise<number> {
      const statements = codes.map((code) => db.prepare(`INSERT INTO icd10_codes
        (id, terminology_version_id, code, display_vi, parent_code, is_billable, sort_order)
        VALUES (?, ?, ?, ?, ?, ?, ?)`)
        .bind(crypto.randomUUID(), versionId, code.code, code.display_vi, code.parent_code ?? null, code.is_billable ? 1 : 0, code.sort_order));
      if (!statements.length) return 0;
      const result = await db.batch(statements);
      return result.length;
    },

    async listIcd10(filters: { query?: string; activeOnly?: boolean } = {}): Promise<Icd10Code[]> {
      const where: string[] = ["v.system = 'ICD10_VN'", "v.status = 'approved'"];
      const binds: unknown[] = [];
      if (filters.activeOnly) where.push("i.is_active = 1");
      if (filters.query) { where.push("(i.code LIKE ? OR i.display_vi LIKE ?)"); binds.push(`${filters.query}%`, `%${filters.query}%`); }
      const result = await db.prepare(`${icdSelect.replace(" FROM icd10_codes", " FROM icd10_codes i JOIN clinical_terminology_versions v ON v.id = i.terminology_version_id")}
        WHERE ${where.join(" AND ")} ORDER BY i.code LIMIT 100`).bind(...binds).all<D1Row>();
      return result.results.map(mapIcd10);
    },

    async getIcd10(id: string): Promise<Icd10Code | null> {
      const row = await db.prepare(`${icdSelect} WHERE id = ? LIMIT 1`).bind(id).first<D1Row>();
      return row ? mapIcd10(row) : null;
    },

    async getActiveMapping(conceptId: string, icd10CodeId?: string): Promise<(ClinicalConceptIcd10Mapping & { code: Icd10Code }) | null> {
      const extra = icd10CodeId ? " AND m.icd10_code_id = ?" : "";
      const row = await db.prepare(`SELECT m.id AS mapping_id, m.concept_version_id, m.icd10_code_id, m.mapping_role, m.is_active AS mapping_is_active, m.created_at AS mapping_created_at,
          i.id, i.terminology_version_id, i.code, i.display_vi, i.parent_code, i.is_billable, i.is_active, i.sort_order, i.created_at
        FROM clinical_concept_versions cv
        JOIN clinical_concept_icd10_mappings m ON m.concept_version_id = cv.id AND m.is_active = 1
        JOIN icd10_codes i ON i.id = m.icd10_code_id AND i.is_active = 1
        JOIN clinical_terminology_versions v ON v.id = i.terminology_version_id AND v.system = 'ICD10_VN' AND v.status = 'approved'
        WHERE cv.concept_id = ? AND cv.status = 'approved'${extra}
        ORDER BY CASE m.mapping_role WHEN 'primary' THEN 0 ELSE 1 END LIMIT 1`)
        .bind(conceptId, ...(icd10CodeId ? [icd10CodeId] : [])).first<D1Row>();
      if (!row) return null;
      return {
        id: row.mapping_id as string,
        concept_version_id: row.concept_version_id as string,
        icd10_code_id: row.icd10_code_id as string,
        mapping_role: row.mapping_role as "primary" | "alternative",
        is_active: Boolean(row.mapping_is_active),
        created_at: row.mapping_created_at as string,
        code: mapIcd10(row),
      };
    },

    async createMapping(conceptId: string, icd10CodeId: string, role: "primary" | "alternative"): Promise<ClinicalConceptIcd10Mapping> {
      const version = await this.getConceptVersion(conceptId);
      if (!version) throw new Error("Concept has no approved terminology version");
      const id = crypto.randomUUID();
      await db.prepare(`INSERT INTO clinical_concept_icd10_mappings (id, concept_version_id, icd10_code_id, mapping_role)
        VALUES (?, ?, ?, ?)`).bind(id, version.id, icd10CodeId, role).run();
      return { id, concept_version_id: version.id, icd10_code_id: icd10CodeId, mapping_role: role, is_active: true, created_at: new Date().toISOString() };
    },
  };
}

function value(row: D1Row, key: string): string | undefined { const raw = row[key]; return typeof raw === "string" && raw ? raw : undefined; }
function mapVersion(row: D1Row): TerminologyVersion { return { id: row.id as string, system: row.system as TerminologyVersion["system"], version_key: row.version_key as string, title: row.title as string, publisher: value(row, "publisher"), published_at: value(row, "published_at"), source_url: value(row, "source_url"), source_file_name: value(row, "source_file_name"), source_sha256: value(row, "source_sha256"), status: row.status as TerminologyVersion["status"], approved_by: value(row, "approved_by"), approved_at: value(row, "approved_at"), created_at: row.created_at as string, updated_at: row.updated_at as string }; }
function mapConcept(row: D1Row): ClinicalConcept { return { id: row.id as string, code: row.code as string, legacy_condition: row.legacy_condition as string, kind: row.kind as ClinicalConcept["kind"], category: row.category as ClinicalConcept["category"], default_scope: row.default_scope as ClinicalConcept["default_scope"], default_anatomical_site: value(row, "default_anatomical_site") as ClinicalConcept["default_anatomical_site"], display_vi: row.display_vi as string, description_vi: value(row, "description_vi"), is_active: Boolean(row.is_active), sort_order: Number(row.sort_order), created_at: row.created_at as string, updated_at: row.updated_at as string }; }
function mapIcd10(row: D1Row): Icd10Code { return { id: row.id as string, terminology_version_id: row.terminology_version_id as string, code: row.code as string, display_vi: row.display_vi as string, parent_code: value(row, "parent_code"), is_billable: Boolean(row.is_billable), is_active: Boolean(row.is_active), sort_order: Number(row.sort_order), created_at: row.created_at as string }; }
