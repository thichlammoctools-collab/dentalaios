import type { D1Database } from "@cloudflare/workers-types";
import type { TreatmentService } from "@shared/types";
import type { TreatmentServiceUpsertInput } from "@shared/validation";
import { createTreatmentServicesRepository } from "../repositories/treatment-service-prices.repo";
import { NotFoundError } from "../lib/errors";

export const treatmentServicesService = {
  list(db: D1Database, tenantId: string): Promise<TreatmentService[]> {
    return createTreatmentServicesRepository(db).list(tenantId);
  },

  upsert(db: D1Database, tenantId: string, data: TreatmentServiceUpsertInput): Promise<TreatmentService> {
    return createTreatmentServicesRepository(db).upsert(tenantId, data);
  },

  async remove(db: D1Database, tenantId: string, code: string): Promise<{ mode: "deleted" | "deactivated" }> {
    const repo = createTreatmentServicesRepository(db);
    if (await repo.hasPlanItems(tenantId, code)) {
      if (!(await repo.deactivate(tenantId, code))) throw new NotFoundError("Dịch vụ không tồn tại");
      return { mode: "deactivated" };
    }
    if (!(await repo.delete(tenantId, code))) throw new NotFoundError("Dịch vụ không tồn tại");
    return { mode: "deleted" };
  },
};
