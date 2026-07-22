import { useEffect, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogBody, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { apiGet, apiPatch, apiPost, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { toast } from "@/lib/toast";
import { PERMISSIONS, ROUTES } from "@shared/constants";
import type { ChairOperationalStatus, DentalChair, DentalChairType, DentalRoom } from "@shared/types";
import { DEFAULT_PAGE_SIZE, Pagination } from "@/components/ui/pagination";
import { PageContainer } from "@/components/PageContainer";
import { ChairTypeIndicator, chairTypeLabel } from "@/components/ChairTypeIndicator";

interface ChairsResponse {
  items: DentalChair[];
  total: number;
}

interface RoomsResponse {
  items: DentalRoom[];
  total: number;
}

type ChairForm = {
  code: string;
  name: string;
  room_id: string;
  chair_type: DentalChairType;
  operational_status: ChairOperationalStatus;
  turnover_min: string;
  color: string;
  notes: string;
  is_active: boolean;
};

const CHAIR_TYPES: DentalChairType[] = ["general", "surgery", "orthodontic", "pediatric", "hygiene"];

const STATUS_LABELS: Record<ChairOperationalStatus, string> = {
  available: "Sẵn sàng",
  cleaning: "Đang vệ sinh",
  maintenance: "Bảo trì",
  out_of_service: "Ngưng hoạt động",
};

const INPUT_CLASS = "w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none transition-colors focus:border-ring focus:ring-2 focus:ring-ring/40 disabled:cursor-not-allowed disabled:opacity-60";

function emptyForm(): ChairForm {
  return {
    code: "",
    name: "",
    room_id: "",
    chair_type: "general",
    operational_status: "available",
    turnover_min: "10",
    color: "#2563EB",
    notes: "",
    is_active: true,
  };
}

function formFromChair(chair: DentalChair): ChairForm {
  return {
    code: chair.code,
    name: chair.name,
    room_id: chair.room_id ?? "",
    chair_type: chair.chair_type,
    operational_status: chair.operational_status,
    turnover_min: String(chair.turnover_min),
    color: chair.color ?? "#2563EB",
    notes: chair.notes ?? "",
    is_active: chair.is_active,
  };
}

export function ChairSettingsPage() {
  const { session } = useAuth();
  const [chairs, setChairs] = useState<DentalChair[]>([]);
  const [rooms, setRooms] = useState<DentalRoom[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingChair, setEditingChair] = useState<DentalChair | null>(null);
  const [form, setForm] = useState<ChairForm>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [roomDialogOpen, setRoomDialogOpen] = useState(false);
  const [roomName, setRoomName] = useState("");
  const [savingRoom, setSavingRoom] = useState(false);
  const [page, setPage] = useState(1);
  const canManage = Boolean(
    session?.role.permissions.includes(PERMISSIONS.ALL) || session?.role.permissions.includes(PERMISSIONS.MANAGE_USERS),
  );

  const branchId = session?.branch?.id;
  const visibleChairs = chairs.slice((page - 1) * DEFAULT_PAGE_SIZE, page * DEFAULT_PAGE_SIZE);

  useEffect(() => {
    if (!branchId) return;
    void loadChairs();
  }, [branchId]);

  async function loadChairs() {
    if (!branchId) return;
    setLoading(true);
    try {
      const [chairsResponse, roomsResponse] = await Promise.all([
        apiGet<ChairsResponse>(`/api/chairs?branch_id=${encodeURIComponent(branchId)}`),
        apiGet<RoomsResponse>(`/api/chairs/rooms?branch_id=${encodeURIComponent(branchId)}`),
      ]);
      setChairs(chairsResponse.items);
      setPage((current) => Math.min(current, Math.max(1, Math.ceil(chairsResponse.items.length / DEFAULT_PAGE_SIZE))));
      setRooms(roomsResponse.items);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Không thể tải danh sách ghế nha");
    } finally {
      setLoading(false);
    }
  }

  function openCreate() {
    setEditingChair(null);
    setForm(emptyForm());
    setDialogOpen(true);
  }

  function openEdit(chair: DentalChair) {
    setEditingChair(chair);
    setForm(formFromChair(chair));
    setDialogOpen(true);
  }

  function setField<K extends keyof ChairForm>(field: K, value: ChairForm[K]) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function openCreateRoom() {
    setRoomName("");
    setRoomDialogOpen(true);
  }

  async function createRoom() {
    if (!branchId) return;
    const name = roomName.trim();
    if (!name) {
      toast.error("Vui lòng nhập tên phòng");
      return;
    }
    setSavingRoom(true);
    try {
      const room = await apiPost<DentalRoom>("/api/chairs/rooms", { branch_id: branchId, name });
      setRooms((current) => [...current, room].sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name)));
      setField("room_id", room.id);
      setRoomDialogOpen(false);
      toast.success("Đã tạo phòng");
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Không thể tạo phòng");
    } finally {
      setSavingRoom(false);
    }
  }

  async function saveChair() {
    if (!branchId) return;
    const code = form.code.trim().toUpperCase();
    const name = form.name.trim();
    const turnover = Number(form.turnover_min);
    if (!name || (!editingChair && !code)) {
      toast.error("Vui lòng nhập mã và tên ghế");
      return;
    }
    if (!Number.isInteger(turnover) || turnover < 0 || turnover > 120) {
      toast.error("Thời gian chuẩn bị phải từ 0 đến 120 phút");
      return;
    }

    const payload = {
      name,
      room_id: form.room_id || null,
      chair_type: form.chair_type,
      operational_status: form.operational_status,
      turnover_min: turnover,
      color: form.color || undefined,
      notes: form.notes.trim() || undefined,
      is_active: form.is_active,
    };

    setSaving(true);
    try {
      if (editingChair) {
        const updated = await apiPatch<DentalChair>(`/api/chairs/${editingChair.id}`, payload);
        setChairs((current) => current.map((chair) => chair.id === updated.id ? updated : chair));
        toast.success("Đã cập nhật ghế nha");
      } else {
        const created = await apiPost<DentalChair>("/api/chairs", { ...payload, branch_id: branchId, code });
        setChairs((current) => [...current, created].sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name)));
        toast.success("Đã tạo ghế nha");
      }
      setDialogOpen(false);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Không thể lưu ghế nha");
    } finally {
      setSaving(false);
    }
  }

  async function changeStatus(chair: DentalChair, operationalStatus: ChairOperationalStatus) {
    try {
      const updated = await apiPatch<DentalChair>(`/api/chairs/${chair.id}/status`, { operational_status: operationalStatus });
      setChairs((current) => current.map((item) => item.id === updated.id ? updated : item));
      toast.success("Đã cập nhật trạng thái ghế");
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Không thể cập nhật trạng thái ghế");
    }
  }

  return (
    <PageContainer>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Cấu hình ghế nha</h1>
          <p className="mt-1 text-sm text-muted-foreground">Thiết lập phòng và ghế tại chi nhánh hiện tại trước khi gán vào lịch hẹn.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" asChild><Link to={ROUTES.CHAIRS}>Điều hành ghế</Link></Button>
          {canManage && <Button variant="outline" onClick={openCreateRoom}>Thêm phòng</Button>}
          {canManage && <Button onClick={openCreate}>Thêm ghế</Button>}
        </div>
      </div>

      {!canManage && <Card><CardContent className="py-4 text-sm text-muted-foreground">Bạn có thể xem cấu hình ghế, nhưng cần quyền quản trị người dùng để tạo hoặc chỉnh sửa ghế.</CardContent></Card>}

      {loading ? (
        <div className="flex h-40 items-center justify-center"><div className="h-7 w-7 animate-spin rounded-full border-4 border-muted border-t-primary" /></div>
      ) : chairs.length === 0 ? (
        <Card><CardContent className="py-14 text-center"><p className="text-sm text-muted-foreground">Chi nhánh này chưa có ghế nha.</p>{canManage && <Button className="mt-4" onClick={openCreate}>Tạo ghế đầu tiên</Button>}</CardContent></Card>
      ) : (
        <Card>
          <CardHeader><CardTitle className="text-base">Danh sách ghế ({chairs.length})</CardTitle></CardHeader>
          <CardContent className="overflow-x-auto p-0">
            <table className="w-full min-w-[760px] text-sm">
              <thead className="border-y bg-muted/30 text-left text-xs text-muted-foreground">
                <tr><th className="px-5 py-3 font-medium">Ghế</th><th className="px-4 py-3 font-medium">Phòng / loại</th><th className="px-4 py-3 font-medium">Chuẩn bị</th><th className="px-4 py-3 font-medium">Trạng thái</th><th className="px-4 py-3 font-medium">Hoạt động</th><th className="px-5 py-3 text-right font-medium">Thao tác</th></tr>
              </thead>
              <tbody className="divide-y">
                {visibleChairs.map((chair) => (
                  <tr key={chair.id}>
                    <td className="px-5 py-4"><div className="flex items-center gap-3"><span className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: chair.color ?? "#2563EB" }} /><div><p className="font-medium">{chair.name}</p><p className="font-mono text-xs text-muted-foreground">{chair.code}</p></div></div></td>
                    <td className="px-4 py-4"><p>{chair.room_name ?? "Chưa gán phòng"}</p><ChairTypeIndicator type={chair.chair_type} className="mt-1 text-xs text-muted-foreground" /></td>
                    <td className="px-4 py-4 tabular-nums">{chair.turnover_min} phút</td>
                    <td className="px-4 py-4"><span className="rounded-full bg-muted px-2 py-1 text-xs">{STATUS_LABELS[chair.operational_status]}</span></td>
                    <td className="px-4 py-4">{chair.is_active ? <span className="text-emerald-700 dark:text-emerald-400">Đang dùng</span> : <span className="text-muted-foreground">Tạm dừng</span>}</td>
                    <td className="px-5 py-4 text-right"><div className="flex justify-end gap-2">{canManage && <Button size="sm" variant="outline" onClick={() => changeStatus(chair, chair.operational_status === "maintenance" ? "available" : "maintenance")}>{chair.operational_status === "maintenance" ? "Khôi phục" : "Bảo trì"}</Button>}{canManage && <Button size="sm" onClick={() => openEdit(chair)}>Chỉnh sửa</Button>}</div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
          <CardContent className="pt-4"><Pagination page={page} pageSize={DEFAULT_PAGE_SIZE} total={chairs.length} onPageChange={setPage} /></CardContent>
        </Card>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogHeader><DialogTitle>{editingChair ? "Chỉnh sửa ghế nha" : "Tạo ghế nha"}</DialogTitle><DialogDescription>{editingChair ? "Mã ghế là mã nội bộ và không thể thay đổi sau khi tạo." : "Mã ghế dùng để nhận diện nội bộ, ví dụ: GHE-01 hoặc P1-A."}</DialogDescription></DialogHeader>
        <DialogBody>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Mã ghế" required><input value={form.code} disabled={Boolean(editingChair)} onChange={(event) => setField("code", event.target.value)} placeholder="GHE-01" className={INPUT_CLASS} /></Field>
            <Field label="Tên ghế" required><input value={form.name} onChange={(event) => setField("name", event.target.value)} placeholder="Ghế số 1" className={INPUT_CLASS} /></Field>
            <Field label="Phòng"><div className="flex gap-2"><select value={form.room_id} onChange={(event) => setField("room_id", event.target.value)} className={INPUT_CLASS}><option value="">Chưa gán phòng</option>{rooms.filter((room) => room.is_active).map((room) => <option key={room.id} value={room.id}>{room.name}</option>)}</select>{canManage && <Button variant="outline" className="shrink-0" onClick={openCreateRoom}>Tạo phòng</Button>}</div></Field>
            <Field label="Loại ghế"><select value={form.chair_type} onChange={(event) => setField("chair_type", event.target.value as DentalChairType)} className={INPUT_CLASS}>{CHAIR_TYPES.map((type) => <option key={type} value={type}>{chairTypeLabel(type)}</option>)}</select></Field>
            <Field label="Trạng thái vận hành"><select value={form.operational_status} onChange={(event) => setField("operational_status", event.target.value as ChairOperationalStatus)} className={INPUT_CLASS}>{Object.entries(STATUS_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></Field>
            <Field label="Thời gian chuẩn bị (phút)"><input type="number" min="0" max="120" value={form.turnover_min} onChange={(event) => setField("turnover_min", event.target.value)} className={INPUT_CLASS} /></Field>
            <Field label="Màu hiển thị"><div className="flex gap-2"><input type="color" value={form.color} onChange={(event) => setField("color", event.target.value)} className="h-10 w-12 rounded border border-input bg-background p-1" /><input value={form.color} onChange={(event) => setField("color", event.target.value)} className={INPUT_CLASS} /></div></Field>
            <label className="flex items-center gap-3 self-end rounded-md border border-input px-3 py-2.5 text-sm"><input type="checkbox" checked={form.is_active} onChange={(event) => setField("is_active", event.target.checked)} /> Cho phép đặt lịch tại ghế này</label>
            <Field label="Ghi chú" className="sm:col-span-2"><textarea value={form.notes} onChange={(event) => setField("notes", event.target.value)} rows={3} className={`${INPUT_CLASS} resize-y`} /></Field>
          </div>
        </DialogBody>
        <DialogFooter><Button variant="outline" onClick={() => setDialogOpen(false)}>Hủy</Button><Button disabled={saving} onClick={() => void saveChair()}>{saving ? "Đang lưu..." : editingChair ? "Lưu thay đổi" : "Tạo ghế"}</Button></DialogFooter>
      </Dialog>

      <Dialog open={roomDialogOpen} onOpenChange={setRoomDialogOpen}>
        <DialogHeader><DialogTitle>Tạo phòng</DialogTitle><DialogDescription>Phòng sẽ được dùng chung cho các ghế của chi nhánh hiện tại.</DialogDescription></DialogHeader>
        <DialogBody><Field label="Tên phòng" required><input value={roomName} onChange={(event) => setRoomName(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void createRoom(); }} placeholder="Phòng 01" autoFocus className={INPUT_CLASS} /></Field></DialogBody>
        <DialogFooter><Button variant="outline" onClick={() => setRoomDialogOpen(false)}>Hủy</Button><Button disabled={savingRoom} onClick={() => void createRoom()}>{savingRoom ? "Đang tạo..." : "Tạo phòng"}</Button></DialogFooter>
      </Dialog>
    </PageContainer>
  );
}

function Field({ label, required, className, children }: { label: string; required?: boolean; className?: string; children: ReactNode }) {
  return <label className={`block ${className ?? ""}`}><span className="mb-1.5 block text-sm font-medium">{label}{required && <span className="text-destructive"> *</span>}</span>{children}</label>;
}
