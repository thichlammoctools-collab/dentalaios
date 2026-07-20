/** Tenant-scoped aggregates for operational dashboards. */

import type { D1Database } from "@cloudflare/workers-types";
import type {
  ManagementDashboardBranchPerformance,
  ManagementDashboardDailyPoint,
  ManagementDashboardFilter,
  ManagementDashboardSnapshot,
} from "@shared/types";
import type { D1Row } from "../repositories/base";
import { createBranchRepository } from "../repositories/branch.repo";
import { NotFoundError } from "../lib/errors";

const TIMEZONE = "Asia/Ho_Chi_Minh" as const;
const HCM_OFFSET_MS = 7 * 60 * 60 * 1000;

export interface DashboardStats {
  today: { visits: number; inProgress: number; completed: number };
  totals: { patients: number; visits: number; approvedPlans: number; revenue: number };
  monthlyVisits: { month: string; count: number }[];
  monthlyRevenue: { month: string; amount: number }[];
  recentActivity: { type: string; count: number }[];
}

interface DashboardBounds {
  todayStart: string;
  todayEnd: string;
  rangeStart: string;
  rangeEnd: string;
  previousStart: string;
  previousEnd: string;
  localRangeDates: string[];
}

function number(row: D1Row | null | undefined, key: string): number {
  return Number(row?.[key] ?? 0);
}

function localDateAtOffset(date: Date): Date {
  return new Date(date.getTime() + HCM_OFFSET_MS);
}

function localDateKey(date: Date): string {
  return localDateAtOffset(date).toISOString().slice(0, 10);
}

function localMidnightUtc(localDate: string): string {
  const [year, month, day] = localDate.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day) - HCM_OFFSET_MS).toISOString();
}

function addLocalDays(localDate: string, days: number): string {
  const [year, month, day] = localDate.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

export function getDashboardBounds(range: 7 | 30 | 90, now = new Date()): DashboardBounds {
  const today = localDateKey(now);
  const tomorrow = addLocalDays(today, 1);
  const rangeEndDate = today;
  const rangeStartDate = addLocalDays(rangeEndDate, -range);
  const previousStartDate = addLocalDays(rangeStartDate, -range);
  const dates = Array.from({ length: range }, (_, index) => addLocalDays(rangeStartDate, index));
  return {
    todayStart: localMidnightUtc(today),
    todayEnd: localMidnightUtc(tomorrow),
    rangeStart: localMidnightUtc(rangeStartDate),
    rangeEnd: localMidnightUtc(rangeEndDate),
    previousStart: localMidnightUtc(previousStartDate),
    previousEnd: localMidnightUtc(rangeStartDate),
    localRangeDates: dates,
  };
}

function branchFilter(alias: string, branchId?: string): { sql: string; binds: unknown[] } {
  return branchId ? { sql: ` AND ${alias}.branch_id = ?`, binds: [branchId] } : { sql: "", binds: [] };
}

async function first(db: D1Database, sql: string, binds: unknown[]): Promise<D1Row | null> {
  return db.prepare(sql).bind(...binds).first<D1Row>();
}

async function rows(db: D1Database, sql: string, binds: unknown[]): Promise<D1Row[]> {
  const result = await db.prepare(sql).bind(...binds).all<D1Row>();
  return result.results ?? [];
}

export const dashboardService = {
  async getManagementSnapshot(
    db: D1Database,
    tenantId: string,
    filter: ManagementDashboardFilter,
    now = new Date(),
  ): Promise<ManagementDashboardSnapshot> {
    const branchRepo = createBranchRepository(db);
    if (filter.branch_id && !(await branchRepo.getById(tenantId, filter.branch_id))) {
      throw new NotFoundError("Branch not found");
    }

    const allBranches = await branchRepo.list(tenantId);
    const scopedBranches = filter.branch_id
      ? allBranches.filter((branch) => branch.id === filter.branch_id)
      : allBranches;
    const bounds = getDashboardBounds(filter.range, now);
    const appointmentBranch = branchFilter("a", filter.branch_id);
    const visitBranch = branchFilter("v", filter.branch_id);
    const patientBranch = branchFilter("p", filter.branch_id);
    const planBranch = branchFilter("v", filter.branch_id);
    const paymentBranch = branchFilter("v", filter.branch_id);

    const [todayAppointments, todayVisits, todayRevenue, rangeAppointments, currentVisits, previousVisits, currentPatients, currentPlans, currentRevenue, previousRevenue, dailyVisits, dailyRevenue, branchAppointments, branchVisits, branchPatients, branchPlans, branchRevenue, branchPreviousRevenue, branchPreviousVisits, overdue, outcomes, pendingPlans] = await Promise.all([
      first(db, `SELECT
          COUNT(*) AS scheduled,
          SUM(CASE WHEN status = 'arrived' THEN 1 ELSE 0 END) AS arrived,
          SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS completed,
          SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END) AS cancellations,
          SUM(CASE WHEN status = 'no_show' THEN 1 ELSE 0 END) AS no_shows
        FROM appointments a
        WHERE a.tenant_id = ? AND datetime(a.scheduled_at) >= datetime(?) AND datetime(a.scheduled_at) < datetime(?)${appointmentBranch.sql}`,
      [tenantId, bounds.todayStart, bounds.todayEnd, ...appointmentBranch.binds]),
      first(db, `SELECT
          SUM(CASE WHEN status = 'in_progress' THEN 1 ELSE 0 END) AS in_progress_visits
        FROM visits v
        WHERE v.tenant_id = ? AND datetime(v.date) >= datetime(?) AND datetime(v.date) < datetime(?)${visitBranch.sql}`,
      [tenantId, bounds.todayStart, bounds.todayEnd, ...visitBranch.binds]),
      first(db, `SELECT COALESCE(SUM(p.amount), 0) AS confirmed_revenue
        FROM payments p
        JOIN treatment_plans tp ON tp.id = p.treatment_plan_id AND tp.tenant_id = p.tenant_id
        JOIN visits v ON v.id = tp.visit_id AND v.tenant_id = p.tenant_id
        WHERE p.tenant_id = ? AND p.status = 'confirmed' AND datetime(p.created_at) >= datetime(?) AND datetime(p.created_at) < datetime(?)${paymentBranch.sql}`,
      [tenantId, bounds.todayStart, bounds.todayEnd, ...paymentBranch.binds]),
      first(db, `SELECT
          COUNT(*) AS appointments,
          SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS completed,
          SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END) AS cancellations,
          SUM(CASE WHEN status = 'no_show' THEN 1 ELSE 0 END) AS no_shows
        FROM appointments a
        WHERE a.tenant_id = ? AND datetime(a.scheduled_at) >= datetime(?) AND datetime(a.scheduled_at) < datetime(?)${appointmentBranch.sql}`,
      [tenantId, bounds.rangeStart, bounds.rangeEnd, ...appointmentBranch.binds]),
      first(db, `SELECT COUNT(*) AS visits FROM visits v
        WHERE v.tenant_id = ? AND datetime(v.date) >= datetime(?) AND datetime(v.date) < datetime(?)${visitBranch.sql}`,
      [tenantId, bounds.rangeStart, bounds.rangeEnd, ...visitBranch.binds]),
      first(db, `SELECT COUNT(*) AS visits FROM visits v
        WHERE v.tenant_id = ? AND datetime(v.date) >= datetime(?) AND datetime(v.date) < datetime(?)${visitBranch.sql}`,
      [tenantId, bounds.previousStart, bounds.previousEnd, ...visitBranch.binds]),
      first(db, `SELECT COUNT(*) AS new_patients FROM patients p
        WHERE p.tenant_id = ? AND datetime(p.created_at) >= datetime(?) AND datetime(p.created_at) < datetime(?)${patientBranch.sql}`,
      [tenantId, bounds.rangeStart, bounds.rangeEnd, ...patientBranch.binds]),
      first(db, `SELECT COUNT(*) AS pending_plans FROM treatment_plans tp
        JOIN visits v ON v.id = tp.visit_id AND v.tenant_id = tp.tenant_id
        WHERE tp.tenant_id = ? AND tp.status = 'draft'${planBranch.sql}`,
      [tenantId, ...planBranch.binds]),
      first(db, `SELECT COALESCE(SUM(p.amount), 0) AS confirmed_revenue FROM payments p
        JOIN treatment_plans tp ON tp.id = p.treatment_plan_id AND tp.tenant_id = p.tenant_id
        JOIN visits v ON v.id = tp.visit_id AND v.tenant_id = p.tenant_id
        WHERE p.tenant_id = ? AND p.status = 'confirmed' AND datetime(p.created_at) >= datetime(?) AND datetime(p.created_at) < datetime(?)${paymentBranch.sql}`,
      [tenantId, bounds.rangeStart, bounds.rangeEnd, ...paymentBranch.binds]),
      first(db, `SELECT COALESCE(SUM(p.amount), 0) AS confirmed_revenue FROM payments p
        JOIN treatment_plans tp ON tp.id = p.treatment_plan_id AND tp.tenant_id = p.tenant_id
        JOIN visits v ON v.id = tp.visit_id AND v.tenant_id = p.tenant_id
        WHERE p.tenant_id = ? AND p.status = 'confirmed' AND datetime(p.created_at) >= datetime(?) AND datetime(p.created_at) < datetime(?)${paymentBranch.sql}`,
      [tenantId, bounds.previousStart, bounds.previousEnd, ...paymentBranch.binds]),
      rows(db, `SELECT date(datetime(v.date), '+7 hours') AS date, COUNT(*) AS visits FROM visits v
        WHERE v.tenant_id = ? AND datetime(v.date) >= datetime(?) AND datetime(v.date) < datetime(?)${visitBranch.sql}
        GROUP BY date ORDER BY date`, [tenantId, bounds.rangeStart, bounds.rangeEnd, ...visitBranch.binds]),
      rows(db, `SELECT date(datetime(p.created_at), '+7 hours') AS date, COALESCE(SUM(p.amount), 0) AS revenue FROM payments p
        JOIN treatment_plans tp ON tp.id = p.treatment_plan_id AND tp.tenant_id = p.tenant_id
        JOIN visits v ON v.id = tp.visit_id AND v.tenant_id = p.tenant_id
        WHERE p.tenant_id = ? AND p.status = 'confirmed' AND datetime(p.created_at) >= datetime(?) AND datetime(p.created_at) < datetime(?)${paymentBranch.sql}
        GROUP BY date ORDER BY date`, [tenantId, bounds.rangeStart, bounds.rangeEnd, ...paymentBranch.binds]),
      rows(db, `SELECT a.branch_id, COUNT(*) AS appointments, SUM(CASE WHEN a.status = 'completed' THEN 1 ELSE 0 END) AS completed,
          SUM(CASE WHEN a.status = 'cancelled' THEN 1 ELSE 0 END) AS cancellations, SUM(CASE WHEN a.status = 'no_show' THEN 1 ELSE 0 END) AS no_shows
        FROM appointments a WHERE a.tenant_id = ? AND datetime(a.scheduled_at) >= datetime(?) AND datetime(a.scheduled_at) < datetime(?)${appointmentBranch.sql} GROUP BY a.branch_id`,
      [tenantId, bounds.rangeStart, bounds.rangeEnd, ...appointmentBranch.binds]),
      rows(db, `SELECT v.branch_id, COUNT(*) AS visits FROM visits v WHERE v.tenant_id = ? AND datetime(v.date) >= datetime(?) AND datetime(v.date) < datetime(?)${visitBranch.sql} GROUP BY v.branch_id`,
      [tenantId, bounds.rangeStart, bounds.rangeEnd, ...visitBranch.binds]),
      rows(db, `SELECT p.branch_id, COUNT(*) AS new_patients FROM patients p WHERE p.tenant_id = ? AND datetime(p.created_at) >= datetime(?) AND datetime(p.created_at) < datetime(?)${patientBranch.sql} GROUP BY p.branch_id`,
      [tenantId, bounds.rangeStart, bounds.rangeEnd, ...patientBranch.binds]),
      rows(db, `SELECT v.branch_id, COUNT(*) AS pending_plans FROM treatment_plans tp JOIN visits v ON v.id = tp.visit_id AND v.tenant_id = tp.tenant_id
        WHERE tp.tenant_id = ? AND tp.status = 'draft'${planBranch.sql} GROUP BY v.branch_id`,
      [tenantId, ...planBranch.binds]),
      rows(db, `SELECT v.branch_id, COALESCE(SUM(p.amount), 0) AS confirmed_revenue FROM payments p JOIN treatment_plans tp ON tp.id = p.treatment_plan_id AND tp.tenant_id = p.tenant_id JOIN visits v ON v.id = tp.visit_id AND v.tenant_id = p.tenant_id
        WHERE p.tenant_id = ? AND p.status = 'confirmed' AND datetime(p.created_at) >= datetime(?) AND datetime(p.created_at) < datetime(?)${paymentBranch.sql} GROUP BY v.branch_id`,
      [tenantId, bounds.rangeStart, bounds.rangeEnd, ...paymentBranch.binds]),
      rows(db, `SELECT v.branch_id, COALESCE(SUM(p.amount), 0) AS confirmed_revenue FROM payments p JOIN treatment_plans tp ON tp.id = p.treatment_plan_id AND tp.tenant_id = p.tenant_id JOIN visits v ON v.id = tp.visit_id AND v.tenant_id = p.tenant_id
        WHERE p.tenant_id = ? AND p.status = 'confirmed' AND datetime(p.created_at) >= datetime(?) AND datetime(p.created_at) < datetime(?)${paymentBranch.sql} GROUP BY v.branch_id`,
      [tenantId, bounds.previousStart, bounds.previousEnd, ...paymentBranch.binds]),
      rows(db, `SELECT v.branch_id, COUNT(*) AS visits FROM visits v WHERE v.tenant_id = ? AND datetime(v.date) >= datetime(?) AND datetime(v.date) < datetime(?)${visitBranch.sql} GROUP BY v.branch_id`,
      [tenantId, bounds.previousStart, bounds.previousEnd, ...visitBranch.binds]),
      rows(db, `SELECT a.branch_id, COUNT(*) AS count FROM appointments a WHERE a.tenant_id = ? AND a.status IN ('booked', 'confirmed', 'arrived')
        AND datetime(a.scheduled_at, '+' || a.duration_min || ' minutes') < datetime(?) AND datetime(a.scheduled_at) >= datetime(?) AND datetime(a.scheduled_at) < datetime(?)${appointmentBranch.sql} GROUP BY a.branch_id`,
      [tenantId, now.toISOString(), bounds.todayStart, bounds.todayEnd, ...appointmentBranch.binds]),
      rows(db, `SELECT a.branch_id, COUNT(*) AS count FROM appointments a WHERE a.tenant_id = ? AND a.status IN ('cancelled', 'no_show')
        AND datetime(a.scheduled_at) >= datetime(?) AND datetime(a.scheduled_at) < datetime(?)${appointmentBranch.sql} GROUP BY a.branch_id`,
      [tenantId, bounds.todayStart, bounds.todayEnd, ...appointmentBranch.binds]),
      rows(db, `SELECT v.branch_id, COUNT(*) AS count FROM treatment_plans tp JOIN visits v ON v.id = tp.visit_id AND v.tenant_id = tp.tenant_id
        WHERE tp.tenant_id = ? AND tp.status = 'draft'${planBranch.sql} GROUP BY v.branch_id`,
      [tenantId, ...planBranch.binds]),
    ]);

    const keyed = (source: D1Row[]) => new Map(source.map((row) => [row.branch_id as string, row]));
    const byAppointments = keyed(branchAppointments);
    const byVisits = keyed(branchVisits);
    const byPatients = keyed(branchPatients);
    const byPlans = keyed(branchPlans);
    const byRevenue = keyed(branchRevenue);
    const byPreviousRevenue = keyed(branchPreviousRevenue);
    const byPreviousVisits = keyed(branchPreviousVisits);
    const performance: ManagementDashboardBranchPerformance[] = scopedBranches.map((branch) => {
      const appointment = byAppointments.get(branch.id);
      const completed = number(appointment, "completed");
      const terminal = completed + number(appointment, "cancellations") + number(appointment, "no_shows");
      return {
        branch_id: branch.id,
        branch_name: branch.name,
        confirmed_revenue: number(byRevenue.get(branch.id), "confirmed_revenue"),
        previous_revenue: number(byPreviousRevenue.get(branch.id), "confirmed_revenue"),
        visits: number(byVisits.get(branch.id), "visits"),
        previous_visits: number(byPreviousVisits.get(branch.id), "visits"),
        appointments: number(appointment, "appointments"),
        completion_rate: terminal === 0 ? null : completed / terminal,
        new_patients: number(byPatients.get(branch.id), "new_patients"),
        pending_plans: number(byPlans.get(branch.id), "pending_plans"),
        cancellations: number(appointment, "cancellations"),
        no_shows: number(appointment, "no_shows"),
      };
    }).sort((left, right) => right.confirmed_revenue - left.confirmed_revenue || right.visits - left.visits);

    const dailyVisitMap = new Map(dailyVisits.map((row) => [row.date as string, number(row, "visits")]));
    const dailyRevenueMap = new Map(dailyRevenue.map((row) => [row.date as string, number(row, "revenue")]));
    const daily: ManagementDashboardDailyPoint[] = bounds.localRangeDates.map((date) => ({
      date,
      visits: dailyVisitMap.get(date) ?? 0,
      revenue: dailyRevenueMap.get(date) ?? 0,
    }));
    const terminal = number(rangeAppointments, "completed") + number(rangeAppointments, "cancellations") + number(rangeAppointments, "no_shows");
    const branchNames = new Map(allBranches.map((branch) => [branch.id, branch.name]));
    const exceptionRows = (source: D1Row[], kind: ManagementDashboardSnapshot["exceptions"][number]["kind"]) => source.map((row) => ({
      kind,
      branch_id: row.branch_id as string,
      branch_name: branchNames.get(row.branch_id as string) ?? "Chi nhánh",
      count: number(row, "count"),
    })).filter((item) => item.count > 0);

    return {
      generated_at: now.toISOString(),
      timezone: TIMEZONE,
      today_start: bounds.todayStart,
      today_end: bounds.todayEnd,
      range: filter.range,
      range_start: bounds.rangeStart,
      range_end: bounds.rangeEnd,
      ...(filter.branch_id ? { branch_id: filter.branch_id } : {}),
      // Keep the full tenant branch catalog so a filtered client can switch
      // back to another branch or the combined view without an extra request.
      branches: allBranches.map((branch) => ({ id: branch.id, name: branch.name })),
      today: {
        scheduled: number(todayAppointments, "scheduled"),
        arrived: number(todayAppointments, "arrived"),
        completed: number(todayAppointments, "completed"),
        in_progress_visits: number(todayVisits, "in_progress_visits"),
        confirmed_revenue: number(todayRevenue, "confirmed_revenue"),
        cancellations: number(todayAppointments, "cancellations"),
        no_shows: number(todayAppointments, "no_shows"),
      },
      kpis: {
        confirmed_revenue: number(currentRevenue, "confirmed_revenue"),
        previous_revenue: number(previousRevenue, "confirmed_revenue"),
        visits: number(currentVisits, "visits"),
        previous_visits: number(previousVisits, "visits"),
        appointments: number(rangeAppointments, "appointments"),
        completion_rate: terminal === 0 ? null : number(rangeAppointments, "completed") / terminal,
        new_patients: number(currentPatients, "new_patients"),
        pending_plans: number(currentPlans, "pending_plans"),
        cancellations: number(rangeAppointments, "cancellations"),
        no_shows: number(rangeAppointments, "no_shows"),
      },
      daily,
      branch_performance: performance,
      exceptions: [
        ...exceptionRows(overdue, "overdue_appointment"),
        ...exceptionRows(outcomes, "appointment_outcome"),
        ...exceptionRows(pendingPlans, "pending_plan"),
      ],
    };
  },

  async getStats(db: D1Database, tenantId: string): Promise<DashboardStats> {
    const bounds = getDashboardBounds(7);
    const [todayVisits, inProgress, completed, patients, visits, approvedPlans, revenue, monthlyVisits, monthlyRevenue] = await Promise.all([
      first(db, "SELECT COUNT(*) AS count FROM visits WHERE tenant_id = ? AND datetime(date) >= datetime(?) AND datetime(date) < datetime(?)", [tenantId, bounds.todayStart, bounds.todayEnd]),
      first(db, "SELECT COUNT(*) AS count FROM visits WHERE tenant_id = ? AND status = 'in_progress'", [tenantId]),
      first(db, "SELECT COUNT(*) AS count FROM visits WHERE tenant_id = ? AND status = 'completed' AND datetime(date) >= datetime(?) AND datetime(date) < datetime(?)", [tenantId, bounds.todayStart, bounds.todayEnd]),
      first(db, "SELECT COUNT(*) AS count FROM patients WHERE tenant_id = ?", [tenantId]),
      first(db, "SELECT COUNT(*) AS count FROM visits WHERE tenant_id = ?", [tenantId]),
      first(db, "SELECT COUNT(*) AS count FROM treatment_plans WHERE tenant_id = ? AND status = 'approved'", [tenantId]),
      first(db, "SELECT COALESCE(SUM(amount), 0) AS total FROM payments WHERE tenant_id = ? AND status = 'confirmed'", [tenantId]),
      rows(db, "SELECT strftime('%Y-%m', datetime(date, '+7 hours')) AS month, COUNT(*) AS count FROM visits WHERE tenant_id = ? AND datetime(date) >= datetime('now', '-6 months') GROUP BY month ORDER BY month ASC", [tenantId]),
      rows(db, "SELECT strftime('%Y-%m', datetime(created_at, '+7 hours')) AS month, COALESCE(SUM(amount), 0) AS amount FROM payments WHERE tenant_id = ? AND status = 'confirmed' AND datetime(created_at) >= datetime('now', '-6 months') GROUP BY month ORDER BY month ASC", [tenantId]),
    ]);
    return {
      today: {
        visits: number(todayVisits, "count"),
        inProgress: number(inProgress, "count"),
        completed: number(completed, "count"),
      },
      totals: {
        patients: number(patients, "count"),
        visits: number(visits, "count"),
        approvedPlans: number(approvedPlans, "count"),
        revenue: number(revenue, "total"),
      },
      monthlyVisits: monthlyVisits.map((row) => ({ month: row.month as string, count: number(row, "count") })),
      monthlyRevenue: monthlyRevenue.map((row) => ({ month: row.month as string, amount: number(row, "amount") })),
      recentActivity: [],
    };
  },
};
