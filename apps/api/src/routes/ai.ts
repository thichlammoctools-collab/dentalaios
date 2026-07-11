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
import { aiAppointmentService } from "../services/ai-appointment.service";

const router = new Hono<{ Bindings: Env; Variables: AuthContext }>();

const aiAnalyzeImageSchema = z.object({
  file_id: z.string().min(1),
  visit_id: z.string().min(1),
  image_type: z.enum(["cbct", "panoramic", "intraoral", "photo", "other"]).optional(),
  prompt: z.string().optional(),
});

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

// POST /api/ai/analyze-image
router.post(
  "/analyze-image",
  requirePermission(PERMISSIONS.READ_PATIENTS),
  zValidator("json", aiAnalyzeImageSchema),
  async (c) => {
    const { file_id, visit_id, image_type, prompt } = c.req.valid("json");
    const result = await aiService.analyzeImage(
      {
        db: c.env.DB,
        AI: (c.env as Record<string, unknown>).AI,
        FILES: c.env.FILES,
      },
      file_id,
      image_type ?? "other",
      prompt,
    );
    return c.json({ ...result, visit_id });
  },
);

// POST /api/ai/parse-appointment-chat
// Body: { message: string }
// 1-shot NL → Appointment JSON. Frontend then pre-fills AppointmentForm.
router.post(
  "/parse-appointment-chat",
  requirePermission(PERMISSIONS.WRITE_APPOINTMENTS),
  zValidator("json", z.object({ message: z.string().min(1).max(1000) })),
  async (c) => {
    const jwt = getJwt(c);
    const { message } = c.req.valid("json");
    const result = await aiAppointmentService.parseChatMessage(
      { db: c.env.DB, AI: (c.env as Record<string, unknown>).AI },
      jwt.tenant_id,
      message,
    );
    return c.json(result);
  },
);

// POST /api/ai/suggest-next-appointment
// Body: { visit_id: string }
// Returns suggested date/time/procedure for follow-up based on visit findings + treatment plan.
router.post(
  "/suggest-next-appointment",
  requirePermission(PERMISSIONS.WRITE_APPOINTMENTS),
  zValidator("json", z.object({ visit_id: z.string().min(1) })),
  async (c) => {
    const jwt = getJwt(c);
    const { visit_id } = c.req.valid("json");
    const result = await aiAppointmentService.suggestNextAppointment(
      { db: c.env.DB, AI: (c.env as Record<string, unknown>).AI },
      jwt.tenant_id,
      visit_id,
    );
    return c.json(result);
  },
);

export default router;
