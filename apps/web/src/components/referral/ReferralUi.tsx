import type { ReactNode } from "react";
import type { ReferralCaseStatus, ReferralRewardStatus, ReferrerStatus, ReferrerType } from "@shared/types";
import { Badge } from "@/components/ui/badge";
import { formatCurrency } from "@/lib/utils";

const TYPE_LABELS: Record<ReferrerType, string> = { patient: "Bệnh nhân", doctor: "Bác sĩ", assistant: "Phụ tá", partner: "Đối tác" };
const CASE_LABELS: Record<ReferralCaseStatus, string> = {
  pending_conversion: "Chờ chuyển đổi", eligible: "Đủ điều kiện", pending_approval: "Chờ duyệt", approved: "Đã duyệt", rejected: "Đã từ chối", expired: "Hết hạn", recovery_required: "Cần thu hồi", recovered: "Đã thu hồi", cancelled: "Đã hủy",
};
const REWARD_LABELS: Record<ReferralRewardStatus, string> = {
  pending_approval: "Chờ duyệt", cash_payable: "Chờ chi tiền", cash_paid: "Đã chi tiền", voucher_issued: "Đã phát hành voucher", rejected: "Đã từ chối", expired: "Hết hạn", recovery_required: "Cần thu hồi", recovered: "Đã thu hồi",
};

function statusColor(status: string): "success" | "warning" | "destructive" | "secondary" {
  if (["approved", "cash_paid", "voucher_issued", "recovered", "active", "issued"].includes(status)) return "success";
  if (["eligible", "pending_approval", "cash_payable", "recovery_required"].includes(status)) return "warning";
  if (["rejected", "cancelled", "inactive"].includes(status)) return "destructive";
  return "secondary";
}

export function ReferrerTypeLabel({ type }: { type: ReferrerType }) { return <span>{TYPE_LABELS[type]}</span>; }
export function ReferrerStatusBadge({ status }: { status: ReferrerStatus }) { return <Badge variant="outline" color={statusColor(status)}>{status === "active" ? "Đang hoạt động" : "Đã ngừng"}</Badge>; }
export function ReferralCaseStatusBadge({ status }: { status: ReferralCaseStatus }) { return <Badge variant="outline" color={statusColor(status)}>{CASE_LABELS[status]}</Badge>; }
export function ReferralRewardStatusBadge({ status }: { status: ReferralRewardStatus }) { return <Badge variant="outline" color={statusColor(status)}>{REWARD_LABELS[status]}</Badge>; }

export function ReferralKpi({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return <div className="rounded-xl border border-border bg-card p-4 shadow-sm"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 text-2xl font-semibold tracking-tight tabular-nums">{value}</p>{hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}</div>;
}
export function ReferralEmpty({ children }: { children: ReactNode }) { return <p className="py-12 text-center text-sm text-muted-foreground">{children}</p>; }
export function LoadingReferralPanel() { return <div className="flex h-48 items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-4 border-muted border-t-primary" /></div>; }
export function RewardAmount({ amount }: { amount: number }) { return <span className="tabular-nums">{formatCurrency(amount)}</span>; }
