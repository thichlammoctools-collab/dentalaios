import type { D1Database } from "@cloudflare/workers-types";
import type { Tenant, Branch } from "@shared/types";
import { createTenantRepository } from "../repositories/tenant.repo";
import { createBranchRepository } from "../repositories/branch.repo";

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
    data: { name: string; address?: string },
  ): Promise<Branch> {
    return createBranchRepository(db).create(tenantId, data);
  },

  async updateBranch(
    db: D1Database,
    tenantId: string,
    branchId: string,
    data: { name?: string; address?: string },
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
};
