import type { D1Database } from "@cloudflare/workers-types";
import type { ClinicalReviewEntityType, ClinicalReviewEvent, ClinicalReviewStatus } from "@shared/types";
import type { D1Row } from "./base";

export function createClinicalReviewEventsRepository(db: D1Database) {
  return {
    async create(event: ClinicalReviewEvent): Promise<ClinicalReviewEvent> {
      await db.prepare(`INSERT INTO clinical_review_events
        (id, tenant_id, visit_id, entity_type, entity_id, review_status, entered_by, reviewed_by, reviewed_at, review_note, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .bind(
          event.id, event.tenant_id, event.visit_id, event.entity_type, event.entity_id,
          event.review_status, event.entered_by, event.reviewed_by ?? null, event.reviewed_at ?? null,
          event.review_note ?? null, event.created_at,
        ).run();
      return event;
    },

    async listPendingByVisit(tenantId: string, visitId: string): Promise<ClinicalReviewEvent[]> {
      const result = await db.prepare(`SELECT * FROM clinical_review_events
        WHERE tenant_id = ? AND visit_id = ? AND review_status = 'pending'
        ORDER BY created_at ASC`).bind(tenantId, visitId).all<D1Row>();
      return result.results.map(mapReviewEvent);
    },

    async getPending(
      tenantId: string,
      visitId: string,
      entityType: ClinicalReviewEntityType,
      entityId: string,
    ): Promise<ClinicalReviewEvent | null> {
      const row = await db.prepare(`SELECT * FROM clinical_review_events
        WHERE tenant_id = ? AND visit_id = ? AND entity_type = ? AND entity_id = ? AND review_status = 'pending'
        ORDER BY created_at DESC LIMIT 1`).bind(tenantId, visitId, entityType, entityId).first<D1Row>();
      return row ? mapReviewEvent(row) : null;
    },

    async updateStatus(
      tenantId: string,
      id: string,
      status: ClinicalReviewStatus,
      reviewerId: string,
      reviewedAt: string,
      reviewNote?: string,
    ): Promise<boolean> {
      const result = await db.prepare(`UPDATE clinical_review_events
        SET review_status = ?, reviewed_by = ?, reviewed_at = ?, review_note = ?
        WHERE tenant_id = ? AND id = ? AND review_status = 'pending'`)
        .bind(status, reviewerId, reviewedAt, reviewNote ?? null, tenantId, id).run();
      return result.meta.changes > 0;
    },
  };
}

function mapReviewEvent(row: D1Row): ClinicalReviewEvent {
  return {
    id: row.id as string,
    tenant_id: row.tenant_id as string,
    visit_id: row.visit_id as string,
    entity_type: row.entity_type as ClinicalReviewEntityType,
    entity_id: row.entity_id as string,
    review_status: row.review_status as ClinicalReviewStatus,
    entered_by: row.entered_by as string,
    reviewed_by: optional(row, "reviewed_by"),
    reviewed_at: optional(row, "reviewed_at"),
    review_note: optional(row, "review_note"),
    created_at: row.created_at as string,
  };
}

function optional(row: D1Row, key: string): string | undefined {
  const value = row[key];
  return typeof value === "string" && value ? value : undefined;
}
