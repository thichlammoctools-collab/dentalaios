import { useEffect, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { DateInput } from "@/components/ui/date-input";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { apiGet, apiPost, apiPatch, ApiError } from "@/lib/api";
import { toast } from "@/lib/toast";
import { getMinimumAppointmentTime, getNextAppointmentSlot, isAppointmentTimeInPast } from "@/lib/appointment-time";
import type { Appointment, Patient, User } from "@shared/types";
import { PageContainer } from "@/components/PageContainer";

interface AppointmentsResponse { items: Appointment[]; total: number }
interface PatientsResponse { items: Patient[]; total: number }
interface UsersResponse { items: User[]; total: number }

const STATUS_LABELS: Record<string, string> = {
  booked: "Đã đặt",
  confirmed: "Xác nhận",
  arrived: "Đã đến",
  completed: "Hoàn thành",
  cancelled: "Đã hủy",
  no_show: "Không đến",
};

const STATUS_DOT: Record<string, string> = {
  booked: "bg-blue-500",
  confirmed: "bg-amber-500",
  arrived: "bg-indigo-500",
  completed: "bg-emerald-500",
  cancelled: "bg-gray-400",
  no_show: "bg-red-500",
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function startOfMonth(year: number, month: number) {
  return new Date(year, month, 1);
}

function endOfMonth(year: number, month: number) {
  return new Date(year, month + 1, 0);
}

function startOfWeek(date: Date) {
  const d = new Date(date);
  d.setDate(d.getDate() - d.getDay());
  return d;
}

function addDays(date: Date, n: number) {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

function isoDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function isoDatetime(dateStr: string, hour: number, min: number): string {
  // Form values represent clinic-local wall time. Constructing with a `Z`
  // suffix treats 09:00 as UTC (16:00 in Vietnam), so use local components
  // and serialize the resulting instant instead.
  const [year, month, day] = dateStr.split("-").map(Number);
  const d = new Date(year, month - 1, day, hour, min, 0, 0);
  return d.toISOString();
}

const MONTH_NAMES = [
  "Tháng 1","Tháng 2","Tháng 3","Tháng 4","Tháng 5","Tháng 6",
  "Tháng 7","Tháng 8","Tháng 9","Tháng 10","Tháng 11","Tháng 12",
];
const DAY_NAMES = ["CN","T2","T3","T4","T5","T6","T7"];

// ─── CalendarPage ──────────────────────────────────────────────────────────────

export function CalendarPage() {
  const today = new Date();
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(false);

  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const weekStart = selectedDate ? startOfWeek(selectedDate) : null;

  const [formOpen, setFormOpen] = useState(false);
  const [editAppt, setEditAppt] = useState<Appointment | null>(null);
  const [saving, setSaving] = useState(false);

  const [patients, setPatients] = useState<Patient[]>([]);
  const [doctors, setDoctors] = useState<User[]>([]);
  const [patientSearch, setPatientSearch] = useState("");

  const initialSlot = getNextAppointmentSlot();
  const [form, setForm] = useState({
    patient_id: "",
    clinician_id: "",
    scheduled_date: initialSlot.date,
    scheduled_time: initialSlot.time,
    duration_min: 30,
    procedure: "",
    notes: "",
  });

  // ─── Load appointments ───────────────────────────────────────────────────
  const loadMonth = useCallback(async (year: number, month: number) => {
    setLoading(true);
    try {
      const from = new Date(year, month, 1).toISOString().slice(0, 10);
      const to = new Date(year, month + 1, 0).toISOString().slice(0, 10);
      const res = await apiGet<AppointmentsResponse>(
        `/api/appointments?from=${from}T00:00:00.000Z&to=${to}T23:59:59.999Z`,
      );
      setAppointments(res.items);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Lỗi tải lịch hẹn");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadMonth(viewYear, viewMonth);
  }, [viewYear, viewMonth, loadMonth]);

  // ─── Month grid ──────────────────────────────────────────────────────────
  const monthDays = (() => {
    const start = startOfMonth(viewYear, viewMonth);
    const end = endOfMonth(viewYear, viewMonth);
    const days: { date: Date; iso: string; isCurrentMonth: boolean; isToday: boolean; appointments: Appointment[] }[] = [];

    const startDow = start.getDay();
    for (let i = startDow - 1; i >= 0; i--) {
      const d = addDays(start, -(i + 1));
      days.push({ date: d, iso: isoDate(d), isCurrentMonth: false, isToday: false, appointments: [] });
    }
    for (let d = new Date(start); d <= end; d = addDays(d, 1)) {
      const iso = isoDate(d);
      days.push({
        date: new Date(d),
        iso,
        isCurrentMonth: true,
        isToday: iso === isoDate(today),
        appointments: appointments.filter((a) => a.scheduled_at.slice(0, 10) === iso),
      });
    }
    const remaining = 7 - (days.length % 7);
    if (remaining < 7) {
      for (let i = 1; i <= remaining; i++) {
        const d = addDays(end, i);
        days.push({ date: d, iso: isoDate(d), isCurrentMonth: false, isToday: false, appointments: [] });
      }
    }
    return days;
  })();

  // ─── Week view ────────────────────────────────────────────────────────────
  const weekDays = weekStart
    ? Array.from({ length: 7 }, (_, i) => {
        const d = addDays(weekStart, i);
        const iso = isoDate(d);
        return {
          date: d,
          iso,
          isToday: iso === isoDate(today),
          isSelected: selectedDate && iso === isoDate(selectedDate),
          appointments: appointments.filter((a) => a.scheduled_at.slice(0, 10) === iso),
        };
      })
    : null;

  // ─── Navigate ────────────────────────────────────────────────────────────
  function prevMonth() {
    if (viewMonth === 0) { setViewMonth(11); setViewYear((y) => y - 1); }
    else setViewMonth((m) => m - 1);
  }
  function nextMonth() {
    if (viewMonth === 11) { setViewMonth(0); setViewYear((y) => y + 1); }
    else setViewMonth((m) => m + 1);
  }

  // ─── Open form ────────────────────────────────────────────────────────────
  async function openCreateForm(date?: Date) {
    setEditAppt(null);
    const slot = getNextAppointmentSlot();
    const selected = date ?? selectedDate;
    const selectedDate = selected ? isoDate(selected) : slot.date;
    setForm({
      patient_id: "",
      clinician_id: "",
      scheduled_date: selectedDate,
      scheduled_time: selectedDate === slot.date ? slot.time : "09:00",
      duration_min: 30,
      procedure: "",
      notes: "",
    });
    setPatientSearch("");
    setFormOpen(true);
    try {
      const [p, u] = await Promise.all([
        apiGet<PatientsResponse>("/api/patients?limit=100"),
        apiGet<UsersResponse>("/api/users?limit=100"),
      ]);
      setPatients(p.items);
      setDoctors(u.items);
    } catch { /* ignore */ }
  }

  function openEditForm(appt: Appointment) {
    setEditAppt(appt);
    const d = new Date(appt.scheduled_at);
    setForm({
      patient_id: appt.patient_id,
      clinician_id: appt.clinician_id,
      scheduled_date: isoDate(d),
      scheduled_time: `${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}`,
      duration_min: appt.duration_min,
      procedure: appt.procedure ?? "",
      notes: appt.notes ?? "",
    });
    setPatientSearch("");
    setFormOpen(true);
    // Pre-populate with this appointment's patient + all users
    setPatients([{ id: appt.patient_id, tenant_id: "", branch_id: "", name: appt.patient_name ?? "", date_of_birth: "", gender: "M", phone: appt.patient_phone ?? "", created_at: "" } as Patient]);
    apiGet<UsersResponse>("/api/users?limit=100").then((u) => setDoctors(u.items)).catch(() => {});
  }

  // ─── Submit ───────────────────────────────────────────────────────────────
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.patient_id || !form.scheduled_date || !form.scheduled_time || !form.clinician_id) {
      toast.error("Vui lòng điền đầy đủ thông tin bắt buộc");
      return;
    }
    const isRescheduling = editAppt
      && (form.scheduled_date !== isoDate(new Date(editAppt.scheduled_at))
        || form.scheduled_time !== `${String(new Date(editAppt.scheduled_at).getHours()).padStart(2, "0")}:${String(new Date(editAppt.scheduled_at).getMinutes()).padStart(2, "0")}`);
    if ((!editAppt || isRescheduling) && isAppointmentTimeInPast(form.scheduled_date, form.scheduled_time)) {
      toast.error("Thời gian lịch hẹn phải sau thời điểm hiện tại ít nhất 5 phút");
      return;
    }
    setSaving(true);
    try {
      const [h, m] = form.scheduled_time.split(":").map(Number);
      const scheduled_at = isoDatetime(form.scheduled_date, h, m);
      const payload = {
        patient_id: form.patient_id,
        clinician_id: form.clinician_id,
        scheduled_at,
        duration_min: form.duration_min,
        procedure: form.procedure || undefined,
        notes: form.notes || undefined,
      };
      if (editAppt) {
        const updated = await apiPatch<Appointment>(`/api/appointments/${editAppt.id}`, payload);
        setAppointments((prev) => prev.map((a) => (a.id === updated.id ? updated : a)));
        toast.success("Cập nhật lịch hẹn thành công");
      } else {
        const created = await apiPost<Appointment>("/api/appointments", payload);
        setAppointments((prev) => [...prev, created]);
        toast.success("Tạo lịch hẹn thành công");
      }
      setFormOpen(false);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Lỗi lưu lịch hẹn");
    } finally {
      setSaving(false);
    }
  }

  async function handleCancel(appt: Appointment) {
    try {
      const updated = await apiPatch<Appointment>(`/api/appointments/${appt.id}`, { status: "cancelled" });
      setAppointments((prev) => prev.map((a) => (a.id === updated.id ? updated : a)));
      toast.success("Đã hủy lịch hẹn");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Lỗi hủy lịch hẹn");
    }
  }

  const filteredPatients = patients.filter((p) =>
    p.name.toLowerCase().includes(patientSearch.toLowerCase()) ||
    p.phone.includes(patientSearch),
  );

  function apptDot(status: string) {
    return STATUS_DOT[status] ?? "bg-gray-400";
  }

  function apptLabel(status: string) {
    return STATUS_LABELS[status] ?? status;
  }

  return (
    <PageContainer className="space-y-4">

      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Lịch hẹn</h1>
        <Button onClick={() => openCreateForm()}>+ Tạo lịch hẹn</Button>
      </div>

      {/* Month navigation */}
      <div className="flex items-center gap-3">
        <Button variant="outline" size="sm" onClick={prevMonth}>‹</Button>
        <span className="min-w-[140px] text-center font-semibold">
          {MONTH_NAMES[viewMonth]} {viewYear}
        </span>
        <Button variant="outline" size="sm" onClick={nextMonth}>›</Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => { setViewYear(today.getFullYear()); setViewMonth(today.getMonth()); }}
          className="ml-2"
        >
          Hôm nay
        </Button>
      </div>

      {/* Week detail */}
      {weekDays && (
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">
                Tuần {weekStart!.toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric" })}
              </CardTitle>
              <Button variant="ghost" size="sm" onClick={() => setSelectedDate(null)}>Đóng</Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-7">
              {weekDays.map((day) => (
                <div key={day.iso} className={`rounded-md border p-2 ${day.isSelected ? "border-primary bg-primary/5" : ""}`}>
                  <div className={`mb-1 text-center text-sm font-medium ${day.isToday ? "text-primary" : ""}`}>
                    <span className="sm:hidden">{day.date.getDate()}</span>
                    <span className="hidden sm:block">
                      {DAY_NAMES[day.date.getDay()]} {day.date.getDate()}/{day.date.getMonth() + 1}
                    </span>
                  </div>
                  {day.appointments.length === 0 ? (
                    <p className="py-4 text-center text-xs text-muted-foreground">—</p>
                  ) : (
                    <div className="space-y-1">
                      {day.appointments.slice(0, 4).map((a) => (
                        <button
                          key={a.id}
                          onClick={() => openEditForm(a)}
                          className="w-full truncate rounded px-1.5 py-0.5 text-left text-xs font-medium cursor-pointer hover:opacity-80"
                          title={`${a.patient_name} ${a.scheduled_at ? new Date(a.scheduled_at).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" }) : ""}`}
                        >
                          <span className={`inline-block h-1.5 w-1.5 rounded-full mr-1 ${apptDot(a.status)}`} />
                          {a.scheduled_at ? new Date(a.scheduled_at).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" }) : ""} {a.patient_name}
                        </button>
                      ))}
                      {day.appointments.length > 4 && (
                        <p className="text-center text-[10px] text-muted-foreground">+{day.appointments.length - 4}</p>
                      )}
                    </div>
                  )}
                  <button
                    onClick={() => openCreateForm(day.date)}
                    className="mt-1 w-full rounded border border-dashed border-border py-0.5 text-xs text-muted-foreground hover:border-primary hover:text-primary"
                  >+</button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Month grid */}
      <Card>
        <CardContent className="p-0">
          <div className="grid grid-cols-7 border-b border-border">
            {DAY_NAMES.map((d) => (
              <div key={d} className="py-2 text-center text-xs font-semibold text-muted-foreground">{d}</div>
            ))}
          </div>
          <div className="grid grid-cols-7">
            {monthDays.map((day, idx) => {
              const hasAppts = day.appointments.length > 0;
              const isWeekend = day.date.getDay() === 0;
              return (
                <button
                  key={day.iso + idx}
                  onClick={() => day.isCurrentMonth && setSelectedDate(day.date)}
                  className={`
                    min-h-[72px] sm:min-h-[90px] border-b border-r border-border p-1.5 text-left
                    transition-colors hover:bg-accent/50
                    ${!day.isCurrentMonth ? "bg-muted/30 text-muted-foreground" : ""}
                    ${day.isToday ? "bg-primary/5" : ""}
                    ${isWeekend && day.isCurrentMonth ? "bg-muted/20" : ""}
                  `}
                  disabled={!day.isCurrentMonth}
                >
                  <span className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-sm
                    ${day.isToday ? "bg-primary text-primary-foreground font-bold" : "font-medium"}
                  `}>
                    {day.date.getDate()}
                  </span>
                  {hasAppts && (
                    <div className="mt-1 space-y-0.5">
                      {day.appointments.slice(0, 3).map((a) => (
                        <div
                          key={a.id}
                          className={`truncate rounded px-1 py-0.5 text-[10px] leading-tight ${
                            a.status === "cancelled" ? "bg-gray-100 text-gray-400 line-through" :
                            a.status === "completed" ? "bg-emerald-100 text-emerald-700" :
                            a.status === "confirmed" ? "bg-amber-100 text-amber-700" :
                            "bg-blue-100 text-blue-700"
                          }`}
                          title={`${a.patient_name} ${a.scheduled_at ? new Date(a.scheduled_at).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" }) : ""}`}
                        >
                          {a.scheduled_at ? new Date(a.scheduled_at).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" }) : ""} {a.patient_name}
                        </div>
                      ))}
                      {day.appointments.length > 3 && (
                        <div className="text-[10px] text-muted-foreground">+{day.appointments.length - 3}</div>
                      )}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Legend */}
      <div className="flex flex-wrap gap-3 text-xs">
        {Object.entries(STATUS_LABELS).map(([k, v]) => (
          <div key={k} className="flex items-center gap-1.5">
            <span className={`inline-block h-2 w-2 rounded-full ${apptDot(k)}`} />
            {v}
          </div>
        ))}
      </div>

      {/* ─── Create/Edit Dialog ─────────────────────────────────────────── */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogHeader>
          <DialogTitle>{editAppt ? "Sửa lịch hẹn" : "Tạo lịch hẹn"}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 px-6 pb-6">

          {/* Doctor */}
          <div className="space-y-1.5">
            <Label htmlFor="clinician">Bác sĩ *</Label>
            <Select
              id="clinician"
              value={form.clinician_id}
              onChange={(e) => setForm((f) => ({ ...f, clinician_id: e.target.value }))}
              required
            >
              <option value="">— Chọn bác sĩ —</option>
              {doctors.map((d) => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </Select>
          </div>

          {/* Patient */}
          <div className="space-y-1.5">
            <Label htmlFor="patient">Bệnh nhân *</Label>
            <Input
              id="patient-search"
              placeholder="Tìm tên hoặc SĐT..."
              value={patientSearch}
              onChange={(e) => setPatientSearch(e.target.value)}
              className="mb-1"
            />
            <Select
              id="patient"
              value={form.patient_id}
              onChange={(e) => setForm((f) => ({ ...f, patient_id: e.target.value }))}
              required
            >
              <option value="">— Chọn bệnh nhân —</option>
              {filteredPatients.map((p) => (
                <option key={p.id} value={p.id}>{p.name} — {p.phone}</option>
              ))}
            </Select>
          </div>

          {/* Date + time */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="date">Ngày *</Label>
              <DateInput
                id="date"
                value={form.scheduled_date}
                onChange={(scheduled_date) => setForm((f) => {
                  const minimum = getMinimumAppointmentTime(scheduled_date);
                  return { ...f, scheduled_date, scheduled_time: minimum && f.scheduled_time < minimum ? minimum : f.scheduled_time };
                })}
                min={isoDate(new Date())}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="time">Giờ *</Label>
              <Input
                id="time"
                type="time"
                value={form.scheduled_time}
                onChange={(e) => setForm((f) => ({ ...f, scheduled_time: e.target.value }))}
                min={getMinimumAppointmentTime(form.scheduled_date)}
                required
              />
            </div>
          </div>

          {/* Duration + Procedure */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="duration">Thời lượng</Label>
              <Select
                id="duration"
                value={String(form.duration_min)}
                onChange={(e) => setForm((f) => ({ ...f, duration_min: parseInt(e.target.value) }))}
              >
                <option value="15">15 phút</option>
                <option value="30">30 phút</option>
                <option value="45">45 phút</option>
                <option value="60">1 giờ</option>
                <option value="90">1.5 giờ</option>
                <option value="120">2 giờ</option>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="procedure">Hạng mục</Label>
              <Input
                id="procedure"
                placeholder="VD: Khám tổng quát"
                value={form.procedure}
                onChange={(e) => setForm((f) => ({ ...f, procedure: e.target.value }))}
              />
            </div>
          </div>

          {/* Notes */}
          <div className="space-y-1.5">
            <Label htmlFor="notes">Ghi chú</Label>
            <Textarea
              id="notes"
              placeholder="Ghi chú thêm..."
              rows={2}
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
            />
          </div>

          {/* Actions */}
          <div className="flex items-center justify-between">
            {editAppt && editAppt.status !== "cancelled" && (
              <Button
                type="button"
                variant="destructive"
                size="sm"
                onClick={() => { setFormOpen(false); handleCancel(editAppt); }}
              >
                Hủy lịch
              </Button>
            )}
            <div className="ml-auto flex gap-2">
              <Button type="button" variant="outline" onClick={() => setFormOpen(false)}>Đóng</Button>
              <Button type="submit" disabled={saving}>
                {saving ? "Đang lưu..." : editAppt ? "Lưu" : "Tạo lịch"}
              </Button>
            </div>
          </div>
        </form>
      </Dialog>
    </PageContainer>
  );
}
