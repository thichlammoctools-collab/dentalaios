import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { avatarFileSchema, avatarPresignSchema } from "@shared/validation";
import { PERMISSIONS } from "@shared/constants";
import type { Env } from "../index";
import { requireAuth, getJwt } from "../middleware/auth";
import { requirePermission } from "../middleware/rbac";
import { auditLog } from "../middleware/audit";
import type { AuthContext } from "../middleware/auth";
import { avatarService, type AvatarSubject } from "../services/avatar.service";

const router = new Hono<{ Bindings: Env; Variables: AuthContext }>();

router.use("*", requireAuth());

function permissionFor(subject: AvatarSubject) {
  return subject === "users" ? PERMISSIONS.MANAGE_USERS : PERMISSIONS.READ_PATIENTS;
}

function writePermissionFor(subject: AvatarSubject) {
  return subject === "users" ? PERMISSIONS.MANAGE_USERS : PERMISSIONS.WRITE_PATIENTS;
}

router.post(
  "/:subject/:id/presign",
  async (c, next) => {
    const subject = c.req.param("subject") as AvatarSubject;
    return requirePermission(writePermissionFor(subject))(c, next);
  },
  zValidator("json", avatarPresignSchema),
  async (c) => {
    const jwt = getJwt(c);
    const subject = c.req.param("subject") as AvatarSubject;
    if (subject !== "users" && subject !== "patients") return c.json({ error: "Invalid profile type", code: "bad_request" }, 400);
    const result = await avatarService.presign(c.env.DB, c.env, jwt.tenant_id, jwt.sub, subject, c.req.param("id"), c.req.valid("json"));
    return c.json({ file_id: result.fileId, upload_url: result.uploadUrl, expires_in: result.expiresIn });
  },
);

router.get(
  "/:subject/:id/url",
  async (c, next) => {
    const subject = c.req.param("subject") as AvatarSubject;
    return requirePermission(permissionFor(subject))(c, next);
  },
  async (c) => {
    const jwt = getJwt(c);
    const subject = c.req.param("subject") as AvatarSubject;
    if (subject !== "users" && subject !== "patients") return c.json({ error: "Invalid profile type", code: "bad_request" }, 400);
    const url = await avatarService.getUrl(c.env.DB, c.env, jwt.tenant_id, subject, c.req.param("id"));
    return c.json({ url });
  },
);

router.put(
  "/:subject/:id",
  async (c, next) => {
    const subject = c.req.param("subject") as AvatarSubject;
    return requirePermission(writePermissionFor(subject))(c, next);
  },
  auditLog("update", "avatar"),
  zValidator("json", avatarFileSchema),
  async (c) => {
    const jwt = getJwt(c);
    const subject = c.req.param("subject") as AvatarSubject;
    if (subject !== "users" && subject !== "patients") return c.json({ error: "Invalid profile type", code: "bad_request" }, 400);
    const updated = await avatarService.setFile(c.env.DB, c.env, jwt.tenant_id, subject, c.req.param("id"), c.req.valid("json").file_id);
    return c.json(updated);
  },
);

router.delete(
  "/:subject/:id",
  async (c, next) => {
    const subject = c.req.param("subject") as AvatarSubject;
    return requirePermission(writePermissionFor(subject))(c, next);
  },
  auditLog("delete", "avatar"),
  async (c) => {
    const jwt = getJwt(c);
    const subject = c.req.param("subject") as AvatarSubject;
    if (subject !== "users" && subject !== "patients") return c.json({ error: "Invalid profile type", code: "bad_request" }, 400);
    const updated = await avatarService.remove(c.env.DB, c.env, jwt.tenant_id, subject, c.req.param("id"));
    return c.json(updated);
  },
);

export default router;
