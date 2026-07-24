import type { D1Database } from "@cloudflare/workers-types";
import type { ClinicalDiagnosis, ClinicalFinding, ClinicalReviewEntityType, ClinicalReviewEvent, VisitInitialAssessment } from "@shared/types";
import type { ClinicalReviewEditAndAcceptInput, ClinicalReviewRejectInput, PreExamSubmitInput } from "@shared/validation";
import { ConflictError, NotFoundError, ValidationError } from "../lib/errors";
import { createClinicalReviewEventsRepository } from "../repositories/clinical-review-events.repo";
import { createDiagnosesRepository } from "../repositories/diagnoses.repo";
import { createFindingsRepository } from "../repositories/findings.repo";
import { createVisitInitialAssessmentsRepository } from "../repositories/visit-initial-assessments.repo";
import { createVisitsRepository } from "../repositories/visits.repo";
import { diagnosisService } from "./diagnosis.service";
import { visitService } from "./visit.service";

type DraftEntrySource = "assistant" | "doctor" | "ai";
type QueueItem = {
  event: ClinicalReviewEvent;
  entity: ClinicalFinding | ClinicalDiagnosis | VisitInitialAssessment;
};

export const clinicalReviewService = {
  async submitPreExam(
    db: D1Database,
    tenantId: string,
    visitId: string,
    actorId: string,
    entrySource: DraftEntrySource,
    data: PreExamSubmitInput,
  ): Promise<{ visit_id: string; assessment?: VisitInitialAssessment; findings: ClinicalFinding[]; diagnoses: ClinicalDiagnosis[]; reviews: ClinicalReviewEvent[] }> {
    const visit = await createVisitsRepository(db).getById(tenantId, visitId);
    if (!visit) throw new NotFoundError("Visit not found");
    assertDraftableVisit(visit);

    const events = createClinicalReviewEventsRepository(db);
    const createdFindings: ClinicalFinding[] = [];
    const createdDiagnoses: ClinicalDiagnosis[] = [];
    let assessment: VisitInitialAssessment | undefined;

    if (data.initial_assessment) {
      assessment = await createVisitInitialAssessmentsRepository(db).upsert(
        tenantId,
        visitId,
        actorId,
        entrySource === "ai" ? "assistant" : entrySource,
        data.initial_assessment,
      );
      await events.create(pendingEvent(tenantId, visitId, "initial_assessment", assessment.id, actorId));
    }

    for (const [itemIndex, finding] of (data.findings ?? []).entries()) {
      try {
        const created = await visitService.addFinding(db, tenantId, visitId, finding, { userId: actorId, entrySource });
        createdFindings.push(created);
        await events.create(pendingEvent(tenantId, visitId, "finding", created.id, actorId));
      } catch (error) {
        if (error instanceof ValidationError) throw new ValidationError(error.message, { item_index: itemIndex });
        throw error;
      }
    }

    for (const [itemIndex, diagnosis] of (data.diagnoses_suspected ?? []).entries()) {
      try {
        const created = await diagnosisService.create(db, tenantId, visitId, actorId, {
          ...diagnosis,
          status: "suspected",
        }, { entrySource, clinicalEffective: false });
        createdDiagnoses.push(created);
        await events.create(pendingEvent(tenantId, visitId, "diagnosis", created.id, actorId));
      } catch (error) {
        if (error instanceof ValidationError) throw new ValidationError(error.message, { item_index: itemIndex });
        throw error;
      }
    }

    const updated = await createVisitsRepository(db).update(tenantId, visitId, { clinical_state: "awaiting_doctor_review" });
    if (!updated) throw new NotFoundError("Visit not found");
    return { visit_id: visitId, assessment, findings: createdFindings, diagnoses: createdDiagnoses, reviews: await events.listPendingByVisit(tenantId, visitId) };
  },

  async listPending(db: D1Database, tenantId: string, visitId: string): Promise<QueueItem[]> {
    const visit = await createVisitsRepository(db).getById(tenantId, visitId);
    if (!visit) throw new NotFoundError("Visit not found");
    const events = await createClinicalReviewEventsRepository(db).listPendingByVisit(tenantId, visitId);
    const items: QueueItem[] = [];
    for (const event of events) {
      const entity = await getEntity(db, tenantId, visitId, event.entity_type, event.entity_id);
      if (entity) items.push({ event, entity });
    }
    return items;
  },

  async accept(
    db: D1Database,
    tenantId: string,
    visitId: string,
    entityType: ClinicalReviewEntityType,
    entityId: string,
    reviewerId: string,
  ): Promise<ClinicalReviewEvent> {
    const event = await requirePendingEvent(db, tenantId, visitId, entityType, entityId);
    const now = new Date().toISOString();
    await markEntityEffective(db, tenantId, visitId, entityType, entityId, reviewerId, now);
    if (!await createClinicalReviewEventsRepository(db).updateStatus(tenantId, event.id, "accepted", reviewerId, now)) {
      throw new ConflictError("Bản ghi đã được review, vui lòng tải lại");
    }
    await transitionWhenQueueEmpty(db, tenantId, visitId);
    return { ...event, review_status: "accepted", reviewed_by: reviewerId, reviewed_at: now };
  },

  async reject(
    db: D1Database,
    tenantId: string,
    visitId: string,
    entityType: ClinicalReviewEntityType,
    entityId: string,
    reviewerId: string,
    data: ClinicalReviewRejectInput,
  ): Promise<ClinicalReviewEvent> {
    const event = await requirePendingEvent(db, tenantId, visitId, entityType, entityId);
    const now = new Date().toISOString();
    if (!await createClinicalReviewEventsRepository(db).updateStatus(tenantId, event.id, "rejected", reviewerId, now, data.review_note)) {
      throw new ConflictError("Bản ghi đã được review, vui lòng tải lại");
    }
    await transitionWhenQueueEmpty(db, tenantId, visitId);
    return { ...event, review_status: "rejected", reviewed_by: reviewerId, reviewed_at: now, review_note: data.review_note };
  },

  async editAndAccept(
    db: D1Database,
    tenantId: string,
    visitId: string,
    entityType: ClinicalReviewEntityType,
    entityId: string,
    reviewerId: string,
    data: ClinicalReviewEditAndAcceptInput,
  ): Promise<ClinicalReviewEvent> {
    const current = await requirePendingEvent(db, tenantId, visitId, entityType, entityId);
    const now = new Date().toISOString();

    if (entityType === "finding") {
      if (!data.finding) throw new ValidationError("Cần gửi nội dung finding đã chỉnh sửa");
      await visitService.updateFinding(db, tenantId, visitId, entityId, data.finding);
    } else if (entityType === "diagnosis") {
      if (!data.diagnosis) throw new ValidationError("Cần gửi nội dung chẩn đoán đã chỉnh sửa");
      await diagnosisService.update(db, tenantId, visitId, entityId, reviewerId, data.diagnosis);
    } else {
      if (!data.initial_assessment) throw new ValidationError("Cần gửi nội dung pre-exam đã chỉnh sửa");
      await createVisitInitialAssessmentsRepository(db).upsert(tenantId, visitId, reviewerId, "doctor", data.initial_assessment);
    }

    if (!await createClinicalReviewEventsRepository(db).updateStatus(tenantId, current.id, "superseded", reviewerId, now, data.review_note)) {
      throw new ConflictError("Bản ghi đã được review, vui lòng tải lại");
    }
    await markEntityEffective(db, tenantId, visitId, entityType, entityId, reviewerId, now);
    const accepted = {
      ...pendingEvent(tenantId, visitId, entityType, entityId, reviewerId),
      review_status: "accepted" as const,
      reviewed_by: reviewerId,
      reviewed_at: now,
      review_note: data.review_note,
    };
    await createClinicalReviewEventsRepository(db).create(accepted);
    await transitionWhenQueueEmpty(db, tenantId, visitId);
    return accepted;
  },
};

function pendingEvent(tenantId: string, visitId: string, entityType: ClinicalReviewEntityType, entityId: string, enteredBy: string): ClinicalReviewEvent {
  return {
    id: crypto.randomUUID(), tenant_id: tenantId, visit_id: visitId, entity_type: entityType,
    entity_id: entityId, review_status: "pending", entered_by: enteredBy, created_at: new Date().toISOString(),
  };
}

function assertDraftableVisit(visit: { locked_at?: string; clinical_state: string }): void {
  if (visit.locked_at || ["signed", "amended", "cancelled"].includes(visit.clinical_state)) {
    throw new ConflictError("Lượt khám đã khóa hoặc không còn nhận pre-exam draft");
  }
}

async function requirePendingEvent(
  db: D1Database, tenantId: string, visitId: string, entityType: ClinicalReviewEntityType, entityId: string,
): Promise<ClinicalReviewEvent> {
  const visit = await createVisitsRepository(db).getById(tenantId, visitId);
  if (!visit) throw new NotFoundError("Visit not found");
  assertDraftableVisit(visit);
  const event = await createClinicalReviewEventsRepository(db).getPending(tenantId, visitId, entityType, entityId);
  if (!event) throw new NotFoundError("Không tìm thấy clinical draft chờ duyệt");
  return event;
}

async function getEntity(
  db: D1Database, tenantId: string, visitId: string, entityType: ClinicalReviewEntityType, entityId: string,
): Promise<ClinicalFinding | ClinicalDiagnosis | VisitInitialAssessment | null> {
  if (entityType === "finding") return createFindingsRepository(db).getByVisitAndId(tenantId, visitId, entityId);
  if (entityType === "diagnosis") {
    const diagnosis = await createDiagnosesRepository(db).get(tenantId, entityId);
    return diagnosis?.visit_id === visitId ? diagnosis : null;
  }
  const assessment = await createVisitInitialAssessmentsRepository(db).getByVisit(tenantId, visitId);
  return assessment?.id === entityId ? assessment : null;
}

async function markEntityEffective(
  db: D1Database, tenantId: string, visitId: string, entityType: ClinicalReviewEntityType, entityId: string, reviewerId: string, effectiveAt: string,
): Promise<void> {
  if (!await getEntity(db, tenantId, visitId, entityType, entityId)) throw new NotFoundError("Clinical draft không thuộc lượt khám này");
  if (entityType === "finding") {
    await db.prepare("UPDATE clinical_findings SET clinical_effective_at = ? WHERE tenant_id = ? AND visit_id = ? AND id = ?")
      .bind(effectiveAt, tenantId, visitId, entityId).run();
    return;
  }
  if (entityType === "diagnosis") {
    await db.prepare("UPDATE clinical_diagnoses SET clinical_effective_at = ? WHERE tenant_id = ? AND visit_id = ? AND id = ?")
      .bind(effectiveAt, tenantId, visitId, entityId).run();
    return;
  }
  if (!await createVisitInitialAssessmentsRepository(db).accept(tenantId, entityId, reviewerId, effectiveAt)) {
    throw new NotFoundError("Initial assessment not found");
  }
}

async function transitionWhenQueueEmpty(db: D1Database, tenantId: string, visitId: string): Promise<void> {
  const pending = await createClinicalReviewEventsRepository(db).listPendingByVisit(tenantId, visitId);
  if (pending.length === 0) await createVisitsRepository(db).update(tenantId, visitId, { clinical_state: "in_progress" });
}
