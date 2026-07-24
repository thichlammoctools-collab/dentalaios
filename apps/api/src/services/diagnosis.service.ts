import type { D1Database } from "@cloudflare/workers-types";
import type { ClinicalDiagnosis, ClinicalDiagnosisStatus } from "@shared/types";
import type { DiagnosisCreateInput, DiagnosisUpdateInput } from "@shared/validation";
import { ConflictError, NotFoundError, ValidationError } from "../lib/errors";
import { createClinicalTerminologyRepository } from "../repositories/clinical-terminology.repo";
import { createDiagnosesRepository } from "../repositories/diagnoses.repo";
import { createVisitsRepository } from "../repositories/visits.repo";

export const diagnosisService = {
  async list(db: D1Database, tenantId: string, visitId: string): Promise<ClinicalDiagnosis[]> {
    await requireVisit(db, tenantId, visitId);
    return createDiagnosesRepository(db).listByVisit(tenantId, visitId);
  },

  async create(
    db: D1Database,
    tenantId: string,
    visitId: string,
    actorId: string,
    data: DiagnosisCreateInput,
    entry: { entrySource?: "assistant" | "doctor" | "ai"; clinicalEffective?: boolean } = {},
  ): Promise<ClinicalDiagnosis> {
    const visit = await requireVisit(db, tenantId, visitId);
    if (visit.locked_at) throw new ConflictError("Hồ sơ lượt khám đã được ký và khóa; hãy tạo amendment");
    await assertSourceFinding(db, tenantId, visitId, data.source_finding_id ?? undefined);
    const resolved = await resolveDiagnosis(db, data.concept_id, data.icd10_code_id ?? undefined, data.status);
    const now = new Date().toISOString();
    const entrySource = entry.entrySource ?? "doctor";
    const clinicalEffective = entry.clinicalEffective ?? entrySource === "doctor";
    return createDiagnosesRepository(db).create({
      id: crypto.randomUUID(),
      tenant_id: tenantId,
      visit_id: visitId,
      patient_id: visit.patient_id,
      source_finding_id: data.source_finding_id ?? undefined,
      concept_id: resolved.concept.id,
      concept_version_id: resolved.conceptVersionId,
      status: data.status,
      icd10_code_id: resolved.mapping?.code.id,
      icd10_version_id: resolved.mapping?.code.terminology_version_id,
      icd10_code_snapshot: resolved.mapping?.code.code,
      icd10_display_vi_snapshot: resolved.mapping?.code.display_vi,
      concept_code_snapshot: resolved.concept.code,
      concept_display_vi_snapshot: resolved.concept.display_vi,
      mapping_id: resolved.mapping?.id,
      mapping_role: resolved.mapping?.mapping_role,
      source: data.source,
      source_text: data.source_text,
      confirmed_by: data.status === "confirmed" ? actorId : undefined,
      confirmed_at: data.status === "confirmed" ? now : undefined,
      ruled_out_at: data.status === "ruled_out" ? now : undefined,
      resolved_at: data.status === "resolved" ? now : undefined,
      notes: data.notes,
      entered_by: actorId,
      entry_source: entrySource,
      clinical_effective_at: clinicalEffective ? now : undefined,
      created_by: actorId,
      created_at: now,
      updated_at: now,
      current_revision: 1,
    });
  },

  async update(
    db: D1Database,
    tenantId: string,
    visitId: string,
    diagnosisId: string,
    actorId: string,
    data: DiagnosisUpdateInput,
  ): Promise<ClinicalDiagnosis> {
    const visit = await requireVisit(db, tenantId, visitId);
    if (visit.locked_at) throw new ConflictError("Hồ sơ lượt khám đã được ký và khóa; hãy tạo amendment");
    const repo = createDiagnosesRepository(db);
    const current = await repo.get(tenantId, diagnosisId);
    if (!current || current.visit_id !== visitId) throw new NotFoundError("Diagnosis not found");

    const status = data.status ?? current.status;
    const conceptId = data.concept_id ?? current.concept_id;
    const shouldResolve = conceptId !== current.concept_id || data.icd10_code_id !== undefined || status === "confirmed";
    const resolved = shouldResolve
      ? await resolveDiagnosis(db, conceptId, data.icd10_code_id === undefined ? current.icd10_code_id : data.icd10_code_id ?? undefined, status)
      : null;
    const now = new Date().toISOString();
    const next: ClinicalDiagnosis = {
      ...current,
      concept_id: resolved?.concept.id ?? current.concept_id,
      concept_version_id: resolved?.conceptVersionId ?? current.concept_version_id,
      status,
      icd10_code_id: resolved?.mapping?.code.id ?? (status === "confirmed" ? current.icd10_code_id : current.icd10_code_id),
      icd10_version_id: resolved?.mapping?.code.terminology_version_id ?? current.icd10_version_id,
      icd10_code_snapshot: resolved?.mapping?.code.code ?? current.icd10_code_snapshot,
      icd10_display_vi_snapshot: resolved?.mapping?.code.display_vi ?? current.icd10_display_vi_snapshot,
      concept_code_snapshot: resolved?.concept.code ?? current.concept_code_snapshot,
      concept_display_vi_snapshot: resolved?.concept.display_vi ?? current.concept_display_vi_snapshot,
      mapping_id: resolved?.mapping?.id ?? current.mapping_id,
      mapping_role: resolved?.mapping?.mapping_role ?? current.mapping_role,
      confirmed_by: status === "confirmed" ? (current.confirmed_by ?? actorId) : current.confirmed_by,
      confirmed_at: status === "confirmed" ? (current.confirmed_at ?? now) : current.confirmed_at,
      ruled_out_at: status === "ruled_out" ? now : current.ruled_out_at,
      resolved_at: status === "resolved" ? now : current.resolved_at,
      notes: data.notes === undefined ? current.notes : data.notes,
      updated_at: now,
      current_revision: current.current_revision + 1,
    };
    const updated = await repo.update(tenantId, diagnosisId, next);
    if (!updated) throw new NotFoundError("Diagnosis not found");
    await repo.addRevision({
      id: crypto.randomUUID(),
      tenant_id: tenantId,
      diagnosis_id: diagnosisId,
      revision_no: updated.current_revision,
      change_reason: data.change_reason,
      before_json: JSON.stringify(current),
      after_json: JSON.stringify(updated),
      changed_by: actorId,
      changed_at: now,
    });
    return updated;
  },

  async revisions(db: D1Database, tenantId: string, visitId: string, diagnosisId: string) {
    const diagnosis = await createDiagnosesRepository(db).get(tenantId, diagnosisId);
    if (!diagnosis || diagnosis.visit_id !== visitId) throw new NotFoundError("Diagnosis not found");
    return createDiagnosesRepository(db).listRevisions(tenantId, diagnosisId);
  },
};

async function requireVisit(db: D1Database, tenantId: string, visitId: string) {
  const visit = await createVisitsRepository(db).getById(tenantId, visitId);
  if (!visit) throw new NotFoundError("Visit not found");
  return visit;
}

async function assertSourceFinding(db: D1Database, tenantId: string, visitId: string, findingId?: string): Promise<void> {
  if (!findingId) return;
  const finding = await db.prepare("SELECT visit_id FROM clinical_findings WHERE tenant_id = ? AND id = ? LIMIT 1").bind(tenantId, findingId).first<{ visit_id: string }>();
  if (!finding || finding.visit_id !== visitId) throw new ValidationError("Finding nguồn không thuộc lượt khám này");
}

async function resolveDiagnosis(
  db: D1Database,
  conceptId: string,
  requestedIcd10Id: string | undefined,
  status: ClinicalDiagnosisStatus,
) {
  const terminology = createClinicalTerminologyRepository(db);
  const concept = await terminology.getConcept(conceptId);
  if (!concept || !concept.is_active) throw new ValidationError("Khái niệm lâm sàng không còn hoạt động");
  if (concept.kind !== "diagnosis") throw new ValidationError("Chỉ khái niệm loại chẩn đoán mới tạo được diagnosis");
  const version = await terminology.getConceptVersion(conceptId);
  if (!version) throw new ConflictError("Khái niệm chưa có phiên bản thuật ngữ được duyệt");
  const mapping = await terminology.getActiveMapping(conceptId, requestedIcd10Id);
  if (status === "confirmed" && !mapping) throw new ValidationError("Chẩn đoán xác nhận cần mã ICD-10 Việt Nam được phê duyệt");
  if (requestedIcd10Id && !mapping) throw new ValidationError("Mã ICD-10 không phải mapping hợp lệ của chẩn đoán");
  return { concept, conceptVersionId: version.id, mapping };
}
