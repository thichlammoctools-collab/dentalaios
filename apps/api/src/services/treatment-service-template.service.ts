import type { D1Database } from "@cloudflare/workers-types";
import type {
  PlatformTreatmentServiceTemplate,
  PlatformTreatmentServiceTemplateWithLinks,
  TenantTreatmentServiceTemplate,
  TreatmentServiceImportResult,
  TreatmentServiceImportResultItem,
} from "@shared/types";
import type {
  PlatformTreatmentServiceTemplateUpsertInput,
  TreatmentServiceImportInput,
} from "@shared/validation";
import { NotFoundError, ValidationError } from "../lib/errors";
import { createPlatformTreatmentServiceTemplatesRepository } from "../repositories/platform-treatment-service-templates.repo";
import { createProcedureCatalogRepository } from "../repositories/procedure-catalog.repo";
import { createTreatmentServicesRepository } from "../repositories/treatment-service-prices.repo";

/**
 * Business rules for platform treatment service templates and tenant import.
 *
 * - Templates live at the platform level (no tenant_id). Every mutation goes
 *   through the platform routes with recent-MFA middleware.
 * - Tenants call `importForTenant()` after choosing rows and optionally
 *   overriding fields in the preview step. Each row includes an explicit
 *   `on_conflict` decision so imports are deterministic and auditable.
 * - Historical `treatment_services` rows in a tenant keep working exactly
 *   as before; import only writes `imported_from_template_code`/`imported_at`
 *   on the rows the tenant actually chose.
 */
export const treatmentServiceTemplateService = {
  async listForPlatform(
    db: D1Database,
    filter: { procedure?: string; q?: string; is_active?: boolean; icd10_code_id?: string },
  ): Promise<PlatformTreatmentServiceTemplateWithLinks[]> {
    const repo = createPlatformTreatmentServiceTemplatesRepository(db);
    const templates = await repo.list({
      procedure: filter.procedure,
      q: filter.q,
      icd10_code_id: filter.icd10_code_id,
      active_only: filter.is_active === true ? true : undefined,
    });
    if (templates.length === 0) return [];
    const links = await repo.listLinksFor(templates.map((template) => template.code));
    const linksByCode = groupLinksByTemplate(links);
    return templates.map((template) => ({
      ...template,
      icd10_links: linksByCode.get(template.code) ?? [],
    }));
  },

  async getForPlatform(db: D1Database, code: string): Promise<PlatformTreatmentServiceTemplateWithLinks> {
    const repo = createPlatformTreatmentServiceTemplatesRepository(db);
    const template = await repo.get(code);
    if (!template) throw new NotFoundError("Không tìm thấy mẫu dịch vụ");
    const links = await repo.listLinksFor([code]);
    return { ...template, icd10_links: links };
  },

  async upsertPlatform(
    db: D1Database,
    actorId: string,
    data: PlatformTreatmentServiceTemplateUpsertInput,
  ): Promise<PlatformTreatmentServiceTemplateWithLinks> {
    // Reference validation: procedure must exist in the platform catalog, and
    // every ICD-10 id must resolve to a real code entry. The DB has FK, but
    // returning a friendly Vietnamese message is much better than surfacing
    // raw SQL constraint errors to the UI.
    const procedure = await createProcedureCatalogRepository(db).get(data.procedure);
    if (!procedure) throw new ValidationError("Thủ thuật không tồn tại trong danh mục platform");

    if (data.icd10_links && data.icd10_links.length > 0) {
      const ids = data.icd10_links.map((link) => link.icd10_code_id);
      const placeholders = ids.map(() => "?").join(", ");
      const rows = await db.prepare(`SELECT id FROM icd10_codes WHERE id IN (${placeholders})`).bind(...ids).all<{ id: string }>();
      const existing = new Set(rows.results.map((row) => row.id));
      const missing = ids.filter((id) => !existing.has(id));
      if (missing.length > 0) throw new ValidationError(`ICD-10 không tồn tại: ${missing.join(", ")}`);
    }

    // Range coherence: low <= median <= high nếu cả 3 đều có.
    const { market_price_low, market_price_median, market_price_high } = data;
    if (market_price_low != null && market_price_median != null && market_price_low > market_price_median) {
      throw new ValidationError("Giá thị trường thấp phải ≤ giá trung vị");
    }
    if (market_price_median != null && market_price_high != null && market_price_median > market_price_high) {
      throw new ValidationError("Giá trung vị phải ≤ giá cao");
    }
    if (market_price_low != null && market_price_high != null && market_price_low > market_price_high) {
      throw new ValidationError("Giá thị trường thấp phải ≤ giá cao");
    }

    return createPlatformTreatmentServiceTemplatesRepository(db).upsert(
      {
        code: data.code,
        name: data.name,
        procedure: data.procedure,
        default_price: data.default_price,
        market_price_low: data.market_price_low ?? null,
        market_price_median: data.market_price_median ?? null,
        market_price_high: data.market_price_high ?? null,
        market_price_currency: data.market_price_currency,
        market_price_reference: data.market_price_reference ?? null,
        market_price_updated_at: data.market_price_updated_at ?? null,
        default_duration_min: data.default_duration_min,
        description: data.description ?? null,
        is_active: data.is_active,
        sort_order: data.sort_order,
        icd10_links: data.icd10_links.map((link) => ({
          icd10_code_id: link.icd10_code_id,
          relation: link.relation,
          note: link.note ?? null,
        })),
      },
      actorId,
    );
  },

  async setActive(
    db: D1Database,
    actorId: string,
    code: string,
    isActive: boolean,
  ): Promise<PlatformTreatmentServiceTemplate> {
    const repo = createPlatformTreatmentServiceTemplatesRepository(db);
    const ok = await repo.setActive(code, isActive, actorId);
    if (!ok) throw new NotFoundError("Không tìm thấy mẫu dịch vụ");
    const item = await repo.get(code);
    if (!item) throw new NotFoundError("Không tìm thấy mẫu dịch vụ");
    return item;
  },

  async listForTenant(
    db: D1Database,
    tenantId: string,
    filter: { procedure?: string; q?: string; icd10_code_id?: string },
  ): Promise<TenantTreatmentServiceTemplate[]> {
    const repo = createPlatformTreatmentServiceTemplatesRepository(db);
    const [templates, tenantServices] = await Promise.all([
      repo.list({ ...filter, active_only: true }),
      createTreatmentServicesRepository(db).list(tenantId),
    ]);
    if (templates.length === 0) return [];
    const links = await repo.listLinksFor(templates.map((template) => template.code));
    const linksByCode = groupLinksByTemplate(links);
    const tenantCodes = new Set(tenantServices.map((service) => service.code));
    return templates.map((template) => ({
      ...template,
      icd10_links: linksByCode.get(template.code) ?? [],
      already_imported: tenantCodes.has(template.code),
    }));
  },

  /**
   * Import a batch of chosen templates into the tenant's `treatment_services`.
   * Never fails the whole batch — collects per-item outcomes so the UI can
   * summarise `imported / updated / skipped / error` accurately.
   */
  async importForTenant(
    db: D1Database,
    tenantId: string,
    data: TreatmentServiceImportInput,
  ): Promise<TreatmentServiceImportResult> {
    const templateRepo = createPlatformTreatmentServiceTemplatesRepository(db);
    const servicesRepo = createTreatmentServicesRepository(db);
    const procedureRepo = createProcedureCatalogRepository(db);

    const items: TreatmentServiceImportResultItem[] = [];
    let imported = 0;
    let updated = 0;
    let skipped = 0;
    let error = 0;

    for (const row of data.items) {
      const record: TreatmentServiceImportResultItem = {
        template_code: row.template_code,
        code: row.code,
        outcome: "error",
      };

      try {
        const template = await templateRepo.get(row.template_code);
        if (!template) throw new ValidationError("Mẫu không tồn tại");
        if (!template.is_active) throw new ValidationError("Mẫu đã ngừng áp dụng");

        const procedure = await procedureRepo.get(row.procedure);
        if (!procedure) throw new ValidationError("Thủ thuật không tồn tại");

        const existing = await servicesRepo.getByCode(tenantId, row.code);
        const now = new Date().toISOString();

        if (!existing) {
          await servicesRepo.upsert(tenantId, {
            code: row.code,
            name: row.name.trim(),
            procedure: row.procedure,
            price: row.price,
            estimated_duration_min: row.estimated_duration_min,
            is_active: true,
          });
          await stampImportOrigin(db, tenantId, row.code, row.template_code, now);
          record.outcome = "imported";
          imported++;
        } else if (row.on_conflict === "skip") {
          record.outcome = "skipped_conflict";
          record.message = "Đã có dịch vụ cùng mã, bỏ qua";
          skipped++;
        } else if (row.on_conflict === "overwrite_metadata") {
          // Preserve tenant's price; overwrite name/procedure/duration/active.
          await servicesRepo.upsert(tenantId, {
            code: row.code,
            name: row.name.trim(),
            procedure: row.procedure,
            price: existing.price,
            estimated_duration_min: row.estimated_duration_min,
            is_active: true,
          });
          await stampImportOrigin(db, tenantId, row.code, row.template_code, now);
          record.outcome = "updated";
          record.message = "Cập nhật metadata, giữ nguyên giá";
          updated++;
        } else {
          // overwrite_all
          await servicesRepo.upsert(tenantId, {
            code: row.code,
            name: row.name.trim(),
            procedure: row.procedure,
            price: row.price,
            estimated_duration_min: row.estimated_duration_min,
            is_active: true,
          });
          await stampImportOrigin(db, tenantId, row.code, row.template_code, now);
          record.outcome = "updated";
          record.message = "Ghi đè toàn bộ";
          updated++;
        }
      } catch (cause) {
        record.outcome = "error";
        record.message = cause instanceof Error ? cause.message : "Không thể nhập";
        error++;
      }

      items.push(record);
    }

    return { imported, updated, skipped_conflict: skipped, error, items };
  },
};

async function stampImportOrigin(
  db: D1Database,
  tenantId: string,
  code: string,
  templateCode: string,
  importedAt: string,
): Promise<void> {
  await db
    .prepare(
      "UPDATE treatment_services SET imported_from_template_code = ?, imported_at = ? WHERE tenant_id = ? AND code = ?",
    )
    .bind(templateCode, importedAt, tenantId, code)
    .run();
}

function groupLinksByTemplate(
  links: PlatformTreatmentServiceTemplateWithLinks["icd10_links"],
): Map<string, PlatformTreatmentServiceTemplateWithLinks["icd10_links"]> {
  const map = new Map<string, PlatformTreatmentServiceTemplateWithLinks["icd10_links"]>();
  for (const link of links) {
    const list = map.get(link.template_code);
    if (list) list.push(link);
    else map.set(link.template_code, [link]);
  }
  return map;
}
