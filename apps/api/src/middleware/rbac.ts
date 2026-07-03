/**
 * RBAC middleware: permission checks based on JWT payload.
 *
 * Each route declares required permission(s). If user lacks the permission,
 * returns 403 Forbidden.
 *
 * Architecture rule #9: "Do not trust frontend role checks."
 * The frontend can hide UI, but Worker is the source of truth.
 */

import type { MiddlewareHandler } from "hono";
import type { Env } from "../index";
import { ForbiddenError } from "../lib/errors";
import type { Permission } from "@shared/constants";
import { PERMISSIONS } from "@shared/constants";
import type { AuthContext } from "./auth";
import { getJwt } from "./auth";

export function requirePermission(
  permission: Permission,
): MiddlewareHandler<{ Bindings: Env; Variables: AuthContext }> {
  return async (c, next) => {
    const jwt = getJwt(c);
    // "all" permission bypasses everything
    if (jwt.permissions.includes(PERMISSIONS.ALL)) {
      await next();
      return;
    }
    if (!jwt.permissions.includes(permission)) {
      throw new ForbiddenError(`Missing permission: ${permission}`);
    }
    await next();
  };
}

/**
 * requireAnyPermission — useful when route accepts multiple roles.
 * Pass at least one matching permission to pass.
 */
export function requireAnyPermission(
  permissions: Permission[],
): MiddlewareHandler<{ Bindings: Env; Variables: AuthContext }> {
  return async (c, next) => {
    const jwt = getJwt(c);
    if (jwt.permissions.includes(PERMISSIONS.ALL)) {
      await next();
      return;
    }
    const has = permissions.some((p) => jwt.permissions.includes(p));
    if (!has) {
      throw new ForbiddenError(`Missing one of permissions: ${permissions.join(", ")}`);
    }
    await next();
  };
}