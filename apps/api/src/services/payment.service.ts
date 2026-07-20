import type { D1Database } from "@cloudflare/workers-types";
import type { Payment, PaymentAttachment } from "@shared/types";
import type { PaymentAdjustmentInput, PaymentAttachmentCreateInput, PaymentCreateInput, PaymentUpdateInput } from "@shared/validation";
import { createPaymentsRepository } from "../repositories/payments.repo";
import { createPaymentAttachmentsRepository } from "../repositories/payment-attachments.repo";
import { createTreatmentPlansRepository } from "../repositories/treatment-plans.repo";
import { createTenantSettingsRepository } from "../repositories/tenant-settings.repo";
import { ConflictError, NotFoundError, ValidationError } from "../lib/errors";
import { paymentCodeService } from "./payment-code.service";
import { filesService } from "./files.service";

const DEFAULT_PREFIX = "TT";
const PREFIX_RE = /^[A-Z0-9]+$/;

export const paymentService = {
  list(
    db: D1Database,
    tenantId: string,
    opts: Parameters<ReturnType<typeof createPaymentsRepository>["list"]>[1],
  ): Promise<Payment[]> {
    return createPaymentsRepository(db).list(tenantId, opts);
  },

  async get(db: D1Database, tenantId: string, id: string): Promise<Payment> {
    const payment = await createPaymentsRepository(db).getById(tenantId, id);
    if (!payment) throw new NotFoundError("Payment not found");
    return payment;
  },

  async create(db: D1Database, tenantId: string, data: PaymentCreateInput): Promise<Payment> {
    // Ensure plan exists in tenant
    const plan = await createTreatmentPlansRepository(db).getById(tenantId, data.treatment_plan_id);
    if (!plan) throw new NotFoundError("Treatment plan not found");
    if (plan.patient_id !== data.patient_id) {
      throw new ValidationError("patient_id không khớp với treatment plan");
    }

    // Atomically allocate the next human-readable code for this tenant.
    const { code } = await paymentCodeService.allocate(db, tenantId);

    return createPaymentsRepository(db).create(tenantId, {
      treatment_plan_id: data.treatment_plan_id,
      patient_id: data.patient_id,
      amount: data.amount,
      currency: data.currency,
      method: data.method,
      reference: data.reference,
      notes: data.notes,
      code,
    });
  },

  async update(
    db: D1Database,
    tenantId: string,
    id: string,
    patch: PaymentUpdateInput,
  ): Promise<Payment> {
    const existing = await createPaymentsRepository(db).getById(tenantId, id);
    if (!existing) throw new NotFoundError("Payment not found");
    if (existing.status === "confirmed") {
      throw new ConflictError("Không thể sửa giao dịch đã xác nhận. Hãy tạo điều chỉnh.");
    }
    const updated = await createPaymentsRepository(db).updateEditable(
      tenantId,
      id,
      patch,
    );
    if (!updated) throw new NotFoundError("Payment not found");
    return updated;
  },

  async confirm(db: D1Database, tenantId: string, id: string): Promise<Payment> {
    const existing = await createPaymentsRepository(db).getById(tenantId, id);
    if (!existing) throw new NotFoundError("Payment not found");
    if (existing.status !== "pending") {
      throw new ConflictError("Chỉ có thể xác nhận giao dịch đang chờ xác nhận");
    }
    const updated = await createPaymentsRepository(db).updateStatus(tenantId, id, "confirmed");
    if (!updated) throw new NotFoundError("Payment not found");
    return updated;
  },

  async markFailed(db: D1Database, tenantId: string, id: string): Promise<Payment> {
    const existing = await createPaymentsRepository(db).getById(tenantId, id);
    if (!existing) throw new NotFoundError("Payment not found");
    if (existing.status !== "pending") {
      throw new ConflictError("Chỉ có thể đánh thất bại giao dịch đang chờ xác nhận");
    }
    const updated = await createPaymentsRepository(db).updateStatus(tenantId, id, "failed");
    if (!updated) throw new NotFoundError("Payment not found");
    return updated;
  },

  async adjust(
    db: D1Database,
    tenantId: string,
    id: string,
    data: PaymentAdjustmentInput,
  ): Promise<Payment> {
    const original = await createPaymentsRepository(db).getById(tenantId, id);
    if (!original) throw new NotFoundError("Payment not found");
    if (original.status !== "confirmed") {
      throw new ConflictError("Chỉ có thể điều chỉnh giao dịch đã xác nhận");
    }
    if (original.original_payment_id) {
      throw new ConflictError("Không thể điều chỉnh một giao dịch điều chỉnh");
    }

    const { code } = await paymentCodeService.allocate(db, tenantId);
    return createPaymentsRepository(db).createAdjustment(tenantId, {
      treatment_plan_id: original.treatment_plan_id,
      patient_id: original.patient_id,
      amount: data.amount,
      currency: original.currency,
      method: original.method,
      reference: original.reference,
      notes: data.notes,
      code,
      original_payment_id: original.id,
      adjustment_reason: data.reason,
    });
  },

  async listAttachments(db: D1Database, tenantId: string, paymentId: string): Promise<PaymentAttachment[]> {
    await this.get(db, tenantId, paymentId);
    return createPaymentAttachmentsRepository(db).list(tenantId, paymentId);
  },

  async addAttachment(
    db: D1Database,
    tenantId: string,
    paymentId: string,
    data: PaymentAttachmentCreateInput,
    userId: string,
  ): Promise<PaymentAttachment> {
    await this.get(db, tenantId, paymentId);
    const file = await filesService.getById(db, tenantId, data.file_id);
    if (!file) throw new ValidationError("Tệp minh chứng không tồn tại");
    if (!file.content_type.startsWith("image/") && file.content_type !== "application/pdf") {
      throw new ValidationError("Chỉ hỗ trợ ảnh hoặc tệp PDF làm minh chứng");
    }
    return createPaymentAttachmentsRepository(db).create(tenantId, paymentId, data, userId);
  },

  async getPaymentPrefix(db: D1Database, tenantId: string): Promise<{ prefix: string }> {
    const raw = await createTenantSettingsRepository(db).get(tenantId, "payment_code_prefix");
    return { prefix: raw && PREFIX_RE.test(raw) ? raw : DEFAULT_PREFIX };
  },

  async setPaymentPrefix(
    db: D1Database,
    tenantId: string,
    prefix: string,
  ): Promise<{ prefix: string }> {
    await createTenantSettingsRepository(db).set(tenantId, "payment_code_prefix", prefix);
    return { prefix };
  },
};
