import type { D1Database } from "@cloudflare/workers-types";
import type { AuthSession, User, Role, Tenant, Branch } from "@shared/types";
import { createUsersRepository } from "../repositories/users.repo";
import { verifyPassword } from "../lib/password";
import { signJwt } from "../lib/jwt";
import { UnauthorizedError } from "../lib/errors";

export interface AuthDeps {
  db: D1Database;
  jwtSecret: string | undefined;
}

export const authService = {
  async login(deps: AuthDeps, email: string, password: string): Promise<AuthSession> {
    const users = createUsersRepository(deps.db);
    const ctx = await users.findByEmail(email);
    if (!ctx) throw new UnauthorizedError("Email hoặc mật khẩu không đúng");

    if (!ctx.user.is_active) {
      throw new UnauthorizedError("Tài khoản chưa được kích hoạt. Vui lòng xác thực email.");
    }

    if (!ctx.tenant.is_active) {
      throw new UnauthorizedError("Tài khoản không còn hoạt động");
    }

    const valid = await verifyPassword(password, ctx.password_hash);
    if (!valid) throw new UnauthorizedError("Email hoặc mật khẩu không đúng");

    const { token, expires_at } = await signJwt(
      {
        sub: ctx.user.id,
        tenant_id: ctx.user.tenant_id,
        branch_id: ctx.user.branch_id,
        role_id: ctx.user.role_id,
        permissions: ctx.role.permissions,
      },
      deps.jwtSecret,
    );

    return {
      user: ctx.user,
      role: ctx.role,
      tenant: ctx.tenant,
      branch: ctx.branch,
      token,
      expires_at,
    };
  },

  async getMe(
    deps: AuthDeps,
    userId: string,
    tenantId: string,
  ): Promise<{ user: User; role: Role; tenant: Tenant; branch: Branch } | null> {
    const users = createUsersRepository(deps.db);
    const ctx = await users.findContextById(userId, tenantId);
    if (!ctx) return null;
    return {
      user: ctx.user,
      role: ctx.role,
      tenant: ctx.tenant,
      branch: ctx.branch,
    };
  },
};
