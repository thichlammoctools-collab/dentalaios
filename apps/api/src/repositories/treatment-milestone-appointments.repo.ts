import type { D1Database } from "@cloudflare/workers-types";
import type {
  Appointment,
  TreatmentMilestoneAppointment,
  TreatmentMilestoneAppointmentExecutionStatus,
  TreatmentMilestoneAppointmentLinkType,
} from "@shared/types";
import type { D1Row } from "./base";

export function createTreatmentMilestoneAppointmentsRepository(db: D1Database) {
  return {
    async listByMilestone(tenantId: string, milestoneId: string): Promise<TreatmentMilestoneAppointment[]> {
      const result = await db.prepare(
        `SELECT link.*, a.id AS appointment_id_value, a.branch_id, a.clinician_id, a.patient_id,
                a.assistant_id, a.chair_id, a.source_visit_id, a.scheduled_at, a.duration_min,
                a.status AS appointment_status, a.procedure, a.notes AS appointment_notes,
                a.source, a.lark_event_id, a.reminder_sent_at, a.reminder_method,
                a.cancelled_reason, a.created_by AS appointment_created_by,
                a.created_at AS appointment_created_at, a.updated_at AS appointment_updated_at
         FROM treatment_milestone_appointments link
         JOIN appointments a ON a.id = link.appointment_id AND a.tenant_id = link.tenant_id
         WHERE link.tenant_id = ? AND link.treatment_case_milestone_id = ?
         ORDER BY a.scheduled_at DESC`,
      ).bind(tenantId, milestoneId).all();
      return (result.results as D1Row[]).map(mapLink);
    },

    async getLink(tenantId: string, milestoneId: string, appointmentId: string): Promise<TreatmentMilestoneAppointment | null> {
      const row = await db.prepare(
        `SELECT link.*, a.id AS appointment_id_value, a.branch_id, a.clinician_id, a.patient_id,
                a.assistant_id, a.chair_id, a.source_visit_id, a.scheduled_at, a.duration_min,
                a.status AS appointment_status, a.procedure, a.notes AS appointment_notes,
                a.source, a.lark_event_id, a.reminder_sent_at, a.reminder_method,
                a.cancelled_reason, a.created_by AS appointment_created_by,
                a.created_at AS appointment_created_at, a.updated_at AS appointment_updated_at
         FROM treatment_milestone_appointments link
         JOIN appointments a ON a.id = link.appointment_id AND a.tenant_id = link.tenant_id
         WHERE link.tenant_id = ? AND link.treatment_case_milestone_id = ? AND link.appointment_id = ? LIMIT 1`,
      ).bind(tenantId, milestoneId, appointmentId).first() as D1Row | null;
      return row ? mapLink(row) : null;
    },

    async link(data: {
      tenantId: string;
      milestoneId: string;
      appointmentId: string;
      linkType: TreatmentMilestoneAppointmentLinkType;
      linkedBy: string;
    }): Promise<void> {
      await db.prepare(
        `INSERT INTO treatment_milestone_appointments
           (id, tenant_id, treatment_case_milestone_id, appointment_id, link_type, linked_by)
         VALUES (?, ?, ?, ?, ?, ?)`,
      ).bind(
        crypto.randomUUID(), data.tenantId, data.milestoneId, data.appointmentId,
        data.linkType, data.linkedBy,
      ).run();
    },

    async linkMany(data: {
      tenantId: string;
      milestoneIds: string[];
      appointmentId: string;
      linkType: TreatmentMilestoneAppointmentLinkType;
      linkedBy: string;
    }): Promise<void> {
      await db.batch(data.milestoneIds.map((milestoneId) => db.prepare(
        `INSERT INTO treatment_milestone_appointments
           (id, tenant_id, treatment_case_milestone_id, appointment_id, link_type, linked_by)
         VALUES (?, ?, ?, ?, ?, ?)`,
      ).bind(
        crypto.randomUUID(), data.tenantId, milestoneId, data.appointmentId,
        data.linkType, data.linkedBy,
      )));
    },

    async unlink(tenantId: string, milestoneId: string, appointmentId: string): Promise<boolean> {
      const result = await db.prepare(
        `DELETE FROM treatment_milestone_appointments
         WHERE tenant_id = ? AND treatment_case_milestone_id = ? AND appointment_id = ?`,
      ).bind(tenantId, milestoneId, appointmentId).run();
      return result.meta.changes > 0;
    },

    async updateExecution(
      tenantId: string,
      milestoneId: string,
      appointmentId: string,
      status: TreatmentMilestoneAppointmentExecutionStatus,
      notes?: string,
    ): Promise<void> {
      await db.prepare(
        `UPDATE treatment_milestone_appointments
         SET execution_status = ?, notes = ?, updated_at = datetime('now')
         WHERE tenant_id = ? AND treatment_case_milestone_id = ? AND appointment_id = ?`,
      ).bind(status, notes ?? null, tenantId, milestoneId, appointmentId).run();
    },
  };
}

function mapLink(row: D1Row): TreatmentMilestoneAppointment {
  const appointment: Appointment = {
    id: row.appointment_id_value as string,
    tenant_id: row.tenant_id as string,
    branch_id: row.branch_id as string,
    clinician_id: row.clinician_id as string,
    patient_id: row.patient_id as string,
    assistant_id: (row.assistant_id as string | null) ?? undefined,
    chair_id: (row.chair_id as string | null) ?? undefined,
    source_visit_id: (row.source_visit_id as string | null) ?? undefined,
    scheduled_at: row.scheduled_at as string,
    duration_min: Number(row.duration_min),
    status: row.appointment_status as Appointment["status"],
    procedure: (row.procedure as string | null) ?? undefined,
    notes: (row.appointment_notes as string | null) ?? undefined,
    source: row.source as Appointment["source"],
    lark_event_id: (row.lark_event_id as string | null) ?? undefined,
    reminder_sent_at: (row.reminder_sent_at as string | null) ?? undefined,
    reminder_method: (row.reminder_method as string | null) ?? undefined,
    cancelled_reason: (row.cancelled_reason as string | null) ?? undefined,
    created_by: row.appointment_created_by as string,
    created_at: row.appointment_created_at as string,
    updated_at: row.appointment_updated_at as string,
  };
  return {
    id: row.id as string,
    tenant_id: row.tenant_id as string,
    treatment_case_milestone_id: row.treatment_case_milestone_id as string,
    appointment_id: row.appointment_id as string,
    link_type: row.link_type as TreatmentMilestoneAppointmentLinkType,
    execution_status: row.execution_status as TreatmentMilestoneAppointmentExecutionStatus,
    notes: (row.notes as string | null) ?? undefined,
    linked_by: row.linked_by as string,
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
    appointment,
  };
}
