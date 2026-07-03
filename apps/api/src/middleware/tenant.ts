/**
 * Tenant helper: every repository takes tenantId as first arg.
 * This file provides convenience accessors reading tenant_id from JWT.
 *
 * Architecture rule #3: every clinical table includes tenant_id.
 * This middleware/utility enforces that no query runs without a tenant scope.
 */

import type { AuthContext } from "./auth";
import { getJwt } from "./auth";

export function getTenantId(c: AuthContext & { get: (k: "jwt") => unknown }): string {
  return getJwt(c).tenant_id;
}

export function getBranchId(c: AuthContext & { get: (k: "jwt") => unknown }): string {
  return getJwt(c).branch_id;
}

export function getUserId(c: AuthContext & { get: (k: "jwt") => unknown }): string {
  return getJwt(c).sub;
}