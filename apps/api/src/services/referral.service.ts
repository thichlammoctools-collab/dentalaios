import type { D1Database } from "@cloudflare/workers-types";
import type { ReferralProgramInput, ReferrerCreateInput, ReferrerUpdateInput } from "@shared/validation";
import type { ReferralCase, ReferralReward, Referrer } from "@shared/types";
import { isAssistantRole, isDoctorRole } from "@shared/constants";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "../lib/errors";
import { newId } from "../lib/ids";
import { createReferralsRepository, mapReward } from "../repositories/referrals.repo";

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function code(prefix: string, length = 8): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return `${prefix}${Array.from(bytes, (item) => CODE_ALPHABET[item % CODE_ALPHABET.length]).join("")}`;
}

function isoAfter(days: number): string {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
}

async function addEvent(db: D1Database, tenantId: string, caseId: string, eventType: string, actorId?: string, fromStatus?: string, toStatus?: string, reason?: string, rewardId?: string): Promise<void> {
  await db.prepare(
    `INSERT INTO referral_events (id, tenant_id, case_id, reward_id, actor_type, actor_id, event_type, from_status, to_status, reason)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(newId(), tenantId, caseId, rewardId ?? null, actorId ? "user" : "system", actorId ?? null, eventType, fromStatus ?? null, toStatus ?? null, reason ?? null).run();
}

async function assertReferrerLink(db: D1Database, tenantId: string, input: Pick<ReferrerCreateInput, "type" | "linked_patient_id" | "linked_user_id">): Promise<void> {
  if (input.linked_patient_id) {
    const patient = await db.prepare("SELECT id FROM patients WHERE tenant_id = ? AND id = ?").bind(tenantId, input.linked_patient_id).first();
    if (!patient) throw new ValidationError("Hồ sơ bệnh nhân liên kết không hợp lệ");
  }
  if (input.linked_user_id) {
    const user = await db.prepare(
      `SELECT u.id, u.role_id, r.system_key, r.name AS role_name FROM users u JOIN roles r ON r.id = u.role_id
       WHERE u.tenant_id = ? AND u.id = ? AND u.is_active = 1`,
    ).bind(tenantId, input.linked_user_id).first<{ id: string; role_id: string; system_key: string | null; role_name: string }>();
    if (!user) throw new ValidationError("Tài khoản nhân viên liên kết không hợp lệ");
    if (input.type === "doctor" && !isDoctorRole(user.system_key ?? undefined, user.role_id, user.role_name)) throw new ValidationError("Người liên kết phải có vai trò bác sĩ");
    if (input.type === "assistant" && !isAssistantRole(user.system_key ?? undefined, user.role_id, user.role_name)) throw new ValidationError("Người liên kết phải có vai trò phụ tá");
  }
}

async function assertActorNotLinked(db: D1Database, tenantId: string, actorId: string, caseId: string): Promise<void> {
  const row = await db.prepare(
    `SELECT r.linked_user_id FROM referral_cases c JOIN referrers r ON r.id = c.referrer_id
     WHERE c.tenant_id = ? AND c.id = ?`,
  ).bind(tenantId, caseId).first<{ linked_user_id: string | null }>();
  if (row?.linked_user_id === actorId) throw new ForbiddenError("Không thể thao tác phần thưởng của chính mình");
}

export const referralService = {
  async listReferrers(db: D1Database, tenantId: string) {
    return createReferralsRepository(db).listReferrers(tenantId);
  },

  async createReferrer(db: D1Database, tenantId: string, userId: string, input: ReferrerCreateInput): Promise<Referrer> {
    await assertReferrerLink(db, tenantId, input);
    const id = newId();
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const referrerCode = code("RF-");
      try {
        await db.prepare(
          `INSERT INTO referrers (id, tenant_id, type, code, name, email, phone, linked_patient_id, linked_user_id, created_by)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ).bind(id, tenantId, input.type, referrerCode, input.name, input.email ?? null, input.phone ?? null, input.linked_patient_id ?? null, input.linked_user_id ?? null, userId).run();
        const created = await createReferralsRepository(db).getReferrer(tenantId, id);
        if (!created) throw new Error("Inserted referrer was not found");
        return created;
      } catch (error) {
        if (attempt === 2) throw error;
      }
    }
    throw new Error("Could not create referrer");
  },

  async updateReferrer(db: D1Database, tenantId: string, userId: string, id: string, input: ReferrerUpdateInput): Promise<Referrer> {
    const existing = await createReferralsRepository(db).getReferrer(tenantId, id);
    if (!existing) throw new NotFoundError("Người giới thiệu không tồn tại");
    if (existing.linked_user_id === userId) throw new ForbiddenError("Không thể tự chỉnh hồ sơ Người giới thiệu của mình");
    const merged = { ...existing, ...input, linked_patient_id: input.linked_patient_id === null ? undefined : input.linked_patient_id ?? existing.linked_patient_id, linked_user_id: input.linked_user_id === null ? undefined : input.linked_user_id ?? existing.linked_user_id };
    await assertReferrerLink(db, tenantId, merged);
    const fields: string[] = [];
    const values: unknown[] = [];
    for (const key of ["type", "name", "email", "phone", "linked_patient_id", "linked_user_id", "status"] as const) {
      if (input[key] !== undefined) { fields.push(`${key} = ?`); values.push(input[key] ?? null); }
    }
    if (fields.length) await db.prepare(`UPDATE referrers SET ${fields.join(", ")}, updated_at = datetime('now') WHERE tenant_id = ? AND id = ?`).bind(...values, tenantId, id).run();
    return (await createReferralsRepository(db).getReferrer(tenantId, id))!;
  },

  async regenerateCode(db: D1Database, tenantId: string, userId: string, id: string): Promise<Referrer> {
    const referrer = await createReferralsRepository(db).getReferrer(tenantId, id);
    if (!referrer) throw new NotFoundError("Người giới thiệu không tồn tại");
    if (referrer.linked_user_id === userId) throw new ForbiddenError("Không thể cấp lại mã của chính mình");
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        await db.prepare("UPDATE referrers SET code = ?, updated_at = datetime('now') WHERE tenant_id = ? AND id = ?").bind(code("RF-"), tenantId, id).run();
        return (await createReferralsRepository(db).getReferrer(tenantId, id))!;
      } catch (error) { if (attempt === 2) throw error; }
    }
    throw new Error("Could not regenerate referral code");
  },

  async createProgram(db: D1Database, tenantId: string, userId: string, input: ReferralProgramInput) {
    const id = newId();
    const statements = [
      db.prepare(
        `INSERT INTO referral_programs (id, tenant_id, name, status, starts_at, ends_at, priority, conversion_window_days, review_window_days, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(id, tenantId, input.name, input.status, input.starts_at, input.ends_at ?? null, input.priority, input.conversion_window_days, input.review_window_days, userId),
      ...input.branch_ids.map((branchId) => db.prepare("INSERT INTO referral_program_branches (tenant_id, program_id, branch_id) VALUES (?, ?, ?)").bind(tenantId, id, branchId)),
      ...input.rules.map((rule) => db.prepare(
        `INSERT INTO referral_reward_rules (id, tenant_id, program_id, program_version, referrer_type, min_net_revenue, reward_kind, calculation_type, value, voucher_valid_days)
         VALUES (?, ?, ?, 1, ?, ?, ?, ?, ?, ?)`,
      ).bind(newId(), tenantId, id, rule.referrer_type, rule.min_net_revenue, rule.reward_kind, rule.calculation_type, rule.value, rule.voucher_valid_days ?? null)),
    ];
    await db.batch(statements);
    return (await createReferralsRepository(db).getProgram(tenantId, id))!;
  },

  async updateProgramStatus(db: D1Database, tenantId: string, id: string, status: "draft" | "active" | "inactive") {
    const existing = await createReferralsRepository(db).getProgram(tenantId, id);
    if (!existing) throw new NotFoundError("Chương trình giới thiệu không tồn tại");
    await db.prepare("UPDATE referral_programs SET status = ?, updated_at = datetime('now') WHERE tenant_id = ? AND id = ?").bind(status, tenantId, id).run();
    return (await createReferralsRepository(db).getProgram(tenantId, id))!;
  },

  async listPrograms(db: D1Database, tenantId: string) {
    const repo = createReferralsRepository(db);
    const programs = await repo.listPrograms(tenantId);
    return Promise.all(programs.map(async (program) => ({ ...program, rules: await repo.listRules(tenantId, program.id, program.current_version) })));
  },

  async resolveReferrer(db: D1Database, tenantId: string, input: { referrerId?: string; referralCode?: string }): Promise<Referrer | null> {
    if (!input.referrerId && !input.referralCode) return null;
    const referrer = input.referralCode
      ? await createReferralsRepository(db).findReferrerByCode(tenantId, input.referralCode)
      : await createReferralsRepository(db).getReferrer(tenantId, input.referrerId!);
    if (!referrer || referrer.status !== "active") throw new ValidationError("Mã hoặc Người giới thiệu không hợp lệ");
    return referrer;
  },

  async createCaseForNewPatient(db: D1Database, tenantId: string, userId: string, patient: { id: string; branch_id: string }, referrer: Referrer, source: "code" | "manual"): Promise<ReferralCase | null> {
    if (referrer.linked_patient_id === patient.id) throw new ValidationError("Không được tự giới thiệu chính mình");
    const now = new Date().toISOString();
    const programRow = await db.prepare(
      `SELECT p.* FROM referral_programs p
       WHERE p.tenant_id = ? AND p.status = 'active' AND p.starts_at <= ? AND (p.ends_at IS NULL OR p.ends_at >= ?)
         AND EXISTS (SELECT 1 FROM referral_reward_rules rr WHERE rr.program_id = p.id AND rr.program_version = p.current_version AND rr.referrer_type = ?)
         AND (NOT EXISTS (SELECT 1 FROM referral_program_branches pb WHERE pb.program_id = p.id)
              OR EXISTS (SELECT 1 FROM referral_program_branches pb WHERE pb.program_id = p.id AND pb.branch_id = ?))
       ORDER BY p.priority DESC, p.created_at DESC LIMIT 1`,
    ).bind(tenantId, now, now, referrer.type, patient.branch_id).first<{ id: string; current_version: number; conversion_window_days: number }>();
    if (!programRow) return null;
    const id = newId();
    const conversionEndsAt = isoAfter(Number(programRow.conversion_window_days));
    await db.prepare(
      `INSERT INTO referral_cases (id, tenant_id, patient_id, referrer_id, branch_id, program_id, program_version, source, conversion_ends_at, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(id, tenantId, patient.id, referrer.id, patient.branch_id, programRow.id, programRow.current_version, source, conversionEndsAt, userId).run();
    await addEvent(db, tenantId, id, "case_created", userId, undefined, "pending_conversion");
    return createReferralsRepository(db).getCase(tenantId, id);
  },

  async evaluateCaseForPatient(db: D1Database, tenantId: string, patientId: string): Promise<void> {
    const repo = createReferralsRepository(db);
    const current = await repo.getCaseForPatient(tenantId, patientId);
    if (!current || ["cancelled", "rejected", "expired", "recovered"].includes(current.status)) return;
    const revenueRow = await db.prepare(
      `SELECT COALESCE(SUM(amount), 0) AS net_revenue FROM payments
       WHERE tenant_id = ? AND patient_id = ? AND status = 'confirmed'
         AND COALESCE(confirmed_at, created_at) >= ? AND COALESCE(confirmed_at, created_at) <= ?`,
    ).bind(tenantId, patientId, current.registered_at, current.conversion_ends_at).first<{ net_revenue: number }>();
    const rules = await repo.listRules(tenantId, current.program_id, current.program_version);
    const rule = rules.filter((item) => item.referrer_type === current.referrer_type && item.min_net_revenue <= Number(revenueRow?.net_revenue ?? 0)).sort((a, b) => b.min_net_revenue - a.min_net_revenue)[0];
    const rewardRow = await db.prepare("SELECT * FROM referral_rewards WHERE tenant_id = ? AND referral_case_id = ?").bind(tenantId, current.id).first();
    if (!rule) {
      if (rewardRow) {
        const reward = mapReward(rewardRow as Record<string, unknown>);
        if (reward.status === "pending_approval") {
          await db.batch([
            db.prepare("DELETE FROM referral_rewards WHERE tenant_id = ? AND id = ? AND status = 'pending_approval'").bind(tenantId, reward.id),
            db.prepare("UPDATE referral_cases SET status = 'pending_conversion', eligible_at = NULL, review_due_at = NULL, updated_at = datetime('now') WHERE tenant_id = ? AND id = ?").bind(tenantId, current.id),
          ]);
          await addEvent(db, tenantId, current.id, "eligibility_lost", undefined, "pending_approval", "pending_conversion", undefined, reward.id);
        } else if (["cash_payable", "cash_paid", "voucher_issued"].includes(reward.status)) {
          await db.batch([
            db.prepare("UPDATE referral_rewards SET status = 'recovery_required', updated_at = datetime('now') WHERE tenant_id = ? AND id = ?").bind(tenantId, reward.id),
            db.prepare("UPDATE referral_cases SET status = 'recovery_required', updated_at = datetime('now') WHERE tenant_id = ? AND id = ?").bind(tenantId, current.id),
          ]);
          await addEvent(db, tenantId, current.id, "recovery_required", undefined, current.status, "recovery_required", "Doanh thu ròng giảm dưới ngưỡng", reward.id);
        }
      }
      return;
    }
    if (!rewardRow) {
      const reviewDueAt = isoAfter((await repo.getProgram(tenantId, current.program_id))!.review_window_days);
      const amount = rule.calculation_type === "percentage" ? Math.round(Number(revenueRow?.net_revenue ?? 0) * rule.value / 100) : rule.value;
      const rewardId = newId();
      await db.batch([
        db.prepare("UPDATE referral_cases SET status = 'pending_approval', eligible_at = datetime('now'), review_due_at = ?, updated_at = datetime('now') WHERE tenant_id = ? AND id = ?").bind(reviewDueAt, tenantId, current.id),
        db.prepare(
          `INSERT INTO referral_rewards (id, tenant_id, referral_case_id, rule_id, reward_kind, calculation_type, configured_value, basis_net_revenue, calculated_amount)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ).bind(rewardId, tenantId, current.id, rule.id, rule.reward_kind, rule.calculation_type, rule.value, Number(revenueRow?.net_revenue ?? 0), amount),
      ]);
      await addEvent(db, tenantId, current.id, "reward_pending_approval", undefined, current.status, "pending_approval", undefined, rewardId);
    }
  },

  async listCases(db: D1Database, tenantId: string, status?: string) { return createReferralsRepository(db).listCases(tenantId, status); },
  async listRewards(db: D1Database, tenantId: string, status?: string) { return createReferralsRepository(db).listRewards(tenantId, status); },

  async reviewReward(db: D1Database, tenantId: string, userId: string, rewardId: string, action: "approve" | "reject", reason?: string): Promise<ReferralReward> {
    const reward = await createReferralsRepository(db).getReward(tenantId, rewardId);
    if (!reward) throw new NotFoundError("Phần thưởng không tồn tại");
    if (reward.status !== "pending_approval") throw new ConflictError("Phần thưởng không ở trạng thái chờ duyệt");
    await assertActorNotLinked(db, tenantId, userId, reward.referral_case_id);
    const toStatus = action === "approve" ? (reward.reward_kind === "cash" ? "cash_payable" : "voucher_issued") : "rejected";
    const statements = [
      db.prepare("UPDATE referral_rewards SET status = ?, reviewed_by = ?, reviewed_at = datetime('now'), rejection_reason = ?, updated_at = datetime('now') WHERE tenant_id = ? AND id = ? AND status = 'pending_approval'").bind(toStatus, userId, action === "reject" ? reason ?? null : null, tenantId, rewardId),
      db.prepare("UPDATE referral_cases SET status = ?, updated_at = datetime('now') WHERE tenant_id = ? AND id = ?").bind(action === "approve" ? "approved" : "rejected", tenantId, reward.referral_case_id),
    ];
    await db.batch(statements);
    if (action === "approve" && reward.reward_kind === "voucher") await this.issueVoucher(db, tenantId, userId, rewardId);
    await addEvent(db, tenantId, reward.referral_case_id, action === "approve" ? "reward_approved" : "reward_rejected", userId, "pending_approval", toStatus, reason, rewardId);
    return (await createReferralsRepository(db).getReward(tenantId, rewardId))!;
  },

  async issueVoucher(db: D1Database, tenantId: string, userId: string, rewardId: string) {
    const reward = await createReferralsRepository(db).getReward(tenantId, rewardId);
    if (!reward) throw new NotFoundError("Phần thưởng không tồn tại");
    if (reward.reward_kind !== "voucher" || reward.status !== "voucher_issued") throw new ConflictError("Phần thưởng không thể phát hành voucher");
    const existing = await createReferralsRepository(db).getVoucherForReward(tenantId, rewardId);
    if (existing) return existing;
    const rule = await db.prepare("SELECT voucher_valid_days FROM referral_reward_rules WHERE tenant_id = ? AND id = ?").bind(tenantId, reward.rule_id).first<{ voucher_valid_days: number }>();
    const id = newId();
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        await db.prepare("INSERT INTO referral_vouchers (id, tenant_id, reward_id, code, face_value, expires_at) VALUES (?, ?, ?, ?, ?, ?)").bind(id, tenantId, rewardId, code("VCH-", 10), reward.calculated_amount, isoAfter(Number(rule?.voucher_valid_days ?? 30))).run();
        await addEvent(db, tenantId, reward.referral_case_id, "voucher_issued", userId, undefined, "voucher_issued", undefined, rewardId);
        return (await createReferralsRepository(db).getVoucherForReward(tenantId, rewardId))!;
      } catch (error) { if (attempt === 2) throw error; }
    }
    throw new Error("Could not issue voucher");
  },

  async markCashPaid(db: D1Database, tenantId: string, userId: string, rewardId: string, method: string, reference?: string): Promise<ReferralReward> {
    const reward = await createReferralsRepository(db).getReward(tenantId, rewardId);
    if (!reward) throw new NotFoundError("Phần thưởng không tồn tại");
    if (reward.status !== "cash_payable") throw new ConflictError("Phần thưởng không chờ chi tiền");
    await assertActorNotLinked(db, tenantId, userId, reward.referral_case_id);
    await db.prepare("UPDATE referral_rewards SET status = 'cash_paid', paid_by = ?, paid_at = datetime('now'), payment_method = ?, payment_reference = ?, updated_at = datetime('now') WHERE tenant_id = ? AND id = ?").bind(userId, method, reference ?? null, tenantId, rewardId).run();
    await addEvent(db, tenantId, reward.referral_case_id, "cash_paid", userId, "cash_payable", "cash_paid", undefined, rewardId);
    return (await createReferralsRepository(db).getReward(tenantId, rewardId))!;
  },

  async recoverReward(db: D1Database, tenantId: string, userId: string, rewardId: string, reason: string, reference?: string): Promise<ReferralReward> {
    const reward = await createReferralsRepository(db).getReward(tenantId, rewardId);
    if (!reward) throw new NotFoundError("Phần thưởng không tồn tại");
    if (reward.status !== "recovery_required") throw new ConflictError("Phần thưởng không cần thu hồi");
    await assertActorNotLinked(db, tenantId, userId, reward.referral_case_id);
    const voucher = await createReferralsRepository(db).getVoucherForReward(tenantId, rewardId);
    const statements = [
      db.prepare("UPDATE referral_rewards SET status = 'recovered', recovery_by = ?, recovered_at = datetime('now'), recovery_reason = ?, payment_reference = COALESCE(?, payment_reference), updated_at = datetime('now') WHERE tenant_id = ? AND id = ?").bind(userId, reason, reference ?? null, tenantId, rewardId),
      db.prepare("UPDATE referral_cases SET status = 'recovered', updated_at = datetime('now') WHERE tenant_id = ? AND id = ?").bind(tenantId, reward.referral_case_id),
    ];
    if (voucher?.status === "issued") statements.push(db.prepare("UPDATE referral_vouchers SET status = 'cancelled', cancelled_by = ?, cancelled_at = datetime('now'), cancellation_reason = ? WHERE tenant_id = ? AND id = ?").bind(userId, reason, tenantId, voucher.id));
    await db.batch(statements);
    await addEvent(db, tenantId, reward.referral_case_id, "reward_recovered", userId, "recovery_required", "recovered", reason, rewardId);
    return (await createReferralsRepository(db).getReward(tenantId, rewardId))!;
  },

  async reopenReward(db: D1Database, tenantId: string, userId: string, rewardId: string, reason: string): Promise<ReferralReward> {
    const reward = await createReferralsRepository(db).getReward(tenantId, rewardId);
    if (!reward) throw new NotFoundError("Phần thưởng không tồn tại");
    if (reward.status !== "expired") throw new ConflictError("Chỉ có thể mở lại phần thưởng đã hết hạn");
    await assertActorNotLinked(db, tenantId, userId, reward.referral_case_id);
    const caseRow = await createReferralsRepository(db).getCase(tenantId, reward.referral_case_id);
    if (!caseRow || caseRow.status !== "expired") throw new ConflictError("Case không ở trạng thái hết hạn");
    const program = await createReferralsRepository(db).getProgram(tenantId, caseRow.program_id);
    if (!program) throw new NotFoundError("Chương trình giới thiệu không tồn tại");
    await db.batch([
      db.prepare("UPDATE referral_cases SET status = 'pending_approval', review_due_at = ?, updated_at = datetime('now') WHERE tenant_id = ? AND id = ? AND status = 'expired'").bind(isoAfter(program.review_window_days), tenantId, caseRow.id),
      db.prepare("UPDATE referral_rewards SET status = 'pending_approval', updated_at = datetime('now') WHERE tenant_id = ? AND id = ? AND status = 'expired'").bind(tenantId, rewardId),
    ]);
    await addEvent(db, tenantId, caseRow.id, "reward_reopened", userId, "expired", "pending_approval", reason, rewardId);
    return (await createReferralsRepository(db).getReward(tenantId, rewardId))!;
  },
};

export async function expireReferralWork(db: D1Database): Promise<void> {
  const expired = await db.prepare(
    `SELECT c.id AS case_id, rw.id AS reward_id FROM referral_cases c
     JOIN referral_rewards rw ON rw.referral_case_id = c.id
     WHERE c.status = 'pending_approval' AND rw.status = 'pending_approval' AND c.review_due_at < datetime('now')`,
  ).all<{ case_id: string; reward_id: string }>();
  for (const item of expired.results) {
    await db.batch([
      db.prepare("UPDATE referral_cases SET status = 'expired', updated_at = datetime('now') WHERE id = ? AND status = 'pending_approval'").bind(item.case_id),
      db.prepare("UPDATE referral_rewards SET status = 'expired', updated_at = datetime('now') WHERE id = ? AND status = 'pending_approval'").bind(item.reward_id),
    ]);
  }
  await db.prepare("UPDATE referral_vouchers SET status = 'expired' WHERE status = 'issued' AND expires_at < datetime('now')").run();
}
