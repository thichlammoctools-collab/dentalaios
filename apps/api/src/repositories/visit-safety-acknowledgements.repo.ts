import type { D1Database } from "@cloudflare/workers-types";
import type { VisitSafetyAcknowledgement } from "@shared/types";
import type { D1Row } from "./base";

export function createVisitSafetyAcknowledgementsRepository(db: D1Database) {
  return {
    async listByVisit(tenantId: string, visitId: string): Promise<VisitSafetyAcknowledgement[]> {
      const result = await db.prepare("SELECT * FROM visit_safety_acknowledgements WHERE tenant_id = ? AND visit_id = ? ORDER BY acknowledged_at DESC")
        .bind(tenantId, visitId).all<D1Row>();
      return result.results.map(mapAcknowledgement);
    },

    async upsert(data: VisitSafetyAcknowledgement): Promise<VisitSafetyAcknowledgement> {
      await db.prepare(`INSERT INTO visit_safety_acknowledgements
        (id, tenant_id, visit_id, warning_type, outcome, reason, acknowledged_by, acknowledged_at, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(tenant_id, visit_id, warning_type) DO UPDATE SET
          outcome = excluded.outcome,
          reason = excluded.reason,
          acknowledged_by = excluded.acknowledged_by,
          acknowledged_at = excluded.acknowledged_at,
          updated_at = excluded.updated_at`)
        .bind(
          data.id, data.tenant_id, data.visit_id, data.warning_type, data.outcome, data.reason ?? null,
          data.acknowledged_by, data.acknowledged_at, data.created_at, data.updated_at,
        ).run();
      const row = await db.prepare(`SELECT * FROM visit_safety_acknowledgements
        WHERE tenant_id = ? AND visit_id = ? AND warning_type = ? LIMIT 1`)
        .bind(data.tenant_id, data.visit_id, data.warning_type).first<D1Row>();
      if (!row) throw new Error("Safety acknowledgement insert succeeded but read failed");
      return mapAcknowledgement(row);
    },
  };
}

function mapAcknowledgement(row: D1Row): VisitSafetyAcknowledgement {
  return {
    id: row.id as string,
    tenant_id: row.tenant_id as string,
    visit_id: row.visit_id as string,
    warning_type: row.warning_type as VisitSafetyAcknowledgement["warning_type"],
    outcome: row.outcome as VisitSafetyAcknowledgement["outcome"],
    reason: optional(row, "reason"),
    acknowledged_by: row.acknowledged_by as string,
    acknowledged_at: row.acknowledged_at as string,
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
  };
}

function optional(row: D1Row, key: string): string | undefined {
  const value = row[key];
  return typeof value === "string" && value ? value : undefined;
}
