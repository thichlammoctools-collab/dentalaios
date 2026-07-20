import { describe, expect, it } from "vitest";
import { createTreatmentItemsRepository } from "../../src/repositories/treatment-items.repo";
import { createMockD1 } from "../helpers/mock-db";

describe("treatment items repository", () => {
  it("persists the immutable service and VAT price snapshot", async () => {
    const itemRow = {
      id: "item-1",
      tenant_id: "tenant-1",
      treatment_plan_id: "plan-1",
      tooth_number: 11,
      snapshot_service_code: "TRAM-COM",
      snapshot_service_name: "Trám composite",
      procedure: "filling",
      description: "Trám răng",
      unit_cost: 650000,
      snapshot_price_includes_vat: 1,
      snapshot_price_snapshot_at: "2026-07-20T08:00:00.000Z",
      status: "planned",
      created_at: "2026-07-20T08:00:00.000Z",
    };
    const db = createMockD1({
      rowsByFragment: new Map([["FROM treatment_plan_items", [itemRow]]]),
    });

    const item = await createTreatmentItemsRepository(db as any).create("tenant-1", "plan-1", {
      tooth_number: 11,
      service_code: "TRAM-COM",
      service_name: "Trám composite",
      procedure: "filling",
      description: "Trám răng",
      unit_cost: 650000,
      price_includes_vat: true,
      price_snapshot_at: undefined,
    });

    const insert = db.__calls.find((call) => call.method === "run" && call.sql.startsWith("INSERT INTO treatment_plan_items"));
    const snapshotInsert = db.__calls.find((call) => call.method === "run" && call.sql.startsWith("INSERT INTO treatment_plan_item_price_snapshots"));
    expect(insert?.binds.slice(4)).toEqual(["filling", "Trám răng", 650000, null, null]);
    expect(snapshotInsert?.binds.slice(2)).toEqual(["TRAM-COM", "Trám composite", 1]);
    expect(item).toMatchObject({
      service_code: "TRAM-COM",
      service_name: "Trám composite",
      price_includes_vat: true,
      price_snapshot_at: "2026-07-20T08:00:00.000Z",
    });
  });
});
