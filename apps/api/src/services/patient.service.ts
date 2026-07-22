import type { D1Database } from "@cloudflare/workers-types";
import type { Patient, ToothHistoryEntry } from "@shared/types";
import type { PatientCreateInput, PatientUpdateInput } from "@shared/validation";
import { createPatientsRepository } from "../repositories/patients.repo";
import { createFindingsRepository } from "../repositories/findings.repo";
import { assertAllInTenant } from "../lib/tenant-scope";
import { ConflictError, NotFoundError } from "../lib/errors";
import { isUniqueConstraintError } from "../lib/db-errors";
import { referralService } from "./referral.service";

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

  create(db: D1Database, tenantId: string, data: PatientCreateInput, userId?: string): Promise<Patient> {
    return (async () => {
      await assertAllInTenant(db, tenantId, [
        { table: "branches", id: data.branch_id },
        { table: "users", id: data.referral_user_id ?? undefined },
      ]);
      try {
        const referrer = await referralService.resolveReferrer(db, tenantId, {
          referrerId: data.referrer_id,
          referralCode: data.referral_code,
        });
        if (referrer) {
          // A referral only applies to the first-ever record in a tenant.
          // Archived records count as history even though active CCCD uniqueness does not.
          const historical = await db.prepare("SELECT id FROM patients WHERE tenant_id = ? AND cccd = ? LIMIT 1").bind(tenantId, data.cccd).first();
          if (historical) throw new ConflictError("Bệnh nhân đã tồn tại trong phòng khám, không thể áp dụng giới thiệu mới");
        }
        const created = await createPatientsRepository(db).create(tenantId, {
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
          cccd: data.cccd,
        });
        if (referrer) await referralService.createCaseForNewPatient(db, tenantId, userId ?? "system", created, referrer, data.referral_code ? "code" : "manual");
        return created;
      } catch (err) {
        if (isUniqueConstraintError(err)) {
          throw new ConflictError("Số CCCD đã tồn tại trong phòng khám");
        }
        throw err;
      }
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
      if (data.referrer_id || data.referral_code) {
        throw new ConflictError("Chỉ có thể ghi nhận Người giới thiệu khi tạo hồ sơ bệnh nhân");
      }
      const address = displayAddress({
        address: data.address ?? existing.address,
        address_line: data.address_line ?? existing.address_line,
        ward_name: data.ward_name ?? existing.ward_name,
        district_name: data.district_name ?? existing.district_name,
        province_name: data.province_name ?? existing.province_name,
        country_name: data.country_name ?? existing.country_name,
      });
      try {
        return await repository.update(tenantId, id, {
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
          cccd: data.cccd,
        });
      } catch (err) {
        if (isUniqueConstraintError(err)) {
          throw new ConflictError("Số CCCD đã tồn tại trong phòng khám");
        }
        throw err;
      }
    })();
  },

  async toothHistory(
    db: D1Database,
    tenantId: string,
    patientId: string,
    toothNumber: number,
  ): Promise<ToothHistoryEntry[]> {
    const patient = await createPatientsRepository(db).getById(tenantId, patientId);
    if (!patient) throw new NotFoundError("Patient not found");
    return createFindingsRepository(db).listToothHistory(tenantId, patientId, toothNumber);
  },

  archive(db: D1Database, tenantId: string, id: string, userId: string, reason: string): Promise<boolean> {
    return createPatientsRepository(db).archive(tenantId, id, userId, reason);
  },

  async restore(db: D1Database, tenantId: string, id: string): Promise<boolean> {
    try {
      return await createPatientsRepository(db).restore(tenantId, id);
    } catch (err) {
      if (isUniqueConstraintError(err)) {
        throw new ConflictError("Không thể khôi phục vì số CCCD đã thuộc về bệnh nhân đang hoạt động");
      }
      throw err;
    }
  },
};
