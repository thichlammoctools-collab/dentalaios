import type { D1Database } from "@cloudflare/workers-types";
import type {
  Expense,
  FinanceBranchBreakdown,
  FinanceDailyPoint,
  FinanceFilter,
  FinanceLedgerEntry,
  FinanceSnapshot,
} from "@shared/types";
import type { ExpenseCreateInput, ExpenseVoidInput } from "@shared/validation";
import { createBranchRepository } from "../repositories/branch.repo";
import { createExpensesRepository } from "../repositories/expenses.repo";
import type { D1Row } from "../repositories/base";
import { ConflictError, NotFoundError } from "../lib/errors";
import { getDashboardBounds } from "./dashboard.service";

const TIMEZONE = "Asia/Ho_Chi_Minh" as const;

function numeric(row: D1Row | null | undefined, field: string): number {
  return Number(row?.[field] ?? 0);
}

async function first(db: D1Database, sql: string, binds: unknown[]): Promise<D1Row | null> {
  return db.prepare(sql).bind(...binds).first<D1Row>();
}

async function rows(db: D1Database, sql: string, binds: unknown[]): Promise<D1Row[]> {
  const result = await db.prepare(sql).bind(...binds).all<D1Row>();
  return result.results ?? [];
}

function branchWhere(alias: string, branchId?: string): { sql: string; binds: unknown[] } {
  return branchId ? { sql: ` AND ${alias}.branch_id = ?`, binds: [branchId] } : { sql: "", binds: [] };
}

export const financeService = {
  async createExpense(db: D1Database, tenantId: string, createdBy: string, data: ExpenseCreateInput): Promise<Expense> {
    if (data.branch_id && !(await createBranchRepository(db).getById(tenantId, data.branch_id))) {
      throw new NotFoundError("Branch not found");
    }
    return createExpensesRepository(db).create(tenantId, createdBy, data);
  },

  async voidExpense(db: D1Database, tenantId: string, id: string, data: ExpenseVoidInput): Promise<Expense> {
    const existing = await createExpensesRepository(db).getById(tenantId, id);
    if (!existing) throw new NotFoundError("Expense not found");
    if (existing.status !== "posted") throw new ConflictError("Chi phí này đã được hủy");
    const voided = await createExpensesRepository(db).void(tenantId, id, data.reason);
    if (!voided) throw new NotFoundError("Expense not found");
    return voided;
  },

  async getSnapshot(
    db: D1Database,
    tenantId: string,
    filter: FinanceFilter,
    now = new Date(),
  ): Promise<FinanceSnapshot> {
    const branchRepo = createBranchRepository(db);
    if (filter.branch_id && !(await branchRepo.getById(tenantId, filter.branch_id))) {
      throw new NotFoundError("Branch not found");
    }
    const branches = await branchRepo.list(tenantId);
    const bounds = getDashboardBounds(filter.range, now);
    const paymentBranch = branchWhere("v", filter.branch_id);
    const expenseBranch = branchWhere("e", filter.branch_id);
    const referralBranch = branchWhere("rc", filter.branch_id);
    const receiptTime = "COALESCE(p.confirmed_at, p.created_at)";

    const [receipts, expenses, payouts, outstanding, receiptDaily, expenseDaily, payoutDaily, categories, receiptBranches, expenseBranches, payoutBranches, receiptLedger, expenseLedger, payoutLedger] = await Promise.all([
      first(db, `SELECT COALESCE(SUM(p.amount), 0) AS amount
        FROM payments p
        JOIN treatment_plans tp ON tp.id = p.treatment_plan_id AND tp.tenant_id = p.tenant_id
        JOIN visits v ON v.id = tp.visit_id AND v.tenant_id = p.tenant_id
        WHERE p.tenant_id = ? AND p.status = 'confirmed'
          AND datetime(${receiptTime}) >= datetime(?) AND datetime(${receiptTime}) < datetime(?)${paymentBranch.sql}`,
      [tenantId, bounds.rangeStart, bounds.rangeEnd, ...paymentBranch.binds]),
      first(db, `SELECT COALESCE(SUM(e.amount), 0) AS amount FROM expenses e
        WHERE e.tenant_id = ? AND e.status = 'posted'
          AND datetime(e.occurred_at) >= datetime(?) AND datetime(e.occurred_at) < datetime(?)${expenseBranch.sql}`,
      [tenantId, bounds.rangeStart, bounds.rangeEnd, ...expenseBranch.binds]),
      first(db, `SELECT COALESCE(SUM(rr.calculated_amount), 0) AS amount
        FROM referral_rewards rr
        JOIN referral_cases rc ON rc.id = rr.referral_case_id AND rc.tenant_id = rr.tenant_id
        WHERE rr.tenant_id = ? AND rr.status = 'cash_paid'
          AND datetime(rr.paid_at) >= datetime(?) AND datetime(rr.paid_at) < datetime(?)${referralBranch.sql}`,
      [tenantId, bounds.rangeStart, bounds.rangeEnd, ...referralBranch.binds]),
      first(db, `SELECT COALESCE(SUM(tp.total_cost), 0) - COALESCE(SUM(confirmed.confirmed_paid), 0) AS amount
        FROM treatment_plans tp
        JOIN visits v ON v.id = tp.visit_id AND v.tenant_id = tp.tenant_id
        LEFT JOIN (
          SELECT treatment_plan_id, tenant_id, SUM(amount) AS confirmed_paid
          FROM payments WHERE tenant_id = ? AND status = 'confirmed'
          GROUP BY treatment_plan_id, tenant_id
        ) confirmed ON confirmed.treatment_plan_id = tp.id AND confirmed.tenant_id = tp.tenant_id
        WHERE tp.tenant_id = ? AND tp.status IN ('approved', 'completed')${paymentBranch.sql}`,
      [tenantId, tenantId, ...paymentBranch.binds]),
      rows(db, `SELECT date(datetime(${receiptTime}, '+7 hours')) AS date, COALESCE(SUM(p.amount), 0) AS amount
        FROM payments p JOIN treatment_plans tp ON tp.id = p.treatment_plan_id AND tp.tenant_id = p.tenant_id
        JOIN visits v ON v.id = tp.visit_id AND v.tenant_id = p.tenant_id
        WHERE p.tenant_id = ? AND p.status = 'confirmed'
          AND datetime(${receiptTime}) >= datetime(?) AND datetime(${receiptTime}) < datetime(?)${paymentBranch.sql}
        GROUP BY date`, [tenantId, bounds.rangeStart, bounds.rangeEnd, ...paymentBranch.binds]),
      rows(db, `SELECT date(datetime(e.occurred_at, '+7 hours')) AS date, COALESCE(SUM(e.amount), 0) AS amount
        FROM expenses e WHERE e.tenant_id = ? AND e.status = 'posted'
          AND datetime(e.occurred_at) >= datetime(?) AND datetime(e.occurred_at) < datetime(?)${expenseBranch.sql}
        GROUP BY date`, [tenantId, bounds.rangeStart, bounds.rangeEnd, ...expenseBranch.binds]),
      rows(db, `SELECT date(datetime(rr.paid_at, '+7 hours')) AS date, COALESCE(SUM(rr.calculated_amount), 0) AS amount
        FROM referral_rewards rr JOIN referral_cases rc ON rc.id = rr.referral_case_id AND rc.tenant_id = rr.tenant_id
        WHERE rr.tenant_id = ? AND rr.status = 'cash_paid'
          AND datetime(rr.paid_at) >= datetime(?) AND datetime(rr.paid_at) < datetime(?)${referralBranch.sql}
        GROUP BY date`, [tenantId, bounds.rangeStart, bounds.rangeEnd, ...referralBranch.binds]),
      rows(db, `SELECT e.category, COALESCE(SUM(e.amount), 0) AS amount FROM expenses e
        WHERE e.tenant_id = ? AND e.status = 'posted'
          AND datetime(e.occurred_at) >= datetime(?) AND datetime(e.occurred_at) < datetime(?)${expenseBranch.sql}
        GROUP BY e.category ORDER BY amount DESC`, [tenantId, bounds.rangeStart, bounds.rangeEnd, ...expenseBranch.binds]),
      rows(db, `SELECT v.branch_id, COALESCE(SUM(p.amount), 0) AS amount FROM payments p
        JOIN treatment_plans tp ON tp.id = p.treatment_plan_id AND tp.tenant_id = p.tenant_id
        JOIN visits v ON v.id = tp.visit_id AND v.tenant_id = p.tenant_id
        WHERE p.tenant_id = ? AND p.status = 'confirmed'
          AND datetime(${receiptTime}) >= datetime(?) AND datetime(${receiptTime}) < datetime(?)${paymentBranch.sql}
        GROUP BY v.branch_id`, [tenantId, bounds.rangeStart, bounds.rangeEnd, ...paymentBranch.binds]),
      rows(db, `SELECT e.branch_id, COALESCE(SUM(e.amount), 0) AS amount FROM expenses e
        WHERE e.tenant_id = ? AND e.status = 'posted'
          AND datetime(e.occurred_at) >= datetime(?) AND datetime(e.occurred_at) < datetime(?)${expenseBranch.sql}
        GROUP BY e.branch_id`, [tenantId, bounds.rangeStart, bounds.rangeEnd, ...expenseBranch.binds]),
      rows(db, `SELECT rc.branch_id, COALESCE(SUM(rr.calculated_amount), 0) AS amount FROM referral_rewards rr
        JOIN referral_cases rc ON rc.id = rr.referral_case_id AND rc.tenant_id = rr.tenant_id
        WHERE rr.tenant_id = ? AND rr.status = 'cash_paid'
          AND datetime(rr.paid_at) >= datetime(?) AND datetime(rr.paid_at) < datetime(?)${referralBranch.sql}
        GROUP BY rc.branch_id`, [tenantId, bounds.rangeStart, bounds.rangeEnd, ...referralBranch.binds]),
      rows(db, `SELECT p.id, ${receiptTime} AS occurred_at, p.amount, p.method, p.reference, p.code, v.branch_id
        FROM payments p JOIN treatment_plans tp ON tp.id = p.treatment_plan_id AND tp.tenant_id = p.tenant_id
        JOIN visits v ON v.id = tp.visit_id AND v.tenant_id = p.tenant_id
        WHERE p.tenant_id = ? AND p.status = 'confirmed'
          AND datetime(${receiptTime}) >= datetime(?) AND datetime(${receiptTime}) < datetime(?)${paymentBranch.sql}
        ORDER BY datetime(${receiptTime}) DESC LIMIT 50`, [tenantId, bounds.rangeStart, bounds.rangeEnd, ...paymentBranch.binds]),
      rows(db, `SELECT e.id, e.occurred_at, e.amount, e.method, e.reference, e.category, e.vendor_name, e.branch_id, e.status
        FROM expenses e WHERE e.tenant_id = ?
          AND datetime(e.occurred_at) >= datetime(?) AND datetime(e.occurred_at) < datetime(?)${expenseBranch.sql}
        ORDER BY datetime(e.occurred_at) DESC LIMIT 50`, [tenantId, bounds.rangeStart, bounds.rangeEnd, ...expenseBranch.binds]),
      rows(db, `SELECT rr.id, rr.paid_at AS occurred_at, rr.calculated_amount AS amount, rr.payment_method, rr.payment_reference, rc.branch_id
        FROM referral_rewards rr JOIN referral_cases rc ON rc.id = rr.referral_case_id AND rc.tenant_id = rr.tenant_id
        WHERE rr.tenant_id = ? AND rr.status = 'cash_paid'
          AND datetime(rr.paid_at) >= datetime(?) AND datetime(rr.paid_at) < datetime(?)${referralBranch.sql}
        ORDER BY datetime(rr.paid_at) DESC LIMIT 50`, [tenantId, bounds.rangeStart, bounds.rangeEnd, ...referralBranch.binds]),
    ]);

    const receiptByDate = new Map(receiptDaily.map((row) => [row.date as string, numeric(row, "amount")]));
    const expenseByDate = new Map(expenseDaily.map((row) => [row.date as string, numeric(row, "amount")]));
    const payoutByDate = new Map(payoutDaily.map((row) => [row.date as string, numeric(row, "amount")]));
    const daily: FinanceDailyPoint[] = bounds.localRangeDates.map((date) => ({
      date,
      receipts: receiptByDate.get(date) ?? 0,
      operating_expenses: expenseByDate.get(date) ?? 0,
      referral_payouts: payoutByDate.get(date) ?? 0,
    }));

    const branchNames = new Map(branches.map((branch) => [branch.id, branch.name]));
    const receiptsByBranch = new Map(receiptBranches.map((row) => [row.branch_id as string, numeric(row, "amount")]));
    const expensesByBranch = new Map(expenseBranches.map((row) => [(row.branch_id as string | null) ?? "", numeric(row, "amount")]));
    const payoutsByBranch = new Map(payoutBranches.map((row) => [row.branch_id as string, numeric(row, "amount")]));
    const includedBranches = filter.branch_id ? branches.filter((branch) => branch.id === filter.branch_id) : branches;
    const branch_breakdown: FinanceBranchBreakdown[] = [
      ...includedBranches.map((branch) => {
        const confirmed_receipts = receiptsByBranch.get(branch.id) ?? 0;
        const operating_expenses = expensesByBranch.get(branch.id) ?? 0;
        const referral_payouts = payoutsByBranch.get(branch.id) ?? 0;
        return { branch_id: branch.id, branch_name: branch.name, confirmed_receipts, operating_expenses, referral_payouts, net_cash: confirmed_receipts - operating_expenses - referral_payouts };
      }),
      ...(!filter.branch_id && (expensesByBranch.get("") ?? 0) > 0 ? [{
        branch_name: "Chi phí chung",
        confirmed_receipts: 0,
        operating_expenses: expensesByBranch.get("") ?? 0,
        referral_payouts: 0,
        net_cash: -(expensesByBranch.get("") ?? 0),
      }] : []),
    ];
    const ledger: FinanceLedgerEntry[] = [
      ...receiptLedger.map((row) => ({ id: row.id as string, kind: "receipt" as const, occurred_at: row.occurred_at as string, amount: numeric(row, "amount"), method: row.method as FinanceLedgerEntry["method"], reference: (row.reference as string | null) ?? undefined, label: `Thu tiền ${row.code as string}`, branch_id: row.branch_id as string, branch_name: branchNames.get(row.branch_id as string) })),
      ...expenseLedger.map((row) => ({ id: row.id as string, kind: "expense" as const, occurred_at: row.occurred_at as string, amount: numeric(row, "amount"), method: row.method as FinanceLedgerEntry["method"], reference: (row.reference as string | null) ?? undefined, label: `${expenseCategoryLabel(row.category as string)}${row.vendor_name ? ` · ${row.vendor_name as string}` : ""}`, branch_id: (row.branch_id as string | null) ?? undefined, branch_name: row.branch_id ? branchNames.get(row.branch_id as string) : "Chi phí chung", status: row.status as Expense["status"] })),
      ...payoutLedger.map((row) => ({ id: row.id as string, kind: "referral_payout" as const, occurred_at: row.occurred_at as string, amount: numeric(row, "amount"), method: row.payment_method as FinanceLedgerEntry["method"], reference: (row.payment_reference as string | null) ?? undefined, label: "Chi thưởng giới thiệu", branch_id: row.branch_id as string, branch_name: branchNames.get(row.branch_id as string) })),
    ].sort((left, right) => right.occurred_at.localeCompare(left.occurred_at)).slice(0, 100);

    const confirmed_receipts = numeric(receipts, "amount");
    const operating_expenses = numeric(expenses, "amount");
    const referral_payouts = numeric(payouts, "amount");
    return {
      generated_at: now.toISOString(),
      timezone: TIMEZONE,
      range: filter.range,
      range_start: bounds.rangeStart,
      range_end: bounds.rangeEnd,
      ...(filter.branch_id ? { branch_id: filter.branch_id } : {}),
      branches: branches.map(({ id, name }) => ({ id, name })),
      kpis: {
        confirmed_receipts,
        operating_expenses,
        referral_payouts,
        net_cash: confirmed_receipts - operating_expenses - referral_payouts,
        outstanding_receivables: Math.max(0, numeric(outstanding, "amount")),
      },
      daily,
      expense_categories: categories.map((row) => ({ category: row.category as Expense["category"], amount: numeric(row, "amount") })),
      branch_breakdown,
      ledger,
    };
  },
};

function expenseCategoryLabel(category: string): string {
  const labels: Record<string, string> = {
    rent: "Mặt bằng", utilities: "Điện nước", supplies: "Vật tư", lab_fee: "Chi phí labo",
    staff_cost: "Nhân sự", marketing: "Marketing", maintenance: "Bảo trì", equipment: "Thiết bị",
    administration: "Hành chính", other: "Chi phí khác",
  };
  return labels[category] ?? "Chi phí";
}
