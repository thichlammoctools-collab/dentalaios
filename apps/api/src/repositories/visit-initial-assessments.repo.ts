import type { D1Database } from "@cloudflare/workers-types";
import type { VisitInitialAssessment } from "@shared/types";
import type { VisitInitialAssessmentInput } from "@shared/validation";
import type { D1Row } from "./base";

export function createVisitInitialAssessmentsRepository(db: D1Database) {
  return {
    async getByVisit(tenantId: string, visitId: string): Promise<VisitInitialAssessment | null> {
      const row = await db.prepare("SELECT * FROM visit_initial_assessments WHERE tenant_id = ? AND visit_id = ? LIMIT 1")
        .bind(tenantId, visitId).first<D1Row>();
      return row ? mapAssessment(row) : null;
    },

    async upsert(
      tenantId: string,
      visitId: string,
      enteredBy: string,
      entrySource: VisitInitialAssessment["entry_source"],
      data: VisitInitialAssessmentInput,
    ): Promise<VisitInitialAssessment> {
      const current = await this.getByVisit(tenantId, visitId);
      const id = current?.id ?? crypto.randomUUID();
      const createdAt = current?.created_at ?? new Date().toISOString();
      await db.prepare(`INSERT INTO visit_initial_assessments
        (id, tenant_id, visit_id, chief_complaint, history_of_present_illness, dental_history,
         medical_conditions_json, medications_json, allergies_json, pregnancy_lactation, tobacco_alcohol,
         asa_class, examination_summary, preliminary_risk_notes, entered_by, entry_source, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
        ON CONFLICT(visit_id) DO UPDATE SET
          chief_complaint = excluded.chief_complaint,
          history_of_present_illness = excluded.history_of_present_illness,
          dental_history = excluded.dental_history,
          medical_conditions_json = excluded.medical_conditions_json,
          medications_json = excluded.medications_json,
          allergies_json = excluded.allergies_json,
          pregnancy_lactation = excluded.pregnancy_lactation,
          tobacco_alcohol = excluded.tobacco_alcohol,
          asa_class = excluded.asa_class,
          examination_summary = excluded.examination_summary,
          preliminary_risk_notes = excluded.preliminary_risk_notes,
          entered_by = excluded.entered_by,
          entry_source = excluded.entry_source,
          reviewed_by = NULL,
          reviewed_at = NULL,
          clinical_effective_at = NULL,
          updated_at = datetime('now')`)
        .bind(
          id, tenantId, visitId, data.chief_complaint ?? null, data.history_of_present_illness ?? null,
          data.dental_history ?? null, stringify(data.medical_conditions), stringify(data.medications),
          stringify(data.allergies), data.pregnancy_lactation ?? null, data.tobacco_alcohol ?? null,
          data.asa_class ?? null, data.examination_summary ?? null, data.preliminary_risk_notes ?? null,
          enteredBy, entrySource, createdAt,
        ).run();
      const saved = await this.getByVisit(tenantId, visitId);
      if (!saved) throw new Error("Initial assessment insert succeeded but read failed");
      return saved;
    },

    async accept(tenantId: string, id: string, reviewerId: string, reviewedAt: string): Promise<boolean> {
      const result = await db.prepare(`UPDATE visit_initial_assessments
        SET reviewed_by = ?, reviewed_at = ?, clinical_effective_at = ?, updated_at = datetime('now')
        WHERE tenant_id = ? AND id = ?`)
        .bind(reviewerId, reviewedAt, reviewedAt, tenantId, id).run();
      return result.meta.changes > 0;
    },
  };
}

function mapAssessment(row: D1Row): VisitInitialAssessment {
  return {
    id: row.id as string,
    tenant_id: row.tenant_id as string,
    visit_id: row.visit_id as string,
    chief_complaint: optional(row, "chief_complaint"),
    history_of_present_illness: optional(row, "history_of_present_illness"),
    dental_history: optional(row, "dental_history"),
    medical_conditions: parseArray(row.medical_conditions_json),
    medications: parseArray(row.medications_json),
    allergies: parseArray(row.allergies_json),
    pregnancy_lactation: optional(row, "pregnancy_lactation"),
    tobacco_alcohol: optional(row, "tobacco_alcohol"),
    asa_class: optional(row, "asa_class") as VisitInitialAssessment["asa_class"],
    examination_summary: optional(row, "examination_summary"),
    preliminary_risk_notes: optional(row, "preliminary_risk_notes"),
    entered_by: row.entered_by as string,
    reviewed_by: optional(row, "reviewed_by"),
    reviewed_at: optional(row, "reviewed_at"),
    entry_source: ((optional(row, "entry_source") ?? "assistant") as VisitInitialAssessment["entry_source"]),
    clinical_effective_at: optional(row, "clinical_effective_at"),
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
  };
}

function stringify(value: unknown): string | null {
  return value === undefined ? null : JSON.stringify(value);
}

function parseArray(value: unknown): unknown[] | undefined {
  if (typeof value !== "string" || !value) return undefined;
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

function optional(row: D1Row, key: string): string | undefined {
  const value = row[key];
  return typeof value === "string" && value ? value : undefined;
}
