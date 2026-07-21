import type { D1Database } from "@cloudflare/workers-types";
import type { Payment, PaymentAttachment, PaymentableTreatmentPlanItem } from "@shared/types";
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
    if (plan.status === "draft" || plan.status === "cancelled") {
      throw new ValidationError("Kế hoạch điều trị chưa sẵn sàng để thanh toán");
    }

    const allocationIds = data.allocations.map((allocation) => allocation.treatment_plan_item_id);
    if (new Set(allocationIds).size !== allocationIds.length) {
      throw new ValidationError("Mỗi dịch vụ chỉ được chọn một lần");
    }
    const selectedItems = await this.listPaymentableItems(db, tenantId, plan.id);
    const itemById = new Map(selectedItems.map((item) => [item.id, item]));
    const allocationTotal = data.allocations.reduce((total, allocation) => total + allocation.amount, 0);
    if (allocationTotal !== data.amount) {
      throw new ValidationError("Tổng phân bổ phải khớp số tiền thanh toán");
    }
    for (const allocation of data.allocations) {
      const item = itemById.get(allocation.treatment_plan_item_id);
      if (!item) throw new ValidationError("Dịch vụ không thuộc kế hoạch điều trị");
      const discountAmount = allocation.discount_amount ?? 0;
      if (discountAmount > 0 && !allocation.discount_reason?.trim()) {
        throw new ValidationError("Cần ghi rõ lý do giảm giá cho từng dịch vụ");
      }
      if (allocation.amount + discountAmount > item.outstanding_amount) {
        throw new ValidationError("Tiền thu và giảm giá vượt số tiền chưa thanh toán của dịch vụ");
      }
    }

    // Atomically allocate the next human-readable code for this tenant.
    const { code } = await paymentCodeService.allocate(db, tenantId);

    return createPaymentsRepository(db).createWithAllocations(tenantId, {
      treatment_plan_id: data.treatment_plan_id,
      patient_id: data.patient_id,
      amount: data.amount,
      currency: data.currency,
      method: data.method,
      reference: data.reference,
      notes: data.notes,
      code,
    }, data.allocations);
  },

  async listPaymentableItems(
    db: D1Database,
    tenantId: string,
    planId: string,
  ): Promise<PaymentableTreatmentPlanItem[]> {
    const plan = await createTreatmentPlansRepository(db).getById(tenantId, planId);
    if (!plan) throw new NotFoundError("Treatment plan not found");
    const result = await db.prepare(
      `SELECT treatment_plan_items.*,
               COALESCE(SUM(CASE WHEN payments.status = 'confirmed' THEN payment_item_allocations.amount ELSE 0 END), 0) AS paid_amount,
               COALESCE(SUM(CASE WHEN payments.status = 'pending' THEN payment_item_allocations.amount ELSE 0 END), 0) AS pending_amount,
               COALESCE(SUM(CASE WHEN payments.status IN ('confirmed', 'pending') THEN payment_item_allocations.discount_amount ELSE 0 END), 0) AS discount_amount
         FROM treatment_plan_items
         LEFT JOIN payment_item_allocations
           ON payment_item_allocations.tenant_id = treatment_plan_items.tenant_id
          AND payment_item_allocations.treatment_plan_item_id = treatment_plan_items.id
         LEFT JOIN payments
           ON payments.tenant_id = payment_item_allocations.tenant_id
          AND payments.id = payment_item_allocations.payment_id
        WHERE treatment_plan_items.tenant_id = ?
          AND treatment_plan_items.treatment_plan_id = ?
        GROUP BY treatment_plan_items.id
        ORDER BY treatment_plan_items.tooth_number ASC`,
    ).bind(tenantId, planId).all<{ [key: string]: unknown }>();
    return result.results.map((row) => {
      const paidAmount = Number(row.paid_amount ?? 0);
      const pendingAmount = Number(row.pending_amount ?? 0);
      const discountAmount = Number(row.discount_amount ?? 0);
      const unitCost = Number(row.unit_cost ?? 0);
      return {
        id: row.id as string,
        tenant_id: row.tenant_id as string,
        treatment_plan_id: row.treatment_plan_id as string,
        tooth_number: (row.tooth_number as number | null) ?? undefined,
        procedure: row.procedure as string,
        description: row.description as string,
        unit_cost: unitCost,
        price_includes_vat: true,
        status: row.status as PaymentableTreatmentPlanItem["status"],
        created_at: row.created_at as string,
        paid_amount: paidAmount,
        pending_amount: pendingAmount,
        outstanding_amount: Math.max(0, unitCost - paidAmount - pendingAmount - discountAmount),
      };
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
