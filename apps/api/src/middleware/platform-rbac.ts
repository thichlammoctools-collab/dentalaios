import type { MiddlewareHandler } from "hono";
import type { PlatformPermission } from "@shared/types";
import type { Env } from "../index";
import { ForbiddenError } from "../lib/errors";
import type { PlatformAuthContext } from "./platform-auth";
import { getPlatformJwt } from "./platform-auth";
export function requirePlatformPermission(
  permission: PlatformPermission,
): MiddlewareHandler<{ Bindings: Env; Variables: PlatformAuthContext }> {
  return async (c, next) => {
    if (!getPlatformJwt(c).permissions.includes(permission))
      throw new ForbiddenError(`Missing platform permission: ${permission}`);
    await next();
  };
}
