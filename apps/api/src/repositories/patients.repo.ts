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
      const conditions = ["p.tenant_id = ?"];
      const binds: unknown[] = [tenantId];

      if (opts.branchId) {
        conditions.push("p.branch_id = ?");
        binds.push(opts.branchId);
      }
      if (opts.search) {
        conditions.push("(p.name LIKE ? OR p.phone LIKE ?)");
        const like = `%${opts.search}%`;
        binds.push(like, like);
      }

      binds.push(limit, offset);
      const sql = `SELECT p.*,
                    ref.name AS referral_user_name
                   FROM patients p
                   LEFT JOIN users ref ON ref.id = p.referral_user_id
                   WHERE ${conditions.join(" AND ")}
                   ORDER BY p.created_at DESC
                   LIMIT ? OFFSET ?`;
      const result = await db.prepare(sql).bind(...binds).all();
      return (result.results as D1Row[]).map(mapPatient);
    },

    async getById(tenantId, id) {
      const row = (await db
        .prepare(`SELECT p.*,
                    ref.name AS referral_user_name
                   FROM patients p
                   LEFT JOIN users ref ON ref.id = p.referral_user_id
                   WHERE p.tenant_id = ? AND p.id = ? LIMIT 1`)
        .bind(tenantId, id)
        .first()) as D1Row | null;
      return row ? mapPatient(row) : null;
    },

    async create(tenantId, data) {
      const id = crypto.randomUUID();
      await db
        .prepare(
          `INSERT INTO patients
             (id, tenant_id, branch_id, name, date_of_birth, gender, phone, email, notes, address,
              family_name, family_phone, family_relation, marketing_source,
              referral_type, referral_user_id, referral_notes,
              height_cm, weight_kg)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
          data.address ?? null,
          data.family_name ?? null,
          data.family_phone ?? null,
          data.family_relation ?? null,
          data.marketing_source ?? null,
          data.referral_type ?? null,
          data.referral_user_id ?? null,
          data.referral_notes ?? null,
          data.height_cm ?? null,
          data.weight_kg ?? null,
        )
        .run();
      const created = await this.getById(tenantId, id);
      if (!created) throw new Error("Insert succeeded but read failed");
      return created;
    },

    async update(tenantId, id, data) {
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
        "address",
        "family_name",
        "family_phone",
        "family_relation",
        "marketing_source",
        "referral_type",
        "referral_user_id",
        "referral_notes",
        "height_cm",
        "weight_kg",
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
    address: (row.address as string | null) ?? undefined,
    created_at: row.created_at as string,
    family_name: (row.family_name as string | null) ?? undefined,
    family_phone: (row.family_phone as string | null) ?? undefined,
    family_relation: (row.family_relation as string | null) ?? undefined,
    marketing_source: (row.marketing_source as string | null) ?? undefined,
    referral_type: (row.referral_type as Patient["referral_type"]) ?? undefined,
    referral_user_id: (row.referral_user_id as string | null) ?? undefined,
    referral_user_name: (row.referral_user_name as string | null) ?? undefined,
    referral_notes: (row.referral_notes as string | null) ?? undefined,
    height_cm: (row.height_cm as number | null) ?? undefined,
    weight_kg: (row.weight_kg as number | null) ?? undefined,
  };
}
