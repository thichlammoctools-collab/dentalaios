import { useEffect, useState } from "react";
import { apiGet, apiPost, apiPatch, apiDelete, ApiError } from "@/lib/api";
import { toast } from "@/lib/toast";
import { useAuth } from "@/lib/auth-context";
import { Dialog, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";

interface Branch {
  id: string;
  tenant_id: string;
  name: string;
  address: string;
  created_at: string;
}

interface Tenant {
  id: string;
  name: string;
  slug?: string;
  is_active: boolean;
  created_at: string;
}

interface ClinicData {
  tenant: Tenant;
  branches: Branch[];
}

export function ClinicSettingsPage() {
  const { session } = useAuth();
  const [data, setData] = useState<ClinicData | null>(null);
  const [loading, setLoading] = useState(true);

  // Clinic name edit
  const [editingName, setEditingName] = useState(false);
  const [clinicName, setClinicName] = useState("");
  const [savingName, setSavingName] = useState(false);

  // Branch dialog
  const [branchDialogOpen, setBranchDialogOpen] = useState(false);
  const [editingBranch, setEditingBranch] = useState<Branch | null>(null);
  const [branchForm, setBranchForm] = useState({ name: "", address: "" });
  const [savingBranch, setSavingBranch] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    try {
      const res = await apiGet<ClinicData>("/api/clinic");
      setData(res);
      setClinicName(res.tenant.name);
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
    setBranchForm({ name: "", address: "" });
    setBranchDialogOpen(true);
  }

  function openEditBranch(branch: Branch) {
    setEditingBranch(branch);
    setBranchForm({ name: branch.name, address: branch.address });
    setBranchDialogOpen(true);
  }

  async function saveBranch() {
    setSavingBranch(true);
    try {
      if (editingBranch) {
        const updated = await apiPatch<Branch>(`/api/clinic/branches/${editingBranch.id}`, {
          name: branchForm.name.trim(),
          address: branchForm.address.trim(),
        });
        setData((prev) => prev ? {
          ...prev,
          branches: prev.branches.map((b) => b.id === updated.id ? updated : b),
        } : prev);
        toast.success("Đã cập nhật chi nhánh");
      } else {
        const created = await apiPost<Branch>("/api/clinic/branches", {
          name: branchForm.name.trim(),
          address: branchForm.address.trim(),
        });
        setData((prev) => prev ? { ...prev, branches: [...prev.branches, created] } : prev);
        toast.success("Đã thêm chi nhánh");
      }
      setBranchDialogOpen(false);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Lỗi lưu");
    } finally {
      setSavingBranch(false);
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

  if (loading) {
    return (
      <div className="flex items-center justify-center h-48">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-muted border-t-primary" />
      </div>
    );
  }

  if (!data) return null;

  const isAdmin = session?.role?.name === "admin";

  return (
    <div className="space-y-8 px-6 py-6 max-w-2xl">
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
                  {branch.address && (
                    <p className="text-sm text-muted-foreground mt-1">{branch.address}</p>
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

      {/* Branch dialog */}
      <Dialog open={branchDialogOpen} onOpenChange={setBranchDialogOpen}>
        <DialogHeader>
          <DialogTitle>
            {editingBranch ? "Sửa chi nhánh" : "Thêm chi nhánh mới"}
          </DialogTitle>
          <DialogDescription>
            {editingBranch ? "Cập nhật thông tin chi nhánh." : "Tạo một chi nhánh mới cho phòng khám."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 mt-4">
          <div>
            <label className="text-sm font-medium block mb-1">Tên chi nhánh <span className="text-destructive">*</span></label>
            <input
              type="text"
              required
              value={branchForm.name}
              onChange={(e) => setBranchForm((f) => ({ ...f, name: e.target.value }))}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/40"
              placeholder="Chi nhánh 1"
              autoFocus
            />
          </div>
          <div>
            <label className="text-sm font-medium block mb-1">Địa chỉ</label>
            <textarea
              value={branchForm.address}
              onChange={(e) => setBranchForm((f) => ({ ...f, address: e.target.value }))}
              rows={2}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/40 resize-none"
              placeholder="123 Đường ABC, Quận 1, TP.HCM"
            />
          </div>
        </div>

        <DialogFooter>
          <button
            onClick={() => setBranchDialogOpen(false)}
            className="rounded-md border border-input px-4 py-2 text-sm hover:bg-muted"
          >
            Hủy
          </button>
          <button
            onClick={saveBranch}
            disabled={savingBranch || !branchForm.name.trim()}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {savingBranch ? "Đang lưu..." : editingBranch ? "Cập nhật" : "Thêm mới"}
          </button>
        </DialogFooter>
      </Dialog>
    </div>
  );
}
