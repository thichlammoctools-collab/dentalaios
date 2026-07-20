import type { D1Database } from "@cloudflare/workers-types";
import type { TreatmentService } from "@shared/types";
import type { D1Row } from "./base";

export function createTreatmentServicesRepository(db: D1Database) {
  return {
    async list(tenantId: string): Promise<TreatmentService[]> {
      const result = await db.prepare("SELECT * FROM treatment_services WHERE tenant_id = ? ORDER BY code ASC")
        .bind(tenantId).all();
      return (result.results as D1Row[]).map(mapPrice);
    },

    async getActiveByCode(tenantId: string, code: string): Promise<TreatmentService | null> {
      const row = await db.prepare("SELECT * FROM treatment_services WHERE tenant_id = ? AND code = ? AND is_active = 1 LIMIT 1")
        .bind(tenantId, code).first() as D1Row | null;
      return row ? mapPrice(row) : null;
    },

    async upsert(tenantId: string, data: { code: string; name: string; procedure: string; price: number; is_active: boolean }): Promise<TreatmentService> {
      await db.prepare(`INSERT INTO treatment_services (id, tenant_id, code, name, procedure, price, is_active)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(tenant_id, code) DO UPDATE SET name = excluded.name, procedure = excluded.procedure, price = excluded.price, is_active = excluded.is_active, updated_at = datetime('now')`)
        .bind(crypto.randomUUID(), tenantId, data.code, data.name.trim(), data.procedure.trim(), data.price, data.is_active ? 1 : 0).run();
      const row = await db.prepare("SELECT * FROM treatment_services WHERE tenant_id = ? AND code = ? LIMIT 1")
        .bind(tenantId, data.code).first() as D1Row | null;
      if (!row) throw new Error("Upsert succeeded but read failed");
      return mapPrice(row);
    },
  };
}

function mapPrice(row: D1Row): TreatmentService {
  return {
    id: row.id as string,
    tenant_id: row.tenant_id as string,
    code: row.code as string,
    name: row.name as string,
    procedure: row.procedure as string,
    price: Number(row.price),
    is_active: Boolean(row.is_active),
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
  };
}
