import type { D1Database } from "@cloudflare/workers-types";
import { SYSTEM_ROLES } from "@shared/constants";
import type { PlatformTenantCreateInput } from "@shared/validation";
import { ConflictError } from "../lib/errors";
import { isUniqueConstraintError } from "../lib/db-errors";
import { newId } from "../lib/ids";
import { hashPassword } from "../lib/password";

export const platformTenantProvisionService = {
  async provision(db: D1Database, data: PlatformTenantCreateInput): Promise<string> {
    const tenantId = newId();
    const branchId = newId();
    const adminUserId = newId();
    const roleIds = new Map(SYSTEM_ROLES.map((role) => [role.key, newId()]));
    const email = data.admin_email.toLowerCase().trim();
    const passwordHash = await hashPassword(data.admin_password);

    try {
      // All tenant-local identities are created together so a new tenant is
      // immediately usable and never left without an administrator.
      await db.batch([
        db
          .prepare("INSERT INTO tenants (id, name, slug, is_active) VALUES (?, ?, ?, 1)")
          .bind(tenantId, data.name.trim(), data.slug?.trim() ?? null),
        db
          .prepare("INSERT INTO branches (id, tenant_id, name, address) VALUES (?, ?, ?, ?)")
          .bind(branchId, tenantId, "Chi nhánh chính", ""),
        ...SYSTEM_ROLES.map((role) =>
          db
            .prepare("INSERT INTO roles (id, tenant_id, system_key, name, permissions) VALUES (?, ?, ?, ?, ?)")
            .bind(
              roleIds.get(role.key),
              tenantId,
              role.key,
              role.name,
              JSON.stringify(role.permissions),
            ),
        ),
        db
          .prepare(
            `INSERT INTO users (id, tenant_id, branch_id, role_id, email, name, password_hash, is_active)
             VALUES (?, ?, ?, ?, ?, ?, ?, 1)`,
          )
          .bind(
            adminUserId,
            tenantId,
            branchId,
            roleIds.get("admin"),
            email,
            "Quản trị viên",
            passwordHash,
          ),
      ]);
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw new ConflictError("Email hoặc slug đã được sử dụng");
      }
      throw error;
    }

    return tenantId;
  },
};
