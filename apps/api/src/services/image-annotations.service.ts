import type { D1Database } from "@cloudflare/workers-types";
import type { ClinicalDiagnosis, ClinicalDiagnosisImageEvidence, ImageAnnotation, ImageAnnotationVersion } from "@shared/types";
import type { DiagnosisImageEvidenceCreateInput, ImageAnnotationCreateInput, ImageAnnotationVersionCreateInput } from "@shared/validation";
import { ConflictError, NotFoundError, ValidationError } from "../lib/errors";
import { filesService } from "./files.service";
import { createDiagnosesRepository } from "../repositories/diagnoses.repo";
import { createImageAnnotationsRepository } from "../repositories/image-annotations.repo";
import { createPatientImagesRepository } from "../repositories/patient-images.repo";

const renderableContentTypes = new Set(["image/jpeg", "image/png", "image/webp"]);

export const imageAnnotationsService = {
  async listAnnotations(db: D1Database, tenantId: string, imageId: string): Promise<ImageAnnotation[]> {
    await requireImage(db, tenantId, imageId);
    return createImageAnnotationsRepository(db).listByImage(tenantId, imageId);
  },

  async createAnnotation(db: D1Database, tenantId: string, imageId: string, actorId: string, data: ImageAnnotationCreateInput): Promise<ImageAnnotation> {
    await requireRenderableImage(db, tenantId, imageId);
    const now = new Date().toISOString();
    const annotationId = crypto.randomUUID();
    return createImageAnnotationsRepository(db).create(
      { id: annotationId, tenant_id: tenantId, patient_image_id: imageId, current_version_no: 1, created_by: actorId, created_at: now, updated_at: now },
      createVersion(annotationId, tenantId, actorId, 1, data, now),
    );
  },

  async createVersion(db: D1Database, tenantId: string, imageId: string, annotationId: string, actorId: string, data: ImageAnnotationVersionCreateInput): Promise<ImageAnnotation> {
    const annotation = await createImageAnnotationsRepository(db).getAnnotation(tenantId, annotationId);
    if (!annotation || annotation.patient_image_id !== imageId) throw new NotFoundError("Không tìm thấy ghi chú trên ảnh");
    await requireRenderableImage(db, tenantId, imageId);
    const now = new Date().toISOString();
    return createImageAnnotationsRepository(db).createVersion(
      { ...annotation, updated_at: now },
      createVersion(annotationId, tenantId, actorId, annotation.current_version_no + 1, data, now),
    );
  },

  async listImageEvidence(db: D1Database, tenantId: string, imageId: string): Promise<ClinicalDiagnosisImageEvidence[]> {
    await requireImage(db, tenantId, imageId);
    return createImageAnnotationsRepository(db).listEvidenceByImage(tenantId, imageId);
  },

  async listDiagnosisEvidence(db: D1Database, tenantId: string, visitId: string, diagnosisId: string): Promise<ClinicalDiagnosisImageEvidence[]> {
    const diagnosis = await requireDiagnosis(db, tenantId, visitId, diagnosisId);
    return createImageAnnotationsRepository(db).listEvidenceByDiagnosis(tenantId, diagnosis.id);
  },

  async createEvidence(db: D1Database, tenantId: string, visitId: string, diagnosisId: string, actorId: string, data: DiagnosisImageEvidenceCreateInput): Promise<ClinicalDiagnosisImageEvidence> {
    const diagnosis = await requireDiagnosis(db, tenantId, visitId, diagnosisId);
    const image = await requireImage(db, tenantId, data.patient_image_id);
    if (image.patient_id !== diagnosis.patient_id) throw new ValidationError("Ảnh không thuộc cùng bệnh nhân với chẩn đoán");

    const annotationVersion = data.annotation_version_id
      ? await createImageAnnotationsRepository(db).getVersion(tenantId, data.annotation_version_id)
      : null;
    if (data.annotation_version_id && !annotationVersion) throw new ValidationError("Không tìm thấy phiên bản ghi chú trên ảnh");
    if (annotationVersion) {
      const annotation = await createImageAnnotationsRepository(db).getAnnotation(tenantId, annotationVersion.annotation_id);
      if (!annotation || annotation.patient_image_id !== image.id) throw new ValidationError("Ghi chú không thuộc ảnh đã chọn");
    }

    return createImageAnnotationsRepository(db).createEvidence({
      id: crypto.randomUUID(), tenant_id: tenantId, diagnosis_id: diagnosis.id, patient_image_id: image.id,
      annotation_version_id: annotationVersion?.id, relation: data.relation, note: data.note,
      linked_by: actorId, linked_at: new Date().toISOString(),
    });
  },

  async removeEvidence(db: D1Database, tenantId: string, visitId: string, diagnosisId: string, evidenceId: string): Promise<void> {
    await requireDiagnosis(db, tenantId, visitId, diagnosisId);
    if (!await createImageAnnotationsRepository(db).deleteEvidence(tenantId, evidenceId, diagnosisId)) throw new NotFoundError("Không tìm thấy liên kết bằng chứng hình ảnh");
  },

  async listDiagnosisOptions(db: D1Database, tenantId: string, imageId: string): Promise<Array<ClinicalDiagnosis & { visit_date: string }>> {
    const image = await requireImage(db, tenantId, imageId);
    const result = await db.prepare(`SELECT d.*, v.date AS visit_date
      FROM clinical_diagnoses d
      JOIN visits v ON v.id = d.visit_id AND v.tenant_id = d.tenant_id
      WHERE d.tenant_id = ? AND d.patient_id = ?
      ORDER BY v.date DESC, d.created_at DESC LIMIT 200`).bind(tenantId, image.patient_id).all<Record<string, unknown>>();
    return result.results.map((row) => ({
      id: row.id as string, tenant_id: row.tenant_id as string, visit_id: row.visit_id as string, patient_id: row.patient_id as string,
      source_finding_id: text(row.source_finding_id), concept_id: row.concept_id as string, concept_version_id: row.concept_version_id as string,
      status: row.status as ClinicalDiagnosis["status"], icd10_code_id: text(row.icd10_code_id), icd10_version_id: text(row.icd10_version_id),
      icd10_code_snapshot: text(row.icd10_code_snapshot), icd10_display_vi_snapshot: text(row.icd10_display_vi_snapshot),
      concept_code_snapshot: row.concept_code_snapshot as string, concept_display_vi_snapshot: row.concept_display_vi_snapshot as string,
       mapping_id: text(row.mapping_id), mapping_role: text(row.mapping_role) as ClinicalDiagnosis["mapping_role"], source: row.source as ClinicalDiagnosis["source"], source_text: text(row.source_text),
       confirmed_by: text(row.confirmed_by), confirmed_at: text(row.confirmed_at), ruled_out_at: text(row.ruled_out_at), resolved_at: text(row.resolved_at), notes: text(row.notes),
       entered_by: text(row.entered_by), entry_source: (text(row.entry_source) ?? "doctor") as ClinicalDiagnosis["entry_source"], clinical_effective_at: text(row.clinical_effective_at),
       created_by: row.created_by as string, created_at: row.created_at as string, updated_at: row.updated_at as string, current_revision: Number(row.current_revision), visit_date: row.visit_date as string,
    }));
  },

  async assertImageCanBeDeleted(db: D1Database, tenantId: string, imageId: string): Promise<void> {
    if (await createImageAnnotationsRepository(db).hasEvidenceForImage(tenantId, imageId)) throw new ConflictError("Không thể xóa ảnh đang được dùng làm bằng chứng chẩn đoán");
  },
};

function createVersion(annotationId: string, tenantId: string, actorId: string, versionNo: number, data: ImageAnnotationCreateInput, createdAt: string): ImageAnnotationVersion {
  return { id: crypto.randomUUID(), tenant_id: tenantId, annotation_id: annotationId, version_no: versionNo, shape_type: data.shape_type, geometry: data.geometry, note: data.note, tooth_number: data.tooth_number, anatomical_site: data.anatomical_site, created_by: actorId, created_at: createdAt };
}
async function requireImage(db: D1Database, tenantId: string, imageId: string) {
  const image = await createPatientImagesRepository(db).getById(tenantId, imageId);
  if (!image) throw new NotFoundError("Không tìm thấy hình ảnh");
  return image;
}
async function requireRenderableImage(db: D1Database, tenantId: string, imageId: string) {
  const image = await requireImage(db, tenantId, imageId);
  const file = await filesService.getById(db, tenantId, image.file_id);
  if (!file || !renderableContentTypes.has(file.content_type)) throw new ValidationError("Chỉ có thể đánh dấu trực tiếp trên ảnh JPEG, PNG hoặc WebP");
  return image;
}
async function requireDiagnosis(db: D1Database, tenantId: string, visitId: string, diagnosisId: string) {
  const diagnosis = await createDiagnosesRepository(db).get(tenantId, diagnosisId);
  if (!diagnosis || diagnosis.visit_id !== visitId) throw new NotFoundError("Không tìm thấy chẩn đoán");
  return diagnosis;
}
function text(value: unknown): string | undefined { return typeof value === "string" && value ? value : undefined; }
