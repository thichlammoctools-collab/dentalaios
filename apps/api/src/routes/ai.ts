/**
 * AI routes:
 *   POST /api/ai/summarize — generate visit summary using AI
 */

import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { PERMISSIONS } from "@shared/constants";
import type { Env } from "../index";
import { requireAuth, getJwt } from "../middleware/auth";
import { requirePermission } from "../middleware/rbac";
import type { AuthContext } from "../middleware/auth";
import { aiService } from "../services/ai.service";

const router = new Hono<{ Bindings: Env; Variables: AuthContext }>();

router.use("*", requireAuth());
router.use("*", requirePermission(PERMISSIONS.READ_PATIENTS));

// POST /api/ai/summarize
router.post(
  "/summarize",
  zValidator("json", z.object({ visit_id: z.string().min(1) })),
  async (c) => {
    const jwt = getJwt(c);
    const { visit_id } = c.req.valid("json");
    // AI is a global binding on Cloudflare Workers — cast as any since Env type doesn't list it
    const result = await aiService.summarizeVisit(
      { db: c.env.DB, AI: (c.env as Record<string, unknown>).AI },
      jwt.tenant_id,
      visit_id,
    );
    return c.json(result);
  },
);

export default router;
