import { describe, expect, it } from "vitest";
import terminologyRoutes from "../../src/routes/clinical-terminology";
import { authedRequestWithDB, mountRoute } from "../helpers/api";

describe("GET /api/clinical-terminology/icd10", () => {
  it("returns approved ICD-10 codes without an ambiguous id column", async () => {
    const app = mountRoute("/api/clinical-terminology", terminologyRoutes);
    const res = await authedRequestWithDB(app, "GET", "/api/clinical-terminology/icd10?q=K02", new Map([
      ["FROM icd10_codes i JOIN clinical_terminology_versions", [{
        id: "icd-k02-9", terminology_version_id: "icd-vn-1", code: "K02.9",
        display_vi: "Sâu răng, không xác định", parent_code: "K02", is_billable: 1,
        is_active: 1, sort_order: 1, created_at: "2026-01-01",
      }]],
    ]), { permissions: ["read_patients"] });

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ items: [{ id: "icd-k02-9", code: "K02.9" }] });
  });
});
