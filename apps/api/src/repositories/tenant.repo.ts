import type { D1Database } from "@cloudflare/workers-types";
import type { Tenant } from "@shared/types";
import type { D1Row } from "./base";

export interface TenantRepository {
  getById(id: string): Promise<Tenant | null>;
  update(id: string, data: { name?: string; email?: string; logo_file_id?: string | null; tax_code?: string; tax_address?: string; hotline?: string; bank_account_number?: string; slug?: string; is_active?: boolean }): Promise<Tenant | null>;
}

export function createTenantRepository(db: D1Database): TenantRepository {
  return {
    async getById(id) {
      const row = await db
        .prepare("SELECT * FROM tenants WHERE id = ? LIMIT 1")
        .bind(id)
        .first() as D1Row | null;
      return row ? mapTenant(row) : null;
    },

    async update(id, data) {
      const fields: string[] = [];
      const binds: unknown[] = [];
      if (data.name !== undefined) { fields.push("name = ?"); binds.push(data.name.trim()); }
      if (data.email !== undefined) { fields.push("email = ?"); binds.push(data.email.trim()); }
      if (data.logo_file_id !== undefined) { fields.push("logo_file_id = ?"); binds.push(data.logo_file_id); }
      if (data.tax_code !== undefined) { fields.push("tax_code = ?"); binds.push(data.tax_code.trim()); }
      if (data.tax_address !== undefined) { fields.push("tax_address = ?"); binds.push(data.tax_address.trim()); }
      if (data.hotline !== undefined) { fields.push("hotline = ?"); binds.push(data.hotline.trim()); }
      if (data.bank_account_number !== undefined) { fields.push("bank_account_number = ?"); binds.push(data.bank_account_number.trim()); }
      if (data.slug !== undefined) { fields.push("slug = ?"); binds.push(data.slug || null); }
      if (data.is_active !== undefined) { fields.push("is_active = ?"); binds.push(data.is_active ? 1 : 0); }
      if (fields.length === 0) return this.getById(id);
      binds.push(id);
      await db
        .prepare(`UPDATE tenants SET ${fields.join(", ")} WHERE id = ?`)
        .bind(...binds)
        .run();
      return this.getById(id);
    },
  };
}

function mapTenant(row: D1Row): Tenant {
  return {
    id: row.id as string,
    name: row.name as string,
    slug: (row.slug as string | null) || undefined,
    email: (row.email as string | null) || undefined,
    logo_file_id: (row.logo_file_id as string | null) || undefined,
    tax_code: (row.tax_code as string | null) || "",
    tax_address: (row.tax_address as string | null) || "",
    hotline: (row.hotline as string | null) || "",
    bank_account_number: (row.bank_account_number as string | null) || "",
    is_active: (row.is_active as number) === 1,
    created_at: row.created_at as string,
  };
}
