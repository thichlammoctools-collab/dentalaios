import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { apiGet, apiPost, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogBody, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PageContainer } from "@/components/PageContainer";
import { ExpenseForm } from "@/components/ExpenseForm";
import { formatCurrency } from "@/lib/utils";
import { toast } from "@/lib/toast";
import { PERMISSIONS } from "@shared/constants";
import type { ExpenseCategory, FinanceDailyPoint, FinanceLedgerEntry, FinanceRange, FinanceSnapshot } from "@shared/types";

const categoryLabels: Record<ExpenseCategory, string> = {
  rent: "Mặt bằng", utilities: "Điện nước", supplies: "Vật tư", lab_fee: "Chi phí labo",
  staff_cost: "Nhân sự", marketing: "Marketing", maintenance: "Bảo trì", equipment: "Thiết bị",
  administration: "Hành chính", other: "Khác",
};

type FinanceTab = "overview" | "expenses" | "branches" | "ledger";

const financeTabs: FinanceTab[] = ["overview", "expenses", "branches", "ledger"];

function hcmDate(value: string) {
  return new Intl.DateTimeFormat("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(value.length === 10 ? `${value}T00:00:00+07:00` : value));
}

function chartDate(value: string) {
  const date = new Date(`${value}T00:00:00`);
  return new Intl.DateTimeFormat("vi-VN", { day: "2-digit", month: "2-digit" }).format(date);
}

export function FinancePage() {
  const { session } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedRange = Number(searchParams.get("range"));
  const range: FinanceRange = requestedRange === 7 || requestedRange === 90 ? requestedRange : 30;
  const branchId = searchParams.get("branch_id") ?? "";
  const requestedTab = searchParams.get("tab");
  const activeTab: FinanceTab = financeTabs.includes(requestedTab as FinanceTab) ? requestedTab as FinanceTab : "overview";
  const [snapshot, setSnapshot] = useState<FinanceSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expenseOpen, setExpenseOpen] = useState(false);
  const [voiding, setVoiding] = useState<FinanceLedgerEntry | null>(null);
  const [voidReason, setVoidReason] = useState("");
  const [savingVoid, setSavingVoid] = useState(false);
  const requestId = useRef(0);
  const canView = Boolean(session?.role.permissions.includes(PERMISSIONS.ALL) || session?.role.permissions.includes(PERMISSIONS.VIEW_FINANCE));
  const canManage = Boolean(session?.role.permissions.includes(PERMISSIONS.ALL) || session?.role.permissions.includes(PERMISSIONS.MANAGE_FINANCE));

  function setFilters(nextRange: FinanceRange, nextBranch: string) {
    const next = new URLSearchParams(searchParams);
    if (nextRange !== 30) next.set("range", String(nextRange)); else next.delete("range");
    if (nextBranch) next.set("branch_id", nextBranch); else next.delete("branch_id");
    setSearchParams(next);
  }

  function setActiveTab(nextTab: string) {
    const next = new URLSearchParams(searchParams);
    if (nextTab === "overview") next.delete("tab"); else next.set("tab", nextTab);
    setSearchParams(next);
  }

  async function loadSnapshot(manual = false) {
    const current = ++requestId.current;
    manual ? setRefreshing(true) : setLoading(true);
    setError(null);
    const query = new URLSearchParams({ range: String(range) });
    if (branchId) query.set("branch_id", branchId);
    try {
      const next = await apiGet<FinanceSnapshot>(`/api/finance/summary?${query}`);
      if (current === requestId.current) setSnapshot(next);
    } catch (cause) {
      if (current === requestId.current) setError(cause instanceof ApiError ? cause.message : "Không thể tải dữ liệu tài chính.");
    } finally {
      if (current === requestId.current) { setLoading(false); setRefreshing(false); }
    }
  }

  useEffect(() => {
    if (!canView) { setLoading(false); return; }
    void loadSnapshot();
    // URL filters drive the request.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canView, range, branchId]);

  async function voidExpense() {
    if (!voiding || !voidReason.trim()) { toast.error("Cần nhập lý do hủy chi phí"); return; }
    setSavingVoid(true);
    try {
      await apiPost(`/api/finance/expenses/${voiding.id}/void`, { reason: voidReason.trim() });
      toast.success("Đã hủy chi phí");
      setVoiding(null);
      setVoidReason("");
      await loadSnapshot(true);
    } catch (cause) {
      toast.error(cause instanceof ApiError ? cause.message : "Không thể hủy chi phí");
    } finally { setSavingVoid(false); }
  }

  if (!canView) return <PageContainer size="reading"><Card><CardHeader><CardTitle>Quyền truy cập cần thiết</CardTitle><CardDescription>Trang tài chính chỉ dành cho vai trò được cấp quyền xem tài chính phòng khám.</CardDescription></CardHeader><CardContent><p className="text-sm text-muted-foreground">Liên hệ quản trị viên để được cấp quyền phù hợp.</p></CardContent></Card></PageContainer>;

  const empty = !loading && !error && !!snapshot && snapshot.daily.every((point) => !point.receipts && !point.operating_expenses && !point.referral_payouts);
  return <PageContainer size="workspace" className="space-y-5 sm:space-y-6">
    <section className="overflow-hidden rounded-2xl bg-gradient-to-br from-emerald-950 via-teal-950 to-slate-900 p-5 text-white shadow-lg sm:p-7">
      <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-end"><div><p className="text-sm font-medium text-emerald-200">{session?.tenant.name}</p><h2 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">Tài chính phòng khám</h2><p className="mt-2 text-sm text-emerald-100">Thu chi toàn phòng khám theo dòng tiền xác nhận.</p></div>
        <div className="grid gap-2 sm:grid-cols-[140px_minmax(190px,1fr)_auto_auto]"><label className="text-xs font-medium text-emerald-100">Kỳ báo cáo<Select value={range} onChange={(event) => setFilters(Number(event.target.value) as FinanceRange, branchId)} className="mt-1 border-white/20 bg-white/10 text-white"><option className="text-foreground" value="7">7 ngày hoàn tất</option><option className="text-foreground" value="30">30 ngày hoàn tất</option><option className="text-foreground" value="90">90 ngày hoàn tất</option></Select></label>
          <label className="text-xs font-medium text-emerald-100">Phạm vi chi nhánh<Select value={branchId} onChange={(event) => setFilters(range, event.target.value)} className="mt-1 border-white/20 bg-white/10 text-white"><option className="text-foreground" value="">Tất cả chi nhánh</option>{(snapshot?.branches ?? []).map((branch) => <option className="text-foreground" key={branch.id} value={branch.id}>{branch.name}</option>)}</Select></label>
          <Button variant="outline" onClick={() => void loadSnapshot(true)} disabled={refreshing} className="self-end border-white/30 bg-white/10 text-white hover:bg-white/20 hover:text-white">{refreshing ? "Đang tải..." : "Làm mới"}</Button>
          {canManage && <Button onClick={() => setExpenseOpen(true)} className="self-end bg-white text-emerald-950 hover:bg-emerald-50">+ Ghi nhận chi phí</Button>}</div></div>
    </section>
    {error ? <Card><CardHeader><CardTitle>Không thể tải tài chính</CardTitle><CardDescription>{error}</CardDescription></CardHeader><CardContent><Button onClick={() => void loadSnapshot(true)}>Thử lại</Button></CardContent></Card> : loading ? <FinanceSkeleton /> : empty ? <EmptyFinance onCreate={canManage ? () => setExpenseOpen(true) : undefined} /> : <Tabs value={activeTab} onValueChange={setActiveTab}>
      <TabsList className="grid h-auto w-full grid-cols-2 gap-1 rounded-xl p-1 sm:grid-cols-4">
        <TabsTrigger value="overview" className="min-h-11 whitespace-normal px-2 py-2">Tổng quan</TabsTrigger>
        <TabsTrigger value="expenses" className="min-h-11 whitespace-normal px-2 py-2">Chi phí vận hành</TabsTrigger>
        <TabsTrigger value="branches" className="min-h-11 whitespace-normal px-2 py-2">Theo chi nhánh</TabsTrigger>
        <TabsTrigger value="ledger" className="min-h-11 whitespace-normal px-2 py-2">Sổ giao dịch</TabsTrigger>
      </TabsList>

      <TabsContent value="overview" className="space-y-5 sm:space-y-6">
        <section><div className="mb-3 flex flex-col justify-between gap-1 sm:flex-row sm:items-baseline"><div><h2 className="text-lg font-semibold">Tổng hợp dòng tiền</h2><p className="text-sm text-muted-foreground">Thu tính theo ngày xác nhận; chi thưởng giới thiệu được tách riêng để tránh ghi nhận trùng.</p></div><span className="shrink-0 text-xs text-muted-foreground">Theo giờ Hồ Chí Minh</span></div><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5"><MetricCard label="Thu đã xác nhận" value={formatCurrency(snapshot?.kpis.confirmed_receipts ?? 0)} tone="income" /><MetricCard label="Chi vận hành" value={formatCurrency(snapshot?.kpis.operating_expenses ?? 0)} tone="expense" /><MetricCard label="Chi thưởng giới thiệu" value={formatCurrency(snapshot?.kpis.referral_payouts ?? 0)} tone="expense" /><MetricCard label="Chênh lệch thu-chi" value={formatCurrency(snapshot?.kpis.net_cash ?? 0)} tone={(snapshot?.kpis.net_cash ?? 0) >= 0 ? "income" : "expense"} /><MetricCard label="Còn phải thu điều trị" value={formatCurrency(snapshot?.kpis.outstanding_receivables ?? 0)} /></div></section>
        <Card><CardHeader><CardTitle>Thu và chi theo ngày</CardTitle><CardDescription>Dòng tiền trong {range} ngày đã hoàn tất.</CardDescription></CardHeader><CardContent><CashFlowChart data={snapshot?.daily ?? []} /></CardContent></Card>
      </TabsContent>

      <TabsContent value="expenses" className="space-y-5 sm:space-y-6">
        <section><div className="mb-3 flex flex-col justify-between gap-3 sm:flex-row sm:items-end"><div><h2 className="text-lg font-semibold">Quản lý chi phí vận hành</h2><p className="text-sm text-muted-foreground">Theo dõi chi phí còn hiệu lực theo nhóm nghiệp vụ trong kỳ.</p></div>{canManage && <Button onClick={() => setExpenseOpen(true)}>+ Ghi nhận chi phí</Button>}</div><div className="grid gap-3 sm:grid-cols-2"><MetricCard label="Tổng chi vận hành" value={formatCurrency(snapshot?.kpis.operating_expenses ?? 0)} tone="expense" /><MetricCard label="Số nhóm phát sinh" value={String(snapshot?.expense_categories.length ?? 0)} /></div></section>
        <ExpenseCategories data={snapshot?.expense_categories ?? []} />
      </TabsContent>

      <TabsContent value="branches" className="space-y-5 sm:space-y-6">
        <div><h2 className="text-lg font-semibold">Hiệu quả theo chi nhánh</h2><p className="text-sm text-muted-foreground">So sánh thu, chi và dòng tiền thuần giữa các đơn vị trong cùng kỳ báo cáo.</p></div>
        <BranchBreakdown rows={snapshot?.branch_breakdown ?? []} />
      </TabsContent>

      <TabsContent value="ledger" className="space-y-5 sm:space-y-6">
        <div><h2 className="text-lg font-semibold">Lịch sử thu chi</h2><p className="text-sm text-muted-foreground">Kiểm tra từng khoản thu, chi vận hành và chi thưởng đã ghi nhận.</p></div>
        <Ledger rows={snapshot?.ledger ?? []} canManage={canManage} onVoid={setVoiding} />
      </TabsContent>
    </Tabs>}
    <ExpenseForm open={expenseOpen} onOpenChange={setExpenseOpen} branches={snapshot?.branches ?? []} onCreated={() => void loadSnapshot(true)} />
    <Dialog open={Boolean(voiding)} onOpenChange={(open) => { if (!open && !savingVoid) { setVoiding(null); setVoidReason(""); } }}><DialogHeader><DialogTitle>Hủy chi phí đã ghi nhận</DialogTitle></DialogHeader><DialogBody className="grid gap-3"><p className="text-sm text-muted-foreground">Bản ghi sẽ được giữ lại trong lịch sử và không còn được tính vào tổng chi.</p><Input value={voidReason} onChange={(event) => setVoidReason(event.target.value)} maxLength={500} placeholder="Lý do hủy bắt buộc" autoFocus /></DialogBody><DialogFooter><Button variant="outline" onClick={() => setVoiding(null)} disabled={savingVoid}>Quay lại</Button><Button variant="destructive" onClick={() => void voidExpense()} disabled={savingVoid}>{savingVoid ? "Đang hủy..." : "Xác nhận hủy"}</Button></DialogFooter></Dialog>
  </PageContainer>;
}

function MetricCard({ label, value, tone }: { label: string; value: string; tone?: "income" | "expense" }) { return <Card className={tone === "income" ? "border-emerald-200 bg-emerald-50/40 dark:border-emerald-900 dark:bg-emerald-950/20" : tone === "expense" ? "border-rose-200 bg-rose-50/40 dark:border-rose-900 dark:bg-rose-950/20" : ""}><CardContent className="p-4"><p className="text-xs font-medium text-muted-foreground">{label}</p><p className="mt-2 truncate text-lg font-semibold">{value}</p></CardContent></Card>; }
function CashFlowChart({ data }: { data: FinanceDailyPoint[] }) { if (!data.length || data.every((point) => !point.receipts && !point.operating_expenses && !point.referral_payouts)) return <p className="py-12 text-center text-sm text-muted-foreground">Chưa có thu chi trong kỳ này.</p>; const max = Math.max(...data.flatMap((point) => [point.receipts, point.operating_expenses + point.referral_payouts]), 1); const width = Math.max(560, data.length * 34); return <div className="overflow-x-auto"><svg className="min-w-[560px] w-full" viewBox={`0 0 ${width} 220`} role="img" aria-label="Biểu đồ thu chi theo ngày"><title>Biểu đồ thu chi theo ngày</title><line x1="32" y1="180" x2={width - 8} y2="180" className="stroke-border" />{data.map((point, index) => { const x = 40 + index * ((width - 56) / Math.max(data.length - 1, 1)); const incomeY = 180 - (point.receipts / max) * 130; const expenseY = 180 - ((point.operating_expenses + point.referral_payouts) / max) * 130; return <g key={point.date}><title>{`${chartDate(point.date)}: Thu ${formatCurrency(point.receipts)}, chi ${formatCurrency(point.operating_expenses + point.referral_payouts)}`}</title><line x1={x - 3} y1="180" x2={x - 3} y2={incomeY} stroke="#059669" strokeWidth="5" strokeLinecap="round" /><line x1={x + 3} y1="180" x2={x + 3} y2={expenseY} stroke="#e11d48" strokeWidth="5" strokeLinecap="round" />{(data.length <= 14 || index % Math.ceil(data.length / 8) === 0) && <text x={x} y="202" textAnchor="middle" fontSize="10" className="fill-muted-foreground">{chartDate(point.date)}</text>}</g>; })}<text x="32" y="18" fontSize="11" className="fill-emerald-600">Cột trái: thu</text><text x="145" y="18" fontSize="11" className="fill-rose-600">Cột phải: chi</text></svg></div>; }
function ExpenseCategories({ data }: { data: FinanceSnapshot["expense_categories"] }) { return <Card><CardHeader><CardTitle>Chi vận hành theo nhóm</CardTitle><CardDescription>Chỉ gồm các khoản chi còn hiệu lực.</CardDescription></CardHeader><CardContent>{data.length === 0 ? <p className="py-8 text-center text-sm text-muted-foreground">Chưa có chi phí vận hành.</p> : <ul className="space-y-3">{data.map((item) => <li key={item.category} className="flex items-center justify-between gap-3 text-sm"><span>{categoryLabels[item.category]}</span><strong>{formatCurrency(item.amount)}</strong></li>)}</ul>}</CardContent></Card>; }
function BranchBreakdown({ rows }: { rows: FinanceSnapshot["branch_breakdown"] }) { return <Card><CardHeader><CardTitle>Thu chi theo chi nhánh</CardTitle><CardDescription>Chi phí không gắn chi nhánh được hiển thị ở dòng chi phí chung.</CardDescription></CardHeader><CardContent>{rows.length === 0 ? <p className="py-8 text-center text-sm text-muted-foreground">Chưa có dữ liệu chi nhánh trong kỳ.</p> : <div className="overflow-x-auto"><table className="w-full min-w-[700px] text-sm"><thead className="border-b text-left text-xs text-muted-foreground"><tr><th className="p-3">Đơn vị</th><th className="p-3 text-right">Thu</th><th className="p-3 text-right">Chi vận hành</th><th className="p-3 text-right">Chi thưởng</th><th className="p-3 text-right">Thu-chi</th></tr></thead><tbody>{rows.map((row) => <tr className="border-b last:border-0" key={row.branch_id ?? "shared"}><td className="p-3 font-medium">{row.branch_name}</td><td className="p-3 text-right">{formatCurrency(row.confirmed_receipts)}</td><td className="p-3 text-right">{formatCurrency(row.operating_expenses)}</td><td className="p-3 text-right">{formatCurrency(row.referral_payouts)}</td><td className={`p-3 text-right font-semibold ${row.net_cash >= 0 ? "text-emerald-700 dark:text-emerald-400" : "text-rose-700 dark:text-rose-400"}`}>{formatCurrency(row.net_cash)}</td></tr>)}</tbody></table></div>}</CardContent></Card>; }
function Ledger({ rows, canManage, onVoid }: { rows: FinanceLedgerEntry[]; canManage: boolean; onVoid: (entry: FinanceLedgerEntry) => void }) { return <Card><CardHeader><CardTitle>Sổ giao dịch</CardTitle><CardDescription>Không hiển thị tên hay thông tin định danh bệnh nhân trong màn tổng hợp.</CardDescription></CardHeader><CardContent>{rows.length === 0 ? <p className="py-8 text-center text-sm text-muted-foreground">Chưa có giao dịch trong kỳ.</p> : <div className="overflow-x-auto"><table className="w-full min-w-[780px] text-sm"><thead className="border-b text-left text-xs text-muted-foreground"><tr><th className="p-3">Ngày</th><th className="p-3">Loại</th><th className="p-3">Nội dung</th><th className="p-3">Đơn vị</th><th className="p-3 text-right">Giá trị</th><th className="p-3" /></tr></thead><tbody>{rows.map((entry) => { const outgoing = entry.kind !== "receipt"; const type = entry.kind === "receipt" ? "Thu" : entry.kind === "expense" ? "Chi vận hành" : "Chi thưởng"; return <tr className={`border-b last:border-0 ${entry.status === "void" ? "opacity-50" : ""}`} key={`${entry.kind}-${entry.id}`}><td className="p-3 whitespace-nowrap">{hcmDate(entry.occurred_at)}</td><td className="p-3"><span className={`rounded-full px-2 py-1 text-xs font-medium ${outgoing ? "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-200" : "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200"}`}>{type}</span></td><td className="p-3"><p className="font-medium">{entry.label}</p>{entry.reference && <p className="text-xs text-muted-foreground">{entry.reference}</p>}</td><td className="p-3 text-muted-foreground">{entry.branch_name ?? "-"}</td><td className={`p-3 text-right font-semibold ${outgoing ? "text-rose-700 dark:text-rose-400" : "text-emerald-700 dark:text-emerald-400"}`}>{outgoing ? "-" : "+"}{formatCurrency(entry.amount)}</td><td className="p-3 text-right">{canManage && entry.kind === "expense" && entry.status === "posted" && <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => onVoid(entry)}>Hủy</Button>}</td></tr>; })}</tbody></table></div>}</CardContent></Card>; }
function FinanceSkeleton() { return <div className="space-y-6"><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">{Array.from({ length: 5 }, (_, index) => <div key={index} className="h-24 animate-pulse rounded-xl bg-muted" />)}</div><div className="grid gap-5 xl:grid-cols-3"><div className="h-72 animate-pulse rounded-xl bg-muted xl:col-span-2" /><div className="h-72 animate-pulse rounded-xl bg-muted" /></div></div>; }
function EmptyFinance({ onCreate }: { onCreate?: () => void }) { return <Card><CardHeader><CardTitle>Chưa có thu chi trong kỳ này</CardTitle><CardDescription>Khoản thu xác nhận, chi phí vận hành và chi thưởng giới thiệu sẽ xuất hiện tại đây.</CardDescription></CardHeader>{onCreate && <CardContent><Button onClick={onCreate}>Ghi nhận chi phí đầu tiên</Button></CardContent>}</Card>; }
