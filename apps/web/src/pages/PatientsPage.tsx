import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PatientForm } from "@/components/PatientForm";
import { apiDelete, apiGet, ApiError } from "@/lib/api";
import { toast } from "@/lib/toast";
import { formatDate } from "@/lib/utils";
import type { Patient } from "@shared/types";

interface PatientsResponse {
  items: Patient[];
  total: number;
}

export function PatientsPage() {
  const [patients, setPatients] = useState<Patient[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [openForm, setOpenForm] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      params.set("limit", "100");
      const res = await apiGet<PatientsResponse>(`/api/patients?${params}`);
      setPatients(res.items);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Lỗi tải bệnh nhân");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function onDelete(p: Patient) {
    if (!confirm(`Xóa bệnh nhân "${p.name}"?`)) return;
    try {
      await apiDelete(`/api/patients/${p.id}`);
      toast.success("Đã xóa");
      load();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Lỗi xóa");
    }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-4 px-6 py-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Bệnh nhân</h1>
        <Button onClick={() => setOpenForm(true)}>+ Tạo bệnh nhân</Button>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Input
              placeholder="Tìm theo tên hoặc SĐT…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") load();
              }}
              className="max-w-sm"
            />
            <Button variant="outline" onClick={load}>
              Tìm
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-muted-foreground">Đang tải…</p>
          ) : patients.length === 0 ? (
            <p className="text-sm text-muted-foreground">Chưa có bệnh nhân.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Họ tên</TableHead>
                  <TableHead>SĐT</TableHead>
                  <TableHead>Ngày sinh</TableHead>
                  <TableHead>Giới tính</TableHead>
                  <TableHead>Ngày tạo</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {patients.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell>
                      <Link
                        to={`/patients/${p.id}`}
                        className="font-medium text-primary hover:underline"
                      >
                        {p.name}
                      </Link>
                    </TableCell>
                    <TableCell>{p.phone}</TableCell>
                    <TableCell>{formatDate(p.date_of_birth)}</TableCell>
                    <TableCell>
                      {p.gender === "M" ? "Nam" : p.gender === "F" ? "Nữ" : "Khác"}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {formatDate(p.created_at)}
                    </TableCell>
                    <TableCell>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => onDelete(p)}
                      >
                        Xóa
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <PatientForm open={openForm} onOpenChange={setOpenForm} onSaved={load} />
    </div>
  );
}