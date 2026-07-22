import type { D1Database } from "@cloudflare/workers-types";
import type { ClinicalDiagnosis, ClinicalDiagnosisRevision } from "@shared/types";
import type { D1Row } from "./base";

const select = `SELECT id, tenant_id, visit_id, patient_id, source_finding_id, concept_id, concept_version_id, status,
  icd10_code_id, icd10_version_id, icd10_code_snapshot, icd10_display_vi_snapshot, concept_code_snapshot,
  concept_display_vi_snapshot, mapping_id, mapping_role, source, source_text, confirmed_by, confirmed_at,
  ruled_out_at, resolved_at, notes, created_by, created_at, updated_at, current_revision FROM clinical_diagnoses`;

export function createDiagnosesRepository(db: D1Database) {
  return {
    async listByVisit(tenantId: string, visitId: string): Promise<ClinicalDiagnosis[]> {
      const result = await db.prepare(`${select} WHERE tenant_id = ? AND visit_id = ? ORDER BY created_at DESC`).bind(tenantId, visitId).all<D1Row>();
      return result.results.map(mapDiagnosis);
    },
    async listConfirmedByVisit(tenantId: string, visitId: string): Promise<ClinicalDiagnosis[]> {
      const result = await db.prepare(`${select} WHERE tenant_id = ? AND visit_id = ? AND status = 'confirmed' ORDER BY created_at DESC`).bind(tenantId, visitId).all<D1Row>();
      return result.results.map(mapDiagnosis);
    },
    async listConfirmedReport(tenantId: string, filters: { from?: string; to?: string; icd10?: string; branchId?: string }): Promise<Array<ClinicalDiagnosis & { visit_date: string; branch_id: string; clinician_id: string }>> {
      const where = ["d.tenant_id = ?", "d.status = 'confirmed'"];
      const binds: unknown[] = [tenantId];
      if (filters.from) { where.push("v.date >= ?"); binds.push(filters.from); }
      if (filters.to) { where.push("v.date <= ?"); binds.push(filters.to); }
      if (filters.icd10) { where.push("d.icd10_code_snapshot LIKE ?"); binds.push(`${filters.icd10}%`); }
      if (filters.branchId) { where.push("v.branch_id = ?"); binds.push(filters.branchId); }
      const result = await db.prepare(`SELECT d.*, v.date AS visit_date, v.branch_id, v.clinician_id
        FROM clinical_diagnoses d JOIN visits v ON v.id = d.visit_id AND v.tenant_id = d.tenant_id
        WHERE ${where.join(" AND ")} ORDER BY v.date DESC, d.created_at DESC LIMIT 500`).bind(...binds).all<D1Row>();
      return result.results.map((row) => ({ ...mapDiagnosis(row), visit_date: row.visit_date as string, branch_id: row.branch_id as string, clinician_id: row.clinician_id as string }));
    },
    async get(tenantId: string, id: string): Promise<ClinicalDiagnosis | null> {
      const row = await db.prepare(`${select} WHERE tenant_id = ? AND id = ? LIMIT 1`).bind(tenantId, id).first<D1Row>();
      return row ? mapDiagnosis(row) : null;
    },
    async create(data: ClinicalDiagnosis): Promise<ClinicalDiagnosis> {
      await db.prepare(`INSERT INTO clinical_diagnoses (${columns.join(", ")}) VALUES (${columns.map(() => "?").join(", ")})`)
        .bind(...columns.map((key) => (data as unknown as Record<string, unknown>)[key] ?? null)).run();
      const created = await this.get(data.tenant_id, data.id);
      if (!created) throw new Error("Diagnosis insert failed");
      return created;
    },
    async update(tenantId: string, id: string, data: ClinicalDiagnosis): Promise<ClinicalDiagnosis | null> {
      const updateColumns = columns.filter((key) => !["id", "tenant_id", "visit_id", "patient_id", "created_at", "created_by"].includes(key));
      await db.prepare(`UPDATE clinical_diagnoses SET ${updateColumns.map((key) => `${key} = ?`).join(", ")} WHERE tenant_id = ? AND id = ?`)
        .bind(...updateColumns.map((key) => (data as unknown as Record<string, unknown>)[key] ?? null), tenantId, id).run();
      return this.get(tenantId, id);
    },
    async addRevision(revision: ClinicalDiagnosisRevision): Promise<void> {
      await db.prepare(`INSERT INTO clinical_diagnosis_revisions
        (id, tenant_id, diagnosis_id, revision_no, change_reason, before_json, after_json, changed_by, changed_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .bind(revision.id, revision.tenant_id, revision.diagnosis_id, revision.revision_no, revision.change_reason, revision.before_json, revision.after_json, revision.changed_by, revision.changed_at).run();
    },
    async listRevisions(tenantId: string, diagnosisId: string): Promise<ClinicalDiagnosisRevision[]> {
      const result = await db.prepare(`SELECT id, tenant_id, diagnosis_id, revision_no, change_reason, before_json, after_json, changed_by, changed_at
        FROM clinical_diagnosis_revisions WHERE tenant_id = ? AND diagnosis_id = ? ORDER BY revision_no DESC`).bind(tenantId, diagnosisId).all<D1Row>();
      return result.results.map((row) => ({ id: row.id as string, tenant_id: row.tenant_id as string, diagnosis_id: row.diagnosis_id as string, revision_no: Number(row.revision_no), change_reason: row.change_reason as string, before_json: row.before_json as string, after_json: row.after_json as string, changed_by: row.changed_by as string, changed_at: row.changed_at as string }));
    },
  };
}

const columns = ["id", "tenant_id", "visit_id", "patient_id", "source_finding_id", "concept_id", "concept_version_id", "status", "icd10_code_id", "icd10_version_id", "icd10_code_snapshot", "icd10_display_vi_snapshot", "concept_code_snapshot", "concept_display_vi_snapshot", "mapping_id", "mapping_role", "source", "source_text", "confirmed_by", "confirmed_at", "ruled_out_at", "resolved_at", "notes", "created_by", "created_at", "updated_at", "current_revision"];
function optional(row: D1Row, key: string): string | undefined { const raw = row[key]; return typeof raw === "string" && raw ? raw : undefined; }
function mapDiagnosis(row: D1Row): ClinicalDiagnosis { return { id: row.id as string, tenant_id: row.tenant_id as string, visit_id: row.visit_id as string, patient_id: row.patient_id as string, source_finding_id: optional(row, "source_finding_id"), concept_id: row.concept_id as string, concept_version_id: row.concept_version_id as string, status: row.status as ClinicalDiagnosis["status"], icd10_code_id: optional(row, "icd10_code_id"), icd10_version_id: optional(row, "icd10_version_id"), icd10_code_snapshot: optional(row, "icd10_code_snapshot"), icd10_display_vi_snapshot: optional(row, "icd10_display_vi_snapshot"), concept_code_snapshot: row.concept_code_snapshot as string, concept_display_vi_snapshot: row.concept_display_vi_snapshot as string, mapping_id: optional(row, "mapping_id"), mapping_role: optional(row, "mapping_role") as ClinicalDiagnosis["mapping_role"], source: row.source as ClinicalDiagnosis["source"], source_text: optional(row, "source_text"), confirmed_by: optional(row, "confirmed_by"), confirmed_at: optional(row, "confirmed_at"), ruled_out_at: optional(row, "ruled_out_at"), resolved_at: optional(row, "resolved_at"), notes: optional(row, "notes"), created_by: row.created_by as string, created_at: row.created_at as string, updated_at: row.updated_at as string, current_revision: Number(row.current_revision) }; }
