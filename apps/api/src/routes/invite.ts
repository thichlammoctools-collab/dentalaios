/**
 * Invite routes — auth required, admin only:
 *   GET  /api/invites           — list pending invites
 *   POST /api/invites           — create invite link
 *   DELETE /api/invites/:id     — revoke invite
 *   POST /api/invites/accept   — accept invite (public)
 */
import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import type { Env } from "../index";
import { requireAuth, getJwt } from "../middleware/auth";
import { requirePermission } from "../middleware/rbac";
import type { AuthContext } from "../middleware/auth";
import { PERMISSIONS } from "@shared/constants";
import { registerService } from "../services/register.service";
import { getFrontendBaseUrl } from "../lib/public-url";

type Bindings = Env;
type Variables = AuthContext;

const router = new Hono<{ Bindings: Bindings; Variables: Variables }>();

// ── Public ───────────────────────────────────────────────────────────────────

const inviteAcceptSchema = z.object({
  token: z.string().min(1),
  name: z.string().min(1).max(100),
  password: z.string().min(6),
});

router.post(
  "/accept",
  zValidator("json", inviteAcceptSchema),
  async (c) => {
    const data = c.req.valid("json");
    const result = await registerService.acceptInvite(
      { db: c.env.DB, jwtSecret: c.env.JWT_SECRET, baseUrl: getFrontendBaseUrl(c.env.FRONTEND_ORIGIN) },
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

// GET /api/invites — list pending invites
router.get("/", async (c) => {
  const jwt = getJwt(c);
  const rows = await c.env.DB
    .prepare(
      `SELECT t.id, t.token, t.email, t.role_id, r.name as role_name, t.branch_id,
              t.expires_at, t.created_at
         FROM invite_tokens t
         LEFT JOIN roles r ON r.id = t.role_id
         WHERE t.tenant_id = ? AND t.accepted_at IS NULL AND t.expires_at > datetime('now')
         ORDER BY t.created_at DESC`,
    )
    .bind(jwt.tenant_id)
    .all();
  return c.json(rows.results || []);
});

// POST /api/invites — create invite
router.post("/", zValidator("json", inviteCreateSchema), async (c) => {
  const jwt = getJwt(c);
  const { email, role_id, branch_id } = c.req.valid("json");

  // Role IDs remain stable when an administrator changes a role's display name.
  const roleRow = await c.env.DB
    .prepare("SELECT id FROM roles WHERE id = ? AND tenant_id = ? AND system_key IS NOT NULL")
    .bind(role_id, jwt.tenant_id)
    .first<{ id: string }>();

  if (!roleRow) {
    return c.json({ error: "Role not found" }, 400);
  }

  const branchRow = await c.env.DB
    .prepare("SELECT id FROM branches WHERE id = ? AND tenant_id = ?")
    .bind(branch_id, jwt.tenant_id)
    .first<{ id: string }>();

  if (!branchRow) {
    return c.json({ error: "Branch not found" }, 400);
  }

  const result = await registerService.createInvite(
    { db: c.env.DB, jwtSecret: c.env.JWT_SECRET, baseUrl: getFrontendBaseUrl(c.env.FRONTEND_ORIGIN) },
    jwt.sub,
    jwt.tenant_id,
    { email, role_id: roleRow.id, branch_id: branchRow.id },
  );

  return c.json(result, 201);
});

// DELETE /api/invites/:id — revoke invite
router.delete("/:id", async (c) => {
  const jwt = getJwt(c);
  const res = await c.env.DB
    .prepare("DELETE FROM invite_tokens WHERE id = ? AND tenant_id = ?")
    .bind(c.req.param("id"), jwt.tenant_id)
    .run();
  if (res.meta.changes === 0) {
    return c.json({ error: "Invite not found" }, 404);
  }
  return c.json({ ok: true });
});

export default router;
