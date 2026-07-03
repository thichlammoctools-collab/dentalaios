import type { D1Database } from "@cloudflare/workers-types";
import type { Visit } from "@shared/types";
import type { D1Row, Pagination } from "./base";

export interface VisitsRepository {
  list(tenantId: string, opts?: Pagination & { patientId?: string; branchId?: string; status?: Visit["status"] }): Promise<Visit[]>;
  getById(tenantId: string, id: string): Promise<Visit | null>;
  create(tenantId: string, data: Omit<Visit, "id" | "tenant_id" | "created_at" | "status">): Promise<Visit>;
  update(tenantId: string, id: string, data: Partial<Pick<Visit, "status" | "notes">>): Promise<Visit | null>;
}

export function createVisitsRepository(db: D1Database): VisitsRepository {
  return {
    async list(tenantId, opts = {}) {
      const limit = Math.min(opts.limit ?? 100, 500);
      const offset = opts.offset ?? 0;
      const conditions = ["tenant_id = ?"];
      const binds: unknown[] = [tenantId];
      if (opts.patientId) {
        conditions.push("patient_id = ?");
        binds.push(opts.patientId);
      }
      if (opts.branchId) {
        conditions.push("branch_id = ?");
        binds.push(opts.branchId);
      }
      if (opts.status) {
        conditions.push("status = ?");
        binds.push(opts.status);
      }
      binds.push(limit, offset);
      const sql = `SELECT * FROM visits WHERE ${conditions.join(" AND ")}
                   ORDER BY date DESC LIMIT ? OFFSET ?`;
      const result = await db.prepare(sql).bind(...binds).all();
      return (result.results as D1Row[]).map(mapVisit);
    },

    async getById(tenantId, id) {
      const row = (await db
        .prepare("SELECT * FROM visits WHERE tenant_id = ? AND id = ? LIMIT 1")
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
             (id, tenant_id, patient_id, branch_id, clinician_id, date, notes)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(id, tenantId, data.patient_id, data.branch_id, data.clinician_id, date, data.notes ?? null)
        .run();
      const created = await this.getById(tenantId, id);
      if (!created) throw new Error("Insert succeeded but read failed");
      return created;
    },

    async update(tenantId, id, data) {
      const fields: string[] = [];
      const binds: unknown[] = [];
      if (data.status !== undefined) {
        fields.push("status = ?");
        binds.push(data.status);
      }
      if (data.notes !== undefined) {
        fields.push("notes = ?");
        binds.push(data.notes ?? null);
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
  };
}