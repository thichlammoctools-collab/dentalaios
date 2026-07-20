import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DateInput } from "@/components/ui/date-input";
import { apiGet, apiPatch, ApiError } from "@/lib/api";
import { toast } from "@/lib/toast";
import { useAuth } from "@/lib/auth-context";
import { formatTime, ymd } from "@/lib/utils";
import type { Appointment, DentalChair, Patient, UserWithDetails } from "@shared/types";

interface ChairBoardItem {
  chair: DentalChair;
  current_status: "available" | "cleaning" | "maintenance" | "out_of_service" | "reserved" | "occupied";
  current_appointment?: Appointment;
  next_appointment?: Appointment;
  appointments: Appointment[];
}

interface ChairBoardResponse {
  branch_id: string;
  date: string;
  chairs: ChairBoardItem[];
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

export function ChairBoardPage() {
  const { session } = useAuth();
  const [date, setDate] = useState(ymd(new Date()));
  const [board, setBoard] = useState<ChairBoardResponse | null>(null);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [users, setUsers] = useState<UserWithDetails[]>([]);
  const [loading, setLoading] = useState(true);

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
  }, [session?.branch?.id, date]);

  const patientsById = useMemo(() => new Map(patients.map((patient) => [patient.id, patient])), [patients]);
  const usersById = useMemo(() => new Map(users.map((user) => [user.id, user])), [users]);

  async function changeStatus(chairId: string, operationalStatus: DentalChair["operational_status"]) {
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

  const statusCount = (status: ChairBoardItem["current_status"]) => board?.chairs.filter((item) => item.current_status === status).length ?? 0;

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 sm:p-6">
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

      {loading ? (
        <div className="flex h-40 items-center justify-center"><div className="h-6 w-6 animate-spin rounded-full border-3 border-muted border-t-primary" /></div>
      ) : !board || board.chairs.length === 0 ? (
        <Card><CardContent className="py-12 text-center text-sm text-muted-foreground">Chưa có ghế nha nào tại chi nhánh này. Quản trị viên có thể thêm ghế qua API quản trị.</CardContent></Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {board.chairs.map((item) => {
            const { chair } = item;
            return (
              <Card key={chair.id} className="overflow-hidden">
                <CardHeader className="border-b bg-muted/20 pb-3">
                  <CardTitle className="flex items-start justify-between gap-3 text-base">
                    <span>{chair.name}<span className="ml-2 font-mono text-xs font-normal text-muted-foreground">{chair.code}</span></span>
                    <span className={`rounded-full px-2 py-1 text-[11px] font-medium ${STATUS_STYLE[item.current_status]}`}>{STATUS_LABEL[item.current_status]}</span>
                  </CardTitle>
                  <p className="text-xs text-muted-foreground">{chair.room_name ?? "Chưa gán phòng"} · {chair.chair_type}</p>
                </CardHeader>
                <CardContent className="space-y-4 pt-4">
                  {item.current_appointment ? (
                    <AppointmentSummary title="Đang diễn ra" appointment={item.current_appointment} patients={patientsById} users={usersById} />
                  ) : (
                    <p className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground">Không có lịch đang diễn ra</p>
                  )}
                  {item.next_appointment && item.next_appointment.id !== item.current_appointment?.id && (
                    <AppointmentSummary title="Lịch tiếp theo" appointment={item.next_appointment} patients={patientsById} users={usersById} compact />
                  )}
                  <div className="flex flex-wrap gap-2 border-t pt-3">
                    <Button size="sm" variant="outline" onClick={() => changeStatus(chair.id, "available")}>Trống</Button>
                    <Button size="sm" variant="outline" onClick={() => changeStatus(chair.id, "cleaning")}>Vệ sinh</Button>
                    <Button size="sm" variant="outline" onClick={() => changeStatus(chair.id, "maintenance")}>Bảo trì</Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Summary({ label, value }: { label: string; value: number }) {
  return <Card><CardContent className="p-3"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p></CardContent></Card>;
}

function AppointmentSummary({ title, appointment, patients, users, compact = false }: {
  title: string;
  appointment: Appointment;
  patients: Map<string, Patient>;
  users: Map<string, UserWithDetails>;
  compact?: boolean;
}) {
  const end = new Date(new Date(appointment.scheduled_at).getTime() + appointment.duration_min * 60_000);
  return (
    <div className="rounded-lg bg-muted/40 p-3">
      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{title}</p>
      <p className="mt-1 font-medium">{patients.get(appointment.patient_id)?.name ?? appointment.patient_id.slice(0, 8)}</p>
      <p className="mt-1 text-xs text-muted-foreground">{formatTime(appointment.scheduled_at)} - {formatTime(end.toISOString())} · {users.get(appointment.clinician_id)?.name ?? "Chưa rõ bác sĩ"}</p>
      {!compact && appointment.procedure && <p className="mt-1 text-xs text-muted-foreground">{appointment.procedure}</p>}
    </div>
  );
}
