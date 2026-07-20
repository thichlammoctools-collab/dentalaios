import { useEffect, useMemo, useState } from "react";
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
import { AppointmentCard } from "@/components/schedule/AppointmentCard";
import { AppointmentForm } from "@/components/schedule/AppointmentForm";
import { ProfileAvatar } from "@/components/ProfileAvatar";
import { apiDelete, apiGet, apiPatch, apiPost, ApiError } from "@/lib/api";
import { toast } from "@/lib/toast";
import { useAuth } from "@/lib/auth-context";
import type { Appointment, DentalChair, Patient, UserWithDetails, Visit } from "@shared/types";
import { isAssistantRole, isDoctorRole, ROUTES } from "@shared/constants";
import { formatDate, formatTime, getWeekDays, isoToYmd, weekdayLabel, ymd, combineDateTime } from "@/lib/utils";

interface AppointmentsResponse { items: Appointment[]; total: number }
interface PatientsResponse { items: Patient[]; total: number }
interface UsersResponse { items: UserWithDetails[]; total: number }
interface ChairsResponse { items: DentalChair[]; total: number }

export function SchedulePage() {
  const { session } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const selectedBranchId = searchParams.get("branch_id") ?? "";
  const requestedStatusValue = searchParams.get("status") ?? "";
  const requestedStatuses = requestedStatusValue.split(",").filter(Boolean);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [users, setUsers] = useState<UserWithDetails[]>([]);
  const [chairs, setChairs] = useState<DentalChair[]>([]);
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<Appointment | null>(null);
  const [refreshTick, setRefreshTick] = useState(0);
  const [startingAppointmentId, setStartingAppointmentId] = useState<string | null>(null);
  const [now, setNow] = useState(() => new Date());

  // Filters apply to both schedule views.
  const [filterStatuses, setFilterStatuses] = useState<Set<string>>(() => new Set(requestedStatuses));
  const [filterClinician, setFilterClinician] = useState("");
  const [filterAssistant, setFilterAssistant] = useState("");
  const [hideFinishedAppointments, setHideFinishedAppointments] = useState(false);

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

  useEffect(() => {
    let mounted = true;
    const from = new Date(weekDays[0]);
    from.setHours(0, 0, 0, 0);
    const to = new Date(weekDays[6]);
    to.setHours(23, 59, 59, 999);

    const appointmentQuery = new URLSearchParams({
      from: from.toISOString(),
      to: to.toISOString(),
      ...(selectedBranchId ? { branch_id: selectedBranchId } : {}),
    });

    Promise.all([
      apiGet<AppointmentsResponse>(`/api/appointments?${appointmentQuery}`),
      apiGet<PatientsResponse>(`/api/patients?limit=200`),
      session?.branch?.id
        ? apiGet<UsersResponse>(`/api/users/branch/${session.branch.id}`)
        : Promise.resolve({ items: [] as UserWithDetails[] }),
      session?.branch?.id
        ? apiGet<ChairsResponse>(`/api/chairs?branch_id=${session.branch.id}`)
        : Promise.resolve({ items: [] as DentalChair[], total: 0 }),
    ]).then(([appts, pats, us, chairResponse]) => {
      if (!mounted) return;
      setAppointments(appts.items);
      setPatients(pats.items);
      setUsers(us.items);
      setChairs(chairResponse.items);
    }).catch((err) => console.error(err))
      .finally(() => mounted && setLoading(false));

    return () => { mounted = false; };
  }, [weekDays, refreshTick, selectedBranchId, session?.branch?.id]);

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

  const chairsById = useMemo(() => new Map(chairs.map((chair) => [chair.id, chair])), [chairs]);

  const filteredAppointments = appointments
    .filter((a) => filterStatuses.size === 0 || filterStatuses.has(a.status))
    .filter((a) => !filterClinician || a.clinician_id === filterClinician)
    .filter((a) => !filterAssistant || (
      filterAssistant === "__none__" ? !a.assistant_id : a.assistant_id === filterAssistant
    ));

  // Day view: use the same filters as the week view.
  const dayApptsAll = appointments.filter((a) => isoToYmd(a.scheduled_at) === ymd(selectedDate));
  const dayAppts = filteredAppointments
    .filter((a) => isoToYmd(a.scheduled_at) === ymd(selectedDate))
    .sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at));
  const dayAppointmentGroups = {
    finished: dayAppts.filter((a) => appointmentTiming(a) === "finished"),
    inProgress: dayAppts.filter((a) => appointmentTiming(a) === "in_progress"),
    upcoming: dayAppts.filter((a) => appointmentTiming(a) === "upcoming"),
  };
  const visibleDayAppointmentGroups = {
    ...dayAppointmentGroups,
    finished: hideFinishedAppointments ? [] : dayAppointmentGroups.finished,
  };
  const visibleDayAppointmentCount = Object.values(visibleDayAppointmentGroups)
    .reduce((total, group) => total + group.length, 0);

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

  async function startVisit(appointment: Appointment) {
    if (!session?.user?.id) return;
    setStartingAppointmentId(appointment.id);
    try {
      const visit = await apiPost<Visit>("/api/visits", {
        patient_id: appointment.patient_id,
        branch_id: appointment.branch_id,
        clinician_id: session.user.id,
        source_appointment_id: appointment.id,
      });
      toast.success("Đã bắt đầu lượt khám");
      navigate(`/visits/${visit.id}`);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Không thể bắt đầu lượt khám");
    } finally {
      setStartingAppointmentId(null);
    }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 sm:p-6">
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
            onClick={() => setCreateOpen(true)}
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
          <TabsTrigger value="week">Tuần</TabsTrigger>
        </TabsList>

        {/* Filters apply to both day and week views. */}
        <div className="mt-4 space-y-2 rounded-lg border border-border bg-muted/20 p-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-medium text-muted-foreground">Trạng thái:</span>
            {(["booked", "confirmed", "arrived", "completed", "cancelled", "no_show"] as const).map((s) => (
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
                    {dayApptsAll.length} lịch
                    {visibleDayAppointmentCount !== dayApptsAll.length && ` (hiện ${visibleDayAppointmentCount})`}
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
              {loading ? (
                <div className="h-40 flex items-center justify-center">
                  <div className="h-6 w-6 animate-spin rounded-full border-3 border-muted border-t-primary" />
                </div>
              ) : visibleDayAppointmentCount === 0 ? (
                <div className="py-10 text-center">
                  <p className="text-sm text-muted-foreground">
                    {dayApptsAll.length === 0
                      ? "Chưa có lịch hẹn nào trong ngày này"
                      : hideFinishedAppointments && dayAppointmentGroups.finished.length > 0
                        ? "Các ca trong ngày đã được ẩn"
                        : "Không có lịch hẹn nào khớp với bộ lọc"}
                  </p>
                  <Button className="mt-4" onClick={() => setCreateOpen(true)}>
                    + Tạo lịch hẹn
                  </Button>
                </div>
              ) : (
                <div className="space-y-4">
                  {dayAppointmentGroups.finished.length > 0 && (
                    <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-muted/20 px-3 py-2">
                      <div className="flex items-center gap-2">
                        <span className="h-2 w-2 rounded-full bg-muted-foreground/50" />
                        <span className="text-sm font-semibold text-muted-foreground">Đã xong</span>
                        <Badge variant="outline" className="text-[10px]">{dayAppointmentGroups.finished.length}</Badge>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setHideFinishedAppointments((value) => !value)}
                        className="h-7 text-xs"
                      >
                        {hideFinishedAppointments ? "Hiện ca đã xong" : "Ẩn ca đã xong"}
                      </Button>
                    </div>
                  )}
                  {([
                    ["inProgress", "Đang làm", "bg-amber-500"],
                    ["upcoming", "Sắp tới", "bg-blue-500"],
                    ["finished", "Đã xong", "bg-muted-foreground/50"],
                  ] as const).map(([groupKey, label, dotClass]) => {
                    const group = visibleDayAppointmentGroups[groupKey];
                    if (group.length === 0) return null;
                    return (
                      <section key={groupKey} className="space-y-2">
                        <div className="flex items-center gap-2 px-1">
                          <span className={`h-2 w-2 rounded-full ${dotClass}`} />
                          <h2 className="text-sm font-semibold">{label}</h2>
                          <Badge variant="outline" className="text-[10px]">{group.length}</Badge>
                        </div>
                        <div className="space-y-2">
                          {group.map((a) => {
                     const patient = patientsById.get(a.patient_id);
                     const doctor = usersById.get(a.clinician_id);
                     const assistant = a.assistant_id ? usersById.get(a.assistant_id) : null;
                     const chair = a.chair_id ? chairsById.get(a.chair_id) : null;
                     const endTime = new Date(new Date(a.scheduled_at).getTime() + a.duration_min * 60 * 1000);
                     const isFinished = appointmentTiming(a) === "finished";
                     return (
                       <div
                         key={a.id}
                         onClick={() => setEditing(a)}
                         className={`cursor-pointer rounded-lg border-l-4 px-3 py-2.5 transition-all hover:shadow-md hover:bg-accent/40 ${statusBorderClass(a.status)} ${isFinished ? "opacity-55 saturate-50" : ""}`}
                      >
                        <div className="flex items-stretch gap-3">
                          {/* Time block */}
                          <div className="shrink-0 min-w-[148px] text-left">
                            <div className="font-mono text-xl font-bold leading-tight tabular-nums">
                              {formatTime(a.scheduled_at)} → {formatTime(endTime.toISOString())}
                            </div>
                            <div className="font-mono text-sm font-medium text-muted-foreground tabular-nums">
                              {a.duration_min} phút
                            </div>
                            <div className="mt-2 space-y-1.5 text-[11px] text-muted-foreground">
                              <div className="flex items-center gap-1.5">
                                {doctor && <ProfileAvatar subject="users" entityId={doctor.id} name={doctor.name} avatarFileId={doctor.avatar_file_id} size="sm" />}
                                <span className="truncate font-semibold text-sky-700 dark:text-sky-300">{doctor?.name ?? "—"} (Dr)</span>
                              </div>
                              {assistant && (
                                <div className="flex items-center gap-1.5">
                                  <ProfileAvatar subject="users" entityId={assistant.id} name={assistant.name} avatarFileId={assistant.avatar_file_id} size="sm" />
                                  <span className="truncate font-semibold text-emerald-700 dark:text-emerald-300">{assistant.name} (As)</span>
                                </div>
                              )}
                            </div>
                          </div>

                          {/* Vertical divider */}
                          <div className="self-stretch border-l border-border/60" />

                          {/* Main content */}
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex min-w-0 items-center gap-2"><ProfileAvatar subject="patients" entityId={patient?.id} name={patient?.name ?? a.patient_id} avatarFileId={patient?.avatar_file_id} size="sm" /><p className="truncate font-semibold">
                                {patient?.name ?? <span className="font-mono text-xs text-muted-foreground">{a.patient_id.slice(0, 8)}</span>}
                              </p></div>
                              <span className={`shrink-0 rounded px-2 py-0.5 text-[10px] font-medium ${statusBgClass(a.status)}`}>
                                {statusLabelVi(a.status)}
                              </span>
                            </div>
                            <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
                              {a.procedure && (
                                <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px]">
                                  {a.procedure}
                                </span>
                              )}
                              <span className="ml-auto text-[10px]">
                                {a.source === "ai_chat" && "✨ AI chat"}
                                {a.source === "ai_next_visit" && "🤖 AI suggest"}
                              </span>
                            </div>
                             {a.notes && (
                               <p className="mt-1 truncate text-[11px] text-muted-foreground italic">
                                 💬 {a.notes}
                               </p>
                             )}
                            </div>
                            <div className="flex shrink-0 flex-col items-end justify-end gap-2 text-right">
                              {chair && (
                                <div className="rounded-md bg-muted px-2 py-1 text-[11px]">
                                  <span className="mr-1 text-[10px] uppercase text-muted-foreground">Ghế</span>
                                  <span className="font-medium text-foreground">{chair.name}</span>
                                </div>
                              )}
                              {canStartAppointmentVisit(a, now) && (
                                <Button size="sm" onClick={(event) => { event.stopPropagation(); void startVisit(a); }} disabled={startingAppointmentId === a.id}>
                                  {startingAppointmentId === a.id ? "Đang bắt đầu..." : "Bắt đầu khám"}
                                </Button>
                              )}
                            </div>
                         </div>
                       </div>
                     );
                          })}
                        </div>
                      </section>
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
                <div className="grid grid-cols-1 gap-3 md:grid-cols-7">
                  {weekDays.map((day) => {
                    const dayYmd = ymd(day);
                    const dayAppts = (weekByDate.get(dayYmd) ?? []).sort((a, b) =>
                      a.scheduled_at.localeCompare(b.scheduled_at),
                    );
                    const isToday = dayYmd === ymd(new Date());
                    const isSelected = dayYmd === ymd(selectedDate);
                    return (
                      <div
                        key={dayYmd}
                        className={`flex min-h-[200px] flex-col rounded-lg border p-2 transition-colors hover:bg-accent/30 ${isSelected ? "border-primary bg-primary/5 ring-1 ring-primary/20" : isToday ? "border-amber-400 bg-amber-50/30" : "border-border"}`}
                        onClick={() => setSelectedDate(day)}
                      >
                        <div className="mb-2 flex items-baseline justify-between">
                          <div className="text-xs font-medium text-muted-foreground">
                            {weekdayLabel(day.getDay() === 0 ? 7 : day.getDay())}
                          </div>
                          <div className={`text-lg font-bold ${isToday ? "text-amber-600" : ""}`}>
                            {day.getDate()}
                          </div>
                        </div>
                        <div className="space-y-1 overflow-y-auto pr-1" style={{ maxHeight: "380px" }}>
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
                                    setEditing(a);
                                  }}
                                  className={`cursor-pointer rounded-md border-l-2 px-2 py-1.5 text-xs transition-colors hover:bg-accent/50 ${statusBorderClass(a.status)}`}
                                >
                                  <div className="flex items-center justify-between gap-1">
                                    <span className="font-mono font-semibold">{formatTime(a.scheduled_at)}</span>
                                    <span className={`shrink-0 rounded px-1.5 py-0.5 text-[9px] font-medium ${statusBgClass(a.status)}`}>
                                      {statusLabelVi(a.status)}
                                    </span>
                                  </div>
                                   <div className="mt-0.5 flex min-w-0 items-center gap-1.5"><ProfileAvatar subject="patients" entityId={patient?.id} name={patient?.name ?? a.patient_id} avatarFileId={patient?.avatar_file_id} size="sm" /><span className="truncate font-medium">{patient?.name ?? a.patient_id.slice(0, 8)}</span></div>
                                  {a.procedure && (
                                    <div className="truncate text-[10px] text-muted-foreground">
                                      {a.procedure}
                                    </div>
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
      />

      {editing && (
        <EditAppointmentDialog
          appointment={editing}
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
    </div>
  );
}

// ─── Status helpers for week view ──────────────────────────────────────────────

function statusBorderClass(status: string): string {
  switch (status) {
    case "booked": return "border-l-slate-400 bg-slate-50/50 dark:bg-slate-900/30";
    case "confirmed": return "border-l-blue-500 bg-blue-50/50 dark:bg-blue-900/30";
    case "arrived": return "border-l-amber-500 bg-amber-50/50 dark:bg-amber-900/30";
    case "completed": return "border-l-emerald-500 bg-emerald-50/50 dark:bg-emerald-900/30";
    case "cancelled": return "border-l-red-400 bg-red-50/30 dark:bg-red-900/20 opacity-60";
    case "no_show": return "border-l-slate-300 bg-slate-50/30 dark:bg-slate-900/20 opacity-60";
    default: return "border-l-border bg-card";
  }
}

function appointmentTiming(appointment: Appointment): "finished" | "in_progress" | "upcoming" {
  if (["completed", "cancelled", "no_show"].includes(appointment.status)) return "finished";
  if (appointment.status === "arrived") return "in_progress";
  return "upcoming";
}

function canStartAppointmentVisit(appointment: Appointment, now: Date): boolean {
  if (appointment.status !== "arrived" || !appointment.chair_id) return false;
  const startsAt = new Date(appointment.scheduled_at);
  const endsAt = new Date(startsAt.getTime() + appointment.duration_min * 60_000);
  return startsAt <= now && now < endsAt;
}

function statusBgClass(status: string): string {
  switch (status) {
    case "booked": return "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300";
    case "confirmed": return "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300";
    case "arrived": return "bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300";
    case "completed": return "bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300";
    case "cancelled": return "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300";
    case "no_show": return "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400";
    default: return "bg-muted text-muted-foreground";
  }
}

function statusLabelVi(status: string): string {
  switch (status) {
    case "booked": return "Đặt";
    case "confirmed": return "Xác nhận";
    case "arrived": return "Đến";
    case "completed": return "Xong";
    case "cancelled": return "Hủy";
    case "no_show": return "Vắng";
    default: return status;
  }
}

// ─── Edit Appointment Dialog ────────────────────────────────────────────────────

function EditAppointmentDialog({
  appointment,
  doctors,
  chairs,
  onClose,
  onSaved,
  onCancelled,
}: {
  appointment: Appointment;
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
    `${String(apptDate.getUTCHours()).padStart(2, "0")}:${String(apptDate.getUTCMinutes()).padStart(2, "0")}`,
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

  const doctorsOnly = doctors.filter((u) => isDoctorRole(u.role_key, u.role_id, u.role_name));
  const assistantsOnly = doctors.filter((u) => isAssistantRole(u.role_key, u.role_id, u.role_name));

  async function handleSave() {
    if (!clinicianId) {
      toast.error("Vui lòng chọn bác sĩ");
      return;
    }
    setSaving(true);
    try {
      const scheduled_at = combineDateTime(date, time);
      const updated = await apiPatch<Appointment>(`/api/appointments/${appointment.id}`, {
        scheduled_at,
        duration_min: durationMin,
        status,
        clinician_id: clinicianId,
        assistant_id: assistantId || null,
        chair_id: chairId || null,
        procedure: procedure || undefined,
        notes: notes || undefined,
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
        <DialogTitle>Sửa lịch hẹn</DialogTitle>
      </DialogHeader>
      <DialogBody className="grid gap-3">
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
            <option value="booked">Đã đặt</option>
            <option value="confirmed">Xác nhận</option>
            <option value="arrived">Đã đến</option>
            <option value="completed">Hoàn thành</option>
            <option value="cancelled">Hủy</option>
            <option value="no_show">Không đến</option>
          </Select>
        </div>

        {/* Ngày + Giờ */}
        <div className="grid grid-cols-2 gap-3">
          <div className="grid gap-1.5">
            <Label>Ngày</Label>
            <DateInput value={date} onChange={setDate} disabled={isCancelled} />
          </div>
          <div className="grid gap-1.5">
            <Label>Giờ</Label>
            <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} disabled={isCancelled} />
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
      </DialogBody>
      <DialogFooter className="mt-4">
        {appointment.status !== "cancelled" && appointment.status !== "completed" && (
          <Button type="button" variant="destructive" disabled={saving || cancelling} onClick={handleCancel}>
            {cancelling ? "Đang hủy…" : "Hủy lịch"}
          </Button>
        )}
        <Button type="button" variant="outline" onClick={onClose}>Đóng</Button>
        {!isCancelled && (
          <Button type="button" disabled={saving || cancelling} onClick={handleSave}>
            {saving ? "Đang lưu…" : "Lưu thay đổi"}
          </Button>
        )}
      </DialogFooter>
    </Dialog>
  );
}
