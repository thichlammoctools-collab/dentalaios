import type { D1Database } from "@cloudflare/workers-types";
import type { Appointment, AppointmentStatus } from "@shared/types";
import type { D1Row, Pagination } from "./base";

export interface AppointmentsRepository {
  list(
    tenantId: string,
    opts?: Pagination & {
      branchId?: string;
      doctorId?: string;
      from?: string;
      to?: string;
      status?: AppointmentStatus;
    },
  ): Promise<Appointment[]>;
  getById(tenantId: string, id: string): Promise<Appointment | null>;
  create(
    tenantId: string,
    data: Omit<Appointment, "id" | "tenant_id" | "created_at" | "updated_at" | "status" | "lark_event_id"> & {
      status?: AppointmentStatus;
    },
  ): Promise<Appointment>;
  update(
    tenantId: string,
    id: string,
    data: Partial<Pick<Appointment, "scheduled_at" | "duration_minutes" | "room" | "notes" | "status" | "doctor_id" | "doctor_name" | "lark_event_id">>,
  ): Promise<Appointment | null>;
  updateLarkEventId(tenantId: string, id: string, larkEventId: string): Promise<void>;
  delete(tenantId: string, id: string): Promise<void>;
}

export function createAppointmentsRepository(db: D1Database): AppointmentsRepository {
  return {
    async list(tenantId, opts = {}) {
      const limit = Math.min(opts.limit ?? 500, 1000);
      const offset = opts.offset ?? 0;
      const conditions = ["a.tenant_id = ?"];
      const binds: unknown[] = [tenantId];

      if (opts.branchId) {
        conditions.push("a.branch_id = ?");
        binds.push(opts.branchId);
      }
      if (opts.doctorId) {
        conditions.push("a.doctor_id = ?");
        binds.push(opts.doctorId);
      }
      if (opts.from) {
        conditions.push("a.scheduled_at >= ?");
        binds.push(opts.from);
      }
      if (opts.to) {
        conditions.push("a.scheduled_at <= ?");
        binds.push(opts.to);
      }
      if (opts.status) {
        conditions.push("a.status = ?");
        binds.push(opts.status);
      }

      binds.push(limit, offset);
      const sql = `
        SELECT a.*,
               p.name AS patient_name,
               p.phone AS patient_phone,
               b.name AS branch_name
        FROM appointments a
        LEFT JOIN patients p ON p.id = a.patient_id
        LEFT JOIN branches b ON b.id = a.branch_id
        WHERE ${conditions.join(" AND ")}
        ORDER BY a.scheduled_at ASC
        LIMIT ? OFFSET ?`;

      const result = await db.prepare(sql).bind(...binds).all();
      return (result.results as D1Row[]).map(mapAppointment);
    },

    async getById(tenantId, id) {
      const row = (await db
        .prepare(`
          SELECT a.*,
                 p.name AS patient_name,
                 p.phone AS patient_phone,
                 b.name AS branch_name
          FROM appointments a
          LEFT JOIN patients p ON p.id = a.patient_id
          LEFT JOIN branches b ON b.id = a.branch_id
          WHERE a.tenant_id = ? AND a.id = ? LIMIT 1`)
        .bind(tenantId, id)
        .first()) as D1Row | null;
      return row ? mapAppointment(row) : null;
    },

    async create(tenantId, data) {
      const id = crypto.randomUUID();
      await db
        .prepare(`
          INSERT INTO appointments
            (id, tenant_id, patient_id, branch_id, doctor_id, doctor_name,
             scheduled_at, duration_minutes, room, notes, status, created_by)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .bind(
          id, tenantId,
          data.patient_id, data.branch_id,
          data.doctor_id ?? null, data.doctor_name ?? null,
          data.scheduled_at, data.duration_minutes,
          data.room ?? null, data.notes ?? null,
          data.status ?? "scheduled", data.created_by,
        )
        .run();
      const created = await this.getById(tenantId, id);
      if (!created) throw new Error("Insert succeeded but read failed");
      return created;
    },

    async update(tenantId, id, data) {
      const fields: string[] = ["updated_at = datetime('now')"];
      const binds: unknown[] = [];

      if (data.scheduled_at !== undefined) { fields.push("scheduled_at = ?"); binds.push(data.scheduled_at); }
      if (data.duration_minutes !== undefined) { fields.push("duration_minutes = ?"); binds.push(data.duration_minutes); }
      if (data.room !== undefined) { fields.push("room = ?"); binds.push(data.room ?? null); }
      if (data.notes !== undefined) { fields.push("notes = ?"); binds.push(data.notes ?? null); }
      if (data.status !== undefined) { fields.push("status = ?"); binds.push(data.status); }
      if (data.doctor_id !== undefined) { fields.push("doctor_id = ?"); binds.push(data.doctor_id ?? null); }
      if (data.doctor_name !== undefined) { fields.push("doctor_name = ?"); binds.push(data.doctor_name ?? null); }
      if (data.lark_event_id !== undefined) { fields.push("lark_event_id = ?"); binds.push(data.lark_event_id ?? null); }

      if (fields.length === 1) return this.getById(tenantId, id);
      binds.push(tenantId, id);
      await db
        .prepare(`UPDATE appointments SET ${fields.join(", ")} WHERE tenant_id = ? AND id = ?`)
        .bind(...binds)
        .run();
      return this.getById(tenantId, id);
    },

    async updateLarkEventId(tenantId, id, larkEventId) {
      await db
        .prepare(`UPDATE appointments SET lark_event_id = ?, updated_at = datetime('now') WHERE tenant_id = ? AND id = ?`)
        .bind(larkEventId, tenantId, id)
        .run();
    },

    async delete(tenantId, id) {
      await db
        .prepare(`DELETE FROM appointments WHERE tenant_id = ? AND id = ?`)
        .bind(tenantId, id)
        .run();
    },
  };
}

function mapAppointment(row: D1Row): Appointment {
  return {
    id: row.id as string,
    tenant_id: row.tenant_id as string,
    patient_id: row.patient_id as string,
    branch_id: row.branch_id as string,
    doctor_id: (row.doctor_id as string | null) ?? undefined,
    doctor_name: (row.doctor_name as string | null) ?? undefined,
    scheduled_at: row.scheduled_at as string,
    duration_minutes: row.duration_minutes as number,
    room: (row.room as string | null) ?? undefined,
    notes: (row.notes as string | null) ?? undefined,
    status: row.status as AppointmentStatus,
    lark_event_id: (row.lark_event_id as string | null) ?? undefined,
    created_by: row.created_by as string,
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
    patient_name: (row.patient_name as string | null) ?? undefined,
    patient_phone: (row.patient_phone as string | null) ?? undefined,
    branch_name: (row.branch_name as string | null) ?? undefined,
  };
}
