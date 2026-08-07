import type { MiddlewareHandler } from "hono";
import type { Env } from "../index";
import { ForbiddenError } from "../lib/errors";
import { getJwt, type AuthContext } from "./auth";

/**
 * The shared demo tenant is intentionally writable so clinic owners can test
 * the product. Actions which escape its resettable boundary stay unavailable.
 */
export const DEMO_TENANT_ID = "tenant-demo";

export function blockDemoAction(action: string): MiddlewareHandler<{ Bindings: Env; Variables: AuthContext }> {
  return async (c, next) => {
    if (getJwt(c).tenant_id === DEMO_TENANT_ID) {
      throw new ForbiddenError(`${action} không khả dụng trong demo công khai để bảo vệ môi trường mô phỏng.`);
    }
    await next();
  };
}
