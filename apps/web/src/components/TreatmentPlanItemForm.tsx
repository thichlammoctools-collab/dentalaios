import { useEffect, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogBody, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { apiGet, apiPost, ApiError } from "@/lib/api";
import { toast } from "@/lib/toast";
import { isValidFdiTooth } from "@shared/constants";
import type { TreatmentPlanItem, TreatmentService } from "@shared/types";

interface TreatmentPlanItemFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  planId: string;
  onCreated: (item: TreatmentPlanItem) => void;
}

export function TreatmentPlanItemForm({
  open,
  onOpenChange,
  planId,
  onCreated,
}: TreatmentPlanItemFormProps) {
  const [toothNumber, setToothNumber] = useState<number | "">("");
  const [procedure, setProcedure] = useState("filling");
  const [description, setDescription] = useState("");
  const [unitCost, setUnitCost] = useState<number | "">("");
  const [services, setServices] = useState<TreatmentService[]>([]);
  const [serviceCode, setServiceCode] = useState("");
  const [saving, setSaving] = useState(false);
  const [fullMouth, setFullMouth] = useState(false);

  const validTooth =
    fullMouth || (typeof toothNumber === "number" ? isValidFdiTooth(toothNumber) : false);

  useEffect(() => {
    if (!open) return;
    void apiGet<{ items: TreatmentService[] }>("/api/clinic/treatment-services")
      .then((response) => setServices(response.items.filter((service) => service.is_active)))
      .catch(() => setServices([]));
  }, [open]);

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
      const created = await apiPost<TreatmentPlanItem>(
        `/api/treatment-plans/${planId}/items`,
        {
          tooth_number: fullMouth ? null : toothNumber,
          procedure,
          service_code: serviceCode || undefined,
          description,
          unit_cost: unitCost,
        },
      );
      toast.success("Đã thêm hạng mục");
      onCreated(created);
      onOpenChange(false);
      setToothNumber("");
      setDescription("");
      setUnitCost("");
      setServiceCode("");
      setFullMouth(false);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Lỗi thêm item");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange} className="sm:max-w-2xl">
      <form onSubmit={onSubmit}>
        <DialogHeader>
          <DialogTitle>Thêm hạng mục điều trị</DialogTitle>
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
               <p className="text-xs text-muted-foreground">Chọn dịch vụ để áp dụng mã và đơn giá đã gồm VAT của phòng khám.</p>
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
              >
                <option value="filling">Trám răng</option>
                <option value="root_canal">Điều trị tủy</option>
                <option value="crown">Bọc mão răng</option>
                <option value="implant">Cấy ghép implant</option>
                <option value="extraction">Nhổ răng</option>
                <option value="scaling">Cạo vôi răng</option>
                <option value="fluoride">Tẩy trắng fluoride</option>
                <option value="bridge">Cầu răng sứ</option>
                <option value="other">Khác</option>
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
              <Input
                id="cost"
                type="number"
                min="0"
                required
                value={unitCost}
                readOnly={Boolean(serviceCode)}
                onChange={(e) => {
                  const v = e.target.value;
                  setUnitCost(v ? Number(v) : "");
                }}
                placeholder="VD: 500000"
              />
              {serviceCode && <p className="text-xs text-muted-foreground">Giá được lấy từ danh mục dịch vụ, đã gồm VAT.</p>}
            </div>
          </div>
        </DialogBody>
        <DialogFooter className="mt-4">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Hủy
          </Button>
          <Button type="submit" disabled={saving || !validTooth}>
            {saving ? "Đang thêm…" : "Thêm hạng mục"}
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
