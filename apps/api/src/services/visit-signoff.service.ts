import type { D1Database } from "@cloudflare/workers-types";
import { ConflictError, NotFoundError, ValidationError } from "../lib/errors";
import { createClinicalRecordVersionsRepository, type ClinicalRecordVersion } from "../repositories/clinical-record-versions.repo";
import { createClinicalReviewEventsRepository } from "../repositories/clinical-review-events.repo";
import { createDiagnosesRepository } from "../repositories/diagnoses.repo";
import { createFindingsRepository } from "../repositories/findings.repo";
import { createVisitInitialAssessmentsRepository } from "../repositories/visit-initial-assessments.repo";
import { createVisitsRepository } from "../repositories/visits.repo";
export const visitSignoffService = {
  async sign(db: D1Database, tenantId: string, visitId: string, doctorId: string): Promise<ClinicalRecordVersion> {
    const visits = createVisitsRepository(db);
    const visit = await visits.getById(tenantId, visitId);
    if (!visit) throw new NotFoundError("Visit not found");
    if (visit.locked_at || visit.clinical_state === "signed") throw new ConflictError("Hồ sơ lượt khám này đã được ký và khóa");

    const pendingReviews = await createClinicalReviewEventsRepository(db).listPendingByVisit(tenantId, visitId);
    if (pendingReviews.length > 0) throw new ValidationError("Còn dữ liệu pre-exam/draft chưa được bác sĩ review", { pending_count: pendingReviews.length });

    const initialAssessment = await createVisitInitialAssessmentsRepository(db).getByVisit(tenantId, visitId);
    if (visit.visit_type === "initial_exam" && !initialAssessment) {
      throw new ValidationError("Lượt khám đầu tiên cần có hồ sơ đánh giá ban đầu trước khi ký khóa");
    }

    const findings = await createFindingsRepository(db).listEffectiveByVisit(tenantId, visitId);
    const diagnoses = await createDiagnosesRepository(db).listConfirmedByVisit(tenantId, visitId);
    const now = new Date().toISOString();
    const canonicalObj = { visit, initial_assessment: initialAssessment, findings, diagnoses, signed_at: now, signed_by: doctorId };
    const canonicalJson = JSON.stringify(canonicalObj);
    const sha256 = await computeSha256Hex(canonicalJson);
    const createdVersion: ClinicalRecordVersion = {
      id: crypto.randomUUID(),
      tenant_id: tenantId,
      visit_id: visitId,
      version_no: 1,
      record_type: "signed_record",
      canonical_json: canonicalJson,
      sha256,
      created_by: doctorId,
      created_at: now,
    };
    // D1 batch is transactional: a record is never signed without its immutable
    // snapshot, and a snapshot is never persisted for an unlocked visit.
    await db.batch([
      db.prepare(`INSERT INTO clinical_record_versions
        (id, tenant_id, visit_id, version_no, record_type, canonical_json, sha256, reason, created_by, created_at, supersedes_version_id, archive_file_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .bind(createdVersion.id, tenantId, visitId, 1, "signed_record", canonicalJson, sha256, null, doctorId, now, null, null),
      db.prepare(`UPDATE visits
        SET clinical_state = 'signed', signed_by = ?, signed_at = ?, locked_at = ?, effective_at = ?
        WHERE tenant_id = ? AND id = ? AND locked_at IS NULL`)
        .bind(doctorId, now, now, now, tenantId, visitId),
    ]);
    return createdVersion;
  },
  async listVersions(db: D1Database, tenantId: string, visitId: string): Promise<ClinicalRecordVersion[]> {
    const visit = await createVisitsRepository(db).getById(tenantId, visitId);
    if (!visit) throw new NotFoundError("Visit not found");
    return createClinicalRecordVersionsRepository(db).listByVisit(tenantId, visitId);
  },
};
async function computeSha256Hex(data: string): Promise<string> {
  const bytes = new TextEncoder().encode(data);
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, "0")).join("");
}
