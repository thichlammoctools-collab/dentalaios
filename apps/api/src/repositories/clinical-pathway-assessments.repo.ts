import type { D1Database } from "@cloudflare/workers-types";
import type { ClinicalPathwayAssessment, ClinicalPathwayAssessmentItem, ClinicalPathwayAssessmentRevision, PathwayAssessmentStatus, PathwayItemStatus } from "@shared/types";
import type { D1Row } from "./base";

function optional(row: D1Row, key: string): string | undefined {
  const value = row[key];
  return typeof value === "string" && value ? value : undefined;
}

function mapAssessment(row: D1Row): ClinicalPathwayAssessment {
  return {
    id: row.id as string,
    tenant_id: row.tenant_id as string,
    visit_id: row.visit_id as string,
    tooth_number: row.tooth_number as number,
    pathway_key: row.pathway_key as ClinicalPathwayAssessment["pathway_key"],
    pathway_version: row.pathway_version as string,
    status: row.status as PathwayAssessmentStatus,
    assessment_json: row.assessment_json as string,
    entry_source: row.entry_source as ClinicalPathwayAssessment["entry_source"],
    entered_by: row.entered_by as string,
    clinical_effective_at: optional(row, "clinical_effective_at"),
    reviewed_by: optional(row, "reviewed_by"),
    reviewed_at: optional(row, "reviewed_at"),
    closed_by: optional(row, "closed_by"),
    closed_at: optional(row, "closed_at"),
    close_note: optional(row, "close_note"),
    current_revision: row.current_revision as number,
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
  };
}

function mapItem(row: D1Row): ClinicalPathwayAssessmentItem {
  return {
    id: row.id as string,
    tenant_id: row.tenant_id as string,
    assessment_id: row.assessment_id as string,
    item_key: row.item_key as string,
    item_version: row.item_version as number,
    status: row.status as PathwayItemStatus,
    value_json: optional(row, "value_json"),
    skip_reason: optional(row, "skip_reason"),
    completed_by: optional(row, "completed_by"),
    completed_at: optional(row, "completed_at"),
    updated_at: row.updated_at as string,
  };
}

function mapRevision(row: D1Row): ClinicalPathwayAssessmentRevision {
  return {
    id: row.id as string,
    tenant_id: row.tenant_id as string,
    assessment_id: row.assessment_id as string,
    revision_no: row.revision_no as number,
    before_json: row.before_json as string,
    after_json: row.after_json as string,
    change_reason: row.change_reason as string,
    changed_by: row.changed_by as string,
    changed_at: row.changed_at as string,
  };
}

export function createClinicalPathwayAssessmentsRepository(db: D1Database) {
  return {
    // ── Assessments ──

    async getActiveByTooth(
      tenantId: string,
      visitId: string,
      pathwayKey: string,
      toothNumber: number,
    ): Promise<ClinicalPathwayAssessment | null> {
      const row = await db.prepare(
        `SELECT * FROM clinical_pathway_assessments
         WHERE tenant_id = ? AND visit_id = ? AND pathway_key = ? AND tooth_number = ? AND status = 'active'
         LIMIT 1`,
      ).bind(tenantId, visitId, pathwayKey, toothNumber).first<D1Row>();
      return row ? mapAssessment(row) : null;
    },

    async getById(tenantId: string, id: string): Promise<ClinicalPathwayAssessment | null> {
      const row = await db.prepare(
        "SELECT * FROM clinical_pathway_assessments WHERE tenant_id = ? AND id = ? LIMIT 1",
      ).bind(tenantId, id).first<D1Row>();
      return row ? mapAssessment(row) : null;
    },

    async listByVisit(tenantId: string, visitId: string): Promise<ClinicalPathwayAssessment[]> {
      const result = await db.prepare(
        `SELECT * FROM clinical_pathway_assessments
         WHERE tenant_id = ? AND visit_id = ?
         ORDER BY tooth_number, created_at`,
      ).bind(tenantId, visitId).all<D1Row>();
      return result.results.map(mapAssessment);
    },

    async listActiveByVisit(tenantId: string, visitId: string, pathwayKey: string): Promise<ClinicalPathwayAssessment[]> {
      const result = await db.prepare(
        `SELECT * FROM clinical_pathway_assessments
         WHERE tenant_id = ? AND visit_id = ? AND pathway_key = ? AND status = 'active'
         ORDER BY tooth_number`,
      ).bind(tenantId, visitId, pathwayKey).all<D1Row>();
      return result.results.map(mapAssessment);
    },

    async listPendingReviewByVisit(tenantId: string, visitId: string): Promise<ClinicalPathwayAssessment[]> {
      const result = await db.prepare(
        `SELECT * FROM clinical_pathway_assessments
         WHERE tenant_id = ? AND visit_id = ? AND entry_source = 'assistant' AND clinical_effective_at IS NULL AND status = 'active'
         ORDER BY tooth_number`,
      ).bind(tenantId, visitId).all<D1Row>();
      return result.results.map(mapAssessment);
    },

    async create(data: ClinicalPathwayAssessment): Promise<ClinicalPathwayAssessment> {
      await db.prepare(
        `INSERT INTO clinical_pathway_assessments
         (id, tenant_id, visit_id, tooth_number, pathway_key, pathway_version, status, assessment_json,
          entry_source, entered_by, clinical_effective_at, current_revision, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(
        data.id, data.tenant_id, data.visit_id, data.tooth_number, data.pathway_key, data.pathway_version,
        data.status, data.assessment_json, data.entry_source, data.entered_by,
        data.clinical_effective_at ?? null, data.current_revision, data.created_at, data.updated_at,
      ).run();
      return data;
    },

    async updateStatus(
      tenantId: string,
      id: string,
      status: PathwayAssessmentStatus,
      userId: string,
      now: string,
      closeNote?: string,
    ): Promise<boolean> {
      let sql: string;
      let bindValues: unknown[];
      if (status === "completed" || status === "closed_with_exceptions") {
        sql = `UPDATE clinical_pathway_assessments
               SET status = ?, closed_by = ?, closed_at = ?, close_note = ?, updated_at = ?
               WHERE tenant_id = ? AND id = ? AND status = 'active'`;
        bindValues = [status, userId, now, closeNote ?? null, now, tenantId, id];
      } else {
        sql = `UPDATE clinical_pathway_assessments
               SET status = ?, updated_at = ?
               WHERE tenant_id = ? AND id = ?`;
        bindValues = [status, now, tenantId, id];
      }
      const result = await db.prepare(sql).bind(...bindValues).run();
      return result.meta.changes > 0;
    },

    async markEffective(
      tenantId: string,
      id: string,
      reviewerId: string,
      now: string,
    ): Promise<boolean> {
      const result = await db.prepare(
        `UPDATE clinical_pathway_assessments
         SET clinical_effective_at = ?, reviewed_by = ?, reviewed_at = ?, updated_at = ?
         WHERE tenant_id = ? AND id = ?`,
      ).bind(now, reviewerId, now, now, tenantId, id).run();
      return result.meta.changes > 0;
    },

    async updateAssessmentJson(
      tenantId: string,
      id: string,
      assessmentJson: string,
      revisionNo: number,
      now: string,
    ): Promise<boolean> {
      const result = await db.prepare(
        `UPDATE clinical_pathway_assessments
         SET assessment_json = ?, current_revision = ?, updated_at = ?
         WHERE tenant_id = ? AND id = ?`,
      ).bind(assessmentJson, revisionNo, now, tenantId, id).run();
      return result.meta.changes > 0;
    },

    // ── Items ──

    async listItemsByAssessment(tenantId: string, assessmentId: string): Promise<ClinicalPathwayAssessmentItem[]> {
      const result = await db.prepare(
        `SELECT * FROM clinical_pathway_assessment_items
         WHERE tenant_id = ? AND assessment_id = ?
         ORDER BY item_key`,
      ).bind(tenantId, assessmentId).all<D1Row>();
      return result.results.map(mapItem);
    },

    async getItem(
      tenantId: string,
      assessmentId: string,
      itemKey: string,
      itemVersion: number,
    ): Promise<ClinicalPathwayAssessmentItem | null> {
      const row = await db.prepare(
        `SELECT * FROM clinical_pathway_assessment_items
         WHERE tenant_id = ? AND assessment_id = ? AND item_key = ? AND item_version = ?
         LIMIT 1`,
      ).bind(tenantId, assessmentId, itemKey, itemVersion).first<D1Row>();
      return row ? mapItem(row) : null;
    },

    async upsertItem(data: ClinicalPathwayAssessmentItem): Promise<ClinicalPathwayAssessmentItem> {
      await db.prepare(
        `INSERT INTO clinical_pathway_assessment_items
         (id, tenant_id, assessment_id, item_key, item_version, status, value_json, skip_reason, completed_by, completed_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(assessment_id, item_key, item_version) DO UPDATE SET
           status = excluded.status,
           value_json = excluded.value_json,
           skip_reason = excluded.skip_reason,
           completed_by = excluded.completed_by,
           completed_at = excluded.completed_at,
           updated_at = excluded.updated_at`,
      ).bind(
        data.id, data.tenant_id, data.assessment_id, data.item_key, data.item_version,
        data.status, data.value_json ?? null, data.skip_reason ?? null,
        data.completed_by ?? null, data.completed_at ?? null, data.updated_at,
      ).run();
      return data;
    },

    async countItemsByStatus(
      tenantId: string,
      assessmentId: string,
      status: PathwayItemStatus,
    ): Promise<number> {
      const row = await db.prepare(
        `SELECT COUNT(*) as cnt FROM clinical_pathway_assessment_items
         WHERE tenant_id = ? AND assessment_id = ? AND status = ?`,
      ).bind(tenantId, assessmentId, status).first<{ cnt: number }>();
      return row?.cnt ?? 0;
    },

    async hasItemsWithMissingSkipReason(tenantId: string, assessmentId: string): Promise<boolean> {
      const row = await db.prepare(
        `SELECT 1 AS present FROM clinical_pathway_assessment_items
         WHERE tenant_id = ? AND assessment_id = ? AND status = 'skipped' AND (skip_reason IS NULL OR skip_reason = '')
         LIMIT 1`,
      ).bind(tenantId, assessmentId).first<{ present: number }>();
      return Boolean(row?.present);
    },

    // ── Revisions ──

    async getNextRevisionNo(tenantId: string, assessmentId: string): Promise<number> {
      const row = await db.prepare(
        `SELECT COALESCE(MAX(revision_no), 0) + 1 AS next_no
         FROM clinical_pathway_assessment_revisions
         WHERE tenant_id = ? AND assessment_id = ?`,
      ).bind(tenantId, assessmentId).first<{ next_no: number }>();
      return row?.next_no ?? 1;
    },

    async createRevision(data: ClinicalPathwayAssessmentRevision): Promise<ClinicalPathwayAssessmentRevision> {
      await db.prepare(
        `INSERT INTO clinical_pathway_assessment_revisions
         (id, tenant_id, assessment_id, revision_no, before_json, after_json, change_reason, changed_by, changed_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(
        data.id, data.tenant_id, data.assessment_id, data.revision_no,
        data.before_json, data.after_json, data.change_reason, data.changed_by, data.changed_at,
      ).run();
      return data;
    },

    async listRevisions(tenantId: string, assessmentId: string): Promise<ClinicalPathwayAssessmentRevision[]> {
      const result = await db.prepare(
        `SELECT * FROM clinical_pathway_assessment_revisions
         WHERE tenant_id = ? AND assessment_id = ?
         ORDER BY revision_no DESC`,
      ).bind(tenantId, assessmentId).all<D1Row>();
      return result.results.map(mapRevision);
    },
  };
}
