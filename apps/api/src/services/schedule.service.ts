/**
 * Schedule service — clinic/doctor working hours management.
 *
 * Returns default 08:00-17:00 Mon-Fri when no config exists (Phase 1).
 */

import type { D1Database } from "@cloudflare/workers-types";
import type { ClinicSchedule, DoctorSchedule } from "@shared/types";
import { DEFAULT_CLINIC_OPEN, DEFAULT_CLINIC_CLOSE } from "@shared/constants";
import type { DoctorScheduleBulkUpdate, ClinicScheduleBulkUpdate } from "@shared/validation";
import { createClinicSchedulesRepository } from "../repositories/clinic-schedules.repo";
import { createDoctorSchedulesRepository } from "../repositories/doctor-schedules.repo";

const DEFAULT_SLOT_MINUTES = 30;

/**
 * Default working days (Mon-Fri) when no clinic_schedules exist.
 */
function buildDefaultClinicSchedule(tenantId: string, branchId: string): ClinicSchedule[] {
  return [1, 2, 3, 4, 5].map((weekday) => ({
    id: `default-${tenantId}-${branchId}-${weekday}`,
    tenant_id: tenantId,
    branch_id: branchId,
    weekday,
    open_time: DEFAULT_CLINIC_OPEN,
    close_time: DEFAULT_CLINIC_CLOSE,
    is_closed: false,
    created_at: "",
  }));
}

function buildDefaultDoctorSchedule(
  tenantId: string,
  branchId: string,
  doctorId: string,
): DoctorSchedule[] {
  return [1, 2, 3, 4, 5].map((weekday) => ({
    id: `default-${tenantId}-${branchId}-${doctorId}-${weekday}`,
    tenant_id: tenantId,
    branch_id: branchId,
    doctor_id: doctorId,
    weekday,
    start_time: DEFAULT_CLINIC_OPEN,
    end_time: DEFAULT_CLINIC_CLOSE,
    slot_minutes: DEFAULT_SLOT_MINUTES,
    created_at: "",
  }));
}

export const scheduleService = {
  async getClinicSchedule(
    db: D1Database,
    tenantId: string,
    branchId: string,
  ): Promise<ClinicSchedule[]> {
    const repo = createClinicSchedulesRepository(db);
    const rows = await repo.listByBranch(tenantId, branchId);
    if (rows.length === 0) return buildDefaultClinicSchedule(tenantId, branchId);
    return rows;
  },

  async updateClinicSchedule(
    db: D1Database,
    tenantId: string,
    branchId: string,
    data: ClinicScheduleBulkUpdate,
  ): Promise<ClinicSchedule[]> {
    const repo = createClinicSchedulesRepository(db);
    await repo.upsertBulk(tenantId, branchId, data.entries);
    return repo.listByBranch(tenantId, branchId);
  },

  async getDoctorSchedule(
    db: D1Database,
    tenantId: string,
    doctorId: string,
    branchId?: string,
  ): Promise<DoctorSchedule[]> {
    const repo = createDoctorSchedulesRepository(db);
    const rows = branchId
      ? await repo.listByDoctor(tenantId, branchId, doctorId)
      : await repo.listByDoctorId(tenantId, doctorId);
    if (rows.length === 0) {
      // Use default branchId or just return empty
      const targetBranch = branchId ?? "";
      return targetBranch ? buildDefaultDoctorSchedule(tenantId, targetBranch, doctorId) : [];
    }
    return rows;
  },

  async updateDoctorSchedule(
    db: D1Database,
    tenantId: string,
    data: DoctorScheduleBulkUpdate,
  ): Promise<DoctorSchedule[]> {
    const repo = createDoctorSchedulesRepository(db);
    await repo.upsertBulk(tenantId, data.branch_id, data.doctor_id, data.entries);
    return repo.listByDoctor(tenantId, data.branch_id, data.doctor_id);
  },
};