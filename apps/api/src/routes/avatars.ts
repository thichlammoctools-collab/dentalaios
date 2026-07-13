import { Hono } from "hono";
import { PERMISSIONS } from "@shared/constants";
import type { Env } from "../index";
import { requireAuth, getJwt } from "../middleware/auth";
import { requirePermission } from "../middleware/rbac";
import { auditLog } from "../middleware/audit";
import type { AuthContext } from "../middleware/auth";
import { avatarService, type AvatarSubject } from "../services/avatar.service";

const router = new Hono<{ Bindings: Env; Variables: AuthContext }>();

router.use("*", requireAuth());

function isAvatarSubject(subject: string): subject is AvatarSubject {
  return subject === "users" || subject === "patients";
}

function permissionFor(subject: AvatarSubject) {
  return subject === "users" ? PERMISSIONS.MANAGE_USERS : PERMISSIONS.READ_PATIENTS;
}

function writePermissionFor(subject: AvatarSubject) {
  return subject === "users" ? PERMISSIONS.MANAGE_USERS : PERMISSIONS.WRITE_PATIENTS;
}

router.post(
  "/:subject/:id/file",
  async (c, next) => {
    const subject = c.req.param("subject");
    if (!isAvatarSubject(subject)) return c.json({ error: "Invalid profile type", code: "bad_request" }, 400);
    return requirePermission(writePermissionFor(subject))(c, next);
  },
  auditLog("update", "avatar"),
  async (c) => {
    const jwt = getJwt(c);
    const subject = c.req.param("subject") as AvatarSubject;
    const contentType = c.req.header("content-type")?.split(";", 1)[0] ?? "";
    const filename = c.req.header("x-avatar-filename") ?? "avatar.jpg";
    const updated = await avatarService.upload(c.env.DB, c.env, jwt.tenant_id, jwt.sub, subject, c.req.param("id"), {
      filename,
      content_type: contentType,
      body: await c.req.raw.arrayBuffer(),
    });
    return c.json(updated);
  },
);

router.get(
  "/:subject/:id/file",
  async (c, next) => {
    const subject = c.req.param("subject");
    if (!isAvatarSubject(subject)) return c.json({ error: "Invalid profile type", code: "bad_request" }, 400);
    return requirePermission(permissionFor(subject))(c, next);
  },
  async (c) => {
    const jwt = getJwt(c);
    const subject = c.req.param("subject") as AvatarSubject;
    const file = await avatarService.getFile(c.env.DB, c.env, jwt.tenant_id, subject, c.req.param("id"));
    if (!file) return c.json({ error: "Avatar not found", code: "not_found" }, 404);
    return new Response(file.object.body, {
      headers: {
        "Content-Type": file.contentType,
        "Content-Length": String(file.size),
        "Cache-Control": "private, max-age=300",
        ETag: file.object.httpEtag,
      },
    });
  },
);

router.delete(
  "/:subject/:id",
  async (c, next) => {
    const subject = c.req.param("subject");
    if (!isAvatarSubject(subject)) return c.json({ error: "Invalid profile type", code: "bad_request" }, 400);
    return requirePermission(writePermissionFor(subject))(c, next);
  },
  auditLog("delete", "avatar"),
  async (c) => {
    const jwt = getJwt(c);
    const subject = c.req.param("subject") as AvatarSubject;
    const updated = await avatarService.remove(c.env.DB, c.env, jwt.tenant_id, subject, c.req.param("id"));
    return c.json(updated);
  },
);

export default router;
