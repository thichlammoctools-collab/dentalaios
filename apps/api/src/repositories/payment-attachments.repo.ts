import type { D1Database } from "@cloudflare/workers-types";
import type { PaymentAttachment, PaymentAttachmentKind } from "@shared/types";
import { newId } from "../lib/ids";
import type { D1Row } from "./base";

export function createPaymentAttachmentsRepository(db: D1Database) {
  return {
    async list(tenantId: string, paymentId: string): Promise<PaymentAttachment[]> {
      const result = await db.prepare(
        `SELECT pa.*, f.id AS file_object_id, f.tenant_id AS file_tenant_id, f.r2_key,
                f.filename, f.content_type, f.size, f.uploaded_by, f.created_at AS file_created_at
         FROM payment_attachments pa
         JOIN file_objects f ON f.id = pa.file_id AND f.tenant_id = pa.tenant_id
         WHERE pa.tenant_id = ? AND pa.payment_id = ?
         ORDER BY pa.created_at ASC`,
      ).bind(tenantId, paymentId).all();
      return (result.results as D1Row[]).map(mapAttachment);
    },

    async create(
      tenantId: string,
      paymentId: string,
      data: { file_id: string; kind: PaymentAttachmentKind; description?: string },
      userId: string,
    ): Promise<PaymentAttachment> {
      const id = newId();
      await db.prepare(
        `INSERT INTO payment_attachments (id, tenant_id, payment_id, file_id, kind, description, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ).bind(id, tenantId, paymentId, data.file_id, data.kind, data.description ?? null, userId).run();
      const attachments = await this.list(tenantId, paymentId);
      const attachment = attachments.find((item) => item.id === id);
      if (!attachment) throw new Error("Insert succeeded but read failed");
      return attachment;
    },
  };
}

function mapAttachment(row: D1Row): PaymentAttachment {
  return {
    id: row.id as string,
    tenant_id: row.tenant_id as string,
    payment_id: row.payment_id as string,
    file_id: row.file_id as string,
    kind: row.kind as PaymentAttachmentKind,
    description: (row.description as string | null) ?? undefined,
    created_by: row.created_by as string,
    created_at: row.created_at as string,
    file: {
      id: row.file_object_id as string,
      tenant_id: row.file_tenant_id as string,
      r2_key: row.r2_key as string,
      filename: row.filename as string,
      content_type: row.content_type as string,
      size: Number(row.size ?? 0),
      uploaded_by: row.uploaded_by as string,
      created_at: row.file_created_at as string,
    },
  };
}
