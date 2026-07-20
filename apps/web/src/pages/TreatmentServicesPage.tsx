import { useEffect, useState } from "react";
import { apiDelete, apiGet, apiPut, ApiError } from "@/lib/api";
import { toast } from "@/lib/toast";
import { useAuth } from "@/lib/auth-context";
import { CurrencyInput } from "@/components/ui/currency-input";
import { Dialog, DialogBody, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { TreatmentService } from "@shared/types";
import { PERMISSIONS } from "@shared/constants";

const EMPTY_SERVICE = {
  code: "",
  name: "",
  procedure: "filling",
  price: "" as number | "",
  is_active: true,
};

export function TreatmentServicesPage() {
  const { session } = useAuth();
  const [services, setServices] = useState<TreatmentService[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_SERVICE);
  const [editingCode, setEditingCode] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [removingCode, setRemovingCode] = useState<string | null>(null);
  const isAdmin = Boolean(
    session?.role.permissions.includes(PERMISSIONS.ALL) ||
      session?.role.permissions.includes(PERMISSIONS.MANAGE_USERS),
  );

  useEffect(() => {
    void loadServices();
  }, []);

  async function loadServices() {
    setLoading(true);
    try {
      const response = await apiGet<{ items: TreatmentService[] }>("/api/clinic/treatment-services");
      setServices(response.items);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Lỗi tải dịch vụ điều trị");
    } finally {
      setLoading(false);
    }
  }

  function openNew() {
    setEditingCode(null);
    setForm(EMPTY_SERVICE);
    setDialogOpen(true);
  }

  function openEdit(service: TreatmentService) {
    setEditingCode(service.code);
    setForm({
      code: service.code,
      name: service.name,
      procedure: service.procedure,
      price: service.price,
      is_active: service.is_active,
    });
    setDialogOpen(true);
  }

  async function remove(service: TreatmentService) {
    if (!confirm(`Xóa dịch vụ ${service.code} - ${service.name}? Nếu dịch vụ đã có trong kế hoạch điều trị, hệ thống sẽ chỉ ngừng áp dụng để bảo toàn lịch sử.`)) return;

    setRemovingCode(service.code);
    try {
      const result = await apiDelete<{ mode: "deleted" | "deactivated" }>(
        `/api/clinic/treatment-services/${encodeURIComponent(service.code)}`,
      );
      setServices((current) =>
        result.mode === "deleted"
          ? current.filter((item) => item.code !== service.code)
          : current.map((item) => item.code === service.code ? { ...item, is_active: false } : item),
      );
      toast.success(
        result.mode === "deleted"
          ? "Đã xóa dịch vụ chưa từng sử dụng"
          : "Dịch vụ đã có lịch sử điều trị nên được chuyển sang ngừng áp dụng",
      );
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Không thể xóa dịch vụ");
    } finally {
      setRemovingCode(null);
    }
  }

  async function save() {
    const price = form.price;
    if (!form.code.trim() || !form.name.trim() || typeof price !== "number" || !Number.isFinite(price) || price < 0) {
      toast.error("Nhập mã, tên và giá dịch vụ hợp lệ");
      return;
    }

    setSaving(true);
    try {
      const saved = await apiPut<TreatmentService>("/api/clinic/treatment-services", { ...form, price });
      setServices((current) =>
        [...current.filter((service) => service.code !== saved.code), saved]
          .sort((a, b) => a.code.localeCompare(b.code)),
      );
      setDialogOpen(false);
      toast.success("Đã lưu dịch vụ điều trị");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Lỗi lưu dịch vụ điều trị");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <div className="flex h-48 items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-4 border-muted border-t-primary" /></div>;
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 sm:p-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Danh mục dịch vụ điều trị</h1>
          <p className="mt-1 text-sm text-muted-foreground">Giá niêm yết đã gồm VAT và được áp dụng khi lập kế hoạch điều trị.</p>
        </div>
        {isAdmin && <button onClick={openNew} className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90">Thêm dịch vụ</button>}
      </div>

      <div className="overflow-x-auto rounded-lg border border-border bg-card">
        {services.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">Chưa có dịch vụ. Thêm dịch vụ để tự động áp dụng giá cho kế hoạch điều trị.</p>
        ) : (
          <table className="w-full min-w-[690px] text-sm">
            <thead className="border-b bg-muted/30 text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">Mã</th>
                <th className="px-4 py-3 font-medium">Dịch vụ</th>
                <th className="px-4 py-3 font-medium">Thủ thuật</th>
                <th className="px-4 py-3 text-right font-medium">Giá gồm VAT</th>
                <th className="px-4 py-3 font-medium">Trạng thái</th>
                {isAdmin && <th className="px-4 py-3" />}
              </tr>
            </thead>
            <tbody className="divide-y">
              {services.map((service) => (
                <tr key={service.code}>
                  <td className="px-4 py-3 font-mono text-xs">{service.code}</td>
                  <td className="px-4 py-3 font-medium">{service.name}</td>
                  <td className="px-4 py-3">{service.procedure}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{service.price.toLocaleString("vi-VN")} VND</td>
                  <td className="px-4 py-3"><span className={service.is_active ? "text-emerald-700 dark:text-emerald-400" : "text-muted-foreground"}>{service.is_active ? "Đang áp dụng" : "Ngừng áp dụng"}</span></td>
                  {isAdmin && (
                    <td className="px-4 py-3 text-right">
                      <div className="flex justify-end gap-2">
                        <button onClick={() => openEdit(service)} className="rounded border border-input px-2 py-1 text-xs hover:bg-muted">Sửa</button>
                        <button onClick={() => void remove(service)} disabled={removingCode === service.code} className="rounded border border-destructive/30 px-2 py-1 text-xs text-destructive hover:bg-destructive/10 disabled:opacity-50">{removingCode === service.code ? "..." : "Xóa"}</button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogHeader>
          <DialogTitle>{editingCode ? "Cập nhật dịch vụ" : "Thêm dịch vụ điều trị"}</DialogTitle>
          <DialogDescription>{editingCode ? "Mã dịch vụ không thể thay đổi để bảo toàn liên kết và lịch sử điều trị. Các thay đổi khác chỉ áp dụng cho kế hoạch mới." : "Mã dịch vụ là định danh duy nhất trong phòng khám. Giá nhập là giá đã gồm VAT."}</DialogDescription>
        </DialogHeader>
        <DialogBody className="grid gap-3">
          <label className="grid gap-1.5 text-sm font-medium">Mã dịch vụ<input value={form.code} disabled={Boolean(editingCode)} onChange={(event) => setForm((current) => ({ ...current, code: event.target.value.toUpperCase() }))} maxLength={40} placeholder="VD: TRAM-COM" className="rounded-md border border-input bg-background px-3 py-2 font-mono text-sm disabled:opacity-60" /></label>
          <label className="grid gap-1.5 text-sm font-medium">Tên dịch vụ<input value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} maxLength={200} placeholder="VD: Trám composite" className="rounded-md border border-input bg-background px-3 py-2 text-sm" /></label>
          <label className="grid gap-1.5 text-sm font-medium">Thủ thuật<select value={form.procedure} onChange={(event) => setForm((current) => ({ ...current, procedure: event.target.value }))} className="rounded-md border border-input bg-background px-3 py-2 text-sm"><option value="filling">Trám răng</option><option value="root_canal">Điều trị tủy</option><option value="crown">Bọc mão răng</option><option value="implant">Cấy ghép implant</option><option value="extraction">Nhổ răng</option><option value="scaling">Cạo vôi răng</option><option value="fluoride">Tẩy trắng fluoride</option><option value="bridge">Cầu răng sứ</option><option value="other">Khác</option></select></label>
          <label className="grid gap-1.5 text-sm font-medium">Giá đã gồm VAT (VND)<CurrencyInput min="0" value={form.price} onChange={(price) => setForm((current) => ({ ...current, price }))} placeholder="VD: 500 000" /></label>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.is_active} onChange={(event) => setForm((current) => ({ ...current, is_active: event.target.checked }))} />Đang áp dụng</label>
        </DialogBody>
        <DialogFooter>
          <button onClick={() => setDialogOpen(false)} className="rounded-md border border-input px-3 py-1.5 text-sm hover:bg-muted">Hủy</button>
          <button onClick={() => void save()} disabled={saving} className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">{saving ? "Đang lưu..." : "Lưu dịch vụ"}</button>
        </DialogFooter>
      </Dialog>
    </div>
  );
}
