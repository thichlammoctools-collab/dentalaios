import type { D1Database } from "@cloudflare/workers-types";
import type { DentalChair } from "@shared/types";
import type { D1Row } from "./base";

export interface ChairListOptions {
  branchId?: string;
  activeOnly?: boolean;
}

export interface ChairCreateData {
  branch_id: string;
  code: string;
  name: string;
  room_name?: string;
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
}

export function createChairsRepository(db: D1Database): ChairsRepository {
  return {
    async list(tenantId, options = {}) {
      const conditions = ["tenant_id = ?"];
      const binds: unknown[] = [tenantId];
      if (options.branchId) {
        conditions.push("branch_id = ?");
        binds.push(options.branchId);
      }
      if (options.activeOnly) conditions.push("is_active = 1");
      const result = await db
        .prepare(`SELECT * FROM dental_chairs WHERE ${conditions.join(" AND ")} ORDER BY sort_order ASC, name ASC`)
        .bind(...binds)
        .all();
      return (result.results as D1Row[]).map(mapChair);
    },

    async getById(tenantId, id) {
      const row = await db
        .prepare("SELECT * FROM dental_chairs WHERE tenant_id = ? AND id = ? LIMIT 1")
        .bind(tenantId, id)
        .first() as D1Row | null;
      return row ? mapChair(row) : null;
    },

    async create(tenantId, data) {
      const id = crypto.randomUUID();
      await db.prepare(
        `INSERT INTO dental_chairs (
          id, tenant_id, branch_id, code, name, room_name, chair_type,
          operational_status, default_doctor_id, default_assistant_id,
          turnover_min, sort_order, color, is_active, notes
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(
        id, tenantId, data.branch_id, data.code.trim(), data.name.trim(),
        data.room_name ?? null, data.chair_type ?? "general", data.operational_status ?? "available",
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
        "name", "room_name", "chair_type", "operational_status", "default_doctor_id",
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
  };
}

function mapChair(row: D1Row): DentalChair {
  return {
    id: row.id as string,
    tenant_id: row.tenant_id as string,
    branch_id: row.branch_id as string,
    code: row.code as string,
    name: row.name as string,
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
