import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { AppointmentCard } from "@/components/schedule/AppointmentCard";
import { AppointmentForm } from "@/components/schedule/AppointmentForm";
import { apiGet } from "@/lib/api";
import type { Appointment, Patient, UserWithDetails } from "@shared/types";
import { ROUTES } from "@shared/constants";
import { formatDate, getWeekDays, isoToYmd, weekdayLabel, ymd } from "@/lib/utils";

interface AppointmentsResponse { items: Appointment[]; total: number }
interface PatientsResponse { items: Patient[]; total: number }
interface UsersResponse { items: UserWithDetails[]; total: number }

export function SchedulePage() {
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [users, setUsers] = useState<UserWithDetails[]>([]);
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);

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
      apiGet<UsersResponse>(`/api/users?limit=100`),
    ]).then(([appts, pats, us]) => {
      if (!mounted) return;
      setAppointments(appts.items);
      setPatients(pats.items);
      setUsers(us.items);
    }).catch((err) => console.error(err))
      .finally(() => mounted && setLoading(false));

    return () => { mounted = false; };
  }, [weekDays]);

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

  // Day view: filter today
  const dayAppts = appointments
    .filter((a) => isoToYmd(a.scheduled_at) === ymd(selectedDate))
    .sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at));

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
                <span>{formatDate(selectedDate.toISOString())}</span>
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
              ) : dayAppts.length === 0 ? (
                <div className="py-10 text-center">
                  <p className="text-sm text-muted-foreground">Chưa có lịch hẹn nào trong ngày này</p>
                  <Button className="mt-4" onClick={() => setCreateOpen(true)}>
                    + Tạo lịch hẹn
                  </Button>
                </div>
              ) : (
                <div className="space-y-2">
                  {dayAppts.map((a) => {
                    const patient = patientsById.get(a.patient_id);
                    const doctor = usersById.get(a.clinician_id);
                    return (
                      <AppointmentCard
                        key={a.id}
                        appointment={a}
                        patientName={patient?.name}
                        doctorName={doctor?.name}
                      />
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
                        className={`min-h-32 rounded-lg border p-2 ${isSelected ? "border-primary bg-primary/5" : isToday ? "border-amber-400 bg-amber-50/30" : "border-border"}`}
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
                        <div className="space-y-1">
                          {dayAppts.length === 0 ? (
                            <p className="text-[10px] text-muted-foreground">—</p>
                          ) : (
                            dayAppts.slice(0, 4).map((a) => {
                              const patient = patientsById.get(a.patient_id);
                              return (
                                <AppointmentCard
                                  key={a.id}
                                  appointment={a}
                                  patientName={patient?.name}
                                  compact
                                />
                              );
                            })
                          )}
                          {dayAppts.length > 4 && (
                            <p className="text-[10px] text-muted-foreground">+{dayAppts.length - 4}</p>
                          )}
                        </div>
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
        onOpenChange={setCreateOpen}
        initialDate={ymd(selectedDate)}
      />
    </div>
  );
}