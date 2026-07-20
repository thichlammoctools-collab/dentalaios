import type { D1Database } from "@cloudflare/workers-types";
import { isAssistantRole, isDoctorRole } from "@shared/constants";
import { ValidationError } from "./errors";
import { createUsersRepository } from "../repositories/users.repo";

/** Verifies active personnel roles server-side; frontend role filters are not trusted. */
export async function assertTreatmentPersonnel(
  db: D1Database,
  tenantId: string,
  personnel: { treatingClinicianId?: string; assistantId?: string },
): Promise<void> {
  const users = createUsersRepository(db);
  if (personnel.treatingClinicianId) {
    const clinician = await users.findContextById(personnel.treatingClinicianId, tenantId);
    if (!clinician?.user.is_active || !isDoctorRole(clinician.role.system_key, clinician.role.id, clinician.role.name)) {
      throw new ValidationError("Bác sĩ điều trị không hợp lệ");
    }
  }
  if (personnel.assistantId) {
    const assistant = await users.findContextById(personnel.assistantId, tenantId);
    if (!assistant?.user.is_active || !isAssistantRole(assistant.role.system_key, assistant.role.id, assistant.role.name)) {
      throw new ValidationError("Phụ tá không hợp lệ");
    }
  }
}
