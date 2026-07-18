import type { D1Database } from "@cloudflare/workers-types";
import type { PatientNote } from "@shared/types";
import { createPatientNotesRepository } from "../repositories/patient-notes.repo";
import { createPatientsRepository } from "../repositories/patients.repo";

export const patientNotesService = {
  async list(db: D1Database, tenantId: string, patientId: string): Promise<PatientNote[] | null> {
    const patient = await createPatientsRepository(db).getById(tenantId, patientId);
    if (!patient) return null;
    return createPatientNotesRepository(db).listByPatient(tenantId, patientId);
  },

  async create(
    db: D1Database,
    tenantId: string,
    patientId: string,
    userId: string,
    content: string,
  ): Promise<PatientNote | null> {
    const patient = await createPatientsRepository(db).getById(tenantId, patientId);
    if (!patient) return null;
    return createPatientNotesRepository(db).create(tenantId, patientId, userId, content);
  },
};
