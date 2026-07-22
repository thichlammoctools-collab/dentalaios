import type {
  ClinicalJourney,
  ClinicalJourneyCompletedProcedure,
  ClinicalJourneyFinding,
  ClinicalJourneyPlan,
  ClinicalJourneyVisit,
} from "@shared/types";
import type { D1Database } from "@cloudflare/workers-types";
import type { D1Row } from "./base";

export function createClinicalJourneyRepository(db: D1Database) {
  return {
    async getByPatient(tenantId: string, patientId: string): Promise<ClinicalJourney> {
      const [visits, findings, plans, completedProcedures] = await Promise.all([
        db.prepare(
          `SELECT v.id, v.date, v.status, clinician.name AS treating_clinician_name, assistant.name AS assistant_name
           FROM visits v
           LEFT JOIN users clinician ON clinician.id = v.treating_clinician_id AND clinician.tenant_id = v.tenant_id
           LEFT JOIN users assistant ON assistant.id = v.assistant_id AND assistant.tenant_id = v.tenant_id
           WHERE v.tenant_id = ? AND v.patient_id = ?
           ORDER BY v.date DESC`,
        ).bind(tenantId, patientId).all<D1Row>(),
        db.prepare(
          `SELECT cf.id, cf.code, cf.visit_id
           FROM clinical_findings cf
           JOIN visits v ON v.id = cf.visit_id AND v.tenant_id = cf.tenant_id
           WHERE cf.tenant_id = ? AND v.patient_id = ?
           ORDER BY cf.created_at ASC, cf.id ASC`,
        ).bind(tenantId, patientId).all<D1Row>(),
        db.prepare(
          `SELECT tp.id, tp.code, tp.visit_id, tp.status,
                  GROUP_CONCAT(DISTINCT item_clinician.name) AS item_clinician_names,
                  GROUP_CONCAT(DISTINCT item_assistant.name) AS item_assistant_names,
                  visit_clinician.name AS visit_clinician_name,
                  visit_assistant.name AS visit_assistant_name
           FROM treatment_plans tp
           JOIN visits v ON v.id = tp.visit_id AND v.tenant_id = tp.tenant_id
           LEFT JOIN treatment_plan_items item ON item.treatment_plan_id = tp.id AND item.tenant_id = tp.tenant_id
           LEFT JOIN users item_clinician ON item_clinician.id = item.treating_clinician_id AND item_clinician.tenant_id = item.tenant_id
           LEFT JOIN users item_assistant ON item_assistant.id = item.assistant_id AND item_assistant.tenant_id = item.tenant_id
           LEFT JOIN users visit_clinician ON visit_clinician.id = v.treating_clinician_id AND visit_clinician.tenant_id = v.tenant_id
           LEFT JOIN users visit_assistant ON visit_assistant.id = v.assistant_id AND visit_assistant.tenant_id = v.tenant_id
           WHERE tp.tenant_id = ? AND tp.patient_id = ?
           GROUP BY tp.id
           ORDER BY tp.created_at ASC, tp.id ASC`,
        ).bind(tenantId, patientId).all<D1Row>(),
        db.prepare(
          `WITH ranked_links AS (
             SELECT link.treatment_case_milestone_id, link.notes AS execution_notes,
                    appointment.notes AS appointment_notes, appointment.clinician_id AS appointment_clinician_id,
                    appointment.assistant_id AS appointment_assistant_id,
                    ROW_NUMBER() OVER (
                      PARTITION BY link.treatment_case_milestone_id
                      ORDER BY CASE WHEN link.execution_status = 'completed' THEN 0 ELSE 1 END,
                               appointment.scheduled_at DESC, link.created_at DESC
                    ) AS rank
             FROM treatment_milestone_appointments link
             JOIN appointments appointment ON appointment.id = link.appointment_id AND appointment.tenant_id = link.tenant_id
             WHERE link.tenant_id = ? AND appointment.status = 'completed'
           )
           SELECT milestone.id, milestone.completed_at, plan.id AS treatment_plan_id, plan.code AS plan_code,
                  item.procedure, snapshot.service_name, item.tooth_number,
                  COALESCE(link.execution_notes, link.appointment_notes, item.description) AS notes,
                  COALESCE(appointment_clinician.name, item_clinician.name, visit_clinician.name) AS clinician_name,
                  COALESCE(appointment_assistant.name, item_assistant.name, visit_assistant.name) AS assistant_name
           FROM treatment_case_milestones milestone
           JOIN treatment_cases treatment_case ON treatment_case.id = milestone.treatment_case_id AND treatment_case.tenant_id = milestone.tenant_id
           JOIN treatment_plans plan ON plan.id = treatment_case.treatment_plan_id AND plan.tenant_id = treatment_case.tenant_id
           JOIN treatment_plan_items item ON item.id = milestone.treatment_plan_item_id AND item.tenant_id = milestone.tenant_id
           JOIN visits visit ON visit.id = plan.visit_id AND visit.tenant_id = plan.tenant_id
           LEFT JOIN treatment_plan_item_price_snapshots snapshot ON snapshot.treatment_plan_item_id = item.id AND snapshot.tenant_id = item.tenant_id
           LEFT JOIN ranked_links link ON link.treatment_case_milestone_id = milestone.id AND link.rank = 1
           LEFT JOIN users appointment_clinician ON appointment_clinician.id = link.appointment_clinician_id AND appointment_clinician.tenant_id = milestone.tenant_id
           LEFT JOIN users appointment_assistant ON appointment_assistant.id = link.appointment_assistant_id AND appointment_assistant.tenant_id = milestone.tenant_id
           LEFT JOIN users item_clinician ON item_clinician.id = item.treating_clinician_id AND item_clinician.tenant_id = item.tenant_id
           LEFT JOIN users item_assistant ON item_assistant.id = item.assistant_id AND item_assistant.tenant_id = item.tenant_id
           LEFT JOIN users visit_clinician ON visit_clinician.id = visit.treating_clinician_id AND visit_clinician.tenant_id = visit.tenant_id
           LEFT JOIN users visit_assistant ON visit_assistant.id = visit.assistant_id AND visit_assistant.tenant_id = visit.tenant_id
           WHERE milestone.tenant_id = ? AND treatment_case.patient_id = ?
             AND milestone.status = 'completed' AND milestone.completed_at IS NOT NULL
           ORDER BY milestone.completed_at DESC, milestone.id DESC`,
        ).bind(tenantId, tenantId, patientId).all<D1Row>(),
      ]);

      return {
        visits: visits.results.map(mapVisit),
        findings: findings.results.map(mapFinding),
        plans: plans.results.map(mapPlan),
        completed_procedures: completedProcedures.results.map(mapCompletedProcedure),
      };
    },
  };
}

function mapVisit(row: D1Row): ClinicalJourneyVisit {
  return {
    id: row.id as string,
    date: row.date as string,
    status: row.status as ClinicalJourneyVisit["status"],
    treating_clinician_name: value(row.treating_clinician_name),
    assistant_name: value(row.assistant_name),
  };
}

function mapFinding(row: D1Row): ClinicalJourneyFinding {
  return { id: row.id as string, code: value(row.code), visit_id: row.visit_id as string };
}

function mapPlan(row: D1Row): ClinicalJourneyPlan {
  const clinicianNames = csv(row.item_clinician_names);
  const assistantNames = csv(row.item_assistant_names);
  return {
    id: row.id as string,
    code: value(row.code),
    visit_id: row.visit_id as string,
    status: row.status as ClinicalJourneyPlan["status"],
    clinician_names: clinicianNames.length > 0 ? clinicianNames : fallbackName(row.visit_clinician_name),
    assistant_names: assistantNames.length > 0 ? assistantNames : fallbackName(row.visit_assistant_name),
  };
}

function mapCompletedProcedure(row: D1Row): ClinicalJourneyCompletedProcedure {
  return {
    id: row.id as string,
    completed_at: row.completed_at as string,
    treatment_plan_id: row.treatment_plan_id as string,
    plan_code: value(row.plan_code),
    procedure: row.procedure as string,
    service_name: value(row.service_name),
    tooth_number: (row.tooth_number as number | null) ?? undefined,
    notes: value(row.notes),
    clinician_name: value(row.clinician_name),
    assistant_name: value(row.assistant_name),
  };
}

function value(input: unknown): string | undefined {
  return typeof input === "string" && input.trim() ? input : undefined;
}

function csv(input: unknown): string[] {
  if (typeof input !== "string" || !input) return [];
  return [...new Set(input.split(",").filter(Boolean))];
}

function fallbackName(input: unknown): string[] {
  const name = value(input);
  return name ? [name] : [];
}
