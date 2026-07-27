import { describe, expect, it } from "vitest";
import { treatmentServiceTemplateService } from "../../src/services/treatment-service-template.service";
import { createMockD1 } from "../helpers/mock-db";

const now = "2026-07-27T00:00:00.000Z";

function templateRow(overrides: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
  return {
    code: "RES-COMP-1S",
    name: "Trám composite xoang 1",
    procedure: "filling",
    default_price: 500000,
    market_price_low: 350000,
    market_price_median: 500000,
    market_price_high: 650000,
    market_price_currency: "VND",
    market_price_reference: null,
    market_price_updated_at: now,
    default_duration_min: 30,
    description: null,
    is_active: 1,
    sort_order: 100,
    created_by: null,
    updated_by: null,
    created_at: now,
    updated_at: now,
    ...overrides,
  };
}

const procedureRow = {
  code: "filling",
  name: "Trám răng",
  is_active: 1,
  sort_order: 100,
  created_at: now,
  updated_at: now,
};

function tenantServiceRow(overrides: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
  return {
    id: "svc-1",
    tenant_id: "tenant-A",
    code: "RES-COMP-1S",
    name: "Trám composite xoang 1",
    procedure: "filling",
    price: 600000,
    estimated_duration_min: 30,
    is_active: 1,
    created_at: now,
    updated_at: now,
    imported_from_template_code: null,
    imported_at: null,
    ...overrides,
  };
}

function baseImportItem(overrides: Partial<{ on_conflict: "skip" | "overwrite_metadata" | "overwrite_all"; price: number; name: string; procedure: string; estimated_duration_min: number }> = {}) {
  return {
    template_code: "RES-COMP-1S",
    code: "RES-COMP-1S",
    name: "Trám composite xoang 1",
    procedure: "filling",
    price: 500000,
    estimated_duration_min: 30,
    on_conflict: "skip" as const,
    ...overrides,
  };
}

describe("treatmentServiceTemplateService.importForTenant", () => {
  it("imports a template row into a tenant that does not yet have the code", async () => {
    const db = createMockD1({
      rowsByFragment: new Map<string, unknown[] | ((sql: string, callIndex: number) => unknown[])>([
        ["FROM platform_treatment_service_templates", [templateRow()]],
        ["FROM procedure_catalog", [procedureRow]],
        // Tenant-side reads: first "getByCode" returns nothing, then post-upsert returns the newly saved row.
        ["FROM treatment_services", ((_sql: string, callIndex: number) => (callIndex === 0 ? [] : [tenantServiceRow({ price: 500000 })])) as any],
      ]),
    });

    const result = await treatmentServiceTemplateService.importForTenant(
      db as never,
      "tenant-A",
      { items: [baseImportItem()] },
    );

    expect(result.imported).toBe(1);
    expect(result.updated).toBe(0);
    expect(result.skipped_conflict).toBe(0);
    expect(result.error).toBe(0);
    expect(result.items[0]?.outcome).toBe("imported");

    // Import origin stamped on the tenant row.
    const stamp = db.__sqlContaining("UPDATE treatment_services");
    expect(stamp.some((c) => c.sql.includes("imported_from_template_code"))).toBe(true);
  });

  it("skips when the tenant already has the code and on_conflict = skip", async () => {
    const db = createMockD1({
      rowsByFragment: new Map<string, unknown[] | ((sql: string, callIndex: number) => unknown[])>([
        ["FROM platform_treatment_service_templates", [templateRow()]],
        ["FROM procedure_catalog", [procedureRow]],
        ["FROM treatment_services", [tenantServiceRow({ price: 999999 })]],
      ]),
    });

    const result = await treatmentServiceTemplateService.importForTenant(
      db as never,
      "tenant-A",
      { items: [baseImportItem({ on_conflict: "skip" })] },
    );

    expect(result.skipped_conflict).toBe(1);
    expect(result.items[0]?.outcome).toBe("skipped_conflict");

    // No INSERT into treatment_services on skip path.
    const inserts = db.__sqlContaining("INSERT INTO treatment_services");
    expect(inserts).toHaveLength(0);
  });

  it("overwrites metadata but preserves tenant price when on_conflict = overwrite_metadata", async () => {
    let priceUsed: unknown;
    const db = createMockD1({
      rowsByFragment: new Map<string, unknown[] | ((sql: string, callIndex: number) => unknown[])>([
        ["FROM platform_treatment_service_templates", [templateRow()]],
        ["FROM procedure_catalog", [procedureRow]],
        ["FROM treatment_services", [tenantServiceRow({ price: 777000, name: "Old name" })]],
      ]),
    });

    const result = await treatmentServiceTemplateService.importForTenant(
      db as never,
      "tenant-A",
      { items: [baseImportItem({ on_conflict: "overwrite_metadata", price: 1234567 })] },
    );

    expect(result.updated).toBe(1);
    expect(result.items[0]?.outcome).toBe("updated");

    const upsertCall = db.__sqlContaining("INSERT INTO treatment_services").find((c) => c.sql.includes("ON CONFLICT"));
    // Bind order: id, tenant_id, code, name, procedure, price, estimated_duration_min, is_active
    priceUsed = upsertCall?.binds[5];
    expect(priceUsed).toBe(777000); // preserved from tenant, not from `price: 1234567` in payload
  });

  it("overwrites everything including the price when on_conflict = overwrite_all", async () => {
    const db = createMockD1({
      rowsByFragment: new Map<string, unknown[] | ((sql: string, callIndex: number) => unknown[])>([
        ["FROM platform_treatment_service_templates", [templateRow()]],
        ["FROM procedure_catalog", [procedureRow]],
        ["FROM treatment_services", [tenantServiceRow({ price: 777000 })]],
      ]),
    });

    const result = await treatmentServiceTemplateService.importForTenant(
      db as never,
      "tenant-A",
      { items: [baseImportItem({ on_conflict: "overwrite_all", price: 999999 })] },
    );

    expect(result.updated).toBe(1);
    const upsertCall = db.__sqlContaining("INSERT INTO treatment_services").find((c) => c.sql.includes("ON CONFLICT"));
    expect(upsertCall?.binds[5]).toBe(999999);
  });

  it("records per-row error when the referenced template does not exist", async () => {
    const db = createMockD1({
      rowsByFragment: new Map<string, unknown[] | ((sql: string, callIndex: number) => unknown[])>([
        ["FROM platform_treatment_service_templates", []],
        ["FROM procedure_catalog", [procedureRow]],
        ["FROM treatment_services", []],
      ]),
    });

    const result = await treatmentServiceTemplateService.importForTenant(
      db as never,
      "tenant-A",
      { items: [baseImportItem()] },
    );

    expect(result.error).toBe(1);
    expect(result.items[0]?.outcome).toBe("error");
  });

  it("uses the tenant id from the argument, not the template row", async () => {
    const db = createMockD1({
      rowsByFragment: new Map<string, unknown[] | ((sql: string, callIndex: number) => unknown[])>([
        ["FROM platform_treatment_service_templates", [templateRow()]],
        ["FROM procedure_catalog", [procedureRow]],
        ["FROM treatment_services", ((_sql: string, callIndex: number) => (callIndex === 0 ? [] : [tenantServiceRow({ tenant_id: "tenant-B" })])) as any],
      ]),
    });

    await treatmentServiceTemplateService.importForTenant(
      db as never,
      "tenant-B",
      { items: [baseImportItem()] },
    );

    const upsertCall = db.__sqlContaining("INSERT INTO treatment_services").find((c) => c.sql.includes("ON CONFLICT"));
    expect(upsertCall?.binds[1]).toBe("tenant-B");
  });
});
