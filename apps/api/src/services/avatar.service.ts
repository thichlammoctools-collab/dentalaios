import type { D1Database } from "@cloudflare/workers-types";
import type { Env } from "../index";
import { NotFoundError } from "../lib/errors";
import { createPatientsRepository } from "../repositories/patients.repo";
import { createUsersRepository } from "../repositories/users.repo";
import { filesService } from "./files.service";

export type AvatarSubject = "users" | "patients";

const MAX_AVATAR_SIZE = 5 * 1024 * 1024;

export const avatarService = {
  async presign(
    db: D1Database,
    env: Env,
    tenantId: string,
    userId: string,
    subject: AvatarSubject,
    id: string,
    input: { filename: string; content_type: string; size: number },
  ) {
    await this.getSubject(db, tenantId, subject, id);
    if (input.size > MAX_AVATAR_SIZE) {
      throw new Error("Avatar must be 5 MB or smaller");
    }
    return filesService.presign(
      env,
      tenantId,
      { ...input, prefix: `avatars/${subject}/${id}` },
      { db, userId },
    );
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

  async getUrl(
    db: D1Database,
    env: Env,
    tenantId: string,
    subject: AvatarSubject,
    id: string,
  ): Promise<string | null> {
    const entity = await this.getSubject(db, tenantId, subject, id);
    if (!entity.avatar_file_id) return null;
    const file = await filesService.getById(db, tenantId, entity.avatar_file_id);
    if (!file) return null;
    return filesService.getDownloadUrl(env, file.r2_key);
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
