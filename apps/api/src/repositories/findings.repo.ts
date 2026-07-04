import type { D1Database } from "@cloudflare/workers-types";
import type { ClinicalFinding } from "@shared/types";
import type { D1Row } from "./base";

export interface FindingsRepository {
  listByVisit(tenantId: string, visitId: string): Promise<ClinicalFinding[]>;
  create(
    tenantId: string,
    visitId: string,
    data: Omit<ClinicalFinding, "id" | "tenant_id" | "visit_id" | "tooth_system" | "created_at">,
  ): Promise<ClinicalFinding>;
  update(
    tenantId: string,
    id: string,
    data: { condition: string; notes: string | null },
  ): Promise<ClinicalFinding>;
  delete(tenantId: string, id: string): Promise<boolean>;
}

export function createFindingsRepository(db: D1Database): FindingsRepository {
  return {
    async listByVisit(tenantId, visitId) {
      const result = await db
        .prepare(
          `SELECT * FROM clinical_findings
           WHERE tenant_id = ? AND visit_id = ?
           ORDER BY tooth_number ASC`,
        )
        .bind(tenantId, visitId)
        .all();
      return (result.results as D1Row[]).map(mapFinding);
    },

    async create(tenantId, visitId, data) {
      const id = crypto.randomUUID();
      await db
        .prepare(
          `INSERT INTO clinical_findings
             (id, tenant_id, visit_id, tooth_number, tooth_system, condition, notes)
           VALUES (?, ?, ?, ?, 'FDI', ?, ?)`,
        )
        .bind(id, tenantId, visitId, data.tooth_number, data.condition, data.notes ?? null)
        .run();
      const row = (await db
        .prepare("SELECT * FROM clinical_findings WHERE tenant_id = ? AND id = ? LIMIT 1")
        .bind(tenantId, id)
        .first()) as D1Row | null;
      if (!row) throw new Error("Insert succeeded but read failed");
      return mapFinding(row);
    },

    async update(tenantId, id, data) {
      await db
        .prepare(
          `UPDATE clinical_findings
             SET condition = ?, notes = ?
           WHERE tenant_id = ? AND id = ?`,
        )
        .bind(data.condition, data.notes, tenantId, id)
        .run();
      const row = (await db
        .prepare("SELECT * FROM clinical_findings WHERE tenant_id = ? AND id = ? LIMIT 1")
        .bind(tenantId, id)
        .first()) as D1Row | null;
      if (!row) throw new Error("Update succeeded but read failed");
      return mapFinding(row);
    },

    async delete(tenantId, id) {
      const res = await db
        .prepare("DELETE FROM clinical_findings WHERE tenant_id = ? AND id = ?")
        .bind(tenantId, id)
        .run();
      return res.meta.changes > 0;
    },
  };
}

function mapFinding(row: D1Row): ClinicalFinding {
  return {
    id: row.id as string,
    tenant_id: row.tenant_id as string,
    visit_id: row.visit_id as string,
    tooth_number: row.tooth_number as number,
    tooth_system: row.tooth_system as ClinicalFinding["tooth_system"],
    condition: row.condition as string,
    notes: (row.notes as string | null) ?? undefined,
    created_at: row.created_at as string,
  };
}