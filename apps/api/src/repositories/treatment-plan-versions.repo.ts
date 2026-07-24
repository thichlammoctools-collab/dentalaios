import type { D1Database } from "@cloudflare/workers-types";
import type { D1Row } from "./base";
export interface TreatmentPlanVersionRecord {
  id: string;
  tenant_id: string;
  treatment_plan_id: string;
  version_no: number;
  state: "draft" | "clinically_approved" | "superseded" | "cancelled";
  snapshot_json: string;
  sha256: string;
  created_by: string;
  approved_by?: string;
  approved_at?: string;
  archive_file_id?: string;
  template_version?: string;
  created_at: string;
}
export function createTreatmentPlanVersionsRepository(db: D1Database) {
  return {
    async create(v: TreatmentPlanVersionRecord): Promise<TreatmentPlanVersionRecord> {
      await db.prepare(`INSERT INTO treatment_plan_versions
        (id, tenant_id, treatment_plan_id, version_no, state, snapshot_json, sha256, created_by, approved_by, approved_at, archive_file_id, template_version, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .bind(
          v.id, v.tenant_id, v.treatment_plan_id, v.version_no, v.state, v.snapshot_json, v.sha256,
          v.created_by, v.approved_by ?? null, v.approved_at ?? null, v.archive_file_id ?? null,
          v.template_version ?? null, v.created_at,
        ).run();
      return v;
    },
    async listByPlan(tenantId: string, planId: string): Promise<TreatmentPlanVersionRecord[]> {
      const res = await db.prepare("SELECT * FROM treatment_plan_versions WHERE tenant_id = ? AND treatment_plan_id = ? ORDER BY version_no DESC")
        .bind(tenantId, planId).all<D1Row>();
      return res.results.map(mapVersion);
    },
    async getApproved(tenantId: string, versionId: string): Promise<TreatmentPlanVersionRecord | null> {
      const row = await db.prepare("SELECT * FROM treatment_plan_versions WHERE tenant_id = ? AND id = ? LIMIT 1")
        .bind(tenantId, versionId).first<D1Row>();
      return row ? mapVersion(row) : null;
    },
  };
}
function mapVersion(row: D1Row): TreatmentPlanVersionRecord {
  return {
    id: row.id as string,
    tenant_id: row.tenant_id as string,
    treatment_plan_id: row.treatment_plan_id as string,
    version_no: Number(row.version_no),
    state: row.state as TreatmentPlanVersionRecord["state"],
    snapshot_json: row.snapshot_json as string,
    sha256: row.sha256 as string,
    created_by: row.created_by as string,
    approved_by: optional(row, "approved_by"),
    approved_at: optional(row, "approved_at"),
    archive_file_id: optional(row, "archive_file_id"),
    template_version: optional(row, "template_version"),
    created_at: row.created_at as string,
  };
}
function optional(row: D1Row, key: string): string | undefined {
  const v = row[key];
  return typeof v === "string" && v ? v : undefined;
}
