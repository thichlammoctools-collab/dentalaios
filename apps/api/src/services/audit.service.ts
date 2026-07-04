import type { D1Database } from "@cloudflare/workers-types";
import type { AuditLog } from "@shared/types";
import { createAuditLogsRepository } from "../repositories/audit-logs.repo";

export const auditService = {
  list(
    db: D1Database,
    tenantId: string,
    opts: Parameters<ReturnType<typeof createAuditLogsRepository>["list"]>[1],
  ): Promise<AuditLog[]> {
    return createAuditLogsRepository(db).list(tenantId, opts);
  },
};