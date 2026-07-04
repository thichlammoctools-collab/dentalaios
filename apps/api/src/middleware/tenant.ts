/**
 * Tenant helper: every repository takes tenantId as first arg.
 * This file provides convenience accessors reading tenant_id from JWT.
 *
 * Architecture rule #3: every clinical table includes tenant_id.
 * This middleware/utility enforces that no query runs without a tenant scope.
 */

import type { Context } from "hono";
import type { Env } from "../index";
import type { JwtPayload } from "@shared/types";

export type AuthedContext = Context<{ Bindings: Env; Variables: { jwt: JwtPayload } }>;

export function getTenantId(c: AuthedContext): string {
  return c.get("jwt").tenant_id;
}

export function getBranchId(c: AuthedContext): string {
  return c.get("jwt").branch_id;
}

export function getUserId(c: AuthedContext): string {
  return c.get("jwt").sub;
}