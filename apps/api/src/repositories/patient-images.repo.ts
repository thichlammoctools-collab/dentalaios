/**
 * Patient images repository — CRUD scoped by tenant_id.
 */

import type { D1Database } from "@cloudflare/workers-types";
import type { PatientImage } from "@shared/types";
import type { D1Row, Pagination } from "./base";

export interface PatientImagesRepository {
  listByPatient(tenantId: string, patientId: string, opts?: Pagination): Promise<PatientImage[]>;
  listByVisit(tenantId: string, visitId: string, opts?: Pagination): Promise<PatientImage[]>;
  getById(tenantId: string, id: string): Promise<PatientImage | null>;
  create(tenantId: string, data: Omit<PatientImage, "created_at">): Promise<PatientImage>;
  delete(tenantId: string, id: string): Promise<boolean>;
}

export function createPatientImagesRepository(db: D1Database): PatientImagesRepository {
  return {
    async listByPatient(tenantId, patientId, opts = {}) {
      const limit = Math.min(opts.limit ?? 100, 500);
      const offset = opts.offset ?? 0;
      const result = await db
        .prepare(
          `SELECT pi.*,
                  u.name AS uploader_name,
                  fo.filename, fo.content_type, fo.size
             FROM patient_images pi
             JOIN users u ON u.id = pi.uploaded_by
             JOIN file_objects fo ON fo.id = pi.file_id
             WHERE pi.tenant_id = ? AND pi.patient_id = ?
             ORDER BY pi.created_at DESC
             LIMIT ? OFFSET ?`,
        )
        .bind(tenantId, patientId, limit, offset)
        .all();
      return (result.results as D1Row[]).map(mapImage);
    },

    async listByVisit(tenantId, visitId, opts = {}) {
      const limit = Math.min(opts.limit ?? 100, 500);
      const offset = opts.offset ?? 0;
      const result = await db
        .prepare(
          `SELECT pi.*,
                  u.name AS uploader_name,
                  fo.filename, fo.content_type, fo.size
             FROM patient_images pi
             JOIN users u ON u.id = pi.uploaded_by
             JOIN file_objects fo ON fo.id = pi.file_id
             WHERE pi.tenant_id = ? AND pi.visit_id = ?
             ORDER BY pi.created_at DESC
             LIMIT ? OFFSET ?`,
        )
        .bind(tenantId, visitId, limit, offset)
        .all();
      return (result.results as D1Row[]).map(mapImage);
    },

    async getById(tenantId, id) {
      const row = (await db
        .prepare(
          `SELECT pi.*,
                  u.name AS uploader_name,
                  fo.filename, fo.content_type, fo.size
             FROM patient_images pi
             JOIN users u ON u.id = pi.uploaded_by
             JOIN file_objects fo ON fo.id = pi.file_id
             WHERE pi.tenant_id = ? AND pi.id = ? LIMIT 1`,
        )
        .bind(tenantId, id)
        .first()) as D1Row | null;
      return row ? mapImage(row) : null;
    },

    async create(tenantId, data) {
      const id = crypto.randomUUID();
      await db
        .prepare(
          `INSERT INTO patient_images
             (id, tenant_id, patient_id, visit_id, uploaded_by, image_type,
              description, file_id, thumb_key, original_name, original_size)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          id,
          tenantId,
          data.patient_id,
          data.visit_id ?? null,
          data.uploaded_by,
          data.image_type,
          data.description ?? null,
          data.file_id,
          data.thumb_key ?? null,
          data.original_name ?? null,
          data.original_size ?? null,
        )
        .run();
      const created = await this.getById(tenantId, id);
      if (!created) throw new Error("Insert succeeded but read failed");
      return created;
    },

    async delete(tenantId, id) {
      const res = await db
        .prepare("DELETE FROM patient_images WHERE tenant_id = ? AND id = ?")
        .bind(tenantId, id)
        .run();
      return res.meta.changes > 0;
    },
  };
}

function mapImage(row: D1Row): PatientImage {
  return {
    id: row.id as string,
    tenant_id: row.tenant_id as string,
    patient_id: row.patient_id as string,
    visit_id: (row.visit_id as string | null) ?? undefined,
    uploaded_by: row.uploaded_by as string,
    image_type: row.image_type as PatientImage["image_type"],
    description: (row.description as string | null) ?? undefined,
    file_id: row.file_id as string,
    thumb_key: (row.thumb_key as string | null) ?? undefined,
    original_name: (row.original_name as string | null) ?? undefined,
    original_size: (row.original_size as number | null) ?? undefined,
    uploader_name: (row.uploader_name as string | null) ?? undefined,
    filename: (row.filename as string | null) ?? undefined,
    content_type: (row.content_type as string | null) ?? undefined,
    size: (row.size as number | null) ?? undefined,
    created_at: row.created_at as string,
  };
}
