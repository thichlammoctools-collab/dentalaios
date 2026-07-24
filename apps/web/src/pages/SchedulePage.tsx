import { useEffect, useMemo, useState, type CSSProperties, type DragEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { DateInput } from "@/components/ui/date-input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { AppointmentForm } from "@/components/schedule/AppointmentForm";
import { AppointmentTimeline } from "@/components/schedule/AppointmentTimeline";
import { ProfileAvatar } from "@/components/ProfileAvatar";
import { apiDelete, apiGet, apiPatch, apiPost, ApiError } from "@/lib/api";
import { toast } from "@/lib/toast";
import { useAuth } from "@/lib/auth-context";
import type { Appointment, AppointmentStatus, ClinicSchedule, DentalChair, Patient, UserWithDetails } from "@shared/types";
import { isAssistantRole, isDoctorRole, ROUTES } from "@shared/constants";
import { formatDate, formatTime, getWeekDays, isoToTime, isoToYmd, weekdayLabel, ymd, combineDateTime } from "@/lib/utils";
import { getMinimumAppointmentTime, isAppointmentTimeInPast } from "@/lib/appointment-time";
import { PageContainer } from "@/components/PageContainer";

interface AppointmentsResponse { items: Appointment[]; total: number }
interface PatientsResponse { items: Patient[]; total: number }
interface UsersResponse { items: UserWithDetails[]; total: number }
interface ChairsResponse { items: DentalChair[]; total: number }
interface ClinicSchedulesResponse { items: ClinicSchedule[]; total: number }

export function SchedulePage() {
  const { session } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const selectedBranchId = searchParams.get("branch_id") ?? "";
  const boardBranchId = selectedBranchId || session?.branch?.id || "";
  const requestedStatusValue = searchParams.get("status") ?? "";
  const requestedStatuses = requestedStatusValue.split(",").filter(Boolean);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [users, setUsers] = useState<UserWithDetails[]>([]);
  const [chairs, setChairs] = useState<DentalChair[]>([]);
  const [clinicSchedules, setClinicSchedules] = useState<ClinicSchedule[]>([]);
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<Appointment | null>(null);
  const [updatingStatusId, setUpdatingStatusId] = useState<string | null>(null);
  const [refreshTick, setRefreshTick] = useState(0);
  const [now, setNow] = useState(() => new Date());
  const [expandedWeekDay, setExpandedWeekDay] = useState<string | null>(null);
  const [timelineMode, setTimelineMode] = useState<"doctor" | "chair">("doctor");
  const [timelinePrefill, setTimelinePrefill] = useState<{ time?: string; clinicianId?: string; chairId?: string }>({});

  // Filters apply to both schedule views.
  const [filterStatuses, setFilterStatuses] = useState<Set<string>>(() => new Set(requestedStatuses));
  const [filterClinician, setFilterClinician] = useState("");
  const [filterAssistant, setFilterAssistant] = useState("");

  useEffect(() => {
    setFilterStatuses(new Set(requestedStatuses));
  }, [requestedStatusValue]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  // Compute week range from selectedDate
  const weekDays = useMemo(() => getWeekDays(selectedDate), [selectedDate]);
  const weekStart = ymd(weekDays[0]);
  const weekEnd = ymd(weekDays[6]);
  const threeDayDates = useMemo(() => Array.from({ length: 3 }, (_, index) => {
    const date = new Date(selectedDate);
    date.setDate(date.getDate() + index);
    return date;
  }), [selectedDate]);

  useEffect(() => {
    let mounted = true;
    const from = new Date(weekDays[0]);
    from.setHours(0, 0, 0, 0);
    const to = new Date(weekDays[6]);
    const threeDayEnd = threeDayDates[2];
    if (threeDayEnd > to) to.setTime(threeDayEnd.getTime());
    to.setHours(23, 59, 59, 999);

    const appointmentQuery = new URLSearchParams({
      from: from.toISOString(),
      to: to.toISOString(),
      ...(selectedBranchId ? { branch_id: selectedBranchId } : {}),
    });

    Promise.all([
      apiGet<AppointmentsResponse>(`/api/appointments?${appointmentQuery}`),
      apiGet<PatientsResponse>(`/api/patients?limit=200`),
      boardBranchId
        ? apiGet<UsersResponse>(`/api/users/branch/${boardBranchId}`)
        : Promise.resolve({ items: [] as UserWithDetails[] }),
      boardBranchId
        ? apiGet<ChairsResponse>(`/api/chairs?branch_id=${boardBranchId}`)
        : Promise.resolve({ items: [] as DentalChair[], total: 0 }),
      boardBranchId
        ? apiGet<ClinicSchedulesResponse>(`/api/schedules/clinic/${boardBranchId}`)
        : Promise.resolve({ items: [] as ClinicSchedule[], total: 0 }),
    ]).then(([appts, pats, us, chairResponse, scheduleResponse]) => {
      if (!mounted) return;
      setAppointments(appts.items);
      setPatients(pats.items);
      setUsers(us.items);
      setChairs(chairResponse.items);
      setClinicSchedules(scheduleResponse.items);
    }).catch((err) => console.error(err))
      .finally(() => mounted && setLoading(false));

    return () => { mounted = false; };
  }, [weekDays, threeDayDates, refreshTick, selectedBranchId, boardBranchId]);

  const patientsById = useMemo(() => {
    const m = new Map<string, Patient>();
    patients.forEach((p) => m.set(p.id, p));
    return m;
  }, [patients]);

  const usersById = useMemo(() => {
    const m = new Map<string, UserWithDetails>();
    users.forEach((u) => m.set(u.id, u));
    return m;
  }, [users]);


  const filteredAppointments = appointments
    .filter((a) => filterStatuses.size === 0 || filterStatuses.has(a.status))
    .filter((a) => !filterClinician || a.clinician_id === filterClinician)
    .filter((a) => !filterAssistant || (
      filterAssistant === "__none__" ? !a.assistant_id : a.assistant_id === filterAssistant
    ));

  // Day view: use the same filters as the week view.
  const dayAppts = filteredAppointments
    .filter((a) => isoToYmd(a.scheduled_at) === ymd(selectedDate))
    .sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at));

  function toggleStatus(s: string) {
    setFilterStatuses((prev) => {
      const next = new Set(prev);
      if (next.has(s)) next.delete(s);
      else next.add(s);
      return next;
    });
  }

  // Week view: bucket by date
  const weekByDate = useMemo(() => {
    const m = new Map<string, Appointment[]>();
    filteredAppointments.forEach((a) => {
      const key = isoToYmd(a.scheduled_at);
      const arr = m.get(key) ?? [];
      arr.push(a);
      m.set(key, arr);
    });
    return m;
  }, [filteredAppointments]);

  const hasExpandedWeekDay = expandedWeekDay !== null && weekDays.some((day) => ymd(day) === expandedWeekDay);
  const weekGridColumns = hasExpandedWeekDay
    ? weekDays.map((day) => ymd(day) === expandedWeekDay ? "minmax(280px, 2.6fr)" : "minmax(120px, 1fr)").join(" ")
    : "repeat(7, minmax(0, 1fr))";

  function shiftDay(days: number) {
    const d = new Date(selectedDate);
    d.setDate(d.getDate() + days);
    setSelectedDate(d);
  }

  async function handleCancel(appointment: Appointment): Promise<boolean> {
    if (!confirm("Hủy lịch hẹn này? Lịch hẹn sẽ được lưu trong lịch sử với trạng thái đã hủy.")) {
      return false;
    }

    const reason = prompt("Lý do hủy lịch (không bắt buộc):");
    if (reason === null) return false;

    try {
      await apiDelete(`/api/appointments/${appointment.id}`, { reason: reason.trim() || undefined });
      setAppointments((prev) => prev.map((item) => (
        item.id === appointment.id
          ? { ...item, status: "cancelled", cancelled_reason: reason.trim() || undefined }
          : item
      )));
      toast.success("Đã hủy lịch hẹn");
      return true;
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Lỗi hủy lịch hẹn");
      return false;
    }
  }

  async function updateAppointmentStatus(appointment: Appointment, status: AppointmentStatus) {
    if (status === appointment.status || updatingStatusId || new Date(appointment.scheduled_at) < now) return;
    if (["cancelled", "no_show", "completed"].includes(status) && !confirm(`Bạn có chắc chắn muốn chuyển trạng thái thành ${statusLabelVi(status)} không?`)) {
      return;
    }

    const previous = appointment;
    setUpdatingStatusId(appointment.id);
    setAppointments((current) => current.map((item) => item.id === appointment.id ? { ...item, status } : item));
    try {
      const updated = await apiPatch<Appointment>(`/api/appointments/${appointment.id}`, { status });
      setAppointments((current) => current.map((item) => item.id === updated.id ? updated : item));
      toast.success(`Đã cập nhật trạng thái thành ${statusLabelVi(updated.status)}`);
    } catch (err) {
      setAppointments((current) => current.map((item) => item.id === previous.id ? previous : item));
      toast.error(err instanceof ApiError ? err.message : "Không thể cập nhật trạng thái lịch hẹn");
    } finally {
      setUpdatingStatusId(null);
    }
  }

  function canMoveAppointment(appointment: Appointment): boolean {
    return appointment.status !== "cancelled" && !isPastAppointment(appointment);
  }

  function isPastAppointment(appointment: Appointment): boolean {
    return new Date(appointment.scheduled_at).getTime() < now.getTime();
  }

  function resolveAvailableTime(appointment: Appointment, requestedAt: Date): Date {
    const minimum = new Date(now.getTime() + 5 * 60_000);
    minimum.setSeconds(0, 0);
    const remainder = minimum.getMinutes() % 15;
    if (remainder) minimum.setMinutes(minimum.getMinutes() + 15 - remainder);

    let candidate = new Date(Math.max(requestedAt.getTime(), minimum.getTime()));
    while (true) {
      const candidateEnd = candidate.getTime() + appointment.duration_min * 60_000;
      const conflicts = appointments.filter((item) => {
        if (item.id === appointment.id || ["cancelled", "no_show"].includes(item.status)) return false;
        const sharesResource = item.clinician_id === appointment.clinician_id
          || item.patient_id === appointment.patient_id
          || Boolean(appointment.chair_id && item.chair_id === appointment.chair_id);
        if (!sharesResource) return false;
        const itemStart = new Date(item.scheduled_at).getTime();
        const itemEnd = itemStart + item.duration_min * 60_000;
        return candidate.getTime() < itemEnd && candidateEnd > itemStart;
      });
      if (conflicts.length === 0) return candidate;
      candidate = new Date(Math.max(...conflicts.map((item) => new Date(item.scheduled_at).getTime() + item.duration_min * 60_000)));
    }
  }

  async function handleAppointmentDrop(event: DragEvent<HTMLElement>, date: Date) {
    event.preventDefault();
    const appointmentId = event.dataTransfer.getData("application/x-appointment-id");
    const appointment = appointments.find((item) => item.id === appointmentId);
    if (!appointment || !canMoveAppointment(appointment)) return;

    if (!confirm("Bạn có chắc chắn muốn đổi lịch không?")) return;

    const original = new Date(appointment.scheduled_at);
    const requestedAt = new Date(date);
    requestedAt.setHours(original.getHours(), original.getMinutes(), 0, 0);
    const scheduledAt = resolveAvailableTime(appointment, requestedAt);
    try {
      const updated = await apiPatch<Appointment>(`/api/appointments/${appointment.id}`, {
        scheduled_at: scheduledAt.toISOString(),
      });
      setAppointments((current) => current.map((item) => item.id === updated.id ? updated : item));
      if (scheduledAt.getTime() !== requestedAt.getTime()) {
        toast.success(`Đã đổi lịch sang ${formatDate(scheduledAt.toISOString())} ${formatTime(scheduledAt.toISOString())} để tránh trùng lịch`);
      } else {
        toast.success("Đã đổi lịch hẹn");
      }
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Không thể đổi lịch hẹn");
    }
  }

  async function handleDuplicate(appointment: Appointment) {
    const scheduledAt = resolveAvailableTime(appointment, new Date());
    try {
      const created = await apiPost<Appointment>("/api/appointments", {
        branch_id: appointment.branch_id,
        patient_id: appointment.patient_id,
        clinician_id: appointment.clinician_id,
        assistant_id: appointment.assistant_id,
        chair_id: appointment.chair_id,
        scheduled_at: scheduledAt.toISOString(),
        duration_min: appointment.duration_min,
        procedure: appointment.procedure,
        notes: appointment.notes,
      });
      setAppointments((current) => [...current, created]);
      toast.success("Đã nhân bản lịch hẹn");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Không thể nhân bản lịch hẹn");
    }
  }


  return (
    <PageContainer size="workspace">
      {/* Header */}
      <div className="overflow-hidden rounded-2xl bg-gradient-to-br from-purple-600 via-indigo-600 to-blue-700 p-5 text-white shadow-lg sm:p-8">
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Lịch hẹn</h1>
        <p className="mt-1 text-sm text-blue-100 sm:text-base">
          {selectedDate.toLocaleDateString("vi-VN", { weekday: "long", day: "2-digit", month: "long", year: "numeric" })}
        </p>
        {selectedBranchId && (
          <p className="mt-1 text-xs text-blue-100">
            Đang lọc theo chi nhánh được chọn từ tổng quan quản trị.
          </p>
        )}
        <div className="mt-4 flex flex-wrap gap-2 sm:mt-6 sm:gap-3">
            <Button
              className="bg-white text-blue-700 hover:bg-blue-50"
              onClick={() => {
                setTimelinePrefill({});
                setCreateOpen(true);
              }}
          >
            + Tạo lịch hẹn
          </Button>
          <Button asChild variant="outline" className="border-white/30 bg-white/10 text-white hover:bg-white/20">
            <Link to={ROUTES.TODAY}>Dashboard hôm nay</Link>
          </Button>
        </div>
      </div>

      <Tabs defaultValue="day">
        <TabsList>
          <TabsTrigger value="day">Ngày</TabsTrigger>
          <TabsTrigger value="three-days">3 ngày</TabsTrigger>
          <TabsTrigger value="week">Tuần</TabsTrigger>
        </TabsList>

        {/* Filters apply to both day and week views. */}
        <div className="mt-4 space-y-2 rounded-lg border border-border bg-muted/20 p-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-medium text-muted-foreground">Trạng thái:</span>
            {(["booked", "confirmed", "arrived", "in_progress", "completed", "cancelled", "no_show"] as const).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => toggleStatus(s)}
                className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium transition-all ${filterStatuses.size === 0 || filterStatuses.has(s) ? statusBgClass(s) : "bg-muted/40 text-muted-foreground opacity-50 line-through"}`}
              >
                {statusLabelVi(s)}
              </button>
            ))}
            {filterStatuses.size > 0 && (
              <button
                type="button"
                onClick={() => setFilterStatuses(new Set())}
                className="text-[11px] text-blue-600 hover:underline"
              >
                Xóa trạng thái
              </button>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1.5">
              <Label htmlFor="filter-doctor" className="text-xs">BS:</Label>
              <Select
                id="filter-doctor"
                value={filterClinician}
                onChange={(e) => setFilterClinician(e.target.value)}
                className="h-7 w-44 text-xs"
              >
                <option value="">Tất cả</option>
                {users.filter((u) => isDoctorRole(u.role_key, u.role_id, u.role_name)).map((d) => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </Select>
            </div>

            {users.some((u) => isAssistantRole(u.role_key, u.role_id, u.role_name)) && (
              <div className="flex items-center gap-1.5">
                <Label htmlFor="filter-assistant" className="text-xs">Phụ tá:</Label>
                <Select
                  id="filter-assistant"
                  value={filterAssistant}
                  onChange={(e) => setFilterAssistant(e.target.value)}
                  className="h-7 w-44 text-xs"
                >
                  <option value="">Tất cả</option>
                  <option value="__none__">— Không có —</option>
                  {users.filter((u) => isAssistantRole(u.role_key, u.role_id, u.role_name)).map((a) => (
                    <option key={a.id} value={a.id}>{a.name}</option>
                  ))}
                </Select>
              </div>
            )}

            {(filterClinician || filterAssistant || filterStatuses.size > 0) && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setFilterClinician("");
                  setFilterAssistant("");
                  setFilterStatuses(new Set());
                }}
                className="h-7 text-xs"
              >
                ✕ Xóa hết lọc
              </Button>
            )}
          </div>
        </div>

        {/* Day view */}
        <TabsContent value="day">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span className="flex items-center gap-2">
                  {formatDate(selectedDate.toISOString())}
                  <Badge variant="outline" className="text-[10px]">
                    {dayAppts.length} lịch
                  </Badge>
                </span>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" onClick={() => shiftDay(-1)}>← Trước</Button>
                  <Button variant="outline" size="sm" onClick={() => setSelectedDate(new Date())}>Hôm nay</Button>
                  <Button variant="outline" size="sm" onClick={() => shiftDay(1)}>Sau →</Button>
                </div>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? <div className="flex h-40 items-center justify-center"><div className="h-6 w-6 animate-spin rounded-full border-3 border-muted border-t-primary" /></div> : (
                <AppointmentTimeline
                  appointments={dayAppts}
                  date={selectedDate}
                  schedules={clinicSchedules}
                  users={users}
                  chairs={chairs}
                  patientsById={patientsById}
                  now={now}
                  mode={timelineMode}
                  onModeChange={setTimelineMode}
                  onAppointmentClick={(appointment) => navigate(`/appointments/${appointment.id}`)}
                  onEmptySlotClick={({ time, clinicianId, chairId }) => {
                    setTimelinePrefill({ time, clinicianId, chairId });
                    setCreateOpen(true);
                  }}
                />
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Three-day view */}
        <TabsContent value="three-days">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span>3 ngày từ {formatDate(threeDayDates[0].toISOString())}</span>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" onClick={() => shiftDay(-3)}>← 3 ngày trước</Button>
                  <Button variant="outline" size="sm" onClick={() => setSelectedDate(new Date())}>Hôm nay</Button>
                  <Button variant="outline" size="sm" onClick={() => shiftDay(3)}>3 ngày sau →</Button>
                </div>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="h-40 flex items-center justify-center">
                  <div className="h-6 w-6 animate-spin rounded-full border-3 border-muted border-t-primary" />
                </div>
              ) : (
                <div className="grid gap-4 lg:grid-cols-3">
                  {threeDayDates.map((day) => {
                    const dayYmd = ymd(day);
                    const dayAppts = filteredAppointments
                      .filter((appointment) => isoToYmd(appointment.scheduled_at) === dayYmd)
                      .sort((left, right) => left.scheduled_at.localeCompare(right.scheduled_at));
                    const isToday = dayYmd === ymd(new Date());
                    return (
                      <div
                        key={dayYmd}
                        className={`min-h-[280px] rounded-lg border p-3 ${isToday ? "border-primary bg-primary/5" : "border-border"}`}
                        onDragOver={(event) => event.preventDefault()}
                        onDrop={(event) => void handleAppointmentDrop(event, day)}
                      >
                        <div className="mb-3 flex items-baseline justify-between gap-2">
                          <div>
                            <p className="text-sm font-semibold">{isToday ? "Hôm nay" : weekdayLabel(day.getDay() === 0 ? 7 : day.getDay())}</p>
                            <p className="text-xs text-muted-foreground">{formatDate(day.toISOString())}</p>
                          </div>
                          <Badge variant="outline" className="text-[10px]">{dayAppts.length} lịch</Badge>
                        </div>
                        {dayAppts.length === 0 ? (
                          <p className="py-10 text-center text-sm text-muted-foreground">Chưa có lịch hẹn</p>
                        ) : (
                          <div className="max-h-[600px] space-y-2 overflow-y-auto pr-1">
                            {dayAppts.map((appointment) => {
                              const patient = patientsById.get(appointment.patient_id);
                              return (
                                <div key={appointment.id}>
                                <button
                                  type="button"
                                  onClick={() => {
                                    navigate(`/appointments/${appointment.id}`);
                                  }}
                                  draggable={canMoveAppointment(appointment)}
                                  onDragStart={(event) => {
                                    event.dataTransfer.effectAllowed = "move";
                                    event.dataTransfer.setData("application/x-appointment-id", appointment.id);
                                  }}
                                  onDragEnd={(event) => event.currentTarget.blur()}
                                  className={`w-full rounded-lg border-l-2 px-3 py-2 text-left transition-colors hover:bg-accent/50 ${statusBorderClass(appointment.status)} ${canMoveAppointment(appointment) ? "cursor-grab active:cursor-grabbing" : "cursor-default"}`}
                                >
                                  <div className="flex items-center justify-between gap-2">
                                    <span className="font-mono text-sm font-semibold">{formatTime(appointment.scheduled_at)}</span>
                                    <QuickStatusSelect appointment={appointment} compact onStatusChange={updateAppointmentStatus} saving={updatingStatusId === appointment.id} />
                                  </div>
                                  <p className="mt-1 truncate text-sm font-medium">{patient?.name ?? appointment.patient_id.slice(0, 8)}</p>
                                   {appointment.procedure && <p className="mt-0.5 truncate text-xs text-muted-foreground">{appointment.procedure}</p>}
                                 </button>
                                  {isPastAppointment(appointment) && (
                                    <Button variant="ghost" size="sm" className="mt-1 h-6 w-full text-[10px]" onClick={() => void handleDuplicate(appointment)}>Nhân bản</Button>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Week view */}
        <TabsContent value="week">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span>Tuần {formatDate(weekDays[0].toISOString())} – {formatDate(weekDays[6].toISOString())}</span>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" onClick={() => shiftDay(-7)}>← Tuần trước</Button>
                  <Button variant="outline" size="sm" onClick={() => setSelectedDate(new Date())}>Tuần này</Button>
                  <Button variant="outline" size="sm" onClick={() => shiftDay(7)}>Tuần sau →</Button>
                </div>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="h-40 flex items-center justify-center">
                  <div className="h-6 w-6 animate-spin rounded-full border-3 border-muted border-t-primary" />
                </div>
              ) : (
                <div className="overflow-x-auto pb-1">
                  <div
                    className="grid grid-cols-1 gap-3 lg:min-w-[960px] lg:[grid-template-columns:var(--week-grid-columns)]"
                    style={{ "--week-grid-columns": weekGridColumns } as CSSProperties}
                  >
                    {weekDays.map((day) => {
                    const dayYmd = ymd(day);
                    const dayAppts = (weekByDate.get(dayYmd) ?? []).sort((a, b) =>
                      a.scheduled_at.localeCompare(b.scheduled_at),
                    );
                    const isToday = dayYmd === ymd(new Date());
                    const isSelected = dayYmd === ymd(selectedDate);
                    const isExpanded = dayYmd === expandedWeekDay;
                    return (
                      <div
                        key={dayYmd}
                        className={`flex min-h-[320px] flex-col rounded-lg border p-2 transition-colors hover:bg-accent/30 ${isExpanded ? "border-primary bg-primary/5 ring-1 ring-primary/20" : isSelected ? "border-primary bg-primary/5 ring-1 ring-primary/20" : isToday ? "border-amber-400 bg-amber-50/30" : "border-border"}`}
                        onClick={() => setSelectedDate(day)}
                        onDragOver={(event) => event.preventDefault()}
                        onDrop={(event) => void handleAppointmentDrop(event, day)}
                      >
                        <div className="mb-2 flex items-baseline justify-between">
                          <div className="text-xs font-medium text-muted-foreground">
                            {weekdayLabel(day.getDay() === 0 ? 7 : day.getDay())}
                          </div>
                          <div className="flex items-center gap-1">
                            <div className={`text-lg font-bold ${isToday ? "text-amber-600" : ""}`}>
                              {day.getDate()}
                            </div>
                            <button
                              type="button"
                               className="hidden rounded p-1 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary lg:inline-flex"
                              aria-label={`${isExpanded ? "Thu gọn" : "Mở rộng"} cột ${weekdayLabel(day.getDay() === 0 ? 7 : day.getDay())}, ngày ${day.getDate()}`}
                              aria-pressed={isExpanded}
                              title={isExpanded ? "Thu gọn cột ngày" : "Mở rộng cột ngày"}
                              onClick={(event) => {
                                event.stopPropagation();
                                setExpandedWeekDay((current) => current === dayYmd ? null : dayYmd);
                              }}
                            >
                              {isExpanded ? "−" : "+"}
                            </button>
                          </div>
                        </div>
                        <div className="space-y-1 overflow-y-auto pr-1" style={{ maxHeight: "600px" }}>
                          {dayAppts.length === 0 ? (
                            <p className="py-3 text-center text-[10px] text-muted-foreground/60">—</p>
                          ) : (
                            dayAppts.map((a) => {
                              const patient = patientsById.get(a.patient_id);
                              const doctor = usersById.get(a.clinician_id);
                              return (
                                <div
                                  key={a.id}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    navigate(`/appointments/${a.id}`);
                                  }}
                                  draggable={canMoveAppointment(a)}
                                  onDragStart={(event) => {
                                    event.dataTransfer.effectAllowed = "move";
                                    event.dataTransfer.setData("application/x-appointment-id", a.id);
                                  }}
                                  className={`rounded-md border-l-2 px-2 py-1.5 text-xs transition-colors hover:bg-accent/50 ${statusBorderClass(a.status)} ${canMoveAppointment(a) ? "cursor-grab active:cursor-grabbing" : "cursor-default"}`}
                                >
                                  <div className="flex items-center justify-between gap-1">
                                    <span className="font-mono font-semibold">{formatTime(a.scheduled_at)}</span>
                                    <QuickStatusSelect appointment={a} compact onStatusChange={updateAppointmentStatus} saving={updatingStatusId === a.id} />
                                  </div>
                                  <div className="mt-0.5 flex min-w-0 items-center gap-1.5"><ProfileAvatar subject="patients" entityId={patient?.id} name={patient?.name ?? a.patient_id} avatarFileId={patient?.avatar_file_id} size="sm" /><span className={isExpanded ? "font-medium leading-4" : "truncate font-medium"}>{patient?.name ?? a.patient_id.slice(0, 8)}</span></div>
                                  {a.procedure && (
                                    <div className={isExpanded ? "mt-0.5 text-[10px] leading-4 text-muted-foreground" : "truncate text-[10px] text-muted-foreground"}>
                                      {a.procedure}
                                    </div>
                                  )}
                                   {isExpanded && doctor && (
                                     <div className="mt-0.5 truncate text-[10px] text-muted-foreground">
                                       BS: {doctor.name}
                                     </div>
                                   )}
                                   {isPastAppointment(a) && (
                                     <Button
                                       variant="ghost"
                                       size="sm"
                                       className="mt-1 h-5 w-full text-[9px]"
                                       onClick={(event) => {
                                         event.stopPropagation();
                                         void handleDuplicate(a);
                                       }}
                                     >
                                       Nhân bản
                                     </Button>
                                   )}
                                 </div>
                              );
                            })
                          )}
                        </div>
                        {dayAppts.length > 0 && (
                          <div className="mt-1 text-center text-[10px] font-medium text-muted-foreground">
                            {dayAppts.length} lịch hẹn
                          </div>
                        )}
                      </div>
                    );
                  })}
                  </div>
                </div>
              )}
              <p className="mt-3 text-[10px] text-muted-foreground">
                * Tuần từ {weekStart} đến {weekEnd}
              </p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <AppointmentForm
        open={createOpen}
        onOpenChange={(open) => {
          setCreateOpen(open);
          if (!open) setRefreshTick((t) => t + 1);
        }}
        initialDate={ymd(selectedDate)}
        initialTime={timelinePrefill.time}
        initialClinicianId={timelinePrefill.clinicianId}
        initialChairId={timelinePrefill.chairId}
        branchId={boardBranchId || undefined}
      />

      {editing && (
        <EditAppointmentDialog
          appointment={editing}
          patientName={patientsById.get(editing.patient_id)?.name ?? editing.patient_id}
          doctors={users}
          chairs={chairs}
          onClose={() => {
            setEditing(null);
            setRefreshTick((t) => t + 1);
          }}
          onSaved={(updated) => {
            setAppointments((prev) => prev.map((a) => (a.id === updated.id ? updated : a)));
          }}
          onCancelled={handleCancel}
        />
      )}
    </PageContainer>
  );
}

// ─── Status helpers for week view ──────────────────────────────────────────────

function statusBorderClass(status: string): string {
  switch (status) {
    case "booked": return "border-l-slate-400 bg-slate-50/50 dark:bg-slate-900/30";
    case "confirmed": return "border-l-blue-500 bg-blue-50/50 dark:bg-blue-900/30";
    case "arrived": return "border-l-amber-500 bg-amber-50/50 dark:bg-amber-900/30";
    case "in_progress": return "border-l-violet-500 bg-violet-50/50 dark:bg-violet-900/30";
    case "completed": return "border-l-emerald-500 bg-emerald-50/50 dark:bg-emerald-900/30";
    case "cancelled": return "border-l-red-400 bg-red-50/30 dark:bg-red-900/20 opacity-60";
    case "no_show": return "border-l-slate-300 bg-slate-50/30 dark:bg-slate-900/20 opacity-60";
    default: return "border-l-border bg-card";
  }
}

function statusBgClass(status: string): string {
  switch (status) {
    case "booked": return "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300";
    case "confirmed": return "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300";
    case "arrived": return "bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300";
    case "in_progress": return "bg-violet-100 text-violet-700 dark:bg-violet-900 dark:text-violet-300";
    case "completed": return "bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300";
    case "cancelled": return "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300";
    case "no_show": return "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400";
    default: return "bg-muted text-muted-foreground";
  }
}

function statusLabelVi(status: string): string {
  switch (status) {
    case "booked": return "Mới book";
    case "confirmed": return "Đã xác nhận";
    case "arrived": return "Đã đến";
    case "in_progress": return "Đang thực hiện";
    case "completed": return "Hoàn thành";
    case "cancelled": return "Hủy lịch";
    case "no_show": return "Không đến";
    default: return status;
  }
}

const QUICK_STATUS_TRANSITIONS: Partial<Record<AppointmentStatus, AppointmentStatus[]>> = {
  booked: ["confirmed", "cancelled"],
  confirmed: ["arrived", "cancelled", "no_show"],
  arrived: ["in_progress", "no_show"],
  in_progress: ["completed"],
};

function QuickStatusSelect({ appointment, compact, onStatusChange, saving }: {
  appointment: Appointment;
  compact?: boolean;
  onStatusChange: (appointment: Appointment, status: AppointmentStatus) => Promise<void>;
  saving: boolean;
}) {
  const nextStatuses = QUICK_STATUS_TRANSITIONS[appointment.status] ?? [];
  const isPast = new Date(appointment.scheduled_at) < new Date();
  const disabled = saving || isPast || nextStatuses.length === 0;
  return (
    <select
      aria-label={`Cập nhật trạng thái lịch hẹn: ${statusLabelVi(appointment.status)}`}
      value={appointment.status}
      disabled={disabled}
      draggable={false}
      onClick={(event) => event.stopPropagation()}
      onDragStart={(event) => event.preventDefault()}
      onChange={(event) => void onStatusChange(appointment, event.target.value as AppointmentStatus)}
      className={`shrink-0 cursor-pointer appearance-none rounded px-1.5 py-0.5 font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-default disabled:opacity-70 ${compact ? "text-[9px]" : "text-[10px]"} ${statusBgClass(appointment.status)}`}
      title={disabled ? statusLabelVi(appointment.status) : "Cập nhật nhanh trạng thái"}
    >
      <option value={appointment.status}>{saving ? "Đang lưu..." : statusLabelVi(appointment.status)}</option>
      {nextStatuses.map((status) => <option key={status} value={status}>{statusLabelVi(status)}</option>)}
    </select>
  );
}

// ─── Edit Appointment Dialog ────────────────────────────────────────────────────

function EditAppointmentDialog({
  appointment,
  patientName,
  doctors,
  chairs,
  onClose,
  onSaved,
  onCancelled,
}: {
  appointment: Appointment;
  patientName: string;
  doctors: UserWithDetails[];
  chairs: DentalChair[];
  onClose: () => void;
  onSaved: (appt: Appointment) => void;
  onCancelled: (appt: Appointment) => Promise<boolean>;
}) {
  const isCancelled = appointment.status === "cancelled";
  const apptDate = new Date(appointment.scheduled_at);
  const [date, setDate] = useState(ymd(apptDate));
  const [time, setTime] = useState(
    isoToTime(appointment.scheduled_at),
  );
  const [durationMin, setDurationMin] = useState(appointment.duration_min);
  const [procedure, setProcedure] = useState(appointment.procedure ?? "");
  const [notes, setNotes] = useState(appointment.notes ?? "");
  const [status, setStatus] = useState(appointment.status);
  const [clinicianId, setClinicianId] = useState(appointment.clinician_id);
  const [assistantId, setAssistantId] = useState(appointment.assistant_id ?? "");
  const [chairId, setChairId] = useState(appointment.chair_id ?? "");
  const [saving, setSaving] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [step, setStep] = useState<1 | 2>(1);

  const doctorsOnly = doctors.filter((u) => isDoctorRole(u.role_key, u.role_id, u.role_name));
  const assistantsOnly = doctors.filter((u) => isAssistantRole(u.role_key, u.role_id, u.role_name));

  function continueToSchedule() {
    if (!clinicianId) {
      toast.error("Vui lòng chọn bác sĩ");
      return;
    }
    setStep(2);
  }

  async function handleSave() {
    if (!clinicianId) {
      toast.error("Vui lòng chọn bác sĩ");
      return;
    }
    const isRescheduling = date !== ymd(apptDate) || time !== isoToTime(appointment.scheduled_at);
    if (isRescheduling && isAppointmentTimeInPast(date, time)) {
      toast.error("Thời gian lịch hẹn phải sau thời điểm hiện tại ít nhất 5 phút");
      return;
    }
    setSaving(true);
    try {
      const updated = await apiPatch<Appointment>(`/api/appointments/${appointment.id}`, {
        ...(isRescheduling ? { scheduled_at: combineDateTime(date, time) } : {}),
        ...(durationMin !== appointment.duration_min ? { duration_min: durationMin } : {}),
        status,
        ...(clinicianId !== appointment.clinician_id ? { clinician_id: clinicianId } : {}),
        ...(assistantId !== (appointment.assistant_id ?? "") ? { assistant_id: assistantId || null } : {}),
        ...(chairId !== (appointment.chair_id ?? "") ? { chair_id: chairId || null } : {}),
        ...(procedure !== (appointment.procedure ?? "") ? { procedure: procedure || undefined } : {}),
        ...(notes !== (appointment.notes ?? "") ? { notes: notes || undefined } : {}),
      });
      onSaved(updated);
      toast.success("Đã cập nhật lịch hẹn");
      onClose();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Lỗi cập nhật");
    } finally {
      setSaving(false);
    }
  }

  async function handleCancel() {
    setCancelling(true);
    try {
      if (await onCancelled(appointment)) onClose();
    } finally {
      setCancelling(false);
    }
  }

  return (
      <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
        <DialogHeader>
          <DialogTitle>Sửa lịch hẹn: {patientName}</DialogTitle>
          <AppointmentSteps step={step} />
        </DialogHeader>
        <DialogBody className="grid gap-3">
          {step === 1 && <>
          {/* Bác sĩ */}
        <div className="grid gap-1.5">
          <Label>Bác sĩ</Label>
          <Select
            value={clinicianId}
            onChange={(e) => setClinicianId(e.target.value)}
            disabled={isCancelled || doctorsOnly.length === 0}
          >
            {doctorsOnly.length === 0 && <option value="">Không có bác sĩ khả dụng</option>}
            {doctorsOnly.map((d) => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </Select>
        </div>

        {/* Phụ tá chính */}
        {assistantsOnly.length > 0 && (
          <div className="grid gap-1.5">
            <Label>Phụ tá chính</Label>
            <Select value={assistantId} onChange={(e) => setAssistantId(e.target.value)} disabled={isCancelled}>
              <option value="">— Không chọn —</option>
              {assistantsOnly.map((a) => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </Select>
          </div>
        )}

        <div className="grid gap-1.5">
          <Label>Ghế nha</Label>
          <Select value={chairId} onChange={(e) => setChairId(e.target.value)} disabled={isCancelled}>
            <option value="">— Chưa gán ghế —</option>
            {chairs.filter((chair) => chair.is_active || chair.id === appointment.chair_id).map((chair) => (
              <option key={chair.id} value={chair.id}>
                {chair.name}{chair.room_name ? ` · ${chair.room_name}` : ""}
              </option>
            ))}
          </Select>
        </div>

        {/* Trạng thái */}
        <div className="grid gap-1.5">
          <Label>Trạng thái</Label>
          <Select value={status} onChange={(e) => setStatus(e.target.value as Appointment["status"])} disabled={isCancelled}>
            <option value="booked">Mới book</option>
            <option value="confirmed">Đã xác nhận</option>
            <option value="arrived">Đã đến</option>
            <option value="in_progress">Đang thực hiện</option>
            <option value="completed">Hoàn thành</option>
            <option value="cancelled">Hủy lịch</option>
            <option value="no_show">Không đến</option>
            </Select>
          </div>
          </>}

          {step === 2 && <>
          {/* Ngày + Giờ */}
        <div className="grid grid-cols-2 gap-3">
          <div className="grid gap-1.5">
            <Label>Ngày</Label>
            <DateInput
              value={date}
              onChange={(nextDate) => {
                setDate(nextDate);
                const minimum = getMinimumAppointmentTime(nextDate);
                if (minimum && time < minimum) setTime(minimum);
              }}
              min={apptDate >= new Date() ? ymd(new Date()) : undefined}
              disabled={isCancelled}
            />
          </div>
          <div className="grid gap-1.5">
            <Label>Giờ</Label>
            <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} min={apptDate >= new Date() ? getMinimumAppointmentTime(date) : undefined} disabled={isCancelled} />
          </div>
        </div>

        {/* Thời lượng */}
        <div className="grid gap-1.5">
          <Label>Thời lượng (phút)</Label>
          <Select value={String(durationMin)} onChange={(e) => setDurationMin(Number(e.target.value))} disabled={isCancelled}>
            <option value="15">15 phút</option>
            <option value="30">30 phút</option>
            <option value="45">45 phút</option>
            <option value="60">60 phút</option>
            <option value="90">90 phút</option>
            <option value="120">120 phút</option>
          </Select>
        </div>

        {/* Hạng mục */}
        <div className="grid gap-1.5">
          <Label>Hạng mục</Label>
          <Input value={procedure} onChange={(e) => setProcedure(e.target.value)} placeholder="VD: scaling, filling…" disabled={isCancelled} />
        </div>

        {/* Ghi chú */}
        <div className="grid gap-1.5">
          <Label>Ghi chú</Label>
            <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} disabled={isCancelled} />
          </div>
          </>}
        </DialogBody>
        <DialogFooter className="mt-4">
          {step === 1 && appointment.status !== "cancelled" && appointment.status !== "completed" && (
            <Button type="button" variant="destructive" disabled={saving || cancelling} onClick={handleCancel}>
              {cancelling ? "Đang hủy…" : "Hủy lịch"}
            </Button>
          )}
          <Button type="button" variant="outline" onClick={onClose}>Đóng</Button>
          {!isCancelled && step === 1 && (
            <Button type="button" disabled={saving || cancelling} onClick={continueToSchedule}>Tiếp tục</Button>
          )}
          {!isCancelled && step === 2 && <>
            <Button type="button" variant="ghost" onClick={() => setStep(1)}>Quay lại</Button>
            <Button type="button" disabled={saving || cancelling} onClick={handleSave}>
              {saving ? "Đang lưu…" : "Lưu thay đổi"}
            </Button>
          </>}
        </DialogFooter>
      </Dialog>
  );
}

function AppointmentSteps({ step }: { step: 1 | 2 }) {
  return (
    <div className="mt-3 flex items-center gap-2 text-xs" aria-label={`Bước ${step} trên 2`}>
      <span className={`flex h-5 w-5 items-center justify-center rounded-full font-semibold ${step === 1 ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>1</span>
      <span className={step === 1 ? "font-medium text-foreground" : "text-muted-foreground"}>Nhân sự & trạng thái</span>
      <span className="h-px w-5 bg-border" />
      <span className={`flex h-5 w-5 items-center justify-center rounded-full font-semibold ${step === 2 ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>2</span>
      <span className={step === 2 ? "font-medium text-foreground" : "text-muted-foreground"}>Thời gian & nội dung</span>
    </div>
  );
}
