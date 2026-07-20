import type { D1Database } from "@cloudflare/workers-types";
import type { Patient } from "@shared/types";
import type { PatientCreateInput, PatientUpdateInput } from "@shared/validation";
import { createPatientsRepository } from "../repositories/patients.repo";
import { assertAllInTenant } from "../lib/tenant-scope";

function displayAddress(data: Pick<Patient, "address" | "address_line" | "ward_name" | "district_name" | "province_name" | "country_name">) {
  const structuredParts = [
    data.address_line,
    data.ward_name,
    data.district_name,
    data.province_name,
    data.country_name !== "Việt Nam" ? data.country_name : undefined,
  ]
    .filter((part): part is string => Boolean(part?.trim()));
  return structuredParts.length > 0 ? structuredParts.join(", ") : data.address;
}

export const patientService = {
  list(
    db: D1Database,
    tenantId: string,
    opts: Parameters<ReturnType<typeof createPatientsRepository>["list"]>[1],
  ): Promise<Patient[]> {
    return createPatientsRepository(db).list(tenantId, opts);
  },

  count(
    db: D1Database,
    tenantId: string,
    opts: Parameters<ReturnType<typeof createPatientsRepository>["count"]>[1],
  ): Promise<number> {
    return createPatientsRepository(db).count(tenantId, opts);
  },

  get(db: D1Database, tenantId: string, id: string): Promise<Patient | null> {
    return createPatientsRepository(db).getById(tenantId, id);
  },

  create(db: D1Database, tenantId: string, data: PatientCreateInput): Promise<Patient> {
    return (async () => {
      await assertAllInTenant(db, tenantId, [
        { table: "branches", id: data.branch_id },
        { table: "users", id: data.referral_user_id ?? undefined },
      ]);
      return createPatientsRepository(db).create(tenantId, {
      branch_id: data.branch_id,
      name: data.name,
      date_of_birth: data.date_of_birth,
      gender: data.gender,
      phone: data.phone,
      email: data.email || undefined,
        address: displayAddress(data),
        address_line: data.address_line,
        ward_name: data.ward_name,
        ward_code: data.ward_code,
        district_name: data.district_name,
        district_code: data.district_code,
        province_name: data.province_name,
        country_name: data.country_name ?? "Việt Nam",
        country_code: data.country_code,
      family_name: data.family_name ?? undefined,
      family_phone: data.family_phone ?? undefined,
      family_relation: data.family_relation ?? undefined,
      marketing_source: data.marketing_source ?? undefined,
      referral_type: data.referral_type,
      referral_user_id: data.referral_user_id ?? undefined,
      referral_notes: data.referral_notes,
      height_cm: data.height_cm ?? undefined,
      weight_kg: data.weight_kg ?? undefined,
      cccd: data.cccd ?? undefined,
      });
    })();
  },

  update(
    db: D1Database,
    tenantId: string,
    id: string,
    data: PatientUpdateInput,
  ): Promise<Patient | null> {
    return (async () => {
      await assertAllInTenant(db, tenantId, [
        { table: "branches", id: data.branch_id ?? undefined },
        { table: "users", id: data.referral_user_id ?? undefined },
      ]);
      const repository = createPatientsRepository(db);
      const existing = await repository.getById(tenantId, id);
      if (!existing) return null;
      const address = displayAddress({
        address: data.address ?? existing.address,
        address_line: data.address_line ?? existing.address_line,
        ward_name: data.ward_name ?? existing.ward_name,
        district_name: data.district_name ?? existing.district_name,
        province_name: data.province_name ?? existing.province_name,
        country_name: data.country_name ?? existing.country_name,
      });
      return repository.update(tenantId, id, {
      name: data.name,
      date_of_birth: data.date_of_birth,
      gender: data.gender,
      phone: data.phone,
      email: data.email ?? undefined,
        address,
        address_line: data.address_line,
        ward_name: data.ward_name,
        ward_code: data.ward_code,
        district_name: data.district_name,
        district_code: data.district_code,
        province_name: data.province_name,
        country_name: data.country_name,
        country_code: data.country_code,
      family_name: data.family_name ?? undefined,
      family_phone: data.family_phone ?? undefined,
      family_relation: data.family_relation ?? undefined,
      marketing_source: data.marketing_source ?? undefined,
      referral_type: data.referral_type,
      referral_user_id: data.referral_user_id ?? undefined,
      referral_notes: data.referral_notes,
      height_cm: data.height_cm ?? undefined,
      weight_kg: data.weight_kg ?? undefined,
      cccd: data.cccd ?? undefined,
      });
    })();
  },

  remove(db: D1Database, tenantId: string, id: string): Promise<boolean> {
    return createPatientsRepository(db).delete(tenantId, id);
  },
};
