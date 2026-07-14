/**
 * Appointments service — creates appointments and syncs to Lark Calendar.
 *
 * Conflict detection: when create/update changes scheduled_at / duration /
 * clinician_id, the service checks for overlapping appointments for that
 * clinician. Returns ConflictError (→ 409) when overlap found.
 *
 * Architecture rule #7: ONLY operational fields to Lark.
 * (patient name, phone, scheduled time — no clinical details.)
 */

import type { D1Database } from "@cloudflare/workers-types";
import type { Appointment } from "@shared/types";
import type { AppointmentCreateInput, AppointmentUpdateInput } from "@shared/validation";
import { createAppointmentsRepository } from "../repositories/appointments.repo";
import { createLarkConfigRepository } from "../repositories/lark-config.repo";
import {
  createLarkCalendarEvent,
  updateLarkCalendarEvent,
  deleteLarkCalendarEvent,
} from "../lib/lark-client";
import { ConflictError, NotFoundError } from "../lib/errors";
import { assertAllInTenant } from "../lib/tenant-scope";

// ─── Helpers ──────────────────────────────────────────────────

/** Compute [startISO, endISO) for a scheduled_at + duration_min pair. */
function interval(scheduledAt: string, durationMin: number): { start: string; end: string } {
  const end = new Date(scheduledAt);
  end.setMinutes(end.getMinutes() + durationMin);
  return { start: scheduledAt, end: end.toISOString() };
}

/** Throw ConflictError when overlapping appointments exist for clinician. */
async function assertNoConflict(
  db: D1Database,
  tenantId: string,
  clinicianId: string,
  startISO: string,
  endISO: string,
  excludeId?: string,
): Promise<void> {
  const repo = createAppointmentsRepository(db);
  const conflicts = await repo.findConflicts(tenantId, clinicianId, startISO, endISO, excludeId);
  if (conflicts.length > 0) {
    const at = new Date(startISO).toLocaleString("vi-VN");
    throw new ConflictError(
      `Bác sĩ đã có lịch hẹn trùng khung giờ này (${at}). Vui lòng chọn giờ khác.`,
    );
  }
}

// ─── Public API ───────────────────────────────────────────────

export const appointmentsService = {
  list(
    db: D1Database,
    tenantId: string,
    opts: Parameters<ReturnType<typeof createAppointmentsRepository>["list"]>[1],
  ): Promise<Appointment[]> {
    return createAppointmentsRepository(db).list(tenantId, opts);
  },

  async get(db: D1Database, tenantId: string, id: string): Promise<Appointment> {
    const appt = await createAppointmentsRepository(db).getById(tenantId, id);
    if (!appt) throw new NotFoundError("Appointment not found");
    return appt;
  },

  async create(
    db: D1Database,
    tenantId: string,
    userId: string,
    branchId: string,
    input: AppointmentCreateInput,
    encryptionKey?: string,
  ): Promise<Appointment> {
    const repo = createAppointmentsRepository(db);
    const duration = input.duration_min ?? 30;
    const { start, end } = interval(input.scheduled_at, duration);

    // Cross-tenant safety: every referenced ID must belong to this tenant.
    // Prevents attackers from linking a tenant-A appointment to tenant-B
    // patient / clinician / visit rows (H-02).
    await assertAllInTenant(db, tenantId, [
      { table: "branches", id: branchId },
      { table: "patients", id: input.patient_id },
      { table: "users", id: input.clinician_id },
      input.assistant_id ? { table: "users", id: input.assistant_id } : null,
      input.source_visit_id ? { table: "visits", id: input.source_visit_id } : null,
    ]);

    // Conflict check: same clinician, overlapping [start, end)
    await assertNoConflict(db, tenantId, input.clinician_id, start, end);

    const appt = await repo.create(tenantId, {
      branch_id: branchId,
      clinician_id: input.clinician_id,
      patient_id: input.patient_id,
      assistant_id: input.assistant_id,
      source_visit_id: input.source_visit_id,
      scheduled_at: input.scheduled_at,
      duration_min: duration,
      status: "booked",
      procedure: input.procedure,
      notes: input.notes,
      source: input.source ?? "manual",
      created_by: userId,
    });

    await syncToLarkCalendar(db, tenantId, appt, encryptionKey);
    return appt;
  },

  async update(
    db: D1Database,
    tenantId: string,
    id: string,
    input: AppointmentUpdateInput,
    encryptionKey?: string,
  ): Promise<Appointment> {
    const repo = createAppointmentsRepository(db);
    const existing = await repo.getById(tenantId, id);
    if (!existing) throw new NotFoundError("Appointment not found");

    await assertAllInTenant(db, tenantId, [
      { table: "users", id: input.clinician_id ?? undefined },
      { table: "users", id: input.assistant_id ?? undefined },
    ]);

    // Re-check conflicts only if anything affecting time/doctor changed
    const newClinician = input.clinician_id ?? existing.clinician_id;
    const newDuration = input.duration_min ?? existing.duration_min;
    const newScheduledAt = input.scheduled_at ?? existing.scheduled_at;
    const rescheduling =
      input.scheduled_at !== undefined ||
      input.duration_min !== undefined ||
      input.clinician_id !== undefined;

    if (rescheduling) {
      const { start, end } = interval(newScheduledAt, newDuration);
      // Don't conflict-check a cancelled or no_show appointment against itself
      const skipSelf =
        existing.status === "cancelled" || existing.status === "no_show";
      await assertNoConflict(
        db,
        tenantId,
        newClinician,
        start,
        end,
        skipSelf ? undefined : id,
      );
    }

    const updated = await repo.update(tenantId, id, {
      scheduled_at: input.scheduled_at,
      duration_min: input.duration_min,
      clinician_id: input.clinician_id,
      assistant_id: input.assistant_id ?? undefined,
      status: input.status,
      procedure: input.procedure,
      notes: input.notes,
      cancelled_reason: input.cancelled_reason,
    });

    if (!updated) throw new NotFoundError("Appointment not found");

    // Lark sync — update event if rescheduled, delete if cancelled.
    // Hook only when something visible to Lark changed.
    const larkRescheduled =
      existing.lark_event_id &&
      (input.scheduled_at !== undefined ||
        input.duration_min !== undefined ||
        input.procedure !== undefined);
    const larkCancelled =
      existing.lark_event_id && input.status === "cancelled";

    if (larkCancelled) {
      await deleteFromLark(db, tenantId, existing.lark_event_id!, encryptionKey);
      // Clear lark_event_id so we don't try to delete twice
      await createAppointmentsRepository(db).update(tenantId, id, {
        lark_event_id: undefined,
      });
      updated.lark_event_id = undefined;
    } else if (larkRescheduled) {
      await updateInLark(db, tenantId, updated, encryptionKey);
    }

    return updated;
  },

  async cancel(db: D1Database, tenantId: string, id: string, reason?: string): Promise<Appointment> {
    return this.update(db, tenantId, id, { status: "cancelled", cancelled_reason: reason });
  },

  async findConflicts(
    db: D1Database,
    tenantId: string,
    clinicianId: string,
    startISO: string,
    endISO: string,
    excludeId?: string,
  ): Promise<Appointment[]> {
    return createAppointmentsRepository(db).findConflicts(tenantId, clinicianId, startISO, endISO, excludeId);
  },

  /**
   * Get busy intervals (existing appointments) for a clinician on a given date.
   * Frontend uses this to compute free slots via doctor schedule.
   * @param date YYYY-MM-DD
   */
  async getBusySlots(
    db: D1Database,
    tenantId: string,
    clinicianId: string,
    date: string,
  ): Promise<Pick<Appointment, "scheduled_at" | "duration_min" | "id">[]> {
    const dayStart = `${date}T00:00:00.000Z`;
    const dayEnd = `${date}T23:59:59.999Z`;
    const repo = createAppointmentsRepository(db);
    const busy = await repo.list(tenantId, {
      clinicianId,
      from: dayStart,
      to: dayEnd,
    });
    return busy
      .filter((a) => a.status !== "cancelled" && a.status !== "no_show")
      .map((a) => ({ id: a.id, scheduled_at: a.scheduled_at, duration_min: a.duration_min }));
  },
};

/** Resolve Lark credentials from tenant config. Returns null if not configured. */
async function resolveLarkCredentials(
  db: D1Database,
  tenantId: string,
  encryptionKey?: string,
): Promise<{ appId: string; appSecret: string; calendarId: string } | null> {
  if (!encryptionKey) return null;
  try {
    const larkRepo = createLarkConfigRepository(db);
    const config = await larkRepo.getByTenant(tenantId, encryptionKey);
    if (config?.enabled) {
      return {
        appId: config.app_id,
        appSecret: config.app_secret,
        calendarId: config.calendar_id ?? "primary",
      };
    }
  } catch {
    // not configured
  }
  return null;
}

function buildEventPayload(appt: Appointment) {
  const start = new Date(appt.scheduled_at);
  const end = new Date(start.getTime() + appt.duration_min * 60 * 1000);
  const summary = `Lịch hẹn khám`;
  const description = [
    appt.procedure ? `Hạng mục: ${appt.procedure}` : null,
    appt.notes ? `Ghi chú: ${appt.notes}` : null,
    `Mã lịch hẹn: ${appt.id}`,
  ].filter(Boolean).join("\n");
  return {
    summary,
    description,
    start: start.toISOString(),
    end: end.toISOString(),
  };
}

/** Create event in Lark Calendar (rule #7: operational fields only). */
async function syncToLarkCalendar(
  db: D1Database,
  tenantId: string,
  appt: Appointment,
  encryptionKey?: string,
): Promise<void> {
  const creds = await resolveLarkCredentials(db, tenantId, encryptionKey);
  if (!creds) return;

  try {
    const payload = buildEventPayload(appt);
    const result = await createLarkCalendarEvent(creds.appId, creds.appSecret, {
      ...payload,
      calendarId: creds.calendarId,
    });
    await createAppointmentsRepository(db).update(tenantId, appt.id, {
      lark_event_id: result.eventId,
    });
  } catch (err) {
    console.warn(`[appointments] Lark sync failed for ${appt.id}:`, err);
  }
}

/** Update existing Lark event (after reschedule). Silently skips if not configured. */
async function updateInLark(
  db: D1Database,
  tenantId: string,
  appt: Appointment,
  encryptionKey?: string,
): Promise<void> {
  if (!appt.lark_event_id) return;
  const creds = await resolveLarkCredentials(db, tenantId, encryptionKey);
  if (!creds) return;
  try {
    const payload = buildEventPayload(appt);
    await updateLarkCalendarEvent(creds.appId, creds.appSecret, appt.lark_event_id, {
      ...payload,
      calendarId: creds.calendarId,
    });
  } catch (err) {
    console.warn(`[appointments] Lark update failed for ${appt.id}:`, err);
  }
}

/** Delete Lark event (after cancel). Silently skips if not configured. */
async function deleteFromLark(
  db: D1Database,
  tenantId: string,
  eventId: string,
  encryptionKey?: string,
): Promise<void> {
  const creds = await resolveLarkCredentials(db, tenantId, encryptionKey);
  if (!creds) return;
  try {
    await deleteLarkCalendarEvent(creds.appId, creds.appSecret, eventId, creds.calendarId);
  } catch (err) {
    console.warn(`[appointments] Lark delete failed for ${eventId}:`, err);
  }
}
