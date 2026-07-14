import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { AppointmentCard } from "@/components/schedule/AppointmentCard";
import { AppointmentForm } from "@/components/schedule/AppointmentForm";
import { apiGet, apiPatch, ApiError } from "@/lib/api";
import { toast } from "@/lib/toast";
import { useAuth } from "@/lib/auth-context";
import type { Appointment, Patient, UserWithDetails } from "@shared/types";
import { ROUTES } from "@shared/constants";
import { formatDate, formatTime, getWeekDays, isoToYmd, weekdayLabel, ymd, combineDateTime } from "@/lib/utils";

interface AppointmentsResponse { items: Appointment[]; total: number }
interface PatientsResponse { items: Patient[]; total: number }
interface UsersResponse { items: UserWithDetails[]; total: number }

export function SchedulePage() {
  const { session } = useAuth();
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [users, setUsers] = useState<UserWithDetails[]>([]);
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<Appointment | null>(null);
  const [refreshTick, setRefreshTick] = useState(0);

  // Filters (Day view)
  const [filterStatuses, setFilterStatuses] = useState<Set<string>>(new Set());
  const [filterClinician, setFilterClinician] = useState("");
  const [filterAssistant, setFilterAssistant] = useState("");

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

    Promise.all([
      apiGet<AppointmentsResponse>(`/api/appointments?from=${encodeURIComponent(from.toISOString())}&to=${encodeURIComponent(to.toISOString())}`),
      apiGet<PatientsResponse>(`/api/patients?limit=200`),
      session?.branch?.id
        ? apiGet<UsersResponse>(`/api/users/branch/${session.branch.id}`)
        : Promise.resolve({ items: [] as UserWithDetails[] }),
    ]).then(([appts, pats, us]) => {
      if (!mounted) return;
      setAppointments(appts.items);
      setPatients(pats.items);
      setUsers(us.items);
    }).catch((err) => console.error(err))
      .finally(() => mounted && setLoading(false));

    return () => { mounted = false; };
  }, [weekDays, refreshTick]);

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

  // Day view: filter today + multi-filter
  const dayApptsAll = appointments.filter((a) => isoToYmd(a.scheduled_at) === ymd(selectedDate));
  const dayAppts = dayApptsAll
    .filter((a) => filterStatuses.size === 0 || filterStatuses.has(a.status))
    .filter((a) => !filterClinician || a.clinician_id === filterClinician)
    .filter((a) => !filterAssistant || (
      filterAssistant === "__none__" ? !a.assistant_id : a.assistant_id === filterAssistant
    ))
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
    appointments.forEach((a) => {
      const key = isoToYmd(a.scheduled_at);
      const arr = m.get(key) ?? [];
      arr.push(a);
      m.set(key, arr);
    });
    return m;
  }, [appointments]);

  function shiftDay(days: number) {
    const d = new Date(selectedDate);
    d.setDate(d.getDate() + days);
    setSelectedDate(d);
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 sm:p-6">
      {/* Header */}
      <div className="overflow-hidden rounded-2xl bg-gradient-to-br from-purple-600 via-indigo-600 to-blue-700 p-5 text-white shadow-lg sm:p-8">
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Lịch hẹn</h1>
        <p className="mt-1 text-sm text-blue-100 sm:text-base">
          {selectedDate.toLocaleDateString("vi-VN", { weekday: "long", day: "2-digit", month: "long", year: "numeric" })}
        </p>
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

        {/* Day view */}
        <TabsContent value="day">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span className="flex items-center gap-2">
                  {formatDate(selectedDate.toISOString())}
                  <Badge variant="outline" className="text-[10px]">
                    {dayApptsAll.length} lịch
                    {dayAppts.length !== dayApptsAll.length && ` (hiện ${dayAppts.length})`}
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
              {/* Filter bar */}
              <div className="mb-4 space-y-2 rounded-lg border border-border bg-muted/20 p-3">
                {/* Status toggles */}
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

                {/* Clinician + Assistant dropdowns */}
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
                      {users.filter((u) => u.role_name === "doctor").map((d) => (
                        <option key={d.id} value={d.id}>{d.name}</option>
                      ))}
                    </Select>
                  </div>

                  {users.filter((u) => u.role_name === "assistant").length > 0 && (
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
                        {users.filter((u) => u.role_name === "assistant").map((a) => (
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

              {loading ? (
                <div className="h-40 flex items-center justify-center">
                  <div className="h-6 w-6 animate-spin rounded-full border-3 border-muted border-t-primary" />
                </div>
              ) : dayAppts.length === 0 ? (
                <div className="py-10 text-center">
                  <p className="text-sm text-muted-foreground">
                    {dayApptsAll.length === 0
                      ? "Chưa có lịch hẹn nào trong ngày này"
                      : "Không có lịch hẹn nào khớp với bộ lọc"}
                  </p>
                  <Button className="mt-4" onClick={() => setCreateOpen(true)}>
                    + Tạo lịch hẹn
                  </Button>
                </div>
              ) : (
                <div className="space-y-2">
                  {dayAppts.map((a) => {
                    const patient = patientsById.get(a.patient_id);
                    const doctor = usersById.get(a.clinician_id);
                    const assistant = a.assistant_id ? usersById.get(a.assistant_id) : null;
                    const endTime = new Date(new Date(a.scheduled_at).getTime() + a.duration_min * 60 * 1000);
                    return (
                      <div
                        key={a.id}
                        onClick={() => setEditing(a)}
                        className={`cursor-pointer rounded-lg border-l-4 px-3 py-2.5 transition-all hover:shadow-md hover:bg-accent/40 ${statusBorderClass(a.status)}`}
                      >
                        <div className="flex items-start gap-3">
                          {/* Time block */}
                          <div className="shrink-0 min-w-[80px] text-center">
                            <div className="font-mono text-xl font-bold leading-tight tabular-nums">
                              {formatTime(a.scheduled_at)} → {formatTime(endTime.toISOString())}
                            </div>
                            <div className="font-mono text-sm font-medium text-muted-foreground tabular-nums">
                              {a.duration_min} phút
                            </div>
                          </div>

                          {/* Vertical divider */}
                          <div className="self-stretch border-l border-border/60" />

                          {/* Main content */}
                          <div className="min-w-0 flex-1">
                            <div className="flex items-baseline justify-between gap-2">
                              <p className="truncate font-semibold">
                                {patient?.name ?? <span className="font-mono text-xs text-muted-foreground">{a.patient_id.slice(0, 8)}</span>}
                              </p>
                              <span className={`shrink-0 rounded px-2 py-0.5 text-[10px] font-medium ${statusBgClass(a.status)}`}>
                                {statusLabelVi(a.status)}
                              </span>
                            </div>
                            <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
                              <span className="flex items-center gap-1">
                                <span className="text-[10px] uppercase opacity-70">BS</span>
                                <span className="font-medium text-foreground">{doctor?.name ?? "—"}</span>
                              </span>
                              {assistant && (
                                <span className="flex items-center gap-1">
                                  <span className="text-[10px] uppercase opacity-70">Phụ tá</span>
                                  <span className="font-medium text-foreground">{assistant.name}</span>
                                </span>
                              )}
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
                        </div>
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
                                  <div className="mt-0.5 truncate font-medium">
                                    {patient?.name ?? a.patient_id.slice(0, 8)}
                                  </div>
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
          onClose={() => {
            setEditing(null);
            setRefreshTick((t) => t + 1);
          }}
          onSaved={(updated) => {
            setAppointments((prev) => prev.map((a) => (a.id === updated.id ? updated : a)));
          }}
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
  onClose,
  onSaved,
}: {
  appointment: Appointment;
  doctors: UserWithDetails[];
  onClose: () => void;
  onSaved: (appt: Appointment) => void;
}) {
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
  const [saving, setSaving] = useState(false);

  const doctorsOnly = doctors.filter((u) => u.role_name === "doctor");
  const assistantsOnly = doctors.filter((u) => u.role_name === "assistant");

  async function handleSave() {
    setSaving(true);
    try {
      const scheduled_at = combineDateTime(date, time);
      const updated = await apiPatch<Appointment>(`/api/appointments/${appointment.id}`, {
        scheduled_at,
        duration_min: durationMin,
        status,
        clinician_id: clinicianId,
        assistant_id: assistantId || null,
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

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogHeader>
        <DialogTitle>Sửa lịch hẹn</DialogTitle>
      </DialogHeader>
      <DialogBody className="grid gap-3">
        {/* Bác sĩ */}
        <div className="grid gap-1.5">
          <Label>Bác sĩ</Label>
          <Select value={clinicianId} onChange={(e) => setClinicianId(e.target.value)}>
            {doctorsOnly.map((d) => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </Select>
        </div>

        {/* Phụ tá chính */}
        {assistantsOnly.length > 0 && (
          <div className="grid gap-1.5">
            <Label>Phụ tá chính</Label>
            <Select value={assistantId} onChange={(e) => setAssistantId(e.target.value)}>
              <option value="">— Không chọn —</option>
              {assistantsOnly.map((a) => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </Select>
          </div>
        )}

        {/* Trạng thái */}
        <div className="grid gap-1.5">
          <Label>Trạng thái</Label>
          <Select value={status} onChange={(e) => setStatus(e.target.value as Appointment["status"])}>
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
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div className="grid gap-1.5">
            <Label>Giờ</Label>
            <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
          </div>
        </div>

        {/* Thời lượng */}
        <div className="grid gap-1.5">
          <Label>Thời lượng (phút)</Label>
          <Select value={String(durationMin)} onChange={(e) => setDurationMin(Number(e.target.value))}>
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
          <Input value={procedure} onChange={(e) => setProcedure(e.target.value)} placeholder="VD: scaling, filling…" />
        </div>

        {/* Ghi chú */}
        <div className="grid gap-1.5">
          <Label>Ghi chú</Label>
          <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
      </DialogBody>
      <DialogFooter className="mt-4">
        <Button type="button" variant="outline" onClick={onClose}>Đóng</Button>
        <Button type="button" disabled={saving} onClick={handleSave}>
          {saving ? "Đang lưu…" : "Lưu thay đổi"}
        </Button>
      </DialogFooter>
    </Dialog>
  );
}
