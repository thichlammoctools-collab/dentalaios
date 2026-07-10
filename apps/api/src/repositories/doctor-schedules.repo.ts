import type { D1Database } from "@cloudflare/workers-types";
import type { DoctorSchedule } from "@shared/types";
import type { D1Row } from "./base";

export interface DoctorScheduleEntry {
  weekday: number;
  start_time: string;
  end_time: string;
  slot_minutes: number;
}

export interface DoctorSchedulesRepository {
  listByDoctor(tenantId: string, branchId: string, doctorId: string): Promise<DoctorSchedule[]>;
  listByDoctorId(tenantId: string, doctorId: string): Promise<DoctorSchedule[]>;
  upsertBulk(
    tenantId: string,
    branchId: string,
    doctorId: string,
    entries: DoctorScheduleEntry[],
  ): Promise<void>;
}

export function createDoctorSchedulesRepository(db: D1Database): DoctorSchedulesRepository {
  return {
    async listByDoctor(tenantId, branchId, doctorId) {
      const result = await db
        .prepare(
          `SELECT * FROM doctor_schedules
           WHERE tenant_id = ? AND branch_id = ? AND doctor_id = ?
           ORDER BY weekday ASC`,
        )
        .bind(tenantId, branchId, doctorId)
        .all();
      return (result.results as D1Row[]).map(mapDoctorSchedule);
    },

    async listByDoctorId(tenantId, doctorId) {
      const result = await db
        .prepare(
          `SELECT * FROM doctor_schedules
           WHERE tenant_id = ? AND doctor_id = ?
           ORDER BY branch_id, weekday ASC`,
        )
        .bind(tenantId, doctorId)
        .all();
      return (result.results as D1Row[]).map(mapDoctorSchedule);
    },

    async upsertBulk(tenantId, branchId, doctorId, entries) {
      // Delete existing entries for this doctor in this branch, then insert new ones
      await db
        .prepare(
          `DELETE FROM doctor_schedules
           WHERE tenant_id = ? AND branch_id = ? AND doctor_id = ?`,
        )
        .bind(tenantId, branchId, doctorId)
        .run();

      for (const entry of entries) {
        await db
          .prepare(
            `INSERT INTO doctor_schedules
               (id, tenant_id, branch_id, doctor_id, weekday, start_time, end_time, slot_minutes)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .bind(
            crypto.randomUUID(),
            tenantId,
            branchId,
            doctorId,
            entry.weekday,
            entry.start_time,
            entry.end_time,
            entry.slot_minutes,
          )
          .run();
      }
    },
  };
}

function mapDoctorSchedule(row: D1Row): DoctorSchedule {
  return {
    id: row.id as string,
    tenant_id: row.tenant_id as string,
    branch_id: row.branch_id as string,
    doctor_id: row.doctor_id as string,
    weekday: row.weekday as number,
    start_time: row.start_time as string,
    end_time: row.end_time as string,
    slot_minutes: row.slot_minutes as number,
    created_at: row.created_at as string,
  };
}