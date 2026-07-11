/**
 * Patient images service — metadata CRUD + presigned upload URLs.
 *
 * Architecture: files are uploaded directly to R2 via presigned URLs.
 * Only metadata is stored in D1.
 */

import type { D1Database } from "@cloudflare/workers-types";
import type { Env } from "../index";
import type { PatientImage } from "@shared/types";
import type { PatientImageCreateInput } from "@shared/validation";
import { createPatientImagesRepository } from "../repositories/patient-images.repo";
import { filesService } from "./files.service";
import { NotFoundError } from "../lib/errors";

const MAX_IMAGE_SIZE = 50 * 1024 * 1024; // 50 MB

export const patientImagesService = {
  async listByPatient(
    db: D1Database,
    tenantId: string,
    patientId: string,
    opts?: Parameters<ReturnType<typeof createPatientImagesRepository>["listByPatient"]>[2],
  ): Promise<PatientImage[]> {
    return createPatientImagesRepository(db).listByPatient(tenantId, patientId, opts);
  },

  async listByVisit(
    db: D1Database,
    tenantId: string,
    visitId: string,
    opts?: Parameters<ReturnType<typeof createPatientImagesRepository>["listByVisit"]>[2],
  ): Promise<PatientImage[]> {
    return createPatientImagesRepository(db).listByVisit(tenantId, visitId, opts);
  },

  async getById(db: D1Database, tenantId: string, id: string): Promise<PatientImage> {
    const img = await createPatientImagesRepository(db).getById(tenantId, id);
    if (!img) throw new NotFoundError("Image not found");
    return img;
  },

  /**
   * Request a presigned upload URL for an image.
   * Client uploads directly to R2, then calls create() with the returned file_id.
   */
  async presignUpload(
    env: Env,
    tenantId: string,
    input: { filename: string; content_type: string; size: number; isThumb?: boolean },
    opts?: { userId?: string },
  ): Promise<{ fileId: string; r2_key: string; uploadUrl: string; expiresIn: number }> {
    if (input.size > MAX_IMAGE_SIZE) {
      throw new Error(`File too large: max ${MAX_IMAGE_SIZE / 1024 / 1024} MB`);
    }
    const prefix = input.isThumb ? "patient-images/thumbs" : "patient-images";
    return filesService.presign(env, tenantId, {
      filename: input.filename,
      content_type: input.content_type,
      size: input.size,
      prefix,
    }, opts?.userId ? { db: env.DB, userId: opts.userId } : undefined);
  },

  async create(
    db: D1Database,
    _env: Env,
    tenantId: string,
    userId: string,
    data: PatientImageCreateInput,
  ): Promise<PatientImage> {
    return createPatientImagesRepository(db).create(tenantId, {
      ...data,
      uploaded_by: userId,
    });
  },

  async remove(db: D1Database, env: Env, tenantId: string, id: string): Promise<boolean> {
    const img = await createPatientImagesRepository(db).getById(tenantId, id);
    if (!img) return false;
    // Look up r2_key from file_objects before deleting (R2 expects r2_key, not file_id UUID)
    const fileObj = await filesService.getById(db, tenantId, img.file_id);
    if (fileObj) {
      try { await env.FILES.delete(fileObj.r2_key); } catch { /* best-effort */ }
    }
    if (img.thumb_key) {
      const thumbObj = await filesService.getById(db, tenantId, img.thumb_key);
      if (thumbObj) {
        try { await env.FILES.delete(thumbObj.r2_key); } catch { /* best-effort */ }
      }
    }
    return createPatientImagesRepository(db).delete(tenantId, id);
  },
};
