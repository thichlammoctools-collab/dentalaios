import type { Appointment, ClinicSchedule } from "@shared/types";
import { getWeekday, isoToTime } from "@/lib/utils";

export const TIMELINE_SLOT_MINUTES = 30;
export const TIMELINE_ROW_HEIGHT = 48;

export interface TimelineBounds {
  configuredStart: number;
  configuredEnd: number;
  displayStart: number;
  displayEnd: number;
  isClosed: boolean;
}

export function timeToMinutes(time: string): number {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
}

export function minutesToTime(minutes: number): string {
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

export function getTimelineBounds(date: Date, schedules: ClinicSchedule[], appointments: Appointment[]): TimelineBounds {
  const schedule = schedules.find((entry) => entry.weekday === getWeekday(date));
  const configuredStart = timeToMinutes(schedule?.open_time ?? "08:00");
  const configuredEnd = timeToMinutes(schedule?.close_time ?? "20:00");
  const appointmentMinutes = appointments.flatMap((appointment) => {
    const start = timeToMinutes(isoToTime(appointment.scheduled_at));
    return [start, start + appointment.duration_min];
  });

  return {
    configuredStart,
    configuredEnd,
    displayStart: Math.min(configuredStart, ...appointmentMinutes),
    displayEnd: Math.max(configuredEnd, ...appointmentMinutes),
    isClosed: schedule?.is_closed ?? false,
  };
}

export function timelineTop(minutes: number, bounds: TimelineBounds): number {
  return ((minutes - bounds.displayStart) / TIMELINE_SLOT_MINUTES) * TIMELINE_ROW_HEIGHT;
}

export function timelineHeight(durationMinutes: number): number {
  return Math.max((durationMinutes / TIMELINE_SLOT_MINUTES) * TIMELINE_ROW_HEIGHT, 26);
}

export function buildTimelineRows(bounds: TimelineBounds): number[] {
  const start = Math.floor(bounds.displayStart / TIMELINE_SLOT_MINUTES) * TIMELINE_SLOT_MINUTES;
  const end = Math.ceil(bounds.displayEnd / TIMELINE_SLOT_MINUTES) * TIMELINE_SLOT_MINUTES;
  return Array.from({ length: (end - start) / TIMELINE_SLOT_MINUTES }, (_, index) => start + index * TIMELINE_SLOT_MINUTES);
}

export function isOutsideOperatingHours(appointment: Appointment, bounds: TimelineBounds): boolean {
  const start = timeToMinutes(isoToTime(appointment.scheduled_at));
  return start < bounds.configuredStart || start + appointment.duration_min > bounds.configuredEnd;
}

export function getOverlapOffsets(appointments: Appointment[]): Map<string, number> {
  const offsets = new Map<string, number>();
  const active: Array<{ end: number; offset: number }> = [];
  const sorted = [...appointments].sort((left, right) => left.scheduled_at.localeCompare(right.scheduled_at));

  for (const appointment of sorted) {
    const start = timeToMinutes(isoToTime(appointment.scheduled_at));
    const end = start + appointment.duration_min;
    for (let index = active.length - 1; index >= 0; index -= 1) {
      if (active[index].end <= start) active.splice(index, 1);
    }
    const usedOffsets = new Set(active.map((entry) => entry.offset));
    let offset = 0;
    while (usedOffsets.has(offset)) offset += 1;
    offsets.set(appointment.id, offset);
    active.push({ end, offset });
  }
  return offsets;
}
