import type { D1Database } from "@cloudflare/workers-types";
import type { ConsentRecord } from "../repositories/consent.repo";
import { createConsentRepository } from "../repositories/consent.repo";
import { createPatientsRepository } from "../repositories/patients.repo";
import { createTreatmentPlanVersionsRepository } from "../repositories/treatment-plan-versions.repo";
import { NotFoundError, ValidationError } from "../lib/errors";
export const consentService = {
  async signPlanConsent(
    db: D1Database,
    tenantId: string,
    planId: string,
    planVersionId: string,
    witnessId: string,
    data: {
      consent_template_id: string;
      signer_name: string;
      signer_relationship?: string;
      legal_representative_id?: string;
      signature_file_id?: string;
      device_metadata_json?: string;
    },
  ): Promise<ConsentRecord> {
    const version = await createTreatmentPlanVersionsRepository(db).getApproved(tenantId, planVersionId);
    if (!version || version.state !== "clinically_approved") throw new ValidationError("Chỉ có thể ký consent cho phiên bản kế hoạch đã được bác sĩ phê duyệt");
    if (version.treatment_plan_id !== planId) throw new NotFoundError("Phiên bản kế hoạch không thuộc kế hoạch này");

    const template = await db.prepare(`SELECT id FROM consent_templates
      WHERE tenant_id = ? AND id = ? AND scope = 'treatment_plan' AND is_active = 1
        AND datetime(effective_from) <= datetime('now')
        AND (effective_to IS NULL OR datetime(effective_to) >= datetime('now'))
      LIMIT 1`).bind(tenantId, data.consent_template_id).first<{ id: string }>();
    if (!template) throw new ValidationError("Template consent không còn hiệu lực cho kế hoạch điều trị");

    const plan = JSON.parse(version.snapshot_json) as { plan: { patient_id: string } };
    const patient = await createPatientsRepository(db).getById(tenantId, plan.plan.patient_id);
    if (!patient) throw new NotFoundError("Patient not found");

    if (data.legal_representative_id) {
      const representative = await db.prepare(`SELECT id FROM legal_representatives
        WHERE tenant_id = ? AND id = ? AND patient_id = ? AND verified_at IS NOT NULL AND inactive_at IS NULL LIMIT 1`)
        .bind(tenantId, data.legal_representative_id, patient.id).first<{ id: string }>();
      if (!representative) throw new ValidationError("Đại diện hợp pháp chưa được xác minh hoặc không thuộc bệnh nhân");
    } else if (data.signer_name.trim() !== patient.name.trim()) {
      throw new ValidationError("Người ký cần là bệnh nhân hoặc chọn đại diện hợp pháp đã xác minh");
    }

    const now = new Date().toISOString();
    const contentHash = await computeSha256Hex(version.snapshot_json + ":" + data.signer_name + ":" + now);
    return createConsentRepository(db).create({
      id: crypto.randomUUID(),
      tenant_id: tenantId,
      patient_id: patient.id,
      legal_representative_id: data.legal_representative_id,
      plan_version_id: planVersionId,
      consent_template_id: template.id,
      status: "signed",
      signature_file_id: data.signature_file_id,
      signer_name: data.signer_name,
      signer_relationship: data.signer_relationship,
      witnessed_by: witnessId,
      signed_at: now,
      device_metadata_json: data.device_metadata_json,
      content_hash: contentHash,
      created_by: witnessId,
      created_at: now,
      updated_at: now,
    });
  },
};
async function computeSha256Hex(data: string): Promise<string> {
  const bytes = new TextEncoder().encode(data);
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, "0")).join("");
}
