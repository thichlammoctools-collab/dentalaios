import type { D1Database } from "@cloudflare/workers-types";
import type { Payment } from "@shared/types";
import type { PaymentCreateInput } from "@shared/validation";
import { createPaymentsRepository } from "../repositories/payments.repo";
import { createTreatmentPlansRepository } from "../repositories/treatment-plans.repo";
import { NotFoundError } from "../lib/errors";

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
    return createPaymentsRepository(db).create(tenantId, {
      treatment_plan_id: data.treatment_plan_id,
      patient_id: data.patient_id,
      amount: data.amount,
      currency: data.currency,
      method: data.method,
      reference: data.reference,
      notes: data.notes,
    });
  },

  async confirm(db: D1Database, tenantId: string, id: string): Promise<Payment> {
    const updated = await createPaymentsRepository(db).updateStatus(tenantId, id, "confirmed");
    if (!updated) throw new NotFoundError("Payment not found");
    return updated;
  },
};