import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Dialog, DialogBody, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { apiGet, apiPut, ApiError } from "@/lib/api";
import { toast } from "@/lib/toast";
import { formatDate } from "@/lib/utils";
import type { Role } from "@shared/types";
import { getRoleLabel } from "@shared/constants";

export function RolesSettingsPage() {
  const [roles, setRoles] = useState<Role[]>([]);
  const [openEdit, setOpenEdit] = useState(false);
  const [editRole, setEditRole] = useState<Role | null>(null);
  const [editName, setEditName] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);

  async function loadRoles() {
    const data = await apiGet<{ items: Role[]; total: number }>("/api/roles");
    setRoles(data.items);
  }

  useEffect(() => {
    loadRoles();
  }, []);

  function openEditDialog(r: Role) {
    setEditRole(r);
    setEditName(r.name);
    setEditDesc(r.description ?? "");
    setOpenEdit(true);
  }

  async function onEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editRole) return;
    setSavingEdit(true);
    try {
      await apiPut(`/api/roles/${editRole.id}`, { name: editName, description: editDesc });
      toast.success("Đã cập nhật vai trò");
      setOpenEdit(false);
      loadRoles();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Lỗi");
    } finally {
      setSavingEdit(false);
    }
  }

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Vai trò & Phân quyền</h1>
          <p className="text-sm text-muted-foreground">Vai trò và quyền hạn do hệ thống quản lý. Phòng khám chỉ có thể đổi tên hiển thị.</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Danh sách ({roles.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tên vai trò</TableHead>
                <TableHead>Mô tả</TableHead>
                <TableHead>Ngày tạo</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {roles.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">{getRoleLabel(r.name)}</TableCell>
                  <TableCell className="text-muted-foreground">{r.description ?? "—"}</TableCell>
                  <TableCell className="text-muted-foreground">{formatDate(r.created_at)}</TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="sm" onClick={() => openEditDialog(r)}>
                      Sửa
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {roles.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                    Chưa có vai trò nào
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* ─── Edit Dialog ─── */}
      <Dialog open={openEdit} onOpenChange={setOpenEdit}>
        <form onSubmit={onEdit}>
          <DialogHeader>
            <DialogTitle>Sửa vai trò</DialogTitle>
          </DialogHeader>
          <DialogBody className="grid gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="re-name">
                Tên vai trò <span className="text-red-500">*</span>
              </Label>
              <Input
                id="re-name"
                required
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                placeholder="VD: Bác sĩ"
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="re-desc">Mô tả</Label>
              <Input
                id="re-desc"
                value={editDesc}
                onChange={(e) => setEditDesc(e.target.value)}
                placeholder="Mô tả ngắn về vai trò này"
              />
            </div>
          </DialogBody>
          <DialogFooter>
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
