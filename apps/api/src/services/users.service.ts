import type { D1Database } from "@cloudflare/workers-types";
import type { User } from "@shared/types";
import type { UserWithDetails } from "../repositories/users.repo";
import { createUsersRepository } from "../repositories/users.repo";
import { hashPassword } from "../lib/password";
import { AppError, ConflictError } from "../lib/errors";
import { isUniqueConstraintError, isForeignKeyError } from "../lib/db-errors";
import { ERROR_CODES } from "@shared/constants";

async function assertSystemRole(db: D1Database, tenantId: string, roleId: string | undefined): Promise<void> {
  if (!roleId) return;
  const role = await db
    .prepare("SELECT 1 FROM roles WHERE tenant_id = ? AND id = ? AND system_key IS NOT NULL LIMIT 1")
    .bind(tenantId, roleId)
    .first();
  if (!role) throw new AppError("Vai trò không hợp lệ", 400, ERROR_CODES.INVALID_REFERENCE);
}

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
    // Only platform-defined roles may be assigned to a user.
    await assertSystemRole(db, tenantId, data.role_id);
    const branch = await db
      .prepare("SELECT 1 FROM branches WHERE tenant_id = ? AND id = ? LIMIT 1")
      .bind(tenantId, data.branch_id)
      .first();
    if (!branch) throw new AppError("Role hoặc chi nhánh không hợp lệ", 400, ERROR_CODES.INVALID_REFERENCE);
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
      if (isForeignKeyError(err)) {
        throw new AppError("Role hoặc chi nhánh không hợp lệ", 400, ERROR_CODES.INVALID_REFERENCE);
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
    await assertSystemRole(db, tenantId, data.role_id);
    if (data.branch_id) {
      const branch = await db
        .prepare("SELECT 1 FROM branches WHERE tenant_id = ? AND id = ? LIMIT 1")
        .bind(tenantId, data.branch_id)
        .first();
      if (!branch) throw new AppError("Role hoặc chi nhánh không hợp lệ", 400, ERROR_CODES.INVALID_REFERENCE);
    }
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
      if (isForeignKeyError(err)) {
        throw new AppError("Role hoặc chi nhánh không hợp lệ", 400, ERROR_CODES.INVALID_REFERENCE);
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
