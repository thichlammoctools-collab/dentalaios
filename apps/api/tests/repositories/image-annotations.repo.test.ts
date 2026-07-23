import { describe, expect, it } from "vitest";
import { createImageAnnotationsRepository } from "../../src/repositories/image-annotations.repo";
import { createMockD1 } from "../helpers/mock-db";

describe("image annotations repository", () => {
  it("builds valid SELECT lists for annotation and evidence reads", async () => {
    const db = createMockD1();
    const repository = createImageAnnotationsRepository(db as never);

    await repository.listByImage("tenant-1", "image-1");
    await repository.listEvidenceByDiagnosis("tenant-1", "diagnosis-1");
    await repository.listEvidenceByImage("tenant-1", "image-1");

    for (const call of db.__calls) {
      expect(call.sql).not.toMatch(/,\s*SELECT\s+/i);
    }
  });
});
