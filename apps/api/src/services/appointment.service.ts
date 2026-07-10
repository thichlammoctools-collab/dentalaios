/**
 * Appointment service — CRUD with conflict detection.
 *
 * Conflict checks (in order):
 *   1. Doctor has a working schedule for the weekday
 *   2. Clinic is open on the weekday
 *   3. Slot fits within clinic open hours
 *   4. No overlapping appointment exists for the clinician
 */

import type { D1Database } from "@cloudflare/workers-types";
import type { Appointment } from "@shared/types";
import { DEFAULT_CLINIC_OPEN, DEFAULT_CLINIC_CLOSE } from "@shared/constants";
import type { AppointmentCreateInput, AppointmentUpdateInput } from "@shared/validation";
import { createAppointmentsRepository, type AppointmentListOpts } from "../repositories/appointments.repo";
import { createDoctorSchedulesRepository } from "../repositories/doctor-schedules.repo";
import { createClinicSchedulesRepository } from "../repositories/clinic-schedules.repo";
import { NotFoundError, ValidationError, ConflictError } from "../lib/errors";

export const appointmentService = {
  list(
    db: D1Database,
    tenantId: string,
    branchId: string,
    opts?: AppointmentListOpts,
  ): Promise<Appointment[]> {
    // Default to current branch if no branchId filter specified
    return createAppointmentsRepository(db).list(tenantId, { ...opts, branchId: opts?.branchId ?? branchId });
  },

  async get(db: D1Database, tenantId: string, id: string): Promise<Appointment> {
    const apt = await createAppointmentsRepository(db).getById(tenantId, id);
    if (!apt) throw new NotFoundError("Appointment not found");
    return apt;
  },

  async create(
    db: D1Database,
    tenantId: string,
    branchId: string,
    createdByUserId: string,
    data: AppointmentCreateInput,
  ): Promise<Appointment> {
    const startISO = data.scheduled_at;
    const durationMin = data.duration_min ?? 30;
    const endISO = addMinutes(startISO, durationMin);

    await validateScheduleConstraints(db, tenantId, branchId, data.clinician_id, startISO, endISO);

    const repo = createAppointmentsRepository(db);
    const conflicts = await repo.findConflicts(tenantId, data.clinician_id, startISO, endISO);
    if (conflicts.length > 0) {
      throw new ConflictError("Bác sĩ đã có lịch hẹn trong khung giờ này");
    }

    return repo.create(tenantId, {
      branch_id: branchId,
      clinician_id: data.clinician_id,
      patient_id: data.patient_id,
      source_visit_id: data.source_visit_id,
      scheduled_at: startISO,
      duration_min: durationMin,
      status: "booked",
      procedure: data.procedure,
      notes: data.notes,
      source: data.source ?? "manual",
      created_by: createdByUserId,
    });
  },

  async update(
    db: D1Database,
    tenantId: string,
    id: string,
    data: AppointmentUpdateInput,
  ): Promise<Appointment> {
    const existing = await this.get(db, tenantId, id);

    // Cannot update completed/cancelled appointments
    if (existing.status === "completed" || existing.status === "cancelled") {
      throw new ValidationError(`Không thể cập nhật lịch hẹn đã ${existing.status === "completed" ? "hoàn thành" : "hủy"}`);
    }

    // If cancelling, require reason
    if (data.status === "cancelled" && !data.cancelled_reason) {
      throw new ValidationError("Lý do hủy là bắt buộc");
    }

    // If rescheduling (changing scheduled_at or duration), re-check conflicts
    const newStart = data.scheduled_at ?? existing.scheduled_at;
    const newDuration = data.duration_min ?? existing.duration_min;
    const newEnd = addMinutes(newStart, newDuration);
    const isReschedule = (data.scheduled_at && data.scheduled_at !== existing.scheduled_at)
      || (data.duration_min && data.duration_min !== existing.duration_min);

    if (isReschedule) {
      await validateScheduleConstraints(
        db, tenantId, existing.branch_id, existing.clinician_id, newStart, newEnd,
      );
      const repo = createAppointmentsRepository(db);
      const conflicts = await repo.findConflicts(tenantId, existing.clinician_id, newStart, newEnd, id);
      if (conflicts.length > 0) {
        throw new ConflictError("Bác sĩ đã có lịch hẹn trong khung giờ mới");
      }
    }

    const repo = createAppointmentsRepository(db);
    const updated = await repo.update(tenantId, id, data);
    if (!updated) throw new NotFoundError("Appointment not found");
    return updated;
  },

  /**
   * Get busy slots (existing appointments) for a doctor on a given date.
   * Frontend computes free slots from this data + doctor schedule.
   */
  async getBusySlots(
    db: D1Database,
    tenantId: string,
    doctorId: string,
    date: string,  // YYYY-MM-DD
  ): Promise<Pick<Appointment, "scheduled_at" | "duration_min">[]> {
    const dayStart = `${date}T00:00:00.000Z`;
    const dayEnd = `${date}T23:59:59.999Z`;
    const repo = createAppointmentsRepository(db);
    const busy = await repo.list(tenantId, {
      clinicianId: doctorId,
      from: dayStart,
      to: dayEnd,
    });
    return busy.map((a) => ({ scheduled_at: a.scheduled_at, duration_min: a.duration_min }));
  },
};

// ─── Helpers ───────────────────────────────────────────────────

function addMinutes(isoDate: string, minutes: number): string {
  const d = new Date(isoDate);
  d.setMinutes(d.getMinutes() + minutes);
  return d.toISOString();
}

function weekdayFromDate(isoDate: string): number {
  const d = new Date(isoDate);
  const jsDay = d.getDay(); // 0=Sun..6=Sat
  return jsDay === 0 ? 7 : jsDay; // 1=Mon..7=Sun
}

function timeFromISO(isoDate: string): string {
  const d = new Date(isoDate);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

async function validateScheduleConstraints(
  db: D1Database,
  tenantId: string,
  branchId: string,
  clinicianId: string,
  startISO: string,
  endISO: string,
): Promise<void> {
  const weekday = weekdayFromDate(startISO);
  const slotStart = timeFromISO(startISO);
  const slotEnd = timeFromISO(endISO);
  // 1. Check doctor has working schedule for this weekday
  const docRepo = createDoctorSchedulesRepository(db);
  const docSchedules = await docRepo.listByDoctor(tenantId, branchId, clinicianId);
  const docSchedule = docSchedules.find((s) => s.weekday === weekday);
  if (!docSchedule) {
    throw new ValidationError(`Bác sĩ không có lịch làm việc vào thứ ${weekday}`);
  }
  // Slot must fit within doctor's working hours
  if (slotStart < docSchedule.start_time || slotEnd > docSchedule.end_time) {
    throw new ValidationError(
      `Khung giờ nằm ngoài lịch làm việc (${docSchedule.start_time}–${docSchedule.end_time})`,
    );
  }

  // 2. Check clinic is open
  const clinicRepo = createClinicSchedulesRepository(db);
  const clinicSchedules = await clinicRepo.listByBranch(tenantId, branchId);
  const clinicDay = clinicSchedules.find((s) => s.weekday === weekday);
  const openTime = clinicDay?.open_time ?? DEFAULT_CLINIC_OPEN;
  const closeTime = clinicDay?.close_time ?? DEFAULT_CLINIC_CLOSE;
  if (clinicDay?.is_closed) {
    throw new ValidationError(`Phòng khám đóng cửa vào thứ ${weekday}`);
  }
  if (slotStart < openTime || slotEnd > closeTime) {
    throw new ValidationError(
      `Khung giờ nằm ngoài giờ mở cửa (${openTime}–${closeTime})`,
    );
  }
}