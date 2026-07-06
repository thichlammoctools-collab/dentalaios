import type { D1Database } from "@cloudflare/workers-types";
import type { User } from "@shared/types";
import type { UserWithDetails } from "../repositories/users.repo";
import { createUsersRepository } from "../repositories/users.repo";
import { hashPassword } from "../lib/password";
import { ConflictError } from "../lib/errors";
import { isUniqueConstraintError } from "../lib/db-errors";

export const usersService = {
  list(db: D1Database, tenantId: string): Promise<User[]> {
    return createUsersRepository(db).list(tenantId);
  },

  async create(
    db: D1Database,
    tenantId: string,
    data: {
      email: string;
      name: string;
      password: string;
      role_id: string;
      branch_id: string;
    },
  ): Promise<User> {
    const password_hash = await hashPassword(data.password);
    try {
      return await createUsersRepository(db).create(tenantId, {
        email: data.email,
        name: data.name,
        role_id: data.role_id,
        branch_id: data.branch_id,
        is_active: true,
        password_hash,
      });
    } catch (err) {
      if (isUniqueConstraintError(err)) {
        throw new ConflictError("Email đã tồn tại");
      }
      throw err;
    }
  },

  async update(
    db: D1Database,
    tenantId: string,
    id: string,
    data: { name?: string; role_id?: string; branch_id?: string; password?: string; is_active?: boolean },
  ): Promise<User | null> {
    const repo = createUsersRepository(db);
    const patch: Parameters<typeof repo.update>[2] = {};
    if (data.name !== undefined) patch.name = data.name;
    if (data.role_id !== undefined) patch.role_id = data.role_id;
    if (data.branch_id !== undefined) patch.branch_id = data.branch_id;
    if (data.is_active !== undefined) patch.is_active = data.is_active;
    if (data.password !== undefined) patch.password_hash = await hashPassword(data.password);
    try {
      return await repo.update(tenantId, id, patch);
    } catch (err) {
      if (isUniqueConstraintError(err)) {
        throw new ConflictError("Email đã tồn tại");
      }
      throw err;
    }
  },

  remove(db: D1Database, tenantId: string, id: string): Promise<boolean> {
    return createUsersRepository(db).deactivate(tenantId, id);
  },

  listByBranch(db: D1Database, tenantId: string, branchId: string): Promise<UserWithDetails[]> {
    return createUsersRepository(db).listByBranch(tenantId, branchId);
  },
};
