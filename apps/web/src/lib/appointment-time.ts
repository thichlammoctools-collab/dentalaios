import { combineDateTime, ymd } from "@/lib/utils";

export const APPOINTMENT_MIN_LEAD_MINUTES = 5;
export const APPOINTMENT_SLOT_MINUTES = 15;

export interface AppointmentSlot {
  date: string;
  time: string;
}

export function getNextAppointmentSlot(now = new Date()): AppointmentSlot {
  const minimum = new Date(now.getTime() + APPOINTMENT_MIN_LEAD_MINUTES * 60_000);
  minimum.setSeconds(0, 0);
  const remainder = minimum.getMinutes() % APPOINTMENT_SLOT_MINUTES;
  if (remainder !== 0) {
    minimum.setMinutes(minimum.getMinutes() + APPOINTMENT_SLOT_MINUTES - remainder);
  }
  return { date: ymd(minimum), time: localTime(minimum) };
}

export function getMinimumAppointmentTime(date: string, now = new Date()): string | undefined {
  const minimum = getNextAppointmentSlot(now);
  if (date < minimum.date) return minimum.time;
  return date === minimum.date ? minimum.time : undefined;
}

export function isAppointmentTimeInPast(date: string, time: string, now = new Date()): boolean {
  const appointmentTime = new Date(combineDateTime(date, time));
  return appointmentTime.getTime() < now.getTime() + APPOINTMENT_MIN_LEAD_MINUTES * 60_000;
}

function localTime(value: Date): string {
  return `${String(value.getHours()).padStart(2, "0")}:${String(value.getMinutes()).padStart(2, "0")}`;
}
