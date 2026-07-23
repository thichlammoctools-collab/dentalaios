import { describe, expect, it } from "vitest";
import patientImagesRoutes from "../../src/routes/patient-images";
import visitsRoutes from "../../src/routes/visits";
import { authedRequestWithDB, mountRoute } from "../helpers/api";

const imageRow = {
  id: "image-1", tenant_id: "test-tenant", patient_id: "patient-1", visit_id: "visit-1", uploaded_by: "test-user",
  image_type: "xray", description: null, file_id: "file-1", thumb_key: null, original_name: "xray.png", original_size: 100,
  uploader_name: "Doctor", created_at: "2026-01-01T10:00:00Z",
};

describe("image annotation routes", () => {
  it("rejects a rectangle outside the image bounds", async () => {
    const app = mountRoute("/api/patient-images", patientImagesRoutes);
    const response = await authedRequestWithDB(app, "POST", "/api/patient-images/image-1/annotations", new Map(), {
      permissions: ["write_findings"],
      body: { shape_type: "rectangle", geometry: { x: 0.9, y: 0.4, width: 0.2, height: 0.2 }, note: "Tổn thương" },
    });
    expect(response.status).toBe(400);
  });

  it("requires write_findings to create annotations", async () => {
    const app = mountRoute("/api/patient-images", patientImagesRoutes);
    const response = await authedRequestWithDB(app, "POST", "/api/patient-images/image-1/annotations", new Map(), {
      permissions: ["read_patients"],
      body: { shape_type: "pin", geometry: { x: 0.4, y: 0.5 }, note: "Tổn thương" },
    });
    expect(response.status).toBe(403);
  });

  it("rejects evidence when image patient differs from diagnosis", async () => {
    const app = mountRoute("/api/visits", visitsRoutes);
    const response = await authedRequestWithDB(app, "POST", "/api/visits/visit-1/diagnoses/diagnosis-1/image-evidence", new Map([
      ["FROM clinical_diagnoses", [{ id: "diagnosis-1", tenant_id: "test-tenant", visit_id: "visit-1", patient_id: "patient-1" }]],
      ["FROM patient_images pi", [{ ...imageRow, patient_id: "patient-2" }]],
    ]), {
      permissions: ["write_findings"],
      body: { patient_image_id: "image-1", relation: "supports" },
    });
    expect(response.status).toBe(422);
  });
});
