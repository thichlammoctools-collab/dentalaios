import { useEffect, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CurrencyInput } from "@/components/ui/currency-input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogBody, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { apiGet, apiPatch, apiPost, ApiError } from "@/lib/api";
import { toast } from "@/lib/toast";
import { useAuth } from "@/lib/auth-context";
import { isAssistantRole, isDoctorRole, isValidFdiTooth } from "@shared/constants";
import type { ProcedureCatalogItem, TreatmentPlanItem, TreatmentService, UserWithDetails } from "@shared/types";

interface TreatmentPlanItemFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  planId: string;
  item?: TreatmentPlanItem | null;
  onCreated: (item: TreatmentPlanItem) => void;
}

export function TreatmentPlanItemForm({
  open,
  onOpenChange,
  planId,
  item,
  onCreated,
}: TreatmentPlanItemFormProps) {
  const { session } = useAuth();
  const [toothNumber, setToothNumber] = useState<number | "">("");
  const [procedure, setProcedure] = useState("filling");
  const [description, setDescription] = useState("");
  const [unitCost, setUnitCost] = useState<number | "">("");
  const [services, setServices] = useState<TreatmentService[]>([]);
  const [procedures, setProcedures] = useState<ProcedureCatalogItem[]>([]);
  const [serviceCode, setServiceCode] = useState("");
  const [saving, setSaving] = useState(false);
  const [fullMouth, setFullMouth] = useState(false);
  const [users, setUsers] = useState<UserWithDetails[]>([]);
  const [treatingClinicianId, setTreatingClinicianId] = useState("");
  const [assistantId, setAssistantId] = useState("");

  const validTooth =
    fullMouth || (typeof toothNumber === "number" ? isValidFdiTooth(toothNumber) : false);

  useEffect(() => {
    if (!open) return;
    setToothNumber(item?.tooth_number ?? "");
    setProcedure(item?.procedure ?? "filling");
    setDescription(item?.description ?? "");
    setUnitCost(item?.unit_cost ?? "");
    setServiceCode(item?.service_code ?? "");
    setTreatingClinicianId(item?.treating_clinician_id ?? "");
    setAssistantId(item?.assistant_id ?? "");
    setFullMouth(item?.tooth_number == null && Boolean(item));
    void Promise.all([
      apiGet<{ items: TreatmentService[] }>("/api/clinic/treatment-services"),
      apiGet<{ items: ProcedureCatalogItem[] }>("/api/clinic/procedures"),
    ])
      .then(([servicesResponse, proceduresResponse]) => {
        setServices(servicesResponse.items.filter((service) => service.is_active));
        setProcedures(proceduresResponse.items);
      })
      .catch(() => setServices([]));
    if (session?.branch.id) {
      void apiGet<{ items: UserWithDetails[] }>(`/api/users/branch/${session.branch.id}`)
        .then((response) => setUsers(response.items))
        .catch(() => setUsers([]));
    }
  }, [open, item, session?.branch.id]);

  function selectService(code: string) {
    setServiceCode(code);
    const service = services.find((item) => item.code === code);
    if (!service) return;
    setProcedure(service.procedure);
    setUnitCost(service.price);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!validTooth) {
      toast.error("Số răng FDI không hợp lệ (vd: 11, 16, 28, 31, 48…)");
      return;
    }
    if (typeof unitCost !== "number" || unitCost < 0) {
      toast.error("Đơn giá phải ≥ 0");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        tooth_number: fullMouth ? null : toothNumber,
        procedure,
        service_code: serviceCode || undefined,
        treating_clinician_id: treatingClinicianId || null,
        assistant_id: assistantId || null,
        description,
        unit_cost: unitCost,
      };
      const created = item
        ? await apiPatch<TreatmentPlanItem>(`/api/treatment-plans/${planId}/items/${item.id}`, payload)
        : await apiPost<TreatmentPlanItem>(`/api/treatment-plans/${planId}/items`, payload);
      toast.success(item ? "Đã cập nhật hạng mục" : "Đã thêm hạng mục");
      onCreated(created);
      onOpenChange(false);
      setToothNumber("");
      setDescription("");
      setUnitCost("");
      setServiceCode("");
      setTreatingClinicianId("");
      setAssistantId("");
      setFullMouth(false);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Lỗi thêm item");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <form onSubmit={onSubmit}>
        <DialogHeader>
          <DialogTitle>{item ? "Sửa thủ thuật/dịch vụ điều trị" : "Thêm thủ thuật/dịch vụ điều trị"}</DialogTitle>
        </DialogHeader>
        <DialogBody className="grid gap-4">

          <SectionDivider icon={<ToothIcon />}>Vị trí răng</SectionDivider>

          <div className="flex items-center gap-2 px-1">
            <input
              id="full-mouth"
              type="checkbox"
              checked={fullMouth}
              onChange={(e) => {
                setFullMouth(e.target.checked);
                if (e.target.checked) setToothNumber("");
              }}
              className="h-4 w-4 accent-primary"
            />
            <Label htmlFor="full-mouth" className="font-normal text-sm cursor-pointer">
              Thủ thuật toàn hàm (cạo vôi, tẩy trắng toàn hàm…)
            </Label>
          </div>

           <div className="grid gap-4 sm:grid-cols-2">
             <div className="grid gap-1.5 sm:col-span-2">
               <Label htmlFor="service">Dịch vụ áp dụng</Label>
               <Select id="service" value={serviceCode} onChange={(e) => selectService(e.target.value)}>
                 <option value="">— Dịch vụ tùy chỉnh —</option>
                 {services.map((service) => (
                   <option key={service.code} value={service.code}>{service.code} · {service.name}</option>
                 ))}
               </Select>
                <p className="text-xs text-muted-foreground">Chọn dịch vụ để tự điền thủ thuật, mã và đơn giá đã gồm VAT của phòng khám.</p>
             </div>
             <div className="grid gap-1.5">
              <Label htmlFor="tooth">
                Số răng FDI <span className="text-destructive">*</span>
              </Label>
              <Input
                id="tooth"
                type="number"
                min="11"
                max="85"
                disabled={fullMouth}
                value={fullMouth ? "" : toothNumber}
                onChange={(e) => {
                  const v = e.target.value;
                  setToothNumber(v ? Number(v) : "");
                }}
                placeholder="VD: 11, 16, 28, 36…"
              />
              {!fullMouth && toothNumber !== "" && !isValidFdiTooth(toothNumber) && (
                <p className="text-xs text-destructive">Số răng không hợp lệ</p>
              )}
              {fullMouth && (
                <p className="text-xs text-muted-foreground">Áp dụng toàn hàm</p>
              )}
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="proc">
                Thủ thuật <span className="text-destructive">*</span>
              </Label>
              <Select
                id="proc"
                value={procedure}
                onChange={(e) => setProcedure(e.target.value)}
                disabled={Boolean(serviceCode)}
              >
                {!procedures.some((item) => item.code === procedure) && procedure && <option value={procedure}>{procedure} (đã ngừng áp dụng)</option>}
                {procedures.map((item) => <option key={item.code} value={item.code}>{item.name}</option>)}
              </Select>
            </div>
          </div>

          <SectionDivider icon={<DescIcon />}>Chi tiết & Chi phí</SectionDivider>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="desc">
                Mô tả <span className="text-destructive">*</span>
              </Label>
              <Textarea
                id="desc"
                rows={2}
                required
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Mô tả chi tiết thủ thuật cần thực hiện…"
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="cost">
                Đơn giá (VNĐ) <span className="text-destructive">*</span>
              </Label>
              <CurrencyInput
                id="cost"
                required
                value={unitCost}
                readOnly={Boolean(serviceCode)}
                onChange={setUnitCost}
                placeholder="VD: 500 000"
              />
              {serviceCode && <p className="text-xs text-muted-foreground">Giá được lấy từ danh mục dịch vụ, đã gồm VAT.</p>}
            </div>
          </div>

          <SectionDivider icon={<TeamIcon />}>Nhân sự thực hiện</SectionDivider>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="item-clinician">Bác sĩ điều trị</Label>
              <Select id="item-clinician" value={treatingClinicianId} onChange={(event) => setTreatingClinicianId(event.target.value)}>
                <option value="">— Chưa phân công —</option>
                {users.filter((user) => isDoctorRole(user.role_key, user.role_id, user.role_name)).map((user) => <option key={user.id} value={user.id}>{user.name}</option>)}
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="item-assistant">Phụ tá</Label>
              <Select id="item-assistant" value={assistantId} onChange={(event) => setAssistantId(event.target.value)}>
                <option value="">— Chưa phân công —</option>
                {users.filter((user) => isAssistantRole(user.role_key, user.role_id, user.role_name)).map((user) => <option key={user.id} value={user.id}>{user.name}</option>)}
              </Select>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">Phân công này gắn với hạng mục điều trị và là nguồn dữ liệu cho tính hoa hồng ở phase tài chính.</p>
        </DialogBody>
        <DialogFooter className="mt-4">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Hủy
          </Button>
          <Button type="submit" disabled={saving || !validTooth}>
            {saving ? "Đang lưu…" : item ? "Lưu thay đổi" : "Thêm thủ thuật/dịch vụ"}
          </Button>
        </DialogFooter>
      </form>
    </Dialog>
  );
}

function SectionDivider({ children, icon }: { children: React.ReactNode; icon?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 py-1">
      {icon && <span className="text-muted-foreground">{icon}</span>}
      <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{children}</span>
      <div className="flex-1 h-px bg-border" />
    </div>
  );
}

function ToothIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2C9.5 2 7.5 4 7 7c-.5 3 0 6 1 8 .5 1 1 2.5 1 4 0 1.5-1 3-1 3h8s-1-1.5-1-3c0-1.5.5-3 1-4 1-2 1.5-5 1-8-.5-3-2.5-5-5-5z" />
    </svg>
  );
}

function DescIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" x2="8" y1="13" y2="13" /><line x1="16" x2="8" y1="17" y2="17" />
    </svg>
  );
}

function TeamIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}
