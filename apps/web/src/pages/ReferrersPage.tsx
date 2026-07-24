import { useEffect, useState, type FormEvent } from "react";
import type { Referrer, ReferrerType } from "@shared/types";
import { PERMISSIONS } from "@shared/constants";
import { useAuth } from "@/lib/auth-context";
import { ApiError } from "@/lib/api";
import { referrersApi } from "@/lib/referral-api";
import { toast } from "@/lib/toast";
import { PageContainer } from "@/components/PageContainer";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { LoadingReferralPanel, ReferralEmpty, ReferrerStatusBadge, ReferrerTypeLabel } from "@/components/referral/ReferralUi";
import { formatDateTime } from "@/lib/utils";
import { ReferrerQrCode } from "@/components/referral/ReferrerQrCode";

type ReferrerForm = { type: ReferrerType; name: string; email: string; phone: string };
const EMPTY_FORM: ReferrerForm = { type: "partner", name: "", email: "", phone: "" };

export function ReferrersPage() {
  const { session } = useAuth();
  const [items, setItems] = useState<Referrer[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Referrer | null>(null);
  const [form, setForm] = useState<ReferrerForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [accountEmail, setAccountEmail] = useState("");
  const [accountFor, setAccountFor] = useState<Referrer | null>(null);
  const [qrFor, setQrFor] = useState<Referrer | null>(null);
  const canManage = Boolean(session?.role.permissions.includes(PERMISSIONS.ALL) || session?.role.permissions.includes(PERMISSIONS.MANAGE_REFERRERS));

  useEffect(() => { void load(); }, []);
  async function load() {
    setLoading(true);
    try {
      const response = await referrersApi.list<{ items?: Referrer[] } | Referrer[]>();
      setItems(Array.isArray(response) ? response : response.items ?? []);
    } catch (cause) { toast.error(cause instanceof ApiError ? cause.message : "Không thể tải Người giới thiệu"); }
    finally { setLoading(false); }
  }
  function openCreate() { setEditing(null); setForm(EMPTY_FORM); setDialogOpen(true); }
  function openEdit(referrer: Referrer) { setEditing(referrer); setForm({ type: referrer.type, name: referrer.name, email: referrer.email ?? "", phone: referrer.phone ?? "" }); setDialogOpen(true); }
  async function save(event: FormEvent) {
    event.preventDefault();
    if (!form.name.trim()) { toast.error("Nhập tên Người giới thiệu"); return; }
    if (form.type === "partner" && !form.email.trim() && !form.phone.trim()) { toast.error("Đối tác cần email hoặc số điện thoại"); return; }
    setSaving(true);
    try {
      const payload = { ...form, name: form.name.trim(), email: form.email.trim() || undefined, phone: form.phone.trim() || undefined };
      const saved = editing ? await referrersApi.update<Referrer>(editing.id, payload) : await referrersApi.create<Referrer>(payload);
      setItems((current) => [...current.filter((item) => item.id !== saved.id), saved].sort((a, b) => a.name.localeCompare(b.name, "vi")));
      setDialogOpen(false); toast.success(editing ? "Đã cập nhật Người giới thiệu" : "Đã tạo Người giới thiệu");
    } catch (cause) { toast.error(cause instanceof ApiError ? cause.message : "Không thể lưu Người giới thiệu"); }
    finally { setSaving(false); }
  }
  async function regenerateCode(referrer: Referrer) {
    if (!confirm(`Cấp lại mã cho ${referrer.name}? Mã hiện tại sẽ không còn hiệu lực.`)) return;
    try { const updated = await referrersApi.regenerateCode<Referrer>(referrer.id); setItems((current) => current.map((item) => item.id === updated.id ? updated : item)); toast.success("Đã cấp lại mã giới thiệu"); }
    catch (cause) { toast.error(cause instanceof ApiError ? cause.message : "Không thể cấp lại mã"); }
  }
  async function setStatus(referrer: Referrer) {
    try { const updated = await referrersApi.update<Referrer>(referrer.id, { status: referrer.status === "active" ? "inactive" : "active" }); setItems((current) => current.map((item) => item.id === updated.id ? updated : item)); }
    catch (cause) { toast.error(cause instanceof ApiError ? cause.message : "Không thể cập nhật trạng thái"); }
  }
  async function createAccount(event: FormEvent) {
    event.preventDefault(); if (!accountFor || !accountEmail.trim()) return;
    try { await referrersApi.createAccount(accountFor.id, { email: accountEmail.trim() }); toast.success("Đã tạo tài khoản portal. Link kích hoạt chỉ được trả theo chính sách API."); setAccountFor(null); }
    catch (cause) { toast.error(cause instanceof ApiError ? cause.message : "Không thể tạo tài khoản portal"); }
  }
  if (loading) return <PageContainer><LoadingReferralPanel /></PageContainer>;
  return <PageContainer size="data">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><h1 className="text-2xl font-semibold tracking-tight">Người giới thiệu</h1><p className="mt-1 text-sm text-muted-foreground">Quản lý mã, trạng thái và tài khoản portal tách biệt với người dùng nội bộ.</p></div>{canManage && <Button onClick={openCreate}>Thêm Người giới thiệu</Button>}</div>
    <div className="overflow-x-auto rounded-xl border border-border bg-card shadow-sm">
      {!items.length ? <ReferralEmpty>Chưa có Người giới thiệu.</ReferralEmpty> : <table className="w-full min-w-[1020px] text-sm"><thead className="border-b bg-muted/30 text-left text-xs text-muted-foreground"><tr><th className="p-3 font-medium">Người giới thiệu</th><th className="p-3 font-medium">Mã</th><th className="p-3 font-medium">Liên hệ</th><th className="p-3 font-medium">Trạng thái</th><th className="p-3 font-medium">Tạo lúc</th><th className="p-3" /></tr></thead><tbody className="divide-y">{items.map((item) => <tr key={item.id}><td className="p-3"><p className="font-medium">{item.name}</p><p className="text-xs text-muted-foreground"><ReferrerTypeLabel type={item.type} /></p></td><td className="p-3"><code className="rounded bg-muted px-2 py-1 text-xs font-semibold">{item.code}</code></td><td className="p-3 text-muted-foreground">{item.email ?? item.phone ?? "-"}</td><td className="p-3"><ReferrerStatusBadge status={item.status} /></td><td className="p-3 text-xs text-muted-foreground">{formatDateTime(item.created_at)}</td><td className="p-3 text-right"><div className="flex justify-end gap-2"><Button size="sm" variant="outline" onClick={() => setQrFor(item)}>Hiện QR</Button>{canManage && <><Button size="sm" variant="outline" onClick={() => openEdit(item)}>Sửa</Button><Button size="sm" variant="outline" onClick={() => void regenerateCode(item)}>Cấp lại mã</Button><Button size="sm" variant="outline" onClick={() => { setAccountFor(item); setAccountEmail(item.email ?? ""); }}>Portal</Button><Button size="sm" variant="ghost" onClick={() => void setStatus(item)}>{item.status === "active" ? "Ngừng" : "Bật"}</Button></>}</div></td></tr>)}</tbody></table>}
    </div>
    <Dialog open={Boolean(qrFor)} onOpenChange={(open) => { if (!open) setQrFor(null); }} size="sm"><DialogHeader><DialogTitle>Mã QR Người giới thiệu</DialogTitle></DialogHeader><DialogBody>{qrFor && <ReferrerQrCode referrerId={qrFor.id} label={`${qrFor.name} (${qrFor.code})`} />}</DialogBody></Dialog>
    <Dialog open={dialogOpen} onOpenChange={setDialogOpen}><form onSubmit={save}><DialogHeader><DialogTitle>{editing ? "Cập nhật Người giới thiệu" : "Thêm Người giới thiệu"}</DialogTitle></DialogHeader><DialogBody className="grid gap-4 sm:grid-cols-2"><label className="grid gap-1.5 text-sm font-medium">Loại<select value={form.type} disabled={Boolean(editing)} onChange={(event) => setForm((current) => ({ ...current, type: event.target.value as ReferrerType }))} className="rounded-md border border-input bg-background px-3 py-2 disabled:opacity-60"><option value="patient">Bệnh nhân</option><option value="doctor">Bác sĩ</option><option value="assistant">Phụ tá</option><option value="partner">Đối tác</option></select></label><label className="grid gap-1.5 text-sm font-medium">Họ tên / tên đối tác<input value={form.name} required maxLength={200} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} className="rounded-md border border-input bg-background px-3 py-2" /></label><label className="grid gap-1.5 text-sm font-medium">Email<input type="email" value={form.email} maxLength={200} onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))} className="rounded-md border border-input bg-background px-3 py-2" /></label><label className="grid gap-1.5 text-sm font-medium">Số điện thoại<input value={form.phone} maxLength={20} onChange={(event) => setForm((current) => ({ ...current, phone: event.target.value }))} className="rounded-md border border-input bg-background px-3 py-2" /></label>{!editing && form.type !== "partner" && <p className="sm:col-span-2 text-xs text-muted-foreground">Liên kết hồ sơ bệnh nhân/nhân viên được API xác thực theo loại. Form đơn giản này dành cho referrer độc lập.</p>}</DialogBody><DialogFooter><Button variant="outline" onClick={() => setDialogOpen(false)}>Hủy</Button><Button type="submit" disabled={saving}>{saving ? "Đang lưu..." : "Lưu"}</Button></DialogFooter></form></Dialog>
    <Dialog open={Boolean(accountFor)} onOpenChange={(open) => { if (!open) setAccountFor(null); }}><form onSubmit={createAccount}><DialogHeader><DialogTitle>Tạo tài khoản portal</DialogTitle></DialogHeader><DialogBody className="space-y-3"><p className="text-sm text-muted-foreground">Tài khoản dành riêng cho {accountFor?.name}; không dùng phiên đăng nhập nội bộ.</p><label className="grid gap-1.5 text-sm font-medium">Email portal<input type="email" required value={accountEmail} onChange={(event) => setAccountEmail(event.target.value)} className="rounded-md border border-input bg-background px-3 py-2" /></label></DialogBody><DialogFooter><Button variant="outline" onClick={() => setAccountFor(null)}>Hủy</Button><Button type="submit">Tạo và gửi kích hoạt</Button></DialogFooter></form></Dialog>
  </PageContainer>;
}
