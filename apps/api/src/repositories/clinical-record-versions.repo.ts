import type { D1Database } from "@cloudflare/workers-types";
import type { D1Row } from "./base";
export interface ClinicalRecordVersion {
  id: string;
  tenant_id: string;
  visit_id: string;
  version_no: number;
  record_type: "signed_record" | "amendment";
  canonical_json: string;
  sha256: string;
  reason?: string;
  created_by: string;
  created_at: string;
  supersedes_version_id?: string;
  archive_file_id?: string;
}
export interface ClinicalRecordAmendment {
  id: string;
  tenant_id: string;
  visit_id: string;
  base_version_id: string;
  proposed_version_id: string;
  reason: string;
  before_json: string;
  after_json: string;
  created_by: string;
  confirmed_by?: string;
  confirmed_at?: string;
  created_at: string;
}
export function createClinicalRecordVersionsRepository(db: D1Database) {
  return {
    async createVersion(v: ClinicalRecordVersion): Promise<ClinicalRecordVersion> {
      await db.prepare(`INSERT INTO clinical_record_versions
        (id, tenant_id, visit_id, version_no, record_type, canonical_json, sha256, reason, created_by, created_at, supersedes_version_id, archive_file_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .bind(v.id, v.tenant_id, v.visit_id, v.version_no, v.record_type, v.canonical_json, v.sha256, v.reason ?? null, v.created_by, v.created_at, v.supersedes_version_id ?? null, v.archive_file_id ?? null)
        .run();
      return v;
    },
    async listByVisit(tenantId: string, visitId: string): Promise<ClinicalRecordVersion[]> {
      const res = await db.prepare("SELECT * FROM clinical_record_versions WHERE tenant_id = ? AND visit_id = ? ORDER BY version_no DESC")
        .bind(tenantId, visitId).all<D1Row>();
      return res.results.map(mapVersion);
    },
    async getLatestVersion(tenantId: string, visitId: string): Promise<ClinicalRecordVersion | null> {
      const row = await db.prepare("SELECT * FROM clinical_record_versions WHERE tenant_id = ? AND visit_id = ? ORDER BY version_no DESC LIMIT 1")
        .bind(tenantId, visitId).first<D1Row>();
      return row ? mapVersion(row) : null;
    },
    async createAmendment(a: ClinicalRecordAmendment): Promise<ClinicalRecordAmendment> {
      await db.prepare(`INSERT INTO clinical_record_amendments
        (id, tenant_id, visit_id, base_version_id, proposed_version_id, reason, before_json, after_json, created_by, confirmed_by, confirmed_at, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .bind(a.id, a.tenant_id, a.visit_id, a.base_version_id, a.proposed_version_id, a.reason, a.before_json, a.after_json, a.created_by, a.confirmed_by ?? null, a.confirmed_at ?? null, a.created_at)
        .run();
      return a;
    },
  };
}
function mapVersion(row: D1Row): ClinicalRecordVersion {
  return {
    id: row.id as string,
    tenant_id: row.tenant_id as string,
    visit_id: row.visit_id as string,
    version_no: Number(row.version_no),
    record_type: row.record_type as ClinicalRecordVersion["record_type"],
    canonical_json: row.canonical_json as string,
    sha256: row.sha256 as string,
    reason: optional(row, "reason"),
    created_by: row.created_by as string,
    created_at: row.created_at as string,
    supersedes_version_id: optional(row, "supersedes_version_id"),
    archive_file_id: optional(row, "archive_file_id"),
  };
}
function optional(row: D1Row, key: string): string | undefined {
  const v = row[key];
  return typeof v === "string" && v ? v : undefined;
}
