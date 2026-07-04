import { useEffect, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Dialog, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { apiDelete, apiGet, apiPost, ApiError } from "@/lib/api";
import { toast } from "@/lib/toast";
import { useAuth } from "@/lib/auth-context";
import { formatDate } from "@/lib/utils";
import type { User, Role } from "@shared/types";

interface UsersResponse {
  items: User[];
  total: number;
}
interface RolesResponse {
  items: Role[];
  total: number;
}

export function UsersSettingsPage() {
  const { session } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    email: "",
    name: "",
    password: "password123",
    role_id: "",
  });
  const [saving, setSaving] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const [u, r] = await Promise.all([
        apiGet<UsersResponse>("/api/users"),
        apiGet<RolesResponse>("/api/roles"),
      ]);
      setUsers(u.items);
      setRoles(r.items);
      if (!form.role_id && r.items[0]) setForm((f) => ({ ...f, role_id: r.items[0].id }));
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

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!session) return;
    if (!form.role_id) {
      toast.error("Chọn role");
      return;
    }
    setSaving(true);
    try {
      await apiPost("/api/users", {
        email: form.email,
        name: form.name,
        password: form.password,
        role_id: form.role_id,
        branch_id: session.branch.id,
      });
      toast.success("Đã tạo user");
      setOpen(false);
      setForm({ email: "", name: "", password: "password123", role_id: roles[0]?.id ?? "" });
      load();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Lỗi tạo user");
    } finally {
      setSaving(false);
    }
  }

  async function onDelete(u: User) {
    if (u.id === session?.user.id) {
      toast.error("Không thể xóa chính mình");
      return;
    }
    if (!confirm(`Xóa user ${u.email}?`)) return;
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
        <Button onClick={() => setOpen(true)}>+ Tạo user</Button>
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
                  <TableHead>Họ tên</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Ngày tạo</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map((u) => {
                  const role = roles.find((r) => r.id === u.role_id);
                  return (
                    <TableRow key={u.id}>
                      <TableCell className="font-mono">{u.email}</TableCell>
                      <TableCell>{u.name}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{role?.name ?? "—"}</Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {formatDate(u.created_at)}
                      </TableCell>
                      <TableCell>
                        <Button size="sm" variant="destructive" onClick={() => onDelete(u)}>
                          Xóa
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <form onSubmit={onSubmit}>
          <DialogHeader>
            <DialogTitle>Tạo user mới</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="u-email">Email *</Label>
              <Input
                id="u-email"
                type="email"
                required
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="u-name">Họ tên *</Label>
              <Input
                id="u-name"
                required
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="u-pwd">Mật khẩu *</Label>
              <Input
                id="u-pwd"
                type="password"
                required
                minLength={6}
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="u-role">Role *</Label>
              <select
                id="u-role"
                required
                value={form.role_id}
                onChange={(e) => setForm({ ...form, role_id: e.target.value })}
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm"
              >
                {roles.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Hủy
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? "Đang tạo…" : "Tạo"}
            </Button>
          </DialogFooter>
        </form>
      </Dialog>
    </div>
  );
}