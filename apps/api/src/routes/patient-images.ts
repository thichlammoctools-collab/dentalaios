/**
 * Patient images routes:
 *   GET  /api/patient-images?patient_id=xxx          — list by patient
 *   GET  /api/patient-images/visit/:visitId          — list by visit
 *   POST /api/patient-images/presign                 — get presigned upload URL
 *   POST /api/patient-images                         — record upload metadata
 *   GET  /api/patient-images/:id/url                 — get download URL for an image
 *   DELETE /api/patient-images/:id                    — delete image + R2 file
 */

import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { patientImageCreateSchema } from "@shared/validation";
import { PERMISSIONS } from "@shared/constants";
import type { Env } from "../index";
import { requireAuth, getJwt } from "../middleware/auth";
import { requirePermission } from "../middleware/rbac";
import { auditLog } from "../middleware/audit";
import type { AuthContext } from "../middleware/auth";
import { patientImagesService } from "../services/patient-images.service";
import { filesService } from "../services/files.service";

const router = new Hono<{ Bindings: Env; Variables: AuthContext }>();

// GET /api/patient-images?patient_id=xxx
router.get(
  "/",
  requireAuth(),
  requirePermission(PERMISSIONS.READ_PATIENTS),
  async (c) => {
    const jwt = getJwt(c);
    const patientId = c.req.query("patient_id");
    if (!patientId) return c.json({ error: "patient_id required", code: "bad_request" }, 400);
    const items = await patientImagesService.listByPatient(c.env.DB, jwt.tenant_id, patientId);
    return c.json({ items, total: items.length });
  },
);

// GET /api/patient-images/visit/:visitId
router.get(
  "/visit/:visitId",
  requireAuth(),
  requirePermission(PERMISSIONS.READ_PATIENTS),
  async (c) => {
    const jwt = getJwt(c);
    const items = await patientImagesService.listByVisit(c.env.DB, jwt.tenant_id, c.req.param("visitId"));
    return c.json({ items, total: items.length });
  },
);

// POST /api/patient-images/presign
router.post(
  "/presign",
  requireAuth(),
  requirePermission(PERMISSIONS.READ_PATIENTS),
  zValidator("json", patientImageCreateSchema.pick({
    filename: true,
    content_type: true,
    size: true,
  })),
  async (c) => {
    const jwt = getJwt(c);
    const body = c.req.valid("json");

    const main = await patientImagesService.presignUpload(c.env, jwt.tenant_id, {
      filename: body.filename,
      content_type: body.content_type,
      size: body.size,
      isThumb: false,
    });

    // Also presign thumbnail version (smaller, same content_type)
    const thumb = await patientImagesService.presignUpload(c.env, jwt.tenant_id, {
      filename: `thumb_${body.filename}`,
      content_type: body.content_type,
      size: Math.min(body.size, 500_000), // max 500KB for thumb
      isThumb: true,
    });

    return c.json({
      file_id: main.fileId,
      r2_key: main.r2_key,
      upload_url: main.uploadUrl,
      expires_in: main.expiresIn,
      thumb_key: thumb.r2_key,
      thumb_upload_url: thumb.uploadUrl,
    });
  },
);

// POST /api/patient-images
router.post(
  "/",
  requireAuth(),
  requirePermission(PERMISSIONS.READ_PATIENTS),
  auditLog("create", "patient_image"),
  zValidator("json", patientImageCreateSchema),
  async (c) => {
    const jwt = getJwt(c);
    const body = c.req.valid("json");
    const created = await patientImagesService.create(
      c.env.DB,
      c.env,
      jwt.tenant_id,
      jwt.user_id,
      body,
    );
    return c.json(created, 201);
  },
);

// GET /api/patient-images/:id/url — get presigned download URL
router.get(
  "/:id/url",
  requireAuth(),
  requirePermission(PERMISSIONS.READ_PATIENTS),
  async (c) => {
    const jwt = getJwt(c);
    const img = await patientImagesService.getById(c.env.DB, jwt.tenant_id, c.req.param("id"));
    const url = await filesService.getPresignedUrl(c.env, jwt.tenant_id, img.file_id);
    return c.json({ url });
  },
);

// DELETE /api/patient-images/:id
router.delete(
  "/:id",
  requireAuth(),
  requirePermission(PERMISSIONS.MANAGE_PATIENTS),
  auditLog("delete", "patient_image"),
  async (c) => {
    const jwt = getJwt(c);
    const ok = await patientImagesService.remove(c.env.DB, c.env, jwt.tenant_id, c.req.param("id"));
    if (!ok) return c.json({ error: "not_found" }, 404);
    return c.json({ ok: true });
  },
);

export default router;
