import type { D1Database } from "@cloudflare/workers-types";
import type { TreatmentService } from "@shared/types";
import type { TreatmentServiceUpsertInput } from "@shared/validation";
import { createTreatmentServicesRepository } from "../repositories/treatment-service-prices.repo";
import { NotFoundError, ValidationError } from "../lib/errors";
import { createProcedureCatalogRepository } from "../repositories/procedure-catalog.repo";

export const treatmentServicesService = {
  list(db: D1Database, tenantId: string): Promise<TreatmentService[]> {
    return createTreatmentServicesRepository(db).list(tenantId);
  },

  async upsert(db: D1Database, tenantId: string, data: TreatmentServiceUpsertInput): Promise<TreatmentService> {
    const [procedure, existing] = await Promise.all([
      createProcedureCatalogRepository(db).get(data.procedure),
      createTreatmentServicesRepository(db).getByCode(tenantId, data.code),
    ]);
    if (!procedure || (!procedure.is_active && existing?.procedure !== data.procedure)) {
      throw new ValidationError("Thủ thuật không tồn tại hoặc đã ngừng áp dụng");
    }
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
