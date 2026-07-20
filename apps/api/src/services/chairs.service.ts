import type { D1Database } from "@cloudflare/workers-types";
import type { Appointment, DentalChair } from "@shared/types";
import type { ChairCreateInput, ChairStatusUpdateInput, ChairUpdateInput } from "@shared/validation";
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
}

function endOf(start: string, durationMin: number): string {
  const end = new Date(start);
  end.setMinutes(end.getMinutes() + durationMin);
  return end.toISOString();
}

function active(appointment: Appointment): boolean {
  return appointment.status !== "cancelled" && appointment.status !== "no_show";
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
    return createChairsRepository(db).create(tenantId, input);
  },

  async update(db: D1Database, tenantId: string, id: string, input: ChairUpdateInput): Promise<DentalChair> {
    await assertAllInTenant(db, tenantId, [
      { table: "users", id: input.default_doctor_id },
      { table: "users", id: input.default_assistant_id },
    ]);
    const chair = await createChairsRepository(db).update(tenantId, id, input);
    if (!chair) throw new NotFoundError("Ghế nha không tồn tại");
    return chair;
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

  async board(db: D1Database, tenantId: string, branchId: string, date: string): Promise<ChairBoardItem[]> {
    await assertAllInTenant(db, tenantId, [{ table: "branches", id: branchId }]);
    const [chairs, appointments] = await Promise.all([
      createChairsRepository(db).list(tenantId, { branchId }),
      createAppointmentsRepository(db).list(tenantId, {
        branchId,
        from: `${date}T00:00:00.000Z`,
        to: `${date}T23:59:59.999Z`,
      }),
    ]);
    const now = new Date();
    return chairs.map((chair) => {
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
      return {
        chair,
        current_status: currentStatus,
        current_appointment: current,
        next_appointment: next,
        appointments: chairAppointments,
      };
    });
  },
};
