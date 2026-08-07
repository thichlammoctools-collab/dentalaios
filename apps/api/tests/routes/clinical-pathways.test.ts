import { describe, expect, it } from "vitest";
import clinicalPathwayRoutes from "../../src/routes/clinical-pathways";
import visitsRoutes from "../../src/routes/visits";
import { authedRequestWithDB, mountRoute } from "../helpers/api";

const visitRow = (overrides: Record<string, unknown> = {}) => ({
  id: "visit-1",
  tenant_id: "test-tenant",
  patient_id: "patient-1",
  branch_id: "test-branch",
  clinician_id: "test-user",
  date: "2026-01-01T10:00:00Z",
  status: "in_progress",
  clinical_state: "in_progress",
  locked_at: null,
  ...overrides,
});

const flagRow = {
  enabled: 1,
};

describe("GET /api/visits/:visitId/clinical-pathways/endodontic-pain", () => {
  it("returns 404 when feature flag is disabled", async () => {
    const app = mountRoute("/api/visits", clinicalPathwayRoutes);
    const res = await authedRequestWithDB(app, "GET", "/api/visits/visit-1/clinical-pathways/endodontic-pain", new Map([
      ["FROM visits", [visitRow()]],
      ["FROM platform_feature_flags", []], // no flags enabled
    ]));
    expect(res.status).toBe(404);
    expect((await res.json()) as { code: string }).toMatchObject({ code: "not_found" });
  });

  it("returns assessments when feature flag is enabled", async () => {
    const app = mountRoute("/api/visits", clinicalPathwayRoutes);
    const res = await authedRequestWithDB(app, "GET", "/api/visits/visit-1/clinical-pathways/endodontic-pain", new Map([
      ["FROM visits", [visitRow()]],
      ["FROM platform_feature_flags", [flagRow]],
      ["FROM clinical_pathway_assessments", [{ id: "assessment-1", tenant_id: "test-tenant", visit_id: "visit-1", tooth_number: 36, pathway_key: "endodontic_pain", pathway_version: "v1", status: "active", assessment_json: "{}", entry_source: "doctor", entered_by: "test-user", current_revision: 0, created_at: "2026-01-01", updated_at: "2026-01-01" }]],
      ["FROM clinical_pathway_assessment_items", []],
    ]));
    expect(res.status, await res.clone().text()).toBe(200);
    const body = await res.json() as { feature_enabled: boolean; assessments: unknown[] };
    expect(body.feature_enabled).toBe(true);
    expect(body.assessments).toHaveLength(1);
  });
});

describe("POST sign-off blocker", () => {
  it("prevents sign-off if pathway is active", async () => {
    const app = mountRoute("/api/visits", visitsRoutes);
    const res = await authedRequestWithDB(app, "POST", "/api/visits/visit-1/sign", new Map([
      ["FROM visits", [visitRow()]],
      ["FROM platform_feature_flags", [flagRow]],
      ["FROM clinical_pathway_assessments", [{ id: "assessment-1", tenant_id: "test-tenant", visit_id: "visit-1", tooth_number: 36, pathway_key: "endodontic_pain", pathway_version: "v1", status: "active", assessment_json: "{}", entry_source: "doctor", entered_by: "test-user", current_revision: 0, created_at: "2026-01-01", updated_at: "2026-01-01" }]],
      ["FROM clinical_pathway_assessment_items", []],
      ["FROM clinical_review_events", []],
      ["FROM visit_initial_assessments", [{ id: "ia-1" }]],
    ]), { permissions: ["sign_clinical_records"] });
    expect(res.status, await res.clone().text()).toBe(422);
    const body = await res.json() as { error: string };
    expect(body.error).toContain("Còn pathway assessment đang đánh giá chưa đóng");
  });
});
