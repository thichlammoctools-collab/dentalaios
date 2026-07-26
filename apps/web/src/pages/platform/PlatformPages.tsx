import { FormEvent, useEffect, useState, type ReactNode } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import type { PlatformAiBenchmarkCase, PlatformAiModelConfig, PlatformAiModelMetric, PlatformAiRollout, PlatformAuditLog, PlatformContent, PlatformDashboardSnapshot, PlatformFeatureFlag, PlatformTenantDetail, PlatformTenantSummary, PlatformUser, ProcedureCatalogItem } from "@shared/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogBody, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { PlatformApiError, platformGet, platformPatch, platformPost, platformPut } from "@/lib/platform-api";
import { usePlatformAuth } from "@/lib/platform-auth-context";

type TenantListResponse = { items: PlatformTenantSummary[]; next_cursor?: string };
type ItemsResponse<T> = { items: T[] };
type Admin = PlatformUser & { role: { key: string; name: string } };

function PageHeader({ title, description, action }: { title: string; description: string; action?: ReactNode }) {
  return <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"><div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#67e8f9]">Quản trị nền tảng</p><h1 className="mt-1 text-2xl font-semibold tracking-tight text-foreground">{title}</h1><p className="mt-1 max-w-3xl text-sm text-muted-foreground">{description}</p></div>{action}</div>;
}

function Page({ children }: { children: ReactNode }) { return <div className="mx-auto w-full max-w-[90rem] space-y-6 p-4 sm:p-7 lg:px-8 lg:py-8 2xl:px-10">{children}</div>; }
function ErrorNotice({ error }: { error: string | null }) { return error ? <div role="alert" className="rounded-lg border border-[#7f3448] bg-[#401e29] px-3 py-2 text-sm text-[#fda4af]">{error}</div> : null; }
function Loading({ label = "Đang tải dữ liệu..." }: { label?: string }) { return <div className="grid min-h-48 place-items-center text-sm text-muted-foreground">{label}</div>; }
function formatDate(value?: string | null) { return value ? new Intl.DateTimeFormat("vi-VN", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)) : "--"; }
function Status({ active }: { active: boolean }) { return <span className={active ? "inline-flex items-center gap-1.5 rounded-full bg-[#10382d] px-2 py-1 text-xs font-medium text-[#86efac]" : "inline-flex items-center gap-1.5 rounded-full bg-[#233044] px-2 py-1 text-xs font-medium text-[#c9d5e5]"}><span aria-hidden="true" className={active ? "h-1.5 w-1.5 rounded-full bg-[#4ade80]" : "h-1.5 w-1.5 rounded-full bg-[#94a3b8]"} />{active ? "Hoạt động" : "Tạm ngưng"}</span>; }

function flagLabel(key: string): string {
  const labels: Record<string, string> = {
    "clinical_copilot.endodontic_pain_v1": "Clinical Copilot: Đau răng / nội nha",
  };
  return labels[key] ?? key;
}

export function PlatformDashboardPage() {
  const [range, setRange] = useState(30);
  const [data, setData] = useState<PlatformDashboardSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { void platformGet<PlatformDashboardSnapshot>(`/api/platform/dashboard?range=${range}`).then(setData).catch((cause) => setError(cause instanceof PlatformApiError ? cause.message : "Không thể tải dashboard")); }, [range]);
  const metrics = data ? [["Tenant hoạt động", data.active_tenants, "normal"], ["Tenant tạm ngưng", data.suspended_tenants, "muted"], ["Tenant mới", data.new_tenants, "normal"], ["Người dùng hoạt động", data.active_users, "normal"], ["Chi nhánh", data.branches, "normal"], ["Tích hợp cần chú ý", data.unhealthy_integrations, "attention"]] : [];
  return <Page><PageHeader title="Tổng quan nền tảng" description="Chỉ số tổng hợp xuyên tenant, không hiển thị dữ liệu bệnh nhân hoặc dữ liệu lâm sàng." action={<Select aria-label="Khoảng thời gian dashboard" value={range} onChange={(event) => setRange(Number(event.target.value))} className="w-36"><option value={7}>7 ngày</option><option value={30}>30 ngày</option><option value={90}>90 ngày</option></Select>} /><ErrorNotice error={error} />{!data && !error ? <Loading /> : <><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{metrics.map(([label, value, tone]) => <Card key={String(label)} className={tone === "attention" && Number(value) > 0 ? "border-[#7a5b1a]" : ""}><CardContent className="p-5"><div className="flex items-start justify-between gap-3"><p className="text-sm text-muted-foreground">{label}</p>{tone === "attention" && Number(value) > 0 ? <span className="rounded-full bg-[#3a2b12] px-2 py-0.5 text-xs font-medium text-[#fbbf24]">Cần xử lý</span> : null}</div><p className="mt-2 text-3xl font-semibold tabular-nums text-foreground">{new Intl.NumberFormat("vi-VN").format(Number(value))}</p></CardContent></Card>)}</div><Card className="border-[#2b405e]"><CardHeader><CardTitle>Tín hiệu vận hành</CardTitle><CardDescription>Cập nhật {formatDate(data?.generated_at)}. Các chỉ số sức khỏe chỉ chứa trạng thái tổng hợp đã được làm sạch.</CardDescription></CardHeader><CardContent className="grid gap-3 sm:grid-cols-3"><Link className="rounded-lg border border-border bg-[#0d1526] p-4 text-sm font-medium text-foreground transition-colors hover:border-[#16c7e5] hover:bg-[#16233a] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#22d3ee]" to="/platform/tenants">Kiểm tra danh sách tenant</Link><Link className="rounded-lg border border-border bg-[#0d1526] p-4 text-sm font-medium text-foreground transition-colors hover:border-[#16c7e5] hover:bg-[#16233a] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#22d3ee]" to="/platform/configuration">Kiểm tra cấu hình và tích hợp</Link><Link className="rounded-lg border border-border bg-[#0d1526] p-4 text-sm font-medium text-foreground transition-colors hover:border-[#16c7e5] hover:bg-[#16233a] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#22d3ee]" to="/platform/audit-logs">Xem nhật ký quản trị</Link></CardContent></Card></>}</Page>;
}

export function PlatformTenantsPage() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [data, setData] = useState<TenantListResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState({ name: "", slug: "", admin_email: "", admin_password: "" });
  const [showAdminPassword, setShowAdminPassword] = useState(false);
  const { hasPermission } = usePlatformAuth();
  const query = params.toString();
  const load = () => void platformGet<TenantListResponse>(`/api/platform/tenants?${query}`).then(setData).catch((cause) => setError(cause instanceof PlatformApiError ? cause.message : "Không thể tải tenant"));
  useEffect(load, [query]);
  async function create(event: FormEvent) { event.preventDefault(); try { const created = await platformPost<PlatformTenantSummary>("/api/platform/tenants", { name: form.name, ...(form.slug ? { slug: form.slug } : {}), admin_email: form.admin_email, admin_password: form.admin_password }); setCreateOpen(false); setShowAdminPassword(false); setForm({ name: "", slug: "", admin_email: "", admin_password: "" }); navigate(`/platform/tenants/${created.id}`); } catch (cause) { setError(cause instanceof PlatformApiError ? cause.message : "Không thể tạo tenant"); } }
  return <Page><PageHeader title="Phòng khám" description="Quản lý vòng đời tenant và chỉ số vận hành tổng hợp." action={hasPermission("platform_tenants.write") ? <Button onClick={() => setCreateOpen(true)}>Tạo tenant</Button> : undefined} /><ErrorNotice error={error} /><div className="flex flex-col gap-3 sm:flex-row"><Input placeholder="Tìm theo tên hoặc slug" value={params.get("q") ?? ""} onChange={(event) => { const next = new URLSearchParams(params); event.target.value ? next.set("q", event.target.value) : next.delete("q"); setParams(next); }} /><Select value={params.get("status") ?? ""} onChange={(event) => { const next = new URLSearchParams(params); event.target.value ? next.set("status", event.target.value) : next.delete("status"); setParams(next); }} className="w-44"><option value="">Mọi trạng thái</option><option value="active">Hoạt động</option><option value="suspended">Tạm ngưng</option></Select></div>{!data ? <Loading /> : <Card><CardContent className="p-0"><div className="overflow-x-auto"><table className="w-full min-w-[720px] text-sm"><thead className="border-b bg-slate-50 text-left text-slate-500"><tr><th className="p-3">Tenant</th><th className="p-3">Trạng thái</th><th className="p-3 text-right">Người dùng</th><th className="p-3 text-right">Chi nhánh</th><th className="p-3">Tích hợp</th><th className="p-3" /></tr></thead><tbody>{data.items.map((item) => <tr className="border-b last:border-0" key={item.id}><td className="p-3"><p className="font-medium">{item.name}</p><p className="font-mono text-xs text-slate-500">{item.slug ?? item.id}</p></td><td className="p-3"><Status active={item.is_active} /></td><td className="p-3 text-right">{item.user_count}</td><td className="p-3 text-right">{item.branch_count}</td><td className="p-3 capitalize text-slate-600">{item.integration_health}</td><td className="p-3 text-right"><Link to={`/platform/tenants/${item.id}`} className="text-cyan-700 hover:underline">Mở</Link></td></tr>)}{data.items.length === 0 && <tr><td className="p-8 text-center text-slate-500" colSpan={6}>Không tìm thấy tenant.</td></tr>}</tbody></table></div></CardContent></Card>}<Dialog open={createOpen} onOpenChange={setCreateOpen}><form onSubmit={create}><DialogHeader><DialogTitle>Tạo tenant</DialogTitle></DialogHeader><DialogBody className="space-y-4"><div className="space-y-2"><Label htmlFor="tenant-name">Tên phòng khám</Label><Input id="tenant-name" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required /></div><div className="space-y-2"><Label htmlFor="tenant-slug">Slug (không bắt buộc)</Label><Input id="tenant-slug" value={form.slug} onChange={(event) => setForm({ ...form, slug: event.target.value.toLowerCase() })} pattern="[-a-z0-9]+" /></div><div className="border-t border-border pt-4"><p className="text-sm font-medium">Tài khoản quản trị đầu tiên</p><p className="mt-1 text-xs text-muted-foreground">Tài khoản này có quyền Quản trị viên cho tenant mới.</p></div><div className="space-y-2"><Label htmlFor="tenant-admin-email">Email quản trị</Label><Input id="tenant-admin-email" type="email" autoComplete="email" value={form.admin_email} onChange={(event) => setForm({ ...form, admin_email: event.target.value })} required /></div><div className="space-y-2"><Label htmlFor="tenant-admin-password">Mật khẩu thiết lập</Label><div className="relative"><Input id="tenant-admin-password" type={showAdminPassword ? "text" : "password"} autoComplete="new-password" minLength={14} value={form.admin_password} onChange={(event) => setForm({ ...form, admin_password: event.target.value })} className="pr-10" required /><button type="button" onClick={() => setShowAdminPassword((visible) => !visible)} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label={showAdminPassword ? "Ẩn mật khẩu" : "Hiện mật khẩu"} aria-pressed={showAdminPassword}>{showAdminPassword ? <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" /><path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68" /><path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61" /><line x1="2" x2="22" y1="2" y2="22" /></svg> : <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" /><circle cx="12" cy="12" r="3" /></svg>}</button></div><p className="text-xs text-muted-foreground">Tối thiểu 14 ký tự. Mật khẩu không được hiển thị hoặc lưu lại sau khi tạo.</p></div></DialogBody><DialogFooter><Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>Hủy</Button><Button type="submit">Tạo tenant</Button></DialogFooter></form></Dialog></Page>;
}

export function PlatformTenantDetailPage() {
  const { id = "" } = useParams(); const navigate = useNavigate(); const [data, setData] = useState<PlatformTenantDetail | null>(null); const [error, setError] = useState<string | null>(null); const [reason, setReason] = useState(""); const [confirm, setConfirm] = useState(false); const { hasPermission } = usePlatformAuth();
  const load = () => void platformGet<PlatformTenantDetail>(`/api/platform/tenants/${id}`).then(setData).catch((cause) => setError(cause instanceof PlatformApiError ? cause.message : "Không thể tải tenant")); useEffect(load, [id]);
  async function changeLifecycle() { if (!data) return; try { await platformPost(`/api/platform/tenants/${id}/${data.is_active ? "suspend" : "activate"}`, { reason }); setConfirm(false); setReason(""); load(); } catch (cause) { setError(cause instanceof PlatformApiError ? cause.message : "Không thể thay đổi trạng thái"); } }
  return <Page><Button variant="ghost" onClick={() => navigate("/platform/tenants")}>← Danh sách tenant</Button><PageHeader title={data?.name ?? "Tenant"} description="Hồ sơ vận hành an toàn, không có PII hay hồ sơ lâm sàng." action={data ? <Status active={data.is_active} /> : undefined} /><ErrorNotice error={error} />{!data ? <Loading /> : <><div className="grid gap-4 lg:grid-cols-3"><Card><CardHeader><CardTitle>Vận hành</CardTitle></CardHeader><CardContent className="space-y-2 text-sm"><p>Slug: <code>{data.slug ?? "--"}</code></p><p>Người dùng: {data.user_count}</p><p>Chi nhánh: {data.branch_count}</p><p>Tạo lúc: {formatDate(data.created_at)}</p></CardContent></Card><Card><CardHeader><CardTitle>Giới hạn</CardTitle></CardHeader><CardContent className="space-y-2 text-sm"><p>Người dùng tối đa: {data.limits?.max_users ?? "Chưa cấu hình"}</p><p>Chi nhánh tối đa: {data.limits?.max_branches ?? "Chưa cấu hình"}</p><p>Dung lượng: {data.limits ? `${Math.round(data.limits.storage_quota_bytes / 1_000_000)} MB` : "Chưa cấu hình"}</p></CardContent></Card><Card><CardHeader><CardTitle>Vòng đời</CardTitle><CardDescription>Tạm ngưng sẽ chặn phiên đăng nhập của tenant, không xóa dữ liệu.</CardDescription></CardHeader><CardContent>{hasPermission("platform_tenants.write") && <Button variant={data.is_active ? "destructive" : "default"} onClick={() => setConfirm(true)}>{data.is_active ? "Tạm ngưng tenant" : "Kích hoạt tenant"}</Button>}</CardContent></Card></div><Card><CardHeader><CardTitle>Feature flags</CardTitle></CardHeader><CardContent className="space-y-2">{data.flags.length ? data.flags.map((flag) => <div className="flex items-center justify-between rounded-lg border p-3 text-sm" key={flag.key}><div><p className="font-medium">{flag.key}</p><p className="text-slate-500">{flag.description}</p></div><span className={flag.enabled ? "text-emerald-700" : "text-slate-500"}>{flag.enabled ? "Bật" : "Tắt"}{flag.overridden ? " (override)" : ""}</span></div>) : <p className="text-sm text-slate-500">Chưa có feature flag.</p>}</CardContent></Card><Card><CardHeader><CardTitle>Tích hợp</CardTitle></CardHeader><CardContent>{data.integrations.length ? data.integrations.map((item) => <div key={`${item.provider}-${item.tenant_id}`} className="flex justify-between border-b py-2 text-sm last:border-0"><span>{item.provider}</span><span className="capitalize text-slate-600">{item.health_status}</span></div>) : <p className="text-sm text-slate-500">Chưa có metadata tích hợp.</p>}</CardContent></Card></>}<Dialog open={confirm} onOpenChange={setConfirm}><DialogHeader><DialogTitle>{data?.is_active ? "Tạm ngưng tenant" : "Kích hoạt tenant"}</DialogTitle></DialogHeader><DialogBody className="space-y-3"><p className="text-sm text-slate-600">Nhập lý do để xác nhận. Hành động này được audit và yêu cầu MFA gần đây.</p><Textarea value={reason} onChange={(event) => setReason(event.target.value)} required /></DialogBody><DialogFooter><Button variant="outline" onClick={() => setConfirm(false)}>Hủy</Button><Button variant={data?.is_active ? "destructive" : "default"} disabled={!reason.trim()} onClick={() => void changeLifecycle()}>Xác nhận</Button></DialogFooter></Dialog></Page>;
}

export function PlatformContentPage() {
  const [items, setItems] = useState<PlatformContent[]>([]); const [error, setError] = useState<string | null>(null); const [open, setOpen] = useState(false); const [form, setForm] = useState({ title: "", body_markdown: "", kind: "announcement", audience: "global", status: "draft" }); const { hasPermission } = usePlatformAuth();
  const load = () => void platformGet<ItemsResponse<PlatformContent>>("/api/platform/content").then((result) => setItems(result.items)).catch((cause) => setError(cause instanceof PlatformApiError ? cause.message : "Không thể tải nội dung")); useEffect(load, []);
  async function create(event: FormEvent) { event.preventDefault(); try { await platformPost("/api/platform/content", form); setOpen(false); setForm({ title: "", body_markdown: "", kind: "announcement", audience: "global", status: "draft" }); load(); } catch (cause) { setError(cause instanceof PlatformApiError ? cause.message : "Không thể tạo nội dung"); } }
  return <Page><PageHeader title="Nội dung vận hành" description="Thông báo trong ứng dụng và bài viết trợ giúp. Không phải CMS marketing." action={hasPermission("platform_content.write") ? <Button onClick={() => setOpen(true)}>Tạo nội dung</Button> : undefined} /><ErrorNotice error={error} /><Card><CardContent className="p-0"><div className="overflow-x-auto"><table className="w-full min-w-[700px] text-sm"><thead className="border-b bg-slate-50 text-left text-slate-500"><tr><th className="p-3">Tiêu đề</th><th className="p-3">Loại</th><th className="p-3">Phạm vi</th><th className="p-3">Trạng thái</th><th className="p-3">Cập nhật</th></tr></thead><tbody>{items.map((item) => <tr className="border-b" key={item.id}><td className="p-3 font-medium">{item.title}</td><td className="p-3">{item.kind === "announcement" ? "Thông báo" : "Trợ giúp"}</td><td className="p-3">{item.audience === "global" ? "Toàn cục" : "Theo tenant"}</td><td className="p-3 capitalize">{item.status}</td><td className="p-3 text-slate-500">{formatDate(item.updated_at)}</td></tr>)}{items.length === 0 && <tr><td colSpan={5} className="p-8 text-center text-slate-500">Chưa có nội dung.</td></tr>}</tbody></table></div></CardContent></Card><Dialog open={open} onOpenChange={setOpen}><form onSubmit={create}><DialogHeader><DialogTitle>Tạo nội dung vận hành</DialogTitle></DialogHeader><DialogBody className="space-y-4"><div className="space-y-2"><Label>Tiêu đề</Label><Input value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} required /></div><div className="grid grid-cols-2 gap-3"><Select value={form.kind} onChange={(event) => setForm({ ...form, kind: event.target.value })}><option value="announcement">Thông báo</option><option value="help_article">Trợ giúp</option></Select><Select value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value })}><option value="draft">Bản nháp</option><option value="published">Xuất bản</option></Select></div><div className="space-y-2"><Label>Nội dung Markdown</Label><Textarea value={form.body_markdown} onChange={(event) => setForm({ ...form, body_markdown: event.target.value })} className="min-h-40" required /></div></DialogBody><DialogFooter><Button type="button" variant="outline" onClick={() => setOpen(false)}>Hủy</Button><Button type="submit">Lưu</Button></DialogFooter></form></Dialog></Page>;
}

export function PlatformConfigurationPage() {
  const [flags, setFlags] = useState<PlatformFeatureFlag[]>([]);
  const [aiConfigs, setAiConfigs] = useState<PlatformAiModelConfig[]>([]);
  const [aiMetrics, setAiMetrics] = useState<PlatformAiModelMetric[]>([]);
  const [aiRollouts, setAiRollouts] = useState<PlatformAiRollout[]>([]);
  const [benchmarkCases, setBenchmarkCases] = useState<PlatformAiBenchmarkCase[]>([]);
  const [lastBenchmarkResult, setLastBenchmarkResult] = useState<{ id: string; output: string } | null>(null);
  const [benchmarkReview, setBenchmarkReview] = useState({ score: 5, note: "" });
  const [error, setError] = useState<string | null>(null);
  const [selectedFlagKey, setSelectedFlagKey] = useState("");
  const [rolloutForm, setRolloutForm] = useState({ use_case: "", candidate_model_id: "", traffic_percent: 0, status: "draft" as "draft" | "pending_approval" });
  const [benchmarkForm, setBenchmarkForm] = useState({ use_case: "", label: "", prompt: "", expected_output: "", is_deidentified: false });
  const { hasPermission } = usePlatformAuth();

  const load = () => {
    void Promise.all([
      platformGet<ItemsResponse<PlatformFeatureFlag>>("/api/platform/feature-flags"),
      platformGet<ItemsResponse<PlatformAiModelConfig>>("/api/platform/ai-model-configs"),
      platformGet<ItemsResponse<PlatformAiModelMetric>>("/api/platform/ai-model-metrics"),
      platformGet<ItemsResponse<PlatformAiRollout>>("/api/platform/ai-rollouts"),
      platformGet<ItemsResponse<PlatformAiBenchmarkCase>>("/api/platform/ai-benchmark-cases"),
    ])
      .then(([flagsResult, aiResult, metricsResult, rolloutsResult, benchmarksResult]) => {
        setFlags(flagsResult.items);
        setAiConfigs(aiResult.items);
        setAiMetrics(metricsResult.items);
        setAiRollouts(rolloutsResult.items);
        setBenchmarkCases(benchmarksResult.items);
      })
      .catch((cause) => setError(cause instanceof PlatformApiError ? cause.message : "Không thể tải cấu hình"));
  };

  useEffect(load, []);

  async function updateFlag(flag: PlatformFeatureFlag, enabled: boolean) {
    try {
      await platformPut("/api/platform/feature-flags", { key: flag.key, description: flag.description, default_enabled: enabled });
      load();
    } catch (cause) {
      setError(cause instanceof PlatformApiError ? cause.message : "Không thể lưu feature flag");
    }
  }

  async function saveAiConfig(config: PlatformAiModelConfig, modelId: string, isEnabled: boolean) {
    try {
      await platformPut("/api/platform/ai-model-configs", {
        application_key: config.application_key,
        use_case: config.use_case,
        model_id: modelId,
        is_enabled: isEnabled,
      });
      load();
    } catch (cause) {
      setError(cause instanceof PlatformApiError ? cause.message : "Không thể lưu cấu hình AI");
    }
  }

  const rolloutConfig = aiConfigs.find((config) => config.use_case === rolloutForm.use_case);

  async function saveRollout(event: FormEvent) {
    event.preventDefault();
    try {
      await platformPut("/api/platform/ai-rollouts", rolloutForm);
      setRolloutForm({ use_case: "", candidate_model_id: "", traffic_percent: 0, status: "draft" });
      load();
    } catch (cause) {
      setError(cause instanceof PlatformApiError ? cause.message : "Không thể lưu A/B rollout");
    }
  }

  async function approveRollout(useCase: string, status: "approved" | "active" | "paused") {
    try {
      await platformPost(`/api/platform/ai-rollouts/${encodeURIComponent(useCase)}/approve`, { status });
      load();
    } catch (cause) {
      setError(cause instanceof PlatformApiError ? cause.message : "Không thể cập nhật trạng thái rollout");
    }
  }

  async function createBenchmarkCase(event: FormEvent) {
    event.preventDefault();
    try {
      await platformPost("/api/platform/ai-benchmark-cases", benchmarkForm);
      setBenchmarkForm({ use_case: "", label: "", prompt: "", expected_output: "", is_deidentified: false });
      load();
    } catch (cause) {
      setError(cause instanceof PlatformApiError ? cause.message : "Không thể tạo benchmark case");
    }
  }

  async function evaluateBenchmarkCase(id: string, modelId: string) {
    try {
      const result = await platformPost<{ id: string; output: string }>(`/api/platform/ai-benchmark-cases/${encodeURIComponent(id)}/evaluate`, { model_id: modelId });
      setLastBenchmarkResult(result);
    } catch (cause) {
      setError(cause instanceof PlatformApiError ? cause.message : "Không thể chạy benchmark");
    }
  }

  async function reviewBenchmarkResult() {
    if (!lastBenchmarkResult) return;
    try {
      await platformPost(`/api/platform/ai-benchmark-evaluations/${encodeURIComponent(lastBenchmarkResult.id)}/review`, { reviewer_score: benchmarkReview.score, ...(benchmarkReview.note ? { reviewer_note: benchmarkReview.note } : {}) });
      setLastBenchmarkResult(null);
      setBenchmarkReview({ score: 5, note: "" });
    } catch (cause) {
      setError(cause instanceof PlatformApiError ? cause.message : "Không thể lưu đánh giá benchmark");
    }
  }

  function AiGuidanceCard({ configs }: { configs: PlatformAiModelConfig[] }) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Hướng dẫn sử dụng AI</CardTitle>
          <CardDescription>
            Tham chiếu vận hành cho từng tác vụ AI. Nhân sự chuyên môn phải thực hiện ghi chú rà soát trước khi sử dụng kết quả.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[940px] text-sm">
              <thead className="border-b bg-slate-50 text-left text-slate-500">
                <tr>
                  <th className="p-3">Tác vụ</th>
                  <th className="p-3">Mô hình mặc định</th>
                  <th className="p-3">Mục đích</th>
                  <th className="p-3">Ghi chú rà soát bắt buộc</th>
                </tr>
              </thead>
              <tbody>
                {configs.map((config) => {
                  const defaultModel = config.allowed_models.find((model) => model.id === config.default_model_id);

                  return (
                    <tr className="border-b align-top last:border-0" key={config.use_case}>
                      <td className="p-3">
                        <p className="font-medium">{config.name}</p>
                        <p className="mt-1 font-mono text-xs text-muted-foreground">{config.use_case}</p>
                      </td>
                      <td className="p-3">{defaultModel?.name ?? config.default_model_id}</td>
                      <td className="p-3">
                        <p>{config.guidance || "Chưa có hướng dẫn mục đích."}</p>
                        {config.recommendation && <p className="mt-1 text-xs text-muted-foreground">Khuyến nghị: {config.recommendation}</p>}
                      </td>
                      <td className="p-3">
                        <p className="font-medium text-amber-700">Bắt buộc</p>
                        <p className="mt-1">{config.review_note || "Cần nhân sự chuyên môn rà soát kết quả AI."}</p>
                      </td>
                    </tr>
                  );
                })}
                {configs.length === 0 && (
                  <tr>
                    <td className="p-8 text-center text-muted-foreground" colSpan={4}>Chưa tải được hướng dẫn mô hình AI.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Page>
      <PageHeader
        title="Cấu hình nền tảng"
        description="Feature flag, metadata tích hợp và mô hình AI. API key và secrets chỉ quản lý qua Cloudflare/Wrangler."
      />
      <ErrorNotice error={error} />
      <AiGuidanceCard configs={aiConfigs} />
      <Card>
        <CardHeader>
          <CardTitle>A/B rollout mô hình AI</CardTitle>
          <CardDescription>Điều phối thử nghiệm theo tác vụ. Không dùng dữ liệu bệnh nhân trong cấu hình hoặc đánh giá rollout.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {aiRollouts.length ? <div className="space-y-2">{aiRollouts.map((rollout) => {
            const config = aiConfigs.find((item) => item.use_case === rollout.use_case);
            const modelName = config?.allowed_models.find((model) => model.id === rollout.candidate_model_id)?.name ?? rollout.candidate_model_id;
            return <div className="flex flex-col gap-3 rounded-lg border p-3 text-sm sm:flex-row sm:items-center sm:justify-between" key={rollout.use_case}><div><p className="font-medium">{config?.name ?? rollout.use_case}</p><p className="mt-1 text-muted-foreground">Ứng viên: {modelName} · Lưu lượng: {rollout.traffic_percent}% · Trạng thái: {rollout.status}</p></div>{hasPermission("platform_ai_approve.write") ? <Select aria-label={`Trạng thái rollout ${rollout.use_case}`} value={rollout.status} onChange={(event) => void approveRollout(rollout.use_case, event.target.value as "approved" | "active" | "paused")} className="w-44"><option value="approved">Đã duyệt</option><option value="active">Đang hoạt động</option><option value="paused">Tạm dừng</option></Select> : null}</div>;
          })}</div> : <p className="text-sm text-muted-foreground">Chưa có A/B rollout nào.</p>}
          {hasPermission("platform_ai_evaluate.write") && <form className="grid gap-3 rounded-lg border border-dashed p-4 md:grid-cols-2" onSubmit={saveRollout}>
            <div className="space-y-2"><Label>Tác vụ AI</Label><Select value={rolloutForm.use_case} onChange={(event) => setRolloutForm({ ...rolloutForm, use_case: event.target.value, candidate_model_id: "" })} required><option value="">Chọn tác vụ</option>{aiConfigs.map((config) => <option key={config.use_case} value={config.use_case}>{config.name}</option>)}</Select></div>
            <div className="space-y-2"><Label>Mô hình ứng viên</Label><Select value={rolloutForm.candidate_model_id} disabled={!rolloutConfig} onChange={(event) => setRolloutForm({ ...rolloutForm, candidate_model_id: event.target.value })} required><option value="">Chọn mô hình tương thích</option>{rolloutConfig?.allowed_models.map((model) => <option key={model.id} value={model.id}>{model.name}</option>)}</Select></div>
            <div className="space-y-2"><Label>Lưu lượng (%)</Label><Input type="number" min={0} max={100} step={1} value={rolloutForm.traffic_percent} onChange={(event) => setRolloutForm({ ...rolloutForm, traffic_percent: Number(event.target.value) })} required /></div>
            <div className="space-y-2"><Label>Trạng thái yêu cầu</Label><Select value={rolloutForm.status} onChange={(event) => setRolloutForm({ ...rolloutForm, status: event.target.value as "draft" | "pending_approval" })}><option value="draft">Bản nháp</option><option value="pending_approval">Chờ duyệt</option></Select></div>
            <div className="md:col-span-2"><Button type="submit">Lưu A/B rollout</Button></div>
          </form>}
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>Benchmark AI đã khử định danh</CardTitle><CardDescription>Chỉ tạo prompt và kết quả mong đợi đã khử định danh. Không nhập dữ liệu bệnh nhân, PII hoặc hồ sơ lâm sàng có thể nhận diện.</CardDescription></CardHeader>
        <CardContent className="space-y-4">
          {benchmarkCases.length ? <div className="space-y-2">{benchmarkCases.map((benchmark) => { const config = aiConfigs.find((item) => item.use_case === benchmark.use_case); return <div className="flex flex-col gap-3 rounded-lg border p-3 text-sm sm:flex-row sm:items-center sm:justify-between" key={benchmark.id}><div><p className="font-medium">{benchmark.label}</p><p className="mt-1 text-xs text-muted-foreground">{config?.name ?? benchmark.use_case} · Khử định danh: {benchmark.is_deidentified ? "Đã xác nhận" : "Không"}</p></div>{hasPermission("platform_ai_evaluate.write") ? <Select aria-label={`Chạy benchmark ${benchmark.label}`} defaultValue="" onChange={(event) => { if (event.target.value) void evaluateBenchmarkCase(benchmark.id, event.target.value); }} className="w-56"><option value="">Chạy với model...</option>{config?.allowed_models.map((model) => <option key={model.id} value={model.id}>{model.name}</option>)}</Select> : null}</div>; })}</div> : <p className="text-sm text-muted-foreground">Chưa có benchmark case.</p>}
          {lastBenchmarkResult && <div className="space-y-3 rounded-lg border border-amber-400/50 bg-amber-50/50 p-4"><div><p className="font-medium">Kết quả benchmark chờ reviewer chấm điểm</p><pre className="mt-2 max-h-56 overflow-auto whitespace-pre-wrap rounded border bg-background p-3 text-xs">{lastBenchmarkResult.output || "(Model không trả nội dung)"}</pre></div>{hasPermission("platform_ai_evaluate.write") && <div className="grid gap-3 md:grid-cols-[10rem_minmax(0,1fr)_auto]"><Input type="number" min={0} max={5} value={benchmarkReview.score} onChange={(event) => setBenchmarkReview({ ...benchmarkReview, score: Number(event.target.value) })} aria-label="Điểm reviewer từ 0 đến 5" /><Input value={benchmarkReview.note} maxLength={1000} placeholder="Nhận xét reviewer (không chứa dữ liệu bệnh nhân)" onChange={(event) => setBenchmarkReview({ ...benchmarkReview, note: event.target.value })} /><Button onClick={() => void reviewBenchmarkResult()}>Lưu đánh giá</Button></div>}</div>}
          {hasPermission("platform_ai_evaluate.write") && <form className="grid gap-3 rounded-lg border border-dashed p-4" onSubmit={createBenchmarkCase}>
            <div className="space-y-2"><Label>Tác vụ AI</Label><Select value={benchmarkForm.use_case} onChange={(event) => setBenchmarkForm({ ...benchmarkForm, use_case: event.target.value })} required><option value="">Chọn tác vụ</option>{aiConfigs.map((config) => <option key={config.use_case} value={config.use_case}>{config.name}</option>)}</Select></div>
            <div className="space-y-2"><Label>Nhãn</Label><Input value={benchmarkForm.label} maxLength={120} onChange={(event) => setBenchmarkForm({ ...benchmarkForm, label: event.target.value })} required /></div>
            <div className="space-y-2"><Label>Prompt đã khử định danh</Label><Textarea value={benchmarkForm.prompt} minLength={10} onChange={(event) => setBenchmarkForm({ ...benchmarkForm, prompt: event.target.value })} required /></div>
            <div className="space-y-2"><Label>Kết quả mong đợi</Label><Textarea value={benchmarkForm.expected_output} minLength={2} onChange={(event) => setBenchmarkForm({ ...benchmarkForm, expected_output: event.target.value })} required /></div>
            <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={benchmarkForm.is_deidentified} onChange={(event) => setBenchmarkForm({ ...benchmarkForm, is_deidentified: event.target.checked })} required /><span>Tôi xác nhận nội dung này đã được khử định danh và không chứa dữ liệu bệnh nhân.</span></label>
            <div><Button type="submit">Tạo benchmark case</Button></div>
          </form>}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Theo dõi độ tin cậy AI</CardTitle>
          <CardDescription>Thống kê 30 ngày gần nhất theo model, chỉ lưu số liệu tổng hợp. Không lưu prompt, kết quả hoặc dữ liệu bệnh nhân.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead className="border-b bg-slate-50 text-left text-slate-500">
                <tr><th className="p-3">Tác vụ</th><th className="p-3">Model</th><th className="p-3 text-right">Lần gọi</th><th className="p-3 text-right">Thành công</th><th className="p-3 text-right">Fallback</th><th className="p-3 text-right">Độ trễ TB</th><th className="p-3 text-right">Token vào/ra</th><th className="p-3 text-right">Chi phí ước tính</th></tr>
              </thead>
              <tbody>
                {aiMetrics.map((metric) => {
                  const config = aiConfigs.find((item) => item.use_case === metric.use_case);
                  const modelName = config?.allowed_models.find((model) => model.id === metric.model_id)?.name ?? metric.model_id;
                  const successRate = metric.attempts ? Math.round((metric.successes / metric.attempts) * 100) : 0;
                  return <tr className="border-b last:border-0" key={`${metric.use_case}:${metric.model_id}`}><td className="p-3 font-medium">{config?.name ?? metric.use_case}</td><td className="p-3">{modelName}</td><td className="p-3 text-right tabular-nums">{metric.attempts}</td><td className="p-3 text-right tabular-nums">{successRate}%</td><td className="p-3 text-right tabular-nums">{metric.fallback_uses}</td><td className="p-3 text-right tabular-nums">{metric.average_latency_ms} ms</td><td className="p-3 text-right tabular-nums">{metric.input_tokens.toLocaleString("vi-VN")} / {metric.output_tokens.toLocaleString("vi-VN")}</td><td className="p-3 text-right tabular-nums">${(metric.cost_microusd / 1_000_000).toLocaleString("en-US", { maximumFractionDigits: 4 })}</td></tr>;
                })}
                {aiMetrics.length === 0 && <tr><td className="p-8 text-center text-muted-foreground" colSpan={8}>Chưa có lượt gọi AI trong 30 ngày gần nhất.</td></tr>}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Mô hình AI theo ứng dụng</CardTitle>
          <CardDescription>
            Clinic Web dùng cấu hình theo từng tác vụ. Kết quả AI chỉ hỗ trợ nghiệp vụ và luôn cần nhân sự chuyên môn kiểm tra.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {aiConfigs.map((config) => (
            <div className="grid gap-3 rounded-lg border p-4 lg:grid-cols-[minmax(0,1fr)_15rem_auto] lg:items-center" key={config.use_case}>
              <div>
                <p className="font-medium">{config.name}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {config.modality === "vision" ? "Mô hình thị giác" : "Mô hình văn bản"} · {config.is_overridden ? "Đang dùng cấu hình tùy chỉnh" : "Đang dùng mô hình mặc định"}
                </p>
              </div>
              <Select
                aria-label={`Mô hình cho ${config.name}`}
                value={config.model_id}
                disabled={!hasPermission("platform_ai_config.write")}
                onChange={(event) => void saveAiConfig(config, event.target.value, config.is_enabled)}
              >
                {config.allowed_models.map((model) => <option key={model.id} value={model.id}>{model.name}</option>)}
              </Select>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={config.is_enabled}
                  disabled={!hasPermission("platform_ai_config.write")}
                  onChange={(event) => void saveAiConfig(config, config.model_id, event.target.checked)}
                />
                Bật
              </label>
            </div>
          ))}
          {aiConfigs.length === 0 && <p className="text-sm text-muted-foreground">Chưa tải được danh mục mô hình AI.</p>}
        </CardContent>
      </Card>
      <div className="grid gap-5 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle>Feature flags</CardTitle><CardDescription>Bật hoặc tắt tính năng có sẵn. Nên dùng override theo từng tenant cho các tính năng đang pilot.</CardDescription></CardHeader>
          <CardContent className="space-y-2">
            {flags.length ? flags.map((flag) => (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3 text-sm" key={flag.key}>
                <div>
                  <p className="font-medium">{flagLabel(flag.key)}</p>
                  <p className="text-slate-500">{flag.description}</p>
                </div>
                <div className="flex items-center gap-3"><Status active={flag.default_enabled} />{hasPermission("platform_config.write") && <Button size="sm" variant={flag.default_enabled ? "outline" : "default"} onClick={() => void updateFlag(flag, !flag.default_enabled)}>{flag.default_enabled ? "Tắt mặc định" : "Bật mặc định"}</Button>}</div>
              </div>
            )) : <p className="text-sm text-slate-500">Chưa có feature flag.</p>}
          </CardContent>
        </Card>
        {hasPermission("platform_config.write") && (
          <Card>
            <CardHeader><CardTitle>Chọn tính năng</CardTitle><CardDescription>Chọn một tính năng từ danh sách để xem mô tả và thay đổi trạng thái.</CardDescription></CardHeader>
            <CardContent>
              <div className="space-y-3">
                <Select aria-label="Chọn feature flag" value={selectedFlagKey} onChange={(event) => setSelectedFlagKey(event.target.value)}><option value="">Chọn tính năng</option>{flags.map((flag) => <option key={flag.key} value={flag.key}>{flagLabel(flag.key)}</option>)}</Select>
                {selectedFlagKey && (() => { const flag = flags.find((item) => item.key === selectedFlagKey); return flag ? <div className="rounded-lg border bg-muted/20 p-3 text-sm"><p className="font-medium">{flagLabel(flag.key)}</p><p className="mt-1 text-muted-foreground">{flag.description}</p><Button className="mt-3" size="sm" variant={flag.default_enabled ? "outline" : "default"} onClick={() => void updateFlag(flag, !flag.default_enabled)}>{flag.default_enabled ? "Tắt mặc định" : "Bật mặc định"}</Button></div> : null; })()}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </Page>
  );
}

export function PlatformProceduresPage() {
  const [items, setItems] = useState<ProcedureCatalogItem[]>([]); const [error, setError] = useState<string | null>(null); const [open, setOpen] = useState(false); const [editing, setEditing] = useState<ProcedureCatalogItem | null>(null); const [form, setForm] = useState({ code: "", name: "", sort_order: 0, is_active: true }); const { hasPermission } = usePlatformAuth();
  const load = () => void platformGet<ItemsResponse<ProcedureCatalogItem>>("/api/platform/procedures").then((result) => setItems(result.items)).catch((cause) => setError(cause instanceof PlatformApiError ? cause.message : "Không thể tải danh mục thủ thuật")); useEffect(load, []);
  function openCreate() { setEditing(null); setForm({ code: "", name: "", sort_order: 0, is_active: true }); setOpen(true); }
  function openEdit(item: ProcedureCatalogItem) { setEditing(item); setForm({ code: item.code, name: item.name, sort_order: item.sort_order, is_active: item.is_active }); setOpen(true); }
  async function save(event: FormEvent) { event.preventDefault(); try { if (editing) await platformPatch(`/api/platform/procedures/${encodeURIComponent(editing.code)}`, { name: form.name, sort_order: form.sort_order, is_active: form.is_active }); else await platformPost("/api/platform/procedures", form); setOpen(false); load(); } catch (cause) { setError(cause instanceof PlatformApiError ? cause.message : "Không thể lưu thủ thuật"); } }
  async function backfill() { try { await platformPost<{ imported: number }>("/api/platform/procedures/backfill"); load(); } catch (cause) { setError(cause instanceof PlatformApiError ? cause.message : "Không thể nạp thủ thuật hiện có"); } }
  return <Page><PageHeader title="Danh mục thủ thuật" description="Danh mục lâm sàng dùng chung cho tất cả tenant. Ngừng áp dụng sẽ giữ nguyên lịch sử nhưng không cho chọn trong dịch vụ mới." action={hasPermission("platform_procedures.write") ? <div className="flex gap-2"><Button variant="outline" onClick={() => void backfill()}>Nạp thủ thuật hiện có</Button><Button onClick={openCreate}>Thêm thủ thuật</Button></div> : undefined} /><ErrorNotice error={error} /><Card><CardContent className="p-0"><div className="overflow-x-auto"><table className="w-full min-w-[650px] text-sm"><thead className="border-b bg-slate-50 text-left text-slate-500"><tr><th className="p-3">Mã</th><th className="p-3">Tên thủ thuật</th><th className="p-3 text-right">Thứ tự</th><th className="p-3">Trạng thái</th>{hasPermission("platform_procedures.write") && <th className="p-3" />}</tr></thead><tbody>{items.map((item) => <tr className="border-b last:border-0" key={item.code}><td className="p-3 font-mono text-xs">{item.code}</td><td className="p-3 font-medium">{item.name}</td><td className="p-3 text-right tabular-nums">{item.sort_order}</td><td className="p-3"><Status active={item.is_active} /></td>{hasPermission("platform_procedures.write") && <td className="p-3 text-right"><Button size="sm" variant="outline" onClick={() => openEdit(item)}>Sửa</Button></td>}</tr>)}{items.length === 0 && <tr><td colSpan={5} className="p-8 text-center text-slate-500">Chưa có thủ thuật.</td></tr>}</tbody></table></div></CardContent></Card><Dialog open={open} onOpenChange={setOpen}><form onSubmit={save}><DialogHeader><DialogTitle>{editing ? "Cập nhật thủ thuật" : "Thêm thủ thuật"}</DialogTitle></DialogHeader><DialogBody className="space-y-4"><div className="space-y-2"><Label>Mã thủ thuật</Label><Input value={form.code} disabled={Boolean(editing)} placeholder="VD: orthodontics" pattern="[-_a-z0-9]+" onChange={(event) => setForm({ ...form, code: event.target.value.toLowerCase() })} required /><p className="text-xs text-muted-foreground">Mã không thay đổi sau khi tạo để bảo toàn dữ liệu lịch sử.</p></div><div className="space-y-2"><Label>Tên thủ thuật</Label><Input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required /></div><div className="space-y-2"><Label>Thứ tự hiển thị</Label><Input type="number" min="0" max="10000" value={form.sort_order} onChange={(event) => setForm({ ...form, sort_order: Number(event.target.value) })} required /></div><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.is_active} onChange={(event) => setForm({ ...form, is_active: event.target.checked })} />Đang áp dụng</label></DialogBody><DialogFooter><Button type="button" variant="outline" onClick={() => setOpen(false)}>Hủy</Button><Button type="submit">Lưu thủ thuật</Button></DialogFooter></form></Dialog></Page>;
}

export function PlatformAdminsPage() {
  const [items, setItems] = useState<Admin[]>([]); const [error, setError] = useState<string | null>(null); const [open, setOpen] = useState(false); const [form, setForm] = useState({ email: "", name: "", password: "", role_key: "platform_auditor" }); const { hasPermission } = usePlatformAuth();
  const load = () => void platformGet<ItemsResponse<Admin>>("/api/platform/admins").then((result) => setItems(result.items)).catch((cause) => setError(cause instanceof PlatformApiError ? cause.message : "Không thể tải Super Admin")); useEffect(load, []);
  async function create(event: FormEvent) { event.preventDefault(); try { await platformPost("/api/platform/admins", form); setOpen(false); setForm({ email: "", name: "", password: "", role_key: "platform_auditor" }); load(); } catch (cause) { setError(cause instanceof PlatformApiError ? cause.message : "Không thể tạo Super Admin"); } }
  return <Page><PageHeader title="Super Admin" description="Ba vai trò cố định: owner, operator và auditor. Thay đổi quyền yêu cầu MFA gần đây." action={hasPermission("platform_admins.write") ? <Button onClick={() => setOpen(true)}>Thêm Super Admin</Button> : undefined} /><ErrorNotice error={error} /><Card><CardContent className="p-0"><div className="overflow-x-auto"><table className="w-full min-w-[600px] text-sm"><thead className="border-b bg-slate-50 text-left text-slate-500"><tr><th className="p-3">Tên</th><th className="p-3">Vai trò</th><th className="p-3">MFA</th><th className="p-3">Trạng thái</th><th className="p-3">Đăng nhập gần nhất</th></tr></thead><tbody>{items.map((item) => <tr className="border-b" key={item.id}><td className="p-3 font-medium">{item.name}</td><td className="p-3">{item.role.name}</td><td className="p-3">{item.mfa_enabled ? "Đã bật" : "Chưa bật"}</td><td className="p-3"><Status active={item.is_active} /></td><td className="p-3 text-slate-500">{formatDate(item.last_login_at)}</td></tr>)}</tbody></table></div></CardContent></Card><Dialog open={open} onOpenChange={setOpen}><form onSubmit={create}><DialogHeader><DialogTitle>Thêm Super Admin</DialogTitle></DialogHeader><DialogBody className="space-y-3"><Input type="email" placeholder="Email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} required /><Input placeholder="Họ tên" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required /><Input type="password" minLength={14} placeholder="Mật khẩu tối thiểu 14 ký tự" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} required /><Select value={form.role_key} onChange={(event) => setForm({ ...form, role_key: event.target.value })}><option value="platform_owner">Platform owner</option><option value="platform_operator">Platform operator</option><option value="platform_auditor">Platform auditor</option></Select></DialogBody><DialogFooter><Button type="button" variant="outline" onClick={() => setOpen(false)}>Hủy</Button><Button type="submit">Tạo</Button></DialogFooter></form></Dialog></Page>;
}

export function PlatformAuditLogsPage() {
  const [items, setItems] = useState<PlatformAuditLog[]>([]); const [error, setError] = useState<string | null>(null); useEffect(() => { void platformGet<{ items: PlatformAuditLog[] }>("/api/platform/audit-logs?limit=100").then((result) => setItems(result.items)).catch((cause) => setError(cause instanceof PlatformApiError ? cause.message : "Không thể tải nhật ký")); }, []);
  return <Page><PageHeader title="Nhật ký nền tảng" description="Bản ghi append-only cho hành động quản trị, không chứa password, token, secret hoặc dữ liệu lâm sàng." /><ErrorNotice error={error} /><Card><CardContent className="p-0"><div className="overflow-x-auto"><table className="w-full min-w-[760px] text-sm"><thead className="border-b bg-slate-50 text-left text-slate-500"><tr><th className="p-3">Thời gian</th><th className="p-3">Action</th><th className="p-3">Đối tượng</th><th className="p-3">Tenant</th><th className="p-3">Kết quả</th></tr></thead><tbody>{items.map((item) => <tr className="border-b" key={item.id}><td className="p-3 text-slate-500">{formatDate(item.created_at)}</td><td className="p-3 font-mono text-xs">{item.action}</td><td className="p-3">{item.entity_type}</td><td className="p-3 font-mono text-xs">{item.tenant_id ?? "--"}</td><td className="p-3"><span className={item.result === "success" ? "text-emerald-700" : "text-red-700"}>{item.result}</span></td></tr>)}{items.length === 0 && <tr><td colSpan={5} className="p-8 text-center text-slate-500">Chưa có bản ghi.</td></tr>}</tbody></table></div></CardContent></Card></Page>;
}
