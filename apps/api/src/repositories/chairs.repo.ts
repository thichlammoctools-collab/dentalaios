import type { D1Database } from "@cloudflare/workers-types";
import type { DentalChair, DentalRoom } from "@shared/types";
import type { D1Row } from "./base";

export interface ChairListOptions {
  branchId?: string;
  activeOnly?: boolean;
}

export interface ChairCreateData {
  branch_id: string;
  code: string;
  name: string;
  room_id?: string | null;
  chair_type?: DentalChair["chair_type"];
  operational_status?: DentalChair["operational_status"];
  default_doctor_id?: string | null;
  default_assistant_id?: string | null;
  turnover_min?: number;
  sort_order?: number;
  color?: string;
  is_active?: boolean;
  notes?: string;
}

export type ChairUpdateData = Partial<Omit<ChairCreateData, "branch_id" | "code">>;

export interface ChairsRepository {
  list(tenantId: string, options?: ChairListOptions): Promise<DentalChair[]>;
  getById(tenantId: string, id: string): Promise<DentalChair | null>;
  create(tenantId: string, data: ChairCreateData): Promise<DentalChair>;
  update(tenantId: string, id: string, data: ChairUpdateData): Promise<DentalChair | null>;
  listRooms(tenantId: string, branchId: string): Promise<DentalRoom[]>;
  getRoomById(tenantId: string, id: string): Promise<DentalRoom | null>;
  createRoom(tenantId: string, data: { branch_id: string; name: string; sort_order?: number }): Promise<DentalRoom>;
}

export function createChairsRepository(db: D1Database): ChairsRepository {
  return {
    async list(tenantId, options = {}) {
      const conditions = ["dental_chairs.tenant_id = ?"];
      const binds: unknown[] = [tenantId];
      if (options.branchId) {
        conditions.push("dental_chairs.branch_id = ?");
        binds.push(options.branchId);
      }
      if (options.activeOnly) conditions.push("dental_chairs.is_active = 1");
      const result = await db
        .prepare(`SELECT dental_chairs.*, dental_rooms.name AS room_name FROM dental_chairs LEFT JOIN dental_rooms ON dental_rooms.id = dental_chairs.room_id AND dental_rooms.tenant_id = dental_chairs.tenant_id WHERE ${conditions.join(" AND ")} ORDER BY dental_chairs.sort_order ASC, dental_chairs.name ASC`)
        .bind(...binds)
        .all();
      return (result.results as D1Row[]).map(mapChair);
    },

    async getById(tenantId, id) {
      const row = await db
        .prepare("SELECT dental_chairs.*, dental_rooms.name AS room_name FROM dental_chairs LEFT JOIN dental_rooms ON dental_rooms.id = dental_chairs.room_id AND dental_rooms.tenant_id = dental_chairs.tenant_id WHERE dental_chairs.tenant_id = ? AND dental_chairs.id = ? LIMIT 1")
        .bind(tenantId, id)
        .first() as D1Row | null;
      return row ? mapChair(row) : null;
    },

    async create(tenantId, data) {
      const id = crypto.randomUUID();
      await db.prepare(
        `INSERT INTO dental_chairs (
          id, tenant_id, branch_id, code, name, room_id, chair_type,
          operational_status, default_doctor_id, default_assistant_id,
          turnover_min, sort_order, color, is_active, notes
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(
        id, tenantId, data.branch_id, data.code.trim(), data.name.trim(),
        data.room_id ?? null, data.chair_type ?? "general", data.operational_status ?? "available",
        data.default_doctor_id ?? null, data.default_assistant_id ?? null,
        data.turnover_min ?? 10, data.sort_order ?? 0, data.color ?? null,
        data.is_active === false ? 0 : 1, data.notes ?? null,
      ).run();
      const chair = await this.getById(tenantId, id);
      if (!chair) throw new Error("Insert succeeded but read failed");
      return chair;
    },

    async update(tenantId, id, data) {
      const fields: string[] = [];
      const binds: unknown[] = [];
      const allowed = [
        "name", "room_id", "chair_type", "operational_status", "default_doctor_id",
        "default_assistant_id", "turnover_min", "sort_order", "color", "is_active", "notes",
      ] as const;
      for (const key of allowed) {
        if (data[key] !== undefined) {
          fields.push(`${key} = ?`);
          binds.push(key === "is_active" ? (data[key] ? 1 : 0) : data[key] ?? null);
        }
      }
      if (fields.length === 0) return this.getById(tenantId, id);
      fields.push("updated_at = datetime('now')");
      await db.prepare(`UPDATE dental_chairs SET ${fields.join(", ")} WHERE tenant_id = ? AND id = ?`)
        .bind(...binds, tenantId, id)
        .run();
      return this.getById(tenantId, id);
    },

    async listRooms(tenantId, branchId) {
      const result = await db.prepare("SELECT * FROM dental_rooms WHERE tenant_id = ? AND branch_id = ? ORDER BY sort_order ASC, name ASC")
        .bind(tenantId, branchId).all();
      return (result.results as D1Row[]).map(mapRoom);
    },

    async getRoomById(tenantId, id) {
      const row = await db.prepare("SELECT * FROM dental_rooms WHERE tenant_id = ? AND id = ? LIMIT 1")
        .bind(tenantId, id).first() as D1Row | null;
      return row ? mapRoom(row) : null;
    },

    async createRoom(tenantId, data) {
      const id = crypto.randomUUID();
      await db.prepare("INSERT INTO dental_rooms (id, tenant_id, branch_id, name, sort_order) VALUES (?, ?, ?, ?, ?)")
        .bind(id, tenantId, data.branch_id, data.name.trim(), data.sort_order ?? 0).run();
      const room = await this.getRoomById(tenantId, id);
      if (!room) throw new Error("Insert succeeded but read failed");
      return room;
    },
  };
}

function mapChair(row: D1Row): DentalChair {
  return {
    id: row.id as string,
    tenant_id: row.tenant_id as string,
    branch_id: row.branch_id as string,
    code: row.code as string,
    name: row.name as string,
    room_id: (row.room_id as string | null) ?? undefined,
    room_name: (row.room_name as string | null) ?? undefined,
    chair_type: row.chair_type as DentalChair["chair_type"],
    operational_status: row.operational_status as DentalChair["operational_status"],
    default_doctor_id: (row.default_doctor_id as string | null) ?? undefined,
    default_assistant_id: (row.default_assistant_id as string | null) ?? undefined,
    turnover_min: Number(row.turnover_min),
    sort_order: Number(row.sort_order),
    color: (row.color as string | null) ?? undefined,
    is_active: Boolean(row.is_active),
    notes: (row.notes as string | null) ?? undefined,
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
  };
}

function mapRoom(row: D1Row): DentalRoom {
  return {
    id: row.id as string,
    tenant_id: row.tenant_id as string,
    branch_id: row.branch_id as string,
    name: row.name as string,
    sort_order: Number(row.sort_order),
    is_active: Boolean(row.is_active),
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
  };
}
