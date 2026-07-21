import { ValidationError } from "./errors";

export const APPOINTMENT_MIN_LEAD_MINUTES = 5;

export function assertAppointmentIsSchedulable(scheduledAt: string, now = new Date()): void {
  const appointmentTime = new Date(scheduledAt);
  if (!Number.isFinite(appointmentTime.getTime())) {
    throw new ValidationError("Thời gian lịch hẹn không hợp lệ");
  }

  const earliestAllowed = now.getTime() + APPOINTMENT_MIN_LEAD_MINUTES * 60_000;
  if (appointmentTime.getTime() < earliestAllowed) {
    throw new ValidationError(
      `Thời gian lịch hẹn phải sau thời điểm hiện tại ít nhất ${APPOINTMENT_MIN_LEAD_MINUTES} phút`,
    );
  }
}
