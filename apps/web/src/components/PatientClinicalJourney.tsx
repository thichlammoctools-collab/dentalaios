import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogBody,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { apiGet, ApiError } from "@/lib/api";
import { formatDateTime } from "@/lib/utils";
import { toast } from "@/lib/toast";
import { withPatientReturnContext } from "@/lib/patient-navigation";
import type {
  ClinicalJourney,
  ClinicalJourneyCompletedProcedure,
  ClinicalJourneyPlan,
  ClinicalJourneyVisit,
} from "@shared/types";

const PLAN_STATUS_LABELS: Record<ClinicalJourneyPlan["status"], string> = {
  draft: "Nháp",
  approved: "Đã duyệt",
  completed: "Hoàn tất",
  cancelled: "Đã hủy",
};

const VISIT_STATUS_LABELS: Record<ClinicalJourneyVisit["status"], string> = {
  in_progress: "Đang khám",
  completed: "Hoàn tất",
  cancelled: "Đã hủy",
};

const PROCEDURE_LABELS: Record<string, string> = {
  examination: "Khám & chẩn đoán",
  filling: "Trám răng",
  root_canal: "Điều trị tủy",
  extraction: "Nhổ răng",
  crown: "Bọc mão răng",
  scaling: "Cạo vôi răng",
  implant: "Cấy ghép implant",
  bridge: "Cầu răng sứ",
  veneer: "Dán sứ veneer",
  fluoride: "Tráng fluoride",
};

type JourneyRow =
  | { kind: "visit"; id: string; date: string; visit: ClinicalJourneyVisit }
  | { kind: "procedure"; id: string; date: string; procedure: ClinicalJourneyCompletedProcedure };

function procedureLabel(procedure: ClinicalJourneyCompletedProcedure) {
  const name = procedure.service_name ?? PROCEDURE_LABELS[procedure.procedure] ?? procedure.procedure;
  return `${procedure.tooth_number ? `R${procedure.tooth_number}: ` : ""}${name}`;
}

function names(names: string[]) {
  return names.length > 0 ? names.join(", ") : "—";
}

export function PatientClinicalJourney({ patientId }: { patientId: string }) {
  const navigate = useNavigate();
  const [journey, setJourney] = useState<ClinicalJourney | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedProcedure, setSelectedProcedure] = useState<ClinicalJourneyCompletedProcedure | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadJourney() {
      setLoading(true);
      try {
        const result = await apiGet<ClinicalJourney>(`/api/patients/${patientId}/clinical-journey`);
        if (!cancelled) setJourney(result);
      } catch (err) {
        if (!cancelled) toast.error(err instanceof ApiError ? err.message : "Không thể tải hành trình lâm sàng");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadJourney();
    return () => {
      cancelled = true;
    };
  }, [patientId]);

  const findingsByVisit = new Map<string, NonNullable<ClinicalJourney>["findings"]>();
  const plansByVisit = new Map<string, ClinicalJourneyPlan[]>();
  for (const finding of journey?.findings ?? []) {
    const items = findingsByVisit.get(finding.visit_id) ?? [];
    items.push(finding);
    findingsByVisit.set(finding.visit_id, items);
  }
  for (const plan of journey?.plans ?? []) {
    const items = plansByVisit.get(plan.visit_id) ?? [];
    items.push(plan);
    plansByVisit.set(plan.visit_id, items);
  }

  const rows: JourneyRow[] = [
    ...(journey?.visits ?? []).map((visit) => ({ kind: "visit" as const, id: visit.id, date: visit.date, visit })),
    ...(journey?.completed_procedures ?? []).map((procedure) => ({ kind: "procedure" as const, id: procedure.id, date: procedure.completed_at, procedure })),
  ].sort((left, right) => new Date(right.date).getTime() - new Date(left.date).getTime());

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <p className="text-sm text-muted-foreground">Tóm tắt chẩn đoán, kế hoạch và thủ thuật đã hoàn thành theo từng thời điểm.</p>
        <Badge variant="outline" className="gap-1.5 px-2.5 py-1">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
          {rows.length} sự kiện lâm sàng
        </Badge>
      </div>

      {loading ? (
        <div className="rounded-lg border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">Đang tải hành trình lâm sàng...</div>
      ) : rows.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">Chưa có dữ liệu lâm sàng.</div>
      ) : (
        <div className="overflow-x-auto">
          <Table className="min-w-[900px] text-xs">
            <TableHeader>
              <TableRow>
                <TableHead className="w-44">Ngày khám</TableHead>
                <TableHead className="min-w-48">Chẩn đoán</TableHead>
                <TableHead className="min-w-60">Kế hoạch điều trị</TableHead>
                <TableHead className="min-w-56">Thủ thuật đã làm</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => {
                if (row.kind === "procedure") {
                  return (
                    <TableRow key={`procedure-${row.id}`}>
                      <TableCell className="align-top">
                        <p className="font-medium"><time dateTime={row.date}>{formatDateTime(row.date)}</time></p>
                        <Badge variant="success" className="mt-1.5 text-[10px]">Hoàn thành thủ thuật</Badge>
                      </TableCell>
                      <TableCell className="align-top text-muted-foreground">—</TableCell>
                      <TableCell className="align-top text-muted-foreground">—</TableCell>
                      <TableCell className="align-top">
                        <button type="button" className="text-left font-medium hover:text-primary hover:underline" onClick={() => setSelectedProcedure(row.procedure)}>
                          {procedureLabel(row.procedure)}
                        </button>
                      </TableCell>
                    </TableRow>
                  );
                }

                const findings = findingsByVisit.get(row.visit.id) ?? [];
                const plans = plansByVisit.get(row.visit.id) ?? [];
                return (
                  <TableRow key={`visit-${row.id}`}>
                    <TableCell className="align-top">
                      <button type="button" className="block text-left font-medium hover:text-primary hover:underline" onClick={() => navigate(withPatientReturnContext(`/visits/${row.visit.id}`, patientId, "journey"))}>
                        <time dateTime={row.date}>{formatDateTime(row.date)}</time>
                      </button>
                      <Badge variant={row.visit.status === "completed" ? "success" : row.visit.status === "cancelled" ? "destructive" : "warning"} className="mt-1.5 text-[10px]">
                        {VISIT_STATUS_LABELS[row.visit.status]}
                      </Badge>
                    </TableCell>
                    <TableCell className="align-top">
                      {findings.length === 0 ? <span className="text-muted-foreground">Chưa ghi nhận</span> : <div className="space-y-2">{findings.map((finding) => (
                        <div key={finding.id}>
                          <button type="button" className="font-medium hover:text-primary hover:underline" onClick={() => navigate(withPatientReturnContext(`/visits/${row.visit.id}`, patientId, "journey"))}>
                            {finding.code ?? "Finding chưa có mã"}
                          </button>
                          <p className="mt-0.5 text-muted-foreground">BS. {row.visit.treating_clinician_name ?? "—"}</p>
                          <p className="text-muted-foreground">Phụ tá: {row.visit.assistant_name ?? "—"}</p>
                        </div>
                      ))}</div>}
                    </TableCell>
                    <TableCell className="align-top">
                      {plans.length === 0 ? <span className="text-muted-foreground">Chưa có kế hoạch</span> : <div className="space-y-2">{plans.map((plan) => (
                        <div key={plan.id}>
                          <button type="button" className="font-medium hover:text-primary hover:underline" onClick={() => navigate(withPatientReturnContext(`/treatment-plans/${plan.id}`, patientId, "journey"))}>
                            {plan.code ?? "Kế hoạch chưa có mã"}
                          </button>
                          <Badge variant="outline" className="ml-1.5 text-[10px]">{PLAN_STATUS_LABELS[plan.status]}</Badge>
                          <p className="mt-0.5 text-muted-foreground">BS. {names(plan.clinician_names)}</p>
                          <p className="text-muted-foreground">Phụ tá: {names(plan.assistant_names)}</p>
                        </div>
                      ))}</div>}
                    </TableCell>
                    <TableCell className="align-top text-muted-foreground">—</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      <ProcedureDetailDialog procedure={selectedProcedure} onOpenChange={(open) => { if (!open) setSelectedProcedure(null); }} />
    </div>
  );
}

function ProcedureDetailDialog({ procedure, onOpenChange }: { procedure: ClinicalJourneyCompletedProcedure | null; onOpenChange: (open: boolean) => void }) {
  return (
    <Dialog open={Boolean(procedure)} onOpenChange={onOpenChange} className="sm:max-w-xl">
      <DialogHeader>
        <DialogTitle>Chi tiết thủ thuật đã thực hiện</DialogTitle>
      </DialogHeader>
      <DialogBody className="space-y-4 text-sm">
        <div>
          <p className="text-xs text-muted-foreground">Thủ thuật</p>
          <p className="mt-1 font-medium">{procedure ? procedureLabel(procedure) : "—"}</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div><p className="text-xs text-muted-foreground">Kế hoạch điều trị</p><p className="mt-1 font-medium">{procedure?.plan_code ?? "Chưa ghi nhận"}</p></div>
          <div><p className="text-xs text-muted-foreground">Hoàn thành lúc</p><p className="mt-1 font-medium">{procedure ? formatDateTime(procedure.completed_at) : "—"}</p></div>
          <div><p className="text-xs text-muted-foreground">Bác sĩ</p><p className="mt-1 font-medium">{procedure?.clinician_name ?? "Chưa ghi nhận"}</p></div>
          <div><p className="text-xs text-muted-foreground">Phụ tá</p><p className="mt-1 font-medium">{procedure?.assistant_name ?? "Chưa ghi nhận"}</p></div>
        </div>
        <div className="rounded-md border border-border bg-muted/30 p-3">
          <p className="text-xs text-muted-foreground">Ghi chú</p>
          <p className="mt-1 whitespace-pre-wrap">{procedure?.notes ?? "Chưa ghi nhận"}</p>
        </div>
      </DialogBody>
      <DialogFooter><Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Đóng</Button></DialogFooter>
    </Dialog>
  );
}
