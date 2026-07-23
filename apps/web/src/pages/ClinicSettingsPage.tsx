import { useEffect, useState } from "react";
import { api, apiBlob, apiGet, apiPost, apiPatch, apiPut, apiDelete, ApiError } from "@/lib/api";
import { toast } from "@/lib/toast";
import { useAuth } from "@/lib/auth-context";
import { BranchForm } from "@/components/BranchForm";
import { Dialog, DialogHeader, DialogTitle, DialogFooter, DialogDescription, DialogBody } from "@/components/ui/dialog";
import type { Branch, ClinicSchedule, Tenant } from "@shared/types";
import { PERMISSIONS } from "@shared/constants";
import { PageContainer } from "@/components/PageContainer";

interface ClinicData {
  tenant: Tenant;
  branches: Branch[];
}

interface LarkConfig {
  tenant_id: string;
  app_id: string;
  has_secret: boolean;
  calendar_id?: string;
  enabled: boolean;
  created_at: string;
  updated_at: string;
}

export function ClinicSettingsPage() {
  const { session } = useAuth();
  const [data, setData] = useState<ClinicData | null>(null);
  const [loading, setLoading] = useState(true);

  const [editingBusinessInfo, setEditingBusinessInfo] = useState(false);
  const [businessInfo, setBusinessInfo] = useState({ name: "", tax_code: "", tax_address: "", email: "", hotline: "", bank_account_number: "" });
  const [savingBusinessInfo, setSavingBusinessInfo] = useState(false);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [savingLogo, setSavingLogo] = useState(false);

  // Branch dialog (open/close + which branch to edit; form logic lives in BranchForm)
  const [branchDialogOpen, setBranchDialogOpen] = useState(false);
  const [editingBranch, setEditingBranch] = useState<Branch | null>(null);

  // Lark integration
  const [larkConfig, setLarkConfig] = useState<LarkConfig | null>(null);
  const [larkDialogOpen, setLarkDialogOpen] = useState(false);
  const [larkForm, setLarkForm] = useState({ app_id: "", app_secret: "", calendar_id: "" });
  const [savingLark, setSavingLark] = useState(false);
  const [testingLark, setTestingLark] = useState(false);
  const [deletingLark, setDeletingLark] = useState(false);

  // Payment code prefix
  const [paymentPrefix, setPaymentPrefix] = useState("TT");
  const [savingPrefix, setSavingPrefix] = useState(false);
  const [scheduleBranchId, setScheduleBranchId] = useState("");
  const [operatingHours, setOperatingHours] = useState<ClinicSchedule[]>([]);
  const [loadingOperatingHours, setLoadingOperatingHours] = useState(false);
  const [savingOperatingHours, setSavingOperatingHours] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    let objectUrl: string | null = null;
    if (!data?.tenant.logo_file_id) {
      setLogoUrl(null);
      return;
    }
    apiBlob("/api/clinic/logo")
      .then((blob) => {
        objectUrl = URL.createObjectURL(blob);
        setLogoUrl(objectUrl);
      })
      .catch(() => setLogoUrl(null));
    return () => { if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [data?.tenant.logo_file_id]);

  async function loadData() {
    setLoading(true);
    try {
      const [clinicRes, larkRes, prefixRes] = await Promise.all([
        apiGet<ClinicData>("/api/clinic"),
        apiGet<{ config: LarkConfig | null }>(`/api/clinic/lark`),
        apiGet<{ prefix: string }>(`/api/clinic/payment-prefix`),
      ]);
      setData(clinicRes);
      setBusinessInfo({
        name: clinicRes.tenant.name,
        tax_code: clinicRes.tenant.tax_code,
        tax_address: clinicRes.tenant.tax_address,
        email: clinicRes.tenant.email ?? "",
        hotline: clinicRes.tenant.hotline,
        bank_account_number: clinicRes.tenant.bank_account_number,
      });
      setLarkConfig(larkRes.config);
      setPaymentPrefix(prefixRes.prefix);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Lỗi tải dữ liệu");
    } finally {
      setLoading(false);
    }
  }

  async function saveBusinessInfo() {
    if (!data) return;
    setSavingBusinessInfo(true);
    try {
      const updated = await apiPatch<Tenant>("/api/clinic", businessInfo);
      setData((prev) => prev ? { ...prev, tenant: updated } : prev);
      setBusinessInfo({ name: updated.name, tax_code: updated.tax_code, tax_address: updated.tax_address, email: updated.email ?? "", hotline: updated.hotline, bank_account_number: updated.bank_account_number });
      setEditingBusinessInfo(false);
      toast.success("Đã lưu thông tin doanh nghiệp");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Lỗi lưu");
    } finally {
      setSavingBusinessInfo(false);
    }
  }

  async function uploadLogo(file: File) {
    if (!data) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      toast.error("Chỉ hỗ trợ logo JPG, PNG hoặc WebP");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Logo không được vượt quá 5 MB");
      return;
    }
    setSavingLogo(true);
    try {
      const updated = await api<Tenant>("/api/clinic/logo", { method: "PUT", body: file, headers: { "Content-Type": file.type, "X-Logo-Filename": encodeURIComponent(file.name) } });
      setData((current) => current ? { ...current, tenant: updated } : current);
      toast.success("Đã cập nhật logo phòng khám");
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Không thể tải logo lên");
    } finally {
      setSavingLogo(false);
    }
  }

  async function removeLogo() {
    setSavingLogo(true);
    try {
      const updated = await apiDelete<Tenant>("/api/clinic/logo");
      setData((current) => current ? { ...current, tenant: updated } : current);
      toast.success("Đã xóa logo phòng khám");
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Không thể xóa logo");
    } finally {
      setSavingLogo(false);
    }
  }

  function openAddBranch() {
    setEditingBranch(null);
    setBranchDialogOpen(true);
  }

  function openEditBranch(branch: Branch) {
    setEditingBranch(branch);
    setBranchDialogOpen(true);
  }

  /** Called by BranchForm after successful save — refresh the list from server. */
  async function refreshBranches() {
    try {
      const clinicRes = await apiGet<ClinicData>("/api/clinic");
      setData((prev) => prev ? { ...prev, branches: clinicRes.branches } : prev);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Lỗi tải chi nhánh");
    }
  }

  async function deleteBranch(id: string) {
    if (!confirm("Xóa chi nhánh này? Chỉ có thể xóa khi chi nhánh không còn dữ liệu liên quan. Hành động này không thể hoàn tác.")) return;
    try {
      await apiDelete(`/api/clinic/branches/${id}`);
      setData((prev) => prev ? { ...prev, branches: prev.branches.filter((b) => b.id !== id) } : prev);
      toast.success("Đã xóa chi nhánh");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Lỗi xóa");
    }
  }

  // ─────── Lark integration handlers ───────

  function openLarkForm() {
    setLarkForm({
      app_id: larkConfig?.app_id ?? "",
      app_secret: "", // always blank on open — never pre-fill secret
      calendar_id: larkConfig?.calendar_id ?? "",
    });
    setLarkDialogOpen(true);
  }

  async function saveLarkConfig() {
    setSavingLark(true);
    try {
      const res = await apiPut<{ config: LarkConfig }>("/api/clinic/lark", {
        app_id: larkForm.app_id.trim(),
        app_secret: larkForm.app_secret.trim(),
        calendar_id: larkForm.calendar_id.trim() || undefined,
      });
      setLarkConfig(res.config);
      setLarkDialogOpen(false);
      toast.success("Đã lưu cấu hình Lark");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Lỗi lưu cấu hình Lark");
    } finally {
      setSavingLark(false);
    }
  }

  async function testLarkConnection() {
    setTestingLark(true);
    try {
      // Test with what the user typed in the form (before saving)
      if (larkForm.app_id && larkForm.app_secret) {
        const res = await apiPost<{ ok: boolean; error?: string }>("/api/clinic/lark/test", {
          app_id: larkForm.app_id.trim(),
          app_secret: larkForm.app_secret.trim(),
        });
        if (res.ok) {
          toast.success("Kết nối Lark thành công");
        } else {
          toast.error(`Kết nối thất bại: ${res.error ?? "Lỗi không xác định"}`);
        }
      } else {
        // Test with stored config
        const res = await apiPost<{ ok: boolean; error?: string }>("/api/clinic/lark/test");
        if (res.ok) {
          toast.success("Kết nối Lark thành công");
        } else {
          toast.error(`Kết nối thất bại: ${res.error ?? "Lỗi không xác định"}`);
        }
      }
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Lỗi kiểm tra kết nối");
    } finally {
      setTestingLark(false);
    }
  }

  async function deleteLarkIntegration() {
    if (!confirm("Ngắt kết nối Lark? Thao tác này sẽ xóa cấu hình hiện tại.")) return;
    setDeletingLark(true);
    try {
      await apiDelete("/api/clinic/lark");
      setLarkConfig(null);
      toast.success("Đã ngắt kết nối Lark");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Lỗi xóa cấu hình Lark");
    } finally {
      setDeletingLark(false);
    }
  }

  async function savePaymentPrefix() {
    const trimmed = paymentPrefix.trim().toUpperCase();
    if (!/^[A-Z0-9]{2,8}$/.test(trimmed)) {
      toast.error("Prefix phải gồm 2–8 ký tự chữ in hoa hoặc số, không dấu");
      return;
    }
    setSavingPrefix(true);
    try {
      const res = await apiPut<{ prefix: string }>("/api/clinic/payment-prefix", { prefix: trimmed });
      setPaymentPrefix(res.prefix);
      toast.success(`Đã lưu prefix: ${res.prefix}`);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Lỗi lưu prefix");
    } finally {
      setSavingPrefix(false);
    }
  }

  useEffect(() => {
    if (!scheduleBranchId) return;
    setLoadingOperatingHours(true);
    apiGet<{ items: ClinicSchedule[] }>(`/api/schedules/clinic/${scheduleBranchId}`)
      .then((response) => setOperatingHours(response.items))
      .catch((error) => toast.error(error instanceof ApiError ? error.message : "Không thể tải giờ hoạt động"))
      .finally(() => setLoadingOperatingHours(false));
  }, [scheduleBranchId]);

  useEffect(() => {
    if (!scheduleBranchId && data?.branches[0]) setScheduleBranchId(data.branches[0].id);
  }, [data, scheduleBranchId]);

  async function saveOperatingHours() {
    if (!scheduleBranchId) return;
    setSavingOperatingHours(true);
    try {
      const response = await apiPut<{ items: ClinicSchedule[] }>(`/api/schedules/clinic/${scheduleBranchId}`, {
        branch_id: scheduleBranchId,
        entries: operatingHours.map(({ weekday, open_time, close_time, is_closed }) => ({ weekday, open_time, close_time, is_closed })),
      });
      setOperatingHours(response.items);
      toast.success("Đã lưu giờ hoạt động chi nhánh");
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Không thể lưu giờ hoạt động");
    } finally {
      setSavingOperatingHours(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-48">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-muted border-t-primary" />
      </div>
    );
  }

  if (!data) return null;

  const isAdmin = Boolean(
    session?.role.permissions.includes(PERMISSIONS.ALL) || session?.role.permissions.includes(PERMISSIONS.MANAGE_USERS),
  );
  const canManageSchedule = Boolean(
    session?.role.permissions.includes(PERMISSIONS.ALL) || session?.role.permissions.includes(PERMISSIONS.MANAGE_SCHEDULE),
  );

  return (
    <PageContainer>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Cài đặt phòng khám</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Quản lý thông tin phòng khám và các chi nhánh
        </p>
      </div>

      {/* Clinic Info */}
      <section className="space-y-4">
        <h2 className="text-base font-semibold">Thông tin phòng khám</h2>
        <div className="rounded-lg border border-border bg-card">
          <div className="p-4">
            <div className="mb-5 flex items-center gap-4 border-b border-border pb-4">
              <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-lg border bg-muted text-2xl font-semibold text-muted-foreground">
                {logoUrl ? <img src={logoUrl} alt={`Logo ${data.tenant.name}`} className="h-full w-full object-contain" /> : data.tenant.name.slice(0, 1).toUpperCase()}
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium">Logo phòng khám</p>
                <p className="mt-1 text-xs text-muted-foreground">JPG, PNG hoặc WebP, dung lượng tối đa 5 MB.</p>
                {isAdmin && <div className="mt-2 flex gap-2"><label className="cursor-pointer rounded-md border border-input px-3 py-1.5 text-sm hover:bg-muted"><input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" disabled={savingLogo} onChange={(event) => { const file = event.target.files?.[0]; if (file) void uploadLogo(file); event.target.value = ""; }} />{savingLogo ? "Đang tải..." : logoUrl ? "Thay logo" : "Tải logo lên"}</label>{data.tenant.logo_file_id && <button type="button" disabled={savingLogo} onClick={() => void removeLogo()} className="rounded-md border border-destructive/30 px-3 py-1.5 text-sm text-destructive hover:bg-destructive/10 disabled:opacity-50">Xóa</button>}</div>}
              </div>
            </div>
            {editingBusinessInfo && isAdmin ? (
              <div className="grid gap-4 sm:grid-cols-2">
                {[
                  ["name", "Tên đơn vị", "Công ty TNHH Nha khoa..."],
                  ["tax_code", "Mã số thuế", "10 hoặc 13 chữ số"],
                  ["tax_address", "Địa chỉ thuế", "Số nhà, đường, phường/xã, tỉnh/thành"],
                  ["email", "Địa chỉ email", "contact@phongkham.vn"],
                  ["hotline", "Số hotline", "0901234567"],
                  ["bank_account_number", "Số tài khoản ngân hàng", "Chỉ gồm chữ số"],
                ].map(([field, label, placeholder]) => (
                  <label key={field} className="block text-sm font-medium">
                    {label} <span className="text-destructive">*</span>
                    <input
                      type={field === "email" ? "email" : "text"}
                      value={businessInfo[field as keyof typeof businessInfo]}
                      onChange={(e) => setBusinessInfo((current) => ({ ...current, [field]: e.target.value }))}
                      placeholder={placeholder}
                      className="mt-1 w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm font-normal outline-none focus:border-ring focus:ring-2 focus:ring-ring/40"
                    />
                  </label>
                ))}
                <div className="flex gap-2 sm:col-span-2">
                  <button
                    onClick={saveBusinessInfo}
                    disabled={savingBusinessInfo || Object.values(businessInfo).some((value) => !value.trim())}
                    className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                  >
                    {savingBusinessInfo ? "Đang lưu..." : "Lưu thông tin"}
                  </button>
                  <button
                    onClick={() => { setEditingBusinessInfo(false); setBusinessInfo({ name: data.tenant.name, tax_code: data.tenant.tax_code, tax_address: data.tenant.tax_address, email: data.tenant.email ?? "", hotline: data.tenant.hotline, bank_account_number: data.tenant.bank_account_number }); }}
                    className="rounded-md border border-input px-3 py-1.5 text-sm hover:bg-muted"
                  >
                    Hủy
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex items-start justify-between gap-4">
                <dl className="grid flex-1 gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
                  <div><dt className="text-muted-foreground">Tên đơn vị</dt><dd className="font-medium">{data.tenant.name}</dd></div>
                  <div><dt className="text-muted-foreground">Mã số thuế</dt><dd className="font-medium">{data.tenant.tax_code || "Chưa cập nhật"}</dd></div>
                  <div><dt className="text-muted-foreground">Địa chỉ thuế</dt><dd className="font-medium">{data.tenant.tax_address || "Chưa cập nhật"}</dd></div>
                  <div><dt className="text-muted-foreground">Địa chỉ email</dt><dd className="font-medium">{data.tenant.email || "Chưa cập nhật"}</dd></div>
                  <div><dt className="text-muted-foreground">Số hotline</dt><dd className="font-medium">{data.tenant.hotline || "Chưa cập nhật"}</dd></div>
                  <div><dt className="text-muted-foreground">Số tài khoản ngân hàng</dt><dd className="font-medium">{data.tenant.bank_account_number || "Chưa cập nhật"}</dd></div>
                </dl>
                {isAdmin && <button onClick={() => setEditingBusinessInfo(true)} className="text-sm text-primary hover:underline shrink-0">Sửa</button>}
              </div>
            )}
          </div>

          <div className="border-t border-border px-4 py-3 flex items-center gap-2 text-xs text-muted-foreground">
            <span>Slug: <code className="bg-muted px-1 rounded">{data.tenant.slug || "—"}</code></span>
            <span>·</span>
            <span>Tạo: {new Date(data.tenant.created_at).toLocaleDateString("vi-VN")}</span>
          </div>
        </div>
      </section>

      <section className="space-y-4">
        <div>
          <h2 className="text-base font-semibold">Giờ hoạt động</h2>
          <p className="mt-1 text-sm text-muted-foreground">Thiết lập giờ mở cửa theo từng ngày cho mỗi chi nhánh. Khi chưa lưu cấu hình, hệ thống mặc định 08:00 - 20:00 mỗi ngày.</p>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <label className="block max-w-sm text-sm font-medium">Chi nhánh
            <select value={scheduleBranchId} onChange={(event) => setScheduleBranchId(event.target.value)} className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
              {data.branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
            </select>
          </label>
          {loadingOperatingHours ? <div className="flex h-32 items-center justify-center"><div className="h-6 w-6 animate-spin rounded-full border-3 border-muted border-t-primary" /></div> : (
            <div className="mt-4 space-y-2">
              {operatingHours.map((entry) => (
                <div key={entry.weekday} className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-3 rounded-md border p-3 text-sm">
                  <span className="font-medium">{["Thứ 2", "Thứ 3", "Thứ 4", "Thứ 5", "Thứ 6", "Thứ 7", "Chủ nhật"][entry.weekday - 1]}</span>
                  <input type="time" value={entry.open_time} disabled={!canManageSchedule || entry.is_closed} onChange={(event) => setOperatingHours((current) => current.map((item) => item.weekday === entry.weekday ? { ...item, open_time: event.target.value } : item))} className="rounded border border-input bg-background px-2 py-1.5 disabled:opacity-50" />
                  <input type="time" value={entry.close_time} disabled={!canManageSchedule || entry.is_closed} onChange={(event) => setOperatingHours((current) => current.map((item) => item.weekday === entry.weekday ? { ...item, close_time: event.target.value } : item))} className="rounded border border-input bg-background px-2 py-1.5 disabled:opacity-50" />
                  <label className="flex items-center gap-2 whitespace-nowrap"><input type="checkbox" checked={!entry.is_closed} disabled={!canManageSchedule} onChange={(event) => setOperatingHours((current) => current.map((item) => item.weekday === entry.weekday ? { ...item, is_closed: !event.target.checked } : item))} />Mở cửa</label>
                </div>
              ))}
            </div>
          )}
          {canManageSchedule && <button type="button" onClick={() => void saveOperatingHours()} disabled={savingOperatingHours || loadingOperatingHours || operatingHours.length !== 7} className="mt-4 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">{savingOperatingHours ? "Đang lưu..." : "Lưu giờ hoạt động"}</button>}
        </div>
      </section>

      {/* Branches */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold">Chi nhánh ({data.branches.length})</h2>
          {isAdmin && (
            <button
              onClick={openAddBranch}
              className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              + Thêm chi nhánh
            </button>
          )}
        </div>

        <div className="space-y-2">
          {data.branches.map((branch) => (
            <div key={branch.id} className="rounded-lg border border-border bg-card p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{branch.name}</span>
                    {branch.id === session?.branch?.id && (
                      <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-800">Hiện tại</span>
                    )}
                  </div>

                  {/* Address */}
                  {branch.address && (
                    <p className="text-sm text-muted-foreground mt-1">{branch.address}</p>
                  )}

                  {/* Contact row */}
                  {(branch.phone || branch.email) && (
                    <div className="text-sm text-muted-foreground mt-1 flex flex-wrap gap-x-4">
                      {branch.phone && <span>SĐT: {branch.phone}</span>}
                      {branch.email && <span>Email: {branch.email}</span>}
                    </div>
                  )}

                  {/* Manager + opening date row */}
                  {(branch.manager_name || branch.opening_date) && (
                    <div className="text-sm text-muted-foreground mt-1 flex flex-wrap gap-x-4">
                      {branch.manager_name && <span>Phụ trách: {branch.manager_name}</span>}
                      {branch.opening_date && (
                        <span>Khai trương: {new Date(branch.opening_date).toLocaleDateString("vi-VN")}</span>
                      )}
                    </div>
                  )}

                  <p className="text-xs text-muted-foreground mt-1">
                    Tạo: {new Date(branch.created_at).toLocaleDateString("vi-VN")}
                  </p>
                </div>
                {isAdmin && (
                  <div className="flex gap-1 shrink-0">
                    <button
                      onClick={() => openEditBranch(branch)}
                      className="rounded border border-input px-2 py-1 text-xs hover:bg-muted"
                    >
                      Sửa
                    </button>
                    {data.branches.length > 1 && branch.id !== session?.branch?.id && (
                      <button
                        onClick={() => deleteBranch(branch.id)}
                        title="Chỉ có thể xóa khi không còn dữ liệu liên quan"
                        className="rounded border border-destructive/30 px-2 py-1 text-xs text-destructive hover:bg-destructive/10"
                      >
                        Xóa
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Payment code prefix */}
      <section className="space-y-4">
        <h2 className="text-base font-semibold">Mã thanh toán</h2>
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-sm text-muted-foreground mb-3">
            Prefix phía trước mã thanh toán. Mỗi thanh toán sẽ được hệ thống tự động cấp mã dạng{" "}
            <code className="bg-muted px-1 rounded font-mono">{paymentPrefix}-YYYYMMDD-0001</code>.
          </p>
          <div className="flex items-center gap-2">
            <label htmlFor="payment-prefix" className="text-sm font-medium shrink-0">
              Prefix
            </label>
            <input
              id="payment-prefix"
              type="text"
              value={paymentPrefix}
              onChange={(e) => setPaymentPrefix(e.target.value.toUpperCase())}
              disabled={!isAdmin}
              maxLength={8}
              className="flex-1 min-w-0 rounded-md border border-input bg-background px-3 py-1.5 font-mono text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/40 disabled:opacity-60"
              placeholder="VD: TT, PK1, ABC"
            />
            {isAdmin && (
              <button
                onClick={savePaymentPrefix}
                disabled={savingPrefix || !/^[A-Z0-9]{2,8}$/.test(paymentPrefix.trim())}
                className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 shrink-0"
              >
                {savingPrefix ? "..." : "Lưu"}
              </button>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            Chỉ chữ in hoa và số, 2–8 ký tự. Mã đã phát hành giữ nguyên khi đổi prefix.
          </p>
        </div>
      </section>

      {/* Lark integration */}
      <section className="space-y-4">
        <h2 className="text-base font-semibold">Tích hợp Lark</h2>
        <div className="rounded-lg border border-border bg-card p-4">
          {larkConfig ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">Đã kết nối</span>
                    {larkConfig.enabled ? (
                      <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800">
                        Đang hoạt động
                      </span>
                    ) : (
                      <span className="rounded-full bg-yellow-100 px-2 py-0.5 text-xs font-medium text-yellow-800">
                        Tạm tắt
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground mt-1">
                    App ID: <code className="bg-muted px-1 rounded">{larkConfig.app_id}</code>
                  </p>
                  {larkConfig.calendar_id && (
                    <p className="text-sm text-muted-foreground mt-1">
                      Calendar ID: <code className="bg-muted px-1 rounded">{larkConfig.calendar_id}</code>
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground mt-1">
                    Cập nhật: {new Date(larkConfig.updated_at).toLocaleString("vi-VN")}
                  </p>
                </div>
                {isAdmin && (
                  <div className="flex flex-col gap-2 shrink-0">
                    <button
                      onClick={openLarkForm}
                      className="rounded-md border border-input px-3 py-1.5 text-sm hover:bg-muted"
                    >
                      Cập nhật
                    </button>
                    <button
                      onClick={testLarkConnection}
                      disabled={testingLark}
                      className="rounded-md border border-input px-3 py-1.5 text-sm hover:bg-muted disabled:opacity-50"
                    >
                      {testingLark ? "Đang kiểm tra..." : "Kiểm tra kết nối"}
                    </button>
                    <button
                      onClick={deleteLarkIntegration}
                      disabled={deletingLark}
                      className="rounded-md border border-destructive/30 px-3 py-1.5 text-sm text-destructive hover:bg-destructive/10 disabled:opacity-50"
                    >
                      {deletingLark ? "..." : "Ngắt kết nối"}
                    </button>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between gap-3">
              <div className="flex-1 min-w-0">
                <span className="font-medium">Chưa cấu hình</span>
                <p className="text-sm text-muted-foreground mt-1">
                  Kết nối Lark để đồng bộ bàn giao ca điều trị và thông báo chi nhánh mới sang workspace của phòng khám.
                </p>
              </div>
              {isAdmin && (
                <button
                  onClick={openLarkForm}
                  className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 shrink-0"
                >
                  Cấu hình ngay
                </button>
              )}
            </div>
          )}
        </div>
      </section>

      {/* Branch form dialog (component-managed) */}
      <BranchForm
        open={branchDialogOpen}
        onOpenChange={setBranchDialogOpen}
        branch={editingBranch}
        onSaved={refreshBranches}
      />

      {/* Lark config dialog */}
      <Dialog open={larkDialogOpen} onOpenChange={setLarkDialogOpen}>
        <DialogHeader>
          <DialogTitle>
            {larkConfig ? "Cập nhật cấu hình Lark" : "Kết nối Lark"}
          </DialogTitle>
          <DialogDescription>
            Nhập thông tin Lark App để đồng bộ bàn giao ca điều trị và thông báo chi nhánh mới.
          </DialogDescription>
        </DialogHeader>

        <DialogBody className="space-y-3">
          <div>
            <label className="text-sm font-medium block mb-1">
              App ID <span className="text-destructive">*</span>
            </label>
            <input
              type="text"
              required
              value={larkForm.app_id}
              onChange={(e) => setLarkForm((f) => ({ ...f, app_id: e.target.value }))}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/40"
              placeholder="cli_xxxxxxxxxxxxxxxx"
              autoFocus
            />
          </div>
          <div>
            <label className="text-sm font-medium block mb-1">
              App Secret <span className="text-destructive">*</span>
              {!larkConfig && <span className="text-muted-foreground font-normal ml-1">(bắt buộc khi cấu hình lần đầu)</span>}
            </label>
            <input
              type="password"
              required
              value={larkForm.app_secret}
              onChange={(e) => setLarkForm((f) => ({ ...f, app_secret: e.target.value }))}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/40"
              placeholder={larkConfig ? "Để trống nếu không muốn thay đổi" : "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"}
            />
            {larkConfig && (
              <p className="text-xs text-muted-foreground mt-1">
                Đang lưu giá trị ẩn danh. Nhập giá trị mới nếu muốn thay đổi.
              </p>
            )}
          </div>
          <div>
            <label className="text-sm font-medium block mb-1">Calendar ID <span className="text-muted-foreground font-normal">(tuỳ chọn)</span></label>
            <input
              type="text"
              value={larkForm.calendar_id}
              onChange={(e) => setLarkForm((f) => ({ ...f, calendar_id: e.target.value }))}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/40"
              placeholder="primary (mặc định)"
            />
          </div>
        </DialogBody>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <button
            onClick={testLarkConnection}
            disabled={testingLark || !larkForm.app_id.trim() || !larkForm.app_secret.trim()}
            className="rounded-md border border-input px-4 py-2 text-sm hover:bg-muted disabled:opacity-50"
          >
            {testingLark ? "Đang kiểm tra..." : "Kiểm tra kết nối"}
          </button>
          <div className="flex gap-2">
            <button
              onClick={() => setLarkDialogOpen(false)}
              className="rounded-md border border-input px-4 py-2 text-sm hover:bg-muted"
            >
              Hủy
            </button>
            <button
              onClick={saveLarkConfig}
              disabled={savingLark || !larkForm.app_id.trim() || !larkForm.app_secret.trim()}
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {savingLark ? "Đang lưu..." : larkConfig ? "Cập nhật" : "Lưu & kết nối"}
            </button>
          </div>
        </DialogFooter>
      </Dialog>

    </PageContainer>
  );
}
