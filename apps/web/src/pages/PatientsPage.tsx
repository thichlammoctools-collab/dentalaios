import { useEffect, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { PatientForm } from "@/components/PatientForm";
import { apiDelete, apiGet, ApiError } from "@/lib/api";
import { toast } from "@/lib/toast";
import { formatDate } from "@/lib/utils";
import type { Patient } from "@shared/types";

interface PatientsResponse {
  items: Patient[];
  total: number;
}

function PatientRowSkeleton() {
  return (
    <TableRow>
      <TableCell><div className="h-4 w-28 rounded animate-pulse bg-muted" /></TableCell>
      <TableCell className="hidden sm:table-cell"><div className="h-4 w-20 rounded animate-pulse bg-muted" /></TableCell>
      <TableCell className="hidden md:table-cell"><div className="h-4 w-24 rounded animate-pulse bg-muted" /></TableCell>
      <TableCell className="hidden lg:table-cell"><div className="h-4 w-12 rounded animate-pulse bg-muted" /></TableCell>
      <TableCell className="hidden lg:table-cell"><div className="h-4 w-24 rounded animate-pulse bg-muted" /></TableCell>
      <TableCell><div className="h-7 w-14 rounded animate-pulse bg-muted" /></TableCell>
    </TableRow>
  );
}

export function PatientsPage() {
  const [patients, setPatients] = useState<Patient[]>([]);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [openForm, setOpenForm] = useState(false);
  const [editPatient, setEditPatient] = useState<Patient | undefined>(undefined);

  const load = useCallback(async (q: string) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (q) params.set("search", q);
      params.set("limit", "100");
      const res = await apiGet<PatientsResponse>(`/api/patients?${params}`);
      setPatients(res.items);
      setTotal(res.total);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Lỗi tải bệnh nhân");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Debounced search: auto-load after 400ms of no typing
  useEffect(() => {
    const timer = setTimeout(() => {
      load(search);
    }, 400);
    return () => clearTimeout(timer);
  }, [search, load]);

  async function onDelete(p: Patient) {
    if (!confirm(`Xóa bệnh nhân "${p.name}"?`)) return;
    try {
      await apiDelete(`/api/patients/${p.id}`);
      toast.success("Đã xóa bệnh nhân");
      load(search);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Lỗi xóa");
    }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-4 p-4 sm:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Bệnh nhân</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {loading ? "Đang tải…" : `${total} bệnh nhân`}
          </p>
        </div>
        <Button onClick={() => { setEditPatient(undefined); setOpenForm(true); }} className="gap-1.5">
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          Tạo bệnh nhân
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-0">
          <div className="relative">
            <div className="pointer-events-none absolute inset-y-0 left-3 flex items-center">
              <svg className="h-4 w-4 text-muted-foreground" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <circle cx="11" cy="11" r="8" />
                <path d="m21 21-4.35-4.35" />
              </svg>
            </div>
            <Input
              placeholder="Tìm theo tên hoặc SĐT…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 pr-20"
            />
            {loading && (
              <div className="pointer-events-none absolute inset-y-0 right-3 flex items-center">
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-muted-foreground" />
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent className="pt-4">
          {!loading && patients.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-16 text-center">
              <div className="rounded-full bg-muted p-4">
                <svg className="h-8 w-8 text-muted-foreground" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
                </svg>
              </div>
              <div>
                <p className="font-medium text-foreground">Không tìm thấy bệnh nhân</p>
                <p className="text-sm text-muted-foreground mt-1">
                  {search ? `Không có kết quả cho "${search}"` : "Chưa có bệnh nhân nào"}
                </p>
              </div>
              {!search && (
                <Button size="sm" variant="outline" onClick={() => { setEditPatient(undefined); setOpenForm(true); }}>
                  Tạo bệnh nhân đầu tiên
                </Button>
              )}
            </div>
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
                    <TableHead className="w-24"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    <>
                      <PatientRowSkeleton />
                      <PatientRowSkeleton />
                      <PatientRowSkeleton />
                    </>
                  ) : (
                    patients.map((p) => (
                      <TableRow key={p.id} className="group">
                        <TableCell>
                          <Link
                            to={`/patients/${p.id}`}
                            className="flex flex-col gap-0.5"
                          >
                            <span className="font-medium text-primary hover:underline">
                              {p.name}
                            </span>
                            <span className="text-xs text-muted-foreground sm:hidden">{p.phone}</span>
                          </Link>
                        </TableCell>
                        <TableCell className="hidden sm:table-cell font-mono text-sm">{p.phone}</TableCell>
                        <TableCell className="hidden md:table-cell">{formatDate(p.date_of_birth)}</TableCell>
                        <TableCell className="hidden lg:table-cell">
                          <div className="flex items-center gap-1.5">
                            {p.gender === "M" ? (
                              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-blue-100 text-[10px] font-bold text-blue-600">M</span>
                            ) : p.gender === "F" ? (
                              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-pink-100 text-[10px] font-bold text-pink-600">F</span>
                            ) : (
                              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-muted text-[10px] font-bold text-muted-foreground">O</span>
                            )}
                            <span className="text-sm">
                              {p.gender === "M" ? "Nam" : p.gender === "F" ? "Nữ" : "Khác"}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="hidden lg:table-cell text-muted-foreground text-sm">
                          {formatDate(p.created_at)}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1 opacity-60 group-hover:opacity-100 transition-opacity">
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 px-2 text-xs"
                              onClick={() => {
                                setEditPatient(p);
                                setOpenForm(true);
                              }}
                            >
                              <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
                              </svg>
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 px-2 text-xs text-destructive hover:text-destructive"
                              onClick={() => onDelete(p)}
                            >
                              <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                              </svg>
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <PatientForm open={openForm} onOpenChange={(v) => { if (!v) setEditPatient(undefined); setOpenForm(v); }} patient={editPatient} onSaved={() => load(search)} />
    </div>
  );
}
