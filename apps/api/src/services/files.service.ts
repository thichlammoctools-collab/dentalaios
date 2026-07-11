/**
 * R2 file service — presigned URLs + download streaming.
 *
 * Architecture rule #5: R2 bucket is private.
 * Rule #6: file access is always checked by Worker.
 */

import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type { D1Database, R2Bucket } from "@cloudflare/workers-types";
import type { FileObject } from "@shared/types";
import { newId } from "../lib/ids";
import type { D1Row } from "../repositories/base";

export interface PresignInput {
  filename: string;
  content_type: string;
  size: number;
  /** Optional prefix for R2 key (e.g. "patients/:id") */
  prefix?: string;
}

export interface PresignResult {
  fileId: string;
  r2_key: string;
  uploadUrl: string;
  expiresIn: number;
}

const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20 MB
const PRESIGN_EXPIRES = 600; // 10 minutes

export const filesService = {
  async presign(
    env: { FILES: R2Bucket; R2_ACCOUNT_ID?: string; R2_ACCESS_KEY_ID?: string; R2_SECRET_ACCESS_KEY?: string },
    tenantId: string,
    input: PresignInput,
    opts?: { db?: D1Database; userId?: string },
  ): Promise<PresignResult> {
    if (input.size > MAX_FILE_SIZE) {
      throw new Error(`File too large: max ${MAX_FILE_SIZE / 1024 / 1024} MB`);
    }
    if (!input.filename || !input.content_type) {
      throw new Error("filename and content_type required");
    }

    const fileId = newId();
    // Sanitize filename
    const safe = input.filename.replace(/[^a-zA-Z0-9._-]/g, "_");
    const r2_key = `tenant-${tenantId}/${input.prefix ?? "files"}/${fileId}-${safe}`;

    // If db provided, create file_objects row now (needed by patient_images FK)
    if (opts?.db && opts.userId) {
      await opts.db
        .prepare(
          `INSERT INTO file_objects (id, tenant_id, r2_key, filename, content_type, size, uploaded_by)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(fileId, tenantId, r2_key, input.filename, input.content_type, input.size, opts.userId)
        .run();
    }

    if (!env.R2_ACCESS_KEY_ID || !env.R2_SECRET_ACCESS_KEY || !env.R2_ACCOUNT_ID) {
      throw new Error("R2 S3 credentials not configured (R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY)");
    }

    const client = new S3Client({
      region: "auto",
      endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: env.R2_ACCESS_KEY_ID,
        secretAccessKey: env.R2_SECRET_ACCESS_KEY,
      },
    });

    const command = new PutObjectCommand({
      Bucket: "dentalaios-files",
      Key: r2_key,
      ContentType: input.content_type,
      ContentLength: input.size,
    });

    const uploadUrl = await getSignedUrl(client, command, { expiresIn: PRESIGN_EXPIRES });

    return { fileId, r2_key, uploadUrl, expiresIn: PRESIGN_EXPIRES };
  },

  async getDownloadUrl(
    env: { R2_ACCOUNT_ID?: string; R2_ACCESS_KEY_ID?: string; R2_SECRET_ACCESS_KEY?: string },
    r2_key: string,
  ): Promise<string> {
    if (!env.R2_ACCESS_KEY_ID || !env.R2_SECRET_ACCESS_KEY || !env.R2_ACCOUNT_ID) {
      throw new Error("R2 S3 credentials not configured");
    }
    const client = new S3Client({
      region: "auto",
      endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: env.R2_ACCESS_KEY_ID,
        secretAccessKey: env.R2_SECRET_ACCESS_KEY,
      },
    });
    const command = new GetObjectCommand({ Bucket: "dentalaios-files", Key: r2_key });
    return await getSignedUrl(client, command, { expiresIn: PRESIGN_EXPIRES });
  },

  async recordUpload(
    db: D1Database,
    _env: { FILES: R2Bucket },
    tenantId: string,
    userId: string,
    input: { fileId: string; r2_key: string; filename: string; content_type: string; size: number },
  ): Promise<FileObject> {
    await db
      .prepare(
        `INSERT INTO file_objects
           (id, tenant_id, r2_key, filename, content_type, size, uploaded_by)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        input.fileId,
        tenantId,
        input.r2_key,
        input.filename,
        input.content_type,
        input.size,
        userId,
      )
      .run();

    const row = (await db
      .prepare("SELECT * FROM file_objects WHERE tenant_id = ? AND id = ? LIMIT 1")
      .bind(tenantId, input.fileId)
      .first()) as D1Row | null;
    if (!row) throw new Error("Insert succeeded but read failed");
    return mapFile(row);
  },

  async getById(db: D1Database, tenantId: string, id: string): Promise<FileObject | null> {
    const row = (await db
      .prepare("SELECT * FROM file_objects WHERE tenant_id = ? AND id = ? LIMIT 1")
      .bind(tenantId, id)
      .first()) as D1Row | null;
    return row ? mapFile(row) : null;
  },

  async download(
    env: { FILES: R2Bucket },
    r2_key: string,
  ): Promise<R2ObjectBody | null> {
    return env.FILES.get(r2_key);
  },
};

function mapFile(row: D1Row): FileObject {
  return {
    id: row.id as string,
    tenant_id: row.tenant_id as string,
    r2_key: row.r2_key as string,
    filename: row.filename as string,
    content_type: row.content_type as string,
    size: Number(row.size ?? 0),
    uploaded_by: row.uploaded_by as string,
    created_at: row.created_at as string,
  };
}

// Workers R2ObjectBody type re-export for clarity
type R2ObjectBody = NonNullable<Awaited<ReturnType<R2Bucket["get"]>>>;