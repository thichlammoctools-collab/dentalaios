import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { VisitForm } from "@/components/VisitForm";
import { FdiToothChart } from "@/components/FdiToothChart";
import { FindingsList } from "@/components/FindingsList";
import { apiGet, apiPost, ApiError } from "@/lib/api";
import { toast } from "@/lib/toast";
import { formatDateTime } from "@/lib/utils";
import type { Visit, ClinicalFinding, TreatmentPlan } from "@shared/types";

export function VisitDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [visit, setVisit] = useState<Visit | null>(null);
  const [findings, setFindings] = useState<ClinicalFinding[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    if (!id) return;
    setLoading(true);
    try {
      const v = await apiGet<Visit>(`/api/visits/${id}`);
      const f = await apiGet<{ items: ClinicalFinding[] }>(`/api/visits/${id}/findings`);
      setVisit(v);
      setFindings(f.items);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Lỗi tải visit");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function onCreatePlan() {
    if (!visit) return;
    try {
      const created = await apiPost<TreatmentPlan>("/api/treatment-plans", {
        visit_id: visit.id,
        patient_id: visit.patient_id,
        currency: "VND",
      });
      toast.success("Đã tạo kế hoạch điều trị");
      navigate(`/treatment-plans/${created.id}`);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Lỗi tạo plan");
    }
  }

  if (loading || !visit) {
    return <p className="px-6 py-6 text-sm text-muted-foreground">Đang tải…</p>;
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-6 py-6">
      <div>
        <p className="text-sm text-muted-foreground">
          <a href={`/patients/${visit.patient_id}`} className="hover:underline">
            ← Quay lại bệnh nhân
          </a>
        </p>
        <div className="mt-1 flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Lượt khám</h1>
            <p className="text-sm text-muted-foreground">{formatDateTime(visit.date)}</p>
          </div>
          <Badge
            variant={
              visit.status === "completed"
                ? "success"
                : visit.status === "cancelled"
                  ? "destructive"
                  : "warning"
            }
          >
            {visit.status}
          </Badge>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Sơ đồ răng FDI</CardTitle>
        </CardHeader>
        <CardContent>
          <FdiToothChart
            visitId={visit.id}
            findings={findings}
            onCreated={(f) => setFindings((prev) => [...prev, f])}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Findings ({findings.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <FindingsList
            visitId={visit.id}
            findings={findings}
            onUpdate={(updated) =>
              setFindings((prev) => prev.map((f) => (f.id === updated.id ? updated : f)))
            }
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Thao tác</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button onClick={onCreatePlan}>+ Tạo kế hoạch điều trị</Button>
        </CardContent>
      </Card>
    </div>
  );
}