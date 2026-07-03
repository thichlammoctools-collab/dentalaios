/**
 * Patient repository — CRUD scoped by tenant_id.
 *
 * All methods take `tenantId` as first arg to enforce isolation at the data layer.
 */

import type { D1Database } from "@cloudflare/workers-types";
import type { Patient } from "@shared/types";
import type { D1Row, Pagination } from "./base";

export interface PatientsRepository {
  list(tenantId: string, opts?: Pagination & { branchId?: string; search?: string }): Promise<Patient[]>;
  getById(tenantId: string, id: string): Promise<Patient | null>;
  create(tenantId: string, data: Omit<Patient, "id" | "tenant_id" | "created_at">): Promise<Patient>;
  update(tenantId: string, id: string, data: Partial<Patient>): Promise<Patient | null>;
  delete(tenantId: string, id: string): Promise<boolean>;
}

export function createPatientsRepository(db: D1Database): PatientsRepository {
  return {
    async list(tenantId, opts = {}) {
      const limit = Math.min(opts.limit ?? 100, 500);
      const offset = opts.offset ?? 0;
      const conditions = ["tenant_id = ?"];
      const binds: unknown[] = [tenantId];

      if (opts.branchId) {
        conditions.push("branch_id = ?");
        binds.push(opts.branchId);
      }
      if (opts.search) {
        conditions.push("(name LIKE ? OR phone LIKE ?)");
        const like = `%${opts.search}%`;
        binds.push(like, like);
      }

      const sql = `SELECT * FROM patients
                   WHERE ${conditions.join(" AND ")}
                   ORDER BY created_at DESC
                   LIMIT ? OFFSET ?`;
      binds.push(limit, offset);
      const result = await db.prepare(sql).bind(...binds).all();
      return (result.results as D1Row[]).map(mapPatient);
    },

    async getById(tenantId, id) {
      const row = (await db
        .prepare("SELECT * FROM patients WHERE tenant_id = ? AND id = ? LIMIT 1")
        .bind(tenantId, id)
        .first()) as D1Row | null;
      return row ? mapPatient(row) : null;
    },

    async create(tenantId, data) {
      const id = crypto.randomUUID();
      await db
        .prepare(
          `INSERT INTO patients
             (id, tenant_id, branch_id, name, date_of_birth, gender, phone, email, notes)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          id,
          tenantId,
          data.branch_id,
          data.name,
          data.date_of_birth,
          data.gender,
          data.phone,
          data.email ?? null,
          data.notes ?? null,
        )
        .run();
      const created = await this.getById(tenantId, id);
      if (!created) throw new Error("Insert succeeded but read failed");
      return created;
    },

    async update(tenantId, id, data) {
      // Build dynamic UPDATE
      const fields: string[] = [];
      const binds: unknown[] = [];
      const allowed: (keyof Patient)[] = [
        "branch_id",
        "name",
        "date_of_birth",
        "gender",
        "phone",
        "email",
        "notes",
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
        .prepare(`UPDATE patients SET ${fields.join(", ")} WHERE tenant_id = ? AND id = ?`)
        .bind(...binds)
        .run();
      return this.getById(tenantId, id);
    },

    async delete(tenantId, id) {
      const res = await db
        .prepare("DELETE FROM patients WHERE tenant_id = ? AND id = ?")
        .bind(tenantId, id)
        .run();
      return res.meta.changes > 0;
    },
  };
}

function mapPatient(row: D1Row): Patient {
  return {
    id: row.id as string,
    tenant_id: row.tenant_id as string,
    branch_id: row.branch_id as string,
    name: row.name as string,
    date_of_birth: row.date_of_birth as string,
    gender: row.gender as Patient["gender"],
    phone: row.phone as string,
    email: (row.email as string | null) ?? undefined,
    notes: (row.notes as string | null) ?? undefined,
    created_at: row.created_at as string,
  };
}