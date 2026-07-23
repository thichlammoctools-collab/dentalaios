/**
 * Patient images routes:
 *   GET  /api/patient-images?patient_id=xxx          — list by patient
 *   GET  /api/patient-images/visit/:visitId          — list by visit
 *   POST /api/patient-images/file                    — upload image through Worker
 *   GET  /api/patient-images/:id/file                — stream an image through Worker
 *   DELETE /api/patient-images/:id                    — delete image + R2 file
 */

import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { PERMISSIONS } from "@shared/constants";
import {
  patientImagePresignSchema,
  patientImageCreateSchema,
  imageAnnotationCreateSchema,
  imageAnnotationVersionCreateSchema,
} from "@shared/validation";
import type { Env } from "../index";
import { requireAuth, getJwt } from "../middleware/auth";
import { requirePermission } from "../middleware/rbac";
import { auditLog } from "../middleware/audit";
import type { AuthContext } from "../middleware/auth";
import { patientImagesService } from "../services/patient-images.service";
import { filesService } from "../services/files.service";
import { buildPrivateFileHeaders } from "../lib/file-response";
import { imageAnnotationsService } from "../services/image-annotations.service";

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

const imageUploadQuerySchema = z.object({
  patient_id: z.string().min(1),
  visit_id: z.string().min(1).optional(),
  image_type: z.enum(["cbct", "scan_3d", "dicom", "photo_before", "photo_after", "xray", "intraoral", "other"]),
  description: z.string().max(500).optional(),
  original_size: z.coerce.number().int().positive(),
});

function decodeFilename(value: string | undefined, fallback: string): string {
  if (!value) return fallback;
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

// POST /api/patient-images/presign — get presigned upload URLs (main + thumb)
router.post(
  "/presign",
  requireAuth(),
  requirePermission(PERMISSIONS.WRITE_PATIENTS),
  zValidator(
    "json",
    patientImagePresignSchema.extend({
      // Thumb is generated client-side at fixed dimensions — small upper bound.
      thumb_size: z.number().int().positive().max(2 * 1024 * 1024).optional(),
    }),
  ),
  async (c) => {
    const jwt = getJwt(c);
    const input = c.req.valid("json");
    const thumbSize = input.thumb_size ?? 100 * 1024;
    const [main, thumb] = await Promise.all([
      patientImagesService.presignUpload(
        c.env,
        jwt.tenant_id,
        { filename: input.filename, content_type: input.content_type, size: input.size, isThumb: false },
        { userId: jwt.sub },
      ),
      patientImagesService.presignUpload(
        c.env,
        jwt.tenant_id,
        { filename: `thumb-${input.filename}`, content_type: input.content_type, size: thumbSize, isThumb: true },
        { userId: jwt.sub },
      ),
    ]);
    return c.json({
      file_id: main.fileId,
      r2_key: main.r2_key,
      upload_url: main.uploadUrl,
      expires_in: main.expiresIn,
      thumb_key: thumb.fileId,
      thumb_upload_url: thumb.uploadUrl,
    });
  },
);

router.get(
  "/:id/annotations",
  requireAuth(),
  requirePermission(PERMISSIONS.READ_PATIENTS),
  async (c) => {
    const jwt = getJwt(c);
    const items = await imageAnnotationsService.listAnnotations(c.env.DB, jwt.tenant_id, c.req.param("id"));
    return c.json({ items, total: items.length });
  },
);

router.post(
  "/:id/annotations",
  requireAuth(),
  requirePermission(PERMISSIONS.WRITE_FINDINGS),
  auditLog("create", "image_annotation"),
  zValidator("json", imageAnnotationCreateSchema),
  async (c) => {
    const jwt = getJwt(c);
    return c.json(await imageAnnotationsService.createAnnotation(c.env.DB, jwt.tenant_id, c.req.param("id"), jwt.sub, c.req.valid("json")), 201);
  },
);

router.post(
  "/:id/annotations/:annotationId/versions",
  requireAuth(),
  requirePermission(PERMISSIONS.WRITE_FINDINGS),
  auditLog("update", "image_annotation"),
  zValidator("json", imageAnnotationVersionCreateSchema),
  async (c) => {
    const jwt = getJwt(c);
    return c.json(await imageAnnotationsService.createVersion(c.env.DB, jwt.tenant_id, c.req.param("id"), c.req.param("annotationId"), jwt.sub, c.req.valid("json")));
  },
);

router.get(
  "/:id/diagnosis-options",
  requireAuth(),
  requirePermission(PERMISSIONS.READ_PATIENTS),
  async (c) => {
    const jwt = getJwt(c);
    const items = await imageAnnotationsService.listDiagnosisOptions(c.env.DB, jwt.tenant_id, c.req.param("id"));
    return c.json({ items, total: items.length });
  },
);

router.get(
  "/:id/evidence",
  requireAuth(),
  requirePermission(PERMISSIONS.READ_PATIENTS),
  async (c) => {
    const jwt = getJwt(c);
    const items = await imageAnnotationsService.listImageEvidence(c.env.DB, jwt.tenant_id, c.req.param("id"));
    return c.json({ items, total: items.length });
  },
);

// POST /api/patient-images — record metadata after client uploaded to R2
router.post(
  "/",
  requireAuth(),
  requirePermission(PERMISSIONS.WRITE_PATIENTS),
  auditLog("create", "patient_image"),
  zValidator("json", patientImageCreateSchema),
  async (c) => {
    const jwt = getJwt(c);
    const input = c.req.valid("json");
    const created = await patientImagesService.create(c.env.DB, c.env, jwt.tenant_id, jwt.sub, input);
    return c.json(created, 201);
  },
);

// POST /api/patient-images/file — upload directly through the Worker R2 binding
router.post(
  "/file",
  requireAuth(),
  requirePermission(PERMISSIONS.WRITE_PATIENTS),
  auditLog("create", "patient_image"),
  zValidator("query", imageUploadQuerySchema),
  async (c) => {
    const jwt = getJwt(c);
    const input = c.req.valid("query");
    const contentType = c.req.header("content-type")?.split(";", 1)[0] ?? "application/octet-stream";
    const filename = decodeFilename(c.req.header("x-image-filename"), "image");
    const created = await patientImagesService.upload(c.env.DB, c.env, jwt.tenant_id, jwt.sub, {
      ...input,
      filename,
      content_type: contentType,
      body: await c.req.raw.arrayBuffer(),
    });
    return c.json(created, 201);
  },
);

// GET /api/patient-images/:id/file — stream private R2 object through Worker
router.get(
  "/:id/file",
  requireAuth(),
  requirePermission(PERMISSIONS.READ_PATIENTS),
  async (c) => {
    const jwt = getJwt(c);
    const img = await patientImagesService.getById(c.env.DB, jwt.tenant_id, c.req.param("id"));
    const fileObj = await filesService.getById(c.env.DB, jwt.tenant_id, img.file_id);
    if (!fileObj) return c.json({ error: "File not found", code: "not_found" }, 404);
    const object = await filesService.download(c.env, fileObj.r2_key);
    if (!object) return c.json({ error: "File missing in storage", code: "not_found" }, 404);
    return new Response(object.body, {
      headers: buildPrivateFileHeaders(fileObj.filename, fileObj.content_type, object.size, object.httpEtag),
    });
  },
);

// DELETE /api/patient-images/:id
router.delete(
  "/:id",
  requireAuth(),
  requirePermission(PERMISSIONS.WRITE_PATIENTS),
  auditLog("delete", "patient_image"),
  async (c) => {
    const jwt = getJwt(c);
    const ok = await patientImagesService.remove(c.env.DB, c.env, jwt.tenant_id, c.req.param("id"));
    if (!ok) return c.json({ error: "not_found" }, 404);
    return c.json({ ok: true });
  },
);

export default router;
