import type { D1Database } from "@cloudflare/workers-types";
import type { ClinicSchedule } from "@shared/types";
import type { D1Row } from "./base";

export interface ClinicScheduleEntry {
  weekday: number;
  open_time: string;
  close_time: string;
  is_closed: boolean;
}

export interface ClinicSchedulesRepository {
  listByBranch(tenantId: string, branchId: string): Promise<ClinicSchedule[]>;
  upsertBulk(tenantId: string, branchId: string, entries: ClinicScheduleEntry[]): Promise<void>;
}

export function createClinicSchedulesRepository(db: D1Database): ClinicSchedulesRepository {
  return {
    async listByBranch(tenantId, branchId) {
      const result = await db
        .prepare(
          `SELECT * FROM clinic_schedules
           WHERE tenant_id = ? AND branch_id = ?
           ORDER BY weekday ASC`,
        )
        .bind(tenantId, branchId)
        .all();
      return (result.results as D1Row[]).map(mapClinicSchedule);
    },

    async upsertBulk(tenantId, branchId, entries) {
      // Use INSERT OR REPLACE — UNIQUE(tenant_id, branch_id, weekday) handles idempotency
      for (const entry of entries) {
        await db
          .prepare(
            `INSERT INTO clinic_schedules
               (id, tenant_id, branch_id, weekday, open_time, close_time, is_closed)
             VALUES (?, ?, ?, ?, ?, ?, ?)
             ON CONFLICT(tenant_id, branch_id, weekday)
             DO UPDATE SET open_time = excluded.open_time,
                           close_time = excluded.close_time,
                           is_closed = excluded.is_closed`,
          )
          .bind(
            crypto.randomUUID(),
            tenantId,
            branchId,
            entry.weekday,
            entry.open_time,
            entry.close_time,
            entry.is_closed ? 1 : 0,
          )
          .run();
      }
    },
  };
}

function mapClinicSchedule(row: D1Row): ClinicSchedule {
  return {
    id: row.id as string,
    tenant_id: row.tenant_id as string,
    branch_id: row.branch_id as string,
    weekday: row.weekday as number,
    open_time: row.open_time as string,
    close_time: row.close_time as string,
    is_closed: (row.is_closed as number) === 1,
    created_at: row.created_at as string,
  };
}