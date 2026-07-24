import type { D1Database } from "@cloudflare/workers-types";
import type { ClinicalDiagnosisImageEvidence, ImageAnnotation, ImageAnnotationVersion, PatientImage } from "@shared/types";
import type { D1Row } from "./base";

const annotationVersionColumns = `av.id AS version_id, av.tenant_id AS version_tenant_id, av.annotation_id,
  av.version_no, av.shape_type, av.geometry_json, av.note, av.tooth_number, av.anatomical_site,
  av.created_by AS version_created_by, av.created_at AS version_created_at`;
const imageSelect = `pi.id AS image_id, pi.tenant_id AS image_tenant_id, pi.patient_id AS image_patient_id,
  pi.visit_id AS image_visit_id, pi.uploaded_by AS image_uploaded_by, pi.image_type AS image_type,
  pi.image_purpose AS image_purpose, pi.description AS image_description, pi.file_id AS image_file_id, pi.thumb_key AS image_thumb_key,
  pi.original_name AS image_original_name, pi.original_size AS image_original_size,
  pi.created_at AS image_created_at, u.name AS image_uploader_name`;

export function createImageAnnotationsRepository(db: D1Database) {
  return {
    async listByImage(tenantId: string, imageId: string): Promise<ImageAnnotation[]> {
      const result = await db.prepare(`SELECT a.id, a.tenant_id, a.patient_image_id, a.current_version_no,
        a.created_by, a.created_at, a.updated_at, ${annotationVersionColumns}
        FROM image_annotations a
        JOIN image_annotation_versions av ON av.annotation_id = a.id AND av.version_no = a.current_version_no
        WHERE a.tenant_id = ? AND a.patient_image_id = ?
        ORDER BY a.created_at ASC`).bind(tenantId, imageId).all<D1Row>();
      return result.results.map(mapAnnotation);
    },

    async getVersion(tenantId: string, versionId: string): Promise<ImageAnnotationVersion | null> {
      const row = await db.prepare(`SELECT ${annotationVersionColumns} FROM image_annotation_versions av
        WHERE av.tenant_id = ? AND av.id = ? LIMIT 1`).bind(tenantId, versionId).first<D1Row>();
      return row ? mapVersion(row) : null;
    },

    async getAnnotation(tenantId: string, annotationId: string): Promise<ImageAnnotation | null> {
      const row = await db.prepare(`SELECT a.id, a.tenant_id, a.patient_image_id, a.current_version_no,
        a.created_by, a.created_at, a.updated_at, ${annotationVersionColumns}
        FROM image_annotations a
        JOIN image_annotation_versions av ON av.annotation_id = a.id AND av.version_no = a.current_version_no
        WHERE a.tenant_id = ? AND a.id = ? LIMIT 1`).bind(tenantId, annotationId).first<D1Row>();
      return row ? mapAnnotation(row) : null;
    },

    async create(annotation: Omit<ImageAnnotation, "current_version">, version: ImageAnnotationVersion): Promise<ImageAnnotation> {
      await db.batch([
        db.prepare(`INSERT INTO image_annotations
          (id, tenant_id, patient_image_id, current_version_no, created_by, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?)`)
          .bind(annotation.id, annotation.tenant_id, annotation.patient_image_id, annotation.current_version_no, annotation.created_by, annotation.created_at, annotation.updated_at),
        db.prepare(`INSERT INTO image_annotation_versions
          (id, tenant_id, annotation_id, version_no, shape_type, geometry_json, note, tooth_number, anatomical_site, created_by, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
          .bind(version.id, version.tenant_id, version.annotation_id, version.version_no, version.shape_type, JSON.stringify(version.geometry), version.note, version.tooth_number ?? null, version.anatomical_site ?? null, version.created_by, version.created_at),
      ]);
      const created = await this.getAnnotation(annotation.tenant_id, annotation.id);
      if (!created) throw new Error("Image annotation insert failed");
      return created;
    },

    async createVersion(annotation: ImageAnnotation, version: ImageAnnotationVersion): Promise<ImageAnnotation> {
      await db.batch([
        db.prepare(`INSERT INTO image_annotation_versions
          (id, tenant_id, annotation_id, version_no, shape_type, geometry_json, note, tooth_number, anatomical_site, created_by, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
          .bind(version.id, version.tenant_id, version.annotation_id, version.version_no, version.shape_type, JSON.stringify(version.geometry), version.note, version.tooth_number ?? null, version.anatomical_site ?? null, version.created_by, version.created_at),
        db.prepare("UPDATE image_annotations SET current_version_no = ?, updated_at = ? WHERE tenant_id = ? AND id = ?")
          .bind(version.version_no, annotation.updated_at, annotation.tenant_id, annotation.id),
      ]);
      const updated = await this.getAnnotation(annotation.tenant_id, annotation.id);
      if (!updated) throw new Error("Image annotation version insert failed");
      return updated;
    },

    async createEvidence(evidence: ClinicalDiagnosisImageEvidence): Promise<ClinicalDiagnosisImageEvidence> {
      await db.prepare(`INSERT INTO clinical_diagnosis_image_evidence
        (id, tenant_id, diagnosis_id, patient_image_id, annotation_version_id, relation, note, linked_by, linked_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .bind(evidence.id, evidence.tenant_id, evidence.diagnosis_id, evidence.patient_image_id, evidence.annotation_version_id ?? null, evidence.relation, evidence.note ?? null, evidence.linked_by, evidence.linked_at).run();
      const created = await this.getEvidence(evidence.tenant_id, evidence.id);
      if (!created) throw new Error("Diagnosis image evidence insert failed");
      return created;
    },

    async getEvidence(tenantId: string, evidenceId: string): Promise<ClinicalDiagnosisImageEvidence | null> {
      const row = await db.prepare(`SELECT e.id, e.tenant_id, e.diagnosis_id, e.patient_image_id, e.annotation_version_id,
        e.relation, e.note, e.linked_by, e.linked_at, ${imageSelect},
        ${annotationVersionColumns}
        FROM clinical_diagnosis_image_evidence e
        JOIN patient_images pi ON pi.id = e.patient_image_id
        JOIN users u ON u.id = pi.uploaded_by
        LEFT JOIN image_annotation_versions av ON av.id = e.annotation_version_id
        WHERE e.tenant_id = ? AND e.id = ? LIMIT 1`).bind(tenantId, evidenceId).first<D1Row>();
      return row ? mapEvidence(row) : null;
    },

    async listEvidenceByDiagnosis(tenantId: string, diagnosisId: string): Promise<ClinicalDiagnosisImageEvidence[]> {
      const result = await db.prepare(`SELECT e.id, e.tenant_id, e.diagnosis_id, e.patient_image_id, e.annotation_version_id,
        e.relation, e.note, e.linked_by, e.linked_at, ${imageSelect}, ${annotationVersionColumns}
        FROM clinical_diagnosis_image_evidence e
        JOIN patient_images pi ON pi.id = e.patient_image_id
        JOIN users u ON u.id = pi.uploaded_by
        LEFT JOIN image_annotation_versions av ON av.id = e.annotation_version_id
        WHERE e.tenant_id = ? AND e.diagnosis_id = ? ORDER BY e.linked_at DESC`).bind(tenantId, diagnosisId).all<D1Row>();
      return result.results.map(mapEvidence);
    },

    async listEvidenceByImage(tenantId: string, imageId: string): Promise<ClinicalDiagnosisImageEvidence[]> {
      const result = await db.prepare(`SELECT e.id, e.tenant_id, e.diagnosis_id, e.patient_image_id, e.annotation_version_id,
        e.relation, e.note, e.linked_by, e.linked_at, ${imageSelect}, ${annotationVersionColumns}
        FROM clinical_diagnosis_image_evidence e
        JOIN patient_images pi ON pi.id = e.patient_image_id
        JOIN users u ON u.id = pi.uploaded_by
        LEFT JOIN image_annotation_versions av ON av.id = e.annotation_version_id
        WHERE e.tenant_id = ? AND e.patient_image_id = ? ORDER BY e.linked_at DESC`).bind(tenantId, imageId).all<D1Row>();
      return result.results.map(mapEvidence);
    },

    async deleteEvidence(tenantId: string, evidenceId: string, diagnosisId: string): Promise<boolean> {
      const result = await db.prepare("DELETE FROM clinical_diagnosis_image_evidence WHERE tenant_id = ? AND id = ? AND diagnosis_id = ?")
        .bind(tenantId, evidenceId, diagnosisId).run();
      return result.meta.changes > 0;
    },

    async hasEvidenceForImage(tenantId: string, imageId: string): Promise<boolean> {
      return (await db.prepare("SELECT 1 FROM clinical_diagnosis_image_evidence WHERE tenant_id = ? AND patient_image_id = ? LIMIT 1")
        .bind(tenantId, imageId).first()) !== null;
    },
  };
}

function optional(row: D1Row, key: string): string | undefined { const value = row[key]; return typeof value === "string" && value ? value : undefined; }
function mapVersion(row: D1Row): ImageAnnotationVersion {
  return { id: row.version_id as string, tenant_id: row.version_tenant_id as string, annotation_id: row.annotation_id as string, version_no: Number(row.version_no), shape_type: row.shape_type as ImageAnnotationVersion["shape_type"], geometry: JSON.parse(row.geometry_json as string), note: row.note as string, tooth_number: typeof row.tooth_number === "number" ? row.tooth_number : undefined, anatomical_site: optional(row, "anatomical_site") as ImageAnnotationVersion["anatomical_site"], created_by: row.version_created_by as string, created_at: row.version_created_at as string };
}
function mapAnnotation(row: D1Row): ImageAnnotation { return { id: row.id as string, tenant_id: row.tenant_id as string, patient_image_id: row.patient_image_id as string, current_version_no: Number(row.current_version_no), created_by: row.created_by as string, created_at: row.created_at as string, updated_at: row.updated_at as string, current_version: mapVersion(row) }; }
function mapImage(row: D1Row): PatientImage { return { id: row.image_id as string, tenant_id: row.image_tenant_id as string, patient_id: row.image_patient_id as string, visit_id: optional(row, "image_visit_id"), uploaded_by: row.image_uploaded_by as string, image_type: row.image_type as PatientImage["image_type"], image_purpose: (row.image_purpose as PatientImage["image_purpose"] | null) ?? "clinical_record", description: optional(row, "image_description"), file_id: row.image_file_id as string, thumb_key: optional(row, "image_thumb_key"), original_name: optional(row, "image_original_name"), original_size: typeof row.image_original_size === "number" ? row.image_original_size : undefined, uploader_name: optional(row, "image_uploader_name"), created_at: row.image_created_at as string }; }
function mapEvidence(row: D1Row): ClinicalDiagnosisImageEvidence { return { id: row.id as string, tenant_id: row.tenant_id as string, diagnosis_id: row.diagnosis_id as string, patient_image_id: row.patient_image_id as string, annotation_version_id: optional(row, "annotation_version_id"), relation: row.relation as ClinicalDiagnosisImageEvidence["relation"], note: optional(row, "note"), linked_by: row.linked_by as string, linked_at: row.linked_at as string, image: mapImage(row), annotation_version: row.version_id ? mapVersion(row) : undefined }; }
