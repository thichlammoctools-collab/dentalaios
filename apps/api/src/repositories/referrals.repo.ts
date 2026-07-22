import type { D1Database } from "@cloudflare/workers-types";
import type { ReferralCase, ReferralProgram, ReferralReward, ReferralRewardRule, ReferralVoucher, Referrer } from "@shared/types";
import type { D1Row } from "./base";

export function mapReferrer(row: D1Row): Referrer {
  return {
    id: row.id as string, tenant_id: row.tenant_id as string, type: row.type as Referrer["type"],
    code: row.code as string, name: row.name as string, email: (row.email as string | null) ?? undefined,
    phone: (row.phone as string | null) ?? undefined, linked_patient_id: (row.linked_patient_id as string | null) ?? undefined,
    linked_user_id: (row.linked_user_id as string | null) ?? undefined, status: row.status as Referrer["status"],
    created_by: row.created_by as string, created_at: row.created_at as string, updated_at: row.updated_at as string,
  };
}

export function mapProgram(row: D1Row): ReferralProgram {
  return {
    id: row.id as string, tenant_id: row.tenant_id as string, name: row.name as string,
    status: row.status as ReferralProgram["status"], starts_at: row.starts_at as string,
    ends_at: (row.ends_at as string | null) ?? undefined, priority: Number(row.priority),
    conversion_window_days: Number(row.conversion_window_days), review_window_days: Number(row.review_window_days),
    current_version: Number(row.current_version), branch_ids: JSON.parse((row.branch_ids as string | null) ?? "[]") as string[],
    created_by: row.created_by as string, created_at: row.created_at as string, updated_at: row.updated_at as string,
  };
}

export function mapRule(row: D1Row): ReferralRewardRule {
  return {
    id: row.id as string, tenant_id: row.tenant_id as string, program_id: row.program_id as string,
    program_version: Number(row.program_version), referrer_type: row.referrer_type as ReferralRewardRule["referrer_type"],
    min_net_revenue: Number(row.min_net_revenue), reward_kind: row.reward_kind as ReferralRewardRule["reward_kind"],
    calculation_type: row.calculation_type as ReferralRewardRule["calculation_type"], value: Number(row.value),
    voucher_valid_days: (row.voucher_valid_days as number | null) ?? undefined, created_at: row.created_at as string,
  };
}

export function mapCase(row: D1Row): ReferralCase {
  return {
    id: row.id as string, tenant_id: row.tenant_id as string, patient_id: row.patient_id as string,
    referrer_id: row.referrer_id as string, referrer_name: (row.referrer_name as string | null) ?? undefined,
    referrer_code: (row.referrer_code as string | null) ?? undefined, referrer_type: (row.referrer_type as ReferralCase["referrer_type"] | null) ?? undefined,
    branch_id: row.branch_id as string, program_id: row.program_id as string, program_name: (row.program_name as string | null) ?? undefined,
    program_version: Number(row.program_version), source: row.source as ReferralCase["source"], status: row.status as ReferralCase["status"],
    registered_at: row.registered_at as string, conversion_ends_at: row.conversion_ends_at as string,
    eligible_at: (row.eligible_at as string | null) ?? undefined, review_due_at: (row.review_due_at as string | null) ?? undefined,
    risk_flags: JSON.parse((row.risk_flags as string | null) ?? "[]") as string[], created_by: row.created_by as string,
    updated_at: row.updated_at as string,
  };
}

export function mapReward(row: D1Row): ReferralReward {
  return {
    id: row.id as string, tenant_id: row.tenant_id as string, referral_case_id: row.referral_case_id as string,
    rule_id: row.rule_id as string, reward_kind: row.reward_kind as ReferralReward["reward_kind"],
    calculation_type: row.calculation_type as ReferralReward["calculation_type"], configured_value: Number(row.configured_value),
    basis_net_revenue: Number(row.basis_net_revenue), calculated_amount: Number(row.calculated_amount), currency: row.currency as string,
    status: row.status as ReferralReward["status"], reviewed_by: (row.reviewed_by as string | null) ?? undefined,
    reviewed_at: (row.reviewed_at as string | null) ?? undefined, rejection_reason: (row.rejection_reason as string | null) ?? undefined,
    paid_by: (row.paid_by as string | null) ?? undefined, paid_at: (row.paid_at as string | null) ?? undefined,
    payment_method: (row.payment_method as string | null) ?? undefined, payment_reference: (row.payment_reference as string | null) ?? undefined,
    recovery_by: (row.recovery_by as string | null) ?? undefined, recovered_at: (row.recovered_at as string | null) ?? undefined,
    recovery_reason: (row.recovery_reason as string | null) ?? undefined, created_at: row.created_at as string, updated_at: row.updated_at as string,
  };
}

export function mapVoucher(row: D1Row): ReferralVoucher {
  return { id: row.id as string, tenant_id: row.tenant_id as string, reward_id: row.reward_id as string, code: row.code as string, face_value: Number(row.face_value), issued_at: row.issued_at as string, expires_at: row.expires_at as string, status: row.status as ReferralVoucher["status"] };
}

export function createReferralsRepository(db: D1Database) {
  const caseSelect = `SELECT c.*, r.name AS referrer_name, r.code AS referrer_code, r.type AS referrer_type, p.name AS program_name FROM referral_cases c JOIN referrers r ON r.id = c.referrer_id JOIN referral_programs p ON p.id = c.program_id`;
  const programSelect = `SELECT p.*, COALESCE((SELECT json_group_array(branch_id) FROM referral_program_branches b WHERE b.program_id = p.id), '[]') AS branch_ids FROM referral_programs p`;
  return {
    async listReferrers(tenantId: string) {
      const result = await db.prepare("SELECT * FROM referrers WHERE tenant_id = ? ORDER BY name").bind(tenantId).all<D1Row>();
      return result.results.map(mapReferrer);
    },
    async getReferrer(tenantId: string, id: string) {
      const row = await db.prepare("SELECT * FROM referrers WHERE tenant_id = ? AND id = ?").bind(tenantId, id).first<D1Row>();
      return row ? mapReferrer(row) : null;
    },
    async findReferrerByCode(tenantId: string, code: string) {
      const row = await db.prepare("SELECT * FROM referrers WHERE tenant_id = ? AND code = ? AND status = 'active'").bind(tenantId, code.toUpperCase()).first<D1Row>();
      return row ? mapReferrer(row) : null;
    },
    async listPrograms(tenantId: string) {
      const result = await db.prepare(`${programSelect} WHERE p.tenant_id = ? ORDER BY p.priority DESC, p.created_at DESC`).bind(tenantId).all<D1Row>();
      return result.results.map(mapProgram);
    },
    async getProgram(tenantId: string, id: string) {
      const row = await db.prepare(`${programSelect} WHERE p.tenant_id = ? AND p.id = ?`).bind(tenantId, id).first<D1Row>();
      return row ? mapProgram(row) : null;
    },
    async listRules(tenantId: string, programId: string, version?: number) {
      const sql = version === undefined
        ? "SELECT * FROM referral_reward_rules WHERE tenant_id = ? AND program_id = ? ORDER BY program_version DESC, referrer_type, min_net_revenue"
        : "SELECT * FROM referral_reward_rules WHERE tenant_id = ? AND program_id = ? AND program_version = ? ORDER BY referrer_type, min_net_revenue";
      const statement = version === undefined ? db.prepare(sql).bind(tenantId, programId) : db.prepare(sql).bind(tenantId, programId, version);
      const result = await statement.all<D1Row>();
      return result.results.map(mapRule);
    },
    async getCaseForPatient(tenantId: string, patientId: string) {
      const row = await db.prepare(`${caseSelect} WHERE c.tenant_id = ? AND c.patient_id = ?`).bind(tenantId, patientId).first<D1Row>();
      return row ? mapCase(row) : null;
    },
    async getCase(tenantId: string, id: string) {
      const row = await db.prepare(`${caseSelect} WHERE c.tenant_id = ? AND c.id = ?`).bind(tenantId, id).first<D1Row>();
      return row ? mapCase(row) : null;
    },
    async listCases(tenantId: string, status?: string) {
      const sql = `${caseSelect} WHERE c.tenant_id = ?${status ? " AND c.status = ?" : ""} ORDER BY c.registered_at DESC`;
      const statement = status ? db.prepare(sql).bind(tenantId, status) : db.prepare(sql).bind(tenantId);
      const result = await statement.all<D1Row>();
      return result.results.map(mapCase);
    },
    async getReward(tenantId: string, id: string) {
      const row = await db.prepare("SELECT * FROM referral_rewards WHERE tenant_id = ? AND id = ?").bind(tenantId, id).first<D1Row>();
      return row ? mapReward(row) : null;
    },
    async listRewards(tenantId: string, status?: string) {
      const sql = `SELECT rw.*, r.name AS referrer_name, r.code AS referrer_code, c.status AS case_status, v.code AS voucher_code
        FROM referral_rewards rw JOIN referral_cases c ON c.id = rw.referral_case_id JOIN referrers r ON r.id = c.referrer_id
        LEFT JOIN referral_vouchers v ON v.reward_id = rw.id WHERE rw.tenant_id = ?${status ? " AND rw.status = ?" : ""} ORDER BY rw.created_at DESC`;
      const statement = status ? db.prepare(sql).bind(tenantId, status) : db.prepare(sql).bind(tenantId);
      return (await statement.all<D1Row>()).results;
    },
    async getVoucherForReward(tenantId: string, rewardId: string) {
      const row = await db.prepare("SELECT * FROM referral_vouchers WHERE tenant_id = ? AND reward_id = ?").bind(tenantId, rewardId).first<D1Row>();
      return row ? mapVoucher(row) : null;
    },
  };
}
