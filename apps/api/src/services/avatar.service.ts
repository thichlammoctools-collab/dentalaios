import type { D1Database } from "@cloudflare/workers-types";
import type { Env } from "../index";
import { NotFoundError } from "../lib/errors";
import { newId } from "../lib/ids";
import { createPatientsRepository } from "../repositories/patients.repo";
import { createUsersRepository } from "../repositories/users.repo";
import { filesService } from "./files.service";

export type AvatarSubject = "users" | "patients";

const MAX_AVATAR_SIZE = 5 * 1024 * 1024;
const ALLOWED_CONTENT_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

export const avatarService = {
  async upload(
    db: D1Database,
    env: Env,
    tenantId: string,
    userId: string,
    subject: AvatarSubject,
    id: string,
    input: { filename: string; content_type: string; body: ArrayBuffer },
  ) {
    const entity = await this.getSubject(db, tenantId, subject, id);
    if (!ALLOWED_CONTENT_TYPES.has(input.content_type)) {
      throw new Error("Unsupported avatar format");
    }
    if (input.body.byteLength > MAX_AVATAR_SIZE) {
      throw new Error("Avatar must be 5 MB or smaller");
    }
    const fileId = newId();
    const safeFilename = input.filename.replace(/[^a-zA-Z0-9._-]/g, "_") || "avatar.jpg";
    const r2Key = `tenant-${tenantId}/avatars/${subject}/${id}/${fileId}-${safeFilename}`;

    await env.FILES.put(r2Key, input.body, {
      httpMetadata: { contentType: input.content_type },
    });

    try {
      await db
        .prepare(
          `INSERT INTO file_objects (id, tenant_id, r2_key, filename, content_type, size, uploaded_by)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(fileId, tenantId, r2Key, input.filename, input.content_type, input.body.byteLength, userId)
        .run();

      const previousFileId = entity.avatar_file_id;
      const updated = subject === "users"
        ? await createUsersRepository(db).update(tenantId, id, { avatar_file_id: fileId })
        : await createPatientsRepository(db).update(tenantId, id, { avatar_file_id: fileId });
      if (!updated) throw new NotFoundError("Profile not found");
      if (previousFileId && previousFileId !== fileId) {
        await filesService.remove(db, env, tenantId, previousFileId);
      }
      return updated;
    } catch (error) {
      await env.FILES.delete(r2Key);
      throw error;
    }
  },

  async setFile(
    db: D1Database,
    env: Env,
    tenantId: string,
    subject: AvatarSubject,
    id: string,
    fileId: string,
  ) {
    const entity = await this.getSubject(db, tenantId, subject, id);
    const file = await filesService.getById(db, tenantId, fileId);
    if (!file || !file.r2_key.startsWith(`tenant-${tenantId}/avatars/${subject}/${id}/`)) {
      throw new NotFoundError("Avatar file not found");
    }

    const previousFileId = entity.avatar_file_id;
    const updated = subject === "users"
      ? await createUsersRepository(db).update(tenantId, id, { avatar_file_id: fileId })
      : await createPatientsRepository(db).update(tenantId, id, { avatar_file_id: fileId });

    if (!updated) throw new NotFoundError("Profile not found");
    if (previousFileId && previousFileId !== fileId) {
      await filesService.remove(db, env, tenantId, previousFileId);
    }
    return updated;
  },

  async getFile(
    db: D1Database,
    env: Env,
    tenantId: string,
    subject: AvatarSubject,
    id: string,
  ) {
    const entity = await this.getSubject(db, tenantId, subject, id);
    if (!entity.avatar_file_id) return null;
    const file = await filesService.getById(db, tenantId, entity.avatar_file_id);
    if (!file) return null;
    const object = await filesService.download(env, file.r2_key);
    if (!object) return null;
    return { object, contentType: file.content_type, size: file.size };
  },

  async remove(
    db: D1Database,
    env: Env,
    tenantId: string,
    subject: AvatarSubject,
    id: string,
  ) {
    const entity = await this.getSubject(db, tenantId, subject, id);
    if (!entity.avatar_file_id) return entity;

    const updated = subject === "users"
      ? await createUsersRepository(db).update(tenantId, id, { avatar_file_id: null })
      : await createPatientsRepository(db).update(tenantId, id, { avatar_file_id: null });

    if (!updated) throw new NotFoundError("Profile not found");
    await filesService.remove(db, env, tenantId, entity.avatar_file_id);
    return updated;
  },

  async getSubject(db: D1Database, tenantId: string, subject: AvatarSubject, id: string) {
    const entity = subject === "users"
      ? await createUsersRepository(db).getById(tenantId, id)
      : await createPatientsRepository(db).getById(tenantId, id);
    if (!entity) throw new NotFoundError("Profile not found");
    return entity;
  },
};
