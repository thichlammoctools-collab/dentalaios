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
  update(tenantId: string, id: string, data: Omit<Partial<Patient>, "avatar_file_id"> & { avatar_file_id?: string | null }): Promise<Patient | null>;
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
        conditions.push("(p.name LIKE ? OR p.phone LIKE ? OR p.cccd LIKE ?)");
        const like = `%${opts.search}%`;
        binds.push(like, like, like);
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
              address_line, ward_name, ward_code, district_name, district_code, province_name, province_code, postal_code, country_code,
              family_name, family_phone, family_relation, marketing_source,
              referral_type, referral_user_id, referral_notes,
              height_cm, weight_kg, cccd)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
          data.address_line ?? null,
          data.ward_name ?? null,
          data.ward_code ?? null,
          data.district_name ?? null,
          data.district_code ?? null,
          data.province_name ?? null,
          data.province_code ?? null,
          data.postal_code ?? null,
          data.country_code ?? "VN",
          data.family_name ?? null,
          data.family_phone ?? null,
          data.family_relation ?? null,
          data.marketing_source ?? null,
          data.referral_type ?? null,
          data.referral_user_id ?? null,
          data.referral_notes ?? null,
          data.height_cm ?? null,
          data.weight_kg ?? null,
          data.cccd ?? null,
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
        "avatar_file_id",
        "address",
        "address_line",
        "ward_name",
        "ward_code",
        "district_name",
        "district_code",
        "province_name",
        "province_code",
        "postal_code",
        "country_code",
        "family_name",
        "family_phone",
        "family_relation",
        "marketing_source",
        "referral_type",
        "referral_user_id",
        "referral_notes",
        "height_cm",
        "weight_kg",
        "cccd",
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
      // The patient FK is restrictive on appointments, payments, treatment plans,
      // and visits. Remove dependents in FK order in one atomic D1 batch.
      const results = await db.batch([
        db.prepare("DELETE FROM appointments WHERE tenant_id = ? AND patient_id = ?").bind(tenantId, id),
        db.prepare("DELETE FROM payments WHERE tenant_id = ? AND patient_id = ?").bind(tenantId, id),
        db.prepare("DELETE FROM treatment_plan_items WHERE tenant_id = ? AND treatment_plan_id IN (SELECT id FROM treatment_plans WHERE tenant_id = ? AND patient_id = ?)").bind(tenantId, tenantId, id),
        db.prepare("DELETE FROM treatment_plans WHERE tenant_id = ? AND patient_id = ?").bind(tenantId, id),
        db.prepare("DELETE FROM patient_images WHERE tenant_id = ? AND patient_id = ?").bind(tenantId, id),
        db.prepare("DELETE FROM medical_alerts WHERE tenant_id = ? AND patient_id = ?").bind(tenantId, id),
        db.prepare("DELETE FROM patient_notes WHERE tenant_id = ? AND patient_id = ?").bind(tenantId, id),
        db.prepare("DELETE FROM clinical_findings WHERE tenant_id = ? AND visit_id IN (SELECT id FROM visits WHERE tenant_id = ? AND patient_id = ?)").bind(tenantId, tenantId, id),
        db.prepare("DELETE FROM visits WHERE tenant_id = ? AND patient_id = ?").bind(tenantId, id),
        db.prepare("DELETE FROM patients WHERE tenant_id = ? AND id = ?").bind(tenantId, id),
      ]);
      const patientResult = results.at(-1);
      return patientResult !== undefined && patientResult.meta.changes > 0;
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
    avatar_file_id: (row.avatar_file_id as string | null) ?? undefined,
    address: (row.address as string | null) ?? undefined,
    address_line: (row.address_line as string | null) ?? undefined,
    ward_name: (row.ward_name as string | null) ?? undefined,
    ward_code: (row.ward_code as string | null) ?? undefined,
    district_name: (row.district_name as string | null) ?? undefined,
    district_code: (row.district_code as string | null) ?? undefined,
    province_name: (row.province_name as string | null) ?? undefined,
    province_code: (row.province_code as string | null) ?? undefined,
    postal_code: (row.postal_code as string | null) ?? undefined,
    country_code: (row.country_code as string | null) ?? undefined,
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
    cccd: (row.cccd as string | null) ?? undefined,
  };
}
