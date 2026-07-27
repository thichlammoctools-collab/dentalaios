import { describe, expect, it } from "vitest";
import clinicRoutes from "../../src/routes/clinic";
import { authedRequestWithDB, mountRoute } from "../helpers/api";

const templateRow = {
  code: "RES-COMP-1S",
  name: "Trám composite xoang 1",
  procedure: "filling",
  default_price: 500000,
  market_price_low: 350000,
  market_price_median: 500000,
  market_price_high: 650000,
  market_price_currency: "VND",
  market_price_reference: "khảo sát 2026",
  market_price_updated_at: "2026-01-01T00:00:00.000Z",
  default_duration_min: 30,
  description: "Trám composite một mặt",
  is_active: 1,
  sort_order: 110,
  created_by: null,
  updated_by: null,
  created_at: "2026-07-01T00:00:00.000Z",
  updated_at: "2026-07-01T00:00:00.000Z",
};

const procedureRow = {
  code: "filling",
  name: "Trám răng",
  is_active: 1,
  sort_order: 10,
  created_at: "2026-07-01T00:00:00.000Z",
  updated_at: "2026-07-01T00:00:00.000Z",
};

describe("clinic treatment service templates", () => {
  it("requires admin permission to list templates", async () => {
    const app = mountRoute("/api/clinic", clinicRoutes);
    const res = await authedRequestWithDB(
      app,
      "GET",
      "/api/clinic/treatment-service-templates",
      new Map(),
      { permissions: ["read_patients"] },
    );

    expect(res.status).toBe(403);
  });

  it("lists templates with the already_imported flag scoped to the calling tenant", async () => {
    const app = mountRoute("/api/clinic", clinicRoutes);
    const res = await authedRequestWithDB(
      app,
      "GET",
      "/api/clinic/treatment-service-templates",
      new Map([
        ["FROM platform_treatment_service_templates", [templateRow]],
        [
          "FROM treatment_services WHERE tenant_id = ?",
          [
            {
              id: "svc-1",
              tenant_id: "test-tenant",
              code: "RES-COMP-1S",
              name: "Trám composite xoang 1",
              procedure: "filling",
              price: 500000,
              estimated_duration_min: 30,
              is_active: 1,
              imported_from_template_code: "RES-COMP-1S",
              imported_at: "2026-07-01T00:00:00.000Z",
              created_at: "2026-07-01T00:00:00.000Z",
              updated_at: "2026-07-01T00:00:00.000Z",
            },
          ],
        ],
        ["FROM platform_treatment_service_template_icd10 l", []],
      ]),
      { permissions: ["manage_users"] },
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      items: Array<{ code: string; already_imported: boolean }>;
    };
    expect(body.items).toHaveLength(1);
    expect(body.items[0]).toMatchObject({
      code: "RES-COMP-1S",
      already_imported: true,
    });
  });

  it("rejects import requests without admin permission", async () => {
    const app = mountRoute("/api/clinic", clinicRoutes);
    const res = await authedRequestWithDB(
      app,
      "POST",
      "/api/clinic/treatment-services/import",
      new Map(),
      {
        permissions: ["read_patients"],
        body: {
          items: [
            {
              template_code: "RES-COMP-1S",
              code: "RES-COMP-1S",
              name: "Trám composite xoang 1",
              procedure: "filling",
              price: 500000,
              estimated_duration_min: 30,
              on_conflict: "skip",
            },
          ],
        },
      },
    );

    expect(res.status).toBe(403);
  });

  it("returns per-item outcomes when the tenant already has a service with the same code", async () => {
    const app = mountRoute("/api/clinic", clinicRoutes);
    const res = await authedRequestWithDB(
      app,
      "POST",
      "/api/clinic/treatment-services/import",
      new Map([
        ["FROM platform_treatment_service_templates", [templateRow]],
        ["FROM procedure_catalog WHERE code = ?", [procedureRow]],
        [
          "FROM treatment_services WHERE tenant_id = ? AND code = ?",
          [
            {
              id: "existing",
              tenant_id: "test-tenant",
              code: "RES-COMP-1S",
              name: "Trám cũ",
              procedure: "filling",
              price: 900000,
              estimated_duration_min: 45,
              is_active: 1,
              created_at: "2026-06-01T00:00:00.000Z",
              updated_at: "2026-06-01T00:00:00.000Z",
            },
          ],
        ],
      ]),
      {
        permissions: ["manage_users"],
        body: {
          items: [
            {
              template_code: "RES-COMP-1S",
              code: "RES-COMP-1S",
              name: "Trám composite xoang 1",
              procedure: "filling",
              price: 500000,
              estimated_duration_min: 30,
              on_conflict: "skip",
            },
          ],
        },
      },
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      imported: number;
      skipped_conflict: number;
      items: Array<{ outcome: string; code: string }>;
    };
    expect(body.skipped_conflict).toBe(1);
    expect(body.imported).toBe(0);
    expect(body.items).toEqual([
      expect.objectContaining({ code: "RES-COMP-1S", outcome: "skipped_conflict" }),
    ]);
  });

  it("rejects empty import batches with 400", async () => {
    const app = mountRoute("/api/clinic", clinicRoutes);
    const res = await authedRequestWithDB(
      app,
      "POST",
      "/api/clinic/treatment-services/import",
      new Map(),
      {
        permissions: ["manage_users"],
        body: { items: [] },
      },
    );
    expect(res.status).toBe(400);
  });
});
