import type { D1Database } from "@cloudflare/workers-types";
import type { MedicalAlert } from "@shared/types";
import type { D1Row } from "./base";

export interface MedicalAlertsRepository {
  listByPatient(tenantId: string, patientId: string): Promise<MedicalAlert[]>;
  create(
    tenantId: string,
    patientId: string,
    data: Omit<MedicalAlert, "id" | "tenant_id" | "patient_id" | "created_at">,
  ): Promise<MedicalAlert>;
  delete(tenantId: string, id: string): Promise<boolean>;
}

export function createMedicalAlertsRepository(db: D1Database): MedicalAlertsRepository {
  return {
    async listByPatient(tenantId, patientId) {
      const result = await db
        .prepare(
          "SELECT * FROM medical_alerts WHERE tenant_id = ? AND patient_id = ? ORDER BY created_at DESC",
        )
        .bind(tenantId, patientId)
        .all();
      return (result.results as D1Row[]).map(mapAlert);
    },

    async create(tenantId, patientId, data) {
      const id = crypto.randomUUID();
      await db
        .prepare(
          `INSERT INTO medical_alerts
             (id, tenant_id, patient_id, type, description, severity)
           VALUES (?, ?, ?, ?, ?, ?)`,
        )
        .bind(id, tenantId, patientId, data.type, data.description, data.severity)
        .run();
      const row = (await db
        .prepare("SELECT * FROM medical_alerts WHERE tenant_id = ? AND id = ? LIMIT 1")
        .bind(tenantId, id)
        .first()) as D1Row | null;
      if (!row) throw new Error("Insert succeeded but read failed");
      return mapAlert(row);
    },

    async delete(tenantId, id) {
      const res = await db
        .prepare("DELETE FROM medical_alerts WHERE tenant_id = ? AND id = ?")
        .bind(tenantId, id)
        .run();
      return res.meta.changes > 0;
    },
  };
}

function mapAlert(row: D1Row): MedicalAlert {
  return {
    id: row.id as string,
    tenant_id: row.tenant_id as string,
    patient_id: row.patient_id as string,
    type: row.type as string,
    description: row.description as string,
    severity: row.severity as MedicalAlert["severity"],
    created_at: row.created_at as string,
  };
}