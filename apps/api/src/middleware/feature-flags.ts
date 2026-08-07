import type { MiddlewareHandler } from "hono";
import type { Env } from "../index";
import { NotFoundError } from "../lib/errors";
import { createPlatformConfigRepository } from "../repositories/platform-config.repo";
import { getJwt, type AuthContext } from "./auth";

/**
 * Requires a platform-entitled module for the authenticated tenant.
 * Entitlement is independent from RBAC: even `all` cannot bypass a disabled flag.
 */
export function requireFeatureEnabled(
  flagKey: string,
): MiddlewareHandler<{ Bindings: Env; Variables: AuthContext }> {
  return async (c, next) => {
    const { tenant_id: tenantId } = getJwt(c);

    try {
      const enabled = await createPlatformConfigRepository(c.env.DB)
        .isTenantFlagEnabled(tenantId, flagKey);
      if (!enabled) throw new NotFoundError("Module not available");
    } catch (error) {
      if (error instanceof NotFoundError) throw error;
      // Fail closed without exposing rollout or database details to the tenant.
      console.error("Feature entitlement lookup failed", { flagKey, tenantId });
      throw new NotFoundError("Module not available");
    }

    await next();
  };
}
