import { describe, expect, it } from "vitest";
import clinicRoutes from "../../src/routes/clinic";
import { authedRequestWithDB, mountRoute } from "../helpers/api";

const serviceRow = {
  id: "service-1",
  tenant_id: "test-tenant",
  code: "TRAM-COM",
  name: "Trám composite",
  procedure: "filling",
  price: 650000,
  estimated_duration_min: 45,
  is_active: 1,
  created_at: "2026-07-20T00:00:00.000Z",
  updated_at: "2026-07-20T00:00:00.000Z",
};

describe("clinic treatment services", () => {
  it("lists the current tenant's VAT-inclusive catalog", async () => {
    const app = mountRoute("/api/clinic", clinicRoutes);
    const res = await authedRequestWithDB(
      app,
      "GET",
      "/api/clinic/treatment-services",
      new Map([["FROM treatment_services", [serviceRow]]]),
      { permissions: ["read_patients"] },
    );

    expect(res.status).toBe(200);
    const body = await res.json() as { prices_include_vat: boolean; items: Array<{ code: string; price: number; estimated_duration_min: number }> };
    expect(body.prices_include_vat).toBe(true);
    expect(body.items).toEqual([expect.objectContaining({ code: "TRAM-COM", price: 650000, estimated_duration_min: 45 })]);
  });

  it("requires management permission to save a service", async () => {
    const app = mountRoute("/api/clinic", clinicRoutes);
    const res = await authedRequestWithDB(
      app,
      "PUT",
      "/api/clinic/treatment-services",
      new Map(),
      { permissions: ["read_patients"], body: { code: "TRAM-COM", name: "Trám composite", procedure: "filling", price: 650000, estimated_duration_min: 30 } },
    );

    expect(res.status).toBe(403);
  });

  it.each([0, 30.5, 481])("rejects invalid estimated duration %s", async (estimated_duration_min) => {
    const app = mountRoute("/api/clinic", clinicRoutes);
    const res = await authedRequestWithDB(
      app,
      "PUT",
      "/api/clinic/treatment-services",
      new Map(),
      { permissions: ["manage_users"], body: { code: "TRAM-COM", name: "Trám composite", procedure: "filling", price: 650000, estimated_duration_min } },
    );

    expect(res.status).toBe(400);
  });

  it("deactivates a service that is already referenced by a treatment plan", async () => {
    const app = mountRoute("/api/clinic", clinicRoutes);
    const res = await authedRequestWithDB(
      app,
      "DELETE",
      "/api/clinic/treatment-services/TRAM-COM",
      new Map([["FROM treatment_plan_items", [{ id: "item-1" }]]]),
      { permissions: ["manage_users"] },
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ mode: "deactivated" });
  });

  it("hard deletes a service that has never been used", async () => {
    const app = mountRoute("/api/clinic", clinicRoutes);
    const res = await authedRequestWithDB(
      app,
      "DELETE",
      "/api/clinic/treatment-services/TRAM-COM",
      new Map(),
      { permissions: ["manage_users"] },
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ mode: "deleted" });
  });
});
