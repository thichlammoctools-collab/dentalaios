import { useEffect, useMemo, useState } from "react";
import { apiDelete, apiGet, apiPost, apiPut, ApiError } from "@/lib/api";
import { toast } from "@/lib/toast";
import { useAuth } from "@/lib/auth-context";
import { CurrencyInput } from "@/components/ui/currency-input";
import { Dialog, DialogBody, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type {
  ProcedureCatalogItem,
  TenantTreatmentServiceTemplate,
  TreatmentService,
  TreatmentServiceImportResult,
} from "@shared/types";
import { PERMISSIONS } from "@shared/constants";
import { DEFAULT_PAGE_SIZE, Pagination } from "@/components/ui/pagination";
import { PageContainer } from "@/components/PageContainer";

const EMPTY_SERVICE = {
  code: "",
  name: "",
  procedure: "filling",
  price: "" as number | "",
  estimated_duration_min: "" as number | "",
  is_active: true,
};

type ConflictMode = "skip" | "overwrite_metadata" | "overwrite_all";

interface ImportDraft {
  template_code: string;
  code: string;
  name: string;
  procedure: string;
  price: number;
  estimated_duration_min: number;
  on_conflict: ConflictMode;
  default_price: number;
  default_duration_min: number;
  default_procedure: string;
  default_name: string;
  already_imported: boolean;
}

export function TreatmentServicesPage() {
  const { session } = useAuth();
  const [services, setServices] = useState<TreatmentService[]>([]);
  const [procedures, setProcedures] = useState<ProcedureCatalogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_SERVICE);
  const [editingCode, setEditingCode] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [removingCode, setRemovingCode] = useState<string | null>(null);
  const [page, setPage] = useState(1);

  const [importOpen, setImportOpen] = useState(false);
  const [importStep, setImportStep] = useState<"pick" | "review">("pick");
  const [importLoading, setImportLoading] = useState(false);
  const [importBusy, setImportBusy] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [templates, setTemplates] = useState<TenantTreatmentServiceTemplate[]>([]);
  const [selectedTemplateCodes, setSelectedTemplateCodes] = useState<Set<string>>(new Set());
  const [drafts, setDrafts] = useState<Record<string, ImportDraft>>({});
  const [templateFilter, setTemplateFilter] = useState({ q: "", procedure: "" });

  const visibleServices = services.slice((page - 1) * DEFAULT_PAGE_SIZE, page * DEFAULT_PAGE_SIZE);
  const isAdmin = Boolean(
    session?.role.permissions.includes(PERMISSIONS.ALL) ||
      session?.role.permissions.includes(PERMISSIONS.MANAGE_USERS),
  );

  const filteredTemplates = useMemo(() => {
    const query = templateFilter.q.trim().toLowerCase();
    return templates.filter((tpl) => {
      if (templateFilter.procedure && tpl.procedure !== templateFilter.procedure) return false;
      if (query) {
        const haystack = `${tpl.code} ${tpl.name}`.toLowerCase();
        if (!haystack.includes(query)) return false;
      }
      return true;
    });
  }, [templates, templateFilter]);

  const selectedTemplates = useMemo(
    () => templates.filter((tpl) => selectedTemplateCodes.has(tpl.code)),
    [templates, selectedTemplateCodes],
  );

  useEffect(() => {
    void loadServices();
  }, []);

  async function loadServices() {
    setLoading(true);
    try {
      const [servicesResponse, proceduresResponse] = await Promise.all([
        apiGet<{ items: TreatmentService[] }>("/api/clinic/treatment-services"),
        apiGet<{ items: ProcedureCatalogItem[] }>("/api/clinic/procedures"),
      ]);
      setServices(servicesResponse.items);
      setPage((current) => Math.min(current, Math.max(1, Math.ceil(servicesResponse.items.length / DEFAULT_PAGE_SIZE))));
      setProcedures(proceduresResponse.items);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Lỗi tải dịch vụ điều trị");
    } finally {
      setLoading(false);
    }
  }

  async function openImport() {
    setImportOpen(true);
    setImportStep("pick");
    setImportError(null);
    setSelectedTemplateCodes(new Set());
    setDrafts({});
    setTemplateFilter({ q: "", procedure: "" });
    setImportLoading(true);
    try {
      const response = await apiGet<{ items: TenantTreatmentServiceTemplate[] }>(
        "/api/clinic/treatment-service-templates",
      );
      setTemplates(response.items);
    } catch (err) {
      setImportError(err instanceof ApiError ? err.message : "Không tải được danh mục mẫu");
    } finally {
      setImportLoading(false);
    }
  }

  function toggleSelect(code: string) {
    setSelectedTemplateCodes((current) => {
      const next = new Set(current);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  }

  function proceedToReview() {
    if (selectedTemplateCodes.size === 0) return;
    const nextDrafts: Record<string, ImportDraft> = {};
    for (const tpl of templates) {
      if (!selectedTemplateCodes.has(tpl.code)) continue;
      const existing = drafts[tpl.code];
      nextDrafts[tpl.code] = existing ?? {
        template_code: tpl.code,
        code: tpl.code,
        name: tpl.name,
        procedure: tpl.procedure,
        price: tpl.default_price,
        estimated_duration_min: tpl.default_duration_min,
        on_conflict: "skip",
        default_price: tpl.default_price,
        default_duration_min: tpl.default_duration_min,
        default_procedure: tpl.procedure,
        default_name: tpl.name,
        already_imported: tpl.already_imported,
      };
    }
    setDrafts(nextDrafts);
    setImportStep("review");
  }

  function updateDraft(templateCode: string, update: Partial<ImportDraft>) {
    setDrafts((current) => ({
      ...current,
      [templateCode]: { ...current[templateCode], ...update },
    }));
  }

  function resetDraftToDefaults(templateCode: string) {
    const template = templates.find((tpl) => tpl.code === templateCode);
    if (!template) return;
    updateDraft(templateCode, {
      code: template.code,
      name: template.name,
      procedure: template.procedure,
      price: template.default_price,
      estimated_duration_min: template.default_duration_min,
      on_conflict: "skip",
    });
  }

  async function submitImport() {
    const list = Object.values(drafts);
    if (list.length === 0) return;
    setImportBusy(true);
    setImportError(null);
    try {
      const result = await apiPost<TreatmentServiceImportResult>(
        "/api/clinic/treatment-services/import",
        {
          items: list.map((item) => ({
            template_code: item.template_code,
            code: item.code.trim(),
            name: item.name.trim(),
            procedure: item.procedure,
            price: item.price,
            estimated_duration_min: item.estimated_duration_min,
            on_conflict: item.on_conflict,
          })),
        },
      );
      toast.success(
        `Đã nhập ${result.imported}, cập nhật ${result.updated}, bỏ qua ${result.skipped_conflict}, lỗi ${result.error}`,
      );
      if (result.items.some((item) => item.outcome === "error")) {
        const first = result.items.find((item) => item.outcome === "error");
        if (first?.message) setImportError(`Có dòng lỗi: ${first.message}`);
      }
      setImportOpen(false);
      await loadServices();
    } catch (err) {
      setImportError(err instanceof ApiError ? err.message : "Không thể nhập dịch vụ");
    } finally {
      setImportBusy(false);
    }
  }

  function openNew() {
    setEditingCode(null);
    setForm(EMPTY_SERVICE);
    setDialogOpen(true);
  }

  function openEdit(service: TreatmentService) {
    setEditingCode(service.code);
    setForm({
      code: service.code,
      name: service.name,
      procedure: service.procedure,
      price: service.price,
      estimated_duration_min: service.estimated_duration_min,
      is_active: service.is_active,
    });
    setDialogOpen(true);
  }

  async function remove(service: TreatmentService) {
    if (!confirm(`Xóa dịch vụ ${service.code} - ${service.name}? Nếu dịch vụ đã có trong kế hoạch điều trị, hệ thống sẽ chỉ ngừng áp dụng để bảo toàn lịch sử.`)) return;

    setRemovingCode(service.code);
    try {
      const result = await apiDelete<{ mode: "deleted" | "deactivated" }>(
        `/api/clinic/treatment-services/${encodeURIComponent(service.code)}`,
      );
      setServices((current) =>
        result.mode === "deleted"
          ? current.filter((item) => item.code !== service.code)
          : current.map((item) => item.code === service.code ? { ...item, is_active: false } : item),
      );
      toast.success(
        result.mode === "deleted"
          ? "Đã xóa dịch vụ chưa từng sử dụng"
          : "Dịch vụ đã có lịch sử điều trị nên được chuyển sang ngừng áp dụng",
      );
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Không thể xóa dịch vụ");
    } finally {
      setRemovingCode(null);
    }
  }

  async function save() {
    const price = form.price;
    const estimatedDurationMin = form.estimated_duration_min;
    if (!form.code.trim() || !form.name.trim() || !form.procedure || typeof price !== "number" || !Number.isFinite(price) || price < 0 || typeof estimatedDurationMin !== "number" || !Number.isInteger(estimatedDurationMin) || estimatedDurationMin < 1 || estimatedDurationMin > 480) {
      toast.error("Nhập mã, tên, giá và định mức nguyên từ 1 đến 480 phút hợp lệ");
      return;
    }

    setSaving(true);
    try {
      const saved = await apiPut<TreatmentService>("/api/clinic/treatment-services", { ...form, price, estimated_duration_min: estimatedDurationMin });
      setServices((current) =>
        [...current.filter((service) => service.code !== saved.code), saved]
          .sort((a, b) => a.code.localeCompare(b.code)),
      );
      setDialogOpen(false);
      toast.success("Đã lưu dịch vụ điều trị");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Lỗi lưu dịch vụ điều trị");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <div className="flex h-48 items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-4 border-muted border-t-primary" /></div>;
  }

  return (
    <PageContainer size="data">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Danh mục dịch vụ điều trị</h1>
          <p className="mt-1 text-sm text-muted-foreground">Giá niêm yết đã gồm VAT và định mức được snapshot khi lập kế hoạch điều trị.</p>
        </div>
        {isAdmin && (
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => void openImport()}
              className="rounded-md border border-input bg-background px-3 py-1.5 text-sm font-medium hover:bg-muted"
            >
              Nhập từ danh mục mẫu
            </button>
            <button
              onClick={openNew}
              className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              Thêm dịch vụ
            </button>
          </div>
        )}
      </div>

      <div className="overflow-x-auto rounded-lg border border-border bg-card">
        {services.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">Chưa có dịch vụ. Thêm dịch vụ để tự động áp dụng giá và định mức cho kế hoạch điều trị.</p>
        ) : (
          <table className="w-full min-w-[780px] text-sm">
            <thead className="border-b bg-muted/30 text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">Mã</th>
                <th className="px-4 py-3 font-medium">Dịch vụ</th>
                <th className="px-4 py-3 font-medium">Thủ thuật</th>
                <th className="px-4 py-3 text-right font-medium">Giá gồm VAT</th>
                <th className="px-4 py-3 text-right font-medium">Định mức</th>
                <th className="px-4 py-3 font-medium">Nguồn</th>
                <th className="px-4 py-3 font-medium">Trạng thái</th>
                {isAdmin && <th className="px-4 py-3" />}
              </tr>
            </thead>
            <tbody className="divide-y">
              {visibleServices.map((service) => (
                <tr key={service.code}>
                  <td className="px-4 py-3 font-mono text-xs">{service.code}</td>
                  <td className="px-4 py-3 font-medium">{service.name}</td>
                  <td className="px-4 py-3">{service.procedure}</td>
                   <td className="px-4 py-3 text-right tabular-nums">{service.price.toLocaleString("vi-VN")} VND</td>
                   <td className="px-4 py-3 text-right tabular-nums">{service.estimated_duration_min} phút</td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">
                    {service.imported_from_template_code ? "Mẫu hệ thống" : "Tự tạo"}
                  </td>
                  <td className="px-4 py-3"><span className={service.is_active ? "text-emerald-700 dark:text-emerald-400" : "text-muted-foreground"}>{service.is_active ? "Đang áp dụng" : "Ngừng áp dụng"}</span></td>
                  {isAdmin && (
                    <td className="px-4 py-3 text-right">
                      <div className="flex justify-end gap-2">
                        <button onClick={() => openEdit(service)} className="rounded border border-input px-2 py-1 text-xs hover:bg-muted">Sửa</button>
                        <button onClick={() => void remove(service)} disabled={removingCode === service.code} className="rounded border border-destructive/30 px-2 py-1 text-xs text-destructive hover:bg-destructive/10 disabled:opacity-50">{removingCode === service.code ? "..." : "Xóa"}</button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <Pagination page={page} pageSize={DEFAULT_PAGE_SIZE} total={services.length} onPageChange={setPage} />

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogHeader>
          <DialogTitle>{editingCode ? "Cập nhật dịch vụ" : "Thêm dịch vụ điều trị"}</DialogTitle>
          <DialogDescription>{editingCode ? "Mã dịch vụ không thể thay đổi để bảo toàn liên kết và lịch sử điều trị. Các thay đổi khác chỉ áp dụng cho kế hoạch mới." : "Mã dịch vụ là định danh duy nhất trong phòng khám. Giá nhập là giá đã gồm VAT."}</DialogDescription>
        </DialogHeader>
        <DialogBody className="grid gap-3">
          <label className="grid gap-1.5 text-sm font-medium">Mã dịch vụ<input value={form.code} disabled={Boolean(editingCode)} onChange={(event) => setForm((current) => ({ ...current, code: event.target.value.toUpperCase() }))} maxLength={40} placeholder="VD: TRAM-COM" className="rounded-md border border-input bg-background px-3 py-2 font-mono text-sm disabled:opacity-60" /></label>
          <label className="grid gap-1.5 text-sm font-medium">Tên dịch vụ<input value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} maxLength={200} placeholder="VD: Trám composite" className="rounded-md border border-input bg-background px-3 py-2 text-sm" /></label>
           <label className="grid gap-1.5 text-sm font-medium">Thủ thuật<select value={form.procedure} onChange={(event) => setForm((current) => ({ ...current, procedure: event.target.value }))} className="rounded-md border border-input bg-background px-3 py-2 text-sm">{!procedures.some((item) => item.code === form.procedure) && form.procedure && <option value={form.procedure}>{form.procedure} (đã ngừng áp dụng)</option>}{procedures.map((item) => <option key={item.code} value={item.code}>{item.name}</option>)}</select></label>
           <label className="grid gap-1.5 text-sm font-medium">Giá đã gồm VAT (VND)<CurrencyInput min="0" value={form.price} onChange={(price) => setForm((current) => ({ ...current, price }))} placeholder="VD: 500 000" /></label>
           <label className="grid gap-1.5 text-sm font-medium">Định mức thời gian (phút)<input type="number" min={1} max={480} step={1} required value={form.estimated_duration_min} onChange={(event) => setForm((current) => ({ ...current, estimated_duration_min: event.target.value === "" ? "" : Number(event.target.value) }))} placeholder="VD: 30" className="rounded-md border border-input bg-background px-3 py-2 text-sm" /></label>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.is_active} onChange={(event) => setForm((current) => ({ ...current, is_active: event.target.checked }))} />Đang áp dụng</label>
        </DialogBody>
        <DialogFooter>
          <button onClick={() => setDialogOpen(false)} className="rounded-md border border-input px-3 py-1.5 text-sm hover:bg-muted">Hủy</button>
          <button onClick={() => void save()} disabled={saving} className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">{saving ? "Đang lưu..." : "Lưu dịch vụ"}</button>
        </DialogFooter>
      </Dialog>

      <Dialog open={importOpen} onOpenChange={setImportOpen} size="workspace">
        <DialogHeader>
          <DialogTitle>Nhập dịch vụ từ danh mục mẫu hệ thống</DialogTitle>
          <DialogDescription>
            Bước 1: chọn dịch vụ từ danh mục mẫu. Bước 2: xem lại và chỉnh sửa giá, tên, định mức trước khi lưu vào danh mục phòng khám.
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="grid gap-3">
          {importError && (
            <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">{importError}</p>
          )}
          {importLoading ? (
            <p className="py-8 text-center text-sm text-muted-foreground">Đang tải danh mục mẫu…</p>
          ) : importStep === "pick" ? (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  value={templateFilter.q}
                  onChange={(event) => setTemplateFilter((current) => ({ ...current, q: event.target.value }))}
                  placeholder="Tìm theo mã hoặc tên dịch vụ"
                  className="min-w-[220px] flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm"
                />
                <select
                  value={templateFilter.procedure}
                  onChange={(event) => setTemplateFilter((current) => ({ ...current, procedure: event.target.value }))}
                  className="rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  <option value="">Tất cả thủ thuật</option>
                  {procedures.map((item) => (
                    <option key={item.code} value={item.code}>{item.name}</option>
                  ))}
                </select>
                <span className="text-xs text-muted-foreground">
                  Đã chọn {selectedTemplateCodes.size}/{templates.length}
                </span>
              </div>
              <div className="max-h-[420px] overflow-y-auto rounded-md border border-border">
                <table className="w-full min-w-[820px] text-sm">
                  <thead className="sticky top-0 border-b bg-muted/30 text-left text-xs text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2 font-medium" />
                      <th className="px-3 py-2 font-medium">Mã mẫu</th>
                      <th className="px-3 py-2 font-medium">Dịch vụ</th>
                      <th className="px-3 py-2 font-medium">Thủ thuật</th>
                      <th className="px-3 py-2 text-right font-medium">Giá mặc định</th>
                      <th className="px-3 py-2 text-right font-medium">Giá thị trường</th>
                      <th className="px-3 py-2 text-right font-medium">Định mức</th>
                      <th className="px-3 py-2 font-medium">ICD-10</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {filteredTemplates.map((tpl) => (
                      <tr key={tpl.code} className={tpl.already_imported ? "bg-muted/20" : undefined}>
                        <td className="px-3 py-2">
                          <input
                            type="checkbox"
                            checked={selectedTemplateCodes.has(tpl.code)}
                            onChange={() => toggleSelect(tpl.code)}
                          />
                        </td>
                        <td className="px-3 py-2 font-mono text-xs">{tpl.code}</td>
                        <td className="px-3 py-2">
                          <div className="font-medium">{tpl.name}</div>
                          {tpl.already_imported && (
                            <div className="text-[11px] text-amber-600 dark:text-amber-400">Đã có trong danh mục</div>
                          )}
                        </td>
                        <td className="px-3 py-2 text-xs">{tpl.procedure}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{tpl.default_price.toLocaleString("vi-VN")}</td>
                        <td className="px-3 py-2 text-right text-xs text-muted-foreground tabular-nums">
                          {tpl.market_price_low != null && tpl.market_price_high != null
                            ? `${Math.round(tpl.market_price_low).toLocaleString("vi-VN")} – ${Math.round(tpl.market_price_high).toLocaleString("vi-VN")}`
                            : "—"}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">{tpl.default_duration_min} phút</td>
                        <td className="px-3 py-2 text-xs">
                          {tpl.icd10_links.length > 0
                            ? tpl.icd10_links.map((link) => link.icd10_code ?? link.icd10_code_id).join(", ")
                            : <span className="text-muted-foreground">—</span>}
                        </td>
                      </tr>
                    ))}
                    {filteredTemplates.length === 0 && (
                      <tr><td colSpan={8} className="px-3 py-6 text-center text-sm text-muted-foreground">Không có mẫu phù hợp bộ lọc.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground">
                Chỉnh giá, tên hoặc định mức trước khi nhập. Với dòng đã tồn tại, chọn cách xử lý xung đột.
              </p>
              <div className="max-h-[440px] overflow-y-auto rounded-md border border-border">
                <table className="w-full min-w-[860px] text-sm">
                  <thead className="sticky top-0 border-b bg-muted/30 text-left text-xs text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2 font-medium">Mã</th>
                      <th className="px-3 py-2 font-medium">Tên dịch vụ</th>
                      <th className="px-3 py-2 font-medium">Thủ thuật</th>
                      <th className="px-3 py-2 text-right font-medium">Giá gồm VAT</th>
                      <th className="px-3 py-2 text-right font-medium">Định mức</th>
                      <th className="px-3 py-2 font-medium">Nếu trùng mã</th>
                      <th className="px-3 py-2" />
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {selectedTemplates.map((tpl) => {
                      const draft = drafts[tpl.code];
                      if (!draft) return null;
                      return (
                        <tr key={tpl.code}>
                          <td className="px-3 py-2">
                            <input
                              value={draft.code}
                              onChange={(event) => updateDraft(tpl.code, { code: event.target.value.toUpperCase() })}
                              className="w-32 rounded-md border border-input bg-background px-2 py-1 font-mono text-xs"
                            />
                            <div className="mt-1 text-[10px] text-muted-foreground">Mẫu: {tpl.code}</div>
                          </td>
                          <td className="px-3 py-2">
                            <input
                              value={draft.name}
                              onChange={(event) => updateDraft(tpl.code, { name: event.target.value })}
                              className="w-full rounded-md border border-input bg-background px-2 py-1 text-sm"
                            />
                          </td>
                          <td className="px-3 py-2">
                            <select
                              value={draft.procedure}
                              onChange={(event) => updateDraft(tpl.code, { procedure: event.target.value })}
                              className="rounded-md border border-input bg-background px-2 py-1 text-xs"
                            >
                              {procedures.map((item) => (
                                <option key={item.code} value={item.code}>{item.name}</option>
                              ))}
                            </select>
                          </td>
                          <td className="px-3 py-2">
                            <CurrencyInput
                              min="0"
                              value={draft.price}
                              onChange={(price) => updateDraft(tpl.code, { price: typeof price === "number" ? price : draft.price })}
                            />
                          </td>
                          <td className="px-3 py-2 text-right">
                            <input
                              type="number"
                              min={1}
                              max={480}
                              step={1}
                              value={draft.estimated_duration_min}
                              onChange={(event) => updateDraft(tpl.code, { estimated_duration_min: Number(event.target.value) })}
                              className="w-20 rounded-md border border-input bg-background px-2 py-1 text-right text-sm"
                            />
                          </td>
                          <td className="px-3 py-2">
                            {tpl.already_imported ? (
                              <select
                                value={draft.on_conflict}
                                onChange={(event) => updateDraft(tpl.code, { on_conflict: event.target.value as ConflictMode })}
                                className="rounded-md border border-input bg-background px-2 py-1 text-xs"
                              >
                                <option value="skip">Bỏ qua</option>
                                <option value="overwrite_metadata">Ghi đè metadata, giữ giá</option>
                                <option value="overwrite_all">Ghi đè toàn bộ</option>
                              </select>
                            ) : (
                              <span className="text-xs text-muted-foreground">Chưa có</span>
                            )}
                          </td>
                          <td className="px-3 py-2 text-right">
                            <button
                              onClick={() => resetDraftToDefaults(tpl.code)}
                              className="rounded border border-input px-2 py-1 text-xs hover:bg-muted"
                            >
                              Về mặc định
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </DialogBody>
        <DialogFooter>
          {importStep === "pick" ? (
            <>
              <button
                onClick={() => setImportOpen(false)}
                className="rounded-md border border-input px-3 py-1.5 text-sm hover:bg-muted"
              >
                Hủy
              </button>
              <button
                onClick={proceedToReview}
                disabled={selectedTemplateCodes.size === 0}
                className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                Tiếp tục ({selectedTemplateCodes.size})
              </button>
            </>
          ) : (
            <>
              <button
                onClick={() => setImportStep("pick")}
                className="rounded-md border border-input px-3 py-1.5 text-sm hover:bg-muted"
              >
                Quay lại chọn
              </button>
              <button
                onClick={() => void submitImport()}
                disabled={importBusy}
                className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                {importBusy ? "Đang nhập…" : `Nhập ${Object.keys(drafts).length} dịch vụ`}
              </button>
            </>
          )}
        </DialogFooter>
      </Dialog>
    </PageContainer>
  );
}
