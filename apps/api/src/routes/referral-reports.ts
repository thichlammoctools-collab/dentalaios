import { Hono } from "hono";
import { PERMISSIONS } from "@shared/constants";
import type { Env } from "../index";
import { getJwt, requireAuth, type AuthContext } from "../middleware/auth";
import { requirePermission } from "../middleware/rbac";

const router = new Hono<{ Bindings: Env; Variables: AuthContext }>();
router.use("*", requireAuth(), requirePermission(PERMISSIONS.VIEW_REFERRAL_REPORTS));
router.get("/", async (c) => {
  const jwt = getJwt(c);
  const params = new URL(c.req.url).searchParams;
  const from = params.get("from") ?? "";
  const to = params.get("to") ?? "";
  const referrerType = params.get("referrer_type") ?? "";
  const caseStatus = params.get("case_status") ?? "";
  const rewardStatus = params.get("reward_status") ?? "";

  const conditions: string[] = ["c.tenant_id = ?"];
  const bindValues: unknown[] = [jwt.tenant_id];

  if (from) { conditions.push("c.registered_at >= ?"); bindValues.push(from); }
  if (to) { conditions.push("c.registered_at <= ?"); bindValues.push(to + "T23:59:59"); }
  if (caseStatus) { conditions.push("c.status = ?"); bindValues.push(caseStatus); }
  if (referrerType) { conditions.push("r.type = ?"); bindValues.push(referrerType); }
  if (rewardStatus) { conditions.push("rw.status = ?"); bindValues.push(rewardStatus); }

  const where = conditions.join(" AND ");

  const summary = await c.env.DB.prepare(
    `SELECT COUNT(*) AS case_count,
      SUM(CASE WHEN c.status IN ('pending_approval','approved','recovery_required','recovered') THEN 1 ELSE 0 END) AS eligible_count,
      COALESCE(SUM(CASE WHEN rw.status IN ('cash_payable','cash_paid','voucher_issued') THEN rw.calculated_amount ELSE 0 END), 0) AS approved_rewards,
      COALESCE(SUM(CASE WHEN rw.status = 'cash_payable' THEN rw.calculated_amount ELSE 0 END), 0) AS cash_payable,
      COALESCE(SUM(CASE WHEN rw.status = 'recovery_required' THEN rw.calculated_amount ELSE 0 END), 0) AS recovery_required
     FROM referral_cases c LEFT JOIN referral_rewards rw ON rw.referral_case_id = c.id LEFT JOIN referrers r ON r.id = c.referrer_id WHERE ${where}`,
  ).bind(...bindValues).first();
  const byReferrer = await c.env.DB.prepare(
    `SELECT r.id, r.name, r.code, r.type, COUNT(c.id) AS case_count, COALESCE(SUM(rw.calculated_amount), 0) AS reward_total
     FROM referrers r LEFT JOIN referral_cases c ON c.referrer_id = r.id LEFT JOIN referral_rewards rw ON rw.referral_case_id = c.id
     WHERE ${where} GROUP BY r.id ORDER BY case_count DESC, reward_total DESC LIMIT 100`,
  ).bind(...bindValues).all();
  const raw = (summary ?? {}) as Record<string, unknown>;
  return c.json({
    kpis: {
      case_count: Number(raw.case_count ?? 0),
      eligible_count: Number(raw.eligible_count ?? 0),
      approved_rewards: Number(raw.approved_rewards ?? 0),
      cash_payable: Number(raw.cash_payable ?? 0),
      recovery_required: Number(raw.recovery_required ?? 0),
    },
    items: byReferrer.results.map((row) => ({
      referrer_id: row.id,
      referrer_name: row.name,
      referrer_code: row.code,
      referrer_type: row.type,
      case_count: Number(row.case_count ?? 0),
      reward_amount: Number(row.reward_total ?? 0),
    })),
    total: byReferrer.results.length,
  });
});
router.get("/export.csv", async (c) => {
  const jwt = getJwt(c);
  const rows = await c.env.DB.prepare(
    `SELECT r.code, r.name, r.type, c.status AS case_status, rw.status AS reward_status, rw.calculated_amount, rw.currency, rw.created_at
     FROM referral_cases c JOIN referrers r ON r.id = c.referrer_id LEFT JOIN referral_rewards rw ON rw.referral_case_id = c.id
     WHERE c.tenant_id = ? ORDER BY c.registered_at DESC`,
  ).bind(jwt.tenant_id).all<Record<string, unknown>>();
  const header = "code,name,type,case_status,reward_status,calculated_amount,currency,created_at";
  const csv = [header, ...rows.results.map((row) => [row.code, row.name, row.type, row.case_status, row.reward_status, row.calculated_amount, row.currency, row.created_at].map((value) => `"${String(value ?? "").replaceAll("\"", "\"\"")}"`).join(","))].join("\n");
  return new Response(csv, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": "attachment; filename=referrals.csv" } });
});
export default router;
