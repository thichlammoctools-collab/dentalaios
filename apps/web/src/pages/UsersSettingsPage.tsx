import { useEffect, useState, type FormEvent } from "react";
import { apiGet, apiPost, apiPut, ApiError } from "@/lib/api";
import { toast } from "@/lib/toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Dialog, DialogHeader, DialogTitle, DialogBody, DialogFooter } from "@/components/ui/dialog";
import type { Branch, Role, User } from "@shared/types";
import { getRoleLabel } from "@shared/constants";
import { cn } from "@/lib/utils";
import { ProfileAvatar } from "@/components/ProfileAvatar";
import { DEFAULT_PAGE_SIZE, Pagination } from "@/components/ui/pagination";

interface EditForm {
  name: string;
  role_id: string;
  branch_id: string;
  is_active: boolean;
}

export function UsersSettingsPage() {
  const [members, setMembers] = useState<User[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [creating, setCreating] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [manual, setManual] = useState({ name: "", email: "", password: "", role_id: "", branch_id: "" });
  const [openEdit, setOpenEdit] = useState(false);
  const [editUser, setEditUser] = useState<User | null>(null);
  const [editForm, setEditForm] = useState<EditForm>({ name: "", role_id: "", branch_id: "", is_active: true });
  const [savingEdit, setSavingEdit] = useState(false);
  const [page, setPage] = useState(1);
  const visibleMembers = members.slice((page - 1) * DEFAULT_PAGE_SIZE, page * DEFAULT_PAGE_SIZE);

  useEffect(() => {
    loadAll();
  }, []);

  async function loadAll() {
    try {
      const [usersRes, rolesRes, clinicRes] = await Promise.all([
        apiGet<{ items: User[] }>("/api/users"),
        apiGet<{ items: Role[] }>("/api/roles"),
        apiGet<{ branches: Branch[] }>("/api/clinic"),
      ]);
      setMembers(usersRes.items);
      setPage((current) => Math.min(current, Math.max(1, Math.ceil(usersRes.items.length / DEFAULT_PAGE_SIZE))));
      setRoles(rolesRes.items);
      setBranches(clinicRes.branches);
    } catch {
      toast.error("Không tải được danh sách người dùng");
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
      toast.success("Đã tạo người dùng - tài khoản hoạt động ngay");
      setManual({ name: "", email: "", password: "", role_id: "", branch_id: "" });
      setCreateOpen(false);
      await loadAll();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Lỗi tạo người dùng");
    } finally {
      setCreating(false);
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

  function roleName(roleId: string): string {
    const role = roles.find((r) => r.id === roleId);
    return role ? getRoleLabel(role.name) : "—";
  }

  function branchName(branchId: string): string {
    return branches.find((b) => b.id === branchId)?.name ?? "—";
  }

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Người dùng</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Quản lý người dùng theo phòng khám</p>
        </div>
        <button
          onClick={() => setCreateOpen(true)}
          className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm transition-colors hover:opacity-90"
        >
          <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          Thêm người dùng
        </button>
      </div>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <form onSubmit={createManualMember}>
          <DialogHeader>
            <DialogTitle>Thêm người dùng mới</DialogTitle>
          </DialogHeader>
          <DialogBody className="space-y-4">
            <p className="text-sm text-muted-foreground">Tài khoản hoạt động ngay sau khi được tạo.</p>
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
                <label htmlFor="m-branch" className="text-sm font-medium text-foreground">Phòng khám</label>
                <select
                  id="m-branch"
                  required
                  value={manual.branch_id}
                  onChange={(e) => setManual({ ...manual, branch_id: e.target.value })}
                  className="w-full h-10 rounded-lg border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring/50"
                >
                  <option value="">-- Chọn phòng khám --</option>
                  {branches.map((b) => (
                    <option key={b.id} value={b.id}>{b.name}</option>
                  ))}
                </select>
              </div>
            </div>
          </DialogBody>
          <DialogFooter className="gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setManual({ name: "", email: "", password: "", role_id: "", branch_id: "" });
                setCreateOpen(false);
              }}
            >
              Hủy
            </Button>
            <Button type="submit" disabled={creating}>
              {creating ? "Đang tạo…" : "Thêm người dùng"}
            </Button>
          </DialogFooter>
        </form>
      </Dialog>

      {/* Members table — thành viên đã có tài khoản */}
      {members.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-foreground">Người dùng hiện tại ({members.length})</h2>
          </div>
          <div className="rounded-xl border border-border bg-card overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border bg-muted/40">
                  <th className="text-left text-xs font-semibold text-muted-foreground px-4 py-3">Họ tên</th>
                  <th className="text-left text-xs font-semibold text-muted-foreground px-4 py-3">Email</th>
                  <th className="text-left text-xs font-semibold text-muted-foreground px-4 py-3">Vai trò</th>
                  <th className="text-left text-xs font-semibold text-muted-foreground px-4 py-3">Phòng khám</th>
                  <th className="text-left text-xs font-semibold text-muted-foreground px-4 py-3">Trạng thái</th>
                  <th className="text-right text-xs font-semibold text-muted-foreground px-4 py-3">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {visibleMembers.map((u) => (
                  <tr key={u.id} className="hover:bg-accent/50 transition-colors">
                    <td className="px-4 py-3 text-sm font-medium text-foreground"><div className="flex items-center gap-2"><ProfileAvatar subject="users" entityId={u.id} name={u.name} avatarFileId={u.avatar_file_id} size="sm" />{u.name}</div></td>
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
          <Pagination page={page} pageSize={DEFAULT_PAGE_SIZE} total={members.length} onPageChange={setPage} />
        </div>
      )}

      {/* ─── Edit Member Dialog ─── */}
      <Dialog open={openEdit} onOpenChange={setOpenEdit}>
        <form onSubmit={onEdit}>
          <DialogHeader>
          <DialogTitle>Sửa người dùng</DialogTitle>
          </DialogHeader>
          <DialogBody className="space-y-4">
            {editUser && <div className="flex justify-center"><ProfileAvatar subject="users" entityId={editUser.id} name={editUser.name} avatarFileId={editUser.avatar_file_id} size="xl" editable onChanged={() => void loadAll()} /></div>}
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
                <Label htmlFor="me-branch">Phòng khám</Label>
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
