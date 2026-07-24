import { useMemo } from "react";
import type { Appointment, ClinicSchedule, DentalChair, Patient, UserWithDetails } from "@shared/types";
import { isDoctorRole } from "@shared/constants";
import { formatTime, isoToTime } from "@/lib/utils";
import {
  buildTimelineRows,
  getOverlapOffsets,
  getTimelineBounds,
  isOutsideOperatingHours,
  minutesToTime,
  timeToMinutes,
  timelineHeight,
  timelineTop,
  TIMELINE_ROW_HEIGHT,
} from "@/lib/appointment-timeline";

type ResourceMode = "doctor" | "chair";

interface AppointmentTimelineProps {
  appointments: Appointment[];
  date: Date;
  schedules: ClinicSchedule[];
  users: UserWithDetails[];
  chairs: DentalChair[];
  patientsById: Map<string, Patient>;
  now: Date;
  mode: ResourceMode;
  onModeChange: (mode: ResourceMode) => void;
  onAppointmentClick: (appointment: Appointment) => void;
  onEmptySlotClick: (input: { time: string; clinicianId?: string; chairId?: string }) => void;
}

export function AppointmentTimeline({
  appointments,
  date,
  schedules,
  users,
  chairs,
  patientsById,
  now,
  mode,
  onModeChange,
  onAppointmentClick,
  onEmptySlotClick,
}: AppointmentTimelineProps) {
  const bounds = useMemo(() => getTimelineBounds(date, schedules, appointments), [date, schedules, appointments]);
  const rows = useMemo(() => buildTimelineRows(bounds), [bounds]);
  const resources = useMemo(() => {
    if (mode === "doctor") {
      return users.filter((user) => isDoctorRole(user.role_key, user.role_id, user.role_name)).map((user) => ({ id: user.id, label: user.name }));
    }
    const assigned = chairs.filter((chair) => chair.is_active).map((chair) => ({ id: chair.id, label: chair.room_name ? `${chair.name} · ${chair.room_name}` : chair.name }));
    return appointments.some((appointment) => !appointment.chair_id) ? [{ id: "__unassigned__", label: "Chưa gán ghế" }, ...assigned] : assigned;
  }, [appointments, chairs, mode, users]);
  const columns = useMemo(() => new Map(resources.map((resource) => [resource.id, [] as Appointment[]])), [resources]);
  appointments.forEach((appointment) => {
    const resourceId = mode === "doctor" ? appointment.clinician_id : appointment.chair_id ?? "__unassigned__";
    columns.get(resourceId)?.push(appointment);
  });
  const offsets = useMemo(() => new Map(resources.map((resource) => [resource.id, getOverlapOffsets(columns.get(resource.id) ?? [])])), [columns, resources]);
  const isToday = date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth() && date.getDate() === now.getDate();
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const hasCurrentMarker = isToday && nowMinutes >= bounds.displayStart && nowMinutes <= bounds.displayEnd;
  const totalHeight = rows.length * TIMELINE_ROW_HEIGHT;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="inline-flex rounded-lg border p-1 text-sm">
          <button type="button" className={`rounded-md px-3 py-1.5 ${mode === "doctor" ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`} onClick={() => onModeChange("doctor")}>Bác sĩ</button>
          <button type="button" className={`rounded-md px-3 py-1.5 ${mode === "chair" ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`} onClick={() => onModeChange("chair")}>Ghế nha</button>
        </div>
        <p className={`text-xs ${bounds.isClosed ? "font-medium text-destructive" : "text-muted-foreground"}`}>
          {bounds.isClosed ? "Chi nhánh đóng cửa. Không thể tạo lịch mới từ lưới." : `Giờ hoạt động: ${minutesToTime(bounds.configuredStart)} - ${minutesToTime(bounds.configuredEnd)}`}
        </p>
      </div>
      {resources.length === 0 ? <p className="py-12 text-center text-sm text-muted-foreground">Chưa có {mode === "doctor" ? "bác sĩ" : "ghế nha"} khả dụng tại chi nhánh này.</p> : (
        <div className="overflow-auto rounded-lg border">
          <div className="min-w-[760px]">
            <div className="sticky top-0 z-20 grid border-b bg-background" style={{ gridTemplateColumns: `76px repeat(${resources.length}, minmax(210px, 1fr))` }}>
              <div className="sticky left-0 z-30 border-r bg-background px-2 py-3 text-xs font-medium text-muted-foreground">Giờ</div>
              {resources.map((resource) => <div key={resource.id} className="border-r px-3 py-3 text-sm font-semibold last:border-r-0">{resource.label}</div>)}
            </div>
            <div className="grid" style={{ gridTemplateColumns: `76px repeat(${resources.length}, minmax(210px, 1fr))` }}>
              <div className="sticky left-0 z-10 border-r bg-background" style={{ height: totalHeight }}>
                {rows.map((minute) => <div key={minute} className="border-b pr-2 pt-1 text-right text-xs tabular-nums text-muted-foreground" style={{ height: TIMELINE_ROW_HEIGHT }}>{minutesToTime(minute)}</div>)}
              </div>
              {resources.map((resource) => {
                const resourceAppointments = columns.get(resource.id) ?? [];
                const resourceOffsets = offsets.get(resource.id) ?? new Map<string, number>();
                return <div key={resource.id} className={`relative border-r last:border-r-0 ${bounds.isClosed ? "bg-muted/50" : "bg-background"}`} style={{ height: totalHeight }}>
                  {rows.map((minute) => <button key={minute} type="button" aria-label={`Tạo lịch lúc ${minutesToTime(minute)} cho ${resource.label}`} disabled={bounds.isClosed} onClick={() => onEmptySlotClick({ time: minutesToTime(minute), ...(mode === "doctor" ? { clinicianId: resource.id } : resource.id !== "__unassigned__" ? { chairId: resource.id } : {}) })} className="block w-full border-b text-left hover:bg-primary/5 disabled:cursor-not-allowed" style={{ height: TIMELINE_ROW_HEIGHT }} />)}
                  {resourceAppointments.map((appointment) => {
                    const offset = resourceOffsets.get(appointment.id) ?? 0;
                    const outsideHours = isOutsideOperatingHours(appointment, bounds);
                    return <button key={appointment.id} type="button" onClick={(event) => { event.stopPropagation(); onAppointmentClick(appointment); }} className={`absolute z-10 overflow-hidden rounded-md border-l-4 px-2 py-1 text-left text-xs shadow-sm transition-shadow hover:z-20 hover:shadow-md ${statusClass(appointment.status)} ${outsideHours ? "ring-1 ring-destructive" : ""}`} style={{ top: timelineTop(timeToMinutes(isoToTime(appointment.scheduled_at)), bounds) + 2, height: timelineHeight(appointment.duration_min) - 4, left: `${4 + offset * 12}px`, right: `${4 + offset * 12}px` }}>
                      <span className="block truncate font-semibold">{patientsById.get(appointment.patient_id)?.name ?? appointment.patient_id.slice(0, 8)}</span>
                      <span className="block truncate text-[10px] opacity-80">{formatTime(appointment.scheduled_at)} · {appointment.duration_min}p{appointment.procedure ? ` · ${appointment.procedure}` : ""}</span>
                      {outsideHours && <span className="block text-[10px] font-medium text-destructive">Ngoài giờ</span>}
                    </button>;
                  })}
                  {hasCurrentMarker && <div className="pointer-events-none absolute z-30 left-0 right-0 border-t border-dashed border-red-500" style={{ top: timelineTop(nowMinutes, bounds) }}><span className="absolute -top-3 right-1 rounded bg-red-500 px-1 text-[9px] font-semibold text-white">Hiện tại</span></div>}
                </div>;
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function statusClass(status: Appointment["status"]): string {
  switch (status) {
    case "confirmed": return "border-l-blue-500 bg-blue-50 text-blue-950 dark:bg-blue-950/50 dark:text-blue-100";
    case "arrived": return "border-l-amber-500 bg-amber-50 text-amber-950 dark:bg-amber-950/50 dark:text-amber-100";
    case "in_progress": return "border-l-violet-500 bg-violet-50 text-violet-950 dark:bg-violet-950/50 dark:text-violet-100";
    case "completed": return "border-l-emerald-500 bg-emerald-50 text-emerald-950 dark:bg-emerald-950/50 dark:text-emerald-100";
    case "cancelled": return "border-l-red-400 bg-red-50/70 text-red-950 opacity-60 dark:bg-red-950/30 dark:text-red-100";
    case "no_show": return "border-l-slate-400 bg-slate-50 text-slate-700 opacity-60 dark:bg-slate-900/50 dark:text-slate-200";
    default: return "border-l-slate-500 bg-slate-50 text-slate-950 dark:bg-slate-900/50 dark:text-slate-100";
  }
}
