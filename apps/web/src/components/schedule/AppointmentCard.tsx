import type { Appointment } from "@shared/types";
import { APPOINTMENT_STATUS_LABELS } from "@shared/constants";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { formatTime, isoToYmd } from "@/lib/utils";
import { cn } from "@/lib/utils";

interface AppointmentCardProps {
  appointment: Appointment;
  patientName?: string;
  doctorName?: string;
  onClick?: () => void;
  compact?: boolean;
}

const statusVariant: Record<string, "default" | "success" | "warning" | "destructive" | "secondary" | "outline"> = {
  booked: "outline",
  confirmed: "default",
  arrived: "warning",
  completed: "success",
  cancelled: "destructive",
  no_show: "secondary",
};

const statusBorder: Record<string, string> = {
  booked: "border-l-slate-400",
  confirmed: "border-l-blue-500",
  arrived: "border-l-amber-500",
  completed: "border-l-emerald-500",
  cancelled: "border-l-red-400",
  no_show: "border-l-slate-300",
};

export function AppointmentCard({
  appointment,
  patientName,
  doctorName,
  onClick,
  compact,
}: AppointmentCardProps) {
  const endTime = new Date(new Date(appointment.scheduled_at).getTime() + appointment.duration_min * 60 * 1000);
  const endIso = endTime.toISOString();
  const label = APPOINTMENT_STATUS_LABELS[appointment.status];
  const borderClass = statusBorder[appointment.status] ?? "border-l-slate-300";

  return (
    <Card
      className={cn(
        "cursor-pointer border-l-4 transition-colors hover:bg-accent/30",
        borderClass,
        compact ? "py-1" : "",
      )}
      onClick={onClick}
    >
      <CardContent className={cn("p-3", compact ? "p-2" : "")}>
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            {!compact && (
              <p className="mb-0.5 text-xs text-muted-foreground">{isoToYmd(appointment.scheduled_at)}</p>
            )}
            <div className="flex items-center gap-2 text-sm font-medium">
              <span>{formatTime(appointment.scheduled_at)}</span>
              <span className="text-muted-foreground">–</span>
              <span className="text-muted-foreground">{formatTime(endIso)}</span>
              <span className="text-xs text-muted-foreground">({appointment.duration_min}p)</span>
            </div>
            {!compact && (
              <p className="mt-1 truncate text-sm">
                {patientName ?? <span className="font-mono text-xs text-muted-foreground">{appointment.patient_id.slice(0, 8)}…</span>}
              </p>
            )}
            {!compact && (appointment.procedure || doctorName || appointment.notes) && (
              <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                {appointment.procedure && <Badge variant="outline" className="text-[10px]">{appointment.procedure}</Badge>}
                {doctorName && <span>BS: {doctorName}</span>}
              </div>
            )}
            {!compact && appointment.notes && (
              <p className="mt-1 truncate text-xs text-muted-foreground italic">
                💬 {appointment.notes}
              </p>
            )}
          </div>
          <Badge variant={statusVariant[appointment.status] ?? "outline"} className="shrink-0">
            {label}
          </Badge>
        </div>
        {appointment.cancelled_reason && (
          <p className="mt-2 text-xs text-destructive">Lý do hủy: {appointment.cancelled_reason}</p>
        )}
      </CardContent>
    </Card>
  );
}