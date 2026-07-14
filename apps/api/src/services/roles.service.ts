import type { D1Database } from "@cloudflare/workers-types";
import type { Role } from "@shared/types";
import { createRolesRepository } from "../repositories/roles.repo";
import { ConflictError, ValidationError } from "../lib/errors";

export const rolesService = {
  list(db: D1Database, tenantId: string): Promise<Role[]> {
    return createRolesRepository(db).list(tenantId);
  },

  async create(
    db: D1Database,
    tenantId: string,
    data: { name: string; description?: string; permissions?: string[] },
  ): Promise<Role> {
    try {
      return await createRolesRepository(db).create(tenantId, data);
    } catch (err) {
      if (err instanceof Error && /UNIQUE/i.test(err.message)) {
        throw new ConflictError("Role name đã tồn tại trong tenant này");
      }
      throw err;
    }
  },

  async update(
    db: D1Database,
    tenantId: string,
    id: string,
    data: { name?: string; permissions?: string[] },
  ): Promise<Role | null> {
    try {
      return await createRolesRepository(db).update(tenantId, id, data);
    } catch (err) {
      // D1 UNIQUE constraint on roles(tenant_id, name)
      if (err instanceof Error && /UNIQUE/i.test(err.message)) {
        throw new ConflictError("Role name đã tồn tại trong tenant này");
      }
      throw err;
    }
  },

  async remove(db: D1Database, tenantId: string, id: string): Promise<boolean> {
    // Do not rely on a raw FK violation: return a clear domain error and keep
    // the role/user relationship intact when the role is still assigned.
    const assigned = await db
      .prepare("SELECT 1 FROM users WHERE tenant_id = ? AND role_id = ? LIMIT 1")
      .bind(tenantId, id)
      .first();
    if (assigned) {
      throw new ValidationError("Không thể xóa vai trò đang được người dùng sử dụng");
    }
    return createRolesRepository(db).delete(tenantId, id);
  },
};
