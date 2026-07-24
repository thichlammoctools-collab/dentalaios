import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DateInput } from "@/components/ui/date-input";
import { Dialog, DialogBody, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { apiGet, apiPatch, apiPost, ApiError } from "@/lib/api";
import { toast } from "@/lib/toast";
import { useAuth } from "@/lib/auth-context";
import { formatTime, ymd } from "@/lib/utils";
import { formatCurrency } from "@/lib/utils";
import { createDashboardStream } from "@/lib/dashboard-stream";
import type { Appointment, ChairRevenueMetrics, DentalChair, Patient, UserWithDetails, Visit } from "@shared/types";
import { PERMISSIONS, ROUTES } from "@shared/constants";
import { ProfileAvatar } from "@/components/ProfileAvatar";
import { PageContainer } from "@/components/PageContainer";
import { ChairTypeIndicator, chairTypeLabel } from "@/components/ChairTypeIndicator";

interface ChairBoardItem {
  chair: DentalChair;
  current_status: "available" | "cleaning" | "maintenance" | "out_of_service" | "reserved" | "occupied";
  current_appointment?: Appointment;
  next_appointment?: Appointment;
  appointments: Appointment[];
  revenue?: ChairRevenueMetrics;
}

interface ChairBoardResponse {
  branch_id: string;
  date: string;
  chairs: ChairBoardItem[];
  unallocated_revenue?: number;
}

interface PatientsResponse { items: Patient[]; total: number }
interface UsersResponse { items: UserWithDetails[]; total: number }

const STATUS_LABEL: Record<ChairBoardItem["current_status"], string> = {
  available: "Trống",
  reserved: "Đã giữ chỗ",
  occupied: "Đang sử dụng",
  cleaning: "Đang vệ sinh",
  maintenance: "Bảo trì",
  out_of_service: "Ngưng hoạt động",
};

const STATUS_STYLE: Record<ChairBoardItem["current_status"], string> = {
  available: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200",
  reserved: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200",
  occupied: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200",
  cleaning: "bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-200",
  maintenance: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200",
  out_of_service: "bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-200",
};

const APPOINTMENT_STATUS_LABEL: Record<Appointment["status"], string> = {
  booked: "Đã đặt",
  confirmed: "Đã xác nhận",
  arrived: "Đã đến",
  in_progress: "Đang khám",
  completed: "Hoàn tất",
  cancelled: "Đã hủy",
  no_show: "Vắng mặt",
};

export function ChairBoardPage() {
  const { session } = useAuth();
  const [date, setDate] = useState(ymd(new Date()));
  const [board, setBoard] = useState<ChairBoardResponse | null>(null);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [users, setUsers] = useState<UserWithDetails[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);
  const [startingAppointmentId, setStartingAppointmentId] = useState<string | null>(null);
  const [selectedChair, setSelectedChair] = useState<ChairBoardItem | null>(null);
  const [transferAppointment, setTransferAppointment] = useState<Appointment | null>(null);
  const [transferChairId, setTransferChairId] = useState("");
  const [transferring, setTransferring] = useState(false);
  const [now, setNow] = useState(() => new Date());
  const canManage = Boolean(
    session?.role.permissions.includes(PERMISSIONS.ALL) || session?.role.permissions.includes(PERMISSIONS.MANAGE_USERS),
  );
  const canEditAppointments = Boolean(
    session?.role.permissions.includes(PERMISSIONS.ALL) || session?.role.permissions.includes(PERMISSIONS.WRITE_APPOINTMENTS),
  );
  const canViewRevenue = Boolean(
    session?.role.permissions.includes(PERMISSIONS.ALL) || session?.role.permissions.includes(PERMISSIONS.VIEW_MANAGEMENT_DASHBOARD),
  );

  useEffect(() => {
    if (!session?.branch?.id) return;
    let mounted = true;
    const load = async () => {
      try {
        const [boardResponse, patientResponse, userResponse] = await Promise.all([
          apiGet<ChairBoardResponse>(`/api/chairs/board?branch_id=${encodeURIComponent(session.branch.id)}&date=${date}`),
          apiGet<PatientsResponse>("/api/patients?limit=500"),
          apiGet<UsersResponse>(`/api/users/branch/${session.branch.id}`),
        ]);
        if (!mounted) return;
        setBoard(boardResponse);
        setPatients(patientResponse.items);
        setUsers(userResponse.items);
      } catch (error) {
        if (mounted) toast.error(error instanceof ApiError ? error.message : "Lỗi tải bảng ghế nha");
      } finally {
        if (mounted) setLoading(false);
      }
    };
    setLoading(true);
    void load();
    const refresh = window.setInterval(load, 60_000);
    return () => { mounted = false; window.clearInterval(refresh); };
  }, [session?.branch?.id, date, refreshKey]);

  useEffect(() => {
    if (!canViewRevenue) return;
    const stream = createDashboardStream({ onInvalidate: () => setRefreshKey((value) => value + 1) });
    return () => stream.stop();
  }, [canViewRevenue, date, session?.branch?.id]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  const patientsById = useMemo(() => new Map(patients.map((patient) => [patient.id, patient])), [patients]);
  const usersById = useMemo(() => new Map(users.map((user) => [user.id, user])), [users]);

  async function changeStatus(chairId: string, operationalStatus: DentalChair["operational_status"]) {
    const item = board?.chairs.find((candidate) => candidate.chair.id === chairId);
    const affected = operationalStatus === "maintenance"
      ? item?.appointments.filter((appointment) => new Date(appointment.scheduled_at) > new Date()).length ?? 0
      : 0;
    if (affected > 0 && !confirm(`Ghế này còn ${affected} lịch hẹn sắp tới. Chuyển sang bảo trì sẽ không tự động đổi ghế các lịch này. Tiếp tục?`)) return;
    try {
      const chair = await apiPatch<DentalChair>(`/api/chairs/${chairId}/status`, { operational_status: operationalStatus });
      setBoard((current) => current && {
        ...current,
        chairs: current.chairs.map((item) => item.chair.id === chair.id
          ? { ...item, chair, current_status: operationalStatus }
          : item),
      });
      toast.success("Đã cập nhật trạng thái ghế");
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Không thể cập nhật trạng thái ghế");
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
      window.location.assign(`/visits/${visit.id}`);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Không thể bắt đầu lượt khám");
    } finally {
      setStartingAppointmentId(null);
    }
  }

  function openSeatTransfer(appointment: Appointment) {
    setTransferAppointment(appointment);
    setTransferChairId("");
  }

  async function transferSeat() {
    if (!transferAppointment || !transferChairId) return;
    setTransferring(true);
    try {
      await apiPatch<Appointment>(`/api/appointments/${transferAppointment.id}`, { chair_id: transferChairId });
      toast.success("Đã chuyển ghế cho lịch hẹn");
      setTransferAppointment(null);
      setRefreshKey((value) => value + 1);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Không thể chuyển ghế cho lịch hẹn");
    } finally {
      setTransferring(false);
    }
  }

  const statusCount = (status: ChairBoardItem["current_status"]) => board?.chairs.filter((item) => item.current_status === status).length ?? 0;

  return (
    <PageContainer size="workspace">
      <div className="overflow-hidden rounded-2xl bg-gradient-to-br from-cyan-600 via-blue-600 to-indigo-700 p-5 text-white shadow-lg sm:p-8">
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Điều hành ghế nha</h1>
        <p className="mt-1 text-sm text-blue-100">Theo dõi trạng thái ghế, lịch đang diễn ra và lịch tiếp theo theo thời gian thực.</p>
        <div className="mt-4 flex flex-wrap items-end gap-3">
          <div className="w-44">
            <label className="mb-1 block text-xs font-medium text-blue-100">Ngày vận hành</label>
            <DateInput value={date} onChange={setDate} className="border-white/30 bg-white/10 text-white" />
          </div>
          <Button variant="outline" className="border-white/30 bg-white/10 text-white hover:bg-white/20" onClick={() => setDate(ymd(new Date()))}>
            Hôm nay
          </Button>
          {canManage && <Button className="bg-white text-blue-700 hover:bg-blue-50" asChild><Link to={ROUTES.CHAIRS_SETTINGS}>Quản lý ghế</Link></Button>}
          {canViewRevenue && <Button variant="outline" className="border-white/30 bg-white/10 text-white hover:bg-white/20 hover:text-white" asChild><Link to={ROUTES.CHAIRS_REPORTS}>Báo cáo ghế</Link></Button>}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
        <Summary label="Tổng ghế" value={board?.chairs.length ?? 0} />
        <Summary label="Đang dùng" value={statusCount("occupied")} />
        <Summary label="Đã giữ chỗ" value={statusCount("reserved")} />
        <Summary label="Trống" value={statusCount("available")} />
        <Summary label="Vệ sinh" value={statusCount("cleaning")} />
        <Summary label="Bảo trì" value={statusCount("maintenance") + statusCount("out_of_service")} />
      </div>
      {canViewRevenue && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <MoneySummary label="Doanh thu ghế" value={board?.chairs.reduce((total, item) => total + (item.revenue?.confirmed_revenue ?? 0), 0) ?? 0} />
          <MoneySummary label="Chưa phân bổ" value={board?.unallocated_revenue ?? 0} />
        </div>
      )}

      {loading ? (
        <div className="flex h-40 items-center justify-center"><div className="h-6 w-6 animate-spin rounded-full border-3 border-muted border-t-primary" /></div>
      ) : !board || board.chairs.length === 0 ? (
        <Card><CardContent className="py-12 text-center text-sm text-muted-foreground"><p>Chưa có ghế nha nào tại chi nhánh này.</p>{canManage && <Button className="mt-4" asChild><Link to={ROUTES.CHAIRS_SETTINGS}>Tạo ghế đầu tiên</Link></Button>}</CardContent></Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {board.chairs.map((item) => {
            const { chair } = item;
            return (
              <Card key={chair.id} onClick={() => setSelectedChair(item)} className="cursor-pointer overflow-hidden transition-colors hover:bg-muted/20">
                <CardHeader className="border-b bg-muted/20 pb-3">
                    <CardTitle className="flex items-start justify-between gap-3 text-base">
                      <span>{chair.name}<span className="ml-2 font-mono text-xs font-normal text-muted-foreground">{chair.code}</span></span>
                      <span className={`rounded-full px-2 py-1 text-[11px] font-medium ${STATUS_STYLE[item.current_status]}`}>{STATUS_LABEL[item.current_status]}</span>
                    </CardTitle>
                    <div className="mt-2 flex items-center justify-between gap-3 text-xs text-muted-foreground">
                      <span>{chair.room_name ?? "Chưa gán phòng"}</span>
                      <ChairTypeIndicator type={chair.chair_type} />
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Button size="sm" variant="outline" onClick={(event) => { event.stopPropagation(); void changeStatus(chair.id, "available"); }}>Trống</Button>
                      <Button size="sm" variant="outline" onClick={(event) => { event.stopPropagation(); void changeStatus(chair.id, "cleaning"); }}>Vệ sinh</Button>
                      <Button size="sm" variant="outline" onClick={(event) => { event.stopPropagation(); void changeStatus(chair.id, "maintenance"); }}>Bảo trì</Button>
                    </div>
                    <p className="mt-2 text-xs font-medium text-primary">Xem {item.appointments.length} lịch trong ngày</p>
                </CardHeader>
                <CardContent className="space-y-4 pt-4">
                  {item.current_appointment ? (
                    <AppointmentSummary title="Đang diễn ra" appointment={item.current_appointment} patients={patientsById} users={usersById} canEdit={canEditAppointments} onStart={startVisit} onQuickSeatTransfer={openSeatTransfer} starting={startingAppointmentId === item.current_appointment.id} now={now} />
                  ) : (
                    <p className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground">Không có lịch đang diễn ra</p>
                  )}
                  {item.next_appointment && item.next_appointment.id !== item.current_appointment?.id && (
                    <AppointmentSummary title="Lịch tiếp theo" appointment={item.next_appointment} patients={patientsById} users={usersById} compact canEdit={canEditAppointments} onStart={startVisit} onQuickSeatTransfer={openSeatTransfer} starting={startingAppointmentId === item.next_appointment.id} now={now} />
                  )}
                  {canViewRevenue && item.revenue && (
                    <div className="grid grid-cols-3 gap-2 rounded-lg bg-emerald-50 p-3 text-xs dark:bg-emerald-950/30">
                      <Metric label="Doanh thu" value={formatCurrency(item.revenue.confirmed_revenue)} />
                      <Metric label="Payment" value={String(item.revenue.payment_count)} />
                      <Metric label="DT/giờ" value={item.revenue.revenue_per_completed_hour === null ? "--" : formatCurrency(item.revenue.revenue_per_completed_hour)} />
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
      <ChairAppointmentsDialog item={selectedChair} date={date} patients={patientsById} users={usersById} onOpenChange={(open) => { if (!open) setSelectedChair(null); }} />
      <QuickSeatTransferDialog
        appointment={transferAppointment}
        chairs={board?.chairs ?? []}
        selectedChairId={transferChairId}
        onSelectedChairChange={setTransferChairId}
        onClose={() => setTransferAppointment(null)}
        onConfirm={() => void transferSeat()}
        saving={transferring}
      />
    </PageContainer>
  );
}

function Summary({ label, value }: { label: string; value: number }) {
  return <Card><CardContent className="p-3"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p></CardContent></Card>;
}

function MoneySummary({ label, value }: { label: string; value: number }) {
  return <Card><CardContent className="p-3"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 text-xl font-semibold tabular-nums">{formatCurrency(value)}</p></CardContent></Card>;
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div><p className="text-[11px] text-muted-foreground">{label}</p><p className="mt-0.5 font-semibold tabular-nums">{value}</p></div>;
}

function ChairAppointmentsDialog({ item, date, patients, users, onOpenChange }: {
  item: ChairBoardItem | null;
  date: string;
  patients: Map<string, Patient>;
  users: Map<string, UserWithDetails>;
  onOpenChange: (open: boolean) => void;
}) {
  const appointments = item?.appointments ?? [];
  return (
    <Dialog open={Boolean(item)} onOpenChange={onOpenChange}>
      <DialogHeader>
        <div className="flex items-center gap-3 pr-8">
          {item && <ChairTypeIndicator type={item.chair.chair_type} showLabel={false} />}
          <div><DialogTitle>Lịch ghế {item?.chair.name}</DialogTitle><DialogDescription>{item && `${chairTypeLabel(item.chair.chair_type)} · ${date} · ${appointments.length} lịch hẹn`}</DialogDescription></div>
        </div>
      </DialogHeader>
      <DialogBody>
        {appointments.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">Ghế này chưa có lịch hẹn trong ngày đã chọn.</p>
        ) : (
          <div className="space-y-2">
            {appointments.map((appointment) => {
              const patient = patients.get(appointment.patient_id);
              const clinician = users.get(appointment.clinician_id);
              const end = new Date(new Date(appointment.scheduled_at).getTime() + appointment.duration_min * 60_000);
              return <Link key={appointment.id} to={`/appointments/${appointment.id}?edit=1`} onClick={() => onOpenChange(false)} className="block rounded-lg border p-3 transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><div className="flex items-start justify-between gap-3"><div><p className="font-medium">{patient?.name ?? appointment.patient_id.slice(0, 8)}</p><p className="mt-1 text-xs text-muted-foreground">{formatTime(appointment.scheduled_at)} - {formatTime(end.toISOString())} · {appointment.duration_min} phút</p>{appointment.procedure && <p className="mt-1 text-xs text-muted-foreground">{appointment.procedure}</p>}</div><span className="rounded-full bg-muted px-2 py-1 text-[11px] font-medium">{APPOINTMENT_STATUS_LABEL[appointment.status]}</span></div><p className="mt-2 text-xs text-muted-foreground">{clinician?.name ?? "Chưa rõ bác sĩ"}</p></Link>;
            })}
          </div>
        )}
      </DialogBody>
    </Dialog>
  );
}

function QuickSeatTransferDialog({ appointment, chairs, selectedChairId, onSelectedChairChange, onClose, onConfirm, saving }: {
  appointment: Appointment | null;
  chairs: ChairBoardItem[];
  selectedChairId: string;
  onSelectedChairChange: (chairId: string) => void;
  onClose: () => void;
  onConfirm: () => void;
  saving: boolean;
}) {
  const availableChairs = chairs.filter((item) => item.chair.id !== appointment?.chair_id && item.chair.is_active && !["maintenance", "out_of_service"].includes(item.current_status));
  return (
    <Dialog open={Boolean(appointment)} onOpenChange={(open) => { if (!open) onClose(); }} size="sm">
      <DialogHeader>
        <DialogTitle>Chuyển ghế nhanh</DialogTitle>
        <DialogDescription>Chọn ghế mới cho lịch hẹn. Hệ thống sẽ kiểm tra trùng lịch trước khi chuyển.</DialogDescription>
      </DialogHeader>
      <DialogBody>
        <label className="grid gap-2 text-sm font-medium">
          Ghế mới
          <select value={selectedChairId} onChange={(event) => onSelectedChairChange(event.target.value)} className="h-10 rounded-md border border-input bg-background px-3 text-sm">
            <option value="">Chọn ghế</option>
            {availableChairs.map((item) => <option key={item.chair.id} value={item.chair.id}>{item.chair.name}{item.chair.room_name ? ` · ${item.chair.room_name}` : ""}</option>)}
          </select>
        </label>
        {availableChairs.length === 0 && <p className="mt-3 text-sm text-muted-foreground">Không có ghế khả dụng để chuyển.</p>}
      </DialogBody>
      <DialogFooter>
        <Button variant="outline" onClick={onClose} disabled={saving}>Hủy</Button>
        <Button onClick={onConfirm} disabled={!selectedChairId || saving}>{saving ? "Đang chuyển..." : "Xác nhận chuyển ghế"}</Button>
      </DialogFooter>
    </Dialog>
  );
}

function AppointmentSummary({ title, appointment, patients, users, compact = false, canEdit = false, onStart, onQuickSeatTransfer, starting, now }: {
  title: string;
  appointment: Appointment;
  patients: Map<string, Patient>;
  users: Map<string, UserWithDetails>;
  compact?: boolean;
  canEdit?: boolean;
  onStart: (appointment: Appointment) => void;
  onQuickSeatTransfer: (appointment: Appointment) => void;
  starting: boolean;
  now: Date;
}) {
  const end = new Date(new Date(appointment.scheduled_at).getTime() + appointment.duration_min * 60_000);
  const patient = patients.get(appointment.patient_id);
  const clinician = users.get(appointment.clinician_id);
  return (
    <div className="rounded-lg bg-muted/40 p-3">
      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{title}</p>
       <div className="mt-1 flex items-center gap-2"><ProfileAvatar subject="patients" entityId={patient?.id} name={patient?.name ?? appointment.patient_id} avatarFileId={patient?.avatar_file_id} size="sm" /><p className="font-medium">{patient?.name ?? appointment.patient_id.slice(0, 8)}</p></div>
       <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">{clinician && <ProfileAvatar subject="users" entityId={clinician.id} name={clinician.name} avatarFileId={clinician.avatar_file_id} size="sm" />}{formatTime(appointment.scheduled_at)} - {formatTime(end.toISOString())} · {clinician?.name ?? "Chưa rõ bác sĩ"}</p>
      {!compact && appointment.procedure && <p className="mt-1 text-xs text-muted-foreground">{appointment.procedure}</p>}
       {!compact && appointment.status === "arrived" && appointment.chair_id && new Date(appointment.scheduled_at) <= now && now < end && <Button size="sm" className="mt-3" onClick={(event) => { event.stopPropagation(); onStart(appointment); }} disabled={starting}>{starting ? "Đang bắt đầu..." : "Bắt đầu khám"}</Button>}
        {canEdit && new Date(appointment.scheduled_at) >= now && <Button size="sm" variant="outline" className="mt-3" onClick={(event) => { event.stopPropagation(); onQuickSeatTransfer(appointment); }}>Chuyển ghế nhanh</Button>}
        {canEdit && <Button size="sm" variant="outline" className="mt-3 ml-2" asChild><Link to={`/appointments/${appointment.id}?edit=1`} onClick={(event) => event.stopPropagation()}>Sửa lịch</Link></Button>}
    </div>
  );
}
