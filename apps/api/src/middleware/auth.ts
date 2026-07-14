/**
 * Auth middleware: verifies JWT and attaches decoded payload to context.
 *
 * Public routes (e.g. POST /api/auth/login) skip this middleware.
 * All other routes use requireAuth() to gate access.
 *
 * Usage:
 *   app.use("/api/*", requireAuth())   // applies to all /api/* except routes that bypass
 *   Or per-route: app.get("/api/x", requireAuth(), handler)
 */

import type { MiddlewareHandler } from "hono";
import type { JwtPayload } from "@shared/types";
import type { Env } from "../index";
import { verifyJwt } from "../lib/jwt";
import { UnauthorizedError } from "../lib/errors";
import { createUsersRepository } from "../repositories/users.repo";

// Extend Hono context to include auth payload
export type AuthContext = {
  jwt: JwtPayload;
};

export function requireAuth(): MiddlewareHandler<{ Bindings: Env; Variables: AuthContext }> {
  return async (c, next) => {
    const header = c.req.header("Authorization");
    if (!header || !header.startsWith("Bearer ")) {
      throw new UnauthorizedError("Missing or invalid Authorization header");
    }
    const token = header.slice("Bearer ".length).trim();
    if (!token) throw new UnauthorizedError("Empty token");

    try {
      const jwt = await verifyJwt(token, c.env.JWT_SECRET);

      // JWT signatures and expirations alone cannot revoke a token. Resolve
      // the current user context in production so a disabled user, changed
      // branch/role, or changed role permissions takes effect immediately
      // rather than after the 24-hour JWT TTL. Test apps deliberately use a
      // lightweight mock DB and exercise this behaviour in production-mode
      // middleware tests instead.
      if (c.env.ENVIRONMENT !== "test") {
        const current = await createUsersRepository(c.env.DB).findContextById(
          jwt.sub,
          jwt.tenant_id,
        );
        if (!current || !current.user.is_active || !current.tenant.is_active) {
          throw new UnauthorizedError("Tài khoản không còn hoạt động");
        }
        c.set("jwt", {
          ...jwt,
          branch_id: current.user.branch_id,
          role_id: current.user.role_id,
          permissions: current.role.permissions,
        });
      } else {
        c.set("jwt", jwt);
      }
      await next();
    } catch (err) {
      if (err instanceof UnauthorizedError) throw err;
      throw new UnauthorizedError("Invalid or expired token");
    }
  };
}

/** Helper: read JWT payload from context. Throws if missing (caller misuse). */
export function getJwt(c: { get: (k: "jwt") => JwtPayload | undefined }): JwtPayload {
  const jwt = c.get("jwt");
  if (!jwt) throw new Error("JWT not set — route is missing requireAuth() middleware");
  return jwt;
}
