import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { apiGet, ApiError } from "@/lib/api";
import { formatCurrency, formatDateTime } from "@/lib/utils";
import { toast } from "@/lib/toast";
import { withPatientReturnContext } from "@/lib/patient-navigation";
import type { Appointment, ClinicalFinding, Payment, TreatmentPlan, TreatmentPlanItem, Visit } from "@shared/types";

interface ListResponse<T> {
  items: T[];
  total: number;
}

interface ClinicalJourneyEntry {
  id: string;
  date: string;
  visit?: Visit;
  findings: ClinicalFinding[];
  plans: TreatmentPlan[];
  planItems: TreatmentPlanItem[];
  scheduledAppointment?: Appointment;
}

const CONDITION_LABELS: Record<string, string> = {
  caries: "Sâu răng",
  fracture: "Gãy/vỡ",
  missing: "Mất răng",
  periapical: "Viêm quanh chóp",
  calculus: "Vôi răng",
  pulpitis: "Viêm tủy",
  good: "Tốt",
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

const VISIT_STATUS_LABELS: Record<Visit["status"], string> = {
  in_progress: "Đang khám",
  completed: "Hoàn tất",
  cancelled: "Đã hủy",
};

function findingLabel(finding: ClinicalFinding) {
  const location = finding.tooth_number ? `R${finding.tooth_number}: ` : "";
  return `${location}${CONDITION_LABELS[finding.condition] ?? finding.condition}`;
}

function procedureLabel(item: TreatmentPlanItem) {
  const name = item.service_name ?? PROCEDURE_LABELS[item.procedure] ?? item.procedure;
  return `${item.tooth_number ? `R${item.tooth_number}: ` : ""}${name}`;
}

export function PatientClinicalJourney({
  patientId,
  visits,
  plans,
  payments,
  appointments,
  onPaymentClick,
}: {
  patientId: string;
  visits: Visit[];
  plans: TreatmentPlan[];
  payments: Payment[];
  appointments: Appointment[];
  onPaymentClick: (paymentId: string) => void;
}) {
  const navigate = useNavigate();
  const [findingsByVisit, setFindingsByVisit] = useState<Record<string, ClinicalFinding[]>>({});
  const [itemsByPlan, setItemsByPlan] = useState<Record<string, TreatmentPlanItem[]>>({});
  const [loadingDetails, setLoadingDetails] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function loadClinicalDetails() {
      setLoadingDetails(true);
      try {
        const [findingResults, itemResults] = await Promise.all([
          Promise.all(visits.map(async (visit) => [visit.id, await apiGet<ListResponse<ClinicalFinding>>(`/api/visits/${visit.id}/findings`)] as const)),
          Promise.all(plans.map(async (plan) => [plan.id, await apiGet<ListResponse<TreatmentPlanItem>>(`/api/treatment-plans/${plan.id}/items`)] as const)),
        ]);

        if (cancelled) return;

        setFindingsByVisit(Object.fromEntries(findingResults.map(([id, result]) => [id, result.items])));
        setItemsByPlan(Object.fromEntries(itemResults.map(([id, result]) => [id, result.items])));
      } catch (err) {
        if (!cancelled) {
          toast.error(err instanceof ApiError ? err.message : "Không thể tải chi tiết hành trình lâm sàng");
        }
      } finally {
        if (!cancelled) setLoadingDetails(false);
      }
    }

    void loadClinicalDetails();
    return () => {
      cancelled = true;
    };
  }, [plans, visits]);

  const entries: ClinicalJourneyEntry[] = [
    ...visits.map((visit) => {
      const visitPlans = plans.filter((plan) => plan.visit_id === visit.id);
      const planItems = visitPlans.flatMap((plan) => itemsByPlan[plan.id] ?? []);
      return {
        id: visit.id,
        date: visit.date,
        visit,
        findings: findingsByVisit[visit.id] ?? [],
        plans: visitPlans,
        planItems,
      };
    }),
    ...appointments
      .filter((appointment) => !appointment.source_visit_id)
      .map((appointment) => ({
        id: appointment.id,
        date: appointment.scheduled_at,
        findings: [],
        plans: [],
        planItems: [],
        scheduledAppointment: appointment,
      })),
  ]
    .sort((left, right) => new Date(right.date).getTime() - new Date(left.date).getTime());

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm text-muted-foreground">
            Tóm tắt những việc đã thực hiện trong mỗi lần khám. Chọn một mục để xem chi tiết.
          </p>
        </div>
        <Badge variant="outline" className="gap-1.5 px-2.5 py-1">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
          {entries.length} lượt khám
        </Badge>
      </div>

      {entries.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
          Chưa có lượt khám để tạo hành trình lâm sàng.
        </div>
      ) : (
        <Table className="min-w-[900px] text-xs">
          <TableHeader>
            <TableRow>
              <TableHead className="w-40">Ngày khám</TableHead>
              <TableHead className="min-w-52">Chẩn đoán & thủ thuật</TableHead>
              <TableHead className="min-w-52">Kế hoạch điều trị</TableHead>
              <TableHead className="min-w-40">Thuốc kê đơn</TableHead>
              <TableHead className="min-w-44 text-right">Thanh toán</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {entries.map((entry) => (
              <TableRow key={entry.id}>
                <TableCell className="align-top">
                  <button
                    type="button"
                    className="block text-left font-medium hover:text-primary hover:underline"
                    onClick={() => navigate(withPatientReturnContext(
                      entry.visit ? `/visits/${entry.visit.id}` : `/appointments/${entry.scheduledAppointment?.id}`,
                      patientId,
                      "journey",
                    ))}
                  >
                    <time dateTime={entry.date}>{formatDateTime(entry.date)}</time>
                  </button>
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {entry.visit ? (
                      <Badge
                        variant={entry.visit.status === "completed" ? "success" : entry.visit.status === "cancelled" ? "destructive" : "warning"}
                        className="text-[10px]"
                      >
                        {VISIT_STATUS_LABELS[entry.visit.status]}
                      </Badge>
                    ) : (
                      <Badge variant="secondary" className="text-[10px]">Lịch điều trị</Badge>
                    )}
                  </div>
                  {entry.visit?.treating_clinician_name && <p className="mt-2 text-muted-foreground">BS. {entry.visit.treating_clinician_name}</p>}
                </TableCell>
                <TableCell className="align-top">
                  {loadingDetails ? <span className="text-muted-foreground">Đang tải...</span> : entry.findings.length === 0 ? (
                    <span className="text-muted-foreground">{entry.visit ? "Chưa ghi nhận phát hiện" : "Chờ khám và chẩn đoán"}</span>
                  ) : (
                    <div className="space-y-1.5">
                      {entry.findings.map((finding) => (
                        <button
                          key={finding.id}
                          type="button"
                          className="block text-left font-medium hover:text-primary hover:underline"
                          onClick={() => navigate(withPatientReturnContext(`/visits/${finding.visit_id}`, patientId, "journey"))}
                        >
                          {findingLabel(finding)}
                        </button>
                      ))}
                    </div>
                  )}
                </TableCell>
                <TableCell className="align-top">
                  {loadingDetails ? <span className="text-muted-foreground">Đang tải...</span> : entry.planItems.length === 0 ? (
                    <span className="text-muted-foreground">Chưa có kế hoạch</span>
                  ) : (
                    <div className="space-y-1.5">
                      {entry.planItems.map((item) => (
                        <button
                          key={item.id}
                          type="button"
                          className="block text-left font-medium hover:text-primary hover:underline"
                          onClick={() => navigate(withPatientReturnContext(`/treatment-plans/${item.treatment_plan_id}`, patientId, "journey"))}
                        >
                          {procedureLabel(item)}
                        </button>
                      ))}
                    </div>
                  )}
                </TableCell>
                <TableCell className="align-top text-muted-foreground">
                  Chưa ghi nhận đơn thuốc
                </TableCell>
                <TableCell className="align-top text-right">
                  {entry.plans.flatMap((plan) => payments.filter((payment) => payment.treatment_plan_id === plan.id)).length === 0 ? (
                    <span className="text-muted-foreground">Chưa ghi nhận</span>
                  ) : (
                    <div className="space-y-1.5">
                      {entry.plans.flatMap((plan) => payments.filter((payment) => payment.treatment_plan_id === plan.id)).map((payment) => (
                        <button
                          key={payment.id}
                          type="button"
                          className="block w-full text-right font-medium hover:text-primary hover:underline"
                          onClick={() => onPaymentClick(payment.id)}
                        >
                          {formatCurrency(payment.amount, payment.currency)}
                        </button>
                      ))}
                    </div>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
