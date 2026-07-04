import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { PERMISSIONS } from "@shared/constants";
import type { Env } from "../index";
import { requireAuth, getJwt } from "../middleware/auth";
import { requirePermission } from "../middleware/rbac";
import { auditLog } from "../middleware/audit";
import type { AuthContext } from "../middleware/auth";
import { filesService } from "../services/files.service";

const router = new Hono<{ Bindings: Env; Variables: AuthContext }>();

router.use("*", requireAuth());

const presignSchema = z.object({
  filename: z.string().min(1).max(200).refine((s) => s.trim().length > 0, {
    message: "filename không được trống",
  }),
  content_type: z.string().min(1).max(100),
  size: z.number().int().positive().max(20 * 1024 * 1024),
  // Whitelist: only these prefixes allowed (prevents R2 key path traversal)
  prefix: z
    .enum(["patients", "visits", "treatment-plans", "files"])
    .optional(),
});

// POST /api/files/presign — get presigned PUT URL
router.post(
  "/presign",
  requirePermission(PERMISSIONS.WRITE_PATIENTS),
  zValidator("json", presignSchema),
  async (c) => {
    const jwt = getJwt(c);
    const input = c.req.valid("json");
    const result = await filesService.presign(c.env, jwt.tenant_id, input);
    return c.json(result, 200);
  },
);

const recordSchema = z.object({
  fileId: z.string().min(1),
  r2_key: z.string().min(1),
  filename: z.string().min(1),
  content_type: z.string().min(1),
  size: z.number().int().positive(),
});

// POST /api/files — record uploaded file metadata
router.post(
  "/",
  requirePermission(PERMISSIONS.WRITE_PATIENTS),
  auditLog("upload", "file"),
  zValidator("json", recordSchema),
  async (c) => {
    const jwt = getJwt(c);
    const input = c.req.valid("json");
    const file = await filesService.recordUpload(
      c.env.DB,
      c.env,
      jwt.tenant_id,
      jwt.sub,
      input,
    );
    return c.json(file, 201);
  },
);

// GET /api/files/:id — proxy R2 download (architecture rule #6: Worker checks permission)
router.get(
  "/:id",
  requirePermission(PERMISSIONS.READ_PATIENTS),
  async (c) => {
    const jwt = getJwt(c);
    const file = await filesService.getById(c.env.DB, jwt.tenant_id, c.req.param("id"));
    if (!file) return c.json({ error: "File not found", code: "not_found" }, 404);
    const obj = await filesService.download(c.env, file.r2_key);
    if (!obj) return c.json({ error: "File missing in storage", code: "not_found" }, 404);
    return new Response(obj.body, {
      status: 200,
      headers: {
        "Content-Type": file.content_type,
        "Content-Length": String(file.size),
        "Content-Disposition": `inline; filename="${file.filename}"`,
        "Cache-Control": "private, max-age=300",
        ETag: obj.httpEtag,
      },
    });
  },
);

export default router;