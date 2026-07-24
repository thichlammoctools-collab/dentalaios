import type { D1Database } from "@cloudflare/workers-types";
import type { D1Row } from "./base";
export interface ConsentRecord {
  id: string;
  tenant_id: string;
  patient_id: string;
  legal_representative_id?: string;
  plan_version_id?: string;
  treatment_plan_item_id?: string;
  consent_template_id: string;
  status: "pending" | "signed" | "withdrawn" | "superseded";
  signature_file_id?: string;
  rendered_document_file_id?: string;
  signer_name?: string;
  signer_relationship?: string;
  witnessed_by?: string;
  signed_at?: string;
  device_metadata_json?: string;
  content_hash?: string;
  withdrawal_reason?: string;
  withdrawn_by?: string;
  withdrawn_at?: string;
  created_by: string;
  created_at: string;
  updated_at: string;
}
export function createConsentRepository(db: D1Database) {
  return {
    async getActivePlanConsent(tenantId: string, planVersionId: string): Promise<ConsentRecord | null> {
      const row = await db.prepare(`SELECT * FROM consent_records
        WHERE tenant_id = ? AND plan_version_id = ? AND status = 'signed'
        ORDER BY signed_at DESC LIMIT 1`).bind(tenantId, planVersionId).first<D1Row>();
      return row ? mapRecord(row) : null;
    },
    async create(r: ConsentRecord): Promise<ConsentRecord> {
      await db.prepare(`INSERT INTO consent_records
        (id, tenant_id, patient_id, legal_representative_id, plan_version_id, treatment_plan_item_id, consent_template_id, status, signature_file_id, rendered_document_file_id, signer_name, signer_relationship, witnessed_by, signed_at, device_metadata_json, content_hash, created_by, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .bind(
          r.id, r.tenant_id, r.patient_id, r.legal_representative_id ?? null, r.plan_version_id ?? null,
          r.treatment_plan_item_id ?? null, r.consent_template_id, r.status, r.signature_file_id ?? null,
          r.rendered_document_file_id ?? null, r.signer_name ?? null, r.signer_relationship ?? null,
          r.witnessed_by ?? null, r.signed_at ?? null, r.device_metadata_json ?? null, r.content_hash ?? null,
          r.created_by, r.created_at, r.updated_at,
        ).run();
      return r;
    },
  };
}
function mapRecord(row: D1Row): ConsentRecord {
  return {
    id: row.id as string,
    tenant_id: row.tenant_id as string,
    patient_id: row.patient_id as string,
    legal_representative_id: optional(row, "legal_representative_id"),
    plan_version_id: optional(row, "plan_version_id"),
    treatment_plan_item_id: optional(row, "treatment_plan_item_id"),
    consent_template_id: row.consent_template_id as string,
    status: row.status as ConsentRecord["status"],
    signature_file_id: optional(row, "signature_file_id"),
    rendered_document_file_id: optional(row, "rendered_document_file_id"),
    signer_name: optional(row, "signer_name"),
    signer_relationship: optional(row, "signer_relationship"),
    witnessed_by: optional(row, "witnessed_by"),
    signed_at: optional(row, "signed_at"),
    device_metadata_json: optional(row, "device_metadata_json"),
    content_hash: optional(row, "content_hash"),
    withdrawal_reason: optional(row, "withdrawal_reason"),
    withdrawn_by: optional(row, "withdrawn_by"),
    withdrawn_at: optional(row, "withdrawn_at"),
    created_by: row.created_by as string,
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
  };
}
function optional(row: D1Row, key: string): string | undefined {
  const v = row[key];
  return typeof v === "string" && v ? v : undefined;
}
