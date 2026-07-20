import { describe, expect, it } from "vitest";
import { ValidationError } from "../../src/lib/errors";
import { aiModelConfigService } from "../../src/services/ai-model-config.service";
import { createMockD1 } from "../helpers/mock-db";

describe("aiModelConfigService", () => {
  it("uses the catalog default when no override exists", async () => {
    const config = await aiModelConfigService.resolve(
      createMockD1() as never,
      "visit_summary",
    );

    expect(config).toEqual({
      model_id: "@cf/meta/llama-4-scout-17b-16e-instruct",
      is_enabled: true,
    });
  });

  it("rejects a model that is incompatible with the selected use case", async () => {
    await expect(
      aiModelConfigService.update(
        createMockD1() as never,
        {
          application_key: "clinic_web",
          use_case: "clinical_image_analysis",
          model_id: "@cf/meta/llama-4-scout-17b-16e-instruct",
          is_enabled: true,
        },
        "platform-owner",
      ),
    ).rejects.toBeInstanceOf(ValidationError);
  });
});
