import { useEffect, useState, type FormEvent } from "react";
import { apiGet, apiPost, apiPut, apiDelete, ApiError } from "@/lib/api";
import { toast } from "@/lib/toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Dialog, DialogHeader, DialogTitle, DialogBody, DialogFooter } from "@/components/ui/dialog";
import type { Branch, Role, User } from "@shared/types";
import { getRoleLabel } from "@shared/constants";
import { cn } from "@/lib/utils";

interface Invite {
  id: string;
  token: string;
  email: string;
  role_id: string;
  role_name: string;
  branch_id: string;
  expires_at: string;
  created_at: string;
}

interface EditForm {
  name: string;
  role_id: string;
  branch_id: string;
  is_active: boolean;
}

function CopyIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
      <rect x="9" y="9" width="13" height="13" rx="2" />
      <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
    </svg>
  );
}

function MailIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
      <rect x="2" y="4" width="20" height="16" rx="2" />
      <path d="m22 7-8.97 5.7a1.94 1.94 0 01-2.06 0L2 7" />
    </svg>
  );
}

export function MembersSettingsPage() {
  const [invites, setInvites] = useState<Invite[]>([]);
  const [members, setMembers] = useState<User[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [copied, setCopied] = useState<string | null>(null);
  const [lastLink, setLastLink] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [creatingAll, setCreatingAll] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [manual, setManual] = useState({ name: "", email: "", password: "", role_id: "", branch_id: "" });
  const [openEdit, setOpenEdit] = useState(false);
  const [editUser, setEditUser] = useState<User | null>(null);
  const [editForm, setEditForm] = useState<EditForm>({ name: "", role_id: "", branch_id: "", is_active: true });
  const [savingEdit, setSavingEdit] = useState(false);

  useEffect(() => {
    loadAll();
  }, []);

  async function loadAll() {
    setLoading(true);
    try {
      const [invitesRes, usersRes, rolesRes, clinicRes] = await Promise.all([
        apiGet<Invite[]>("/api/invites"),
        apiGet<{ items: User[] }>("/api/users"),
        apiGet<{ items: Role[] }>("/api/roles"),
        apiGet<{ branches: Branch[] }>("/api/clinic"),
      ]);
      setInvites(invitesRes);
      setMembers(usersRes.items);
      setRoles(rolesRes.items);
      setBranches(clinicRes.branches);
    } catch {
      toast.error("Không tải được danh sách thành viên");
    } finally {
      setLoading(false);
    }
  }

  async function createInvite(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    setCreating(true);
    try {
      const result = await apiPost<{ invite_link: string }>("/api/invites", {
        email: fd.get("email"),
        role_name: fd.get("role_name"),
      });
      setLastLink(result.invite_link);
      await navigator.clipboard.writeText(result.invite_link).catch(() => {});
      setCopied("last");
      setTimeout(() => setCopied(null), 3000);
      await loadAll();
      form.reset();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Lỗi tạo lời mời");
    } finally {
      setCreating(false);
    }
  }

  async function createBulkInvite(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    const emailList = fd.get("emails") as string;
    const role = fd.get("role_name") as string;
    if (!emailList.trim()) return;
    setCreatingAll(true);
    try {
      const emails = emailList.split("\n").map((e) => e.trim()).filter(Boolean);
      for (const email of emails) {
        await apiPost("/api/invites", { email, role_name: role });
      }
      toast.success(`Đã tạo ${emails.length} lời mời`);
      await loadAll();
      setCreatingAll(false);
      setBulkOpen(false);
      form.reset();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Lỗi tạo lời mời");
      setCreatingAll(false);
    }
  }

  async function createManualMember(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!manual.role_id || !manual.branch_id) {
      toast.error("Chọn vai trò và chi nhánh");
      return;
    }
    setCreating(true);
    try {
      await apiPost("/api/users", manual);
      toast.success("Đã tạo thành viên — tài khoản active ngay");
      setManual({ name: "", email: "", password: "", role_id: "", branch_id: "" });
      await loadAll();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Lỗi tạo thành viên");
    } finally {
      setCreating(false);
    }
  }

  async function revokeInvite(id: string) {
    try {
      await apiDelete(`/api/invites/${id}`);
      setInvites((prev) => prev.filter((i) => i.id !== id));
      toast.success("Đã thu hồi lời mời");
    } catch {
      toast.error("Lỗi thu hồi lời mời");
    }
  }

  function openEditDialog(u: User) {
    setEditUser(u);
    setEditForm({ name: u.name, role_id: u.role_id, branch_id: u.branch_id, is_active: u.is_active });
    setOpenEdit(true);
  }

  async function onEdit(e: FormEvent) {
    e.preventDefault();
    if (!editUser) return;
    setSavingEdit(true);
    try {
      await apiPut(`/api/users/${editUser.id}`, {
        name: editForm.name,
        role_id: editForm.role_id,
        branch_id: editForm.branch_id,
        is_active: editForm.is_active,
      });
      toast.success("Đã cập nhật");
      setOpenEdit(false);
      setEditUser(null);
      loadAll();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Lỗi cập nhật");
    } finally {
      setSavingEdit(false);
    }
  }

  function copyLink(link: string, id: string) {
    navigator.clipboard.writeText(link).then(() => {
      setCopied(id);
      setLastLink(link);
      setTimeout(() => setCopied(null), 2000);
    });
  }

  function daysLeft(expiresAt: string) {
    const ms = new Date(expiresAt).getTime() - Date.now();
    return Math.max(0, Math.ceil(ms / 86400000));
  }

  function inviteLink(token: string) {
    return `${window.location.origin}/invite/${token}`;
  }

  function roleName(roleId: string): string {
    const role = roles.find((r) => r.id === roleId);
    return role ? getRoleLabel(role.name) : "—";
  }

  function branchName(branchId: string): string {
    return branches.find((b) => b.id === branchId)?.name ?? "—";
  }

  const pending = invites;

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Thành viên</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Quản lý lời mời và thành viên phòng khám</p>
        </div>
        <button
          onClick={() => setBulkOpen(true)}
          className="flex items-center gap-2 rounded-lg border border-border bg-background px-4 py-2 text-sm font-medium text-foreground shadow-sm transition-colors hover:bg-accent"
        >
          <MailIcon />
          Gửi nhiều
        </button>
      </div>

      {/* Manual add form — thêm thành viên trực tiếp */}
      <form
        onSubmit={createManualMember}
        className="rounded-xl border border-border bg-card p-5 space-y-4"
      >
        <div className="flex items-center gap-2">
          <svg className="h-5 w-5 text-primary" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          <h2 className="text-base font-semibold text-foreground">Thêm thành viên mới</h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <label htmlFor="m-name" className="text-sm font-medium text-foreground">Họ và tên</label>
            <input
              id="m-name"
              required
              value={manual.name}
              onChange={(e) => setManual({ ...manual, name: e.target.value })}
              placeholder="Nguyễn Văn A"
              className="w-full h-10 rounded-lg border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring/50"
            />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="m-email" className="text-sm font-medium text-foreground">Email</label>
            <input
              id="m-email"
              type="email"
              required
              value={manual.email}
              onChange={(e) => setManual({ ...manual, email: e.target.value })}
              placeholder="email@phongkham.com"
              className="w-full h-10 rounded-lg border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring/50"
            />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="m-password" className="text-sm font-medium text-foreground">Mật khẩu</label>
            <input
              id="m-password"
              type="password"
              required
              minLength={6}
              value={manual.password}
              onChange={(e) => setManual({ ...manual, password: e.target.value })}
              placeholder="≥ 6 ký tự"
              className="w-full h-10 rounded-lg border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring/50"
            />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="m-role" className="text-sm font-medium text-foreground">Vai trò</label>
            <select
              id="m-role"
              required
              value={manual.role_id}
              onChange={(e) => setManual({ ...manual, role_id: e.target.value })}
              className="w-full h-10 rounded-lg border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring/50"
            >
              <option value="">-- Chọn vai trò --</option>
              {roles.map((r) => (
                <option key={r.id} value={r.id}>{getRoleLabel(r.name)}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <label htmlFor="m-branch" className="text-sm font-medium text-foreground">Chi nhánh</label>
            <select
              id="m-branch"
              required
              value={manual.branch_id}
              onChange={(e) => setManual({ ...manual, branch_id: e.target.value })}
              className="w-full h-10 rounded-lg border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring/50"
            >
              <option value="">-- Chọn chi nhánh --</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={() => setManual({ name: "", email: "", password: "", role_id: "", branch_id: "" })}
            className="h-10 rounded-lg border border-border bg-background px-4 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Hủy
          </button>
          <button
            type="submit"
            disabled={creating}
            className="h-10 rounded-lg bg-primary text-primary-foreground px-5 text-sm font-semibold transition-colors hover:opacity-90 disabled:opacity-50"
          >
            {creating ? "Đang tạo…" : "Thêm thành viên"}
          </button>
        </div>
        <p className="text-xs text-muted-foreground">
          Tài khoản sẽ active ngay — thành viên có thể đăng nhập bằng email + mật khẩu đã đặt.
        </p>
      </form>

      {/* Invite form */}
      <form
        onSubmit={createInvite}
        className="rounded-xl border border-border bg-card p-5 flex flex-col sm:flex-row gap-3"
      >
        <div className="flex-1">
          <input
            name="email"
            type="email"
            placeholder="Email thành viên mới"
            required
            className="w-full h-10 rounded-lg border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring/50"
          />
        </div>
        <select
          name="role_name"
          className="h-10 rounded-lg border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring/50"
        >
          {roles.map((r) => (
            <option key={r.id} value={r.name}>{getRoleLabel(r.name)}</option>
          ))}
        </select>
        <button
          type="submit"
          disabled={creating}
          className="h-10 rounded-lg bg-primary text-primary-foreground px-5 text-sm font-semibold transition-colors hover:opacity-90 disabled:opacity-50"
        >
          {creating ? "Đang tạo…" : "Gửi lời mời"}
        </button>
      </form>

      {/* Last created link */}
      {lastLink && (
        <div className="rounded-xl border border-green-200 dark:border-green-900 bg-green-50 dark:bg-green-950/40 p-4 flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-green-700 dark:text-green-400 mb-1">Link mời vừa tạo:</p>
            <p className="text-xs text-green-600 dark:text-green-500 break-all font-mono">{lastLink}</p>
            <p className="text-xs text-muted-foreground mt-1">Link có hiệu lực trong 7 ngày</p>
          </div>
          <button
            onClick={() => copyLink(lastLink, "last")}
            className="flex items-center gap-1.5 shrink-0 h-8 rounded-lg bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300 px-3 text-xs font-medium transition-colors hover:bg-green-200 dark:hover:bg-green-800"
          >
            <CopyIcon />
            {copied === "last" ? "Đã copy!" : "Copy"}
          </button>
        </div>
      )}

      {/* Pending invites table */}
      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-14 rounded-xl bg-accent animate-pulse" />
          ))}
        </div>
      ) : pending.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-card py-12 text-center">
          <div className="flex justify-center mb-3">
            <div className="rounded-full bg-muted p-3">
              <MailIcon />
            </div>
          </div>
          <p className="text-sm text-muted-foreground">Chưa có lời mời nào đang chờ</p>
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border bg-muted/40">
                <th className="text-left text-xs font-semibold text-muted-foreground px-4 py-3">Email</th>
                <th className="text-left text-xs font-semibold text-muted-foreground px-4 py-3">Vai trò</th>
                <th className="text-left text-xs font-semibold text-muted-foreground px-4 py-3">Trạng thái</th>
                <th className="text-left text-xs font-semibold text-muted-foreground px-4 py-3">Còn lại</th>
                <th className="text-right text-xs font-semibold text-muted-foreground px-4 py-3">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {pending.map((invite) => {
                const days = daysLeft(invite.expires_at);
                const link = inviteLink(invite.token);
                return (
                  <tr key={invite.id} className="group hover:bg-accent/50 transition-colors">
                    <td className="px-4 py-3">
                      <p className="text-sm font-medium text-foreground">{invite.email}</p>
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
                        {getRoleLabel(invite.role_name)}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400 font-medium">
                        <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                        Chờ chấp nhận
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-sm text-muted-foreground">{days} ngày</span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1 opacity-60 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => copyLink(link, invite.id)}
                          className="flex items-center gap-1.5 h-8 rounded-lg text-muted-foreground hover:text-foreground px-2 text-xs transition-colors"
                        >
                          <CopyIcon />
                          {copied === invite.id ? "Đã copy!" : "Copy"}
                        </button>
                        <button
                          onClick={() => revokeInvite(invite.id)}
                          className="flex items-center gap-1.5 h-8 rounded-lg text-muted-foreground hover:text-destructive px-2 text-xs transition-colors"
                        >
                          <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                          </svg>
                          Thu hồi
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Members table — thành viên đã có tài khoản */}
      {members.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-foreground">Thành viên hiện tại ({members.length})</h2>
          </div>
          <div className="rounded-xl border border-border bg-card overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border bg-muted/40">
                  <th className="text-left text-xs font-semibold text-muted-foreground px-4 py-3">Họ tên</th>
                  <th className="text-left text-xs font-semibold text-muted-foreground px-4 py-3">Email</th>
                  <th className="text-left text-xs font-semibold text-muted-foreground px-4 py-3">Vai trò</th>
                  <th className="text-left text-xs font-semibold text-muted-foreground px-4 py-3">Chi nhánh</th>
                  <th className="text-left text-xs font-semibold text-muted-foreground px-4 py-3">Trạng thái</th>
                  <th className="text-right text-xs font-semibold text-muted-foreground px-4 py-3">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {members.map((u) => (
                  <tr key={u.id} className="hover:bg-accent/50 transition-colors">
                    <td className="px-4 py-3 text-sm font-medium text-foreground">{u.name}</td>
                    <td className="px-4 py-3 text-sm text-muted-foreground font-mono">{u.email}</td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
                        {roleName(u.role_id)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-muted-foreground">{branchName(u.branch_id)}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center gap-1.5 text-xs font-medium ${
                          u.is_active ? "text-green-600 dark:text-green-400" : "text-muted-foreground"
                        }`}
                      >
                        <span className={`h-1.5 w-1.5 rounded-full ${u.is_active ? "bg-green-500" : "bg-muted-foreground"}`} />
                        {u.is_active ? "Hoạt động" : "Đã khóa"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Button size="sm" variant="outline" onClick={() => openEditDialog(u)}>
                        Sửa
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Bulk invite modal */}
      <Dialog open={bulkOpen} onOpenChange={setBulkOpen}>
        <DialogHeader>
          <DialogTitle>Gửi lời mời hàng loạt</DialogTitle>
        </DialogHeader>
        <form onSubmit={createBulkInvite} className="flex flex-col flex-1 min-h-0">
          <DialogBody className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">Email (mỗi dòng 1 email)</label>
              <textarea
                name="emails"
                rows={8}
                required
                placeholder={`lam@example.com\nminh@example.com\nhung@example.com`}
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring/50 resize-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">Vai trò</label>
              <select
                name="role_name"
                className="w-full h-10 rounded-lg border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring/50"
              >
                {roles.map((r) => (
                  <option key={r.id} value={r.name}>{getRoleLabel(r.name)}</option>
                ))}
              </select>
            </div>
          </DialogBody>
          <DialogFooter>
            <button
              type="button"
              onClick={() => setBulkOpen(false)}
              className="h-10 rounded-lg border border-border bg-background px-4 text-sm font-medium text-foreground transition-colors hover:bg-accent"
            >
              Hủy
            </button>
            <button
              type="submit"
              disabled={creatingAll}
              className="h-10 rounded-lg bg-primary text-primary-foreground px-5 text-sm font-semibold transition-colors hover:opacity-90 disabled:opacity-50"
            >
              {creatingAll ? "Đang tạo…" : "Gửi tất cả"}
            </button>
          </DialogFooter>
        </form>
      </Dialog>

      {/* ─── Edit Member Dialog ─── */}
      <Dialog open={openEdit} onOpenChange={setOpenEdit}>
        <form onSubmit={onEdit}>
          <DialogHeader>
            <DialogTitle>Sửa thành viên</DialogTitle>
          </DialogHeader>
          <DialogBody className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="me-name">
                Họ tên <span className="text-red-500">*</span>
              </Label>
              <Input
                id="me-name"
                required
                value={editForm.name}
                onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                placeholder="VD: Nguyễn Văn A"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="me-role">Vai trò</Label>
                <Select
                  id="me-role"
                  value={editForm.role_id}
                  onChange={(e) => setEditForm({ ...editForm, role_id: e.target.value })}
                >
                  {roles.map((r) => (
                    <option key={r.id} value={r.id}>{getRoleLabel(r.name)}</option>
                  ))}
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="me-branch">Chi nhánh</Label>
                <Select
                  id="me-branch"
                  value={editForm.branch_id}
                  onChange={(e) => setEditForm({ ...editForm, branch_id: e.target.value })}
                >
                  {branches.map((b) => (
                    <option key={b.id} value={b.id}>{b.name}</option>
                  ))}
                </Select>
              </div>
            </div>
            <div className="flex items-center gap-3 pt-1">
              <button
                type="button"
                onClick={() => setEditForm({ ...editForm, is_active: !editForm.is_active })}
                className={cn(
                  "relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2",
                  editForm.is_active ? "bg-primary" : "bg-muted",
                )}
              >
                <span
                  className={cn(
                    "pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out",
                    editForm.is_active ? "translate-x-4" : "translate-x-0",
                  )}
                />
              </button>
              <Label
                className={cn(
                  "text-sm font-medium cursor-pointer transition-colors",
                  editForm.is_active ? "text-foreground" : "text-muted-foreground",
                )}
                onClick={() => setEditForm({ ...editForm, is_active: !editForm.is_active })}
              >
                Hoạt động
              </Label>
            </div>
          </DialogBody>
          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={() => setOpenEdit(false)}>
              Hủy
            </Button>
            <Button type="submit" disabled={savingEdit}>
              {savingEdit ? "Đang lưu…" : "Lưu"}
            </Button>
          </DialogFooter>
        </form>
      </Dialog>
    </div>
  );
}
