import type { D1Database } from "@cloudflare/workers-types";
import type { AuditLog } from "@shared/types";
import type { D1Row } from "./base";

export interface AuditLogsRepository {
  list(
    tenantId: string,
    opts?: {
      userId?: string;
      action?: string;
      entityType?: string;
      limit?: number;
      offset?: number;
    },
  ): Promise<AuditLog[]>;
}

export function createAuditLogsRepository(db: D1Database): AuditLogsRepository {
  return {
    async list(tenantId, opts = {}) {
      const conditions = ["tenant_id = ?"];
      const binds: unknown[] = [tenantId];
      if (opts.userId) {
        conditions.push("user_id = ?");
        binds.push(opts.userId);
      }
      if (opts.action) {
        conditions.push("action = ?");
        binds.push(opts.action);
      }
      if (opts.entityType) {
        conditions.push("entity_type = ?");
        binds.push(opts.entityType);
      }
      binds.push(Math.min(opts.limit ?? 100, 500));
      binds.push(opts.offset ?? 0);
      const sql = `SELECT * FROM audit_logs WHERE ${conditions.join(" AND ")}
                   ORDER BY created_at DESC LIMIT ? OFFSET ?`;
      const result = await db.prepare(sql).bind(...binds).all();
      return (result.results as D1Row[]).map(mapLog);
    },
  };
}

function mapLog(row: D1Row): AuditLog {
  return {
    id: row.id as string,
    tenant_id: row.tenant_id as string,
    user_id: row.user_id as string,
    action: row.action as string,
    entity_type: row.entity_type as string,
    entity_id: row.entity_id as string,
    details: (row.details as string | null) ?? undefined,
    ip_address: row.ip_address as string,
    created_at: row.created_at as string,
  };
}