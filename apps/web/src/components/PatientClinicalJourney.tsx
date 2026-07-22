import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import type { Appointment, ClinicalFinding, TreatmentPlan, TreatmentPlanItem, Visit } from "@shared/types";

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
  followUps: Appointment[];
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

const APPOINTMENT_STATUS_LABELS: Record<Appointment["status"], string> = {
  booked: "Mới đặt",
  confirmed: "Đã xác nhận",
  arrived: "Đã đến",
  in_progress: "Đang thực hiện",
  completed: "Hoàn thành",
  cancelled: "Đã hủy",
  no_show: "Không đến",
};

function findingLabel(finding: ClinicalFinding) {
  const location = finding.tooth_number ? `R${finding.tooth_number}: ` : "";
  return `${location}${CONDITION_LABELS[finding.condition] ?? finding.condition}`;
}

function procedureLabel(item: TreatmentPlanItem) {
  const name = item.service_name ?? PROCEDURE_LABELS[item.procedure] ?? item.procedure;
  return `${item.tooth_number ? `R${item.tooth_number}: ` : ""}${name}`;
}

function planStatusVariant(status: TreatmentPlanItem["status"]): "secondary" | "warning" | "success" {
  if (status === "completed") return "success";
  if (status === "in_progress") return "warning";
  return "secondary";
}

export function PatientClinicalJourney({
  patientId,
  visits,
  plans,
  appointments,
}: {
  patientId: string;
  visits: Visit[];
  plans: TreatmentPlan[];
  appointments: Appointment[];
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
      const followUps = appointments
        .filter((appointment) => appointment.source_visit_id === visit.id)
        .sort((left, right) => new Date(left.scheduled_at).getTime() - new Date(right.scheduled_at).getTime());

      return {
        id: visit.id,
        date: visit.date,
        visit,
        findings: findingsByVisit[visit.id] ?? [],
        plans: visitPlans,
        planItems,
        followUps,
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
        followUps: [appointment],
        scheduledAppointment: appointment,
      })),
  ]
    .sort((left, right) => new Date(right.date).getTime() - new Date(left.date).getTime());

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm text-muted-foreground">
            Tổng hợp theo từng lượt khám, từ chẩn đoán đến điều trị và lịch tái khám.
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Đơn thuốc: hệ thống chưa có mô-đun kê đơn, nên các dòng chưa có dữ liệu sẽ được đánh dấu rõ ràng.
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
        <Table className="min-w-[1050px] text-xs">
          <TableHeader>
            <TableRow>
              <TableHead className="w-40">Ngày khám</TableHead>
              <TableHead className="min-w-48">Chẩn đoán & thủ thuật</TableHead>
              <TableHead className="min-w-52">Kế hoạch điều trị</TableHead>
              <TableHead className="min-w-40">Thuốc kê đơn</TableHead>
              <TableHead className="min-w-48">Tái khám</TableHead>
              <TableHead className="min-w-52">Ghi chú bác sĩ</TableHead>
              <TableHead className="w-28" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {entries.map((entry) => (
              <TableRow key={entry.id}>
                <TableCell className="align-top">
                  <time className="block font-medium" dateTime={entry.date}>{formatDateTime(entry.date)}</time>
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
                        <div key={finding.id}>
                          <p className="font-medium">{findingLabel(finding)}</p>
                          {finding.notes && <p className="text-muted-foreground">{finding.notes}</p>}
                        </div>
                      ))}
                    </div>
                  )}
                </TableCell>
                <TableCell className="align-top">
                  {loadingDetails ? <span className="text-muted-foreground">Đang tải...</span> : entry.planItems.length === 0 ? (
                    <span className="text-muted-foreground">Chưa có kế hoạch</span>
                  ) : (
                    <div className="space-y-2">
                      {entry.planItems.map((item) => (
                        <div key={item.id} className="flex flex-wrap items-center gap-1.5">
                          <span className="font-medium">{procedureLabel(item)}</span>
                          <Badge variant={planStatusVariant(item.status)} className="text-[10px]">
                            {item.status === "completed" ? "Hoàn tất" : item.status === "in_progress" ? "Đang làm" : "Dự kiến"}
                          </Badge>
                        </div>
                      ))}
                    </div>
                  )}
                </TableCell>
                <TableCell className="align-top text-muted-foreground">
                  Chưa ghi nhận đơn thuốc
                </TableCell>
                <TableCell className="align-top">
                  {entry.followUps.length === 0 ? (
                    <span className="text-muted-foreground">Chưa đặt lịch tái khám</span>
                  ) : (
                    <div className="space-y-2">
                      {entry.followUps.map((appointment) => (
                        <div key={appointment.id}>
                          <p className="font-medium">{formatDateTime(appointment.scheduled_at)}</p>
                          <p className="text-muted-foreground">{appointment.procedure ?? "Tái khám"} · {APPOINTMENT_STATUS_LABELS[appointment.status]}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </TableCell>
                <TableCell className="align-top text-muted-foreground">
                  {entry.visit?.notes ?? entry.scheduledAppointment?.notes ?? "Không có ghi chú lâm sàng"}
                </TableCell>
                <TableCell className="align-top">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 px-2 text-xs"
                    onClick={() => navigate(withPatientReturnContext(
                      entry.visit ? `/visits/${entry.visit.id}` : `/appointments/${entry.scheduledAppointment?.id}`,
                      patientId,
                      "journey",
                    ))}
                  >
                    {entry.visit ? "Mở lượt khám" : "Mở lịch hẹn"}
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
