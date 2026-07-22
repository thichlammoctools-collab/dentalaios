import type { D1Database } from "@cloudflare/workers-types";
import type { ClinicalFinding, SoftTissueArea, ToothHistoryEntry } from "@shared/types";
import type { D1Row } from "./base";

export interface FindingsRepository {
  listByVisit(tenantId: string, visitId: string): Promise<ClinicalFinding[]>;
  /** Cross-visit history of a single FDI tooth for one patient (findings + treatments). */
  listToothHistory(tenantId: string, patientId: string, toothNumber: number): Promise<ToothHistoryEntry[]>;
  create(
    tenantId: string,
    visitId: string,
    data: Omit<ClinicalFinding, "id" | "tenant_id" | "visit_id" | "created_at">,
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
           ORDER BY scope ASC, tooth_number ASC`,
        )
        .bind(tenantId, visitId)
        .all();
      return (result.results as D1Row[]).map(mapFinding);
    },

    async listToothHistory(tenantId, patientId, toothNumber) {
      // Findings recorded on this tooth across every visit.
      const findingsResult = await db
        .prepare(
          `SELECT cf.id, cf.condition, cf.notes, v.id AS visit_id, v.code AS visit_code,
                  v.date AS visit_date, tc.name AS clinician_name
             FROM clinical_findings cf
             JOIN visits v ON v.id = cf.visit_id AND v.tenant_id = cf.tenant_id
             LEFT JOIN users tc ON tc.id = v.treating_clinician_id
            WHERE cf.tenant_id = ? AND v.patient_id = ?
              AND cf.scope = 'tooth' AND cf.tooth_number = ?`,
        )
        .bind(tenantId, patientId, toothNumber)
        .all();

      // Treatment plan items targeting this tooth, linked back to their originating visit.
      const treatmentsResult = await db
        .prepare(
          `SELECT tpi.id, tpi.procedure, tpi.description, tpi.status,
                  ps.service_name AS service_name,
                  v.id AS visit_id, v.code AS visit_code, v.date AS visit_date,
                  tc.name AS clinician_name
             FROM treatment_plan_items tpi
             JOIN treatment_plans tp ON tp.id = tpi.treatment_plan_id AND tp.tenant_id = tpi.tenant_id
             JOIN visits v ON v.id = tp.visit_id AND v.tenant_id = tp.tenant_id
             LEFT JOIN treatment_plan_item_price_snapshots ps
               ON ps.treatment_plan_item_id = tpi.id AND ps.tenant_id = tpi.tenant_id
             LEFT JOIN users tc ON tc.id = tpi.treating_clinician_id
            WHERE tpi.tenant_id = ? AND tp.patient_id = ? AND tpi.tooth_number = ?`,
        )
        .bind(tenantId, patientId, toothNumber)
        .all();

      const findings: ToothHistoryEntry[] = (findingsResult.results as D1Row[]).map((row) => ({
        kind: "finding",
        id: row.id as string,
        date: row.visit_date as string,
        visit_id: row.visit_id as string,
        visit_code: (row.visit_code as string | null) ?? undefined,
        clinician_name: (row.clinician_name as string | null) ?? undefined,
        condition: row.condition as string,
        notes: (row.notes as string | null) ?? undefined,
      }));

      const treatments: ToothHistoryEntry[] = (treatmentsResult.results as D1Row[]).map((row) => ({
        kind: "treatment",
        id: row.id as string,
        date: row.visit_date as string,
        visit_id: row.visit_id as string,
        visit_code: (row.visit_code as string | null) ?? undefined,
        clinician_name: (row.clinician_name as string | null) ?? undefined,
        procedure: row.procedure as string,
        service_name: (row.service_name as string | null) ?? undefined,
        status: row.status as ToothHistoryEntry["status"],
        description: (row.description as string | null) ?? undefined,
      }));

      // Merge both sources, newest first.
      return [...findings, ...treatments].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
    },

    async create(tenantId, visitId, data) {
      const id = crypto.randomUUID();
      await db
        .prepare(
          `INSERT INTO clinical_findings
             (id, tenant_id, visit_id, tooth_number, tooth_system, scope, area, condition, notes)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          id,
          tenantId,
          visitId,
          data.tooth_number ?? null,
          data.tooth_system ?? null,
          data.scope,
          data.area ?? null,
          data.condition,
          data.notes ?? null,
        )
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
  const scope = (row.scope as ClinicalFinding["scope"]) || "tooth";
  return {
    id: row.id as string,
    tenant_id: row.tenant_id as string,
    visit_id: row.visit_id as string,
    tooth_number: row.tooth_number as number | undefined,
    tooth_system: (row.tooth_system as ClinicalFinding["tooth_system"]) || undefined,
    scope,
    area: (row.area as SoftTissueArea | undefined) ?? undefined,
    condition: row.condition as string,
    notes: (row.notes as string | null) ?? undefined,
    created_at: row.created_at as string,
  };
}