import type { D1Database } from "@cloudflare/workers-types";
import type { Role } from "@shared/types";
import { createRolesRepository } from "../repositories/roles.repo";
import { ConflictError } from "../lib/errors";

export const rolesService = {
  list(db: D1Database, tenantId: string): Promise<Role[]> {
    return createRolesRepository(db).list(tenantId);
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
};