import type { D1Database } from "@cloudflare/workers-types";
import type {
  Tenant,
  Branch,
  LarkConfigPublic,
  LarkConfigUpdate,
} from "@shared/types";
import { createTenantRepository } from "../repositories/tenant.repo";
import { createBranchRepository } from "../repositories/branch.repo";
import { createLarkConfigRepository } from "../repositories/lark-config.repo";

export const clinicService = {
  async getTenant(db: D1Database, tenantId: string): Promise<Tenant | null> {
    return createTenantRepository(db).getById(tenantId);
  },

  async updateTenant(
    db: D1Database,
    tenantId: string,
    data: { name?: string },
  ): Promise<Tenant | null> {
    return createTenantRepository(db).update(tenantId, data);
  },

  async listBranches(db: D1Database, tenantId: string): Promise<Branch[]> {
    return createBranchRepository(db).list(tenantId);
  },

  async getBranch(db: D1Database, tenantId: string, branchId: string): Promise<Branch | null> {
    return createBranchRepository(db).getById(tenantId, branchId);
  },

  async createBranch(
    db: D1Database,
    tenantId: string,
    data: {
      name: string;
      address?: string;
      phone?: string;
      email?: string;
      manager_name?: string;
      opening_date?: string | null;
    },
  ): Promise<Branch> {
    return createBranchRepository(db).create(tenantId, data);
  },

  async updateBranch(
    db: D1Database,
    tenantId: string,
    branchId: string,
    data: {
      name?: string;
      address?: string;
      phone?: string;
      email?: string;
      manager_name?: string;
      opening_date?: string | null;
    },
  ): Promise<Branch | null> {
    return createBranchRepository(db).update(tenantId, branchId, data);
  },

  async deleteBranch(
    db: D1Database,
    tenantId: string,
    branchId: string,
  ): Promise<boolean> {
    return createBranchRepository(db).delete(tenantId, branchId);
  },

  /**
   * Public-shape read of per-tenant Lark config.
   * NEVER returns the secret to clients.
   */
  async getLarkConfig(
    db: D1Database,
    tenantId: string,
  ): Promise<LarkConfigPublic | null> {
    const repo = createLarkConfigRepository(db);
    const raw = await repo.getRawByTenant(tenantId);
    if (!raw) return null;
    return {
      tenant_id: raw.tenant_id,
      app_id: raw.app_id,
      has_secret: !!raw.app_secret,
      calendar_id: raw.calendar_id ?? undefined,
      enabled: raw.enabled === 1,
      created_at: raw.created_at,
      updated_at: raw.updated_at,
    };
  },

  /**
   * Save (insert or update) Lark config for the tenant. Encrypts secret at rest.
   */
  async saveLarkConfig(
    db: D1Database,
    tenantId: string,
    data: LarkConfigUpdate,
    encryptionKey: string,
  ): Promise<LarkConfigPublic> {
    const repo = createLarkConfigRepository(db);
    await repo.upsert(
      tenantId,
      {
        app_id: data.app_id,
        app_secret: data.app_secret,
        calendar_id: data.calendar_id ?? null,
        enabled: data.enabled ?? true,
      },
      encryptionKey,
    );
    const publicShape = await this.getLarkConfig(db, tenantId);
    if (!publicShape) throw new Error("saveLarkConfig: row missing after upsert");
    return publicShape;
  },

  /**
   * Disable the integration (soft delete — preserves audit history).
   */
  async disableLarkConfig(db: D1Database, tenantId: string): Promise<boolean> {
    return createLarkConfigRepository(db).disable(tenantId);
  },

  /**
   * Hard delete — used by admin "remove integration" action.
   */
  async deleteLarkConfig(db: D1Database, tenantId: string): Promise<boolean> {
    return createLarkConfigRepository(db).deleteByTenant(tenantId);
  },
};