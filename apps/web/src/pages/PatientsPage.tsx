import { useEffect, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Select } from "@/components/ui/select";
import { PatientForm } from "@/components/PatientForm";
import { ProfileAvatar } from "@/components/ProfileAvatar";
import { DEFAULT_PAGE_SIZE, Pagination } from "@/components/ui/pagination";
import { apiDelete, apiGet, apiPost, ApiError } from "@/lib/api";
import { toast } from "@/lib/toast";
import { formatDate } from "@/lib/utils";
import { PageContainer } from "@/components/PageContainer";
import type { Patient } from "@shared/types";
import { PERMISSIONS, MARKETING_SOURCE_LABELS, type MarketingSource } from "@shared/constants";
import { useAuth } from "@/lib/auth-context";

interface PatientWithStatus extends Patient {
  has_appointment_today: boolean;
  has_debt: boolean;
  has_active_treatment: boolean;
}

interface PatientsResponse {
  items: PatientWithStatus[];
  total: number;
}

function StatusBadges({ p }: { p: PatientWithStatus }) {
  const badges: { label: string; color: string }[] = [];
  if (p.has_appointment_today) badges.push({ label: "Hôm nay", color: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300" });
  if (p.has_debt) badges.push({ label: "Công nợ", color: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300" });
  if (p.has_active_treatment) badges.push({ label: "Điều trị", color: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300" });
  if (badges.length === 0) return <span className="text-xs text-muted-foreground">—</span>;
  return (
    <div className="flex flex-wrap gap-1">
      {badges.map((b) => (
        <span key={b.label} className={`inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium ${b.color}`}>
          {b.label}
        </span>
      ))}
    </div>
  );
}

function PatientRowSkeleton() {
  return (
    <TableRow>
      <TableCell><div className="h-4 w-28 rounded animate-pulse bg-muted" /></TableCell>
      <TableCell className="hidden sm:table-cell"><div className="h-4 w-20 rounded animate-pulse bg-muted" /></TableCell>
      <TableCell className="hidden md:table-cell"><div className="h-4 w-24 rounded animate-pulse bg-muted" /></TableCell>
      <TableCell className="hidden lg:table-cell"><div className="h-4 w-12 rounded animate-pulse bg-muted" /></TableCell>
      <TableCell className="hidden xl:table-cell"><div className="h-4 w-24 rounded animate-pulse bg-muted" /></TableCell>
      <TableCell className="hidden lg:table-cell"><div className="h-5 w-20 rounded animate-pulse bg-muted" /></TableCell>
      <TableCell><div className="h-7 w-14 rounded animate-pulse bg-muted" /></TableCell>
    </TableRow>
  );
}

export function PatientsPage() {
  const { session } = useAuth();
  const [patients, setPatients] = useState<PatientWithStatus[]>([]);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [openForm, setOpenForm] = useState(false);
  const [editPatient, setEditPatient] = useState<Patient | undefined>(undefined);
  const [showArchived, setShowArchived] = useState(false);
  // Filters
  const [filterGender, setFilterGender] = useState("");
  const [filterSource, setFilterSource] = useState("");
  const [filterTodayAppt, setFilterTodayAppt] = useState(false);
  const [filterDebt, setFilterDebt] = useState(false);
  const [filterTreatment, setFilterTreatment] = useState(false);

  const canManagePatients = Boolean(
    session?.role.permissions.includes(PERMISSIONS.ALL) || session?.role.permissions.includes(PERMISSIONS.MANAGE_PATIENTS),
  );

  const load = useCallback(async (q: string, currentPage: number, opts?: { archived?: boolean; gender?: string; marketingSource?: string; hasAppointmentToday?: boolean; hasDebt?: boolean; hasActiveTreatment?: boolean }) => {
    const archived = opts?.archived ?? showArchived;
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (q) params.set("search", q);
      if (archived) params.set("archived", "true");
      if (opts?.gender) params.set("gender", opts.gender);
      if (opts?.marketingSource) params.set("marketing_source", opts.marketingSource);
      if (opts?.hasAppointmentToday) params.set("has_appointment_today", "true");
      if (opts?.hasDebt) params.set("has_debt", "true");
      if (opts?.hasActiveTreatment) params.set("has_active_treatment", "true");
      params.set("limit", String(DEFAULT_PAGE_SIZE));
      params.set("offset", String((currentPage - 1) * DEFAULT_PAGE_SIZE));
      const res = await apiGet<PatientsResponse>(`/api/patients?${params}`);
      setPatients(res.items);
      setTotal(res.total);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Lỗi tải bệnh nhân");
    } finally {
      setLoading(false);
    }
  }, [showArchived]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load("", 1); }, [load, showArchived, filterGender, filterSource, filterTodayAppt, filterDebt, filterTreatment]);

  // Debounced search: auto-load after 400ms of no typing
  useEffect(() => {
    const timer = setTimeout(() => {
      load(search, 1, { gender: filterGender, marketingSource: filterSource, hasAppointmentToday: filterTodayAppt, hasDebt: filterDebt, hasActiveTreatment: filterTreatment });
      setPage(1);
    }, 400);
    return () => clearTimeout(timer);
  }, [search, filterGender, filterSource, filterTodayAppt, filterDebt, filterTreatment, load]);

  useEffect(() => {
    if (page > 1) void load(search, page, { gender: filterGender, marketingSource: filterSource, hasAppointmentToday: filterTodayAppt, hasDebt: filterDebt, hasActiveTreatment: filterTreatment });
  }, [page, search, load, filterGender, filterSource, filterTodayAppt, filterDebt, filterTreatment]);

  async function onArchive(p: Patient) {
    const reason = prompt(`Lý do lưu trữ hồ sơ bệnh nhân "${p.name}" (tối thiểu 3 ký tự):`);
    if (reason === null) return;
    if (reason.trim().length < 3) {
      toast.error("Vui lòng nhập lý do lưu trữ ít nhất 3 ký tự");
      return;
    }
    try {
      await apiDelete(`/api/patients/${p.id}`, { reason: reason.trim() });
      toast.success("Đã lưu trữ hồ sơ bệnh nhân");
      load(search, page, { gender: filterGender, marketingSource: filterSource, hasAppointmentToday: filterTodayAppt, hasDebt: filterDebt, hasActiveTreatment: filterTreatment });
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Lỗi lưu trữ hồ sơ");
    }
  }

  async function onRestore(p: Patient) {
    if (!confirm(`Khôi phục hồ sơ bệnh nhân "${p.name}"?`)) return;
    try {
      await apiPost(`/api/patients/${p.id}/restore`);
      toast.success("Đã khôi phục hồ sơ bệnh nhân");
      load(search, page, { gender: filterGender, marketingSource: filterSource, hasAppointmentToday: filterTodayAppt, hasDebt: filterDebt, hasActiveTreatment: filterTreatment });
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Lỗi khôi phục hồ sơ");
    }
  }

  return (
    <PageContainer size="data" className="space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Bệnh nhân</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {loading ? "Đang tải…" : `${total} bệnh nhân ${showArchived ? "đã lưu trữ" : "đang hoạt động"}`}
          </p>
        </div>
        <Button onClick={() => { setEditPatient(undefined); setOpenForm(true); }} className="gap-1.5 lg:shrink-0">
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          Tạo bệnh nhân
        </Button>
      </div>

      <Card>
        <CardHeader className="gap-3 pb-0">
          <div className="grid gap-3 lg:grid-cols-[minmax(20rem,1fr)_auto] lg:items-center">
            <div className="relative min-w-0">
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
            {canManagePatients && (
              <Button
                variant="outline"
                size="sm"
                className="lg:justify-self-end"
                onClick={() => {
                  setShowArchived((value) => !value);
                  setPage(1);
                }}
              >
                {showArchived ? "Xem hồ sơ đang hoạt động" : "Xem hồ sơ đã lưu trữ"}
              </Button>
            )}
          </div>
          {/* Filters row */}
          <div className="flex flex-wrap items-center gap-2">
            <Select value={filterGender} onChange={(e) => { setFilterGender(e.target.value); setPage(1); }} className="h-8 w-auto text-xs">
              <option value="">Giới tính</option>
              <option value="M">Nam</option>
              <option value="F">Nữ</option>
              <option value="O">Khác</option>
            </Select>
            <Select value={filterSource} onChange={(e) => { setFilterSource(e.target.value); setPage(1); }} className="h-8 w-auto text-xs">
              <option value="">Nguồn</option>
              {(Object.entries(MARKETING_SOURCE_LABELS) as [MarketingSource, string][]).map(([val, label]) => (
                <option key={val} value={val}>{label}</option>
              ))}
            </Select>
            <Button
              size="sm"
              variant={filterTodayAppt ? "default" : "outline"}
              className="h-8 text-xs gap-1"
              onClick={() => { setFilterTodayAppt((v) => !v); setPage(1); }}
            >
              <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" />
              </svg>
              Lịch hẹn hôm nay
            </Button>
            <Button
              size="sm"
              variant={filterDebt ? "default" : "outline"}
              className="h-8 text-xs gap-1"
              onClick={() => { setFilterDebt((v) => !v); setPage(1); }}
            >
              <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <path d="M12 2v20M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6" />
              </svg>
              Còn công nợ
            </Button>
            <Button
              size="sm"
              variant={filterTreatment ? "default" : "outline"}
              className="h-8 text-xs gap-1"
              onClick={() => { setFilterTreatment((v) => !v); setPage(1); }}
            >
              <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 012-2h2a2 2 0 012 2M9 5h6" />
              </svg>
              Đang điều trị
            </Button>
            {(filterGender || filterSource || filterTodayAppt || filterDebt || filterTreatment) && (
              <Button
                size="sm"
                variant="ghost"
                className="h-8 text-xs text-muted-foreground"
                onClick={() => {
                  setFilterGender("");
                  setFilterSource("");
                  setFilterTodayAppt(false);
                  setFilterDebt(false);
                  setFilterTreatment(false);
                  setPage(1);
                }}
              >
                Xoá bộ lọc
              </Button>
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
            <>
              <div className="space-y-2 lg:hidden">
                {loading ? (
                  Array.from({ length: 3 }, (_, index) => (
                    <div key={index} className="h-24 animate-pulse rounded-lg border border-border bg-muted/30" />
                  ))
                ) : patients.map((p) => (
                  <article key={p.id} className="rounded-lg border border-border bg-card p-3">
                    <div className="flex items-start gap-3">
                      <ProfileAvatar subject="patients" entityId={p.id} name={p.name} avatarFileId={p.avatar_file_id} size="sm" />
                      <Link to={`/patients/${p.id}`} className="min-w-0 flex-1">
                        <p className="truncate font-medium text-primary">{p.name}</p>
                        <p className="mt-0.5 text-sm text-muted-foreground">{p.phone}</p>
                        <p className="mt-1 text-xs text-muted-foreground">Sinh {formatDate(p.date_of_birth)} · {p.gender === "M" ? "Nam" : p.gender === "F" ? "Nữ" : "Khác"}</p>
                        <div className="mt-1.5"><StatusBadges p={p} /></div>
                      </Link>
                      <div className="flex shrink-0 items-center gap-1">
                        {!showArchived && <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={() => { setEditPatient(p); setOpenForm(true); }} aria-label={`Sửa ${p.name}`}>
                          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" /></svg>
                        </Button>}
                        {canManagePatients && (showArchived ? <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={() => onRestore(p)} aria-label={`Khôi phục ${p.name}`}>
                          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3 12a9 9 0 101.76-5.37M3 4v5h5" /></svg>
                        </Button> : <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-destructive hover:text-destructive" onClick={() => onArchive(p)} aria-label={`Lưu trữ ${p.name}`}>
                          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" /></svg>
                        </Button>)}
                      </div>
                    </div>
                  </article>
                ))}
              </div>
              <div className="hidden lg:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Họ tên</TableHead>
                    <TableHead>SĐT</TableHead>
                    <TableHead className="hidden md:table-cell">Ngày sinh</TableHead>
                    <TableHead className="hidden lg:table-cell">Giới tính</TableHead>
                    <TableHead className="hidden xl:table-cell">Ngày tạo</TableHead>
                    <TableHead className="hidden lg:table-cell">Trạng thái</TableHead>
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
                          <Link to={`/patients/${p.id}`} className="flex items-center gap-2.5">
                            <ProfileAvatar subject="patients" entityId={p.id} name={p.name} avatarFileId={p.avatar_file_id} size="sm" />
                            <span className="flex flex-col gap-0.5">
                              <span className="font-medium text-primary hover:underline">{p.name}</span>
                              <span className="text-xs text-muted-foreground sm:hidden">{p.phone}</span>
                            </span>
                          </Link>
                        </TableCell>
                        <TableCell className="font-mono text-sm">{p.phone}</TableCell>
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
                        <TableCell className="hidden xl:table-cell text-sm text-muted-foreground">
                          {formatDate(p.created_at)}
                        </TableCell>
                        <TableCell className="hidden lg:table-cell">
                          <StatusBadges p={p} />
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1 opacity-60 group-hover:opacity-100 transition-opacity">
                            {!showArchived && <Button
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
                            </Button>}
                            {canManagePatients && (showArchived ? <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 px-2 text-xs"
                              onClick={() => onRestore(p)}
                              title="Khôi phục hồ sơ"
                            >
                              <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M3 12a9 9 0 101.76-5.37M3 4v5h5" />
                              </svg>
                            </Button> : <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 px-2 text-xs text-destructive hover:text-destructive"
                              onClick={() => onArchive(p)}
                              title="Lưu trữ hồ sơ"
                            >
                              <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                              </svg>
                            </Button>)}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
              </div>
              <Pagination page={page} pageSize={DEFAULT_PAGE_SIZE} total={total} disabled={loading} onPageChange={setPage} />
            </>
          )}
        </CardContent>
      </Card>

      <PatientForm open={openForm} onOpenChange={(v) => { if (!v) setEditPatient(undefined); setOpenForm(v); }} patient={editPatient} onSaved={() => load(search, page, { gender: filterGender, marketingSource: filterSource, hasAppointmentToday: filterTodayAppt, hasDebt: filterDebt, hasActiveTreatment: filterTreatment })} />
    </PageContainer>
  );
}
