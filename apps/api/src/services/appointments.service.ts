/**
 * Appointments service — creates appointments and syncs to Lark Calendar.
 *
 * Architecture rule #7: ONLY operational fields to Lark.
 * (patient name, phone, scheduled time — no clinical details.)
 */

import type { D1Database } from "@cloudflare/workers-types";
import type { Appointment } from "@shared/types";
import type { AppointmentCreateInput, AppointmentUpdateInput } from "@shared/validation";
import { createAppointmentsRepository } from "../repositories/appointments.repo";
import { createLarkConfigRepository } from "../repositories/lark-config.repo";
import { createLarkCalendarEvent } from "../lib/lark-client";
import { NotFoundError } from "../lib/errors";

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
    input: AppointmentCreateInput,
    encryptionKey?: string,
  ): Promise<Appointment> {
    const repo = createAppointmentsRepository(db);

    const appt = await repo.create(tenantId, {
      patient_id: input.patient_id,
      branch_id: input.branch_id,
      doctor_id: input.doctor_id,
      doctor_name: undefined,
      scheduled_at: input.scheduled_at,
      duration_minutes: input.duration_minutes ?? 60,
      room: input.room,
      notes: input.notes,
      status: "scheduled",
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

    const updated = await repo.update(tenantId, id, {
      scheduled_at: input.scheduled_at,
      duration_minutes: input.duration_minutes,
      room: input.room,
      notes: input.notes,
      status: input.status,
      doctor_id: input.doctor_id ?? undefined,
      doctor_name: input.doctor_name ?? undefined,
    });

    if (updated && (input.scheduled_at || input.status)) {
      await syncToLarkCalendar(db, tenantId, updated, encryptionKey);
    }

    return updated!;
  },

  async cancel(db: D1Database, tenantId: string, id: string): Promise<Appointment> {
    return this.update(db, tenantId, id, { status: "cancelled" });
  },
};

/** Only operational fields sent to Lark (rule #7). Silently skips if not configured. */
async function syncToLarkCalendar(
  db: D1Database,
  tenantId: string,
  appt: Appointment,
  encryptionKey?: string,
): Promise<void> {
  let appId: string | undefined;
  let appSecret: string | undefined;
  let calendarId: string | undefined;

  if (encryptionKey) {
    try {
      const larkRepo = createLarkConfigRepository(db);
      const config = await larkRepo.getByTenant(tenantId, encryptionKey);
      if (config?.enabled) {
        appId = config.app_id;
        appSecret = config.app_secret;
        calendarId = config.calendar_id ?? undefined;
      }
    } catch {
      // not configured — skip
    }
  }

  if (!appId || !appSecret) return;

  try {
    const start = new Date(appt.scheduled_at);
    const end = new Date(start.getTime() + appt.duration_minutes * 60 * 1000);

    const summary = `Lịch hẹn: ${appt.patient_name ?? "Bệnh nhân"}`;
    const description = [
      `Bệnh nhân: ${appt.patient_name ?? "—"}`,
      appt.patient_phone ? `SĐT: ${appt.patient_phone}` : null,
      appt.room ? `Phòng: ${appt.room}` : null,
      appt.doctor_name ? `Bác sĩ: ${appt.doctor_name}` : null,
      appt.notes ? `Ghi chú: ${appt.notes}` : null,
      `Mã lịch hẹn: ${appt.id}`,
    ].filter(Boolean).join("\n");

    const result = await createLarkCalendarEvent(appId, appSecret, {
      summary, description,
      start: start.toISOString(),
      end: end.toISOString(),
      calendarId: calendarId ?? "primary",
    });

    await createAppointmentsRepository(db).updateLarkEventId(tenantId, appt.id, result.eventId);
  } catch (err) {
    console.warn(`[appointments] Lark sync failed for ${appt.id}:`, err);
  }
}
