import type { D1Database } from "@cloudflare/workers-types";
import type {
  PlatformFeatureFlag,
  PlatformIntegrationStatus,
} from "@shared/types";
import type { D1Row } from "./base";
const flag = (r: D1Row): PlatformFeatureFlag => ({
  key: r.key as string,
  description: r.description as string,
  default_enabled: r.default_enabled === 1,
  created_at: r.created_at as string,
  updated_at: r.updated_at as string,
});
const integration = (r: D1Row): PlatformIntegrationStatus => ({
  provider: r.provider as string,
  tenant_id: (r.tenant_id as string | null) ?? undefined,
  enabled: r.enabled === 1,
  health_status: r.health_status as PlatformIntegrationStatus["health_status"],
  last_checked_at: (r.last_checked_at as string | null) ?? undefined,
  last_success_at: (r.last_success_at as string | null) ?? undefined,
  last_error_code: (r.last_error_code as string | null) ?? undefined,
  updated_at: r.updated_at as string,
});
export function createPlatformConfigRepository(db: D1Database) {
  return {
    async flags(): Promise<PlatformFeatureFlag[]> {
      const rows = await db
        .prepare(
          "SELECT key, description, default_enabled, created_at, updated_at FROM platform_feature_flags ORDER BY key",
        )
        .bind()
        .all<D1Row>();
      return rows.results.map(flag);
    },
    async upsertFlag(data: {
      key: string;
      description: string;
      default_enabled: boolean;
    }): Promise<void> {
      await db
        .prepare(
          "INSERT INTO platform_feature_flags (key, description, default_enabled, updated_at) VALUES (?, ?, ?, datetime('now')) ON CONFLICT(key) DO UPDATE SET description = excluded.description, default_enabled = excluded.default_enabled, updated_at = datetime('now')",
        )
        .bind(data.key, data.description, Number(data.default_enabled))
        .run();
    },
    async tenantFlags(
      tenantId: string,
    ): Promise<
      Array<PlatformFeatureFlag & { enabled: boolean; overridden: boolean }>
    > {
      const rows = await db
        .prepare(
          "SELECT f.key, f.description, f.default_enabled, f.created_at, f.updated_at, o.enabled override_enabled FROM platform_feature_flags f LEFT JOIN platform_tenant_feature_overrides o ON o.flag_key = f.key AND o.tenant_id = ? ORDER BY f.key",
        )
        .bind(tenantId)
        .all<D1Row>();
      return rows.results.map((row) => ({
        ...flag(row),
        enabled:
          row.override_enabled == null
            ? row.default_enabled === 1
            : row.override_enabled === 1,
        overridden: row.override_enabled != null,
      }));
    },
    async setTenantFlag(
      tenantId: string,
      key: string,
      enabled: boolean,
      userId: string,
    ): Promise<void> {
      await db
        .prepare(
          "INSERT INTO platform_tenant_feature_overrides (tenant_id, flag_key, enabled, updated_by, updated_at) VALUES (?, ?, ?, ?, datetime('now')) ON CONFLICT(tenant_id, flag_key) DO UPDATE SET enabled = excluded.enabled, updated_by = excluded.updated_by, updated_at = datetime('now')",
        )
        .bind(tenantId, key, Number(enabled), userId)
        .run();
    },
    async limits(
      tenantId: string,
    ): Promise<{
      max_users: number;
      max_branches: number;
      storage_quota_bytes: number;
      updated_at: string;
    } | null> {
      const row = await db
        .prepare(
          "SELECT max_users, max_branches, storage_quota_bytes, updated_at FROM platform_tenant_limits WHERE tenant_id = ? LIMIT 1",
        )
        .bind(tenantId)
        .first<D1Row>();
      return row
        ? {
            max_users: Number(row.max_users),
            max_branches: Number(row.max_branches),
            storage_quota_bytes: Number(row.storage_quota_bytes),
            updated_at: row.updated_at as string,
          }
        : null;
    },
    async setLimits(
      tenantId: string,
      data: {
        max_users: number;
        max_branches: number;
        storage_quota_bytes: number;
      },
      userId: string,
    ): Promise<void> {
      await db
        .prepare(
          "INSERT INTO platform_tenant_limits (tenant_id, max_users, max_branches, storage_quota_bytes, updated_by, updated_at) VALUES (?, ?, ?, ?, ?, datetime('now')) ON CONFLICT(tenant_id) DO UPDATE SET max_users = excluded.max_users, max_branches = excluded.max_branches, storage_quota_bytes = excluded.storage_quota_bytes, updated_by = excluded.updated_by, updated_at = datetime('now')",
        )
        .bind(
          tenantId,
          data.max_users,
          data.max_branches,
          data.storage_quota_bytes,
          userId,
        )
        .run();
    },
    async integrations(
      tenantId?: string,
    ): Promise<PlatformIntegrationStatus[]> {
      const query = tenantId
        ? "SELECT provider, tenant_id, enabled, health_status, last_checked_at, last_success_at, last_error_code, updated_at FROM platform_integration_status WHERE tenant_id = ? ORDER BY provider"
        : "SELECT provider, tenant_id, enabled, health_status, last_checked_at, last_success_at, last_error_code, updated_at FROM platform_integration_status ORDER BY provider";
      const rows = await db
        .prepare(query)
        .bind(...(tenantId ? [tenantId] : []))
        .all<D1Row>();
      return rows.results.map(integration);
    },
  };
}
