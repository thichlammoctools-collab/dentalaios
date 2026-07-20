import { useEffect, useState } from "react";
import { apiGet, apiPost, apiPatch, apiPut, apiDelete, ApiError } from "@/lib/api";
import { toast } from "@/lib/toast";
import { useAuth } from "@/lib/auth-context";
import { BranchForm } from "@/components/BranchForm";
import { Dialog, DialogHeader, DialogTitle, DialogFooter, DialogDescription, DialogBody } from "@/components/ui/dialog";
import type { Branch, Tenant } from "@shared/types";
import { PERMISSIONS } from "@shared/constants";

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

  // Clinic name edit
  const [editingName, setEditingName] = useState(false);
  const [clinicName, setClinicName] = useState("");
  const [savingName, setSavingName] = useState(false);

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

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    try {
      const [clinicRes, larkRes, prefixRes] = await Promise.all([
        apiGet<ClinicData>("/api/clinic"),
        apiGet<{ config: LarkConfig | null }>(`/api/clinic/lark`),
        apiGet<{ prefix: string }>(`/api/clinic/payment-prefix`),
      ]);
      setData(clinicRes);
      setClinicName(clinicRes.tenant.name);
      setLarkConfig(larkRes.config);
      setPaymentPrefix(prefixRes.prefix);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Lỗi tải dữ liệu");
    } finally {
      setLoading(false);
    }
  }

  async function saveClinicName() {
    if (!data) return;
    setSavingName(true);
    try {
      const updated = await apiPatch<Tenant>("/api/clinic", { name: clinicName.trim() });
      setData((prev) => prev ? { ...prev, tenant: updated } : prev);
      setEditingName(false);
      toast.success("Đã lưu tên phòng khám");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Lỗi lưu");
    } finally {
      setSavingName(false);
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
    if (!confirm("Xóa chi nhánh này? Hành động này không thể hoàn tác.")) return;
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

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-4 sm:p-6">
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
          <div className="flex items-center justify-between p-4 gap-4">
            <div className="flex-1 min-w-0">
              <label className="text-sm font-medium text-muted-foreground block mb-1">Tên phòng khám</label>
              {editingName && isAdmin ? (
                <div className="flex gap-2 items-center">
                  <input
                    type="text"
                    value={clinicName}
                    onChange={(e) => setClinicName(e.target.value)}
                    className="flex-1 rounded-md border border-input bg-background px-3 py-1.5 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/40 min-w-0"
                    autoFocus
                  />
                  <button
                    onClick={saveClinicName}
                    disabled={savingName || !clinicName.trim()}
                    className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 shrink-0"
                  >
                    {savingName ? "..." : "Lưu"}
                  </button>
                  <button
                    onClick={() => { setEditingName(false); setClinicName(data.tenant.name); }}
                    className="rounded-md border border-input px-3 py-1.5 text-sm hover:bg-muted shrink-0"
                  >
                    Hủy
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <span className="text-base font-medium truncate">{data.tenant.name}</span>
                  {isAdmin && (
                    <button
                      onClick={() => setEditingName(true)}
                      className="text-sm text-primary hover:underline shrink-0"
                    >
                      Sửa
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="border-t border-border px-4 py-3 flex items-center gap-2 text-xs text-muted-foreground">
            <span>Slug: <code className="bg-muted px-1 rounded">{data.tenant.slug || "—"}</code></span>
            <span>·</span>
            <span>Tạo: {new Date(data.tenant.created_at).toLocaleDateString("vi-VN")}</span>
          </div>
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
                    {data.branches.length > 1 && (
                      <button
                        onClick={() => deleteBranch(branch.id)}
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

    </div>
  );
}
