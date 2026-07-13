import { useEffect, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Dialog, DialogBody, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { apiDelete, apiGet, apiPost, apiPut, ApiError } from "@/lib/api";
import { toast } from "@/lib/toast";
import { useAuth } from "@/lib/auth-context";
import { cn, formatDate } from "@/lib/utils";
import { ProfileAvatar } from "@/components/ProfileAvatar";
import type { User, Role, Branch } from "@shared/types";

interface UsersResponse {
  items: User[];
  total: number;
}
interface RolesResponse {
  items: Role[];
  total: number;
}
interface ClinicResponse {
  tenant: { id: string; name: string };
  branches: Branch[];
}
interface EditForm {
  name: string;
  email: string;
  role_id: string;
  branch_id: string;
  is_active: boolean;
}

export function UsersSettingsPage() {
  const { session } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);

  // Create dialog
  const [openCreate, setOpenCreate] = useState(false);
  const [createForm, setCreateForm] = useState({
    email: "",
    name: "",
    password: "password123",
    role_id: "",
  });
  const [savingCreate, setSavingCreate] = useState(false);

  // Edit dialog
  const [openEdit, setOpenEdit] = useState(false);
  const [editUser, setEditUser] = useState<User | null>(null);
  const [editForm, setEditForm] = useState<EditForm>({
    name: "",
    email: "",
    role_id: "",
    branch_id: "",
    is_active: true,
  });
  const [savingEdit, setSavingEdit] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const [u, r, c] = await Promise.all([
        apiGet<UsersResponse>("/api/users"),
        apiGet<RolesResponse>("/api/roles"),
        apiGet<ClinicResponse>("/api/clinic"),
      ]);
      setUsers(u.items);
      setRoles(r.items);
      setBranches(c.branches);
      if (!createForm.role_id && r.items[0]) {
        setCreateForm((f) => ({ ...f, role_id: r.items[0].id }));
      }
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Lỗi tải");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    if (!session) return;
    if (!createForm.role_id) {
      toast.error("Chọn role");
      return;
    }
    setSavingCreate(true);
    try {
      await apiPost("/api/users", {
        email: createForm.email,
        name: createForm.name,
        password: createForm.password,
        role_id: createForm.role_id,
        branch_id: session.branch.id,
      });
      toast.success("Đã tạo user");
      setOpenCreate(false);
      setCreateForm({ email: "", name: "", password: "password123", role_id: roles[0]?.id ?? "" });
      load();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Lỗi tạo user");
    } finally {
      setSavingCreate(false);
    }
  }

  function openEditDialog(u: User) {
    setEditUser(u);
    setEditForm({
      name: u.name,
      email: u.email,
      role_id: u.role_id,
      branch_id: u.branch_id,
      is_active: u.is_active,
    });
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
      load();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Lỗi cập nhật");
    } finally {
      setSavingEdit(false);
    }
  }

  async function onDelete(u: User) {
    if (u.id === session?.user.id) {
      toast.error("Không thể xóa chính mình");
      return;
    }
    if (!confirm(`Xóa user ${u.email}? Họ sẽ không thể đăng nhập.`)) return;
    try {
      await apiDelete(`/api/users/${u.id}`);
      toast.success("Đã xóa");
      load();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Lỗi xóa");
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-4 px-6 py-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Người dùng</h1>
        <Button onClick={() => setOpenCreate(true)}>+ Tạo user</Button>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Danh sách ({users.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-muted-foreground">Đang tải…</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Email</TableHead>
                  <TableHead>Nhân viên</TableHead>
                  <TableHead>Vai trò</TableHead>
                  <TableHead>Chi nhánh</TableHead>
                  <TableHead>Trạng thái</TableHead>
                  <TableHead>Ngày tạo</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map((u) => {
                  const role = roles.find((r) => r.id === u.role_id);
                  const branch = branches.find((b) => b.id === u.branch_id);
                  return (
                    <TableRow key={u.id}>
                      <TableCell className="font-mono">{u.email}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2.5">
                          <ProfileAvatar subject="users" entityId={u.id} name={u.name} avatarFileId={u.avatar_file_id} size="sm" />
                          <span>{u.name}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{role?.name ?? "—"}</Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {branch?.name ?? "—"}
                      </TableCell>
                      <TableCell>
                        <Badge variant={u.is_active ? "success" : "destructive"}>
                          {u.is_active ? "Hoạt động" : "Đã khóa"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {formatDate(u.created_at)}
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => openEditDialog(u)}
                          >
                            Sửa
                          </Button>
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => onDelete(u)}
                          >
                            Xóa
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* ─── Create Dialog ─── */}
      <Dialog open={openCreate} onOpenChange={setOpenCreate}>
        <form onSubmit={onCreate}>
          <DialogHeader>
            <DialogTitle>Tạo user mới</DialogTitle>
          </DialogHeader>
          <DialogBody className="grid gap-3">

            <SectionDivider icon={<UserIcon />}>Thông tin đăng nhập</SectionDivider>

            <div className="grid gap-1.5">
              <Label htmlFor="u-email">
                Email <span className="text-red-500">*</span>
              </Label>
              <Input
                id="u-email"
                type="email"
                required
                value={createForm.email}
                onChange={(e) => setCreateForm({ ...createForm, email: e.target.value })}
                placeholder="VD: nguyenvana@email.com"
              />
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="u-pwd">
                Mật khẩu <span className="text-red-500">*</span>
              </Label>
              <Input
                id="u-pwd"
                type="password"
                required
                minLength={6}
                value={createForm.password}
                onChange={(e) => setCreateForm({ ...createForm, password: e.target.value })}
                placeholder="Ít nhất 6 ký tự"
              />
            </div>

            <SectionDivider icon={<RoleIcon />}>Thông tin cá nhân</SectionDivider>

            <div className="grid gap-1.5">
              <Label htmlFor="u-name">
                Họ tên <span className="text-red-500">*</span>
              </Label>
              <Input
                id="u-name"
                required
                value={createForm.name}
                onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })}
                placeholder="VD: Nguyễn Văn A"
              />
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="u-role">
                Vai trò <span className="text-red-500">*</span>
              </Label>
              <Select
                id="u-role"
                required
                value={createForm.role_id}
                onChange={(e) => setCreateForm({ ...createForm, role_id: e.target.value })}
              >
                {roles.map((r) => (
                  <option key={r.id} value={r.id}>{r.name}</option>
                ))}
              </Select>
            </div>
          </DialogBody>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpenCreate(false)}>
              Hủy
            </Button>
            <Button type="submit" disabled={savingCreate}>
              {savingCreate ? "Đang tạo…" : "Tạo user"}
            </Button>
          </DialogFooter>
        </form>
      </Dialog>

      {/* ─── Edit Dialog ─── */}
      <Dialog open={openEdit} onOpenChange={setOpenEdit}>
        <form onSubmit={onEdit}>
          <DialogHeader>
            <DialogTitle>Sửa user</DialogTitle>
          </DialogHeader>
          <DialogBody className="space-y-5">

            {/* Personal info section */}
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground"><UserIcon /></span>
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Thông tin cá nhân</span>
              </div>
              <div className="bg-muted/40 rounded-xl p-4 space-y-3">
                <div className="flex justify-center pb-1">
                  <ProfileAvatar
                    subject="users"
                    entityId={editUser?.id}
                    name={editForm.name}
                    avatarFileId={editUser?.avatar_file_id}
                    size="lg"
                    editable
                    onChanged={load}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="e-name" className="text-xs font-medium text-muted-foreground">
                    Họ tên <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    id="e-name"
                    required
                    value={editForm.name}
                    onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                    placeholder="VD: Nguyễn Văn A"
                    className="h-9"
                  />
                </div>
              </div>
            </div>

            {/* Authorization section */}
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground"><RoleIcon /></span>
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Phân quyền</span>
              </div>
              <div className="bg-muted/40 rounded-xl p-4 space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="e-role" className="text-xs font-medium text-muted-foreground">Vai trò</Label>
                    <Select
                      id="e-role"
                      value={editForm.role_id}
                      onChange={(e) => setEditForm({ ...editForm, role_id: e.target.value })}
                      className="h-9"
                    >
                      {roles.map((r) => (
                        <option key={r.id} value={r.id}>{r.name}</option>
                      ))}
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="e-branch" className="text-xs font-medium text-muted-foreground">Chi nhánh</Label>
                    <Select
                      id="e-branch"
                      value={editForm.branch_id}
                      onChange={(e) => setEditForm({ ...editForm, branch_id: e.target.value })}
                      className="h-9"
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
                    htmlFor="e-active"
                    className={cn(
                      "text-sm font-medium cursor-pointer transition-colors",
                      editForm.is_active ? "text-foreground" : "text-muted-foreground",
                    )}
                    onClick={() => setEditForm({ ...editForm, is_active: !editForm.is_active })}
                  >
                    Hoạt động
                  </Label>
                </div>
              </div>
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

function SectionDivider({ children, icon }: { children: React.ReactNode; icon?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 py-1">
      {icon && <span className="text-muted-foreground">{icon}</span>}
      <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{children}</span>
      <div className="flex-1 h-px bg-border" />
    </div>
  );
}

function UserIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" />
    </svg>
  );
}

function RoleIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  );
}
