import type { D1Database } from "@cloudflare/workers-types";
import type { VisitSafetyAcknowledgement, VisitSafetyWarningType } from "@shared/types";
import type { VisitSafetyAcknowledgementInput } from "@shared/validation";
import { NotFoundError, ValidationError } from "../lib/errors";
import { createVisitSafetyAcknowledgementsRepository } from "../repositories/visit-safety-acknowledgements.repo";
import { createVisitsRepository } from "../repositories/visits.repo";
import { createPatientsRepository } from "../repositories/patients.repo";

export const visitSafetyService = {
  async list(db: D1Database, tenantId: string, visitId: string): Promise<VisitSafetyAcknowledgement[]> {
    await requireVisit(db, tenantId, visitId);
    return createVisitSafetyAcknowledgementsRepository(db).listByVisit(tenantId, visitId);
  },

  async acknowledge(
    db: D1Database,
    tenantId: string,
    visitId: string,
    actorId: string,
    data: VisitSafetyAcknowledgementInput,
  ): Promise<VisitSafetyAcknowledgement> {
    const visit = await requireVisit(db, tenantId, visitId);
    if (!await hasWarning(db, tenantId, visit, data.warning_type)) throw new ValidationError("Không có cảnh báo chỉ số tương ứng để xác nhận");
    const now = new Date().toISOString();
    return createVisitSafetyAcknowledgementsRepository(db).upsert({
      id: crypto.randomUUID(), tenant_id: tenantId, visit_id: visitId, warning_type: data.warning_type,
      outcome: data.outcome, reason: data.reason, acknowledged_by: actorId, acknowledged_at: now,
      created_at: now, updated_at: now,
    });
  },
};

async function requireVisit(db: D1Database, tenantId: string, visitId: string) {
  const visit = await createVisitsRepository(db).getById(tenantId, visitId);
  if (!visit) throw new NotFoundError("Visit not found");
  return visit;
}

async function hasWarning(
  db: D1Database,
  tenantId: string,
  visit: Awaited<ReturnType<typeof requireVisit>>,
  warning: VisitSafetyWarningType,
): Promise<boolean> {
  if (warning === "blood_pressure") {
    const systolic = visit.blood_pressure_systolic ?? 0;
    const diastolic = visit.blood_pressure_diastolic ?? 0;
    return systolic >= 140 || diastolic >= 90 || (systolic > 0 && systolic < 90) || (diastolic > 0 && diastolic < 60);
  }
  if (warning === "blood_sugar") {
    const glucose = visit.blood_sugar_mgdl;
    return glucose !== undefined && (glucose >= 200 || glucose < 70);
  }
  const patient = await createPatientsRepository(db).getById(tenantId, visit.patient_id);
  if (!patient?.height_cm || !patient.weight_kg) return false;
  const bmi = patient.weight_kg / ((patient.height_cm / 100) ** 2);
  return bmi >= 23 || bmi < 18.5;
}
