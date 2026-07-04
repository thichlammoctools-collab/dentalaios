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
    <div className="mx-auto max-w-6xl space-y-4 p-4 sm:p-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Bệnh nhân</h1>
        <Button onClick={() => setOpenForm(true)} className="w-full sm:w-auto">
          + Tạo bệnh nhân
        </Button>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <Input
              placeholder="Tìm theo tên hoặc SĐT…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") load();
              }}
              className="sm:max-w-sm"
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
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Họ tên</TableHead>
                    <TableHead className="hidden sm:table-cell">SĐT</TableHead>
                    <TableHead className="hidden md:table-cell">Ngày sinh</TableHead>
                    <TableHead className="hidden lg:table-cell">Giới tính</TableHead>
                    <TableHead className="hidden lg:table-cell">Ngày tạo</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {patients.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell>
                        <div>
                          <Link
                            to={`/patients/${p.id}`}
                            className="font-medium text-primary hover:underline"
                          >
                            {p.name}
                          </Link>
                          <p className="text-xs text-muted-foreground sm:hidden">{p.phone}</p>
                        </div>
                      </TableCell>
                      <TableCell className="hidden sm:table-cell">{p.phone}</TableCell>
                      <TableCell className="hidden md:table-cell">{formatDate(p.date_of_birth)}</TableCell>
                      <TableCell className="hidden lg:table-cell">
                        {p.gender === "M" ? "Nam" : p.gender === "F" ? "Nữ" : "Khác"}
                      </TableCell>
                      <TableCell className="hidden lg:table-cell text-muted-foreground">
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
            </div>
          )}
        </CardContent>
      </Card>

      <PatientForm open={openForm} onOpenChange={setOpenForm} onSaved={load} />
    </div>
  );
}