import type { D1Database } from "@cloudflare/workers-types";
import type { MedicalAlert } from "@shared/types";
import { createMedicalAlertsRepository } from "../repositories/medical-alerts.repo";

export const medicalAlertsService = {
  list(db: D1Database, tenantId: string, patientId: string): Promise<MedicalAlert[]> {
    return createMedicalAlertsRepository(db).listByPatient(tenantId, patientId);
  },

  async create(
    db: D1Database,
    tenantId: string,
    patientId: string,
    data: { type: string; description: string; severity: MedicalAlert["severity"] },
  ): Promise<MedicalAlert> {
    return createMedicalAlertsRepository(db).create(tenantId, patientId, data);
  },

  remove(db: D1Database, tenantId: string, id: string): Promise<boolean> {
    return createMedicalAlertsRepository(db).delete(tenantId, id);
  },
};