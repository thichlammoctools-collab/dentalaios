import type { D1Database } from "@cloudflare/workers-types";
import type { Visit } from "@shared/types";
import type { D1Row, Pagination } from "./base";

export interface VisitsRepository {
  list(tenantId: string, opts?: Pagination & { patientId?: string; branchId?: string; status?: Visit["status"] }): Promise<Visit[]>;
  getById(tenantId: string, id: string): Promise<Visit | null>;
  getBySourceAppointmentId(tenantId: string, sourceAppointmentId: string): Promise<Visit | null>;
  create(tenantId: string, data: Omit<Visit, "id" | "tenant_id" | "created_at" | "status">): Promise<Visit>;
  update(
    tenantId: string,
    id: string,
    data: Partial<Omit<Visit, "chair_id">> & { chair_id?: string | null },
  ): Promise<Visit | null>;
}

export function createVisitsRepository(db: D1Database): VisitsRepository {
  return {
    async list(tenantId, opts = {}) {
      const limit = Math.min(opts.limit ?? 100, 500);
      const offset = opts.offset ?? 0;
      const conditions = ["v.tenant_id = ?"];
      const binds: unknown[] = [tenantId];
      if (opts.patientId) {
        conditions.push("v.patient_id = ?");
        binds.push(opts.patientId);
      }
      if (opts.branchId) {
        conditions.push("v.branch_id = ?");
        binds.push(opts.branchId);
      }
      if (opts.status) {
        conditions.push("v.status = ?");
        binds.push(opts.status);
      }
      binds.push(limit, offset);
      const sql = `SELECT v.*,
                    tc.name AS treating_clinician_name,
                    tc.avatar_file_id AS treating_clinician_avatar_file_id,
                    a.name AS assistant_name,
                    a.avatar_file_id AS assistant_avatar_file_id,
                    dc.name AS chair_name,
                    dr.name AS chair_room_name,
                    b.name AS branch_name
                   FROM visits v
                   LEFT JOIN branches b ON b.id = v.branch_id AND b.tenant_id = v.tenant_id
                   LEFT JOIN users tc ON tc.id = v.treating_clinician_id
                   LEFT JOIN users a ON a.id = v.assistant_id
                   LEFT JOIN dental_chairs dc ON dc.id = v.chair_id AND dc.tenant_id = v.tenant_id
                   LEFT JOIN dental_rooms dr ON dr.id = dc.room_id AND dr.tenant_id = v.tenant_id
                   WHERE ${conditions.join(" AND ")}
                   ORDER BY v.date DESC LIMIT ? OFFSET ?`;
      const result = await db.prepare(sql).bind(...binds).all();
      return (result.results as D1Row[]).map(mapVisit);
    },

    async getById(tenantId, id) {
      const row = (await db
        .prepare(`SELECT v.*,
                    tc.name AS treating_clinician_name,
                    tc.avatar_file_id AS treating_clinician_avatar_file_id,
                    a.name AS assistant_name,
                    a.avatar_file_id AS assistant_avatar_file_id,
                    dc.name AS chair_name,
                    dr.name AS chair_room_name,
                    b.name AS branch_name
                   FROM visits v
                   LEFT JOIN branches b ON b.id = v.branch_id AND b.tenant_id = v.tenant_id
                   LEFT JOIN users tc ON tc.id = v.treating_clinician_id
                   LEFT JOIN users a ON a.id = v.assistant_id
                   LEFT JOIN dental_chairs dc ON dc.id = v.chair_id AND dc.tenant_id = v.tenant_id
                   LEFT JOIN dental_rooms dr ON dr.id = dc.room_id AND dr.tenant_id = v.tenant_id
                   WHERE v.tenant_id = ? AND v.id = ? LIMIT 1`)
        .bind(tenantId, id)
        .first()) as D1Row | null;
      return row ? mapVisit(row) : null;
    },

    async getBySourceAppointmentId(tenantId, sourceAppointmentId) {
      const row = (await db
        .prepare(`SELECT v.*, tc.name AS treating_clinician_name, tc.avatar_file_id AS treating_clinician_avatar_file_id,
                    a.name AS assistant_name, a.avatar_file_id AS assistant_avatar_file_id,
                    dc.name AS chair_name, dr.name AS chair_room_name, b.name AS branch_name
                  FROM visits v
                  LEFT JOIN branches b ON b.id = v.branch_id AND b.tenant_id = v.tenant_id
                  LEFT JOIN users tc ON tc.id = v.treating_clinician_id
                  LEFT JOIN users a ON a.id = v.assistant_id
                  LEFT JOIN dental_chairs dc ON dc.id = v.chair_id AND dc.tenant_id = v.tenant_id
                  LEFT JOIN dental_rooms dr ON dr.id = dc.room_id AND dr.tenant_id = v.tenant_id
                  WHERE v.tenant_id = ? AND v.source_appointment_id = ? LIMIT 1`)
        .bind(tenantId, sourceAppointmentId)
        .first()) as D1Row | null;
      return row ? mapVisit(row) : null;
    },

    async create(tenantId, data) {
      const id = crypto.randomUUID();
      const date = data.date ?? new Date().toISOString();
      const code = await allocateClinicalDocumentCode(db, tenantId, "visit", date);
      await db
        .prepare(
          `INSERT INTO visits
              (id, code, tenant_id, patient_id, branch_id, clinician_id, date, notes,
               treating_clinician_id, assistant_id, chair_id, source_appointment_id,
               blood_pressure_systolic, blood_pressure_diastolic, blood_sugar_mgdl, vitals_recorded_at,
               visit_type, clinical_state)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          id, code, tenantId, data.patient_id, data.branch_id, data.clinician_id, date,
          data.notes ?? null,
          data.treating_clinician_id ?? null,
           data.assistant_id ?? null,
           data.chair_id ?? null,
           data.source_appointment_id ?? null,
          data.blood_pressure_systolic ?? null,
          data.blood_pressure_diastolic ?? null,
          data.blood_sugar_mgdl ?? null,
          data.vitals_recorded_at ?? null,
          data.visit_type,
          data.clinical_state,
        )
        .run();
      const created = await this.getById(tenantId, id);
      if (!created) throw new Error("Insert succeeded but read failed");
      return created;
    },

    async update(tenantId, id, data) {
      const fields: string[] = [];
      const binds: unknown[] = [];
      const allowed: (keyof Visit)[] = [
        "status",
        "completed_at",
        "completed_by",
        "notes",
        "treating_clinician_id",
        "assistant_id",
        "chair_id",
        "blood_pressure_systolic",
        "blood_pressure_diastolic",
        "blood_sugar_mgdl",
        "vitals_recorded_at",
        "clinical_state",
        "effective_at",
        "signed_by",
        "signed_at",
        "locked_at",
      ];
      for (const key of allowed) {
        if (data[key] !== undefined) {
          fields.push(`${key} = ?`);
          binds.push(data[key] ?? null);
        }
      }
      if (fields.length === 0) return this.getById(tenantId, id);
      binds.push(tenantId, id);
      await db
        .prepare(`UPDATE visits SET ${fields.join(", ")} WHERE tenant_id = ? AND id = ?`)
        .bind(...binds)
        .run();
      return this.getById(tenantId, id);
    },
  };
}

function mapVisit(row: D1Row): Visit {
  return {
    id: row.id as string,
    code: (row.code as string | null) ?? undefined,
    tenant_id: row.tenant_id as string,
    patient_id: row.patient_id as string,
    branch_id: row.branch_id as string,
    branch_name: (row.branch_name as string | null) ?? undefined,
    clinician_id: row.clinician_id as string,
    date: row.date as string,
    status: row.status as Visit["status"],
    visit_type: ((row.visit_type as string | null) ?? "initial_exam") as Visit["visit_type"],
    clinical_state: ((row.clinical_state as string | null) ?? "in_progress") as Visit["clinical_state"],
    effective_at: (row.effective_at as string | null) ?? undefined,
    signed_by: (row.signed_by as string | null) ?? undefined,
    signed_at: (row.signed_at as string | null) ?? undefined,
    locked_at: (row.locked_at as string | null) ?? undefined,
    legacy_at: (row.legacy_at as string | null) ?? undefined,
    legacy_source: (row.legacy_source as string | null) ?? undefined,
    completed_at: (row.completed_at as string | null) ?? undefined,
    completed_by: (row.completed_by as string | null) ?? undefined,
    notes: (row.notes as string | null) ?? undefined,
    created_at: row.created_at as string,
    blood_pressure_systolic: (row.blood_pressure_systolic as number | null) ?? undefined,
    blood_pressure_diastolic: (row.blood_pressure_diastolic as number | null) ?? undefined,
    blood_sugar_mgdl: (row.blood_sugar_mgdl as number | null) ?? undefined,
    vitals_recorded_at: (row.vitals_recorded_at as string | null) ?? undefined,
    treating_clinician_id: (row.treating_clinician_id as string | null) ?? undefined,
    treating_clinician_name: (row.treating_clinician_name as string | null) ?? undefined,
    treating_clinician_avatar_file_id: (row.treating_clinician_avatar_file_id as string | null) ?? undefined,
    assistant_id: (row.assistant_id as string | null) ?? undefined,
    assistant_name: (row.assistant_name as string | null) ?? undefined,
    assistant_avatar_file_id: (row.assistant_avatar_file_id as string | null) ?? undefined,
    chair_id: (row.chair_id as string | null) ?? undefined,
    chair_name: (row.chair_name as string | null) ?? undefined,
    chair_room_name: (row.chair_room_name as string | null) ?? undefined,
    source_appointment_id: (row.source_appointment_id as string | null) ?? undefined,
  };
}

async function allocateClinicalDocumentCode(
  db: D1Database,
  tenantId: string,
  documentType: "visit" | "treatment_plan",
  timestamp: string,
): Promise<string> {
  const dateKey = timestamp.slice(0, 10).replaceAll("-", "");
  const row = await db.prepare(`INSERT INTO clinical_document_code_counters (tenant_id, document_type, date_key, last_seq)
    VALUES (?, ?, ?, 1)
    ON CONFLICT(tenant_id, document_type, date_key) DO UPDATE SET last_seq = last_seq + 1
    RETURNING last_seq`)
    .bind(tenantId, documentType, dateKey)
    .first<{ last_seq: number }>();
  const sequence = row?.last_seq ?? 1;
  return `${documentType === "visit" ? "LK" : "KHD"}-${dateKey}-${String(sequence).padStart(4, "0")}`;
}
