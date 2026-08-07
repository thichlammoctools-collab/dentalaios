/**
 * Clinical Pathway Service — V1: endodontic pain.
 *
 * Tenant-scoped. Doctor-created assessments are effective immediately;
 * assistant-created assessments are drafts requiring clinical review.
 *
 * Architecture rules enforced:
 *  - #3: tenant_id on every clinical record
 *  - #9: RBAC checks via permissions, not frontend role
 *  - #8: no PII in logs
 */

import type { D1Database } from "@cloudflare/workers-types";
import { FEATURE_FLAGS } from "@shared/constants";
import type { ClinicalPathwayAssessment, ClinicalPathwayAssessmentItem, EndodonticPainAssessmentPayload, PathwayPattern } from "@shared/types";
import type { PathwayAssessmentCreateInput, PathwayAssessmentUpdateInput, PathwayAssessmentCloseInput, PathwayItemUpdateInput } from "@shared/validation";
import { ConflictError, NotFoundError, ValidationError } from "../lib/errors";
import { newId } from "../lib/ids";
import { createClinicalPathwayAssessmentsRepository } from "../repositories/clinical-pathway-assessments.repo";
import { createVisitsRepository } from "../repositories/visits.repo";
import { createClinicalReviewEventsRepository } from "../repositories/clinical-review-events.repo";
import { createPlatformConfigRepository } from "../repositories/platform-config.repo";
import {
  PATHWAY_KEY,
  PATHWAY_VERSION,
  ENDODONTIC_PAIN_CHECKLIST,
  getChecklistItem,
  getCompletedItemKeys,
  evaluatePatterns,
} from "./clinical-pathway-content";

const FLAG_KEY = FEATURE_FLAGS.CLINICAL_COPILOT_ENDODONTIC_PAIN_V1;

export interface PathwayAssessmentResponse {
  assessment: ClinicalPathwayAssessment;
  items: ClinicalPathwayAssessmentItem[];
  patterns: PathwayPattern[];
}

export interface PathwayVisitResponse {
  assessments: PathwayAssessmentResponse[];
  feature_enabled: boolean;
  pathway_key: string;
  pathway_version: string;
}

export const clinicalPathwayService = {
  /** Check if the pathway feature flag is enabled for this tenant. */
  async isFeatureEnabled(db: D1Database, tenantId: string): Promise<boolean> {
    return createPlatformConfigRepository(db).isTenantFlagEnabled(tenantId, FLAG_KEY);
  },

  /** GET — fetch all pathway data for a visit. */
  async getVisitPathway(
    db: D1Database,
    tenantId: string,
    visitId: string,
  ): Promise<PathwayVisitResponse> {
    const enabled = await this.isFeatureEnabled(db, tenantId);
    const repo = createClinicalPathwayAssessmentsRepository(db);

    const rawAssessments = await repo.listByVisit(tenantId, visitId);
    const assessments = await Promise.all(rawAssessments.map((a) => enrichAssessment(db, tenantId, a)));

    return {
      assessments,
      feature_enabled: enabled,
      pathway_key: PATHWAY_KEY,
      pathway_version: PATHWAY_VERSION,
    };
  },

  /** POST — create a new assessment for a tooth. */
  async createAssessment(
    db: D1Database,
    tenantId: string,
    visitId: string,
    userId: string,
    isDoctor: boolean,
    data: PathwayAssessmentCreateInput,
  ): Promise<PathwayAssessmentResponse> {
    await assertFeatureEnabled(db, tenantId);
    const visit = await requireVisit(db, tenantId, visitId);
    assertDraftableVisit(visit);

    const repo = createClinicalPathwayAssessmentsRepository(db);

    // Block duplicate active assessment for same tooth
    const existing = await repo.getActiveByTooth(tenantId, visitId, PATHWAY_KEY, data.tooth_number);
    if (existing) throw new ConflictError(`Răng ${data.tooth_number} đã có assessment đang active`);

    const now = new Date().toISOString();
    const assessmentJson = JSON.stringify(data.assessment);
    const assessment: ClinicalPathwayAssessment = {
      id: newId(),
      tenant_id: tenantId,
      visit_id: visitId,
      tooth_number: data.tooth_number,
      pathway_key: PATHWAY_KEY,
      pathway_version: PATHWAY_VERSION,
      status: "active",
      assessment_json: assessmentJson,
      entry_source: isDoctor ? "doctor" : "assistant",
      entered_by: userId,
      // Doctor-created is effective immediately; assistant-created needs review
      clinical_effective_at: isDoctor ? now : undefined,
      current_revision: 0,
      created_at: now,
      updated_at: now,
    };

    await repo.create(assessment);

    // Create checklist items — all start as pending
    const completedKeys = getCompletedItemKeys(data.assessment, true);
    for (const item of ENDODONTIC_PAIN_CHECKLIST) {
      const itemStatus = completedKeys.includes(item.key) ? "completed" : "pending";
      await repo.upsertItem({
        id: newId(),
        tenant_id: tenantId,
        assessment_id: assessment.id,
        item_key: item.key,
        item_version: 1,
        status: itemStatus,
        completed_by: itemStatus === "completed" ? userId : undefined,
        completed_at: itemStatus === "completed" ? now : undefined,
        updated_at: now,
      });
    }

    // If assistant creates, generate a clinical review event
    if (!isDoctor) {
      await createClinicalReviewEventsRepository(db).create({
        id: newId(),
        tenant_id: tenantId,
        visit_id: visitId,
        entity_type: "pathway_assessment",
        entity_id: assessment.id,
        review_status: "pending",
        entered_by: userId,
        created_at: now,
      });
    }

    return enrichAssessment(db, tenantId, assessment);
  },

  /** PATCH — update assessment payload (doctor only after effective). */
  async updateAssessment(
    db: D1Database,
    tenantId: string,
    visitId: string,
    assessmentId: string,
    userId: string,
    isDoctor: boolean,
    data: PathwayAssessmentUpdateInput,
  ): Promise<PathwayAssessmentResponse> {
    await assertFeatureEnabled(db, tenantId);
    const visit = await requireVisit(db, tenantId, visitId);
    assertDraftableVisit(visit);

    const repo = createClinicalPathwayAssessmentsRepository(db);
    const assessment = await repo.getById(tenantId, assessmentId);
    if (!assessment || assessment.visit_id !== visitId) throw new NotFoundError("Assessment not found");
    if (!isDoctor && assessment.clinical_effective_at) {
      throw new ConflictError("Chỉ bác sĩ được sửa assessment đã hiệu lực");
    }

    const now = new Date().toISOString();
    const beforeJson = assessment.assessment_json;
    const afterJson = JSON.stringify(data.assessment);

    // Create revision
    const revisionNo = await repo.getNextRevisionNo(tenantId, assessmentId);
    await repo.createRevision({
      id: newId(),
      tenant_id: tenantId,
      assessment_id: assessmentId,
      revision_no: revisionNo,
      before_json: beforeJson,
      after_json: afterJson,
      change_reason: data.change_reason,
      changed_by: userId,
      changed_at: now,
    });

    // Update assessment json and revision counter
    await repo.updateAssessmentJson(tenantId, assessmentId, afterJson, revisionNo, now);

    // Refresh checklist items based on new payload
    const completedKeys = getCompletedItemKeys(data.assessment, true);
    for (const item of ENDODONTIC_PAIN_CHECKLIST) {
      const existingItem = await repo.getItem(tenantId, assessmentId, item.key, 1);
      const newStatus = completedKeys.includes(item.key) ? "completed" : "pending";
      if (existingItem && existingItem.status !== newStatus) {
        await repo.upsertItem({
          ...existingItem,
          status: newStatus,
          completed_by: newStatus === "completed" ? userId : existingItem.completed_by,
          completed_at: newStatus === "completed" ? now : existingItem.completed_at,
          updated_at: now,
        });
      }
    }

    const updated = await repo.getById(tenantId, assessmentId);
    return enrichAssessment(db, tenantId, updated!);
  },

  /** PATCH — update a single checklist item. */
  async updateItem(
    db: D1Database,
    tenantId: string,
    visitId: string,
    assessmentId: string,
    itemKey: string,
    userId: string,
    isDoctor: boolean,
    data: PathwayItemUpdateInput,
  ): Promise<ClinicalPathwayAssessmentItem> {
    await assertFeatureEnabled(db, tenantId);
    const visit = await requireVisit(db, tenantId, visitId);
    assertDraftableVisit(visit);

    const repo = createClinicalPathwayAssessmentsRepository(db);
    const assessment = await repo.getById(tenantId, assessmentId);
    if (!assessment || assessment.visit_id !== visitId) throw new NotFoundError("Assessment not found");
    if (!isDoctor && assessment.clinical_effective_at) {
      throw new ConflictError("Chỉ bác sĩ được cập nhật checklist assessment đã hiệu lực");
    }

    const checklistItem = getChecklistItem(itemKey);
    if (!checklistItem) throw new NotFoundError(`Item "${itemKey}" không tồn tại trong pathway`);

    const existingItem = await repo.getItem(tenantId, assessmentId, itemKey, 1);
    const now = new Date().toISOString();

    let item: ClinicalPathwayAssessmentItem;
    if (existingItem) {
      item = { ...existingItem, status: data.status, updated_at: now };
      if (data.status === "skipped") {
        item.skip_reason = data.skip_reason;
        item.completed_by = userId;
        item.completed_at = now;
      } else {
        // completed
        item.value_json = data.value_json;
        item.completed_by = userId;
        item.completed_at = now;
        item.skip_reason = undefined;
      }
      await repo.upsertItem(item);
    } else {
      item = {
        id: newId(),
        tenant_id: tenantId,
        assessment_id: assessmentId,
        item_key: itemKey,
        item_version: 1,
        status: data.status,
        value_json: data.value_json,
        skip_reason: data.status === "skipped" ? data.skip_reason : undefined,
        completed_by: userId,
        completed_at: now,
        updated_at: now,
      };
      await repo.upsertItem(item);
    }

    // Create a revision for item change
    const revisionNo = await repo.getNextRevisionNo(tenantId, assessmentId);
    await repo.createRevision({
      id: newId(),
      tenant_id: tenantId,
      assessment_id: assessmentId,
      revision_no: revisionNo,
      before_json: existingItem ? JSON.stringify(existingItem) : "{}",
      after_json: JSON.stringify(item),
      change_reason: `Cập nhật item "${checklistItem.label}" → ${data.status}`,
      changed_by: userId,
      changed_at: now,
    });

    return item;
  },

  /** POST — close an assessment (validate all items terminal). */
  async closeAssessment(
    db: D1Database,
    tenantId: string,
    visitId: string,
    assessmentId: string,
    userId: string,
    isDoctor: boolean,
    data: PathwayAssessmentCloseInput,
  ): Promise<ClinicalPathwayAssessment> {
    await assertFeatureEnabled(db, tenantId);
    const visit = await requireVisit(db, tenantId, visitId);
    assertDraftableVisit(visit);

    const repo = createClinicalPathwayAssessmentsRepository(db);
    const assessment = await repo.getById(tenantId, assessmentId);
    if (!assessment || assessment.visit_id !== visitId) throw new NotFoundError("Assessment not found");
    if (!isDoctor || !assessment.clinical_effective_at) {
      throw new ConflictError("Chỉ bác sĩ được hoàn tất assessment đã có hiệu lực lâm sàng");
    }
    if (assessment.status !== "active") throw new ConflictError("Chỉ assessment đang active mới được đóng");

    // Check no pending items
    const pendingCount = await repo.countItemsByStatus(tenantId, assessmentId, "pending");
    if (pendingCount > 0) {
      throw new ValidationError(`Còn ${pendingCount} item chưa xử lý`, { pending_count: pendingCount });
    }

    // Check all skipped items have skip_reason
    if (await repo.hasItemsWithMissingSkipReason(tenantId, assessmentId)) {
      throw new ValidationError("Tất cả item bị bỏ qua phải có lý do");
    }

    const now = new Date().toISOString();
    const skippedCount = await repo.countItemsByStatus(tenantId, assessmentId, "skipped");
    const newStatus = skippedCount > 0 ? "closed_with_exceptions" : "completed";

    const revisionNo = await repo.getNextRevisionNo(tenantId, assessmentId);
    await repo.createRevision({
      id: newId(),
      tenant_id: tenantId,
      assessment_id: assessmentId,
      revision_no: revisionNo,
      before_json: JSON.stringify(assessment),
      after_json: JSON.stringify({ ...assessment, status: newStatus, closed_by: userId, closed_at: now, close_note: data.close_note }),
      change_reason: "Hoàn tất assessment đau răng/nội nha",
      changed_by: userId,
      changed_at: now,
    });

    await repo.updateStatus(tenantId, assessmentId, newStatus, userId, now, data.close_note);

    const updated = await repo.getById(tenantId, assessmentId);
    return updated!;
  },

  /** Accept a draft assessment (doctor review). */
  async acceptDraft(
    db: D1Database,
    tenantId: string,
    visitId: string,
    assessmentId: string,
    reviewerId: string,
  ): Promise<ClinicalPathwayAssessment> {
    await assertFeatureEnabled(db, tenantId);
    const visit = await requireVisit(db, tenantId, visitId);
    if (visit.locked_at) throw new ConflictError("Lượt khám đã khóa");

    const repo = createClinicalPathwayAssessmentsRepository(db);
    const assessment = await repo.getById(tenantId, assessmentId);
    if (!assessment || assessment.visit_id !== visitId) throw new NotFoundError("Assessment not found");
    if (assessment.entry_source !== "assistant") throw new ConflictError("Chỉ assessment của phụ tá mới cần review");
    if (assessment.clinical_effective_at) throw new ConflictError("Assessment đã hiệu lực");

    const now = new Date().toISOString();
    await repo.markEffective(tenantId, assessmentId, reviewerId, now);

    // Update the review event
    const events = createClinicalReviewEventsRepository(db);
    const pendingEvent = await events.getPending(tenantId, visitId, "pathway_assessment", assessmentId);
    if (pendingEvent) {
      await events.updateStatus(tenantId, pendingEvent.id, "accepted", reviewerId, now);
    }

    const updated = await repo.getById(tenantId, assessmentId);
    return updated!;
  },

  /** Reject a draft assessment (doctor review). */
  async rejectDraft(
    db: D1Database,
    tenantId: string,
    visitId: string,
    assessmentId: string,
    reviewerId: string,
    reason: string,
  ): Promise<void> {
    await assertFeatureEnabled(db, tenantId);
    const visit = await requireVisit(db, tenantId, visitId);
    if (visit.locked_at) throw new ConflictError("Lượt khám đã khóa");

    const repo = createClinicalPathwayAssessmentsRepository(db);
    const assessment = await repo.getById(tenantId, assessmentId);
    if (!assessment || assessment.visit_id !== visitId) throw new NotFoundError("Assessment not found");

    const now = new Date().toISOString();
    const events = createClinicalReviewEventsRepository(db);
    const pendingEvent = await events.getPending(tenantId, visitId, "pathway_assessment", assessmentId);
    if (pendingEvent) {
      await events.updateStatus(tenantId, pendingEvent.id, "rejected", reviewerId, now, reason);
    }
  },

  /** List assessments pending review for a visit (assistant drafts). */
  async listPendingReview(
    db: D1Database,
    tenantId: string,
    visitId: string,
  ): Promise<PathwayAssessmentResponse[]> {
    await assertFeatureEnabled(db, tenantId);
    const repo = createClinicalPathwayAssessmentsRepository(db);
    const pending = await repo.listPendingReviewByVisit(tenantId, visitId);
    return Promise.all(pending.map((a) => enrichAssessment(db, tenantId, a)));
  },

  /** Get metrics for a tenant (aggregate, no PII). */
  async getMetrics(db: D1Database, tenantId: string) {
    await assertFeatureEnabled(db, tenantId);
    // Use direct D1 query for aggregate metrics
    const row = await db.prepare(
      `SELECT
         COUNT(*) as total,
         SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as active_count,
         SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed_count,
         SUM(CASE WHEN status = 'closed_with_exceptions' THEN 1 ELSE 0 END) as exceptions_count
       FROM clinical_pathway_assessments
       WHERE tenant_id = ? AND pathway_key = ?`,
    ).bind(tenantId, PATHWAY_KEY).first<{
      total: number;
      active_count: number;
      completed_count: number;
      exceptions_count: number;
    }>();

    const total = row?.total ?? 0;
    const completed = row?.completed_count ?? 0;
    const exceptions = row?.exceptions_count ?? 0;

    return {
      pathway_key: PATHWAY_KEY,
      pathway_version: PATHWAY_VERSION,
      activated: total,
      active: row?.active_count ?? 0,
      completed,
      closed_with_exceptions: exceptions,
      completion_rate: total > 0 ? (completed + exceptions) / total : null,
    };
  },
};

// ── Helpers ──

async function requireVisit(db: D1Database, tenantId: string, visitId: string) {
  const visit = await createVisitsRepository(db).getById(tenantId, visitId);
  if (!visit) throw new NotFoundError("Visit not found");
  return visit;
}

async function assertFeatureEnabled(db: D1Database, tenantId: string): Promise<void> {
  if (!await clinicalPathwayService.isFeatureEnabled(db, tenantId)) {
    throw new NotFoundError("Clinical Copilot nội nha chưa được bật cho phòng khám này");
  }
}

function assertDraftableVisit(visit: { locked_at?: string; clinical_state: string }): void {
  if (visit.locked_at || ["signed", "amended", "cancelled"].includes(visit.clinical_state)) {
    throw new ConflictError("Lượt khám đã khóa hoặc không còn nhận thao tác");
  }
}

async function enrichAssessment(
  db: D1Database,
  tenantId: string,
  assessment: ClinicalPathwayAssessment,
): Promise<PathwayAssessmentResponse> {
  const repo = createClinicalPathwayAssessmentsRepository(db);
  const items = await repo.listItemsByAssessment(tenantId, assessment.id);
  let parsedPayload: EndodonticPainAssessmentPayload = defaultAssessmentPayload();
  try {
    const parsed = JSON.parse(assessment.assessment_json) as Partial<EndodonticPainAssessmentPayload>;
    if (parsed.symptoms && parsed.tests && parsed.context) parsedPayload = parsed as EndodonticPainAssessmentPayload;
  } catch {
    // Legacy or incomplete drafts must not make the copilot endpoint fail.
  }
  const patterns = evaluatePatterns(parsedPayload, assessment.tooth_number);
  return { assessment, items, patterns };
}

function defaultAssessmentPayload(): EndodonticPainAssessmentPayload {
  return {
    symptoms: { spontaneous_pain: "unknown", pain_on_biting: "unknown", prolonged_pain_after_stimulus: "unknown" },
    tests: { cold_test: "not_done", percussion: "not_done", palpation: "not_done", bite_test: "not_done" },
    context: { large_caries: "unknown", deep_old_restoration: "unknown", periapical_signs_on_imaging: "not_assessed" },
  };
}
