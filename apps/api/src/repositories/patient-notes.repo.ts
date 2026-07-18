import type { D1Database } from "@cloudflare/workers-types";
import type { PatientNote } from "@shared/types";
import type { D1Row } from "./base";

export interface PatientNotesRepository {
  listByPatient(tenantId: string, patientId: string): Promise<PatientNote[]>;
  create(tenantId: string, patientId: string, userId: string, content: string): Promise<PatientNote>;
}

export function createPatientNotesRepository(db: D1Database): PatientNotesRepository {
  return {
    async listByPatient(tenantId, patientId) {
      const result = await db
        .prepare(
          `SELECT n.*, u.name AS user_name
           FROM patient_notes n
           JOIN users u ON u.id = n.user_id
           WHERE n.tenant_id = ? AND n.patient_id = ?
           ORDER BY n.created_at DESC, n.id DESC`,
        )
        .bind(tenantId, patientId)
        .all();
      return (result.results as D1Row[]).map(mapPatientNote);
    },

    async create(tenantId, patientId, userId, content) {
      const id = crypto.randomUUID();
      await db
        .prepare(
          `INSERT INTO patient_notes (id, tenant_id, patient_id, user_id, content)
           VALUES (?, ?, ?, ?, ?)`,
        )
        .bind(id, tenantId, patientId, userId, content)
        .run();

      const row = (await db
        .prepare(
          `SELECT n.*, u.name AS user_name
           FROM patient_notes n
           JOIN users u ON u.id = n.user_id
           WHERE n.tenant_id = ? AND n.id = ? LIMIT 1`,
        )
        .bind(tenantId, id)
        .first()) as D1Row | null;
      if (!row) throw new Error("Insert succeeded but read failed");
      return mapPatientNote(row);
    },
  };
}

function mapPatientNote(row: D1Row): PatientNote {
  return {
    id: row.id as string,
    tenant_id: row.tenant_id as string,
    patient_id: row.patient_id as string,
    user_id: row.user_id as string,
    user_name: row.user_name as string,
    content: row.content as string,
    created_at: row.created_at as string,
  };
}
