import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { TreatmentPlanItemForm } from "@/components/TreatmentPlanItemForm";
import { apiDelete, apiGet, apiPost, getToken, ApiError } from "@/lib/api";
import { toast } from "@/lib/toast";
import { formatCurrency, formatDateTime } from "@/lib/utils";
import type { TreatmentPlan, TreatmentPlanItem } from "@shared/types";

export function TreatmentPlanDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [plan, setPlan] = useState<TreatmentPlan | null>(null);
  const [items, setItems] = useState<TreatmentPlanItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [openForm, setOpenForm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pdfLoading, setPdfLoading] = useState(false);

  async function load() {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const p = await apiGet<TreatmentPlan>(`/api/treatment-plans/${id}`);
      const its = await apiGet<{ items: TreatmentPlanItem[] }>(
        `/api/treatment-plans/${id}/items`,
      );
      setPlan(p);
      setItems(its.items);
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : "Lỗi tải plan";
      setError(msg);
      toast.error(msg);
      if (err instanceof ApiError && err.status === 401) {
        // Token expired — prompt re-login
        setTimeout(() => navigate("/login"), 500);
      }
    } finally {
      setLoading(false);
    }
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
      a.click();
      URL.revokeObjectURL(url);
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
      navigate(`/patients/${plan.patient_id}`);
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
      <div className="mx-auto max-w-5xl p-6">
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
      </div>
    );
  }

  const canEdit = plan.status === "draft";
  const canDelete = plan.status !== "completed";
  const canApprove = plan.status === "draft" && items.length > 0;
  const canHandOver = plan.status === "approved";

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-6 py-6">
      <Breadcrumbs
        items={[
          { label: "Bệnh nhân", href: `/patients/${plan.patient_id}` },
          { label: `Kế hoạch` },
        ]}
      />
      <div>
        <p className="text-sm text-muted-foreground">
          <a href={`/patients/${plan.patient_id}`} className="hover:underline">
            ← Quay lại bệnh nhân
          </a>
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
          <div className="flex items-center justify-between">
            <CardTitle>Hạng mục ({items.length})</CardTitle>
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
                  <TableHead>Thủ thuật</TableHead>
                  <TableHead>Mô tả</TableHead>
                  <TableHead className="text-right">Đơn giá</TableHead>
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
                      <Badge variant="outline">{item.procedure}</Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{item.description}</TableCell>
                    <TableCell className="text-right">
                      {formatCurrency(item.unit_cost, plan.currency)}
                    </TableCell>
                    {canEdit && (
                      <TableCell>
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => onDeleteItem(item)}
                        >
                          Xóa
                        </Button>
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
          {canEdit && <Button onClick={() => setOpenForm(true)}>+ Thêm hạng mục</Button>}
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
        onCreated={() => load()}
      />
    </div>
  );
}