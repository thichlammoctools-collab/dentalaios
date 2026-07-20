import type { D1Database } from "@cloudflare/workers-types";
import type { Appointment, ChairRevenueMetrics, DentalChair } from "@shared/types";
import type { D1Row } from "../repositories/base";
import type { ChairCreateInput, ChairStatusUpdateInput, ChairUpdateInput, RoomCreateInput } from "@shared/validation";
import { createAppointmentsRepository } from "../repositories/appointments.repo";
import { createChairsRepository } from "../repositories/chairs.repo";
import { ConflictError, NotFoundError, ValidationError } from "../lib/errors";
import { assertAllInTenant } from "../lib/tenant-scope";

export type ChairDisplayStatus = DentalChair["operational_status"] | "reserved" | "occupied";

export interface ChairAvailability {
  chair: DentalChair;
  available: boolean;
  reason?: string;
}

export interface ChairBoardItem {
  chair: DentalChair;
  current_status: ChairDisplayStatus;
  current_appointment?: Appointment;
  next_appointment?: Appointment;
  appointments: Appointment[];
  revenue?: ChairRevenueMetrics;
}

export interface ChairBoardResult {
  chairs: ChairBoardItem[];
  unallocated_revenue?: number;
}

function endOf(start: string, durationMin: number): string {
  const end = new Date(start);
  end.setMinutes(end.getMinutes() + durationMin);
  return end.toISOString();
}

function active(appointment: Appointment): boolean {
  return appointment.status !== "cancelled" && appointment.status !== "no_show";
}

function localDayBounds(date: string): { start: string; end: string } {
  const [year, month, day] = date.split("-").map(Number);
  const hcmOffsetMs = 7 * 60 * 60 * 1000;
  return {
    start: new Date(Date.UTC(year, month - 1, day) - hcmOffsetMs).toISOString(),
    end: new Date(Date.UTC(year, month - 1, day + 1) - hcmOffsetMs).toISOString(),
  };
}

function localDateKey(date: Date): string {
  return new Date(date.getTime() + 7 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function addLocalDays(date: string, days: number): string {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

export const chairsService = {
  list(db: D1Database, tenantId: string, branchId?: string): Promise<DentalChair[]> {
    return createChairsRepository(db).list(tenantId, { branchId });
  },

  async get(db: D1Database, tenantId: string, id: string): Promise<DentalChair> {
    const chair = await createChairsRepository(db).getById(tenantId, id);
    if (!chair) throw new NotFoundError("Ghế nha không tồn tại");
    return chair;
  },

  async create(db: D1Database, tenantId: string, input: ChairCreateInput): Promise<DentalChair> {
    await assertAllInTenant(db, tenantId, [
      { table: "branches", id: input.branch_id },
      { table: "users", id: input.default_doctor_id },
      { table: "users", id: input.default_assistant_id },
    ]);
    await assertRoomInBranch(db, tenantId, input.branch_id, input.room_id);
    return createChairsRepository(db).create(tenantId, input);
  },

  async update(db: D1Database, tenantId: string, id: string, input: ChairUpdateInput): Promise<DentalChair> {
    await assertAllInTenant(db, tenantId, [
      { table: "users", id: input.default_doctor_id },
      { table: "users", id: input.default_assistant_id },
    ]);
    if (input.room_id !== undefined) {
      const chair = await this.get(db, tenantId, id);
      await assertRoomInBranch(db, tenantId, chair.branch_id, input.room_id);
    }
    const chair = await createChairsRepository(db).update(tenantId, id, input);
    if (!chair) throw new NotFoundError("Ghế nha không tồn tại");
    return chair;
  },

  async listRooms(db: D1Database, tenantId: string, branchId: string) {
    await assertAllInTenant(db, tenantId, [{ table: "branches", id: branchId }]);
    return createChairsRepository(db).listRooms(tenantId, branchId);
  },

  async createRoom(db: D1Database, tenantId: string, input: RoomCreateInput) {
    await assertAllInTenant(db, tenantId, [{ table: "branches", id: input.branch_id }]);
    return createChairsRepository(db).createRoom(tenantId, input);
  },

  async updateStatus(
    db: D1Database,
    tenantId: string,
    id: string,
    input: ChairStatusUpdateInput,
  ): Promise<DentalChair> {
    const chair = await createChairsRepository(db).update(tenantId, id, input);
    if (!chair) throw new NotFoundError("Ghế nha không tồn tại");
    return chair;
  },

  async availability(
    db: D1Database,
    tenantId: string,
    branchId: string,
    startAt: string,
    durationMin: number,
    excludeAppointmentId?: string,
  ): Promise<ChairAvailability[]> {
    await assertAllInTenant(db, tenantId, [{ table: "branches", id: branchId }]);
    const repo = createAppointmentsRepository(db);
    const chairs = await createChairsRepository(db).list(tenantId, { branchId, activeOnly: true });
    const endAt = endOf(startAt, durationMin);
    return Promise.all(chairs.map(async (chair) => {
      if (chair.operational_status !== "available") {
        return { chair, available: false, reason: chair.operational_status };
      }
      const conflicts = await repo.findChairConflicts(tenantId, chair.id, startAt, endAt, excludeAppointmentId);
      return conflicts.length > 0
        ? { chair, available: false, reason: "reserved" }
        : { chair, available: true };
    }));
  },

  async assertAvailable(
    db: D1Database,
    tenantId: string,
    branchId: string,
    chairId: string,
    startAt: string,
    durationMin: number,
    excludeAppointmentId?: string,
  ): Promise<void> {
    const chair = await this.get(db, tenantId, chairId);
    if (chair.branch_id !== branchId) {
      throw new ValidationError("Ghế nha phải thuộc cùng chi nhánh với lịch hẹn");
    }
    if (!chair.is_active || chair.operational_status !== "available") {
      throw new ConflictError("Ghế nha hiện không sẵn sàng để đặt lịch");
    }
    const conflicts = await createAppointmentsRepository(db).findChairConflicts(
      tenantId, chairId, startAt, endOf(startAt, durationMin), excludeAppointmentId,
    );
    if (conflicts.length > 0) {
      throw new ConflictError("Ghế nha đã có lịch hẹn trùng khung giờ này. Vui lòng chọn ghế hoặc giờ khác.");
    }
  },

  async board(
    db: D1Database,
    tenantId: string,
    branchId: string,
    date: string,
    includeRevenue = false,
  ): Promise<ChairBoardResult> {
    await assertAllInTenant(db, tenantId, [{ table: "branches", id: branchId }]);
    const bounds = localDayBounds(date);
    const [chairs, appointments] = await Promise.all([
      createChairsRepository(db).list(tenantId, { branchId }),
      createAppointmentsRepository(db).list(tenantId, {
        branchId,
        from: bounds.start,
        to: bounds.end,
      }),
    ]);
    const revenue = includeRevenue
      ? await chairRevenue(db, tenantId, branchId, bounds.start, bounds.end, appointments)
      : undefined;
    const now = new Date();
    const items = chairs.map((chair) => {
      const chairAppointments = appointments.filter((appointment) => appointment.chair_id === chair.id && active(appointment));
      const current = chairAppointments.find((appointment) => {
        const start = new Date(appointment.scheduled_at);
        return start <= now && now < new Date(endOf(appointment.scheduled_at, appointment.duration_min));
      });
      const next = chairAppointments.find((appointment) => new Date(appointment.scheduled_at) > now);
      let currentStatus: ChairDisplayStatus = chair.operational_status;
      if (chair.is_active && chair.operational_status === "available") {
        currentStatus = current?.status === "arrived" ? "occupied" : current ? "reserved" : "available";
      }
      const metrics = revenue?.byChair.get(chair.id);
      return {
        chair,
        current_status: currentStatus,
        current_appointment: current,
        next_appointment: next,
        appointments: chairAppointments,
        revenue: metrics ?? (includeRevenue ? {
          confirmed_revenue: 0,
          payment_count: 0,
          completed_minutes: completedMinutes(appointments, chair.id),
          revenue_per_completed_hour: null,
        } : undefined),
      };
    });
    if (includeRevenue) {
      for (const item of items) {
        const metrics = item.revenue!;
        metrics.revenue_per_completed_hour = metrics.completed_minutes > 0
          ? metrics.confirmed_revenue / (metrics.completed_minutes / 60)
          : null;
      }
    }
    return { chairs: items, unallocated_revenue: revenue?.unallocatedRevenue };
  },

  async revenueReport(db: D1Database, tenantId: string, branchId: string, range: 7 | 30 | 90) {
    await assertAllInTenant(db, tenantId, [{ table: "branches", id: branchId }]);
    const today = localDateKey(new Date());
    const start = localDayBounds(addLocalDays(today, -(range - 1))).start;
    const end = localDayBounds(addLocalDays(today, 1)).start;
    const chairs = await createChairsRepository(db).list(tenantId, { branchId });
    const [paymentResult, appointmentResult] = await Promise.all([
      db.prepare(`SELECT v.chair_id, COALESCE(SUM(p.amount), 0) AS confirmed_revenue, COUNT(*) AS payment_count
        FROM payments p
        JOIN treatment_plans tp ON tp.id = p.treatment_plan_id AND tp.tenant_id = p.tenant_id
        JOIN visits v ON v.id = tp.visit_id AND v.tenant_id = p.tenant_id
        WHERE p.tenant_id = ? AND v.branch_id = ? AND p.status = 'confirmed' AND p.currency = 'VND'
          AND datetime(p.created_at) >= datetime(?) AND datetime(p.created_at) < datetime(?)
        GROUP BY v.chair_id`).bind(tenantId, branchId, start, end).all<D1Row>(),
      db.prepare(`SELECT chair_id, COALESCE(SUM(duration_min), 0) AS completed_minutes
        FROM appointments WHERE tenant_id = ? AND branch_id = ? AND status = 'completed'
          AND datetime(scheduled_at) >= datetime(?) AND datetime(scheduled_at) < datetime(?)
        GROUP BY chair_id`).bind(tenantId, branchId, start, end).all<D1Row>(),
    ]);
    const paymentByChair = new Map((paymentResult.results ?? []).map((row) => [row.chair_id as string | null, {
      confirmed_revenue: Number(row.confirmed_revenue ?? 0), payment_count: Number(row.payment_count ?? 0),
    }]));
    const minutesByChair = new Map((appointmentResult.results ?? []).map((row) => [row.chair_id as string | null, Number(row.completed_minutes ?? 0)]));
    const unallocatedRevenue = paymentByChair.get(null)?.confirmed_revenue ?? 0;
    const items = chairs.map((chair) => {
      const payment = paymentByChair.get(chair.id);
      const completedMinutes = minutesByChair.get(chair.id) ?? 0;
      const confirmedRevenue = payment?.confirmed_revenue ?? 0;
      return {
        chair,
        confirmed_revenue: confirmedRevenue,
        payment_count: payment?.payment_count ?? 0,
        completed_minutes: completedMinutes,
        revenue_per_completed_hour: completedMinutes ? confirmedRevenue / (completedMinutes / 60) : null,
      };
    }).sort((left, right) => right.confirmed_revenue - left.confirmed_revenue || right.completed_minutes - left.completed_minutes);
    return { range, start, end, items, unallocated_revenue: unallocatedRevenue };
  },
};

function completedMinutes(appointments: Appointment[], chairId: string): number {
  return appointments
    .filter((appointment) => appointment.chair_id === chairId && appointment.status === "completed")
    .reduce((total, appointment) => total + appointment.duration_min, 0);
}

async function chairRevenue(
  db: D1Database,
  tenantId: string,
  branchId: string,
  start: string,
  end: string,
  appointments: Appointment[],
): Promise<{ byChair: Map<string, ChairRevenueMetrics>; unallocatedRevenue: number }> {
  const unsupportedCurrency = await db.prepare(`SELECT 1 FROM payments p
    JOIN treatment_plans tp ON tp.id = p.treatment_plan_id AND tp.tenant_id = p.tenant_id
    JOIN visits v ON v.id = tp.visit_id AND v.tenant_id = p.tenant_id
    WHERE p.tenant_id = ? AND v.branch_id = ? AND p.status = 'confirmed'
      AND datetime(p.created_at) >= datetime(?) AND datetime(p.created_at) < datetime(?)
      AND p.currency <> 'VND' LIMIT 1`)
    .bind(tenantId, branchId, start, end)
    .first();
  if (unsupportedCurrency) throw new ValidationError("Báo cáo doanh thu ghế hiện chỉ hỗ trợ VND");

  const result = await db.prepare(`SELECT v.chair_id, COALESCE(SUM(p.amount), 0) AS confirmed_revenue, COUNT(*) AS payment_count
    FROM payments p
    JOIN treatment_plans tp ON tp.id = p.treatment_plan_id AND tp.tenant_id = p.tenant_id
    JOIN visits v ON v.id = tp.visit_id AND v.tenant_id = p.tenant_id
    WHERE p.tenant_id = ? AND v.branch_id = ? AND p.status = 'confirmed' AND p.currency = 'VND'
      AND datetime(p.created_at) >= datetime(?) AND datetime(p.created_at) < datetime(?)
    GROUP BY v.chair_id`)
    .bind(tenantId, branchId, start, end)
    .all<D1Row>();
  const byChair = new Map<string, ChairRevenueMetrics>();
  let unallocatedRevenue = 0;
  for (const row of result.results ?? []) {
    const amount = Number(row.confirmed_revenue ?? 0);
    const chairId = row.chair_id as string | null;
    if (!chairId) {
      unallocatedRevenue += amount;
      continue;
    }
    byChair.set(chairId, {
      confirmed_revenue: amount,
      payment_count: Number(row.payment_count ?? 0),
      completed_minutes: completedMinutes(appointments, chairId),
      revenue_per_completed_hour: null,
    });
  }
  return { byChair, unallocatedRevenue };
}

async function assertRoomInBranch(db: D1Database, tenantId: string, branchId: string, roomId?: string | null): Promise<void> {
  if (!roomId) return;
  const room = await createChairsRepository(db).getRoomById(tenantId, roomId);
  if (!room || room.branch_id !== branchId || !room.is_active) {
    throw new ValidationError("Phòng không hợp lệ hoặc không thuộc chi nhánh này");
  }
}
