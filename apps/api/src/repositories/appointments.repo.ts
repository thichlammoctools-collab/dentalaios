import type { D1Database } from "@cloudflare/workers-types";
import type { Appointment } from "@shared/types";
import type { D1Row, Pagination } from "./base";
import { CHAIR_PREPARATION_MINUTES } from "../lib/appointment-time";

export interface AppointmentListOpts extends Pagination {
  branchId?: string;
  clinicianId?: string;
  patientId?: string;
  from?: string;  // ISO datetime
  to?: string;    // ISO datetime
  status?: Appointment["status"];
}

export interface AppointmentsRepository {
  list(tenantId: string, opts?: AppointmentListOpts): Promise<Appointment[]>;
  getById(tenantId: string, id: string): Promise<Appointment | null>;
  create(
    tenantId: string,
    data: Omit<Appointment, "id" | "tenant_id" | "created_at" | "updated_at">,
  ): Promise<Appointment | null>;
  update(
    tenantId: string,
    id: string,
    data: Partial<Omit<Appointment, "assistant_id" | "chair_id">> & {
      assistant_id?: string | null;
      chair_id?: string | null;
    },
  ): Promise<Appointment | null>;
  /**
   * Find appointments that overlap with [startISO, endISO) for a clinician.
   * Used for conflict detection — excludes cancelled / no_show.
   * Pass excludeId when rescheduling to ignore the row being moved.
   */
  findConflicts(
    tenantId: string,
    clinicianId: string,
    startISO: string,
    endISO: string,
    excludeId?: string,
  ): Promise<Appointment[]>;
  findPatientConflicts(
    tenantId: string,
    patientId: string,
    startISO: string,
    endISO: string,
    excludeId?: string,
  ): Promise<Appointment[]>;
  findChairConflicts(
    tenantId: string,
    chairId: string,
    startISO: string,
    endISO: string,
    excludeId?: string,
  ): Promise<Appointment[]>;
}

export function createAppointmentsRepository(db: D1Database): AppointmentsRepository {
  return {
    async list(tenantId, opts = {}) {
      const limit = Math.min(opts.limit ?? 100, 500);
      const offset = opts.offset ?? 0;
      const conditions: string[] = [`a.tenant_id = ?`];
      const binds: unknown[] = [tenantId];

      if (opts.branchId) {
        conditions.push("a.branch_id = ?");
        binds.push(opts.branchId);
      }
      if (opts.clinicianId) {
        conditions.push("a.clinician_id = ?");
        binds.push(opts.clinicianId);
      }
      if (opts.patientId) {
        conditions.push("a.patient_id = ?");
        binds.push(opts.patientId);
      }
      if (opts.from) {
        conditions.push("a.scheduled_at >= ?");
        binds.push(opts.from);
      }
      if (opts.to) {
        conditions.push("a.scheduled_at < ?");
        binds.push(opts.to);
      }
      if (opts.status) {
        conditions.push("a.status = ?");
        binds.push(opts.status);
      }
      binds.push(limit, offset);
      const sql = `SELECT a.* FROM appointments a
                   WHERE ${conditions.join(" AND ")}
                   ORDER BY a.scheduled_at ASC LIMIT ? OFFSET ?`;
      const result = await db.prepare(sql).bind(...binds).all();
      return (result.results as D1Row[]).map(mapAppointment);
    },

    async getById(tenantId, id) {
      const row = (await db
        .prepare(`SELECT * FROM appointments WHERE tenant_id = ? AND id = ? LIMIT 1`)
        .bind(tenantId, id)
        .first()) as D1Row | null;
      return row ? mapAppointment(row) : null;
    },

    async create(tenantId, data) {
      const id = crypto.randomUUID();
      const start = data.scheduled_at;
      const end = new Date(start);
      end.setMinutes(end.getMinutes() + data.duration_min);

      // The preflight SELECT in the service offers a friendly 409 message,
      // but it is inherently racy. Repeat the overlap predicate inside the
      // INSERT itself: under concurrent requests only the request whose
      // condition still holds writes a row.
      const result = await db
        .prepare(
          `INSERT INTO appointments
              (id, tenant_id, branch_id, clinician_id, patient_id, assistant_id, chair_id,
               source_visit_id, scheduled_at, duration_min, status, procedure, notes,
               source, lark_event_id, reminder_sent_at, reminder_method, cancelled_reason, created_by)
           SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
           WHERE NOT EXISTS (
             SELECT 1 FROM appointments
             WHERE tenant_id = ?
               AND clinician_id = ?
               AND status NOT IN ('cancelled', 'no_show')
               AND scheduled_at < ?
               AND datetime(scheduled_at, '+' || duration_min || ' minutes') > ?
             ) AND NOT EXISTS (
              SELECT 1 FROM appointments
              WHERE tenant_id = ?
                AND patient_id = ?
                AND status NOT IN ('cancelled', 'no_show')
                AND scheduled_at < ?
                AND datetime(scheduled_at, '+' || duration_min || ' minutes') > ?
             ) AND (
              ? IS NULL OR NOT EXISTS (
                SELECT 1 FROM appointments
                WHERE tenant_id = ?
                  AND chair_id = ?
                  AND status NOT IN ('cancelled', 'no_show')
                  AND scheduled_at < datetime(?, '+' || ? || ' minutes')
                  AND datetime(scheduled_at, '+' || (duration_min + ?) || ' minutes') > ?
              )
            )`,
        )
        .bind(
          id,
          tenantId,
          data.branch_id,
          data.clinician_id,
          data.patient_id,
          data.assistant_id ?? null,
          data.chair_id ?? null,
          data.source_visit_id ?? null,
          data.scheduled_at,
          data.duration_min,
          data.status,
          data.procedure ?? null,
          data.notes ?? null,
          data.source,
          data.lark_event_id ?? null,
          data.reminder_sent_at ?? null,
          data.reminder_method ?? null,
          data.cancelled_reason ?? null,
          data.created_by,
          tenantId,
          data.clinician_id,
          end.toISOString(),
          start,
          tenantId,
          data.patient_id,
          end.toISOString(),
          start,
          data.chair_id ?? null,
          tenantId,
          data.chair_id ?? null,
          end.toISOString(),
          CHAIR_PREPARATION_MINUTES,
          CHAIR_PREPARATION_MINUTES,
          start,
        )
        .run();
      if (result.meta.changes === 0) return null;
      const created = await this.getById(tenantId, id);
      if (!created) throw new Error("Insert succeeded but read failed");
      return created;
    },

    async update(tenantId, id, data) {
      const fields: string[] = [];
      const binds: unknown[] = [];
      const allowed = [
        "status",
        "scheduled_at",
        "duration_min",
        "clinician_id",
        "assistant_id",
        "chair_id",
        "procedure",
        "notes",
        "cancelled_reason",
        "lark_event_id",
        "reminder_sent_at",
        "reminder_method",
      ] as const;
      for (const key of allowed) {
        if (data[key] !== undefined) {
          fields.push(`${key} = ?`);
          binds.push(data[key] ?? null);
        }
      }
      if (fields.length === 0) return this.getById(tenantId, id);
      fields.push("updated_at = datetime('now')");
      binds.push(tenantId, id);
      await db
        .prepare(`UPDATE appointments SET ${fields.join(", ")} WHERE tenant_id = ? AND id = ?`)
        .bind(...binds)
        .run();
      return this.getById(tenantId, id);
    },

    async findConflicts(tenantId, clinicianId, startISO, endISO, excludeId) {
      const conditions = [
        "tenant_id = ?",
        "clinician_id = ?",
        "status NOT IN ('cancelled', 'no_show')",
        // overlap: existing.scheduled_at < new_end AND existing_end > new_start
        "scheduled_at < ?",
        `datetime(scheduled_at, '+' || duration_min || ' minutes') > ?`,
      ];
      const binds: unknown[] = [tenantId, clinicianId, endISO, startISO];
      if (excludeId) {
        conditions.push("id != ?");
        binds.push(excludeId);
      }
      const sql = `SELECT * FROM appointments
                   WHERE ${conditions.join(" AND ")}
                   LIMIT 5`;
      const result = await db.prepare(sql).bind(...binds).all();
      return (result.results as D1Row[]).map(mapAppointment);
    },

    async findChairConflicts(tenantId, chairId, startISO, endISO, excludeId) {
      const conditions = [
        "tenant_id = ?",
        "chair_id = ?",
        "status NOT IN ('cancelled', 'no_show')",
        "scheduled_at < datetime(?, '+' || ? || ' minutes')",
        `datetime(scheduled_at, '+' || (duration_min + ?) || ' minutes') > ?`,
      ];
      const binds: unknown[] = [tenantId, chairId, endISO, CHAIR_PREPARATION_MINUTES, CHAIR_PREPARATION_MINUTES, startISO];
      if (excludeId) {
        conditions.push("id != ?");
        binds.push(excludeId);
      }
      const result = await db
        .prepare(`SELECT * FROM appointments WHERE ${conditions.join(" AND ")} LIMIT 5`)
        .bind(...binds)
        .all();
      return (result.results as D1Row[]).map(mapAppointment);
    },

    async findPatientConflicts(tenantId, patientId, startISO, endISO, excludeId) {
      const conditions = [
        "tenant_id = ?",
        "patient_id = ?",
        "status NOT IN ('cancelled', 'no_show')",
        "scheduled_at < ?",
        `datetime(scheduled_at, '+' || duration_min || ' minutes') > ?`,
      ];
      const binds: unknown[] = [tenantId, patientId, endISO, startISO];
      if (excludeId) {
        conditions.push("id != ?");
        binds.push(excludeId);
      }
      const result = await db
        .prepare(`SELECT * FROM appointments WHERE ${conditions.join(" AND ")} LIMIT 5`)
        .bind(...binds)
        .all();
      return (result.results as D1Row[]).map(mapAppointment);
    },
  };
}

function mapAppointment(row: D1Row): Appointment {
  return {
    id: row.id as string,
    tenant_id: row.tenant_id as string,
    branch_id: row.branch_id as string,
    clinician_id: row.clinician_id as string,
    patient_id: row.patient_id as string,
    assistant_id: (row.assistant_id as string | null) ?? undefined,
    chair_id: (row.chair_id as string | null) ?? undefined,
    source_visit_id: (row.source_visit_id as string | null) ?? undefined,
    scheduled_at: row.scheduled_at as string,
    duration_min: row.duration_min as number,
    status: row.status as Appointment["status"],
    procedure: (row.procedure as string | null) ?? undefined,
    notes: (row.notes as string | null) ?? undefined,
    source: row.source as Appointment["source"],
    lark_event_id: (row.lark_event_id as string | null) ?? undefined,
    reminder_sent_at: (row.reminder_sent_at as string | null) ?? undefined,
    reminder_method: (row.reminder_method as string | null) ?? undefined,
    cancelled_reason: (row.cancelled_reason as string | null) ?? undefined,
    created_by: row.created_by as string,
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
  };
}
