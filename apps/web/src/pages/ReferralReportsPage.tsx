import { cloneElement, useEffect, useState, type ReactElement, type ReactNode } from "react";
import type { ReferrerType } from "@shared/types";
import { PERMISSIONS } from "@shared/constants";
import { useAuth } from "@/lib/auth-context";
import { apiBlob, ApiError } from "@/lib/api";
import { referralReportsApi } from "@/lib/referral-api";
import { toast } from "@/lib/toast";
import { PageContainer } from "@/components/PageContainer";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { LoadingReferralPanel, ReferralEmpty, ReferralKpi, RewardAmount } from "@/components/referral/ReferralUi";
import { formatCurrency } from "@/lib/utils";

type ReportRow = { referrer_id: string; referrer_name?: string; referrer_code?: string; referrer_type?: ReferrerType; case_count?: number; reward_amount?: number };
type Report = { kpis?: Record<string, number>; items?: ReportRow[]; total?: number };
type FilterState = { from: string; to: string; referrer_type: string; case_status: string; reward_status: string };

export function ReferralReportsPage() {
  const { session } = useAuth();
  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState<FilterState>({ from: "", to: "", referrer_type: "", case_status: "", reward_status: "" });
  const canView = Boolean(session?.role.permissions.includes(PERMISSIONS.ALL) || session?.role.permissions.includes(PERMISSIONS.VIEW_REFERRAL_REPORTS));

  useEffect(() => { if (canView) void load(); }, [canView, range]);

  function query() {
    const params = new URLSearchParams();
    Object.entries(range).forEach(([key, value]) => { if (value) params.set(key, value); });
    return params.size ? `?${params}` : "";
  }

  async function load() {
    setLoading(true);
    try { setReport(await referralReportsApi.get<Report>(query())); }
    catch (cause) { toast.error(cause instanceof ApiError ? cause.message : "Không thể tải báo cáo giới thiệu"); }
    finally { setLoading(false); }
  }

  async function exportCsv() {
    try {
      const blob = await apiBlob(`/api/referral-reports/export.csv${query()}`);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = "referrals.csv";
      anchor.click();
      URL.revokeObjectURL(url);
    }
    catch (cause) { toast.error(cause instanceof ApiError ? cause.message : "Không thể xuất CSV"); }
  }

  if (!canView) return <PageContainer size="reading"><Card><CardHeader><CardTitle>Cần quyền xem báo cáo</CardTitle><CardDescription>Báo cáo giới thiệu chỉ dành cho tài khoản được cấp quyền phù hợp.</CardDescription></CardHeader></Card></PageContainer>;

  const kpis = report?.kpis ?? {};
  const updateFilter = (key: keyof FilterState, value: string) => setRange((current) => ({ ...current, [key]: value }));
  return <PageContainer size="data">
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div><h1 className="text-2xl font-semibold tracking-tight">Báo cáo giới thiệu</h1><p className="mt-1 text-sm text-muted-foreground">KPI vận hành và drill-down nội bộ; không xuất PII bệnh nhân.</p></div>
      <Button variant="outline" onClick={() => void exportCsv()}>Xuất CSV</Button>
    </div>
    <Card><CardHeader><CardTitle>Bộ lọc báo cáo</CardTitle><CardDescription>Dữ liệu được lọc theo workspace hiện tại.</CardDescription></CardHeader><CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
      <Filter label="Từ ngày"><input type="date" value={range.from} onChange={(event) => updateFilter("from", event.target.value)} /></Filter>
      <Filter label="Đến ngày"><input type="date" value={range.to} onChange={(event) => updateFilter("to", event.target.value)} /></Filter>
      <Filter label="Loại"><select value={range.referrer_type} onChange={(event) => updateFilter("referrer_type", event.target.value)}><option value="">Tất cả</option><option value="patient">Bệnh nhân</option><option value="doctor">Bác sĩ</option><option value="assistant">Phụ tá</option><option value="partner">Đối tác</option></select></Filter>
      <Filter label="Case"><select value={range.case_status} onChange={(event) => updateFilter("case_status", event.target.value)}><option value="">Tất cả</option><option value="pending_conversion">Chờ chuyển đổi</option><option value="eligible">Đủ điều kiện</option><option value="pending_approval">Chờ duyệt</option><option value="approved">Đã duyệt</option><option value="recovery_required">Cần thu hồi</option></select></Filter>
      <Filter label="Thưởng"><select value={range.reward_status} onChange={(event) => updateFilter("reward_status", event.target.value)}><option value="">Tất cả</option><option value="pending_approval">Chờ duyệt</option><option value="cash_payable">Chờ chi tiền</option><option value="cash_paid">Đã chi tiền</option><option value="voucher_issued">Đã phát hành voucher</option></select></Filter>
    </CardContent></Card>
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5"><ReferralKpi label="Case ghi nhận" value={kpis.case_count ?? 0} /><ReferralKpi label="Tỷ lệ đủ điều kiện" value={`${kpis.case_count ? Math.round(((kpis.eligible_count ?? 0) / kpis.case_count) * 100) : 0}%`} /><ReferralKpi label="Thưởng đã duyệt" value={formatCurrency(kpis.approved_rewards ?? 0)} /><ReferralKpi label="Tiền chờ chi" value={formatCurrency(kpis.cash_payable ?? 0)} /><ReferralKpi label="Case rủi ro" value={kpis.recovery_required ?? 0} /></div>
    <Card><CardHeader><CardTitle>Chi tiết theo người giới thiệu</CardTitle><CardDescription>{report?.total ?? 0} người giới thiệu trong kết quả lọc.</CardDescription></CardHeader><CardContent className="p-0">{loading ? <LoadingReferralPanel /> : !report?.items?.length ? <ReferralEmpty>Không có dữ liệu phù hợp bộ lọc.</ReferralEmpty> : <div className="overflow-x-auto"><table className="w-full min-w-[720px] text-sm"><thead className="border-b text-left text-xs text-muted-foreground"><tr><th className="p-4">Người giới thiệu</th><th className="p-4">Loại</th><th className="p-4 text-right">Số case</th><th className="p-4 text-right">Tổng thưởng</th></tr></thead><tbody className="divide-y">{report.items.map((item) => <tr key={item.referrer_id}><td className="p-4"><p className="font-medium">{item.referrer_name ?? "Chưa có tên"}</p><p className="text-xs text-muted-foreground">{item.referrer_code ?? "Chưa có mã"}</p></td><td className="p-4">{item.referrer_type ?? "--"}</td><td className="p-4 text-right tabular-nums">{item.case_count ?? 0}</td><td className="p-4 text-right font-medium tabular-nums"><RewardAmount amount={item.reward_amount ?? 0} /></td></tr>)}</tbody></table></div>}</CardContent></Card>
  </PageContainer>;
}

function Filter({ label, children }: { label: string; children: ReactNode }) { return <label className="grid min-w-0 gap-1 text-xs font-medium">{label}{cloneElement(children as ReactElement, { className: "h-9 w-full min-w-0 rounded-md border border-input bg-background px-2 text-sm" })}</label>; }
