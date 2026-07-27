import { useEffect, useState } from "react";
import type {
  PlatformTreatmentServiceTemplateIcd10Link,
  PlatformTreatmentServiceTemplateWithLinks,
  ProcedureCatalogItem,
} from "@shared/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogBody, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { CurrencyInput } from "@/components/ui/currency-input";
import { PlatformApiError, platformGet, platformPost, platformPut } from "@/lib/platform-api";
import { usePlatformAuth } from "@/lib/platform-auth-context";

type ItemsResponse<T> = { items: T[] };
type Icd10Code = { id: string; code: string; display_vi: string };

type TemplateForm = {
  code: string;
  name: string;
  procedure: string;
  default_price: number | "";
  default_duration_min: number | "";
  market_price_low: number | "";
  market_price_median: number | "";
  market_price_high: number | "";
  market_price_reference: string;
  market_price_updated_at: string;
  description: string;
  is_active: boolean;
  sort_order: number;
  icd10_links: Array<{ icd10_code_id: string; relation: "primary" | "secondary"; note: string }>;
};

const emptyForm = (): TemplateForm => ({
  code: "",
  name: "",
  procedure: "",
  default_price: "",
  default_duration_min: 30,
  market_price_low: "",
  market_price_median: "",
  market_price_high: "",
  market_price_reference: "",
  market_price_updated_at: new Date().toISOString().slice(0, 10),
  description: "",
  is_active: true,
  sort_order: 100,
  icd10_links: [],
});

function marketRange(template: PlatformTreatmentServiceTemplateWithLinks): string {
  const { market_price_low: low, market_price_median: median, market_price_high: high, market_price_currency: currency } = template;
  if (low == null && median == null && high == null) return "Chưa có";
  const format = (amount: number | null | undefined) => amount == null ? "--" : new Intl.NumberFormat("vi-VN").format(amount);
  return `${format(low)} - ${format(high)} ${currency} (trung vị ${format(median)})`;
}

export function PlatformTreatmentServiceTemplatesPage() {
  const { hasPermission } = usePlatformAuth();
  const [items, setItems] = useState<PlatformTreatmentServiceTemplateWithLinks[]>([]);
  const [procedures, setProcedures] = useState<ProcedureCatalogItem[]>([]);
  const [icd10, setIcd10] = useState<Icd10Code[]>([]);
  const [query, setQuery] = useState("");
  const [icd10Query, setIcd10Query] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingCode, setEditingCode] = useState<string | null>(null);
  const [form, setForm] = useState<TemplateForm>(emptyForm);
  const [saving, setSaving] = useState(false);

  const canWrite = hasPermission("platform_config.write");

  async function load() {
    setLoading(true);
    try {
      const [templates, procedureResult] = await Promise.all([
        platformGet<ItemsResponse<PlatformTreatmentServiceTemplateWithLinks>>(`/api/platform/treatment-service-templates?${new URLSearchParams(query ? { q: query } : {})}`),
        platformGet<ItemsResponse<ProcedureCatalogItem>>("/api/platform/procedures"),
      ]);
      setItems(templates.items);
      setProcedures(procedureResult.items);
      setError(null);
    } catch (cause) {
      setError(cause instanceof PlatformApiError ? cause.message : "Không thể tải danh mục mẫu dịch vụ");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, [query]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void platformGet<ItemsResponse<Icd10Code>>(`/api/platform/clinical-terminology/icd10?q=${encodeURIComponent(icd10Query)}`)
        .then((result) => setIcd10(result.items))
        .catch(() => setIcd10([]));
    }, 200);
    return () => window.clearTimeout(timer);
  }, [icd10Query]);

  function openCreate() {
    setEditingCode(null);
    setForm(emptyForm());
    setIcd10Query("");
    setDialogOpen(true);
  }

  function openEdit(template: PlatformTreatmentServiceTemplateWithLinks) {
    setEditingCode(template.code);
    setForm({
      code: template.code,
      name: template.name,
      procedure: template.procedure,
      default_price: template.default_price,
      default_duration_min: template.default_duration_min,
      market_price_low: template.market_price_low ?? "",
      market_price_median: template.market_price_median ?? "",
      market_price_high: template.market_price_high ?? "",
      market_price_reference: template.market_price_reference ?? "",
      market_price_updated_at: template.market_price_updated_at?.slice(0, 10) ?? "",
      description: template.description ?? "",
      is_active: template.is_active,
      sort_order: template.sort_order,
      icd10_links: template.icd10_links.map((link) => ({
        icd10_code_id: link.icd10_code_id,
        relation: link.relation,
        note: link.note ?? "",
      })),
    });
    setIcd10Query("");
    setDialogOpen(true);
  }

  function translateMfa(cause: unknown): string {
    if (cause instanceof PlatformApiError && cause.status === 403 && cause.message === "Recent MFA verification required") {
      return "Cần xác thực MFA lại trước khi thay đổi mẫu dịch vụ. Đăng xuất Platform Control rồi đăng nhập lại bằng mã TOTP.";
    }
    return cause instanceof PlatformApiError ? cause.message : "Không thể lưu mẫu dịch vụ";
  }

  async function save() {
    if (typeof form.default_price !== "number" || typeof form.default_duration_min !== "number" || !form.procedure) {
      setError("Nhập đầy đủ mã, tên, thủ thuật, giá gợi ý và định mức thời gian.");
      return;
    }
    setSaving(true);
    try {
      await platformPut("/api/platform/treatment-service-templates", {
        ...form,
        code: form.code.trim().toUpperCase(),
        market_price_low: form.market_price_low === "" ? null : form.market_price_low,
        market_price_median: form.market_price_median === "" ? null : form.market_price_median,
        market_price_high: form.market_price_high === "" ? null : form.market_price_high,
        market_price_reference: form.market_price_reference || undefined,
        market_price_updated_at: form.market_price_updated_at || null,
        description: form.description || undefined,
        icd10_links: form.icd10_links.map((link) => ({ ...link, note: link.note || undefined })),
      });
      setDialogOpen(false);
      await load();
    } catch (cause) {
      setError(translateMfa(cause));
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(template: PlatformTreatmentServiceTemplateWithLinks) {
    try {
      await platformPost(`/api/platform/treatment-service-templates/${encodeURIComponent(template.code)}/${template.is_active ? "deactivate" : "activate"}`);
      await load();
    } catch (cause) {
      setError(translateMfa(cause));
    }
  }

  function addIcd10(code: Icd10Code) {
    if (form.icd10_links.some((link) => link.icd10_code_id === code.id)) return;
    setForm((current) => ({
      ...current,
      icd10_links: [...current.icd10_links, { icd10_code_id: code.id, relation: current.icd10_links.some((link) => link.relation === "primary") ? "secondary" : "primary", note: "" }],
    }));
  }

  return <div className="mx-auto w-full max-w-[90rem] space-y-6 p-4 sm:p-7 lg:px-8 lg:py-8 2xl:px-10">
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#67e8f9]">Quản trị nền tảng</p><h1 className="mt-1 text-2xl font-semibold">Mẫu dịch vụ điều trị</h1><p className="mt-1 max-w-3xl text-sm text-muted-foreground">Mã dịch vụ chuẩn toàn hệ thống, giá thị trường tham khảo và liên kết ICD-10 chẩn đoán. Tenant có thể sửa giá trước khi nhập.</p></div>
      {canWrite && <Button onClick={openCreate}>Thêm mẫu dịch vụ</Button>}
    </div>
    {error && <div role="alert" className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-700 dark:text-amber-300">{error}</div>}
    <Card><CardContent className="p-4"><Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Tìm theo mã hoặc tên dịch vụ" /></CardContent></Card>
    <Card><CardContent className="p-0"><div className="overflow-x-auto"><table className="w-full min-w-[1050px] text-sm"><thead className="border-b bg-muted/30 text-left text-xs text-muted-foreground"><tr><th className="p-3">Mã</th><th className="p-3">Dịch vụ</th><th className="p-3">Thủ thuật</th><th className="p-3 text-right">Giá gợi ý</th><th className="p-3">Giá thị trường</th><th className="p-3">ICD-10</th><th className="p-3">Trạng thái</th>{canWrite && <th className="p-3" />}</tr></thead><tbody>{loading ? <tr><td colSpan={8} className="p-8 text-center text-muted-foreground">Đang tải...</td></tr> : items.length === 0 ? <tr><td colSpan={8} className="p-8 text-center text-muted-foreground">Chưa có mẫu phù hợp.</td></tr> : items.map((item) => <tr key={item.code} className="border-b last:border-0"><td className="p-3 font-mono text-xs">{item.code}</td><td className="p-3"><p className="font-medium">{item.name}</p><p className="mt-0.5 text-xs text-muted-foreground">{item.default_duration_min} phút</p></td><td className="p-3">{item.procedure}</td><td className="p-3 text-right tabular-nums">{item.default_price.toLocaleString("vi-VN")} {item.market_price_currency}</td><td className="p-3 text-xs text-muted-foreground">{marketRange(item)}</td><td className="p-3"><div className="flex flex-wrap gap-1">{item.icd10_links.length ? item.icd10_links.map((link) => <span key={link.icd10_code_id} className="rounded bg-cyan-500/10 px-1.5 py-0.5 font-mono text-xs text-cyan-700 dark:text-cyan-300">{link.icd10_code ?? "ICD-10"}</span>) : <span className="text-xs text-muted-foreground">Chưa liên kết</span>}</div></td><td className="p-3"><span className={item.is_active ? "text-emerald-600" : "text-muted-foreground"}>{item.is_active ? "Đang áp dụng" : "Ngừng áp dụng"}</span></td>{canWrite && <td className="p-3 text-right"><div className="flex justify-end gap-2"><Button size="sm" variant="outline" onClick={() => openEdit(item)}>Sửa</Button><Button size="sm" variant={item.is_active ? "outline" : "default"} onClick={() => void toggleActive(item)}>{item.is_active ? "Ngừng" : "Bật lại"}</Button></div></td>}</tr>)}</tbody></table></div></CardContent></Card>
    <Dialog open={dialogOpen} onOpenChange={setDialogOpen} size="lg"><DialogHeader><DialogTitle>{editingCode ? "Cập nhật mẫu dịch vụ" : "Thêm mẫu dịch vụ"}</DialogTitle></DialogHeader><DialogBody className="grid gap-5 lg:grid-cols-2"><div className="space-y-4"><div className="grid gap-2"><Label>Mã chuẩn hệ thống</Label><Input value={form.code} disabled={Boolean(editingCode)} maxLength={40} placeholder="VD: RES-COMP-1S" onChange={(event) => setForm({ ...form, code: event.target.value.toUpperCase() })} /></div><div className="grid gap-2"><Label>Tên dịch vụ</Label><Input value={form.name} maxLength={200} onChange={(event) => setForm({ ...form, name: event.target.value })} /></div><div className="grid gap-2"><Label>Thủ thuật</Label><Select value={form.procedure} onChange={(event) => setForm({ ...form, procedure: event.target.value })}><option value="">Chọn thủ thuật</option>{procedures.map((procedure) => <option key={procedure.code} value={procedure.code}>{procedure.name}</option>)}</Select></div><div className="grid grid-cols-2 gap-3"><div className="grid gap-2"><Label>Giá gợi ý (VND)</Label><CurrencyInput min="0" value={form.default_price} onChange={(default_price) => setForm({ ...form, default_price })} /></div><div className="grid gap-2"><Label>Định mức (phút)</Label><Input type="number" min={1} max={480} value={form.default_duration_min} onChange={(event) => setForm({ ...form, default_duration_min: event.target.value === "" ? "" : Number(event.target.value) })} /></div></div><div className="grid gap-2"><Label>Mô tả</Label><Textarea rows={3} value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} /></div><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.is_active} onChange={(event) => setForm({ ...form, is_active: event.target.checked })} />Đang áp dụng</label></div><div className="space-y-4"><div className="rounded-lg border p-3"><p className="font-medium">Giá thị trường tham khảo</p><div className="mt-3 grid grid-cols-3 gap-2"><div className="grid gap-1"><Label>Thấp</Label><CurrencyInput min="0" value={form.market_price_low} onChange={(market_price_low) => setForm({ ...form, market_price_low })} /></div><div className="grid gap-1"><Label>Trung vị</Label><CurrencyInput min="0" value={form.market_price_median} onChange={(market_price_median) => setForm({ ...form, market_price_median })} /></div><div className="grid gap-1"><Label>Cao</Label><CurrencyInput min="0" value={form.market_price_high} onChange={(market_price_high) => setForm({ ...form, market_price_high })} /></div></div><div className="mt-3 grid gap-2"><Label>Nguồn/ghi chú giá</Label><Input value={form.market_price_reference} onChange={(event) => setForm({ ...form, market_price_reference: event.target.value })} placeholder="Khảo sát thị trường, URL hoặc ghi chú" /></div><div className="mt-3 grid gap-2"><Label>Ngày cập nhật giá</Label><Input type="date" value={form.market_price_updated_at} onChange={(event) => setForm({ ...form, market_price_updated_at: event.target.value })} /></div></div><div className="rounded-lg border p-3"><p className="font-medium">Liên kết ICD-10</p><p className="mt-1 text-xs text-muted-foreground">Mã ICD-10 là chẩn đoán liên quan, không phải mã dịch vụ.</p><Input className="mt-3" value={icd10Query} onChange={(event) => setIcd10Query(event.target.value)} placeholder="Tìm ICD-10 theo mã hoặc tên" />{icd10Query && <div className="mt-2 max-h-32 space-y-1 overflow-auto">{icd10.map((code) => <button type="button" key={code.id} className="w-full rounded px-2 py-1 text-left text-sm hover:bg-muted" onClick={() => addIcd10(code)}>{code.code} · {code.display_vi}</button>)}</div>}<div className="mt-3 space-y-2">{form.icd10_links.map((link, index) => { const detail = icd10.find((code) => code.id === link.icd10_code_id); return <div className="flex items-center gap-2" key={link.icd10_code_id}><span className="min-w-0 flex-1 truncate rounded bg-muted px-2 py-1 text-xs font-mono">{detail ? `${detail.code} · ${detail.display_vi}` : link.icd10_code_id}</span><Select className="w-28" value={link.relation} onChange={(event) => setForm((current) => ({ ...current, icd10_links: current.icd10_links.map((item, itemIndex) => itemIndex === index ? { ...item, relation: event.target.value as "primary" | "secondary" } : item) }))}><option value="primary">Chính</option><option value="secondary">Phụ</option></Select><Button type="button" size="sm" variant="ghost" onClick={() => setForm((current) => ({ ...current, icd10_links: current.icd10_links.filter((_, itemIndex) => itemIndex !== index) }))}>Bỏ</Button></div>; })}</div></div></div></DialogBody><DialogFooter><Button variant="outline" onClick={() => setDialogOpen(false)}>Hủy</Button><Button onClick={() => void save()} disabled={saving}>{saving ? "Đang lưu..." : "Lưu mẫu"}</Button></DialogFooter></Dialog>
  </div>;
}
