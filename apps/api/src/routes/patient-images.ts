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

const imageUploadQuerySchema = z.object({
  patient_id: z.string().min(1),
  visit_id: z.string().min(1).optional(),
  image_type: z.enum(["cbct", "scan_3d", "dicom", "photo_before", "photo_after", "xray", "intraoral", "other"]),
  description: z.string().max(500).optional(),
  original_size: z.coerce.number().int().positive(),
});

// POST /api/patient-images/file — upload directly through the Worker R2 binding
router.post(
  "/file",
  requireAuth(),
  requirePermission(PERMISSIONS.READ_PATIENTS),
  auditLog("create", "patient_image"),
  zValidator("query", imageUploadQuerySchema),
  async (c) => {
    const jwt = getJwt(c);
    const input = c.req.valid("query");
    const contentType = c.req.header("content-type")?.split(";", 1)[0] ?? "application/octet-stream";
    const filename = c.req.header("x-image-filename") ?? "image";
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
      headers: {
        "Content-Type": fileObj.content_type,
        "Content-Length": String(fileObj.size),
        "Cache-Control": "private, max-age=300",
        ETag: object.httpEtag,
      },
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
