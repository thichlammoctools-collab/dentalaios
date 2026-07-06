import type { D1Database } from "@cloudflare/workers-types";
import type { Patient } from "@shared/types";
import type { PatientCreateInput, PatientUpdateInput } from "@shared/validation";
import { createPatientsRepository } from "../repositories/patients.repo";

export const patientService = {
  list(
    db: D1Database,
    tenantId: string,
    opts: Parameters<ReturnType<typeof createPatientsRepository>["list"]>[1],
  ): Promise<Patient[]> {
    return createPatientsRepository(db).list(tenantId, opts);
  },

  get(db: D1Database, tenantId: string, id: string): Promise<Patient | null> {
    return createPatientsRepository(db).getById(tenantId, id);
  },

  create(db: D1Database, tenantId: string, data: PatientCreateInput): Promise<Patient> {
    return createPatientsRepository(db).create(tenantId, {
      branch_id: data.branch_id,
      name: data.name,
      date_of_birth: data.date_of_birth,
      gender: data.gender,
      phone: data.phone,
      email: data.email || undefined,
      notes: data.notes,
      referral_type: data.referral_type,
      referral_user_id: data.referral_user_id ?? undefined,
      referral_notes: data.referral_notes,
    });
  },

  update(
    db: D1Database,
    tenantId: string,
    id: string,
    data: PatientUpdateInput,
  ): Promise<Patient | null> {
    return createPatientsRepository(db).update(tenantId, id, {
      referral_type: data.referral_type,
      referral_user_id: data.referral_user_id ?? undefined,
      referral_notes: data.referral_notes,
    });
  },

  remove(db: D1Database, tenantId: string, id: string): Promise<boolean> {
    return createPatientsRepository(db).delete(tenantId, id);
  },
};
