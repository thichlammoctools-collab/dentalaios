/**
 * AI routes:
 *   POST /api/ai/summarize — generate visit summary using AI
 *   POST /api/ai/generate-plan — generate treatment plan from clinical findings
 *   POST /api/ai/analyze-image — analyze medical image (CBCT, scan, photos)
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
import { voiceFindingsService } from "../services/voice-findings.service";

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
    const result = await aiService.summarizeVisit(
      { db: c.env.DB, AI: (c.env as Record<string, unknown>).AI },
      jwt.tenant_id,
      visit_id,
    );
    return c.json(result);
  },
);

// POST /api/ai/voice-findings
router.post(
  "/voice-findings",
  zValidator("json", z.object({ visit_id: z.string().min(1), transcript: z.string().min(1) })),
  async (c) => {
    const jwt = getJwt(c);
    const { visit_id, transcript } = c.req.valid("json");
    const result = await voiceFindingsService.parseTranscript(
      { db: c.env.DB, AI: (c.env as Record<string, unknown>).AI },
      jwt.tenant_id,
      visit_id,
      transcript,
    );
    return c.json(result);
  },
);

// POST /api/ai/generate-plan
router.post(
  "/generate-plan",
  zValidator("json", z.object({ visit_id: z.string().min(1) })),
  async (c) => {
    const jwt = getJwt(c);
    const { visit_id } = c.req.valid("json");
    const result = await aiService.generateTreatmentPlan(
      { db: c.env.DB, AI: (c.env as Record<string, unknown>).AI },
      jwt.tenant_id,
      visit_id,
    );
    return c.json(result);
  },
);

export default router;
