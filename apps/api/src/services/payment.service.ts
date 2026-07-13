import type { D1Database } from "@cloudflare/workers-types";
import type { Payment } from "@shared/types";
import type { PaymentCreateInput, PaymentUpdateInput } from "@shared/validation";
import { createPaymentsRepository } from "../repositories/payments.repo";
import { createTreatmentPlansRepository } from "../repositories/treatment-plans.repo";
import { createTenantSettingsRepository } from "../repositories/tenant-settings.repo";
import { NotFoundError } from "../lib/errors";
import { paymentCodeService } from "./payment-code.service";

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
    const updated = await createPaymentsRepository(db).updateEditable(
      tenantId,
      id,
      patch,
    );
    if (!updated) throw new NotFoundError("Payment not found");
    return updated;
  },

  async confirm(db: D1Database, tenantId: string, id: string): Promise<Payment> {
    const updated = await createPaymentsRepository(db).updateStatus(tenantId, id, "confirmed");
    if (!updated) throw new NotFoundError("Payment not found");
    return updated;
  },

  async markFailed(db: D1Database, tenantId: string, id: string): Promise<Payment> {
    const updated = await createPaymentsRepository(db).updateStatus(tenantId, id, "failed");
    if (!updated) throw new NotFoundError("Payment not found");
    return updated;
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