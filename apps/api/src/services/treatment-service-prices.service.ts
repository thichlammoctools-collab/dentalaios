import type { D1Database } from "@cloudflare/workers-types";
import type { TreatmentService } from "@shared/types";
import type { TreatmentServiceUpsertInput } from "@shared/validation";
import { createTreatmentServicesRepository } from "../repositories/treatment-service-prices.repo";

export const treatmentServicesService = {
  list(db: D1Database, tenantId: string): Promise<TreatmentService[]> {
    return createTreatmentServicesRepository(db).list(tenantId);
  },

  upsert(db: D1Database, tenantId: string, data: TreatmentServiceUpsertInput): Promise<TreatmentService> {
    return createTreatmentServicesRepository(db).upsert(tenantId, data);
  },
};
