import type { D1Database } from "@cloudflare/workers-types";
import type { Visit } from "@shared/types";
import type { D1Row, Pagination } from "./base";

export interface VisitsRepository {
  list(tenantId: string, opts?: Pagination & { patientId?: string; branchId?: string; status?: Visit["status"] }): Promise<Visit[]>;
  getById(tenantId: string, id: string): Promise<Visit | null>;
  create(tenantId: string, data: Omit<Visit, "id" | "tenant_id" | "created_at" | "status">): Promise<Visit>;
  update(tenantId: string, id: string, data: Partial<Visit>): Promise<Visit | null>;
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
                    a.name AS assistant_name
                   FROM visits v
                   LEFT JOIN users tc ON tc.id = v.treating_clinician_id
                   LEFT JOIN users a ON a.id = v.assistant_id
                   WHERE ${conditions.join(" AND ")}
                   ORDER BY v.date DESC LIMIT ? OFFSET ?`;
      const result = await db.prepare(sql).bind(...binds).all();
      return (result.results as D1Row[]).map(mapVisit);
    },

    async getById(tenantId, id) {
      const row = (await db
        .prepare(`SELECT v.*,
                    tc.name AS treating_clinician_name,
                    a.name AS assistant_name
                   FROM visits v
                   LEFT JOIN users tc ON tc.id = v.treating_clinician_id
                   LEFT JOIN users a ON a.id = v.assistant_id
                   WHERE v.tenant_id = ? AND v.id = ? LIMIT 1`)
        .bind(tenantId, id)
        .first()) as D1Row | null;
      return row ? mapVisit(row) : null;
    },

    async create(tenantId, data) {
      const id = crypto.randomUUID();
      const date = data.date ?? new Date().toISOString();
      await db
        .prepare(
          `INSERT INTO visits
             (id, tenant_id, patient_id, branch_id, clinician_id, date, notes,
              treating_clinician_id, assistant_id,
              blood_pressure_systolic, blood_pressure_diastolic, blood_sugar_mgdl, vitals_recorded_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          id, tenantId, data.patient_id, data.branch_id, data.clinician_id, date,
          data.notes ?? null,
          data.treating_clinician_id ?? null,
          data.assistant_id ?? null,
          data.blood_pressure_systolic ?? null,
          data.blood_pressure_diastolic ?? null,
          data.blood_sugar_mgdl ?? null,
          data.vitals_recorded_at ?? null,
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
        "notes",
        "treating_clinician_id",
        "assistant_id",
        "blood_pressure_systolic",
        "blood_pressure_diastolic",
        "blood_sugar_mgdl",
        "vitals_recorded_at",
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
    tenant_id: row.tenant_id as string,
    patient_id: row.patient_id as string,
    branch_id: row.branch_id as string,
    clinician_id: row.clinician_id as string,
    date: row.date as string,
    status: row.status as Visit["status"],
    notes: (row.notes as string | null) ?? undefined,
    created_at: row.created_at as string,
    blood_pressure_systolic: (row.blood_pressure_systolic as number | null) ?? undefined,
    blood_pressure_diastolic: (row.blood_pressure_diastolic as number | null) ?? undefined,
    blood_sugar_mgdl: (row.blood_sugar_mgdl as number | null) ?? undefined,
    vitals_recorded_at: (row.vitals_recorded_at as string | null) ?? undefined,
    treating_clinician_id: (row.treating_clinician_id as string | null) ?? undefined,
    treating_clinician_name: (row.treating_clinician_name as string | null) ?? undefined,
    assistant_id: (row.assistant_id as string | null) ?? undefined,
    assistant_name: (row.assistant_name as string | null) ?? undefined,
  };
}
