/**
 * Tenant scope helpers — verify that a foreign key reference belongs to the
 * caller's tenant BEFORE writing rows that connect the two.
 *
 * Rationale: single-column FKs (`patient_id TEXT REFERENCES patients(id)`)
 * only prove that the target row exists; they do NOT prove it belongs to the
 * same tenant. Without these guards, a caller from tenant A can create a
 * visit/appointment/plan/etc. whose `tenant_id = A` but whose foreign keys
 * point at rows in tenant B.
 *
 * All helpers throw `NotFoundError` (not `ForbiddenError`) on mismatch: the
 * caller must not be able to distinguish "does not exist" from "exists in
 * another tenant" via error codes.
 *
 * Every helper takes a bounded, whitelisted table name (compile-time union)
 * to prevent SQL injection through dynamic identifiers.
 */

import type { D1Database } from "@cloudflare/workers-types";
import { NotFoundError } from "./errors";

/** Table names that are safe to interpolate into an `assertRowInTenant` query. */
type ScopedTable =
  | "patients"
  | "branches"
  | "users"
  | "visits"
  | "treatment_plans"
  | "treatment_plan_items"
  | "appointments"
  | "medical_alerts"
  | "roles"
  | "file_objects"
  | "patient_images"
  | "clinical_findings";

const ENTITY_LABEL: Record<ScopedTable, string> = {
  patients: "Bệnh nhân",
  branches: "Chi nhánh",
  users: "Người dùng",
  visits: "Lượt khám",
  treatment_plans: "Kế hoạch điều trị",
  treatment_plan_items: "Mục kế hoạch",
  appointments: "Lịch hẹn",
  medical_alerts: "Cảnh báo y tế",
  roles: "Vai trò",
  file_objects: "Tệp",
  patient_images: "Hình ảnh bệnh nhân",
  clinical_findings: "Chẩn đoán",
};

/**
 * Verify that a row with `id` exists in `table` and belongs to `tenantId`.
 * Throws `NotFoundError` when the row is missing or in another tenant.
 */
export async function assertRowInTenant(
  db: D1Database,
  table: ScopedTable,
  tenantId: string,
  id: string,
): Promise<void> {
  const row = await db
    .prepare(`SELECT 1 FROM ${table} WHERE tenant_id = ? AND id = ? LIMIT 1`)
    .bind(tenantId, id)
    .first();
  if (!row) {
    throw new NotFoundError(`${ENTITY_LABEL[table]} không tồn tại trong tenant này`);
  }
}

/**
 * Batch variant: assert several `(table, id)` pairs in a single call.
 * Undefined/null ids are skipped so callers can pass optional fields
 * without extra branching.
 */
export async function assertAllInTenant(
  db: D1Database,
  tenantId: string,
  refs: Array<{ table: ScopedTable; id: string | null | undefined } | null>,
): Promise<void> {
  for (const ref of refs) {
    if (!ref || ref.id == null || ref.id === "") continue;
    await assertRowInTenant(db, ref.table, tenantId, ref.id);
  }
}
