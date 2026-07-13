/**
 * Per-tenant settings (generic key/value store).
 *
 * Used for tenant-level config that doesn't warrant its own table — e.g. the
 * payment code prefix. Each tenant has at most one row per key.
 */

import type { D1Database } from "@cloudflare/workers-types";

export interface TenantSettingsRepository {
  get(tenantId: string, key: string): Promise<string | null>;
  set(tenantId: string, key: string, value: string): Promise<void>;
}

export function createTenantSettingsRepository(db: D1Database): TenantSettingsRepository {
  return {
    async get(tenantId, key) {
      const row = (await db
        .prepare(
          "SELECT value FROM tenant_settings WHERE tenant_id = ? AND key = ? LIMIT 1",
        )
        .bind(tenantId, key)
        .first()) as { value: string } | null;
      return row?.value ?? null;
    },

    async set(tenantId, key, value) {
      await db
        .prepare(
          `INSERT INTO tenant_settings (tenant_id, key, value, updated_at)
           VALUES (?, ?, ?, datetime('now'))
           ON CONFLICT(tenant_id, key) DO UPDATE SET
             value = excluded.value,
             updated_at = excluded.updated_at`,
        )
        .bind(tenantId, key, value)
        .run();
    },
  };
}