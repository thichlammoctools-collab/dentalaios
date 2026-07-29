import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogBody, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { apiGet, apiPatch, apiPost, ApiError } from "@/lib/api";
import { toast } from "@/lib/toast";
import {
  PARACLINICAL_ORDER_TYPES,
  ORDER_STATUS_LABELS,
  ORDER_GROUP_LABELS,
  getOrderTypeLabel,
} from "@shared/constants/paraclinical-orders";
import type { ParaclinicalOrder, ParaclinicalOrderStatus, ParaclinicalOrderType, ParaclinicalAbnormalFlag, ClinicalDiagnosis } from "@shared/types";

const EMPTY_DIAGNOSES: ClinicalDiagnosis[] = [];

const statusVariant: Record<ParaclinicalOrderStatus, "success" | "warning" | "destructive" | "secondary"> = {
  pending: "secondary",
  in_progress: "warning",
  completed: "success",
  cancelled: "destructive",
};

const abnormalLabel: Record<ParaclinicalAbnormalFlag, string> = {
  normal: "Bình thường",
  abnormal: "Bất thường",
  critical: "Nghiêm trọng",
};

const abnormalVariant: Record<ParaclinicalAbnormalFlag, "success" | "warning" | "destructive"> = {
  normal: "success",
  abnormal: "warning",
  critical: "destructive",
};

const ORDER_GROUPS = ["imaging", "lab", "procedure", "other"] as const;

interface Props {
  visitId: string;
  patientId: string;
  readOnly?: boolean;
}

export function ParaclinicalOrdersCard({ visitId, patientId, readOnly = false }: Props) {
  const [items, setItems] = useState<ParaclinicalOrder[]>([]);
  const [diagnoses, setDiagnoses] = useState<ClinicalDiagnosis[]>(EMPTY_DIAGNOSES);
  const [loading, setLoading] = useState(true);
  const [openCreate, setOpenCreate] = useState(false);
  const [openUpdate, setOpenUpdate] = useState<ParaclinicalOrder | null>(null);
  const [saving, setSaving] = useState(false);
  const [createForm, setCreateForm] = useState({
    order_type: "" as ParaclinicalOrderType | "",
    custom_type_name: "",
    body_site: "",
    diagnosis_id: "",
    clinical_reason: "",
    notes: "",
  });
  const [updateForm, setUpdateForm] = useState({
    status: "" as ParaclinicalOrder["status"] | "",
    result_summary: "",
    abnormal_flag: "" as ParaclinicalAbnormalFlag | "",
    cancel_reason: "",
    notes: "",
  });

  async function load() {
    setLoading(true);
    try {
      const [ordersResponse, diagResponse] = await Promise.all([
        apiGet<{ items: ParaclinicalOrder[] }>(`/api/visits/${visitId}/orders`),
        apiGet<{ items: ClinicalDiagnosis[] }>(`/api/visits/${visitId}/diagnoses`),
      ]);
      setItems(ordersResponse.items);
      setDiagnoses(diagResponse.items);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Không thể tải chỉ định");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, [visitId]);

  function openCreateDialog() {
    setCreateForm({ order_type: "", custom_type_name: "", body_site: "", diagnosis_id: "", clinical_reason: "", notes: "" });
    setOpenCreate(true);
  }

  function openUpdateDialog(order: ParaclinicalOrder) {
    setOpenUpdate(order);
    setUpdateForm({
      status: "",
      result_summary: order.result_summary ?? "",
      abnormal_flag: order.abnormal_flag ?? "",
      cancel_reason: "",
      notes: order.notes ?? "",
    });
  }

  async function saveCreate() {
    if (!createForm.order_type) { toast.error("Chọn loại chỉ định"); return; }
    if (!createForm.clinical_reason.trim()) { toast.error("Nhập lý do chỉ định"); return; }
    if (createForm.order_type === "other" && !createForm.custom_type_name.trim()) { toast.error("Nhập tên loại chỉ định"); return; }
    const needsBodySite = PARACLINICAL_ORDER_TYPES[createForm.order_type]?.group === "imaging";
    setSaving(true);
    try {
      await apiPost(`/api/visits/${visitId}/orders`, {
        order_type: createForm.order_type,
        custom_type_name: createForm.custom_type_name || undefined,
        body_site: needsBodySite ? createForm.body_site || undefined : undefined,
        diagnosis_id: createForm.diagnosis_id || undefined,
        clinical_reason: createForm.clinical_reason,
        notes: createForm.notes || undefined,
      });
      setOpenCreate(false);
      await load();
      toast.success("Đã tạo chỉ định");
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Không thể tạo chỉ định");
    } finally {
      setSaving(false);
    }
  }

  async function saveUpdate() {
    if (!openUpdate) return;
    if (updateForm.status === "cancelled" && !updateForm.cancel_reason.trim()) { toast.error("Nhập lý do hủy"); return; }
    setSaving(true);
    try {
      await apiPatch(`/api/visits/${visitId}/orders/${openUpdate.id}`, {
        status: updateForm.status || undefined,
        result_summary: updateForm.result_summary || undefined,
        abnormal_flag: updateForm.abnormal_flag || undefined,
        cancel_reason: updateForm.cancel_reason || undefined,
        notes: updateForm.notes || undefined,
      });
      setOpenUpdate(null);
      await load();
      toast.success("Đã cập nhật chỉ định");
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Không thể cập nhật");
    } finally {
      setSaving(false);
    }
  }

  const grouped = ORDER_GROUPS.map((group) => ({
    group,
    label: ORDER_GROUP_LABELS[group],
    orders: items.filter((order) => {
      const def = PARACLINICAL_ORDER_TYPES[order.order_type];
      return def?.group === group;
    }),
  })).filter((g) => g.orders.length > 0);

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between gap-4">
        <CardTitle>Chỉ định cận lâm sàng ({items.length})</CardTitle>
        {!readOnly && <Button size="sm" onClick={openCreateDialog}>Thêm chỉ định</Button>}
      </CardHeader>
      <CardContent>
        {loading ? (
          <p className="text-sm text-muted-foreground">Đang tải chỉ định...</p>
        ) : items.length === 0 ? (
          <p className="text-sm text-muted-foreground">Chưa có chỉ định cận lâm sàng.</p>
        ) : (
          <div className="space-y-4">
            {grouped.map((g) => (
              <div key={g.group}>
                <p className="mb-2 text-xs font-medium uppercase text-muted-foreground">{g.label}</p>
                <div className="space-y-2">
                  {g.orders.map((order) => (
                    <div key={order.id} className="rounded-lg border border-border p-3">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="font-medium">{order.order_type === "other" ? order.custom_type_name : getOrderTypeLabel(order.order_type)}</p>
                            <Badge variant={statusVariant[order.status]}>{ORDER_STATUS_LABELS[order.status]}</Badge>
                            {order.abnormal_flag && <Badge variant={abnormalVariant[order.abnormal_flag]}>{abnormalLabel[order.abnormal_flag]}</Badge>}
                          </div>
                          {order.body_site && <p className="mt-1 text-xs text-muted-foreground">Vị trí: {order.body_site}</p>}
                          <p className="mt-1 text-sm text-muted-foreground">Lý do: {order.clinical_reason}</p>
                          {order.diagnosis_id && (() => {
                            const diag = diagnoses.find((d) => d.id === order.diagnosis_id);
                            return diag ? <p className="mt-1 text-xs text-muted-foreground">Chẩn đoán: {diag.concept_display_vi_snapshot}{diag.icd10_code_snapshot ? ` (${diag.icd10_code_snapshot})` : ""}</p> : null;
                          })()}
                          {order.result_summary && <p className="mt-1 text-sm">Kết quả: {order.result_summary}</p>}
                          {order.notes && <p className="mt-1 text-xs text-muted-foreground">{order.notes}</p>}
                          {order.cancel_reason && <p className="mt-1 text-xs text-destructive">Lý do hủy: {order.cancel_reason}</p>}
                        </div>
                        {!readOnly && (
                          <Button variant="outline" size="sm" onClick={() => openUpdateDialog(order)}>Cập nhật</Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>

      {/* Create dialog */}
      <Dialog open={openCreate} onOpenChange={setOpenCreate} size="lg">
        <DialogHeader><DialogTitle>Thêm chỉ định cận lâm sàng</DialogTitle></DialogHeader>
        <DialogBody className="grid gap-4">
          <div className="grid gap-2">
            <Label>Loại chỉ định <span className="text-destructive">*</span></Label>
            <Select value={createForm.order_type} onChange={(e) => {
              const orderType = e.target.value as ParaclinicalOrderType;
              const needsBodySite = PARACLINICAL_ORDER_TYPES[orderType]?.group === "imaging";
              setCreateForm({ ...createForm, order_type: orderType, body_site: needsBodySite ? createForm.body_site : "" });
            }}>
              <option value="">Chọn loại</option>
              {ORDER_GROUPS.map((group) => (
                <optgroup key={group} label={ORDER_GROUP_LABELS[group]}>
                  {Object.entries(PARACLINICAL_ORDER_TYPES).filter(([, def]) => def.group === group).map(([type, def]) => (
                    <option key={type} value={type}>{def.label}</option>
                  ))}
                </optgroup>
              ))}
            </Select>
          </div>
          {createForm.order_type === "other" && (
            <div className="grid gap-2">
              <Label>Tên loại chỉ định <span className="text-destructive">*</span></Label>
              <Textarea rows={1} value={createForm.custom_type_name} onChange={(e) => setCreateForm({ ...createForm, custom_type_name: e.target.value })} placeholder="Ví dụ: Chụp MRI sọ não" />
            </div>
          )}
          {PARACLINICAL_ORDER_TYPES[createForm.order_type as ParaclinicalOrderType]?.group === "imaging" && (
            <div className="grid gap-2">
              <Label>Vị trí / Răng</Label>
              <Textarea rows={1} value={createForm.body_site} onChange={(e) => setCreateForm({ ...createForm, body_site: e.target.value })} placeholder="Ví dụ: Răng #36, Hàm trên, Toàn thân..." />
            </div>
          )}
          <div className="grid gap-2">
            <Label>Liên kết chẩn đoán</Label>
            <Select value={createForm.diagnosis_id} onChange={(e) => setCreateForm({ ...createForm, diagnosis_id: e.target.value })}>
              <option value="">Không liên kết</option>
              {diagnoses.map((d) => (
                <option key={d.id} value={d.id}>{d.concept_display_vi_snapshot}{d.icd10_code_snapshot ? ` (${d.icd10_code_snapshot})` : ""}</option>
              ))}
            </Select>
          </div>
          <div className="grid gap-2">
            <Label>Lý do chỉ định <span className="text-destructive">*</span></Label>
            <Textarea rows={3} value={createForm.clinical_reason} onChange={(e) => setCreateForm({ ...createForm, clinical_reason: e.target.value })} placeholder="Giải thích tại sao cần chỉ định..." />
          </div>
          <div className="grid gap-2">
            <Label>Ghi chú</Label>
            <Textarea rows={2} value={createForm.notes} onChange={(e) => setCreateForm({ ...createForm, notes: e.target.value })} placeholder="Ghi chú thêm (tùy chọn)" />
          </div>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpenCreate(false)}>Hủy</Button>
          <Button onClick={() => void saveCreate()} disabled={saving}>{saving ? "Đang lưu..." : "Tạo chỉ định"}</Button>
        </DialogFooter>
      </Dialog>

      {/* Update dialog */}
      <Dialog open={Boolean(openUpdate)} onOpenChange={(open) => !open && setOpenUpdate(null)} size="lg">
        <DialogHeader><DialogTitle>Cập nhật chỉ định</DialogTitle></DialogHeader>
        <DialogBody className="grid gap-4">
          {openUpdate && (
            <>
              <div className="rounded-lg border border-border bg-muted/20 p-3">
                <p className="font-medium">{openUpdate.order_type === "other" ? openUpdate.custom_type_name : getOrderTypeLabel(openUpdate.order_type)}</p>
                <p className="mt-1 text-sm text-muted-foreground">Lý do: {openUpdate.clinical_reason}</p>
              </div>
              <div className="grid gap-2">
                <Label>Chuyển trạng thái</Label>
                <Select value={updateForm.status} onChange={(e) => setUpdateForm({ ...updateForm, status: e.target.value as ParaclinicalOrderStatus })}>
                  <option value="">Không đổi</option>
                  {openUpdate.status === "pending" && <option value="in_progress">Bắt đầu thực hiện</option>}
                  {openUpdate.status === "in_progress" && <option value="completed">Hoàn thành</option>}
                  {(openUpdate.status === "pending" || openUpdate.status === "in_progress") && <option value="cancelled">Hủy</option>}
                </Select>
              </div>
              {updateForm.status === "cancelled" && (
                <div className="grid gap-2">
                  <Label>Lý do hủy <span className="text-destructive">*</span></Label>
                  <Textarea rows={2} value={updateForm.cancel_reason} onChange={(e) => setUpdateForm({ ...updateForm, cancel_reason: e.target.value })} />
                </div>
              )}
              {(updateForm.status === "completed" || openUpdate.status === "completed") && (
                <>
                  <div className="grid gap-2">
                    <Label>Kết quả</Label>
                    <Textarea rows={3} value={updateForm.result_summary} onChange={(e) => setUpdateForm({ ...updateForm, result_summary: e.target.value })} placeholder="Tóm tắt kết quả..." />
                  </div>
                  <div className="grid gap-2">
                    <Label>Đánh giá</Label>
                    <Select value={updateForm.abnormal_flag} onChange={(e) => setUpdateForm({ ...updateForm, abnormal_flag: e.target.value as ParaclinicalAbnormalFlag })}>
                      <option value="">Chưa đánh giá</option>
                      <option value="normal">Bình thường</option>
                      <option value="abnormal">Bất thường</option>
                      <option value="critical">Nghiêm trọng</option>
                    </Select>
                  </div>
                </>
              )}
              <div className="grid gap-2">
                <Label>Ghi chú</Label>
                <Textarea rows={2} value={updateForm.notes} onChange={(e) => setUpdateForm({ ...updateForm, notes: e.target.value })} />
              </div>
            </>
          )}
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpenUpdate(null)}>Hủy</Button>
          <Button onClick={() => void saveUpdate()} disabled={saving}>{saving ? "Đang lưu..." : "Lưu"}</Button>
        </DialogFooter>
      </Dialog>
    </Card>
  );
}
