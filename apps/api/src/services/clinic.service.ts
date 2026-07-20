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
import { ConflictError } from "../lib/errors";

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
    currentBranchId: string,
  ): Promise<boolean> {
    const branchRepo = createBranchRepository(db);
    const branch = await branchRepo.getById(tenantId, branchId);
    if (!branch) return false;

    if (branchId === currentBranchId) {
      throw new ConflictError("Không thể xóa chi nhánh hiện tại. Hãy chuyển sang chi nhánh khác trước.");
    }

    const branches = await branchRepo.list(tenantId);
    if (branches.length <= 1) {
      throw new ConflictError("Phòng khám phải luôn có ít nhất một chi nhánh.");
    }

    const references = await db.prepare(
      `SELECT
         EXISTS(SELECT 1 FROM users WHERE tenant_id = ? AND branch_id = ?) AS has_users,
         EXISTS(SELECT 1 FROM patients WHERE tenant_id = ? AND branch_id = ?) AS has_patients,
         EXISTS(SELECT 1 FROM visits WHERE tenant_id = ? AND branch_id = ?) AS has_visits,
         EXISTS(SELECT 1 FROM appointments WHERE tenant_id = ? AND branch_id = ?) AS has_appointments,
         EXISTS(SELECT 1 FROM clinic_schedules WHERE tenant_id = ? AND branch_id = ?) AS has_clinic_schedules,
         EXISTS(SELECT 1 FROM doctor_schedules WHERE tenant_id = ? AND branch_id = ?) AS has_doctor_schedules,
         EXISTS(SELECT 1 FROM dental_chairs WHERE tenant_id = ? AND branch_id = ?) AS has_chairs,
         EXISTS(SELECT 1 FROM dental_rooms WHERE tenant_id = ? AND branch_id = ?) AS has_rooms,
         EXISTS(SELECT 1 FROM treatment_cases WHERE tenant_id = ? AND primary_branch_id = ?) AS has_treatment_cases`,
    )
      .bind(
        tenantId, branchId,
        tenantId, branchId,
        tenantId, branchId,
        tenantId, branchId,
        tenantId, branchId,
        tenantId, branchId,
        tenantId, branchId,
        tenantId, branchId,
        tenantId, branchId,
      )
      .first<BranchReferences>();

    const dependencies = [
      references?.has_users ? "người dùng" : null,
      references?.has_patients ? "bệnh nhân" : null,
      references?.has_visits ? "lượt khám" : null,
      references?.has_appointments ? "lịch hẹn" : null,
      references?.has_clinic_schedules || references?.has_doctor_schedules ? "lịch làm việc" : null,
      references?.has_chairs || references?.has_rooms ? "ghế hoặc phòng nha" : null,
      references?.has_treatment_cases ? "ca điều trị" : null,
    ].filter((dependency): dependency is string => dependency !== null);

    if (dependencies.length > 0) {
      throw new ConflictError(`Không thể xóa chi nhánh vì còn ${dependencies.join(", ")}. Hãy chuyển hoặc xóa dữ liệu liên quan trước.`);
    }

    return branchRepo.delete(tenantId, branchId);
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

interface BranchReferences {
  has_users: number;
  has_patients: number;
  has_visits: number;
  has_appointments: number;
  has_clinic_schedules: number;
  has_doctor_schedules: number;
  has_chairs: number;
  has_rooms: number;
  has_treatment_cases: number;
}
