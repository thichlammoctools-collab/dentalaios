/**
 * Invite routes — auth required, admin only:
 *   GET  /api/invite              — list pending invites
 *   POST /api/invite              — create invite link
 *   DELETE /api/invite/:id       — revoke invite
 *   POST /api/invite/accept      — accept invite (public, token-based)
 */

import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { inviteAcceptSchema } from "@shared/validation";
import { PERMISSIONS } from "@shared/constants";
import type { Env } from "../index";
import { requireAuth, getJwt } from "../middleware/auth";
import { requirePermission } from "../middleware/rbac";
import type { AuthContext } from "../middleware/auth";
import { registerService } from "../services/register.service";

function getBaseUrl(c: { env: { FRONTEND_ORIGIN?: string }; req: { header: (n: string) => string | undefined } }): string {
  const origin = c.req.header("origin");
  if (origin) return origin;
  return c.env.FRONTEND_ORIGIN || "https://dentalaios-web.pages.dev";
}

const router = new Hono<{ Bindings: Env; Variables: AuthContext }>();

// ── Public ───────────────────────────────────────────────────────────────────

// POST /api/invite/accept
router.post(
  "/accept",
  zValidator("json", inviteAcceptSchema),
  async (c) => {
    const data = c.req.valid("json");
    const result = await registerService.acceptInvite(
      { db: c.env.DB, jwtSecret: c.env.JWT_SECRET, baseUrl: getBaseUrl(c) },
      data,
    );
    return c.json(result, 201);
  },
);

// ── Admin-only ───────────────────────────────────────────────────────────────

const inviteCreateSchema = z.object({
  email: z.string().email("Email không hợp lệ"),
  role_id: z.string().min(1),
  branch_id: z.string().min(1),
});

router.use("*", requireAuth());
router.use("*", requirePermission(PERMISSIONS.MANAGE_USERS));

// GET /api/invite — list pending invites
router.get("/", async (c) => {
  const jwt = getJwt(c);
  const rows = await c.env.DB
    .prepare(
      `SELECT id, token, email, role_id, branch_id, expires_at, created_at
         FROM invite_tokens
         WHERE tenant_id = ? AND accepted_at IS NULL AND expires_at > datetime('now')
         ORDER BY created_at DESC`,
    )
    .bind(jwt.tenant_id)
    .all();
  return c.json({ items: rows.results || [], total: rows.results?.length || 0 });
});

// POST /api/invite — create invite
router.post("/", zValidator("json", inviteCreateSchema), async (c) => {
  const jwt = getJwt(c);
  const { email, role_id, branch_id } = c.req.valid("json");
  const result = await registerService.createInvite(
    { db: c.env.DB, jwtSecret: c.env.JWT_SECRET, baseUrl: getBaseUrl(c) },
    jwt.sub,
    jwt.tenant_id,
    { email, role_id, branch_id },
  );
  return c.json(result, 201);
});

// DELETE /api/invite/:id — revoke invite
router.delete("/:id", async (c) => {
  const jwt = getJwt(c);
  const res = await c.env.DB
    .prepare("DELETE FROM invite_tokens WHERE id = ? AND tenant_id = ?")
    .bind(c.req.param("id"), jwt.tenant_id)
    .run();
  if (res.meta.changes === 0) {
    return c.json({ error: "Invite not found", code: "not_found" }, 404);
  }
  return c.json({ ok: true });
});

export default router;
