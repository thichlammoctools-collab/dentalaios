import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { patientNoteCreateSchema } from "@shared/validation";
import { PERMISSIONS } from "@shared/constants";
import type { Env } from "../index";
import { requireAuth, getJwt } from "../middleware/auth";
import { requirePermission } from "../middleware/rbac";
import { auditLog } from "../middleware/audit";
import type { AuthContext } from "../middleware/auth";
import { patientNotesService } from "../services/patient-notes.service";

const router = new Hono<{ Bindings: Env; Variables: AuthContext }>();

router.use("*", requireAuth());

// GET /api/patients/:id/notes
router.get(
  "/:id/notes",
  requirePermission(PERMISSIONS.READ_PATIENTS),
  async (c) => {
    const jwt = getJwt(c);
    const items = await patientNotesService.list(c.env.DB, jwt.tenant_id, c.req.param("id"));
    if (!items) return c.json({ error: "Patient not found", code: "not_found" }, 404);
    return c.json({ items, total: items.length });
  },
);

// POST /api/patients/:id/notes
router.post(
  "/:id/notes",
  requirePermission(PERMISSIONS.WRITE_PATIENTS),
  auditLog("create", "patient_note"),
  zValidator("json", patientNoteCreateSchema),
  async (c) => {
    const jwt = getJwt(c);
    const { content } = c.req.valid("json");
    const created = await patientNotesService.create(
      c.env.DB,
      jwt.tenant_id,
      c.req.param("id"),
      jwt.sub,
      content,
    );
    if (!created) return c.json({ error: "Patient not found", code: "not_found" }, 404);
    return c.json(created, 201);
  },
);

export default router;
