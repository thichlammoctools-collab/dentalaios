import type { D1Database } from "@cloudflare/workers-types";
import type { Visit, ClinicalFinding } from "@shared/types";
import type { VisitCreateInput, VisitUpdateInput, FindingCreateInput, FindingUpdateInput } from "@shared/validation";
import { createVisitsRepository } from "../repositories/visits.repo";
import { createFindingsRepository } from "../repositories/findings.repo";
import { NotFoundError } from "../lib/errors";

export const visitService = {
  list(
    db: D1Database,
    tenantId: string,
    opts: Parameters<ReturnType<typeof createVisitsRepository>["list"]>[1],
  ): Promise<Visit[]> {
    return createVisitsRepository(db).list(tenantId, opts);
  },

  async get(db: D1Database, tenantId: string, id: string): Promise<Visit> {
    const visit = await createVisitsRepository(db).getById(tenantId, id);
    if (!visit) throw new NotFoundError("Visit not found");
    return visit;
  },

  async create(db: D1Database, tenantId: string, data: VisitCreateInput): Promise<Visit> {
    return createVisitsRepository(db).create(tenantId, {
      patient_id: data.patient_id,
      branch_id: data.branch_id,
      clinician_id: data.clinician_id,
      date: data.date ?? new Date().toISOString(),
      notes: data.notes,
    });
  },

  async update(db: D1Database, tenantId: string, id: string, data: VisitUpdateInput): Promise<Visit> {
    const updated = await createVisitsRepository(db).update(tenantId, id, data);
    if (!updated) throw new NotFoundError("Visit not found");
    return updated;
  },

  listFindings(db: D1Database, tenantId: string, visitId: string): Promise<ClinicalFinding[]> {
    return createFindingsRepository(db).listByVisit(tenantId, visitId);
  },

  async addFinding(
    db: D1Database,
    tenantId: string,
    visitId: string,
    data: FindingCreateInput,
  ): Promise<ClinicalFinding> {
    const visit = await createVisitsRepository(db).getById(tenantId, visitId);
    if (!visit) throw new NotFoundError("Visit not found");
    return createFindingsRepository(db).create(tenantId, visitId, {
      tooth_number: data.tooth_number,
      condition: data.condition,
      notes: data.notes,
    });
  },

  async updateFinding(
    db: D1Database,
    tenantId: string,
    visitId: string,
    findingId: string,
    data: FindingUpdateInput,
  ): Promise<ClinicalFinding> {
    const visit = await createVisitsRepository(db).getById(tenantId, visitId);
    if (!visit) throw new NotFoundError("Visit not found");
    return createFindingsRepository(db).update(tenantId, findingId, {
      condition: data.condition,
      notes: data.notes ?? null,
    });
  },
};