/**
 * Dashboard stats service — aggregates KPIs for the Today page and analytics.
 */

import type { D1Database } from "@cloudflare/workers-types";
import type { D1Row } from "../repositories/base";

export interface DashboardStats {
  today: { visits: number; inProgress: number; completed: number };
  totals: { patients: number; visits: number; approvedPlans: number; revenue: number };
  monthlyVisits: { month: string; count: number }[];
  monthlyRevenue: { month: string; amount: number }[];
  recentActivity: { type: string; count: number }[];
}

export const dashboardService = {
  async getStats(db: D1Database, tenantId: string): Promise<DashboardStats> {
    const today = new Date().toISOString().slice(0, 10);

    const [
      todayVisitsResult,
      inProgressResult,
      completedResult,
      totalPatientsResult,
      totalVisitsResult,
      approvedPlansResult,
      confirmedPaymentsResult,
      monthlyVisitsResult,
      monthlyRevenueResult,
    ] = await Promise.all([
      db.prepare(`SELECT COUNT(*) as count FROM visits WHERE tenant_id = ? AND date(date) = date(?)`).bind(tenantId, today).first<D1Row>(),
      db.prepare(`SELECT COUNT(*) as count FROM visits WHERE tenant_id = ? AND status = 'in_progress'`).bind(tenantId).first<D1Row>(),
      db.prepare(`SELECT COUNT(*) as count FROM visits WHERE tenant_id = ? AND status = 'completed' AND date(date) = date(?)`).bind(tenantId, today).first<D1Row>(),
      db.prepare(`SELECT COUNT(*) as count FROM patients WHERE tenant_id = ?`).bind(tenantId).first<D1Row>(),
      db.prepare(`SELECT COUNT(*) as count FROM visits WHERE tenant_id = ?`).bind(tenantId).first<D1Row>(),
      db.prepare(`SELECT COUNT(*) as count FROM treatment_plans WHERE tenant_id = ? AND status = 'approved'`).bind(tenantId).first<D1Row>(),
      db.prepare(`SELECT COALESCE(SUM(amount), 0) as total FROM payments WHERE tenant_id = ? AND status = 'confirmed'`).bind(tenantId).first<D1Row>(),
      db.prepare(`SELECT strftime('%Y-%m', date) as month, COUNT(*) as count FROM visits WHERE tenant_id = ? AND date >= date('now', '-6 months') GROUP BY month ORDER BY month ASC`).bind(tenantId).all<D1Row>(),
      db.prepare(`SELECT strftime('%Y-%m', p.created_at) as month, COALESCE(SUM(p.amount), 0) as amount FROM payments p WHERE p.tenant_id = ? AND p.status = 'confirmed' AND p.created_at >= datetime('now', '-6 months') GROUP BY month ORDER BY month ASC`).bind(tenantId).all<D1Row>(),
    ]);

    const count = (r: D1Row | null | undefined) => (r ? Number(r.count ?? 0) : 0);
    const total = (r: D1Row | null | undefined) => Number(r?.total ?? 0);

    const monthlyVisits = (monthlyVisitsResult?.results ?? []).map((r) => ({
      month: r.month as string,
      count: Number(r.count ?? 0),
    }));

    const monthlyRevenue = (monthlyRevenueResult?.results ?? []).map((r) => ({
      month: r.month as string,
      amount: Number(r.amount ?? 0),
    }));

    return {
      today: {
        visits: count(todayVisitsResult),
        inProgress: count(inProgressResult),
        completed: count(completedResult),
      },
      totals: {
        patients: count(totalPatientsResult),
        visits: count(totalVisitsResult),
        approvedPlans: count(approvedPlansResult),
        revenue: total(confirmedPaymentsResult),
      },
      monthlyVisits,
      monthlyRevenue,
      recentActivity: [],
    };
  },
};
