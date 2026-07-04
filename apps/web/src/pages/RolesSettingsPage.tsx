import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { apiGet, apiPut, ApiError } from "@/lib/api";
import { toast } from "@/lib/toast";
import type { Role } from "@shared/types";
import { PERMISSIONS, ROLES } from "@shared/constants";

interface RolesResponse {
  items: Role[];
  total: number;
}

const ALL_PERMISSIONS = Object.values(PERMISSIONS).filter((p) => p !== PERMISSIONS.ALL);
const PERMISSION_LABELS: Record<string, string> = {
  all: "Tất cả",
  read_patients: "Đọc bệnh nhân",
  write_patients: "Ghi bệnh nhân",
  write_visits: "Ghi lượt khám",
  write_findings: "Ghi clinical finding",
  write_plans: "Ghi kế hoạch điều trị",
  approve_plans: "Duyệt kế hoạch",
  write_payments: "Ghi thanh toán",
  write_appointments: "Ghi lịch hẹn",
  manage_users: "Quản lý user",
  manage_roles: "Quản lý role",
};

export function RolesSettingsPage() {
  const [roles, setRoles] = useState<Role[]>([]);
  const [editing, setEditing] = useState<Role | null>(null);
  const [permissions, setPermissions] = useState<string[]>([]);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);

  async function load() {
    try {
      const res = await apiGet<RolesResponse>("/api/roles");
      setRoles(res.items);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Lỗi tải");
    }
  }

  useEffect(() => {
    load();
  }, []);

  function openEdit(role: Role) {
    setEditing(role);
    setName(role.name);
    // Nếu có "all", tự tick tất cả
    if (role.permissions.includes(PERMISSIONS.ALL)) {
      setPermissions([...ALL_PERMISSIONS, PERMISSIONS.ALL]);
    } else {
      setPermissions([...role.permissions]);
    }
  }

  function togglePermission(p: string) {
    setPermissions((prev) =>
      prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p],
    );
  }

  async function onSave() {
    if (!editing) return;
    setSaving(true);
    try {
      await apiPut(`/api/roles/${editing.id}`, {
        name,
        permissions: permissions.filter((p) => p !== PERMISSIONS.ALL),
      });
      toast.success("Đã cập nhật role");
      setEditing(null);
      load();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Lỗi lưu");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-4 px-6 py-6">
      <h1 className="text-2xl font-semibold tracking-tight">Vai trò</h1>
      <Card>
        <CardHeader>
          <CardTitle>Danh sách ({roles.length})</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {roles.map((r) => {
            const isSystemRole = Object.values(ROLES).includes(r.name as never);
            return (
              <div
                key={r.id}
                className="flex items-center justify-between rounded-md border border-border p-3"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{r.name}</span>
                    {isSystemRole && <Badge variant="secondary">hệ thống</Badge>}
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {r.permissions.length} quyền: {r.permissions.slice(0, 5).join(", ")}
                    {r.permissions.length > 5 && "…"}
                  </p>
                </div>
                <Button size="sm" variant="outline" onClick={() => openEdit(r)}>
                  Sửa
                </Button>
              </div>
            );
          })}
        </CardContent>
      </Card>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        {editing && (
          <div>
            <DialogHeader>
              <DialogTitle>Sửa role: {editing.name}</DialogTitle>
            </DialogHeader>
            <div className="grid gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor="r-name">Tên role</Label>
                <Input
                  id="r-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>
              <div className="grid gap-1.5">
                <Label>Permissions</Label>
                <div className="grid grid-cols-2 gap-2 rounded-md border border-border p-3">
                  {ALL_PERMISSIONS.map((p) => (
                    <label
                      key={p}
                      className="flex items-center gap-2 text-sm cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={permissions.includes(p)}
                        onChange={() => togglePermission(p)}
                        className="h-4 w-4"
                      />
                      <span>{PERMISSION_LABELS[p] ?? p}</span>
                    </label>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">
                  Tick "Tất cả" = super admin (bypass mọi permission check).
                </p>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditing(null)}>
                Hủy
              </Button>
              <Button onClick={onSave} disabled={saving}>
                {saving ? "Đang lưu…" : "Lưu"}
              </Button>
            </DialogFooter>
          </div>
        )}
      </Dialog>
    </div>
  );
}