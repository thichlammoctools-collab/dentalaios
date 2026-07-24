import { describe, expect, it } from "vitest";
import referrersRoutes from "../../src/routes/referrers";
import { authedRequest, authedRequestWithDB, mountRoute } from "../helpers/api";

const referrerRow = (overrides: Record<string, unknown> = {}) => ({
  id: "referrer-1",
  tenant_id: "test-tenant",
  type: "partner",
  code: "RF-QR-001",
  name: "Nguyen Van A",
  email: "referrer@example.com",
  phone: null,
  linked_patient_id: null,
  linked_user_id: null,
  status: "active",
  created_by: "test-user",
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
  ...overrides,
});

describe("GET /api/referrers/lookup-id/:id", () => {
  it("resolves an active referrer for QR selection", async () => {
    const app = mountRoute("/api/referrers", referrersRoutes);
    const res = await authedRequestWithDB(
      app,
      "GET",
      "/api/referrers/lookup-id/referrer-1",
      new Map([["SELECT * FROM referrers WHERE tenant_id = ? AND id = ?", [referrerRow()]]]),
      { permissions: ["write_patients"] },
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      id: "referrer-1",
      code: "RF-QR-001",
      name: "Nguyen Van A",
      type: "partner",
    });
  });

  it("does not resolve an inactive referrer", async () => {
    const app = mountRoute("/api/referrers", referrersRoutes);
    const res = await authedRequestWithDB(
      app,
      "GET",
      "/api/referrers/lookup-id/referrer-1",
      new Map([["SELECT * FROM referrers WHERE tenant_id = ? AND id = ?", [referrerRow({ status: "inactive" })]]]),
      { permissions: ["write_patients"] },
    );

    expect(res.status).toBe(404);
  });

  it("requires patient-write permission", async () => {
    const app = mountRoute("/api/referrers", referrersRoutes);
    const res = await authedRequest(app, "GET", "/api/referrers/lookup-id/referrer-1", { permissions: ["read_patients"] });
    expect(res.status).toBe(403);
  });
});
