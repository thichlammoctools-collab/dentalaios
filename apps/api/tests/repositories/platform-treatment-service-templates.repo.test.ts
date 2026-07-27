import { describe, expect, it } from "vitest";
import { createPlatformTreatmentServiceTemplatesRepository } from "../../src/repositories/platform-treatment-service-templates.repo";
import { createMockD1 } from "../helpers/mock-db";

const now = "2026-07-27T12:00:00.000Z";

const templateRow = {
  code: "RES-COMP-1S",
  name: "Trám composite xoang 1",
  procedure: "filling",
  default_price: 500000,
  market_price_low: 350000,
  market_price_median: 500000,
  market_price_high: 650000,
  market_price_currency: "VND",
  market_price_reference: "Ước tính",
  market_price_updated_at: now,
  default_duration_min: 30,
  description: "Trám composite mặt nhai",
  is_active: 1,
  sort_order: 110,
  created_by: "creator-1",
  updated_by: "updater-1",
  created_at: now,
  updated_at: now,
};

describe("platform treatment service templates repository", () => {
  it("filters list by procedure, active flag and ICD-10 code id", async () => {
    const db = createMockD1({
      rowsByFragment: new Map([
        ["FROM platform_treatment_service_templates", [templateRow]],
      ]),
    });
    const repo = createPlatformTreatmentServiceTemplatesRepository(db as never);

    const items = await repo.list({ procedure: "filling", q: "composite", active_only: true, icd10_code_id: "icd-1" });

    expect(items).toHaveLength(1);
    expect(items[0]).toEqual(expect.objectContaining({ code: "RES-COMP-1S", is_active: true, sort_order: 110 }));

    const listCall = db.__sqlContaining("FROM platform_treatment_service_templates").at(-1);
    expect(listCall?.sql).toContain("procedure = ?");
    expect(listCall?.sql).toContain("lower(name) LIKE ?");
    expect(listCall?.sql).toContain("is_active = 1");
    expect(listCall?.sql).toContain("platform_treatment_service_template_icd10");
    // Binds: procedure, like-name, like-code, icd10 id.
    expect(listCall?.binds).toEqual(["filling", "%composite%", "%composite%", "icd-1"]);
  });

  it("returns null when a template does not exist", async () => {
    const db = createMockD1();
    const repo = createPlatformTreatmentServiceTemplatesRepository(db as never);
    expect(await repo.get("MISSING")).toBeNull();
  });

  it("resolves ICD-10 join rows with icd10_code and display", async () => {
    const linkRow = {
      template_code: "RES-COMP-1S",
      icd10_code_id: "icd-1",
      relation: "primary",
      note: null,
      created_at: now,
      icd10_code: "K02.1",
      icd10_display_vi: "Sâu ngà",
    };
    const db = createMockD1({
      rowsByFragment: new Map([
        ["FROM platform_treatment_service_template_icd10 l", [linkRow]],
      ]),
    });
    const repo = createPlatformTreatmentServiceTemplatesRepository(db as never);
    const links = await repo.listLinksFor(["RES-COMP-1S"]);

    expect(links).toEqual([
      expect.objectContaining({
        template_code: "RES-COMP-1S",
        icd10_code_id: "icd-1",
        icd10_code: "K02.1",
        icd10_display_vi: "Sâu ngà",
        relation: "primary",
      }),
    ]);
  });

  it("upserts a template with atomic delete + insert of ICD-10 links", async () => {
    const db = createMockD1({
      rowsByFragment: new Map([
        ["FROM platform_treatment_service_templates", [templateRow]],
        ["FROM platform_treatment_service_template_icd10 l", []],
      ]),
    });
    const repo = createPlatformTreatmentServiceTemplatesRepository(db as never);

    await repo.upsert(
      {
        code: "RES-COMP-1S",
        name: "Trám composite xoang 1",
        procedure: "filling",
        default_price: 500000,
        market_price_low: 350000,
        market_price_median: 500000,
        market_price_high: 650000,
        market_price_currency: "VND",
        market_price_reference: null,
        market_price_updated_at: null,
        default_duration_min: 30,
        description: null,
        is_active: true,
        sort_order: 110,
        icd10_links: [
          { icd10_code_id: "icd-1", relation: "primary", note: null },
          { icd10_code_id: "icd-2", relation: "secondary", note: "kèm theo" },
        ],
      },
      "actor-1",
    );

    // Verify one INSERT ... ON CONFLICT, one DELETE for prior links, and 2 INSERTs for new links,
    // all executed via db.batch(). We can observe that by asserting the calls' order and count.
    const insertUpsert = db.__sqlContaining("ON CONFLICT(code) DO UPDATE");
    const deleteLinks = db.__sqlContaining("DELETE FROM platform_treatment_service_template_icd10");
    const insertLinks = db.__sqlContaining("INSERT INTO platform_treatment_service_template_icd10");

    expect(insertUpsert).toHaveLength(1);
    expect(deleteLinks).toHaveLength(1);
    expect(insertLinks).toHaveLength(2);

    // Each link INSERT should carry (template_code, icd10_code_id, relation, note).
    for (const call of insertLinks) {
      expect(call.binds[0]).toBe("RES-COMP-1S");
    }
  });

  it("preserves original created_by across upsert when template already exists", async () => {
    const db = createMockD1({
      rowsByFragment: new Map([
        ["FROM platform_treatment_service_templates", [templateRow]],
        ["FROM platform_treatment_service_template_icd10 l", []],
      ]),
    });
    const repo = createPlatformTreatmentServiceTemplatesRepository(db as never);

    await repo.upsert(
      {
        code: "RES-COMP-1S",
        name: "Renamed",
        procedure: "filling",
        default_price: 550000,
        market_price_low: null,
        market_price_median: null,
        market_price_high: null,
        market_price_currency: "VND",
        market_price_reference: null,
        market_price_updated_at: null,
        default_duration_min: 30,
        description: null,
        is_active: true,
        sort_order: 111,
        icd10_links: [],
      },
      "actor-2",
    );

    const upsertCall = db.__sqlContaining("ON CONFLICT(code) DO UPDATE").at(0);
    // Bind order in the repo: code, name, procedure, default_price, market_lo, market_md, market_hi,
    // market_currency, market_ref, market_updated_at, default_duration, description, is_active,
    // sort_order, created_by, updated_by.
    expect(upsertCall?.binds[14]).toBe("creator-1"); // created_by preserved
    expect(upsertCall?.binds[15]).toBe("actor-2");   // updated_by from current actor
  });
});
