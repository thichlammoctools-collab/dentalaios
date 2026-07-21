import { useEffect, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { TreatmentPlanItemForm } from "@/components/TreatmentPlanItemForm";
import { AppointmentForm } from "@/components/schedule/AppointmentForm";
import { Select } from "@/components/ui/select";
import { ProfileAvatar } from "@/components/ProfileAvatar";
import { apiDelete, apiGet, apiPatch, apiPost, getToken, ApiError } from "@/lib/api";
import { toast } from "@/lib/toast";
import { formatCurrency, formatDateTime } from "@/lib/utils";
import { patientReturnPath } from "@/lib/patient-navigation";
import { PageContainer } from "@/components/PageContainer";
import type { TreatmentCase, TreatmentCaseFinancialSummary, TreatmentCaseMilestone, TreatmentCaseMilestoneStatus, TreatmentCaseType, TreatmentMilestoneAppointment, TreatmentPlan, TreatmentPlanItem } from "@shared/types";

const CASE_TYPE_LABELS: Record<TreatmentCaseType, string> = {
  general: "Điều trị tổng quát",
  implant: "Implant",
  orthodontics: "Chỉnh nha",
  prosthodontics: "Phục hình",
  full_mouth: "Điều trị toàn hàm",
  other: "Khác",
};

const CASE_STATUS_LABELS: Record<TreatmentCase["status"], string> = {
  active: "Đang điều trị",
  paused: "Tạm ngưng",
  completed: "Hoàn tất",
  cancelled: "Đã hủy",
};

const MILESTONE_STATUS_LABELS: Record<TreatmentCaseMilestoneStatus, string> = {
  not_started: "Chưa bắt đầu",
  in_progress: "Đang thực hiện",
  completed: "Hoàn thành",
  skipped: "Bỏ qua",
};

const MILESTONE_STATUS_VARIANTS: Record<TreatmentCaseMilestoneStatus, "secondary" | "warning" | "success" | "outline"> = {
  not_started: "secondary",
  in_progress: "warning",
  completed: "success",
  skipped: "outline",
};

export function TreatmentPlanDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [plan, setPlan] = useState<TreatmentPlan | null>(null);
  const [items, setItems] = useState<TreatmentPlanItem[]>([]);
  const [treatmentCase, setTreatmentCase] = useState<TreatmentCase | null>(null);
  const [milestones, setMilestones] = useState<TreatmentCaseMilestone[]>([]);
  const [milestoneAppointments, setMilestoneAppointments] = useState<Record<string, TreatmentMilestoneAppointment[]>>({});
  const [financials, setFinancials] = useState<TreatmentCaseFinancialSummary | null>(null);
  const [scheduleMilestone, setScheduleMilestone] = useState<TreatmentCaseMilestone | null>(null);
  const [caseType, setCaseType] = useState<TreatmentCaseType>("general");
  const [caseSaving, setCaseSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [openForm, setOpenForm] = useState(false);
  const [editingItem, setEditingItem] = useState<TreatmentPlanItem | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pdfLoading, setPdfLoading] = useState(false);

  async function load() {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const p = await apiGet<TreatmentPlan>(`/api/treatment-plans/${id}`);
      const [its, caseResult] = await Promise.all([
        apiGet<{ items: TreatmentPlanItem[] }>(`/api/treatment-plans/${id}/items`),
        apiGet<{ case: TreatmentCase | null }>(`/api/treatment-plans/${id}/case`),
      ]);
      setPlan(p);
      setItems(its.items);
      setTreatmentCase(caseResult.case);
      if (caseResult.case) {
        const [milestoneResult, financialResult] = await Promise.all([
          apiGet<{ items: TreatmentCaseMilestone[] }>(`/api/treatment-plans/${id}/case/milestones`),
          apiGet<TreatmentCaseFinancialSummary>(`/api/treatment-plans/${id}/case/financial-summary`),
        ]);
        setMilestones(milestoneResult.items);
        setFinancials(financialResult);
        const links = await Promise.all(milestoneResult.items.map(async (milestone) => [
          milestone.id,
          await apiGet<{ items: TreatmentMilestoneAppointment[] }>(`/api/treatment-plans/${id}/case/milestones/${milestone.id}/appointments`),
        ] as const));
        setMilestoneAppointments(Object.fromEntries(links.map(([milestoneId, result]) => [milestoneId, result.items])));
      } else {
        setMilestones([]);
        setMilestoneAppointments({});
        setFinancials(null);
      }
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : "Lỗi tải plan";
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }

  async function recordExecution(link: TreatmentMilestoneAppointment, milestone: TreatmentCaseMilestone, execution_status: "partially_completed" | "completed" | "not_performed") {
    if (!plan) return;
    setCaseSaving(true);
    try {
      await apiPatch(`/api/treatment-plans/${plan.id}/case/milestones/${milestone.id}/appointments/${link.appointment_id}/execution`, { execution_status });
      await load();
      toast.success("Đã ghi nhận kết quả buổi hẹn. Xác nhận milestone lâm sàng riêng khi phù hợp.");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Không thể ghi nhận kết quả buổi hẹn");
    } finally { setCaseSaving(false); }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function onApprove() {
    if (!plan) return;
    try {
      const updated = await apiPost<TreatmentPlan>(
        `/api/treatment-plans/${plan.id}/approve`,
        {},
      );
      toast.success("Đã duyệt kế hoạch");
      setPlan(updated);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Lỗi duyệt");
    }
  }

  async function activateCase() {
    if (!plan) return;
    setCaseSaving(true);
    try {
      const created = await apiPost<TreatmentCase>(`/api/treatment-plans/${plan.id}/case/activate`, {
        case_type: caseType,
      });
      setTreatmentCase(created);
      await load();
      toast.success("Đã kích hoạt ca điều trị");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Không thể kích hoạt ca điều trị");
    } finally {
      setCaseSaving(false);
    }
  }

  async function changeMilestoneStatus(milestone: TreatmentCaseMilestone, status: TreatmentCaseMilestoneStatus) {
    if (!plan) return;
    const reason = status === "skipped" ? window.prompt("Lý do bỏ qua hạng mục này:") : undefined;
    if (status === "skipped" && !reason?.trim()) return;
    setCaseSaving(true);
    try {
      await apiPatch(`/api/treatment-plans/${plan.id}/case/milestones/${milestone.id}`, { status, ...(reason ? { reason } : {}) });
      await load();
      toast.success(status === "in_progress" ? "Đã bắt đầu milestone" : status === "completed" ? "Đã hoàn thành milestone" : "Đã bỏ qua milestone");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Không thể cập nhật milestone");
    } finally {
      setCaseSaving(false);
    }
  }

  async function changeCaseStatus(action: "pause" | "resume" | "complete" | "cancel") {
    if (!plan) return;
    const requiresReason = action === "pause" || action === "cancel";
    const reason = requiresReason ? window.prompt(action === "pause" ? "Lý do tạm ngưng ca điều trị:" : "Lý do hủy ca điều trị:") : undefined;
    if (requiresReason && !reason?.trim()) return;
    setCaseSaving(true);
    try {
      const updated = await apiPost<TreatmentCase>(`/api/treatment-plans/${plan.id}/case/${action}`, reason ? { reason } : {});
      setTreatmentCase(updated);
      toast.success(
        action === "pause" ? "Đã tạm ngưng ca" : action === "resume" ? "Đã tiếp tục ca" : action === "complete" ? "Đã hoàn tất ca" : "Đã hủy ca",
      );
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Không thể cập nhật ca điều trị");
    } finally {
      setCaseSaving(false);
    }
  }

  async function onDeleteItem(item: TreatmentPlanItem) {
    if (!plan) return;
    if (!confirm(`Xóa hạng mục ${item.tooth_number != null ? `#${item.tooth_number}` : "toàn hàm"} - ${item.procedure}?`)) return;
    try {
      await apiDelete(`/api/treatment-plans/${plan.id}/items/${item.id}`);
      toast.success("Đã xóa");
      load();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Lỗi xóa");
    }
  }

  async function onDownloadPdf() {
    if (!plan) return;
    setPdfLoading(true);
    try {
      const token = getToken();
      const res = await fetch(`/api/treatment-plans/${plan.id}/pdf`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new ApiError(body.error ?? `HTTP ${res.status}`, res.status);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Ke-hoach-dieu-tri-${plan.id}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      // Revoking immediately can truncate downloads in some browsers.
      window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
      toast.success("Đã tải PDF");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Lỗi PDF");
    } finally {
      setPdfLoading(false);
    }
  }

  async function onDeletePlan() {
    if (!plan) return;
    if (!confirm("Xóa kế hoạch điều trị này? Hành động này không thể hoàn tác.")) return;
    try {
      await apiDelete(`/api/treatment-plans/${plan.id}`);
      toast.success("Đã xóa kế hoạch");
      navigate(patientReturnPath(searchParams.get("return_to"), plan.patient_id, "plans"));
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Lỗi xóa");
    }
  }

  async function onLarkHandover() {
    if (!plan) return;
    try {
      const res = await apiPost<{
        mocked: boolean;
        taskId: string;
        taskUrl?: string;
        warning?: string;
      }>(`/api/treatment-plans/${plan.id}/lark-handover`, {});
      if (res.mocked) {
        toast.info(`Lark task đã được tạo (mock): ${res.taskId}`);
      } else {
        toast.success(`Lark task đã tạo: ${res.taskId}`);
      }
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Lỗi Lark");
    }
  }

  if (loading || !plan) {
    return (
      <PageContainer size="detail">
        {error ? (
          <Card>
            <CardContent className="p-6">
              <p className="text-sm text-destructive">Lỗi: {error}</p>
              <Button onClick={load} variant="outline" className="mt-3">
                Thử lại
              </Button>
            </CardContent>
          </Card>
        ) : (
          <p className="text-sm text-muted-foreground">Đang tải…</p>
        )}
      </PageContainer>
    );
  }

  const canEdit = plan.status === "draft";
  const canDelete = plan.can_delete === true;
  const canApprove = plan.status === "draft" && items.length > 0;
  const canHandOver = plan.status === "approved";
  const returnPath = patientReturnPath(searchParams.get("return_to"), plan.patient_id, "plans");

  return (
    <PageContainer size="detail">
      <Breadcrumbs
        items={[
          { label: "Bệnh nhân", href: "/patients" },
          { label: "Kế hoạch điều trị", href: returnPath },
          { label: `Kế hoạch` },
        ]}
      />
      <div>
        <p className="text-sm text-muted-foreground">
          <Button variant="ghost" size="sm" onClick={() => navigate(returnPath)}>
            ← Quay lại kế hoạch điều trị
          </Button>
        </p>
        <div className="mt-1 flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Kế hoạch điều trị</h1>
            <p className="text-sm text-muted-foreground">
              Tạo {formatDateTime(plan.created_at)}
              {plan.approved_at && ` · Duyệt ${formatDateTime(plan.approved_at)}`}
            </p>
          </div>
          <Badge
            variant={
              plan.status === "approved" || plan.status === "completed"
                ? "success"
                : plan.status === "cancelled"
                  ? "destructive"
                  : "warning"
            }
          >
            {plan.status}
          </Badge>
        </div>
       </div>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle>Ca điều trị</CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">Milestone được tạo tự động từ các hạng mục của kế hoạch đã duyệt.</p>
            </div>
            {treatmentCase && (
              <Badge variant={treatmentCase.status === "active" || treatmentCase.status === "completed" ? "success" : "warning"}>
                {CASE_STATUS_LABELS[treatmentCase.status]}
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {!treatmentCase ? (
            plan.status === "approved" ? (
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                <label className="grid flex-1 gap-1.5 text-sm font-medium">
                  Loại ca điều trị
                  <Select value={caseType} onChange={(event) => setCaseType(event.target.value as TreatmentCaseType)}>
                    {Object.entries(CASE_TYPE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                  </Select>
                </label>
                <Button onClick={activateCase} disabled={caseSaving}>{caseSaving ? "Đang kích hoạt..." : "Kích hoạt ca điều trị"}</Button>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Duyệt báo giá trước khi kích hoạt ca điều trị.</p>
            )
          ) : (
            <div className="space-y-4">
               <div className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
                <div><p className="text-muted-foreground">Mã ca</p><p className="font-mono font-medium">{treatmentCase.case_number}</p></div>
                <div><p className="text-muted-foreground">Loại ca</p><p className="font-medium">{CASE_TYPE_LABELS[treatmentCase.case_type]}</p></div>
                <div><p className="text-muted-foreground">Chi nhánh chính</p><p className="font-medium">{treatmentCase.primary_branch_name ?? treatmentCase.primary_branch_id}</p></div>
                <div><p className="text-muted-foreground">Bác sĩ phụ trách</p><p className="font-medium">{treatmentCase.primary_clinician_name ?? treatmentCase.primary_clinician_id}</p></div>
               </div>
               <div className="rounded-lg border bg-muted/30 p-3 text-sm">
                 <div className="flex items-center justify-between"><span className="text-muted-foreground">Tiến độ hạng mục</span><span className="font-semibold">{milestones.filter((item) => ["completed", "skipped"].includes(item.status)).length}/{milestones.length}</span></div>
                 <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${milestones.length ? (milestones.filter((item) => ["completed", "skipped"].includes(item.status)).length / milestones.length) * 100 : 0}%` }} /></div>
               </div>
               {treatmentCase.target_completed_at && <p className="text-sm text-muted-foreground">Dự kiến hoàn thành: {treatmentCase.target_completed_at}</p>}
              {treatmentCase.paused_reason && <p className="rounded-md bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950/40 dark:text-amber-100">Lý do tạm ngưng: {treatmentCase.paused_reason}</p>}
              {treatmentCase.cancelled_reason && <p className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">Lý do hủy: {treatmentCase.cancelled_reason}</p>}
               <div className="flex flex-wrap gap-2">
                {treatmentCase.status === "active" && <><Button variant="outline" onClick={() => void changeCaseStatus("pause")} disabled={caseSaving}>Tạm ngưng</Button><Button onClick={() => void changeCaseStatus("complete")} disabled={caseSaving}>Hoàn tất ca</Button><Button variant="destructive" onClick={() => void changeCaseStatus("cancel")} disabled={caseSaving}>Hủy ca</Button></>}
                {treatmentCase.status === "paused" && <><Button onClick={() => void changeCaseStatus("resume")} disabled={caseSaving}>Tiếp tục ca</Button><Button variant="destructive" onClick={() => void changeCaseStatus("cancel")} disabled={caseSaving}>Hủy ca</Button></>}
               </div>
               <div className="border-t pt-4">
                 <div className="mb-4 flex items-center justify-between"><div><p className="font-medium">Timeline điều trị</p><p className="text-sm text-muted-foreground">Thực hiện lần lượt các hạng mục đã chốt trong kế hoạch.</p></div><Badge variant="outline">{milestones.length} milestone</Badge></div>
                 {milestones.length === 0 ? <p className="text-sm text-muted-foreground">Chưa có milestone. Tải lại ca hoặc liên hệ quản trị nếu ca được tạo trước khi tính năng milestone được kích hoạt.</p> : <ol className="relative ml-2 border-l border-border pl-5">{milestones.map((milestone, index) => <li key={milestone.id} className="relative pb-5 last:pb-0"><span className={`absolute -left-[1.82rem] top-1 grid h-5 w-5 place-items-center rounded-full border-2 border-background ${milestone.status === "completed" ? "bg-emerald-500" : milestone.status === "in_progress" ? "bg-amber-500" : milestone.status === "skipped" ? "bg-slate-400" : "bg-muted"}`}><span className="h-1.5 w-1.5 rounded-full bg-white" /></span><div className="rounded-lg border bg-card p-3"><div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between"><div><p className="text-xs text-muted-foreground">Mốc {index + 1} · {milestone.item.tooth_number != null ? `Răng #${milestone.item.tooth_number}` : "Toàn hàm"}</p><p className="font-medium">{milestone.item.service_name ?? milestone.item.procedure}</p><p className="mt-1 text-sm text-muted-foreground">{milestone.item.description}</p></div><div className="text-left sm:text-right"><Badge variant={MILESTONE_STATUS_VARIANTS[milestone.status]}>{MILESTONE_STATUS_LABELS[milestone.status]}</Badge><p className="mt-1 text-sm font-medium">{formatCurrency(milestone.item.unit_cost, plan.currency)}</p></div></div>{milestone.status === "in_progress" && milestone.started_at && <p className="mt-2 text-xs text-muted-foreground">Bắt đầu: {formatDateTime(milestone.started_at)}</p>}{milestone.status === "completed" && milestone.completed_at && <p className="mt-2 text-xs text-emerald-700 dark:text-emerald-300">Hoàn thành: {formatDateTime(milestone.completed_at)}</p>}{milestone.status === "skipped" && <p className="mt-2 text-xs text-muted-foreground">Bỏ qua: {milestone.skipped_reason}</p>}{treatmentCase.status === "active" && !["completed", "skipped"].includes(milestone.status) && <div className="mt-3 flex flex-wrap gap-2">{milestone.status === "not_started" && <Button size="sm" variant="outline" disabled={caseSaving} onClick={() => void changeMilestoneStatus(milestone, "in_progress")}>Bắt đầu</Button>}<Button size="sm" disabled={caseSaving} onClick={() => void changeMilestoneStatus(milestone, "completed")}>Hoàn thành</Button><Button size="sm" variant="ghost" disabled={caseSaving} onClick={() => void changeMilestoneStatus(milestone, "skipped")}>Bỏ qua</Button></div>}</div></li>)}</ol>}
               </div>
             </div>
          )}
        </CardContent>
      </Card>

      {treatmentCase && (
        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <CardTitle>Lịch hẹn và tài chính theo ca</CardTitle>
                <p className="mt-1 text-sm text-muted-foreground">Lịch hẹn hỗ trợ theo dõi milestone; chỉ xác nhận lâm sàng mới thay đổi tiến độ điều trị.</p>
              </div>
              {financials && <Badge variant={financials.outstanding_amount > 0 ? "warning" : "success"}>{financials.outstanding_amount > 0 ? `Còn thu ${formatCurrency(financials.outstanding_amount, plan.currency)}` : "Đã thu đủ"}</Badge>}
            </div>
          </CardHeader>
          <CardContent className="space-y-5">
            {financials && <div className="grid gap-3 text-sm sm:grid-cols-3"><div className="rounded-lg border p-3"><p className="text-muted-foreground">Giá trị kế hoạch</p><p className="mt-1 font-semibold">{formatCurrency(financials.plan_total, plan.currency)}</p></div><div className="rounded-lg border p-3"><p className="text-muted-foreground">Đã thu xác nhận</p><p className="mt-1 font-semibold text-emerald-700 dark:text-emerald-300">{formatCurrency(financials.confirmed_paid, plan.currency)}</p></div><div className="rounded-lg border p-3"><p className="text-muted-foreground">Còn phải thu</p><p className="mt-1 font-semibold">{formatCurrency(financials.outstanding_amount, plan.currency)}</p></div></div>}
            <div className="space-y-3">
              {milestones.map((milestone) => {
                const links = milestoneAppointments[milestone.id] ?? [];
                const next = links.find((link) => !["cancelled", "no_show", "completed"].includes(link.appointment.status));
                return <div key={milestone.id} className="rounded-lg border p-3"><div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between"><div><p className="font-medium">{milestone.item.service_name ?? milestone.item.procedure}{milestone.item.tooth_number != null ? ` · Răng #${milestone.item.tooth_number}` : " · Toàn hàm"}</p><p className="text-sm text-muted-foreground">{next ? `Lịch tiếp theo: ${formatDateTime(next.appointment.scheduled_at)}` : "Chưa có lịch hẹn"}</p></div>{treatmentCase.status === "active" && !["completed", "skipped"].includes(milestone.status) && <Button size="sm" variant="outline" onClick={() => setScheduleMilestone(milestone)}>Đặt lịch</Button>}</div>{links.length > 0 && <div className="mt-3 space-y-2 border-t pt-3">{links.map((link) => <div key={link.id} className="flex flex-col gap-2 rounded-md bg-muted/30 p-2 text-sm sm:flex-row sm:items-center sm:justify-between"><div><p>{formatDateTime(link.appointment.scheduled_at)} · {link.appointment.duration_min} phút</p><p className="text-xs text-muted-foreground">Lịch: {link.appointment.status} · Kết quả: {link.execution_status}</p></div><div className="flex gap-2">{link.appointment.status === "completed" && link.execution_status === "planned" && <><Button size="sm" variant="outline" disabled={caseSaving} onClick={() => void recordExecution(link, milestone, "partially_completed")}>Một phần</Button><Button size="sm" variant="outline" disabled={caseSaving} onClick={() => void recordExecution(link, milestone, "completed")}>Đã thực hiện</Button><Button size="sm" variant="ghost" disabled={caseSaving} onClick={() => void recordExecution(link, milestone, "not_performed")}>Chưa thực hiện</Button></>}</div></div>)}</div>}</div>;
              })}
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Thủ thuật & dịch vụ điều trị ({items.length})</CardTitle>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Tổng:</span>
              <span className="text-lg font-semibold">
                {formatCurrency(plan.total_cost, plan.currency)}
              </span>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {items.length === 0 ? (
            <p className="text-sm text-muted-foreground">Chưa có hạng mục nào.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Răng</TableHead>
                    <TableHead>Dịch vụ</TableHead>
                  <TableHead>Mô tả</TableHead>
                  <TableHead>Bác sĩ điều trị</TableHead>
                  <TableHead>Phụ tá</TableHead>
                  <TableHead className="text-right">Đơn giá (gồm VAT)</TableHead>
                  {canEdit && <TableHead></TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell className="font-mono">
                      {item.tooth_number != null ? `#${item.tooth_number}` : <span className="text-xs font-normal text-orange-700">Toàn hàm</span>}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap items-center gap-2">
                        {item.service_code && <Badge variant="outline">{item.service_code}</Badge>}
                        <span>{item.service_name ?? item.procedure}</span>
                        {item.service_name && <span className="text-xs text-muted-foreground">{item.procedure}</span>}
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{item.description}</TableCell>
                    <TableCell>{item.treating_clinician_name ? <div className="flex items-center gap-2"><ProfileAvatar subject="users" entityId={item.treating_clinician_id} name={item.treating_clinician_name} size="sm" /><span>{item.treating_clinician_name}</span></div> : "—"}</TableCell>
                    <TableCell>{item.assistant_name ? <div className="flex items-center gap-2"><ProfileAvatar subject="users" entityId={item.assistant_id} name={item.assistant_name} size="sm" /><span>{item.assistant_name}</span></div> : "—"}</TableCell>
                    <TableCell className="text-right">
                      {formatCurrency(item.unit_cost, plan.currency)}
                    </TableCell>
                     {canEdit && (
                       <TableCell>
                        <div className="flex items-center justify-end gap-2">
                         <Button
                           size="sm"
                           variant="outline"
                           onClick={() => {
                             setEditingItem(item);
                             setOpenForm(true);
                           }}
                         >
                           Sửa
                         </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => onDeleteItem(item)}
                        >
                          Xóa
                        </Button>
                        </div>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Thao tác</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {canEdit && <Button onClick={() => { setEditingItem(null); setOpenForm(true); }}>+ Thêm thủ thuật/dịch vụ</Button>}
          {canEdit && plan.visit_id && (
            <Button
              variant="outline"
              className="border-purple-200 bg-gradient-to-r from-purple-50 to-blue-50 text-slate-900 hover:from-purple-100 hover:to-blue-100 dark:border-purple-800 dark:from-purple-950/50 dark:to-blue-950/50 dark:text-purple-100 dark:hover:from-purple-900/60 dark:hover:to-blue-900/60"
              onClick={() => navigate(`/treatment-plans/${plan.id}/ai-suggest`)}
            >
              <span className="mr-1">✨</span>
              AI gợi ý hạng mục
            </Button>
          )}
          {canApprove && <Button onClick={onApprove}>Duyệt kế hoạch</Button>}
          {canDelete && (
            <Button variant="destructive" onClick={onDeletePlan}>Xóa kế hoạch</Button>
          )}
          <Button variant="outline" onClick={onDownloadPdf} disabled={pdfLoading || items.length === 0}>
            {pdfLoading ? (
              <>
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                Đang tạo PDF…
              </>
            ) : (
              <>
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v6a2 2 0 002 2h6" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 13h6M9 17h4" />
                </svg>
                Xuất PDF báo giá
              </>
            )}
          </Button>
          {canHandOver && (
            <Button variant="outline" onClick={onLarkHandover}>
              📨 Tạo Lark handover
            </Button>
          )}
        </CardContent>
      </Card>

      <TreatmentPlanItemForm
        open={openForm}
        onOpenChange={setOpenForm}
        planId={plan.id}
        item={editingItem}
        onCreated={() => {
          setEditingItem(null);
          void load();
        }}
      />
      {scheduleMilestone && treatmentCase && <AppointmentForm
        open
        onOpenChange={(open) => { if (!open) setScheduleMilestone(null); }}
        milestone={{
          planId: plan.id,
          milestoneId: scheduleMilestone.id,
          patientId: treatmentCase.patient_id,
          procedure: scheduleMilestone.item.service_name ?? scheduleMilestone.item.procedure,
          label: `${scheduleMilestone.item.service_name ?? scheduleMilestone.item.procedure}${scheduleMilestone.item.tooth_number != null ? ` · Răng #${scheduleMilestone.item.tooth_number}` : " · Toàn hàm"}`,
          availableMilestones: milestones.filter((milestone) => !["completed", "skipped"].includes(milestone.status)),
        }}
        onCreated={() => { setScheduleMilestone(null); void load(); }}
      />}
    </PageContainer>
  );
}
